// czib-check — Ucus rotasini aktif EASA CZIB'leriyle karsilastirir
//
// GIRDI:  { plan_id }
// CIKTI:  { status, conflicts[], route_firs[], airports[], active_count, ... }
//
// ─── VERI KAYNAKLARI ───────────────────────────────────────────────────────
// 1) ENROUTE FIR'LAR: plans.atc_fpl -> Item 18 "EET/" alani
//    ICAO Doc 4444 formati: EET/[FIR 4 harf][HHMM] ...  ornek: EET/LTAA0026
//    OFP metin duzeninden BAGIMSIZ — ICAO standardi oldugu icin saglam.
//
// 2) MEYDANLAR: plans.dep / dest / alternate -> airports.iso_country -> ulke adi
//    NEDEN ULKE, NEDEN FIR DEGIL:
//      a) Meydan ICAO on-eki FIR koduna esit degildir. Mali meydanlari GA**,
//         CZIB FIR'lari GOOO/DRRR. On-ek eslemesi SESSIZCE kacirir.
//      b) EET/ sadece GIRILECEK FIR'lari listeler, KALKIS FIR'ini yazmaz.
//         Sam'dan (OSDI) kalkan ucusta OSTT hic gorunmez. Ulke eslemesi
//         bu bosluğu kapatir.
//
// ─── ESLESTIRME KURALI ─────────────────────────────────────────────────────
// TAM ESLESME kullanilir, alt-dize (ILIKE %..%) ASLA kullanilmaz.
// Sebep: 'Somalia' icinde 'Mali' gecer -> Bamako her Somali CZIB'iyle eslesirdi.
// Yanlis alarm, pilotun uyarilari ciddiye almayi birakmasina yol acar; bu da
// sonunda GERCEK bir kacirma demektir.
//
// ─── UC DURUM ──────────────────────────────────────────────────────────────
// CONFLICT     : Rota/meydan aktif bir CZIB ile eslesti.
// NO_CONFLICT  : Eslesme yok VE tum girdiler okunabildi.
// INCONCLUSIVE : Kontrol TAM yapilamadi (atc_fpl yok, EET/ yok, meydan ulkesi
//                bilinmiyor, ya da CZIB ulkesi ISO haritasinda yok).
//                ASLA yesil sayilmaz. Kontrol edilemiyorsa pilot bilir.
//
// IRTIFA FILTRESI YOK: Planlanan FL bir niyettir (ATC indirir, acil durum olur).
// FIR eslesiyorsa uyari verilir; irtifa bilgisi metinde GOSTERILIR ama uyariyi
// BASTIRMAZ.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ─── EET/ alanindan FIR ICAO kodlarini ayikla ──────────────────────────────
// Format: EET/LTAA0026 OIIX0145 ORBB0230
// Bir sonraki Item 18 alani (SEL/, REG/, RMK/ ...) veya satir sonuna kadar.
function extractEetFirs(atcFpl: string): string[] {
  if (!atcFpl) return [];
  const m = atcFpl.match(/EET\/([A-Z0-9 ]+?)(?=\s+[A-Z]{2,4}\/|\s*\n|\))/);
  if (!m) return [];
  const firs = new Set<string>();
  for (const p of m[1].matchAll(/([A-Z]{4})\d{4}/g)) firs.add(p[1]);
  return [...firs].sort();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ error: "Missing Authorization token" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const { plan_id } = await req.json().catch(() => ({}));
    if (!plan_id) return json({ error: "plan_id required" }, 400);

    // ── Plan ──
    const { data: plan, error: planErr } = await admin
      .from("plans")
      .select("id, customer_id, dep, dest, alternate, atc_fpl, route")
      .eq("id", plan_id)
      .single();

    if (planErr || !plan) return json({ error: "Plan not found" }, 404);

    const warnings: string[] = [];

    // ── 1) Enroute FIR'lar (EET/) ──
    const routeFirs = extractEetFirs(plan.atc_fpl ?? "");
    if (!plan.atc_fpl) {
      warnings.push("ATC flight plan not available — enroute FIRs could not be checked");
    } else if (routeFirs.length === 0) {
      warnings.push("No EET/ field in ATC flight plan — enroute FIRs could not be checked");
    }

    // ── 2) Meydanlar -> ulke ──
    const icaos = [plan.dep, plan.dest, plan.alternate]
      .filter((x): x is string => !!x && /^[A-Z]{4}$/.test(x.toUpperCase()))
      .map((x) => x.toUpperCase());
    const uniqIcaos = [...new Set(icaos)];

    const { data: apts } = await admin
      .from("airports").select("icao, name, iso_country").in("icao", uniqIcaos);

    const aptMap = new Map<string, { name: string; iso: string | null }>();
    for (const a of apts ?? []) {
      aptMap.set(a.icao, { name: a.name ?? "", iso: a.iso_country ?? null });
    }

    // Ulkesi bilinmeyen meydan "temiz" SAYILAMAZ
    for (const ic of uniqIcaos) {
      const a = aptMap.get(ic);
      if (!a) warnings.push(`Airport ${ic} not in database — country could not be checked`);
      else if (!a.iso) warnings.push(`Country unknown for ${ic} — could not be checked`);
    }

    // ── 3) ISO -> ulke adi haritasi ──
    const { data: isoRows } = await admin.from("iso_country_names").select("iso, name");
    const isoToName = new Map<string, string>();
    for (const r of isoRows ?? []) isoToName.set(r.iso, r.name);

    // Meydan ulkeleri (CZIB metnindeki adlariyla)
    const airportCountries = new Map<string, string[]>(); // ulke adi -> [icao]
    for (const ic of uniqIcaos) {
      const iso = aptMap.get(ic)?.iso;
      if (!iso) continue;
      const nm = isoToName.get(iso);
      if (!nm) continue; // haritada yoksa CZIB ulkesi de degildir (asagida ayrica kontrol)
      const arr = airportCountries.get(nm);
      if (arr) arr.push(ic); else airportCountries.set(nm, [ic]);
    }

    // ── 4) Aktif CZIB'ler ──
    const { data: zones, error: zErr } = await admin
      .from("czib_zones")
      .select("czib_no, subject, fir_codes, countries, recommendation, affected_airspace, valid_until, url, fetched_at")
      .eq("status", "Active");

    if (zErr) return json({ error: "czib_zones read failed", detail: zErr.message }, 500);
    const active = zones ?? [];

    if (active.length === 0) {
      warnings.push("No active CZIB data in database — run czib-sync");
    }

    // KOR NOKTA KONTROLU: CZIB'de gecen ama ISO haritasinda olmayan ulke
    // -> o CZIB icin meydan eslestirmesi CALISMAZ. Sessizce gecmesin.
    const unmapped = new Set<string>();
    for (const z of active) {
      for (const c of String(z.countries ?? "").split(",")) {
        const nm = c.trim();
        if (!nm) continue;
        if (![...isoToName.values()].includes(nm)) unmapped.add(nm);
      }
    }
    if (unmapped.size > 0) {
      warnings.push(
        `CZIB country not in ISO map: ${[...unmapped].join(", ")} — airport match disabled for these`,
      );
    }

    // ── 5) Eslestirme (TAM ESLESME) ──
    const conflicts: Record<string, unknown>[] = [];

    for (const z of active) {
      const zFirs: string[] = Array.isArray(z.fir_codes) ? z.fir_codes : [];
      const zCountries = String(z.countries ?? "")
        .split(",").map((c) => c.trim()).filter(Boolean);

      const firHits = routeFirs.filter((f) => zFirs.includes(f));           // tam esleme
      const aptHits: { icao: string; country: string }[] = [];
      for (const c of zCountries) {
        const list = airportCountries.get(c);                                // tam esitlik
        if (list) for (const ic of list) aptHits.push({ icao: ic, country: c });
      }

      if (firHits.length === 0 && aptHits.length === 0) continue;

      conflicts.push({
        czib_no: z.czib_no,
        subject: z.subject,
        matched_firs: firHits,
        matched_airports: aptHits,
        affected_airspace: z.affected_airspace,  // EASA ham metni (irtifa dahil)
        recommendation: z.recommendation,        // EASA ham metni
        valid_until: z.valid_until,
        url: z.url,
      });
    }

    // ── 6) Durum ──
    // INCONCLUSIVE her zaman NO_CONFLICT'ten oncelikli. Eslesme varsa CONFLICT.
    let status: string;
    if (conflicts.length > 0) status = "CONFLICT";
    else if (warnings.length > 0) status = "INCONCLUSIVE";
    else status = "NO_CONFLICT";

    const czibFetchedAt = active.length > 0
      ? active.map((z) => z.fetched_at).sort().reverse()[0]
      : null;

    // ── 7) Snapshot (EASA denetim izi) ──
    const { error: snapErr } = await admin.from("czib_snapshots").upsert({
      plan_id: plan.id,
      customer_id: plan.customer_id,
      route_firs: routeFirs,
      conflicts,
      active_count: active.length,
      status,
      checked_at: new Date().toISOString(),
      czib_fetched_at: czibFetchedAt,
      created_by: userId,
    }, { onConflict: "plan_id" });

    if (snapErr) {
      // Snapshot yazilamasa bile SONUC DONER — pilot uyariyi gormeli.
      warnings.push(`Audit snapshot could not be saved: ${snapErr.message}`);
    }

    return json({
      ok: true,
      status,                       // CONFLICT | NO_CONFLICT | INCONCLUSIVE
      conflicts,
      route_firs: routeFirs,
      airports: uniqIcaos.map((ic) => ({
        icao: ic,
        name: aptMap.get(ic)?.name ?? null,
        iso_country: aptMap.get(ic)?.iso ?? null,
      })),
      active_count: active.length,
      warnings,                     // BOS DEGILSE kontrol tam degil
      czib_fetched_at: czibFetchedAt,
      checked_at: new Date().toISOString(),
    });

  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
