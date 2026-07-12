// airports-rebuild — airports_new tablosunu OurAirports verisinden kurar
//
// Kaynak: OurAirports (public domain)
// Filtre: 4 harfli gecerli ICAO + type in (large/medium/small_airport)
//         heliport, seaplane_base, closed HARIC.
//
// Mevcut 'airports' tablosuna DOKUNMAZ. Once airports_new dolar,
// dogrulanir, sonra elle takas edilir. Boylece geri donus mumkun kalir.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SRC = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const KEEP = new Set(["large_airport", "medium_airport", "small_airport"]);

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
    else if (c === "\r") { /* skip */ }
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
    if (!resp.ok) throw new Error(`OurAirports fetch failed: ${resp.status}`);

    const rows = parseCsv(await resp.text());
    if (rows.length < 2) throw new Error("CSV bos");

    const head = rows[0].map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ""));
    const iIdent = head.indexOf("ident");
    const iType = head.indexOf("type");
    const iName = head.indexOf("name");
    const iLat = head.indexOf("latitude_deg");
    const iLon = head.indexOf("longitude_deg");
    const iIso = head.indexOf("iso_country");

    if ([iIdent, iType, iName, iLat, iLon, iIso].some((x) => x < 0)) {
      throw new Error(`Beklenen sutunlar yok: ${JSON.stringify(head)}`);
    }

    const recs: Record<string, unknown>[] = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const icao = (row[iIdent] || "").trim().toUpperCase();
      const type = (row[iType] || "").trim();
      if (!/^[A-Z]{4}$/.test(icao)) continue;
      if (!KEEP.has(type)) continue;

      const lat = parseFloat(row[iLat]);
      const lon = parseFloat(row[iLon]);
      if (!isFinite(lat) || !isFinite(lon)) continue;

      const iso = (row[iIso] || "").trim().toUpperCase();
      recs.push({
        icao,
        name: (row[iName] || "").trim(),
        lat,
        lon,
        iso_country: /^[A-Z]{2}$/.test(iso) ? iso : null,
      });
    }

    // Temiz baslangic
    const { error: delErr } = await admin
      .from("airports_new").delete().neq("icao", "___NEVER___");
    if (delErr) throw new Error(`clear failed: ${delErr.message}`);

    let written = 0;
    for (let i = 0; i < recs.length; i += 500) {
      const chunk = recs.slice(i, i + 500);
      const { error } = await admin
        .from("airports_new").upsert(chunk, { onConflict: "icao" });
      if (error) throw new Error(`insert @${i} failed: ${error.message}`);
      written += chunk.length;
    }

    const noCountry = recs.filter((r) => r.iso_country === null).length;

    return new Response(JSON.stringify({
      ok: true,
      parsed: recs.length,
      written,
      without_country: noCountry,
    }), { headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
