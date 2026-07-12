// czib-sync — EASA Conflict Zone Information Bulletin senkronizasyonu
//
// EASA CZIB listesini resmi CSV export'undan ceker, Aktif olanlari ayiklar,
// "Affected Airspace" metnindeki FIR ICAO kodlarini cikarir ve czib_zones'a yazar.
//
// TEK KAYNAK: EASA'nin kendi yayini. Ham metin (affected_airspace, recommendation)
// oldugu gibi saklanir — pilot/denetci orijinali gorebilsin.
//
// FIR ayiklama KORU KORUNE yapilmaz: EASA tutarli sekilde "Tehran FIR - OIIX" veya
// "FIR Niamey (DRRR)" yazar. Kod bu iki kalibi arar. Yakalanamayan olursa ham metin
// yine tabloda durur ve admin panelinden dogrulanir (verified alani).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CZIB_CSV = "https://www.easa.europa.eu/en/domains/air-operations/czibs/export?page&_format=csv";

// ---------- CSV parse (RFC 4180: tirnak icinde virgul ve yeni satir olabilir) ----------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }   // kacisli tirnak
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') { inQuotes = true; }
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* yoksay */ }
    else { field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ---------- FIR ICAO ayiklama ----------
// Kaliplar: "Tehran FIR - OIIX" | "FIR Niamey (DRRR)" | "FIR MOSCOW (UUWV)" | "(FIR OAKX)"
// Parantez icindeki ya da FIR kelimesine komsu 4 buyuk harfli kodlari alir.
function extractFirs(airspace: string): string[] {
  if (!airspace) return [];
  const found = new Set<string>();

  // 1) Parantez icindeki 4 harfli kodlar: (DRRR), (FIR OAKX), (Tehran FIR - OIIX)
  const paren = airspace.matchAll(/\(([^)]*)\)/g);
  for (const m of paren) {
    const inner = m[1];
    for (const code of inner.matchAll(/\b([A-Z]{4})\b/g)) {
      if (code[1] !== "FIR" && code[1] !== "UIR") found.add(code[1]);
    }
  }

  // NOT: "FIR XXXX" kalibi kullanilmaz — sehir adlarini yakaliyor (FIR LVIV -> "LVIV").
  // EASA her zaman ICAO kodunu parantez icinde verir. Parantezsiz bir bulten gelirse
  // FIR ayiklanamaz ve active_without_fir ile admin'e bildirilir — sessizce gecmez.

  found.delete("FIR");
  found.delete("UIR");
  return [...found].sort();
}

// ---------- Tarih: DD/MM/YYYY -> YYYY-MM-DD ----------
function toIsoDate(s: string): string | null {
  const m = (s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function clean(s: string): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resp = await fetch(CZIB_CSV, {
      headers: { "User-Agent": "GO2eFB/1.0 (EFB CZIB check)" },
    });
    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: `EASA fetch failed: ${resp.status}` }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const csv = await resp.text();
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: "CSV bos veya bozuk" }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Basliktan kolon indekslerini bul (EASA sutun sirasini degistirirse kirilmasin)
    const head = rows[0].map((h) => clean(h).toLowerCase());
    const col = (name: string) => head.indexOf(name.toLowerCase());

    const iSubject   = col("Subject");
    const iNo        = col("CZIB number");
    const iIssue     = col("Issue date");
    const iValid     = col("Valid until");
    const iStatus    = col("Status");
    const iAirspace  = col("Affected Airspace");
    const iCountry   = col("Affected Country");
    const iRecommend = col("Recommendation(s)");

    if (iSubject < 0 || iNo < 0 || iStatus < 0 || iAirspace < 0) {
      return new Response(
        JSON.stringify({ error: "CSV sutun basliklari beklenenden farkli", head }),
        { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    const records: Record<string, unknown>[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row[iNo] && !row[iSubject]) continue;

      const czibNo = clean(row[iNo]);
      if (!czibNo) continue;

      const airspace = (row[iAirspace] || "").trim();
      const firs = extractFirs(airspace);

      records.push({
        czib_no: czibNo,
        subject: clean(row[iSubject]),
        status: clean(row[iStatus]),                    // Active | Withdrawn
        affected_airspace: airspace,                    // EASA HAM METNI
        fir_codes: firs,
        countries: clean(row[iCountry] ?? ""),
        recommendation: (row[iRecommend] ?? "").trim(), // EASA HAM METNI
        issue_date: toIsoDate(row[iIssue] ?? ""),
        valid_until: toIsoDate(row[iValid] ?? ""),
        url: "https://www.easa.europa.eu/en/domains/air-operations/czibs",
        fetched_at: now,
      });
    }

    if (!records.length) {
      return new Response(JSON.stringify({ error: "CSV'den kayit cikarilamadi" }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { error } = await admin
      .from("czib_zones")
      .upsert(records, { onConflict: "czib_no" });

    if (error) {
      return new Response(
        JSON.stringify({ error: "DB upsert failed", detail: error.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const active = records.filter((x) => x.status === "Active");
    const missingFirs = active.filter((x) => (x.fir_codes as string[]).length === 0);

    return new Response(JSON.stringify({
      ok: true,
      total: records.length,
      active: active.length,
      // FIR ayiklanamayan AKTIF bulten varsa admin gorsun — sessizce gecmesin
      active_without_fir: missingFirs.map((x) => x.czib_no),
      fetched_at: now,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});