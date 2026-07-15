// airports-tz — airports.tz kolonunu (IANA saat dilimi adi) mwgg/Airports verisinden doldurur
//
// Kaynak: https://github.com/mwgg/Airports (MIT) — ICAO anahtarli JSON, "tz" alani IANA adi
// ("Europe/Istanbul" gibi). SABIT OFFSET DEGIL — DST donusumleri IANA adiyla dogru hesaplanir
// (FTL tasarim notu: "IANA adı sakla, sabit offset değil").
//
// Mevcut satirlar UPDATE edilir; tablo silinmez, yeni satir eklenmez.
// Amac: FTL sihirbazi/raporlarinda meydan yerel saati (Tablo-2 YEREL referansla calisir)
// ve FLT CREW "LTAC UTC+3" gosterimi.
//
// Eslesmeyenler sessizce gecmez: FTL hesabi tz'si olmayan meydanda dispatcher'in girdigi
// yerel saate guvenir; liste raporda doner ki elle tamamlanabilsin.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SRC = "https://raw.githubusercontent.com/mwgg/Airports/master/airports.json";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const resp = await fetch(SRC);
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `mwgg/Airports fetch failed: ${resp.status}` }), {
        status: 502, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const all = await resp.json() as Record<string, { tz?: string }>;

    // ICAO -> IANA tz
    const map = new Map<string, string>();
    for (const [icao, a] of Object.entries(all)) {
      if (/^[A-Z]{4}$/.test(icao) && a?.tz) map.set(icao, a.tz);
    }

    // Bizim tablodaki ICAO'lari cek (sayfali)
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

    // tz'ye gore grupla -> toplu UPDATE (satir satir cok yavas)
    const byTz = new Map<string, string[]>();
    let matched = 0;
    const unmatched: string[] = [];
    for (const icao of ours) {
      const tz = map.get(icao);
      if (!tz) { if (unmatched.length < 50) unmatched.push(icao); continue; }
      matched++;
      const arr = byTz.get(tz);
      if (arr) arr.push(icao); else byTz.set(tz, [icao]);
    }

    let updated = 0;
    for (const [tz, icaos] of byTz) {
      for (let i = 0; i < icaos.length; i += 500) {
        const chunk = icaos.slice(i, i + 500);
        const { error } = await admin
          .from("airports")
          .update({ tz })
          .in("icao", chunk);
        if (error) throw new Error(`update ${tz} failed: ${error.message}`);
        updated += chunk.length;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      airports_in_db: ours.length,
      matched,
      updated,
      timezones: byTz.size,
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
