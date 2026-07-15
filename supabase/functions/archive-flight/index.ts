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
    const planId: string | undefined = body.plan_id;
    if (!planId) return json({ error: "plan_id required" }, 400);
    const paxIn    = num(body.pax);
    const cyclesIn = num(body.cycles) ?? 1;
    const divertReason: string | null = body.divert_reason ?? null;
    const regenOnly: boolean = body.regenerate_pdf === true;

    // ── 3) Plan (tenant kontrolu) ────────────────────────────────────────────
    const { data: plan } = await admin.from("plans").select("*").eq("id", planId).single();
    if (!plan) return json({ error: "Plan not found" }, 404);
    if (plan.customer_id !== callerCustomerId) return json({ error: "Forbidden" }, 403);
    if (!regenOnly && plan.status === "archived") return json({ error: "Already archived" }, 409);
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

    const [wxRows, docRows] = await Promise.all([
      admin.from("wx_snapshots").select("icao,type,raw_text,fetched_at")
        .eq("plan_id", planId).order("fetched_at", { ascending: false }).then(r => r.data ?? []),
      admin.from("efb_documents").select("id,section,file_name,file_path,mime_type,file_size,uploaded_at")
        .eq("plan_id", planId).then(r => r.data ?? []),
    ]);

    // ── 5) NavLog: zamanlar ve yakit BURADAN gelir (tek kaynak) ──────────────
    const wpts: any[] = navD?.waypoints ?? [];
    const entries: Record<string, any> = navD?.entries ?? {};

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
          rvsm: e.rvsm ?? null, seq: i,
        };
      });
      await admin.from("navlog_entries").delete().eq("plan_id", String(planId));
      const { error: neErr } = await admin.from("navlog_entries").insert(rows);
      if (neErr) console.warn("[archive] navlog_entries:", neErr.message);
    }

    // ── 8) Crew + home_base (FTL raporu icin) ───────────────────────────────
    const pilotIds = [pfPilot, pmPilot].filter(Boolean);
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

    // ── 11) flt_report UPSERT — RAPORUN TEK KAYNAGI ─────────────────────────
    const navlogJson = wpts.map((w, i) => {
      const e = entries[w.uid] ?? {};
      return {
        seq: i, wpt: w.name, type: w.type, custom: w.custom === true,
        eta: (w.eta && w.eta !== "—") ? w.eta : null,
        ata: e.ata ?? (w.type === "dep" ? e.toTime : null)
                   ?? ((w.type === "dest" || w.type === "divert-arpt") ? e.lndTime : null) ?? null,
        fuel_plan: w.planFuel ?? null,
        fuel_actual: num(e.fuel) ?? (w.type === "dep" ? num(e.toFuel) : null)
                                 ?? ((w.type === "dest" || w.type === "divert-arpt") ? num(e.remFuel) : null),
        rvsm: e.rvsm ?? null,
      };
    });

    // regen modunda ARSIV VERISI DEGISMEZ (EASA) — sadece PDF yeniden uretilir
    if (!regenOnly) {
    const { error: frErr } = await admin.from("flt_report").upsert({
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
      takeoff: tkofD ? {
        icao: tkofD.icao, rwy: depRwy, rwy_len: tkofD.manual_len,
        atis: tkofD.dep_atis, sid: tkofD.sid, fl: tkofD.fl, sq: tkofD.sq, oth: tkofD.oth,
        v1: tkofD.v1, vr: tkofD.vr, v2: tkofD.v2, vse: tkofD.vse, trim: tkofD.trim,
        req_rw: tkofD.req_rw,
        rvsm: { pri1: tkofD.rvsm1, sby: tkofD.rvsm_sby, pri2: tkofD.rvsm2 },
        lmc: { lb: tkofD.lmc_lb, kg: tkofD.lmc_kg },
      } : null,
      landing: lndD ? {
        icao: lndD.icao, rwy: arrRwy, rwy_len: lndD.manual_len,
        atis: lndD.arr_atis, qnh: lndD.qnh, rwy_cond: lndD.rwy_cond,
        req_lnd: lndD.req_lnd, actual_lw: lndD.actual_lw, vref: lndD.vref,
        is_divert: lndD.is_divert === "true",
      } : null,
      fuel: fuelD ? {
        fob: fuelD.fob, density: fuelD.density,
        uplift_lt: fuelD.uplift_lt, uplift_lb: fuelD.uplift_lb,
        plan_trip: plan.trip_fuel, plan_alternate: plan.alternate_fuel,
        plan_reserve: plan.reserve_fuel, plan_fob: plan.fob,
      } : null,
      rass: rassD ? {
        dep_reviewed_at: rassD.dep_reviewed_at,
        dest_reviewed_at: rassD.dest_reviewed_at,
        altn_reviewed_at: rassD.altn_reviewed_at,
      } : null,
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
      archived_at: new Date().toISOString(),
    }, { onConflict: "plan_id" });
    if (frErr) console.warn("[archive] flt_report:", frErr.message);
    }

    // ── 11b) RAPOR PDF (sunucuda uretilir — web + iOS ayni dosyayi gosterir) ──
    let reportPath: string | null = null;
    try {
      // flt_report'u geri oku (upsert edilmis hali — tek kaynak)
      const { data: frRow } = await admin.from("flt_report")
        .select("*").eq("plan_id", planId).single();

      if (frRow) {
        // Imza PNG'lerini indir
        const sigs: Record<string, Uint8Array> = {};
        for (const sp of [frRow.mandatory?.signature_url, frRow.accept?.signature_url]) {
          if (!sp) continue;
          const { data: blob } = await admin.storage.from("efb-documents").download(sp);
          if (blob) sigs[sp] = new Uint8Array(await blob.arrayBuffer());
        }

        // Ek PDF belgeleri indir (orijinal sayfa olarak eklenecek)
        const atts: { name: string; bytes: Uint8Array }[] = [];
        for (const d of docRows) {
          if (!(d.mime_type ?? "").includes("pdf")) continue;
          const { data: blob } = await admin.storage.from("efb-documents").download(d.file_path);
          if (blob) atts.push({ name: d.file_name, bytes: new Uint8Array(await blob.arrayBuffer()) });
        }

        const pdfBytes = await buildReportPdf({
          fr: frRow, plan, signatures: sigs, attachments: atts,
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

    // ── 14) FTL: actual saatleri crew_duties'e isle ──────────────────────────
    // Eslestirme kurali (tasarim): (1) tarih, (2) DEP/DEST, (3) saat yakinligi —
    // ayni gun ayni sektor iki kez ucildiysa actual, ETD'ye en yakin ve henuz
    // actual almamis sektore yazilir. Belirsizse SESSIZCE YAZMA → match_review.
    // duty_finished: iOS End Flt "DUTY FINISHED?" cevabi (body.duty_finished);
    // gelmezse gorev ACIK kalir (status='open') — kapatma karari pilotundur.
    let ftlUpdate: Record<string, string> = {};
    if (!regenOnly && offBlock && onBlock) {
      const dutyFinishedIn: boolean | null =
        typeof body.duty_finished === "boolean" ? body.duty_finished : null;
      const hm = (s: string | null) => {
        if (!s) return null;
        const m = String(s).match(/(\d{1,2}):?(\d{2})/);
        return m ? Number(m[1]) * 60 + Number(m[2]) : null;
      };
      const offMin = hm(offBlock);
      for (const pid of [pfPilot, pmPilot].filter(Boolean)) {
        try {
          const { data: cands } = await admin.from("crew_duties")
            .select("*").eq("pilot_id", pid).eq("duty_type", "flight")
            .eq("duty_date", isoDate).neq("status", "actual");
          if (!cands?.length) { ftlUpdate[pid] = "no_duty_found"; continue; }

          // aday sektorler: dep + planlanan dest eslesir, henuz actual yok
          type Cand = { duty: any; idx: number; dist: number };
          const matches: Cand[] = [];
          for (const duty of cands) {
            (duty.sectors ?? []).forEach((s: any, idx: number) => {
              if (s.off_block) return;                     // zaten actual almis
              if ((s.dep ?? "").toUpperCase() !== (plan.dep ?? "").toUpperCase()) return;
              if ((s.dest ?? "").toUpperCase() !== (plan.dest ?? "").toUpperCase()) return;
              const etd = hm(s.etd);
              const dist = etd != null && offMin != null
                ? Math.min(Math.abs(etd - offMin), 1440 - Math.abs(etd - offMin)) : 9999;
              matches.push({ duty, idx, dist });
            });
          }
          if (!matches.length) {
            // tarih tutuyor ama sektor eslesmiyor (divert/degisiklik) → bayrakla, yazma
            await admin.from("crew_duties").update({ match_review: true })
              .in("id", cands.map(c => c.id));
            ftlUpdate[pid] = "match_review";
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

          // tum sektorler actual aldiysa gorev penceresini gercek degerlerle kur
          const allActual = sectors.every((s: any) => s.off_block && s.on_block);
          if (allActual) {
            const snap = duty.ruleset_snapshot?.company ?? {};
            const postMin = snap.post_flight_duty_minutes ?? 30;
            const repHours = snap.mandatory_report_hours ?? 72;
            const lastOn = ts(sectors[sectors.length - 1].on_block, isoDate);
            if (lastOn && duty.report_time) {
              const endMs = new Date(lastOn).getTime() + postMin * 60000;
              const dutyEnd = new Date(endMs).toISOString();
              const fdpMin = Math.round((new Date(lastOn).getTime() -
                new Date(duty.report_time).getTime()) / 60000);
              const fdpExceeded = duty.max_fdp_minutes != null && fdpMin > duty.max_fdp_minutes;
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
            else upd.status = "open";
          }
          const { error: updErr } = await admin.from("crew_duties")
            .update(upd).eq("id", duty.id);
          ftlUpdate[pid] = updErr ? `error: ${updErr.message}` : (allActual ? upd.status as string : "sector_updated");
        } catch (e) {
          ftlUpdate[pid] = `error: ${String(e)}`;   // FTL adimi arsivlemeyi ASLA dusurmez
        }
      }
    }

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
      ftl_update: ftlUpdate,
    });
  } catch (e) {
    return json({ error: "Unhandled", detail: String(e) }, 500);
  }
});
