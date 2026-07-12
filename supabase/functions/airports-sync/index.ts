// airports-sync — airports.iso_country kolonunu OurAirports verisinden doldurur
//
// Kaynak: OurAirports (kamu malı / public domain)
// Mevcut satirlar UPDATE edilir; tablo silinmez, yeni satir eklenmez.
// Amac: CZIB kontrolunde DEP/DEST/ALT meydanini ULKE bazinda eslestirmek.
//
// NEDEN ULKE, NEDEN FIR DEGIL:
// Meydan ICAO'sunun ilk iki harfi her zaman FIR koduna esit degildir.
// Ornek: Mali meydanlari GA** iken CZIB FIR'lari GOOO (Dakar) ve DRRR (Niamey).
// Bu durumda ön-ek eslemesi SESSIZCE kacirir. Ulke eslemesi istisnasizdir.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SRC = "https://davidmegginson.github.io/ourairports-data/airports.csv";

// RFC 4180 CSV parser (tirnak icinde virgul olabilir)
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* yoksay */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resp = await fetch(SRC);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `OurAirports fetch failed: ${resp.status}` }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const rows = parseCsv(await resp.text());
    if (rows.length < 2) {
      return new Response(JSON.stringify({ error: "CSV bos" }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Basliktan kolon indeksi (OurAirports sutun sirasini degistirirse kirilmasin)
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const iIdent = head.indexOf("ident");
    const iIso = head.indexOf("iso_country");

    if (iIdent < 0 || iIso < 0) {
      return new Response(JSON.stringify({ error: "Beklenen sutunlar yok", head }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ICAO -> ISO ulke haritasi (sadece 4 harfli ICAO kodlari)
    const map = new Map<string, string>();
    for (let r = 1; r < rows.length; r++) {
      const ident = (rows[r][iIdent] || "").trim().toUpperCase();
      const iso = (rows[r][iIso] || "").trim().toUpperCase();
      if (/^[A-Z]{4}$/.test(ident) && /^[A-Z]{2}$/.test(iso)) map.set(ident, iso);
    }

    // Bizim tablodaki ICAO'lari cek
    const ours: string[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("airports").select("icao")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`select failed: ${error.message}`);
      if (!data || data.length === 0) break;
      for (const r of data) if (r.icao) ours.push(String(r.icao).toUpperCase());
      if (data.length < PAGE) break;
    }

    // Ulkeye gore grupla -> tek UPDATE ile toplu yaz (satir satir update cok yavas olur)
    const byCountry = new Map<string, string[]>();
    let matched = 0;
    const unmatched: string[] = [];

    for (const icao of ours) {
      const iso = map.get(icao);
      if (!iso) { if (unmatched.length < 50) unmatched.push(icao); continue; }
      matched++;
      const arr = byCountry.get(iso);
      if (arr) arr.push(icao); else byCountry.set(iso, [icao]);
    }

    let updated = 0;
    for (const [iso, icaos] of byCountry) {
      for (let i = 0; i < icaos.length; i += 500) {
        const chunk = icaos.slice(i, i + 500);
        const { error } = await admin
          .from("airports")
          .update({ iso_country: iso })
          .in("icao", chunk);
        if (error) throw new Error(`update ${iso} failed: ${error.message}`);
        updated += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      airports_in_db: ours.length,
      matched,
      updated,
      countries: byCountry.size,
      // Eslesmeyenler sessizce gecmesin — CZIB kontrolunde ulkesi bilinmeyen
      // meydan "temiz" sayilamaz, INCONCLUSIVE isaretlenir.
      unmatched_count: ours.length - matched,
      unmatched_sample: unmatched,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
