// GO2 eFB — parse-plan Edge Function
// PDF'i sunucuda parse eder, plans + plan_versions tablolarina yazar.
// Tarayici pdf.js worker sorunu ortadan kalkar. Web ve iOS ortak kapisi.
//
// Girdi (POST JSON): { filename: string, pdf_base64: string }
// Cikti: { ok, results: [{dep,dest,status}], count }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.11.0";

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

// ─── PDF text extraction (unpdf, Deno-native, worker yok) ─────────────────────
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

// ─── Parse helpers (App.js'ten birebir port) ──────────────────────────────────
function parseDispatchNo(text: string): string | null {
  const match = text.match(/\[#(DISP\d+)#\]/);
  return match ? match[1] : null;
}

function parseAllSectors(text: string): any[] {
  const sectors: any[] = [];

  const tableRows = [...text.matchAll(
    /TC-([A-Z]{3})\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+([A-Z]{4})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+([A-Z]{4})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}\s+(\d{2}:\d{2})\s+(\d+)/g
  )];
  for (const row of tableRows) {
    sectors.push({ reg: `TC-${row[1]}`, date: row[2], dep: row[3], std: row[4], dest: row[6], eta: row[7], ete: row[8], pax: row[9] });
  }

  if (sectors.length === 0) {
    const fplMatches = [...text.matchAll(
      /\(FPL-([A-Z0-9]+)-[A-Z]{2}[\s\S]*?-([A-Z]{4})(\d{4})[\s\S]*?-([A-Z]{4})(\d{4})/g
    )];
    for (const m of fplMatches) {
      const stdRaw = m[3], eteRaw = m[5];
      const regRaw = text.match(/REG\/([A-Z0-9]{4,6})/)?.[1] || '';
      const reg = regRaw ? `TC-${regRaw.slice(2)}` : '';
      sectors.push({ callsign: m[1], dep: m[2], std: `${stdRaw.slice(0,2)}:${stdRaw.slice(2)}`, dest: m[4], ete: `${eteRaw.slice(0,2)}:${eteRaw.slice(2)}`, reg, date: '', pax: '', eta: '' });
    }
  }

  const ofpBlocks = [...text.matchAll(
    /FMS IDENT=\S+\s+Log Nr\.?:?\s*\d+\s+Page\s+1\s+([A-Z]{4}-[A-Z]{4})\s+([A-Z0-9]+)([\s\S]*?)(?=FMS IDENT=|$)/g
  )];
  const blockMap: Record<string,string> = {};
  for (const b of ofpBlocks) { blockMap[b[1]] = b[3]; }

  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dof = text.match(/DOF\/(\d{2})(\d{2})(\d{2})/);
  let globalDate = '';
  if (dof) {
    const dofDay = dof[3], dofMon = parseInt(dof[2]) - 1, dofYearFull = `20${dof[1]}`;
    globalDate = `${dofDay} ${months[dofMon]} ${dofYearFull}`;
    const hdr = text.match(/STD\s+(\d{2})-([A-Z]{3})-(\d{2,4})/);
    if (hdr) {
      const hMonIdx = months.indexOf(hdr[2].toUpperCase());
      const hYearFull = hdr[3].length === 2 ? `20${hdr[3]}` : hdr[3];
      const dofKey = `${dofDay.padStart(2,'0')}-${dofMon}-${dofYearFull}`;
      const hdrKey = `${hdr[1].padStart(2,'0')}-${hMonIdx}-${hYearFull}`;
      if (hMonIdx === -1) console.warn(`[OFP DATE] Baslik ay parse edilemedi: ${hdr[2]}`);
      else if (dofKey !== hdrKey) console.warn(`[OFP DATE] UYUSMAZLIK! DOF=${globalDate} baslik=${hdr[1]} ${hdr[2]} ${hYearFull}`);
    } else console.warn(`[OFP DATE] Baslikta STD tarihi yok, sadece DOF (${globalDate})`);
  }

  const globalOperator = text.match(/OPR\/([A-Z][A-Z\s]+?)(?:\s+RMK|\s+SEL|\s+PBN|\n)/)?.[1]?.trim() || '';
  const globalAcType   = text.match(/GLF4|GLF5|GIV|GIV-SP|GV|CL60|CL35|GL5T|GL6T|GLEX|C550|C560|C680|F900|FA7X|FA8X/)?.[0] || '';
  const globalReg = (() => {
    const raw = text.match(/REG\/([A-Z0-9]{4,6})/)?.[1] || text.match(/REGISTRATION:\s*TC-([A-Z]{3})/)?.[1] || '';
    if (!raw) return '';
    return raw.startsWith('TC') ? raw : `TC-${raw.slice(2)}`;
  })();
  const globalCallsign = text.match(/\(FPL-([A-Z0-9]+)-/)?.[1] || '';

  for (const sector of sectors) {
    const routeKey = `${sector.dep}-${sector.dest}`;
    const block = blockMap[routeKey] || '';
    sector.trip_fuel      = block.match(/\bTRIP\s+([\d]+)/)?.[1] || '';
    sector.alternate_fuel = block.match(/\bALTERNATE\s+([\d]+)/)?.[1] || '';
    sector.reserve_fuel   = block.match(/\bFINAL RESERVE\s+([\d]+)/)?.[1] || '';
    sector.total_fob      = block.match(/\bTOTAL FOB\s+([\d]+)/)?.[1] || '';
    sector.fob            = sector.total_fob ? `${parseInt(sector.total_fob).toLocaleString()} lb` : '';
    sector.tow            = block.match(/\bTOW\s+([\d]+)\s*Lbs/i)?.[1] || '';
    sector.zfw            = block.match(/\bZFW\s+([\d]+)\s*Lbs/i)?.[1] || '';
    sector.route          = block.match(/ROUTE:\s*([^\n]+)/)?.[1]?.trim() || '';
    const alt1 = block.match(/1\s*ST\s+ALT\s+([A-Z]{4})/)?.[1];
    const alt2 = text.match(new RegExp(`-${sector.dest}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    const alt3 = text.match(new RegExp(`${sector.dep}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    sector.alternate = alt1 || alt2 || alt3 || '';
    const flMatch = block.match(/CRUISE:[^\d]*(\d{3})/);
    sector.cruise_fl = flMatch ? `FL${flMatch[1]}` : '';
    const logMatch = text.match(new RegExp(`Log Nr\\.?:?\\s*(\\d+)\\s+Page\\s+1\\s+${sector.dep}-${sector.dest}`));
    sector.log_nr = logMatch?.[1] || '';
    sector.ac_type  = sector.ac_type  || globalAcType;
    sector.reg      = sector.reg      || globalReg;
    sector.date     = sector.date     || globalDate;
    sector.operator = sector.operator || globalOperator;
    sector.callsign = sector.callsign || globalCallsign;
    if (!sector.eta && sector.std && sector.ete) {
      const [sh, sm] = sector.std.split(':').map(Number);
      const [eh, em] = sector.ete.split(':').map(Number);
      const total = sh*60 + sm + eh*60 + em;
      sector.eta = `${String(Math.floor(total/60)%24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
    }
  }
  return sectors;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // 1) Caller kimligi
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Missing Authorization token" }, 401);

    const asCaller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } } });
    const { data: userData, error: userErr } = await asCaller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid token" }, 401);
    const callerId = userData.user.id;

    // 2) Caller'in customer_id'si (service-role ile RLS'siz oku)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: prof } = await admin.from("profiles").select("customer_id").eq("id", callerId).single();
    const callerCustomerId = prof?.customer_id ?? null;
    if (!callerCustomerId) return json({ error: "Caller has no customer_id" }, 403);

    // 3) PDF'i al
    const body = await req.json();
    const { filename, pdf_base64 } = body;
    if (!pdf_base64) return json({ error: "pdf_base64 required" }, 400);

    const bytes = Uint8Array.from(atob(pdf_base64), c => c.charCodeAt(0));

    // 4) Parse
    const pdfText = await extractPdfText(bytes);
    const sectors = parseAllSectors(pdfText);
    if (sectors.length === 0) return json({ error: "No flight sectors found in PDF." }, 422);

    // 5) Her sektoru yaz (multi-leg)
    const results: any[] = [];
    for (let i = 0; i < sectors.length; i++) {
      const s = sectors[i];
      const baseDispatch = parseDispatchNo(pdfText) || parseDispatchNo(filename || '') || `${s.reg || 'MANUAL'}-${(s.date || '').replace(/\s/g, '')}`;
      const dispatchNo = sectors.length > 1 ? `${baseDispatch}-S${i + 1}` : baseDispatch;

      // Ayni sektor (dep+dest+std+date) + ayni sirket var mi?
      const { data: existing } = await admin.from("plans").select("id")
        .eq("dep", s.dep).eq("dest", s.dest).eq("std", s.std).eq("date", s.date)
        .eq("customer_id", callerCustomerId).maybeSingle();

      if (!existing) {
        const { data: plan, error: insErr } = await admin.from("plans").insert({
          dispatch_no: dispatchNo, subject: filename, dep: s.dep, dest: s.dest, date: s.date,
          std: s.std, eta: s.eta, ete: s.ete, fob: s.fob, ac_type: s.ac_type, reg: s.reg,
          route: s.route, operator: s.operator, callsign: s.callsign, alternate: s.alternate,
          trip_fuel: s.trip_fuel, alternate_fuel: s.alternate_fuel, reserve_fuel: s.reserve_fuel,
          tow: s.tow, zfw: s.zfw, pax: s.pax, cruise_fl: s.cruise_fl, log_nr: s.log_nr,
          status: "available", customer_id: callerCustomerId,
        }).select().single();
        if (insErr) return json({ error: `Insert failed: ${insErr.message}` }, 400);

        await admin.from("plan_versions").insert({ plan_id: plan.id, dispatch_no: dispatchNo, version_no: 1, raw_text: pdfText });
        results.push({ dep: s.dep, dest: s.dest, status: "created" });
      } else {
        const { count } = await admin.from("plan_versions").select("*", { count: "exact", head: true }).eq("plan_id", existing.id);
        await admin.from("plan_versions").insert({ plan_id: existing.id, dispatch_no: dispatchNo, version_no: (count || 0) + 1, raw_text: pdfText });
        results.push({ dep: s.dep, dest: s.dest, status: `updated v${(count || 0) + 1}` });
      }
    }

    return json({ ok: true, results, count: results.length });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
