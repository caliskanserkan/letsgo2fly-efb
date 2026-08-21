// GO2 eFB — archive-flight Edge Function
// Ucusu arsivler. iOS (ve gerekirse web) tek kapidan cagirir.
//
// TEK KAYNAK: Sure/yakit/saat hesaplari BURADA. Istemciye kopyalanmaz.
// Girdi (POST JSON): { plan_id, pax?, cycles?, divert_reason? }
// Cikti: { ok, archived_flight_id, block_minutes, airborne_minutes }
//
// Okur : plans, flight_crew_data, mandatory_data, efp_data, fuel_data, rass_data,
//        accept_data, takeoff_data, lnd_data, navlog_data, wx_snapshots,
//        efb_documents, profiles, home_bases, aircraft
// Yazar: archived_flights, navlog_entries, flt_report, efb_documents(link),
//        plans(status=archived), flight_logs(FLIGHT_ARCHIVED)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportPdf } from "./report-pdf.ts";
// FTL motoru web ile TEK KAYNAK. Sunucu artik kendi UGS tablosunu TASIMIYOR
// (K-2'nin kok nedeni buydu) — faaliyet tipi arsivde degistiginde azami UGS'yi
// panelin kullandigi AYNI fonksiyonla yeniden hesaplar. esbuild bundle'lar.
import { maxFdpMinutes, effectiveRules, toMin }
  from "../../../efb/src/components/FTLEngine.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ─── Zaman yardimcilari ───────────────────────────────────────────────────────
function toMins(t?: string | null): number | null {
  if (!t || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}
// Gece yarisi gecisi: negatifse +24h
function diffMins(a?: string | null, b?: string | null): number | null {
  const am = toMins(a), bm = toMins(b);
  if (am === null || bm === null) return null;
  let d = bm - am;
  if (d < 0) d += 1440;
  return d;
}
function toIsoDate(dateStr?: string | null): string {
  if (!dateStr) return new Date().toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const months: Record<string,string> = {JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",
                                         JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"};
  const m = dateStr.trim().match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/i);
  if (m) return `${m[3]}-${months[m[2].toUpperCase()] ?? "01"}-${m[1].padStart(2,"0")}`;
  const p = new Date(dateStr);
  return isNaN(p.getTime()) ? new Date().toISOString().slice(0,10) : p.toISOString().slice(0,10);
}
function ts(hhmm?: string | null, isoDate?: string): string | null {
  if (!hhmm || !isoDate) return null;
  const d = new Date(`${isoDate}T${hhmm}:00.000Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ""), 10);
  return isNaN(n) ? null : n;
}
function hhmm(mins?: number | null): string {
  if (mins === null || mins === undefined) return "—";
  return `${Math.floor(mins/60)}:${String(mins%60).padStart(2,"0")}`;
}
// ─── Modul konfigurasyonu (12 Agu 2026, build 43) ────────────────────────────
// iPad'in gonderdigi donmus kopya GUVENILMEZ GIRDIDIR: sadece `string -> boolean`
// ciftleri alinir, gerisi atilir. Tek bir bozuk deger raporun bir bolumunu
// sessizce budayabilirdi.
// Bos nesne KABUL EDILMEZ (null doner): bos map "hepsi acik" demektir, oysa
// gonderilmemis olmak "bilmiyorum" demektir — ikisi ayni sey degil (Ilke 1).
function sanitizeFeatures(v: unknown): Record<string, boolean> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof k === "string" && k.length <= 64 && typeof val === "boolean") out[k] = val;
  }
  return Object.keys(out).length ? out : null;
}

// DEST koordinati (raw_text'ten) — is_night_landing hesabi ileride buna dayanir
function parseDestCoords(raw?: string | null): { lat: number|null; lon: number|null } {
  if (!raw) return { lat: null, lon: null };
  const m = raw.match(/^DEST\s+\S+\s+.*?N(\d+):(\d+\.?\d*)\s+E(\d+):(\d+\.?\d*)/m);
  if (!m) return { lat: null, lon: null };
  return { lat: +m[1] + +m[2]/60, lon: +m[3] + +m[4]/60 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")    return json({ error: "POST only" }, 405);

  try {
    // ── 1) Caller dogrula (parse-plan ile ayni desen) ────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing Authorization token" }, 401);

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin.from("profiles")
      .select("customer_id, full_name").eq("id", callerId).single();
    const callerCustomerId = prof?.customer_id ?? null;
    if (!callerCustomerId) return json({ error: "Caller has no customer_id" }, 403);

    // ── 2) Girdi ─────────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    // UUID HARF DUYARSIZDIR. iOS Swift `UUID.uuidString` BUYUK harf uretir,
    // Postgres/web ise kucuk yazar — ayni ucus iki farkli metinle temsil
    // ediliyordu ve 14. adimdaki sektor eslesmesi tutmuyordu: planli gorev
    // bulunamayip AYNI UCUS ICIN IKINCI bir crew_duties satiri aciliyordu
    // (8 Agu 2026 saha bulgusu — 07 Agu LTFM-LTAC, iki pilotta da mukerrer;
    // duty saatleri cift sayiliyordu). Ayni tuzak daha once Storage yollarinda
    // yasanmisti. Cozum tek yerde: girdiyi ALIRKEN normalize et.
    const planIdRaw: string | undefined = body.plan_id;
    if (!planIdRaw) return json({ error: "plan_id required" }, 400);
    const planId: string = String(planIdRaw).toLowerCase();
    const paxIn    = num(body.pax);
    const cyclesIn = num(body.cycles) ?? 1;
    const divertReason: string | null = body.divert_reason ?? null;
    let regenOnly: boolean = body.regenerate_pdf === true;

    // ── 3) Plan (tenant kontrolu) ────────────────────────────────────────────
    const { data: plan } = await admin.from("plans").select("*").eq("id", planId).single();
    if (!plan) return json({ error: "Plan not found" }, 404);
    if (plan.customer_id !== callerCustomerId) return json({ error: "Forbidden" }, 403);

    // MODUL KONFIGURASYONU (10 Agu 2026, super admin settings).
    // Kapali modul ARKA PLANDA DA CALISMAZ: FTL kapaliysa crew_duties satiri
    // uretilmez ve raporda FTL bolumu cizilmez.
    // Okunamazsa {} kalir -> ACIK kabul edilir (Kural 8: belirsizlik = acik;
    // kapaliya dusmek burada sessizce FTL takibini durdururdu).
    const { data: custCfg } = await admin.from("customers")
      .select("features").eq("id", plan.customer_id).single();
    const liveFeatures = (custCfg?.features ?? {}) as Record<string, boolean>;
    const ftlEnabled = liveFeatures["admin.ftl"] !== false;

    // ── RAPORUN KONFIGURASYONU — UCUSUN KENDI HALI (12 Agu 2026, build 43) ───
    // Buraya kadar okunan `liveFeatures` BUGUNKU ayardir. Rapor bunu kullanamaz:
    //   (a) ucus acikken anahtar kapatilirsa tablette kaydedilen QNH/VREF
    //       satirlari rapora hic girmiyordu (iPad donmus kopyayla dogru
    //       davraniyor, rapor yeni ayarla budaniyordu),
    //   (b) REGEN REPORT eski bir ucusun raporunu bugunku ayarla yeniden
    //       uretiyor, aradan gecen surede kapatilan modulun satirlari GECMIS
    //       RAPORDAN dusuyordu.
    // Ikisi de Ilke 3 ihlali. Artik konfigurasyon ILK ARSIVDE DONAR ve
    // `flt_report.features_snapshot`ta yasar; REGEN onu geri okur.
    const snapFromDevice = sanitizeFeatures(body.features_snapshot);
    // iPad 10 `ui.*` anahtarini ACIKCA yollar; `admin.*` sapmalarini bilmez,
    // onlari sunucu arsiv anindaki halinden altina serer. Cihaz USTTE kazanir:
    // ucusun fiilen yurudugu ayar odur.
    const featuresAtArchive: Record<string, boolean> =
      { ...liveFeatures, ...(snapFromDevice ?? {}) };
    const featuresSource: "device" | "server" = snapFromDevice ? "device" : "server";
    if (!regenOnly && plan.status === "archived") {
      // IDEMPOTENT (31 Tem 2026, PLAN DOWNLOAD Faz 3 — Serkan karari):
      // TEK PLAN TEK ARSIV. Ikinci tabletin (offline kuyruktan geç gelen)
      // cagrisi hata degil — MEVCUT arsiv bilgisiyle 200 doner; istemci normal
      // basari yolunda raporu indirir, plani lokalde ARSIVLENDI isaretler.
      // Cift archived_flights kaydi imkansizdir.
      const { data: exAf } = await admin.from("archived_flights")
        .select("id, block_minutes, airborne_minutes, destination_icao, off_blocks, takeoff_time, landing_time, on_blocks")
        .eq("plan_id", planId).maybeSingle();

      // 🔴 BOSLARI TAMAMLA (4 Agu 2026 saha bulgusu — LEIB→LTFE demo ucusu):
      // Ilk arsiv cagrisiyla navlog aynasinin yazimi YARISABILIR: arsiv, inis
      // saatleri sunucuya dusmeden okursa kolonlar NULL kalir; ikinci cagri da
      // burada "already archived" deyip veriyi TAZELEMEDEN donuyordu — eksik
      // kalici oluyordu. Artik: aynada olup arsivde BOS olan zaman kolonlari
      // doldurulur (DOLU kolona ASLA yazilmaz — EASA/duzeltme yolu admin EDIT),
      // bir sey dolduysa regen akisina gecilir: PDF yenilenir + 14. adim FTL'i
      // gercek saatlerle kurar. Hicbir sey eksik degilse eski davranis aynen.
      if (exAf) {
        const { data: navQ } = await admin.from("navlog_data")
          .select("waypoints, entries").eq("plan_id", planId).maybeSingle();
        const isoD = toIsoDate(plan.date);
        const wptsQ: any[] = navQ?.waypoints ?? [];
        const entsQ: Record<string, any> = navQ?.entries ?? {};
        const depQ = wptsQ.find(w => w.type === "dep");
        const arrQ = wptsQ.find(w => w.type === "divert-arpt") ?? wptsQ.find(w => w.type === "dest");
        const depEQ = depQ ? entsQ[depQ.uid] ?? {} : {};
        const arrEQ = arrQ ? entsQ[arrQ.uid] ?? {} : {};
        const fill: Record<string, unknown> = {};
        if (!exAf.off_blocks   && depEQ.offBlock) fill.off_blocks   = ts(depEQ.offBlock, isoD);
        if (!exAf.takeoff_time && depEQ.toTime)   fill.takeoff_time = ts(depEQ.toTime, isoD);
        if (!exAf.landing_time && arrEQ.lndTime)  fill.landing_time = ts(arrEQ.lndTime, isoD);
        if (!exAf.on_blocks    && arrEQ.onBlock)  fill.on_blocks    = ts(arrEQ.onBlock, isoD);
        Object.keys(fill).forEach(k => { if (fill[k] == null) delete fill[k]; });
        if (Object.keys(fill).length) {
          if (exAf.block_minutes == null) {
            const ob = (fill.off_blocks as string) ?? exAf.off_blocks;
            const nb = (fill.on_blocks as string) ?? exAf.on_blocks;
            if (ob && nb) fill.block_minutes = Math.round((new Date(nb).getTime() - new Date(ob).getTime()) / 60000);
          }
          if (exAf.airborne_minutes == null) {
            const tt = (fill.takeoff_time as string) ?? exAf.takeoff_time;
            const lt = (fill.landing_time as string) ?? exAf.landing_time;
            if (tt && lt) fill.airborne_minutes = Math.round((new Date(lt).getTime() - new Date(tt).getTime()) / 60000);
          }
          const { error: fillErr } = await admin.from("archived_flights").update(fill).eq("id", exAf.id);
          if (!fillErr) {
            regenOnly = true;   // PDF + FTL 14. adim taze saatlerle kosar
          }
        }

        // 🔴 RAPOR AYRICA KONTROL EDILIR (9 Agu 2026 — 4 Agu yamasinin eksigi):
        // `archived_flights` TAM olsa bile `flt_report` bayat kalmis olabilir.
        // 09 AUG LTAC-EGLF'te tam boyle oldu: ikinci cagri arsiv saatlerini
        // onardi, `fill` bosaldigi icin regen'e GECMEDI ve asagida erken dondu —
        // rapor 40 bos satirla kalici oldu. Erken donus, onarilabilir bir raporun
        // uzerine kapanmamali. Onarimi 11a yapar; burada yalniz "regen'e gec".
        if (!regenOnly) {
          const { data: exFr } = await admin.from("flt_report")
            .select("navlog, takeoff_time").eq("plan_id", planId).maybeSingle();
          if (exFr) {
            const st: any[] = Array.isArray(exFr.navlog) ? exFr.navlog : [];
            const stActual = st.some(r => r && (r.ata != null || r.fuel_actual != null));
            const stNoteCol = st.some(r => r && "note" in r);
            const mirrorNotes = Object.values(entsQ).some((e: any) =>
              typeof e?.note === "string" && e.note.trim() !== "");
            const mirrorActual = wptsQ.some(w => {
              const e = entsQ[w.uid];
              return !!(e && (e.ata || e.toTime || e.lndTime || e.offBlock ||
                              e.onBlock || e.fuel || e.toFuel || e.remFuel));
            });
            if ((mirrorActual && st.length > 0 && !stActual) ||
                (exFr.takeoff_time == null && !!depEQ.toTime) ||
                (mirrorNotes && st.length > 0 && !stNoteCol)) {
              regenOnly = true;
            }
          }
        }
      }
      if (!regenOnly) {
      const { data: exRep } = await admin.from("efb_documents")
        .select("file_path").eq("plan_id", planId)
        .eq("section", "REPORT").eq("status", "CURRENT").maybeSingle();
      return json({
        ok: true,
        already_archived: true,
        archived_flight_id: exAf?.id ?? null,
        block_minutes: exAf?.block_minutes ?? null,
        airborne_minutes: exAf?.airborne_minutes ?? null,
        block_time: exAf?.block_minutes != null ? hhmm(exAf.block_minutes) : null,
        flight_time: exAf?.airborne_minutes != null ? hhmm(exAf.airborne_minutes) : null,
        is_divert: exAf?.destination_icao != null && exAf.destination_icao !== plan.dest,
        destination: exAf?.destination_icao ?? plan.dest ?? null,
        departure: plan.dep ?? null,
        reg: plan.reg ?? null,
        flight_date: plan.date ?? null,
        report_pdf_path: exRep?.file_path ?? null,
      });
      }
    }
    if (regenOnly && plan.status !== "archived") return json({ error: "Not archived yet" }, 409);

    // ── 4) Modul tablolarini oku (paralel) ───────────────────────────────────
    const one = async (t: string) =>
      (await admin.from(t).select("*").eq("plan_id", planId).maybeSingle()).data;

    const [crewD, mandD, fuelD, rassD, acceptD, tkofD, lndD, navD, rawV] = await Promise.all([
      one("flight_crew_data"), one("mandatory_data"), one("fuel_data"), one("rass_data"),
      one("accept_data"), one("takeoff_data"), one("lnd_data"), one("navlog_data"),
      admin.from("plan_versions").select("raw_text").eq("plan_id", planId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle()
        .then(r => r.data),
    ]);

    // Crew kaynagi: flight_crew_data birincil (iOS buraya yazar), plans fallback
    const pfPilot = crewD?.crew_pf ?? plan.pf_pilot ?? null;
    const pmPilot = crewD?.crew_pm ?? plan.pm_pilot ?? null;
    // 3 PILOT / CHECK RIDE (4 Agu): CRZ CPT sirket pilotu; TRE/TRI dis ad-soyad.
    const crzPilot = crewD?.crew_crz ?? plan.crz_pilot ?? null;
    const checkRide = crewD?.check_ride ?? plan.check_ride ?? false;
    const externalExaminer = crewD?.external_examiner ?? plan.external_examiner ?? null;

    const [wxRows, docRows] = await Promise.all([
      admin.from("wx_snapshots").select("icao,type,raw_text,fetched_at")
        .eq("plan_id", planId).order("fetched_at", { ascending: false }).then(r => r.data ?? []),
      admin.from("efb_documents").select("id,section,file_name,file_path,mime_type,file_size,uploaded_at")
        .eq("plan_id", planId).then(r => r.data ?? []),
    ]);

    // ── 5) NavLog: zamanlar ve yakit BURADAN gelir (tek kaynak) ──────────────
    const wpts: any[] = navD?.waypoints ?? [];
    const entries: Record<string, any> = navD?.entries ?? {};

    // ── BAYAT AYNA TESPITI (9 Agu 2026 saha, LTAC-EGLF) ─────────────────────
    // Bu fonksiyon NavLog'u SUNUCUDAKI `navlog_data` satirindan okur — arsivi
    // basan tabletin EKRANINDAN degil. Iki tabletli ucusta P2P sync ile veriyi
    // ALAN tablet o veriyi sunucuya HIC yazmaz (FlightSnapshotStore yalniz
    // UserDefaults'a yazar); onun aynasi kalkis oncesi halinde kalir:
    // waypoints DOLU, entries BOS. O tablet arsiv yarisini kazanirsa rapor 40
    // BOS satirla yazilir ve pilotun 4 saatlik kaydi raporda YOK gorunur.
    //
    // 09 AUG LTAC-EGLF'te tam olarak bu oldu: ucus PF'in tabletinde islendi
    // (o uçak modundaydi, kuyrugu buyuktu), PM'in tableti 5,5 sn once cagriyi
    // indirdi ve bayat aynayi okudu. Sessizce bos rapor yazmak Ilke 1 ihlali:
    // sistem, elinde OLMAYAN veriyi "pilot girmemis" gibi gosterir.
    // Once TESPIT (burada), sonra ONARIM (11a) — ve gorulmezse KAYDA GEC (13).
    const entryHasActual = (e: any) => !!(e && (e.ata || e.toTime || e.lndTime ||
      e.offBlock || e.onBlock || e.fuel || e.toFuel || e.remFuel));
    const navHasActuals = wpts.some(w => entryHasActual(entries[w.uid]));

    const depWpt  = wpts.find(w => w.type === "dep");
    const divWpt  = wpts.find(w => w.type === "divert-arpt");
    const arrWpt  = divWpt ?? wpts.find(w => w.type === "dest");

    const depE = depWpt ? entries[depWpt.uid] ?? {} : {};
    const arrE = arrWpt ? entries[arrWpt.uid] ?? {} : {};

    const offBlock    = depE.offBlock ?? null;
    const takeoffTime = depE.toTime   ?? null;
    const landingTime = arrE.lndTime  ?? null;
    const onBlock     = arrE.onBlock  ?? null;
    const toFuel      = num(depE.toFuel);
    const remFuel     = num(arrE.remFuel);

    const blockMinutes    = diffMins(offBlock, onBlock);
    const airborneMinutes = diffMins(takeoffTime, landingTime);

    const isDivert = !!divWpt;
    const destIcao = isDivert ? divWpt.name : (plan.dest ?? null);
    const isoDate  = toIsoDate(plan.date);
    const { lat: destLat, lon: destLon } = parseDestCoords(rawV?.raw_text);

    // ── 6) archived_flights INSERT ───────────────────────────────────────────
    const depRwy = tkofD?.sel_rwy || tkofD?.manual_rwy || null;
    const arrRwy = lndD?.sel_rwy  || lndD?.manual_rwy  || null;

    let afId: string;
    if (regenOnly) {
      const { data: exAf } = await admin.from("archived_flights")
        .select("id").eq("plan_id", planId).single();
      if (!exAf) return json({ error: "archived_flights row not found" }, 404);
      afId = exAf.id;
    } else {
    const { data: af, error: afErr } = await admin.from("archived_flights").insert({
      plan_id: planId,
      pic_id: pfPilot, sic_id: pmPilot, pf_id: pfPilot,
      departure_icao: plan.dep, destination_icao: destIcao,
      off_blocks:   ts(offBlock, isoDate),
      on_blocks:    ts(onBlock, isoDate),
      takeoff_time: ts(takeoffTime, isoDate),
      landing_time: ts(landingTime, isoDate),
      block_minutes: blockMinutes, airborne_minutes: airborneMinutes,
      landing_count: cyclesIn,
      dest_lat: destLat, dest_lon: destLon, is_night_landing: false,
      takeoff_fuel: toFuel, remaining_fuel: remFuel,
      pax: paxIn ?? num(plan.pax),
      archived_at: new Date().toISOString(),
      dep_rwy: depRwy, sid: tkofD?.sid ?? null, dep_atis: tkofD?.dep_atis ?? null,
      arr_rwy: arrRwy, arr_atis: lndD?.arr_atis ?? null,
      actual_lw: num(lndD?.actual_lw), vref: num(lndD?.vref),
      req_landing_dist: num(lndD?.req_lnd),
      arr_qnh: num(lndD?.qnh), rwy_condition: lndD?.rwy_cond ?? null,
      // CHECK constraint: sadece 'PIC' | 'SIC'.
      // Accept & Sign'da PIC olarak atanan kisi mi arsivliyor?
      archived_by_pilot_id: callerId,
      archived_by_role: (acceptD?.pic_id === callerId) ? "PIC" : "SIC",
    }).select("id").single();
    if (afErr) return json({ error: "archive insert failed", detail: afErr.message }, 500);
    afId = af.id;
    }

    // ── 7) navlog_entries (plan_id TEXT tipinde — dikkat) ────────────────────
    if (!regenOnly && wpts.length) {
      const rows = wpts.map((w, i) => {
        const e = entries[w.uid] ?? {};
        const fuelActual =
          num(e.fuel) ??
          (w.type === "dep"  ? num(e.toFuel)  : null) ??
          (w.type === "dest" || w.type === "divert-arpt" ? num(e.remFuel) : null);
        const ata =
          e.ata ??
          (w.type === "dep" ? e.toTime : null) ??
          (w.type === "dest" || w.type === "divert-arpt" ? e.lndTime : null) ?? null;
        return {
          plan_id: String(planId),
          wpt_uid: w.uid, wpt_name: w.name, wpt_type: w.type,
          eta: (w.eta && w.eta !== "—") ? w.eta : null,
          ata, fuel_plan: w.planFuel ?? null, fuel_actual: fuelActual,
          // NOT (9 Agu 2026): pilotun waypoint'e yazdigi serbest metin. 09 AUG
          // ucusunda enroute alternatif meydan WX kontrolleri bu alana yazilmisti
          // ("LTBA LBSF LROP LHBP LOWW WXR CHECKED") — arsiv zincirinin HICBIR
          // yerinde tasinmadigi icin denetim kaydindan tamamen dusuyordu.
          rvsm: e.rvsm ?? null, note: e.note ?? null, seq: i,
        };
      });
      await admin.from("navlog_entries").delete().eq("plan_id", String(planId));
      const { error: neErr } = await admin.from("navlog_entries").insert(rows);
      if (neErr) console.warn("[archive] navlog_entries:", neErr.message);
    }

    // ── 8) Crew + home_base (FTL raporu icin) ───────────────────────────────
    const pilotIds = [pfPilot, pmPilot, crzPilot].filter(Boolean);
    const { data: pilots } = pilotIds.length
      ? await admin.from("profiles").select("id,full_name").in("id", pilotIds)
      : { data: [] as any[] };
    const { data: hbs } = pilotIds.length
      ? await admin.from("home_bases").select("pilot_id,icao").in("pilot_id", pilotIds)
      : { data: [] as any[] };
    const nameOf = (id: string | null) => pilots?.find(p => p.id === id)?.full_name ?? null;
    const hbOf   = (id: string | null) => hbs?.find(h => h.pilot_id === id)?.icao ?? null;

    const crew = {
      pf: { id: pfPilot, name: nameOf(pfPilot), home_base: hbOf(pfPilot) },
      pm: { id: pmPilot, name: nameOf(pmPilot), home_base: hbOf(pmPilot) },
      // CRZ CPT tam ekip uyesidir (duty saatleri FTL'de islenir);
      // TRE/TRI dis denetci — yalniz kayit (FTL kumulatifi tutulmaz).
      ...(crzPilot ? { crz: { id: crzPilot, name: nameOf(crzPilot), home_base: hbOf(crzPilot) } } : {}),
      ...(checkRide ? { check_ride: true, external_examiner: externalExaminer } : {}),
    };

    // ── 9) Ucak / motor saatleri (arsivden SONRAKI toplam) ───────────────────
    let acHours: unknown = null;
    if (plan.reg) {
      const { data: ah } = await admin.rpc("aircraft_hours", { p_reg: plan.reg });
      const r = Array.isArray(ah) ? ah[0] : ah;
      if (r) {
        acHours = {
          airframe_minutes: r.airframe_minutes, airframe: r.airframe_hhmm,
          eng1_minutes: r.eng1_minutes, eng1: r.eng1_hhmm,
          eng2_minutes: r.eng2_minutes, eng2: r.eng2_hhmm,
          cycles: r.cycles,
        };
      }
    }

    // ── 10) WX (ICAO+tip basina en guncel) ──────────────────────────────────
    const wxMap: Record<string, any> = {};
    for (const r of wxRows) {
      const k = `${r.icao}_${r.type}`;
      if (!wxMap[k]) wxMap[k] = { icao: r.icao, type: r.type, raw_text: r.raw_text };
    }

    // FTL propagasyonunun sonucu (11. bolumde, PDF'ten HEMEN ONCE doldurulur).
    // Rapor uretilmeyen yollarda 14. adimin yerinde ayrica kosar — FTL guncellemesi
    // rapora BAGLI DEGILDIR, rapor olmasa da gorev guncellenmelidir.
    let ftlResult: { ftlUpdate: Record<string, string>; dutyRows: Record<string, any> } | null = null;
    // iOS End Flt "DUTY FINISHED?" cevabi — hem eslestirme hem turetme kullanir.
    const dutyFinishedIn: boolean | null =
      typeof body.duty_finished === "boolean" ? body.duty_finished : null;

    // ── 11) flt_report UPSERT — RAPORUN TEK KAYNAGI ─────────────────────────

    /** "400" / "FL400" -> "FL400"; "CLB" / "DSC" / "238ft" / "" -> null.
     *  iOS `NavLogEngine.flLevel` ile AYNI kural (rapor neyse NavLog o).
     *
     *  🔴 21 AGU 2026 — DORT HANE VE UZERI SEVIYE DEGIL, FEET IRTIFADIR.
     *  Saha (20 Agu, EGLF-LTAC): FMS fotografiyla alinan alcalma kisitlari
     *  (`4700`, `3200`) ciplak sayi oldugu icin seviye sayiliyordu; hem
     *  ekranda `FL4700` diye OLMAYAN seviye ciziliyor hem de asagidaki
     *  `flActual` korumasi acilip alcalma noktasina SEYIR SEVIYESI (FL450)
     *  damgalaniyordu — TOVNA'da ucak 4700 ft'teydi.
     *  Serkan: "FMS FL'i sadece seviyelere koyuyor, bizim decoder uydurdu."
     *  FL yuz feet birimidir, en fazla uc hane (FL510). */
    const flLevel = (s: unknown): string | null => {
      const t = String(s ?? "").trim().toUpperCase();
      if (!t) return null;
      const d = t.startsWith("FL") ? t.slice(2) : t;
      if (!/^\d+$/.test(d)) return null;
      return d.length <= 3 ? `FL${d}` : null;     // 4700 / 3200 -> IRTIFA
    };
    /** Sayisal ama seviye DEGIL: feet kot kisiti. Safha isareti sayilmaz. */
    const isAltitudeFeet = (s: unknown): boolean => {
      const t = String(s ?? "").trim();
      return /^\d+$/.test(t) && t.length > 3;
    };
    const DSC = "DSC";
    const isDSC = (s: unknown): boolean =>
      String(s ?? "").trim().toUpperCase() === DSC;
    /** ALCALMANIN BASLADIGI ilk indeks — iOS `descentStartIndex` ile ayni:
     *  ilk sayisal seyir seviyesinden SONRA gelen ilk SAFHA ISARETI (metin).
     *  Kot kisiti (4700) safha isareti DEGILDIR, atlanir. */
    const descentStart = (): number | null => {
      let sawCruise = false;
      for (let i = 0; i < wpts.length; i++) {
        const t = String(wpts[i].fl ?? "").trim();
        if (flLevel(t)) { sawCruise = true; continue; }
        if (isAltitudeFeet(t)) continue;
        if (sawCruise && t) return i;
      }
      return null;
    };
    /** Bu noktada UCULAN seviye. iOS `NavLogEngine.effectiveFL` ile ayni sira:
     *  (1) noktanin KENDI girisi her zaman kazanir, (2) plan sayisal ise geriden
     *  gelen son giris tasinir, (3) safha isareti/kot ise seviye yazilmaz. */
    const dscIdx = descentStart();
    const flActual = (i: number): string | null => {
      const ownEntry = (entries[wpts[i].uid] ?? {}).cruiseFL;
      const own = flLevel(ownEntry);
      if (own) return own;
      // Pilot "USE DSC" ile alcalmayi isaretlediyse KAYDA DA DSC girer.
      // Eskiden sunucu DSC'yi hic tanimiyordu (flLevel null donuyordu) ve
      // asagidaki tasima devreye girip seyir seviyesini damgaliyordu.
      if (isDSC(ownEntry)) return DSC;
      if (!flLevel(wpts[i].fl)) return null;          // CLB / DSC / kot -> dokunma
      // 🔴 ALCALMA BASLADIYSA TASIMA YOK — iOS `effectiveFL` 3b kuralinin
      // ayinisi (13 Agu saha). Alcalmanin ICINDEKI sayisal kot kisitlari
      // "tasinabilir seviye" sanilip FL450 damgalanmasin.
      if (dscIdx != null && i >= dscIdx) return null;
      for (let j = i - 1; j >= 0; j--) {
        const e = (entries[wpts[j].uid] ?? {}).cruiseFL;
        const lvl = flLevel(e);
        if (lvl) return lvl;
        if (isDSC(e)) return DSC;                     // DSC de tasinir (15 Agu)
      }
      return null;
    };

    const navlogJson = wpts.map((w, i) => {
      const e = entries[w.uid] ?? {};
      return {
        seq: i, wpt: w.name, type: w.type, custom: w.custom === true,
        // FMS FOTOGRAFINDAN GELEN NOKTA (13 Agu 2026). Bu noktanin `eta` ve
        // `fuel_plan` degerleri OFP'den DEGIL, FMS'in yeniden rotalama
        // tahmininden gelir — OFP planiyla karsilastirilamaz, cunku iki AYRI
        // REFERANS SISTEMI. Rapor T-DEV/F-DEV'i bu bayrakla susturur.
        // Bugune kadar gonderilmiyordu: rapor yalniz `custom` goruyor ve
        // FMS'ten geleni pilotun elle ekledginden ayirt edemiyordu.
        from_fms: (w as any).fromFMS === true,
        eta: (w.eta && w.eta !== "—") ? w.eta : null,
        ata: e.ata ?? (w.type === "dep" ? e.toTime : null)
                   ?? ((w.type === "dest" || w.type === "divert-arpt") ? e.lndTime : null) ?? null,
        fuel_plan: w.planFuel ?? null,
        fuel_actual: num(e.fuel) ?? (w.type === "dep" ? num(e.toFuel) : null)
                                 ?? ((w.type === "dest" || w.type === "divert-arpt") ? num(e.remFuel) : null),
        rvsm: e.rvsm ?? null,
        // SEVIYE (9 Agu 2026 saha, LTAC-EGLF): pilot FL430'a cikti, dort noktada
        // seviye girdi, RVSM'i 43.000'den okudu — rapora seviye HIC girmiyordu
        // (ne plan ne gercek). `fl` planin degeri (tirmanista "CLB", alcalista
        // "DSC", meydanda kot), `fl_actual` pilotun girdigi gercek seyir seviyesi.
        // iOS ile AYNI kural: gercek deger o noktadan sonrasina tasinir ama
        // safha isaretlerinin (CLB/DSC) uzerine YAZILMAZ — orada seyir yok.
        fl: (w.fl && w.fl !== "—") ? String(w.fl) : null,
        fl_actual: flActual(i),
        // Waypoint notu (9 Agu 2026) — rapora AYRI bir blok olarak basilir.
        // Tabloya kolon eklenmedi: NavLog tablosu TEK SATIR kalmali (Serkan,
        // 2 Agu) ama serbest metin de KIRPILAMAZ — ikisi ancak ayri blokta bir
        // arada olur (blokta sarilir, tabloda satir bozulmaz).
        note: (typeof e.note === "string" && e.note.trim()) ? e.note.trim() : null,
      };
    });

    // ── RAPOR BLOKLARI — TEK TANIM (9 Agu 2026) ─────────────────────────────
    // Ayni nesneler hem ILK YAZIMDA hem 11a ONARIMINDA kullanilir. Ikinci bir
    // kopya cikarilsaydi, onarim ilk yazimdan farkli bir sekil uretebilirdi.
    const frTakeoff = tkofD ? {
      icao: tkofD.icao, rwy: depRwy, rwy_len: tkofD.manual_len,
      atis: tkofD.dep_atis, sid: tkofD.sid, fl: tkofD.fl, sq: tkofD.sq, oth: tkofD.oth,
      v1: tkofD.v1, vr: tkofD.vr, v2: tkofD.v2, vse: tkofD.vse, trim: tkofD.trim,
      req_rw: tkofD.req_rw,
      rvsm: { pri1: tkofD.rvsm1, sby: tkofD.rvsm_sby, pri2: tkofD.rvsm2 },
      lmc: { lb: tkofD.lmc_lb, kg: tkofD.lmc_kg },
    } : null;
    const frLanding = lndD ? {
      icao: lndD.icao, rwy: arrRwy, rwy_len: lndD.manual_len,
      atis: lndD.arr_atis, qnh: lndD.qnh, rwy_cond: lndD.rwy_cond,
      req_lnd: lndD.req_lnd, actual_lw: lndD.actual_lw, vref: lndD.vref,
      is_divert: lndD.is_divert === "true",
    } : null;
    const frFuel = fuelD ? {
      fob: fuelD.fob, density: fuelD.density,
      uplift_lt: fuelD.uplift_lt, uplift_lb: fuelD.uplift_lb,
      plan_trip: plan.trip_fuel, plan_alternate: plan.alternate_fuel,
      plan_reserve: plan.reserve_fuel, plan_fob: plan.fob,
    } : null;
    const frRass = rassD ? {
      dep_reviewed_at: rassD.dep_reviewed_at,
      dest_reviewed_at: rassD.dest_reviewed_at,
      altn_reviewed_at: rassD.altn_reviewed_at,
    } : null;

    // regen modunda ARSIV VERISI DEGISMEZ (EASA) — sadece PDF yeniden uretilir
    if (!regenOnly) {
    const frBody: Record<string, unknown> = {
      plan_id: String(planId),
      pf_id: pfPilot, pm_id: pmPilot,
      pf_name: crew.pf.name, pm_name: crew.pm.name,
      off_block: offBlock, takeoff_time: takeoffTime,
      landing_time: landingTime, on_block: onBlock,
      takeoff_fuel: toFuel, remaining_fuel: remFuel,
      pax: paxIn ?? num(plan.pax),
      block_minutes: blockMinutes, airborne_minutes: airborneMinutes,
      dep_icao: plan.dep, dest_icao: destIcao,
      is_divert: isDivert, divert_reason: divertReason,
      navlog: navlogJson.length ? navlogJson : null,
      wx: Object.values(wxMap),
      crew,
      takeoff: frTakeoff,
      landing: frLanding,
      fuel: frFuel,
      rass: frRass,
      mandatory: mandD ? {
        checks: mandD.checks, signed_by: mandD.signed_by,
        signature_url: mandD.signature_url, signed_at: mandD.signed_at,
      } : null,
      accept: acceptD ? {
        accepted: acceptD.accepted, pic_id: acceptD.pic_id,
        signature_url: acceptD.signature_url, signed_at: acceptD.signed_at,
      } : null,
      documents: docRows.length ? docRows : null,
      ac_hours: acHours,
      // UCUSUN MODUL KONFIGURASYONU — ILK ARSIVDE DONAR, REGEN BUNU OKUR.
      // iPad kopya gondermediyse (eski surum) arsiv anindaki canli ayar
      // dondurulur: o an ucus zaten o ayarla bitmistir, yarin degisse bile
      // rapor artik kaymaz. `features_source` hangisinin oldugunu soyler.
      features_snapshot: featuresAtArchive,
      features_source: featuresSource,
      archived_at: new Date().toISOString(),
    };

    let { error: frErr } = await admin.from("flt_report")
      .upsert(frBody, { onConflict: "plan_id" });

    // GOC KOSULMADAN DEPLOY EDILDIYSE: `flt_report` satiri HIC yazilmaz, 11b
    // raporu bulamaz ve PDF URETILMEZ. Daha kotusu kalicidir — REGEN de
    // `flt_report`a yazmaz, yani o ucusun raporu bir daha uretilemez.
    // Rapor kaybetmektense konfigurasyon kaydini kaybederiz: iki yeni kolon
    // dusurulup tekrar denenir. SESSIZ DEGIL — hem sunucu logunda hata olarak
    // gorunur hem de raporun alt bilgisinde "config not recorded" yazar (kaynak
    // NULL kalir), yani kagit uzerinde de belli olur (Ilke 1).
    if (frErr && /features_snapshot|features_source/.test(frErr.message ?? "")) {
      console.error("[archive] MIGRATION MISSING (20260812_flt_report_features_snapshot):",
                    frErr.message, "— retrying without config columns");
      delete frBody.features_snapshot;
      delete frBody.features_source;
      ({ error: frErr } = await admin.from("flt_report")
        .upsert(frBody, { onConflict: "plan_id" }));
    }
    if (frErr) console.warn("[archive] flt_report:", frErr.message);
    }

    // ── 11a) FLT_REPORT ONARIMI — BOSLARI TAMAMLA, DOLUYU ASLA EZME ─────────
    // 9 Agu 2026 saha (LTAC-EGLF). 4 Agu'da `archived_flights` icin ayni yamayi
    // koymustuk; EKSIK kalmisti: `flt_report`a dokunmuyordu. Rapor PDF'i
    // `flt_report`tan uretildigi icin hata KALICI oluyordu — ikinci arsiv cagrisi
    // arsiv saatlerini onariyor, PDF hala bos `flt_report`tan basiliyordu.
    // REGEN REPORT bile duzeltemiyordu, cunku regen `flt_report` upsert'ini
    // bilerek atlar ("regen arsiv verisini degistirmez", EASA).
    //
    // Kural `archived_flights` yamasiyla BIREBIR AYNI: yalniz BOS alan doldurulur,
    // dolu alana ASLA yazilmaz — duzeltme yolu admin EDIT'tir (gerekceli, izli).
    // Bu adim REGEN DAHIL her yolda kosar: bayat ayna sonradan tazelendiginde
    // rapor kendi kendini toparlar, elle mudahale gerekmez.
    await repairFltReport();

    /** Kayitli rapor satirinin BOS alanlarini guncel ayna verisiyle doldurur.
     *  Doner: doldurulan alanlarin adlari (denetim izine yazilir; sessiz onarim
     *  YOK — Ilke 1, sistem yaptigi duzeltmeyi soyler). */
    async function repairFltReport(): Promise<string[]> {
      // TIP NOTU (21 Agu): supabase-js `maybeSingle()` donusunu
      // `Row | GenericStringError` birlesimi olarak yaziyor; kolon okumalari
      // `deno check`te patliyordu. Calisma zamaninda etkisi yok ama KAPI hep
      // kirmizi kalirsa sinyal olmaktan cikar (eslint bayragi dersi) — satir
      // acikca `any` yaziliyor.
      const { data: cur }: { data: any } = await admin.from("flt_report")
        .select("off_block, takeoff_time, landing_time, on_block, takeoff_fuel," +
                " remaining_fuel, block_minutes, airborne_minutes, navlog")
        .eq("plan_id", planId).maybeSingle();
      if (!cur) return [];

      const patch: Record<string, unknown> = {};
      const fillBlank = (col: string, val: unknown) => {
        if (cur[col] == null && val != null) patch[col] = val;
      };
      fillBlank("off_block", offBlock);
      fillBlank("takeoff_time", takeoffTime);
      fillBlank("landing_time", landingTime);
      fillBlank("on_block", onBlock);
      fillBlank("takeoff_fuel", toFuel);
      fillBlank("remaining_fuel", remFuel);
      fillBlank("block_minutes", blockMinutes);
      fillBlank("airborne_minutes", airborneMinutes);
      // MODUL BLOKLARI (9 Agu 2026): onarim once yalniz navlog + saatleri
      // kapsiyordu, bu YETMEDI. 09 AUG kaydinda `landing` blogu komple NULL
      // kaldi (inis verisi ucak modunda girilmisti, kuyruktan arsivden SONRA
      // dustu) ve raporda LANDING karti HIC cikmadi — veri `lnd_data`da
      // sapasaglam dururken. Ayni sekilde T/O yakiti da bostu.
      // Blok NULL ise ve elimizde varsa doldurulur; DOLU bloga dokunulmaz.
      fillBlank("landing", frLanding);
      fillBlank("takeoff", frTakeoff);
      fillBlank("fuel", frFuel);
      fillBlank("rass", frRass);
      fillBlank("crew", crew);
      fillBlank("wx", Object.values(wxMap).length ? Object.values(wxMap) : null);
      fillBlank("documents", docRows.length ? docRows : null);
      fillBlank("ac_hours", acHours);

      // NAVLOG: yalnizca BILGI EKLEYEN iki durumda yenilenir. Ikisi de "bos alani
      // doldur" tanimina girer; mevcut gercek degerin uzerine ASLA yazilmaz.
      //   (a) kayitli kopyada hic gercek deger yok, elimizde var  -> bayat ayna
      //   (b) kayitli kopya `note` alanini hic tasimiyor, elimizde not var
      //       -> eski surumle yazilmis rapor (notlar zinciri 9 Agu'da eklendi)
      const countActuals = (rows: any[]) =>
        rows.filter((r) => r && (r.ata != null || r.fuel_actual != null)).length;
      const stored: any[] = Array.isArray(cur.navlog) ? cur.navlog : [];
      const storedActuals = countActuals(stored);
      const freshActuals  = countActuals(navlogJson);
      // ESKI SEMA TESPITI: rapor satirlari 9 Agu'da iki alan kazandi (`note`,
      // `fl`/`fl_actual`). Eski bir raporda bu ANAHTARLAR HIC YOK — degeri null
      // olan bir satirla karistirilmamali, o yuzden "in" ile bakiyoruz.
      const storedHasNoteField = stored.some((r) => r && "note" in r);
      const storedHasFlField   = stored.some((r) => r && "fl_actual" in r);
      const weHaveNotes = navlogJson.some((r) => r.note != null);
      const weHaveFL    = navlogJson.some((r) => r.fl != null || r.fl_actual != null);
      // GERI ADIM YASAK: yenileme yalniz BILGI EKLIYORSA yapilir. `freshActuals`
      // kontrolu olmadan not-yenilemesi, ayna o an daralmissa (plan deaktive/
      // yeniden aktive edilmis olabilir) dolu bir raporu daha zayif bir kopyayla
      // degistirebilirdi — onarim rutini yeni bir kayip kaynagi olmamali.
      if (navlogJson.length && freshActuals >= storedActuals &&
          ((navHasActuals && storedActuals === 0) ||
           (weHaveNotes && !storedHasNoteField) ||
           (weHaveFL && !storedHasFlField))) {
        patch.navlog = navlogJson;
      }

      // NOT: `patch` bos olsa bile DEVAM EDILIR — `archived_flights` (admin
      // panelinin okudugu yuzey) ayri ayri bos kalmis olabilir. Erken donmek,
      // raporu tam ama paneli bos birakirdi.
      if (Object.keys(patch).length) {
        const { error } = await admin.from("flt_report").update(patch).eq("plan_id", planId);
        if (error) console.warn("[archive] flt_report repair:", error.message);
      }

      // navlog_entries AYNI bayat kopyadan yazilmisti. Iki denetim yuzeyi
      // birbiriyle celismemeli (Ilke 2) — rapor onarildiysa tablo da onarilir.
      if (patch.navlog && wpts.length) {
        const { count } = await admin.from("navlog_entries")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", planId).not("ata", "is", null);
        if (!count) {
          const rows = navlogJson.map((r, i) => ({
            plan_id: String(planId),
            wpt_uid: wpts[i]?.uid ?? null, wpt_name: r.wpt, wpt_type: r.type,
            eta: r.eta, ata: r.ata, fuel_plan: r.fuel_plan, fuel_actual: r.fuel_actual,
            rvsm: r.rvsm, note: r.note, seq: i,
          }));
          await admin.from("navlog_entries").delete().eq("plan_id", planId);
          const { error: neErr } = await admin.from("navlog_entries").insert(rows);
          if (neErr) console.warn("[archive] navlog_entries repair:", neErr.message);
        }
      }

      // ── ARSIV KOLONLARI DA ONARILIR (9 Agu 2026) ──────────────────────────
      // Admin panelinin okudugu `archived_flights` de ayni yaristan etkilendi:
      // 09 AUG'da arr_rwy / arr_atis / vref / actual_lw / req_landing_dist /
      // arr_qnh / rwy_condition ve iki yakit kolonu NULL kaldi — `lnd_data`
      // ve NavLog'da degerler dururken panel bos gosterdi.
      // Ayni disiplin: yalniz BOS kolon doldurulur, doluya ASLA yazilmaz.
      const afPatch: Record<string, unknown> = {};
      const { data: curAf }: { data: any } = await admin.from("archived_flights")
        .select("takeoff_fuel, remaining_fuel, dep_rwy, sid, dep_atis, arr_rwy," +
                " arr_atis, arr_qnh, rwy_condition, req_landing_dist, actual_lw, vref")
        .eq("plan_id", planId).maybeSingle();
      if (curAf) {
        const fillAf = (col: string, val: unknown) => {
          if (curAf[col] == null && val != null) afPatch[col] = val;
        };
        fillAf("takeoff_fuel", toFuel);
        fillAf("remaining_fuel", remFuel);
        fillAf("dep_rwy", depRwy);
        fillAf("sid", tkofD?.sid ?? null);
        fillAf("dep_atis", tkofD?.dep_atis ?? null);
        fillAf("arr_rwy", arrRwy);
        fillAf("arr_atis", lndD?.arr_atis ?? null);
        fillAf("arr_qnh", num(lndD?.qnh));
        fillAf("rwy_condition", lndD?.rwy_cond ?? null);
        fillAf("req_landing_dist", num(lndD?.req_lnd));
        fillAf("actual_lw", num(lndD?.actual_lw));
        fillAf("vref", num(lndD?.vref));
        if (Object.keys(afPatch).length) {
          const { error: afErr2 } = await admin.from("archived_flights")
            .update(afPatch).eq("plan_id", planId);
          if (afErr2) console.warn("[archive] archived_flights repair:", afErr2.message);
        }
      }

      const cols = [...Object.keys(patch), ...Object.keys(afPatch).map(c => "af." + c)];
      // Onaracak bir sey yoktuysa iz de yazilmaz — her REGEN'de bos bir
      // "onarildi" satiri dusmesi izi kirletir ve gercek onarimi gizler.
      if (!cols.length) return [];
      await admin.from("flight_logs").insert({
        plan_id: planId, pilot_id: callerId, action: "REPORT_REPAIRED",
        details: {
          fields: cols.join(", "),
          reason: "record was written before the module mirrors reached the server",
        },
      });
      console.log("[archive] repaired:", cols.join(", "));
      return cols;
    }

    // ── 11b) RAPOR PDF (sunucuda uretilir — web + iOS ayni dosyayi gosterir) ──
    let reportPath: string | null = null;
    try {
      // flt_report'u geri oku (upsert edilmis hali — tek kaynak)
      const { data: frRow } = await admin.from("flt_report")
        .select("*").eq("plan_id", planId).single();

      if (frRow) {
        // ── RAPORUN KONFIGURASYONU ────────────────────────────────────────
        // ILK ARSIV: yukarida upsert edildigi icin `frRow` zaten donmus kopyayi
        // tasir. REGEN: upsert atlanir, kayittaki eski kopya okunur — raporun
        // bugunku ayardan ETKILENMEMESININ tek sebebi budur.
        //
        // KAYIT YOKSA (bu gocten once arsivlenmis ucus) rapor HICBIR bolumu
        // budamaz — canliya DUSULMEZ. Sebep: canliya dusmek REGEN'de gecmis
        // rapordan satir dusurmek demektir, duzeltmeye calistigimiz kusurun ta
        // kendisi. Budamamak en fazla bos bir satir bastirir; budamak denetim
        // izinden veri siler (Ilke 3 + Kural 8: belirsizlik = ACIK).
        const featForReport: Record<string, boolean> =
          (frRow.features_snapshot as Record<string, boolean> | null) ?? {};
        const featSourceForReport: string | null = frRow.features_source ?? null;
        if (regenOnly && !featSourceForReport) {
          console.warn("[archive] regen without recorded config — nothing pruned:", planId);
        }

        // Imza PNG'lerini indir
        const sigs: Record<string, Uint8Array> = {};
        for (const sp of [frRow.mandatory?.signature_url, frRow.accept?.signature_url]) {
          if (!sp) continue;
          const { data: blob } = await admin.storage.from("efb-documents").download(sp);
          if (blob) sigs[sp] = new Uint8Array(await blob.arrayBuffer());
        }

        // Ek PDF belgeleri indir (orijinal sayfa olarak eklenecek)
        // DIKKAT: regen'de onceki RAPOR da docRows'ta gorunur — kendini eklemesin.
        const atts: { name: string; bytes: Uint8Array }[] = [];
        const photos: { name: string; category: string; bytes: Uint8Array }[] = [];
        for (const d of docRows) {
          if ((d as any).section === "REPORT") continue;
          const mt = d.mime_type ?? "";
          const { data: blob } = await admin.storage.from("efb-documents").download(d.file_path);
          if (!blob) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (mt.includes("pdf")) atts.push({ name: d.file_name, bytes });
          // 31 Tem saha bulgusu (tek booklet): resim formatli belgeler de rapora girer
          else if (mt.startsWith("image/")) {
            photos.push({ name: d.file_name, category: (d as any).section ?? "DOCUMENT", bytes });
          }
        }
        // FOTO KATEGORILERI (efb_documents satiri olmayan Storage fotolari):
        // ATIS/DCL/fuel receipt fotolari rapora SAYFA olarak gomulur (tek booklet).
        // Imzalar haric — onlar rapor icinde zaten cizili.
        // DIKKAT (31 Tem saha): iOS plan_id'yi BUYUK harf gonderir, Storage
        // klasorleri kucuk harflidir — listeleme MUTLAKA lowercase ile yapilir
        // (buyukle bos donuyordu, fotolar rapora hic girmiyordu).
        const pidLower = String(planId).toLowerCase();
        for (const cat of ["fuel_receipt", "tkof_atis", "tkof_dcl", "lnd_atis"]) {
          const { data: files } = await admin.storage.from("efb-documents")
            .list(`${pidLower}/${cat}`);
          for (const f of files ?? []) {
            const { data: blob } = await admin.storage.from("efb-documents")
              .download(`${pidLower}/${cat}/${f.name}`);
            if (blob) photos.push({ name: f.name, category: cat,
                                    bytes: new Uint8Array(await blob.arrayBuffer()) });
          }
        }

        // Duzeltmeler (yalniz regen'de olusmus olabilir): admin_edits -> PDF gorsel katmani.
        // Orijinal deger ustu cizili + yesil yeni deger + AMENDMENTS annex.
        let amendments: any[] = [];
        {
          const { data: ed } = await admin.from("admin_edits")
            .select("field_name,old_value,new_value,reason,created_at")
            .eq("plan_id", planId).eq("edit_type", "EDIT")
            .order("created_at", { ascending: true });
          amendments = ed ?? [];
        }

        // FTL PROPAGASYONU RAPORDAN ONCE (6 Agu 2026) — bkz. 14. adimdaki not.
        // Rapor kayitli degeri bastigi icin once kayit guncel olmali.
        ftlResult = ftlEnabled ? await propagateFtl() : { ftlUpdate: {}, dutyRows: {} };

        const pdfBytes = await buildReportPdf({
          fr: frRow, plan, signatures: sigs, attachments: atts, amendments, photos,
          duties: ftlResult.dutyRows, ftlStatus: ftlResult.ftlUpdate, ftlEnabled,
          features: featForReport, featuresSource: featSourceForReport,
        });

        const fname = `GO2_FltReport_${plan.reg ?? "AC"}_${plan.dep ?? ""}-${destIcao ?? ""}_${isoDate}.pdf`
          .replace(/\s+/g, "");
        reportPath = `${planId}/report/${fname}`;

        const { error: upErr } = await admin.storage.from("efb-documents")
          .upload(reportPath, pdfBytes, { contentType: "application/pdf", upsert: true });

        if (upErr) {
          console.warn("[archive] report pdf upload:", upErr.message);
          reportPath = null;
        } else {
          // efb_documents'a REPORT olarak kaydet (web + iOS ayni akisla erisir)
          await admin.from("efb_documents").delete()
            .eq("plan_id", planId).eq("section", "REPORT");
          const { error: docErr } = await admin.from("efb_documents").insert({
            plan_id: planId,
            section: "REPORT", file_name: fname, file_path: reportPath,
            mime_type: "application/pdf", file_size: pdfBytes.byteLength,
            uploaded_by: callerId, uploaded_at: new Date().toISOString(),
            archived_flight_id: afId, status: "CURRENT",
          });
          if (docErr) console.warn("[archive] report doc insert:", docErr.message);
        }
      }
    } catch (e) {
      console.warn("[archive] report pdf:", String(e));
    }

    // ── 12) Belgeleri arsive bagla ──────────────────────────────────────────
    if (docRows.length) {
      await admin.from("efb_documents")
        .update({ archived_flight_id: afId }).eq("plan_id", planId);
    }

    // ── 13) Plan durumu + audit log ─────────────────────────────────────────
    if (!regenOnly) {
      await admin.from("plans")
        .update({ status: "archived", archived_at: new Date().toISOString() })
        .eq("id", planId);
    }

    if (!regenOnly) await admin.from("flight_logs").insert({
      plan_id: planId, pilot_id: callerId, action: "FLIGHT_ARCHIVED",
      details: {
        dep: plan.dep, dest: destIcao, is_divert: isDivert,
        block_minutes: blockMinutes, airborne_minutes: airborneMinutes,
        landing_count: cyclesIn, dep_rwy: depRwy, arr_rwy: arrRwy,
        archived_by: prof?.full_name ?? callerId,
      },
    });

    // BAYAT AYNAYLA ARSIVLENDI (9 Agu 2026): waypoint listesi var ama HICBIR
    // gercek saat/yakit yok. Ucus PreArchiveCheck'ten gectigine gore veri
    // TABLETTE vardir — sunucudaki kopya bayattir. Bunu sessiz gecmek Ilke 1
    // ihlali olur: denetci raporu bos gorup "pilot girmemis" diye okur.
    // Kayit acikca boyle bir arsivin uzerine yazilir; 11a onarimi calistiginda
    // ayrica REPORT_REPAIRED satiri duser, ikisi birlikte hikayeyi anlatir.
    if (!regenOnly && wpts.length && !navHasActuals) {
      await admin.from("flight_logs").insert({
        plan_id: planId, pilot_id: callerId, action: "ARCHIVE_NAVLOG_MISSING",
        details: {
          waypoints: String(wpts.length),
          reason: "navlog_data mirror on server had no actual times or fuel at archive time",
          archived_by: prof?.full_name ?? callerId,
        },
      });
      console.warn("[archive] navlog mirror stale — archived with empty navlog:", planId);
    }

    // ── 14) FTL: actual saatleri crew_duties'e isle ──────────────────────────
    // Eslestirme kurali (tasarim): (1) tarih, (2) DEP/DEST, (3) saat yakinligi —
    // ayni gun ayni sektor iki kez ucildiysa actual, ETD'ye en yakin ve henuz
    // actual almamis sektore yazilir. Belirsizse SESSIZCE YAZMA → match_review.
    // duty_finished: iOS End Flt "DUTY FINISHED?" cevabi (body.duty_finished);
    // gelmezse gorev ACIK kalir (status='open') — kapatma karari pilotundur.
    // REGEN'DE DE KOSAR (2 Agu 2026, Serkan kurali): blok saatlerinin TEK KAYNAGI
    // arsivlenmis ucustur; FTL paneli off/on block'a dokunmaz. Dolayisiyla admin
    // arsivde saati duzeltince duzeltmenin crew_duties'e YANSIMASI sart — aksi
    // halde FDP/duty_end/min_rest/earliest_next_report eski saatte kalir ve
    // duzeltmenin baska yolu da olmaz (panel o alanlari duzenlemiyor).
    // Eskiden bu adim `!regenOnly` ile korunuyordu: duzeltme PDF'e giriyor, FTL'e
    // GIRMIYORDU. Adim artik "ilk kez actual gordum" degil "guncel actual'i
    // senkronla" mantiginda — ayni saatlerle tekrar kosarsa ayni sonucu yazar.
    // ── SIRA (6 Agu 2026): bu adim RAPORDAN ONCE kosar ────────────────────────
    // Rapor artik kendi FDP'sini hesaplamiyor, crew_duties'teki KAYITLI degeri
    // basiyor (K-2 kapandi). Dolayisiyla once gorev guncellenmeli, sonra PDF
    // uretilmeli — aksi halde rapor bir onceki durumu basar ve ozellikle REGEN
    // yolunda (admin saat duzeltmesi) rapor duzeltmeden ONCEKI degeri gosterir.
    // `function` bildirimi HOISTED oldugu icin 11. bolumden cagrilabiliyor;
    // 130 satirlik blogu tasimak yerine yerinde birakildi (diff okunur kalsin).
    // Donen: {ftlUpdate, dutyRows} — dutyRows dogrudan rapora gider, PDF'in
    // veritabanini ikinci kez okumasina gerek kalmaz (yaris ihtimali de yok).
    /** ── PAKET (BUNDLE) BACAKLARI ────────────────────────────────────────
     *  Biz havayolu gibi "planla → uç → kaydet → arşivle" akışıyla uçmuyoruz
     *  (Serkan, 6 Ağu). Uçuş önce olur, kayıt sonra gelir; dispatch her zaman
     *  ofiste olmayabilir, sistem çökmüşken de uçulur. Bu yüzden GÜNÜN ŞEKLİNİ
     *  görev atamasından değil, ELDEKİ PLAN PAKETİNDEN öğreniriz: 4 bacaklık
     *  bir paket ayrıştırıldıysa o günün 4 bacaklı olduğu ZATEN bilinir.
     *
     *  Paket kimliği: `dispatch_no`'nun `-S<n>` eki SEKTÖR numarasıdır
     *  (TC-REC-10Jul2026-S1 / -S2). Ek atılınca paket anahtarı kalır; eksiz
     *  tek bacaklı paketlerde dispatch_no'nun kendisi anahtardır. Aynı gün +
     *  aynı tescil + aynı müşteri şartı da aranır (farklı paketler karışmasın).
     *
     *  NEDEN ÖNEMLİ: azami UGS SEKTÖR SAYISINA bağlıdır (Md.22 Tablo 1) ve
     *  sektörü EKSİK saymak limiti OLDUĞUNDAN BÜYÜK gösterir — gevşek, yani
     *  emniyetsiz yön. Rapordan söktüğüm "sectors: 1" kusurunun aynısını
     *  türetmede tekrarlamamak için bacaklar buradan gelir. */
    async function bundleLegs(): Promise<any[]> {
      try {
        const dn = String((plan as any).dispatch_no ?? "");
        if (!dn) return [plan];
        const key = dn.replace(/-S\d+$/i, "");
        const { data } = await admin.from("plans")
          .select("id,dispatch_no,dep,dest,date,std,eta,reg,fms_ident,operation_type,operation_type_source")
          .eq("customer_id", plan.customer_id).eq("date", plan.date);
        const sibs = (data ?? []).filter((p: any) =>
          String(p.dispatch_no ?? "").replace(/-S\d+$/i, "") === key &&
          String(p.reg ?? "") === String(plan.reg ?? ""));
        if (!sibs.length) return [plan];
        // Bacak sırası STD'ye göre; STD yoksa dispatch_no eki, o da yoksa kayıt sırası.
        const sn = (p: any) => Number(String(p.dispatch_no ?? "").match(/-S(\d+)$/i)?.[1] ?? 0);
        return sibs.sort((a: any, b: any) => {
          const ta = hmNum(a.std), tb = hmNum(b.std);
          if (ta != null && tb != null && ta !== tb) return ta - tb;
          return sn(a) - sn(b);
        });
      } catch { return [plan]; }
    }
    const hmNum = (s: string | null | undefined): number | null => {
      const m = String(s ?? "").match(/(\d{1,2}):?(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };

    /** Planlama atlanmis: gorevi UCUSTAN turetir (auto_created).
     *  Elde olanlar: DEP/DEST, off/on block, pilot, rol, tarih, plan_id ve
     *  planin faaliyet tipi. Rapor saati kuraldan turetilir (off block − rapor
     *  suresi), tipki planli gorevlerde oldugu gibi.
     *  UYDURMA YOK: musterinin ruleset'i yoksa gorev acilmaz (Ilke 1) — yanlis
     *  kural setiyle acilmis bir gorev, hic olmayandan kotudur. */
    async function deriveDutyFromFlight(pid: string): Promise<any | null> {
      try {
        const { data: cust } = await admin.from("customers")
          .select("ftl_ruleset_id").eq("id", plan.customer_id).single();
        if (!cust?.ftl_ruleset_id) return null;
        const { data: rs } = await admin.from("ftl_rulesets")
          .select("*").eq("id", cust.ftl_ruleset_id).single();
        if (!rs) return null;
        const { rules, company } = effectiveRules(rs);
        // Kalkis meydaninin dilimi — rapor/dinlenme penceresi buna gore.
        const { data: apt } = await admin.from("airports")
          .select("icao,tz").in("icao", [plan.dep, destIcao].filter(Boolean));
        const tzOf = (i: string) => apt?.find((a: any) => a.icao === i)?.tz ?? null;
        const depTz = tzOf(plan.dep), destTz = tzOf(destIcao);
        const offISO = ts(offBlock, isoDate), onISO = ts(onBlock, isoDate);
        if (!offISO || !onISO) return null;
        const preMin = Math.max(company.preFlightReportMin ?? 60,
                                rules.notification_times?.preflight_report_min ?? 60);
        const postMin = Math.max(company.postFlightDutyMin ?? 30,
                                 rules.notification_times?.postflight_min ?? 30);
        const reportISO = new Date(new Date(offISO).getTime() - preMin * 60000).toISOString();
        const endISO = new Date(new Date(onISO).getTime() + postMin * 60000).toISOString();
        const repLocal = depTz
          ? Object.values(Object.fromEntries(new Intl.DateTimeFormat("en-US",
              { timeZone: depTz, hour12: false, hour: "2-digit", minute: "2-digit" })
              .formatToParts(new Date(reportISO)).map((p: any) => [p.type, p.value])))
              .slice(0, 2).join(":")
          : new Date(reportISO).toISOString().slice(11, 16);
        const singlePilot = [pfPilot, pmPilot, crzPilot].filter(Boolean).length === 1;
        const opType = (plan as any).operation_type ?? null;
        const role = pid === pfPilot ? "PF" : pid === pmPilot ? "PM" : "CRZ CPT";

        // ── GÜNÜN ŞEKLİ: SEKTÖRLER PAKETTEN ──────────────────────────────
        // "DUTY FINISHED?" cevabı burada bir PLANLAMA girdisidir:
        //   HAYIR (devam ediyor) → paketin kalan bacakları da UÇULACAK demektir;
        //     sektör olarak eklenir ki azami UGS DOĞRU sektör sayısıyla hesaplansın.
        //     (Yalnız uçulanı saymak limiti olduğundan büyük gösterir = gevşek yön.)
        //   EVET (bitti)        → kalanlar uçulmadı; görev bu bacakla kapanır.
        //   CEVAP YOK           → BİLMİYORUZ: bacak UYDURULMAZ (İlke 1), görev
        //     açık kalır; sonraki bacak arşivlenince kendini ekler ve azami UGS
        //     o anda yeniden hesaplanır.
        const legs = await bundleLegs();
        const thisIdx = Math.max(0, legs.findIndex((l: any) => String(l.id) === String(planId)));
        const useLegs = dutyFinishedIn === false ? legs : [legs[thisIdx] ?? plan];
        const sectorsOut = useLegs.map((l: any, i: number) => {
          const isThis = String(l.id) === String(planId);
          return {
            seq: i + 1, dep: l.dep, dest: l.dest,
            etd: isThis ? offBlock : (l.std ?? null), eta: isThis ? onBlock : (l.eta ?? null),
            role, plan_id: l.id,
            ...(isThis ? { off_block: offBlock, on_block: onBlock,
                           ...(isDivert ? { actual_dest: destIcao } : {}) } : {}),
          };
        });
        const maxFdp = opType
          ? maxFdpMinutes(repLocal, sectorsOut.length, rules, { operationType: opType, singlePilot })
          : null;
        const fdpMin = Math.round(
          (new Date(onISO).getTime() - new Date(reportISO).getTime()) / 60000);
        const dutyMin = fdpMin + postMin;
        const home = (await admin.from("home_bases").select("icao")
          .eq("pilot_id", pid).maybeSingle()).data?.icao ?? null;
        const atBase = !home || String(destIcao).toUpperCase() === String(home).toUpperCase();
        const minRest = Math.max(dutyMin, atBase
          ? (rules.min_rest?.home_base_min ?? 720) : (rules.min_rest?.out_of_base_min ?? 600));
        const row = {
          customer_id: plan.customer_id, pilot_id: pid, duty_type: "flight",
          duty_date: isoDate, report_time: reportISO, report_tz: depTz, duty_end: endISO,
          // Gerceklesmis ucus: gorev ACIK degil, OLMUS bitmis. duty_finished
          // cevabi geldiyse ona uyulur; gelmediyse gorev acik birakilir
          // (kapatma karari pilotundur — planli gorevlerdeki kuralin aynisi).
          status: dutyFinishedIn === true ? "actual" : "open",
          duty_finished: dutyFinishedIn === true,
          auto_created: true,
          sectors: sectorsOut,
          plan_ids: [...new Set(sectorsOut.map((s: any) => s.plan_id).filter(Boolean))],
          ruleset_id: rs.id,
          ruleset_snapshot: { regulation: rs.regulation, company: rs.company },
          // İNTİBAK (Md.22/1): türetilen görev zincirin İLK halkası olabilir de
          // olmayabilir de. Burada önceki görevin referansını çözecek TAM bağlam
          // yok (dinlenme yeri/ana üs zinciri panelde çözülüyor) — bu yüzden
          // UYDURMUYORUZ: kalkış meydanı yazılır, bu "ilk görev" halinin doğru
          // cevabıdır ve zincir varsa panel EDIT'te düzeltilir. Yanlış bir
          // referans yazmaktansa en muhafazakâr doğru olanı yazarız.
          acclimatised_to: plan.dep ?? null,
          ...(opType ? { operation_type: opType,
                         operation_type_source: `derived at archive from plan ${planId}`
                           + ((plan as any).operation_type_source ? ` — ${(plan as any).operation_type_source}` : "") }
                     : {}),
          max_fdp_minutes: maxFdp, fdp_minutes: fdpMin,
          fdp_exceeded: maxFdp != null && fdpMin > maxFdp,
          min_rest_minutes: minRest,
          earliest_next_report: new Date(new Date(endISO).getTime() + minRest * 60000).toISOString(),
          ...(destTz ? {} : {}),
        };
        const { data: ins, error } = await admin.from("crew_duties")
          .insert(row).select("*").single();
        if (error) { console.warn("[archive] derive duty:", error.message); return null; }
        return ins;
      } catch (e) { console.warn("[archive] derive duty:", String(e)); return null; }
    }

    /** Azami UGS'yi GOREVIN KENDI snapshot'iyla yeniden hesaplar.
     *  NEDEN GEREKLI: azami UGS sektor SAYISINA bagli (Md.22 Tablo 1). Bacak
     *  sonradan eklenirse (plan yokken ucup sonra kaydetmek, ya da pakete
     *  bacak katilmasi) eski deger OLDUGUNDAN BUYUK kalir — ihlal gorunmez.
     *  "Illegalite olmasin, saatler yeter" (Serkan): saatler dogruysa limitin
     *  de dogru olmasi sart, yoksa asim tespit edilemez.
     *  Nobet (Md.17) kisaltmasi ve SKPK (Md.12) uzatmasi KAYITLI olduklari icin
     *  yeni taban degerin uzerine aynen tasinir. Hesaplanamazsa null doner ve
     *  cagiran eski degere DOKUNMAZ (sayi uydurmaktansa dokunmamak). */
    function recomputeMaxFdp(duty: any, sectorCount: number, opType: string | null,
                             singlePilot: boolean): number | null {
      try {
        if (!duty?.ruleset_snapshot?.regulation || !duty.report_time || !opType) return null;
        const { rules } = effectiveRules(duty.ruleset_snapshot);
        const rt = new Date(duty.report_time).getTime();
        const parts = duty.report_tz
          ? Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: duty.report_tz,
              hour12: false, hour: "2-digit", minute: "2-digit" })
              .formatToParts(new Date(rt)).map((p: any) => [p.type, p.value]))
          : null;
        const repLocal = parts ? `${parts.hour}:${parts.minute}`
          : new Date(rt).toISOString().slice(11, 16);
        const base = maxFdpMinutes(repLocal, sectorCount, rules,
          { operationType: opType, singlePilot });
        if (base == null) return null;
        return Math.max(0, base - (duty.standby_reduction_min ?? 0))
             + (duty.skpk_fdp_extension_min ?? 0);
      } catch { return null; }
    }

    async function propagateFtl(): Promise<{ ftlUpdate: Record<string, string>; dutyRows: Record<string, any> }> {
    const ftlUpdate: Record<string, string> = {};
    const dutyRows: Record<string, any> = {};
    if (offBlock && onBlock) {
      const hm = (s: string | null) => {
        if (!s) return null;
        const m = String(s).match(/(\d{1,2}):?(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };
      const offMin = hm(offBlock);
      // CRZ CPT de tam ekip uyesidir (4 Agu) — saatleri/penceresi ayni sekilde islenir.
      for (const pid of [pfPilot, pmPilot, crzPilot].filter(Boolean)) {
        try {
          // 'actual' gorevler de aday: DUZELTME onlarin uzerinde calisir.
          // (Ilk eslestirme yolu zaten `!s.off_block` sartiyla korunuyor, yani
          //  kapanmis bir gorev yanlislikla ilk-eslesme olarak secilemez.)
          const { data: cands } = await admin.from("crew_duties")
            .select("*").eq("pilot_id", pid).eq("duty_type", "flight")
            .eq("duty_date", isoDate);
          // ── ARSIVDEN GOREV TURETME (3 Agu kurali, Serkan) ────────────────
          // "Planlama safhasi atlanabiliyor — genel havacilikta ucuslar acele
          //  cikiyor. Gorev atanmamissa arsiv, gorevi UCUSTAN turetir."
          // Ayni gun o pilotun BASKA bir gorevi varsa YENI GOREV ACILMAZ,
          // sektor eklenir — yoksa FDP bacak basina hesaplanir ve olmasi
          // gerekenden KISA cikar (gevsek yon). Bu yuzden turetme yalniz
          // "o gun hic gorev yok" halinde calisir; digerini asagidaki
          // eslestirme zaten hallediyor.
          if (!cands?.length) {
            const derived = await deriveDutyFromFlight(pid);
            if (!derived) { ftlUpdate[pid] = "no_duty_found"; continue; }
            ftlUpdate[pid] = "auto_created";
            dutyRows[pid] = derived;
            continue;
          }

          type Cand = { duty: any; idx: number; dist: number };
          const matches: Cand[] = [];

          // ÖNCE DUZELTME YOLU: bu plana ZATEN bagli sektor var mi? Varsa saatler
          // guncellenmis demektir, eslestirme tahminine hic girmeyiz — hangi
          // sektor oldugu kesin (sektore `plan_id` yaziliyor, asagida).
          for (const duty of cands) {
            (duty.sectors ?? []).forEach((s: any, idx: number) => {
              // Gecmis satirlarda plan_id BUYUK harfli olabilir; normalize
              // edilmis planId ile karsilastirmak icin iki taraf da kucultulur.
              if (s.plan_id && String(s.plan_id).toLowerCase() === planId) {
                matches.push({ duty, idx, dist: -1 });
              }
            });
          }

          // Bulunamadiysa ILK ESLESTIRME: dep + planlanan dest, henuz actual yok
          if (!matches.length) {
            for (const duty of cands) {
              (duty.sectors ?? []).forEach((s: any, idx: number) => {
                // ZATEN BIR PLANA BAGLI sektor aday DEGIL — o baska bir ucusun
                // olculmus kaydidir, uzerine yazilmaz.
                // ELLE GIRILEN sektor (off_block var ama plan_id YOK) aday'dir:
                // app bozulup hard copy uculdugunda admin saatleri elle girer;
                // sonradan gercek arsiv gelirse OLCULEN deger elle girilenin
                // ustune yazar ("gerceklesen ucus her zaman ustune yazar").
                // Hic arsiv gelmezse elle girilen kayit olarak kalir.
                if (s.plan_id) return;
                if ((s.dep ?? "").toUpperCase() !== (plan.dep ?? "").toUpperCase()) return;
                if ((s.dest ?? "").toUpperCase() !== (plan.dest ?? "").toUpperCase()) return;
                const etd = hm(s.etd);
                const dist = etd != null && offMin != null
                  ? Math.min(Math.abs(etd - offMin), 1440 - Math.abs(etd - offMin)) : 9999;
                matches.push({ duty, idx, dist });
              });
            }
          }
          if (!matches.length) {
            // ── PLANLANMAMIS BACAK ────────────────────────────────────────
            // "Plan yapıldı uçuldu ok; uçuldu plan sonradan yapıldı o da ok"
            // (Serkan, 6 Ağu) — sistem iki sırayı da desteklemeli.
            // Bu bacak o günün hiçbir planlı sektörüyle eşleşmedi. İki hal var:
            //
            // (a) Gündeki AÇIK görevin bütün sektörleri zaten uçulmuş → planlı
            //     iş bitmiş, bu EK bir bacak. Serkan'ın 3 Ağu kuralı: "aynı gün
            //     mevcut görev varsa YENİ GÖREV AÇMA, SEKTÖR EKLE" — yoksa FDP
            //     bacak başına hesaplanır ve olduğundan kısa çıkar (gevşek yön).
            //     Sektör eklenince azami UGS YENİDEN HESAPLANIR: sektör sayısı
            //     limiti belirler, eski değer bırakılırsa ihlal görünmez.
            //
            // (b) Görevde HENÜZ UÇULMAMIŞ planlı sektör var ve bu bacak onunla
            //     eşleşmiyor → gerçekten BELİRSİZ (rota değişikliği mi, başka
            //     uçuş mu?). Eskisi gibi YAZMA, match_review. Buraya sektör
            //     eklemek uçulmamış planlı sektörü öksüz bırakır, görev asla
            //     tamamlanamaz.
            const open = cands.filter((d: any) => d.status !== "actual" && !d.duty_finished);
            const target = open.find((d: any) =>
              (d.sectors ?? []).length > 0 &&
              (d.sectors ?? []).every((s: any) => s.off_block && s.on_block));
            if (!target) {
              // (b) — ya belirsiz, ya da gündeki görevlerin hepsi KAPALI.
              const allClosed = open.length === 0;
              if (allClosed) {
                // Gorev kapanmis, sonra tekrar uculmus: bu YENI bir gorevdir.
                const derived = await deriveDutyFromFlight(pid);
                if (derived) { ftlUpdate[pid] = "auto_created_after_close"; dutyRows[pid] = derived; continue; }
              }
              await admin.from("crew_duties").update({ match_review: true })
                .in("id", cands.map(c => c.id));
              ftlUpdate[pid] = "match_review";
              continue;
            }
            // (a) — sektoru ekle, pencereyi yeniden kur.
            const role = pid === pfPilot ? "PF" : pid === pmPilot ? "PM" : "CRZ CPT";
            const secs = [...(target.sectors ?? []), {
              seq: (target.sectors?.length ?? 0) + 1, dep: plan.dep, dest: plan.dest,
              etd: offBlock, eta: onBlock, off_block: offBlock, on_block: onBlock,
              role, plan_id: planId, ...(isDivert ? { actual_dest: destIcao } : {}),
            }];
            const snapC = target.ruleset_snapshot?.company ?? {};
            const postMin = snapC.post_flight_duty_minutes ?? 30;
            const lastOn2 = ts(onBlock, isoDate);
            const upd2: Record<string, unknown> = {
              sectors: secs,
              plan_ids: [...new Set([...(target.plan_ids ?? []), planId])],
            };
            const single2 = [pfPilot, pmPilot, crzPilot].filter(Boolean).length === 1;
            const newMax = recomputeMaxFdp(target, secs.length, target.operation_type ?? null, single2);
            if (newMax != null) upd2.max_fdp_minutes = newMax;
            if (lastOn2 && target.report_time) {
              const endMs2 = new Date(lastOn2).getTime() + postMin * 60000;
              const fdp2 = Math.round(
                (new Date(lastOn2).getTime() - new Date(target.report_time).getTime()) / 60000);
              const eff2 = newMax ?? target.max_fdp_minutes;
              const minRest2 = Math.max(target.min_rest_minutes ?? 0, fdp2 + postMin);
              upd2.duty_end = new Date(endMs2).toISOString();
              upd2.fdp_minutes = fdp2;
              upd2.fdp_exceeded = eff2 != null && fdp2 > eff2;
              upd2.min_rest_minutes = minRest2;
              upd2.earliest_next_report = new Date(endMs2 + minRest2 * 60000).toISOString();
              if (dutyFinishedIn === true) { upd2.status = "actual"; upd2.duty_finished = true; }
            }
            const { error: e2 } = await admin.from("crew_duties").update(upd2).eq("id", target.id);
            ftlUpdate[pid] = e2 ? `error: ${e2.message}` : "sector_appended";
            if (!e2) dutyRows[pid] = { ...target, ...upd2 };
            continue;
          }
          matches.sort((a, b) => a.dist - b.dist);
          // belirsizlik: iki aday esit uzaklikta ve farkli gorevlerde → yazma
          if (matches.length > 1 && matches[0].dist === matches[1].dist &&
              matches[0].duty.id !== matches[1].duty.id) {
            await admin.from("crew_duties").update({ match_review: true })
              .eq("id", matches[0].duty.id);
            ftlUpdate[pid] = "match_review";
            continue;
          }

          const { duty, idx } = matches[0];
          const sectors = [...(duty.sectors ?? [])];
          sectors[idx] = {
            ...sectors[idx], off_block: offBlock, on_block: onBlock, plan_id: planId,
            ...(isDivert ? { actual_dest: destIcao } : {}),
          };
          const upd: Record<string, unknown> = {
            sectors,
            plan_ids: [...new Set([...(duty.plan_ids ?? []), planId])],
          };

          // ── FAALIYET TIPI ARSIVDE KESINLESIR (6 Agu 2026, Serkan sordu) ────
          // Atama aninda plan henuz olmayabilir (genel havacilikta ucus once
          // cikar, kayit sonra) — tip ya bos kalir ya VARSAYIMLA girer.
          // Ucus kapandiginda plan KESIN bilinir, dogru yer burasi.
          //   bos / varsayim        → arsiv yazar, kaynagi belirtir
          //   plandan gelmis, ayni  → dokunma
          //   MANUAL OVERRIDE, farkli → YAZMA, match_review (insan karari
          //                             sessizce ezilmez — ayni ilke: belirsiz
          //                             eslesmede de yazmiyoruz)
          const planOp = (plan as any).operation_type as string | null;
          const dutySrc = String(duty.operation_type_source ?? "");
          const isManual = /^manual override/i.test(dutySrc);
          const isAssumed = duty.operation_type == null
            || /ASSUMED|no matching flight plan/i.test(dutySrc);
          let opChangedTo: string | null = null;
          if (planOp && duty.operation_type !== planOp) {
            if (isManual) {
              upd.match_review = true;                 // insan dedi, arsiv itiraz ediyor
            } else if (isAssumed) {
              opChangedTo = planOp;
            } else {
              // Tip plandan gelmisti ama BASKA bir tip — sektorler farkli
              // faaliyetten olabilir. Sessizce degistirmek yerine isaretle.
              upd.match_review = true;
            }
          }
          if (opChangedTo) {
            upd.operation_type = opChangedTo;
            upd.operation_type_source =
              `resolved at archive from plan ${planId}` +
              ((plan as any).operation_type_source ? ` — ${(plan as any).operation_type_source}` : "");
            // LIMIT SETI DEGISTI → AZAMI UGS ESKI SETE GORE HESAPLANMIS DEMEKTIR.
            // Eski degeri birakmak sessiz bir yanlistir. Panelin kullandigi AYNI
            // motorla yeniden hesaplanir; nobet (Md.17) ve SKPK (Md.12) etkileri
            // KAYITLI olduklari icin uzerine aynen tasinir.
            try {
              const snapReg = duty.ruleset_snapshot?.regulation;
              if (snapReg && duty.report_time) {
                const { rules } = effectiveRules(duty.ruleset_snapshot);
                // Rapor saati GOREVIN KENDI diliminde (report_tz = kalkis meydani).
                // UTC ile hesaplamak +03'te bandi kaydirir ve yanlis satiri okur.
                const rt = new Date(duty.report_time).getTime();
                const parts = duty.report_tz
                  ? Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: duty.report_tz,
                      hour12: false, hour: "2-digit", minute: "2-digit" })
                      .formatToParts(new Date(rt)).map((p: any) => [p.type, p.value]))
                  : null;
                const repLocal = parts ? `${parts.hour}:${parts.minute}`
                  : new Date(rt).toISOString().slice(11, 16);
                const singlePilot = [pfPilot, pmPilot, crzPilot].filter(Boolean).length === 1;
                const base = maxFdpMinutes(repLocal, sectors.length, rules,
                  { operationType: opChangedTo, singlePilot });
                if (base != null) {
                  const reduced = Math.max(0, base - (duty.standby_reduction_min ?? 0));
                  const withSkpk = reduced + (duty.skpk_fdp_extension_min ?? 0);
                  upd.max_fdp_minutes = withSkpk;
                }
              }
            } catch (_e) { /* hesaplanamazsa eski deger kalir; tip yine de kaydedilir */ }
          }

          // ── RAPOR SAATI GERCEK OFF-BLOCK'TAN TURER (21 Agu 2026) ──────────
          // Serkan: "plan saatlerine degil ACTUAL saatlere bakacagiz. Plan
          // 12:00 UTC cikar ama telefon ile one cekilir, eski planda actual
          // saatler yazilir." ve "olmasi gereken: actual off-block -1h."
          //
          // 🔴 20 AGU SAHASI: gorev 18 Agu'da elle girilen bacaklarla acildi
          // (etd 11:00 -> rapor 10:00), plan ucus SABAHI geldi (std 12:00),
          // gercek off-block 11:10 oldu. Arsiv sektorleri, duty_end'i ve
          // fdp_minutes'i guncelledi ama `report_time`'a HIC DOKUNMADI —
          // 15 Tem karar metninde de o alan listede YOK, spec'te unutulmus.
          // Gorev penceresi hicbir gercek saatle bagi olmayan degerde dondu.
          //
          // NEDEN GECIKME KORUMASI YOK: genel havacilikta ekip ucakta
          // BEKLEMEZ; koordinasyonu pilotlar yapar, saat kayarsa gorev de
          // kayar (Serkan). Havayolu mantigi (sabit rapor + bekleme) burada
          // gecerli degil. Ucak basi yapildiktan SONRA cikan gecikme icin
          // elle gorev EDIT'i (gerekceli, izli) acik duruyor.
          const dutyDay = duty.duty_date ?? isoDate;
          const firstOff = sectors[0]?.off_block ? ts(sectors[0].off_block, dutyDay) : null;
          let effReport: string = duty.report_time;
          if (firstOff) {
            const snapC0 = duty.ruleset_snapshot?.company ?? {};
            const snapR0 = duty.ruleset_snapshot?.regulation ?? {};
            // Gorevin KENDI snapshot'i — bugunun kurali degil (Ilke 6).
            const preMin = Math.max(snapC0.preFlightReportMin ?? 60,
                                    snapR0.notification_times?.preflight_report_min ?? 60);
            const candMs = new Date(firstOff).getTime() - preMin * 60000;
            const cand = new Date(candMs).toISOString();
            // 🔴 AN KARSILASTIRILIR, METIN DEGIL (21 Agu 2026).
            // Ilk surumde `cand !== duty.report_time` yaziliyordu. Postgres
            // timestamptz'i "2026-08-20T10:10:00+00:00" diye dondurur,
            // toISOString() ise "2026-08-20T10:10:00.000Z" uretir — AYNI AN,
            // FARKLI METIN. Karsilastirma her zaman "degismis" diyordu:
            // ikinci REGEN ayni degeri tekrar yaziyor ve denetim tablosuna
            // `10:10 -> 10:10` gibi BOS iz dusuyordu (22 izin 8'i boyleydi).
            const prevMs = duty.report_time ? new Date(duty.report_time).getTime() : NaN;
            if (prevMs !== candMs) {
              upd.report_time = cand;
              // AZAMI UGS RAPOR SAATINDEN OKUNUR (Tablo-1 bandi). Rapor kayinca
              // bant da kayabilir; eski limiti birakmak sessiz bir yanlistir —
              // asim ya kacar ya uydurulur.
              const opNow = (upd.operation_type as string | null) ?? duty.operation_type ?? null;
              const singleNow = [pfPilot, pmPilot, crzPilot].filter(Boolean).length === 1;
              const newMax = recomputeMaxFdp({ ...duty, report_time: cand },
                                             sectors.length, opNow, singleNow);
              if (newMax != null) upd.max_fdp_minutes = newMax;
            }
            // IZ: denetim tablosunda saat SESSIZCE degismez. Elle duzenleme
            // yolu (FTLPanel) her degisikligi `ftl_duty_edits`e gerekceyle
            // yaziyor; arsivin turettigi degisiklik de ayni yere yazilir.
            // Geriye donuk duzeltme REGEN ile yapilir (insan tetikler) —
            // sessiz toplu yazma yok.
            if (upd.report_time) {
              await admin.from("ftl_duty_edits").insert({
                duty_id: duty.id, customer_id: duty.customer_id, pilot_id: pid,
                assignment_id: duty.assignment_id ?? null,
                edit_type: "EDIT", field_name: "report_time",
                old_value: String(duty.report_time ?? "").slice(0, 16),
                new_value: String(cand).slice(0, 16),
                reason: `Derived from actual off-block ${sectors[0].off_block} minus ${preMin} min (archive)`,
              }).then(({ error }: any) => {
                // Iz duserse SESSIZ GECMEYIZ ama arsivi de dusurmeyiz:
                // saatler dogru yazildi, kayit izsiz kaldi -> gorunur olsun.
                if (error) console.warn("[archive] duty report_time trace:", error.message);
              });
            }
            effReport = cand;
          }

          // tum sektorler actual aldiysa gorev penceresini gercek degerlerle kur
          const allActual = sectors.every((s: any) => s.off_block && s.on_block);
          if (allActual) {
            const snap = duty.ruleset_snapshot?.company ?? {};
            const postMin = snap.post_flight_duty_minutes ?? 30;
            const repHours = snap.mandatory_report_hours ?? 72;
            const lastOn = ts(sectors[sectors.length - 1].on_block, isoDate);
            if (lastOn && effReport) {
              const endMs = new Date(lastOn).getTime() + postMin * 60000;
              const dutyEnd = new Date(endMs).toISOString();
              const fdpMin = Math.round((new Date(lastOn).getTime() -
                new Date(effReport).getTime()) / 60000);
              // ASIM KONTROLU GUNCEL LIMITLE: faaliyet tipi bu arsivde
              // kesinlestiyse azami UGS yukarida YENIDEN hesaplandi; eski
              // degerle karsilastirmak asimi kacirir ya da uydurur.
              const effMax = (upd.max_fdp_minutes as number | undefined) ?? duty.max_fdp_minutes;
              const fdpExceeded = effMax != null && fdpMin > effMax;
              const dutyMin = fdpMin + postMin;
              const minRest = Math.max(duty.min_rest_minutes ?? 0, dutyMin);
              upd.duty_end = dutyEnd;
              upd.fdp_minutes = fdpMin;
              upd.fdp_exceeded = fdpExceeded;
              upd.min_rest_minutes = minRest;
              upd.earliest_next_report = new Date(endMs + minRest * 60000).toISOString();
              if (fdpExceeded) upd.mandatory_report_due =
                new Date(endMs + repHours * 3600000).toISOString();
            }
            if (dutyFinishedIn === true) { upd.status = "actual"; upd.duty_finished = true; }
            else if (dutyFinishedIn === false) { upd.status = "open"; }
            // DUZELTME (regen): body.duty_finished GELMEZ. Eskiden burada kosulsuz
            // "open" yaziliyordu — yani arsivde saat duzeltmek KAPANMIS bir gorevi
            // GERI ACARDI. Cevap yoksa mevcut durum korunur.
            else if (duty.status !== "actual") { upd.status = "open"; }
          }
          const { error: updErr } = await admin.from("crew_duties")
            .update(upd).eq("id", duty.id);
          ftlUpdate[pid] = updErr ? `error: ${updErr.message}` : (allActual ? upd.status as string : "sector_updated");
          // Raporun basacagi GUNCEL satir (yazdigimiz alanlar uzerine bindirilir).
          if (!updErr) dutyRows[pid] = { ...duty, ...upd };
        } catch (e) {
          ftlUpdate[pid] = `error: ${String(e)}`;   // FTL adimi arsivlemeyi ASLA dusurmez
        }
      }
    }
    return { ftlUpdate, dutyRows };
    }
    // Rapor uretilmediyse (flt_report yok) burada kosar — FTL guncellemesi
    // raporun varligina bagli olamaz.
    if (!ftlResult) ftlResult = ftlEnabled ? await propagateFtl() : { ftlUpdate: {}, dutyRows: {} };

    return json({
      ok: true,
      archived_flight_id: afId,
      block_minutes: blockMinutes,
      airborne_minutes: airborneMinutes,
      block_time: hhmm(blockMinutes),
      flight_time: hhmm(airborneMinutes),
      is_divert: isDivert,
      destination: destIcao,
      departure: plan.dep ?? null,
      reg: plan.reg ?? null,
      flight_date: plan.date ?? null,
      report_pdf_path: reportPath,
      ftl_update: ftlResult.ftlUpdate,
    });
  } catch (e) {
    return json({ error: "Unhandled", detail: String(e) }, 500);
  }
});
