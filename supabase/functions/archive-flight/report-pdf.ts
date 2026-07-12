// ─────────────────────────────────────────────────────────────────────────────
// report-pdf.ts - GO2 eFB Flight Report PDF (sunucu tarafli, TEK KAYNAK)
// archive-flight tarafindan cagrilir. Web + iOS ayni dosyayi gosterir.
// A4, cok sayfali, otomatik sayfa kirilimi.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "https://esm.sh/pdf-lib@1.17.1";

// ── Sayfa & tipografi sabitleri ──────────────────────────────────────────────
const A4_W = 595.28;
const A4_H = 841.89;
const M = 32;              // kenar bosluk
const CONTENT_W = A4_W - M * 2;

const C = {
  text:    rgb(0.12, 0.16, 0.23),  // #1e293b
  label:   rgb(0.58, 0.64, 0.72),  // #94a3b8
  muted:   rgb(0.39, 0.45, 0.55),  // #64748b
  line:    rgb(0.886, 0.91, 0.941),// #e2e8f0
  hdrBg:   rgb(0.973, 0.98, 0.988),// #f8fafc
  white:   rgb(1, 1, 1),
  dep:     rgb(0.706, 0.325, 0.036),// #b45309
  dest:    rgb(0.086, 0.392, 0.204),// #166534
  wpt:     rgb(0.118, 0.251, 0.686),// #1e40af
  divert:  rgb(0.863, 0.149, 0.149),// #dc2626
  plt:     rgb(0.486, 0.227, 0.929),// #7c3aed
  green:   rgb(0.086, 0.639, 0.290),
  red:     rgb(0.937, 0.267, 0.267),
  rowDep:  rgb(0.996, 0.976, 0.925),
  rowDest: rgb(0.941, 0.992, 0.957),
  rowDiv:  rgb(0.996, 0.949, 0.949),
  rowPlt:  rgb(0.980, 0.961, 1.000),
  rowGrey: rgb(0.973, 0.980, 0.988),
};

const DASH = "-";

// ── Cizim durumu ─────────────────────────────────────────────────────────────
interface Ctx {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  mono: PDFFont;
  monoBold: PDFFont;
}

function newPage(c: Ctx) {
  c.page = c.pdf.addPage([A4_W, A4_H]);
  c.y = A4_H - M;
}

/** Gerekirse yeni sayfaya gec (h = ihtiyac duyulan dikey alan) */
function ensure(c: Ctx, h: number) {
  if (c.y - h < M) newPage(c);
}

function txt(
  c: Ctx, s: string, x: number, y: number,
  size = 8, font: PDFFont = c.mono, color = C.text,
) {
  c.page.drawText(s ?? "", { x, y, size, font, color });
}

function box(c: Ctx, x: number, y: number, w: number, h: number, color = C.line) {
  c.page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: color, borderWidth: 0.5,
  });
}

function fill(c: Ctx, x: number, y: number, w: number, h: number, color: any) {
  c.page.drawRectangle({ x, y, width: w, height: h, color });
}

/** Bir degeri guvenli metne cevir */
function V(v: unknown): string {
  if (v === null || v === undefined || v === "") return DASH;
  return String(v);
}

function fmtLb(v: unknown): string {
  if (v === null || v === undefined || v === "") return DASH;
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  if (!Number.isFinite(n)) return DASH;
  return n.toLocaleString("en-US") + " lb";
}

function fromMins(m: number | null | undefined): string {
  if (m === null || m === undefined) return DASH;
  const n = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

function toMins(t: string | null | undefined): number | null {
  if (!t || !t.includes(":")) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// ── Kart basligi ─────────────────────────────────────────────────────────────
function cardHeader(c: Ctx, title: string): void {
  ensure(c, 40);
  c.y -= 4;
  fill(c, M, c.y - 14, CONTENT_W, 14, C.hdrBg);
  box(c, M, c.y - 14, CONTENT_W, 14);
  txt(c, title, M + 6, c.y - 10, 7.5, c.monoBold, C.muted);
  c.y -= 14;
}

/** Etiket/deger hucrelerinden olusan satir ciz */
function cellRow(
  c: Ctx,
  cells: { lbl: string; val: string; note?: string; color?: any }[],
): void {
  const h = 28;
  ensure(c, h);
  const w = CONTENT_W / cells.length;
  cells.forEach((cell, i) => {
    const x = M + i * w;
    box(c, x, c.y - h, w, h);
    txt(c, cell.lbl, x + 6, c.y - 10, 6.5, c.mono, C.label);
    txt(c, cell.val, x + 6, c.y - 21, 9, c.monoBold, cell.color ?? C.text);
    if (cell.note) txt(c, cell.note, x + 6, c.y - 26, 5.5, c.mono, C.label);
  });
  c.y -= h;
}

/** Alt basligi olan bolum (TAKEOFF - LTBA gibi) */
function subHeader(c: Ctx, title: string, color: any, badge?: string): void {
  ensure(c, 14);
  fill(c, M, c.y - 12, CONTENT_W, 12, C.hdrBg);
  box(c, M, c.y - 12, CONTENT_W, 12);
  txt(c, title, M + 6, c.y - 9, 7, c.monoBold, color);
  if (badge) {
    const bx = M + 6 + c.monoBold.widthOfTextAtSize(title, 7) + 6;
    txt(c, badge, bx, c.y - 9, 7, c.monoBold, C.divert);
  }
  c.y -= 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANA URETICI
// ─────────────────────────────────────────────────────────────────────────────
export interface ReportInput {
  fr: any;                 // flt_report satiri
  plan: any;               // plans satiri
  signatures: Record<string, Uint8Array>;  // path -> PNG bytes
  attachments: { name: string; bytes: Uint8Array }[]; // eklenecek PDF belgeler
}

export async function buildReportPdf(input: ReportInput): Promise<Uint8Array> {
  const { fr, plan, signatures, attachments } = input;

  const pdf = await PDFDocument.create();
  const c: Ctx = {
    pdf,
    page: pdf.addPage([A4_W, A4_H]),
    y: A4_H - M,
    font: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
    monoBold: await pdf.embedFont(StandardFonts.CourierBold),
  };

  const depIcao = fr.dep_icao || plan?.dep || DASH;
  const destIcao = fr.dest_icao || plan?.dest || DASH;
  const isDivert = !!fr.is_divert;

  // ── Baslik ────────────────────────────────────────────────────────────────
  txt(c, "GO2 eFB - FLIGHT REPORT", M, c.y - 12, 13, c.monoBold, C.text);
  txt(
    c,
    `${V(plan?.reg)} . ${depIcao}-${destIcao} . ${V(plan?.date)}`,
    M, c.y - 24, 8, c.mono, C.muted,
  );
  if (isDivert) {
    txt(c, `DIVERT: ${V(fr.divert_reason)}`, M, c.y - 34, 7.5, c.monoBold, C.divert);
    c.y -= 10;
  }
  c.y -= 34;

  // ── 1) AIRCRAFT & CREW ────────────────────────────────────────────────────
  cardHeader(c, "AIRCRAFT & CREW");
  cellRow(c, [
    { lbl: "Registration", val: V(plan?.reg) },
    { lbl: "Type", val: V(plan?.ac_type) },
    { lbl: "Date", val: V(plan?.date) },
  ]);
  cellRow(c, [
    { lbl: "PIC (PF)", val: V(fr.pf_name) },
    { lbl: "SIC (PM)", val: V(fr.pm_name) },
    { lbl: "Pax", val: V(fr.pax) },
  ]);

  // ── 2) FLIGHT DATA ────────────────────────────────────────────────────────
  cardHeader(c, "FLIGHT DATA");
  cellRow(c, [
    { lbl: "DEP", val: depIcao },
    { lbl: "DEST", val: destIcao, color: isDivert ? C.divert : C.text },
    { lbl: "ALT", val: V(plan?.alternate) },
    { lbl: "STD", val: V(plan?.std) },
  ]);
  cellRow(c, [
    { lbl: "Off Block", val: V(fr.off_block) + " UTC" },
    { lbl: "T/O", val: V(fr.takeoff_time) + " UTC" },
    { lbl: "Landing", val: V(fr.landing_time) + " UTC" },
    { lbl: "On Block", val: V(fr.on_block) + " UTC" },
  ]);
  cellRow(c, [
    { lbl: "Block Time", val: fromMins(fr.block_minutes) },
    { lbl: "Flight Time", val: fromMins(fr.airborne_minutes) },
    { lbl: "STA", val: V(plan?.eta) },
    { lbl: "Landings", val: V(fr.landing_count ?? 1) },
  ]);

  // ── 3) FUEL ───────────────────────────────────────────────────────────────
  const toF = fr.takeoff_fuel ? parseInt(String(fr.takeoff_fuel).replace(/,/g, ""), 10) : null;
  const remF = fr.remaining_fuel ? parseInt(String(fr.remaining_fuel).replace(/,/g, ""), 10) : null;
  const tripBurn = (toF !== null && remF !== null) ? toF - remF : null;
  const planTrip = fr.fuel?.plan_trip ? parseInt(String(fr.fuel.plan_trip).replace(/,/g, ""), 10) : null;
  const burnDiff = (tripBurn !== null && planTrip !== null) ? planTrip - tripBurn : null;

  cardHeader(c, "FUEL");
  cellRow(c, [
    { lbl: "FOB Plan", val: fmtLb(fr.fuel?.plan_fob ?? plan?.fob) },
    { lbl: "T/O Fuel", val: fmtLb(fr.takeoff_fuel) },
    { lbl: "Remaining", val: fmtLb(fr.remaining_fuel) },
    { lbl: "Trip Burn", val: tripBurn !== null ? tripBurn.toLocaleString("en-US") + " lb" : DASH },
    {
      lbl: "vs OFP Plan",
      val: burnDiff !== null ? (burnDiff > 0 ? "+" : "") + burnDiff.toLocaleString("en-US") + " lb" : DASH,
      note: isDivert ? "DIVERT - plan differs" : undefined,
      color: (burnDiff === null || isDivert) ? C.text : (burnDiff > 0 ? C.green : C.red),
    },
  ]);

  // ── 4) NAV LOG ────────────────────────────────────────────────────────────
  const nav: any[] = Array.isArray(fr.navlog) ? fr.navlog : [];
  if (nav.length) {
    cardHeader(c, "NAV LOG - Actual Times & Fuel");

    const cols = [
      { t: "WPT",  w: 90 },
      { t: "TYPE", w: 80 },
      { t: "ETA",  w: 60 },
      { t: "ATA",  w: 60 },
      { t: "FUEL", w: 75 },
      { t: "RVSM", w: CONTENT_W - 365 },
    ];

    const drawNavHead = () => {
      ensure(c, 14);
      fill(c, M, c.y - 12, CONTENT_W, 12, rgb(0.945, 0.957, 0.973));
      box(c, M, c.y - 12, CONTENT_W, 12);
      let x = M;
      cols.forEach((col) => {
        txt(c, col.t, x + 4, c.y - 9, 6.5, c.monoBold, C.muted);
        x += col.w;
      });
      c.y -= 12;
    };
    drawNavHead();

    const divertIdx = nav.findIndex((r) => r.type === "divert-arpt");

    nav.forEach((row, idx) => {
      const notFlown = divertIdx >= 0 && idx > divertIdx;
      const isDiv = row.type === "divert-arpt";
      const isPlt = row.custom === true && !isDiv;

      if (c.y - 13 < M) { newPage(c); drawNavHead(); }

      const bg = notFlown ? C.rowGrey
        : isDiv ? C.rowDiv
        : isPlt ? C.rowPlt
        : row.type === "dep" ? C.rowDep
        : row.type === "dest" ? C.rowDest
        : C.white;

      const fg = notFlown ? C.label
        : isDiv ? C.divert
        : isPlt ? C.plt
        : row.type === "dep" ? C.dep
        : row.type === "dest" ? C.dest
        : C.wpt;

      fill(c, M, c.y - 13, CONTENT_W, 13, bg);
      box(c, M, c.y - 13, CONTENT_W, 13);

      const ty = c.y - 9.5;
      let x = M;

      // WPT + rozet
      txt(c, V(row.wpt), x + 4, ty, 7.5, c.monoBold, fg);
      const wptW = c.monoBold.widthOfTextAtSize(V(row.wpt), 7.5);
      if (isDiv)  txt(c, "[DIVERT]", x + 6 + wptW, ty, 5.5, c.monoBold, C.divert);
      if (isPlt)  txt(c, "[+PLT]",   x + 6 + wptW, ty, 5.5, c.monoBold, C.plt);
      // uculmayan satirlarin uzeri cizili
      if (notFlown) {
        c.page.drawLine({
          start: { x: x + 4, y: ty + 2.5 },
          end:   { x: x + 4 + wptW, y: ty + 2.5 },
          thickness: 0.5, color: C.label,
        });
      }
      x += cols[0].w;

      txt(c, notFlown ? "NOT FLOWN" : V(row.type).toUpperCase(), x + 4, ty, 6, c.mono, C.label);
      x += cols[1].w;
      txt(c, V(row.eta), x + 4, ty, 7, c.mono, notFlown ? C.label : C.muted);
      x += cols[2].w;
      txt(c, V(row.ata), x + 4, ty, 7, c.monoBold, notFlown ? C.label : C.text);
      x += cols[3].w;
      txt(c, row.fuel_actual ? fmtLb(row.fuel_actual) : DASH, x + 4, ty, 7, c.mono, notFlown ? C.label : C.text);
      x += cols[4].w;
      txt(c, V(row.rvsm), x + 4, ty, 6.5, c.mono, C.muted);

      c.y -= 13;
    });
  }

  // ── 5) T/O & LANDING ──────────────────────────────────────────────────────
  const tk = fr.takeoff, ld = fr.landing;
  if (tk || ld) {
    cardHeader(c, "T/O & LANDING DATA");
    if (tk) {
      subHeader(c, `TAKEOFF - ${V(tk.icao || depIcao)}`, C.dep);
      cellRow(c, [
        { lbl: "RWY", val: V(tk.rwy) },
        { lbl: "V1", val: V(tk.v1) },
        { lbl: "VR", val: V(tk.vr) },
        { lbl: "V2", val: V(tk.v2) },
        { lbl: "TRIM", val: V(tk.trim) },
      ]);
      cellRow(c, [
        { lbl: "SID", val: V(tk.sid) },
        { lbl: "REQ RW", val: V(tk.req_rw) },
        { lbl: "RWY LEN", val: V(tk.rwy_len) },
        { lbl: "ATIS", val: V(tk.atis) },
        {
          lbl: "RVSM (P1/SBY/P2)",
          val: [tk.rvsm?.pri1, tk.rvsm?.sby, tk.rvsm?.pri2].map((v) => V(v)).join("/"),
        },
      ]);
    }
    if (ld) {
      subHeader(c, `LANDING - ${V(ld.icao || destIcao)}`, C.dest, ld.is_divert ? "DIVERT" : undefined);
      cellRow(c, [
        { lbl: "RWY", val: V(ld.rwy) },
        { lbl: "VREF", val: V(ld.vref) },
        { lbl: "QNH", val: V(ld.qnh) },
        { lbl: "REQ LND", val: V(ld.req_lnd) },
        { lbl: "ACTUAL LW", val: V(ld.actual_lw) },
      ]);
      cellRow(c, [
        { lbl: "RWY COND", val: V(ld.rwy_cond) },
        { lbl: "RWY LEN", val: V(ld.rwy_len) },
        { lbl: "ATIS", val: V(ld.arr_atis ?? ld.atis) },
      ]);
    }
  }

  // ── 6) SIGNATURES ─────────────────────────────────────────────────────────
  const sigOf = (id: string | null | undefined): string => {
    if (!id) return DASH;
    if (id === fr.crew?.pf?.id) return fr.crew.pf.name || String(id);
    if (id === fr.crew?.pm?.id) return fr.crew.pm.name || String(id);
    return String(id);
  };

  if (fr.mandatory || fr.accept) {
    cardHeader(c, "SIGNATURES");
    const H = 76;
    ensure(c, H);
    const halfW = CONTENT_W / 2;

    const drawSig = async (
      x: number, title: string, path: string | undefined, when: string | undefined,
    ) => {
      box(c, x, c.y - H, halfW, H);
      txt(c, title, x + 6, c.y - 12, 6.5, c.mono, C.label);
      const bytes = path ? signatures[path] : undefined;
      if (bytes) {
        try {
          const png = await pdf.embedPng(bytes);
          const maxW = halfW - 24, maxH = 38;
          const sc = Math.min(maxW / png.width, maxH / png.height);
          c.page.drawImage(png, {
            x: x + 12, y: c.y - 58,
            width: png.width * sc, height: png.height * sc,
          });
        } catch { /* imza gomulemezse bos birak */ }
      } else {
        txt(c, "Not signed", x + 12, c.y - 40, 8, c.monoBold, C.text);
      }
      if (when) {
        txt(c, new Date(when).toUTCString(), x + 6, c.y - H + 8, 6, c.mono, C.label);
      }
    };

    await drawSig(M, `Mandatory Check - ${sigOf(fr.mandatory?.signed_by)}`,
      fr.mandatory?.signature_url, fr.mandatory?.signed_at);
    await drawSig(M + halfW, `Plan Accepted (PIC) - ${sigOf(fr.accept?.pic_id)}`,
      fr.accept?.signature_url, fr.accept?.signed_at);

    c.y -= H;
  }

  // ── 7) DOCUMENTS ──────────────────────────────────────────────────────────
  const docs: any[] = Array.isArray(fr.documents) ? fr.documents : [];
  if (docs.length) {
    cardHeader(c, `DOCUMENTS (${docs.length})`);
    docs.forEach((d) => {
      ensure(c, 13);
      box(c, M, c.y - 13, CONTENT_W, 13);
      txt(c, V(d.section).toUpperCase(), M + 4, c.y - 9.5, 6.5, c.monoBold, C.wpt);
      txt(c, V(d.file_name), M + 130, c.y - 9.5, 7, c.mono, C.text);
      txt(c, d.file_size ? Math.round(d.file_size / 1024) + " KB" : DASH,
        M + 360, c.y - 9.5, 6.5, c.mono, C.muted);
      txt(c, d.uploaded_at ? String(d.uploaded_at).slice(0, 16).replace("T", " ") : DASH,
        M + 430, c.y - 9.5, 6.5, c.mono, C.label);
      c.y -= 13;
    });
    ensure(c, 12);
    txt(c, "Documents attached at the end of this report.", M + 4, c.y - 9, 6, c.mono, C.label);
    c.y -= 12;
  }

  // ── 8) AIRCRAFT & ENGINE HOURS ────────────────────────────────────────────
  if (fr.ac_hours) {
    cardHeader(c, "AIRCRAFT & ENGINE HOURS (after this flight)");
    cellRow(c, [
      { lbl: "Airframe", val: V(fr.ac_hours.airframe) },
      { lbl: "Engine 1", val: V(fr.ac_hours.eng1) },
      { lbl: "Engine 2", val: V(fr.ac_hours.eng2) },
      { lbl: "Cycles", val: V(fr.ac_hours.cycles) },
    ]);
  }

  // ── 9) EASA FTL ───────────────────────────────────────────────────────────
  // Kural: Report time = STD - 01:00 (her ucus). Min rest: varis meydani home
  // base ise 12:00, degilse 10:00 (ORO.FTL.235) - onceki gorev suresinden kisa olamaz.
  const onBlockM = toMins(fr.on_block);
  const dutyEndM = onBlockM !== null ? onBlockM + 30 : null;
  const stdM = toMins(plan?.std);
  const reportM = stdM !== null ? stdM - 60 : null;

  const isHome = (hb: string | null | undefined, icao: string): boolean => {
    if (!hb) return false;
    if (hb === icao) return true;
    if (hb === "LTAC" && icao === "ESB") return true;
    if (hb === "ESB" && icao === "LTAC") return true;
    return false;
  };

  const maxFdp = (rm: number, sectors: number): number => {
    const s = Math.min(sectors, 6);
    const penalty = Math.max(0, s - 2) * 30;
    let base: number;
    if (rm >= 360 && rm < 780) base = 780;
    else if (rm >= 300 && rm < 360) base = 720;
    else if (rm >= 780 && rm < 930) base = 780 - Math.floor((rm - 780) / 15) * 15;
    else base = 660;
    return Math.max(540, base - penalty);
  };

  cardHeader(c, "EASA FTL - ORO.FTL (CREW DUTY & REST)");
  cellRow(c, [
    { lbl: "Duty End (both crew)", val: dutyEndM !== null ? fromMins(dutyEndM) + " UTC" : DASH, note: "On Block +00:30" },
    { lbl: "Sectors", val: "1" },
  ]);

  for (const who of ["pf", "pm"] as const) {
    const crew = fr.crew?.[who];
    const hb = crew?.home_base;
    const destHome = isHome(hb, destIcao);
    const fdpM = (reportM !== null && dutyEndM !== null)
      ? ((dutyEndM - reportM) + 1440) % 1440
      : null;
    const maxM = reportM !== null ? maxFdp(((reportM % 1440) + 1440) % 1440, 1) : null;
    const fdpOk = (fdpM !== null && maxM !== null) ? fdpM <= maxM : null;
    const restBase = destHome ? 720 : 600;
    const minRest = fdpM !== null ? Math.max(fdpM, restBase) : restBase;
    const next = onBlockM !== null ? fromMins(onBlockM + 30 + minRest) : DASH;

    subHeader(
      c,
      `${who.toUpperCase()} - ${V(crew?.name)}   Home: ${V(hb)}`,
      who === "pf" ? C.wpt : rgb(0.059, 0.463, 0.431),
    );
    cellRow(c, [
      { lbl: "Report Time", val: reportM !== null ? fromMins(reportM) + " UTC" : DASH, note: "STD - 01:00" },
      {
        lbl: "FDP",
        val: fromMins(fdpM),
        note: maxM !== null ? "Max: " + fromMins(maxM) : undefined,
        color: fdpOk === null ? C.text : (fdpOk ? C.green : C.red),
      },
      { lbl: "Min Rest", val: fromMins(minRest), note: destHome ? "Home 12:00" : "Away 10:00" },
      { lbl: "Earliest Next Duty", val: next + " UTC" },
    ]);
  }

  ensure(c, 14);
  fill(c, M, c.y - 12, CONTENT_W, 12, C.hdrBg);
  box(c, M, c.y - 12, CONTENT_W, 12);
  txt(c, "WOCL 02:00-05:59 . Cumulative: 60h/7d . 190h/28d . Flight Time: 100h/28d . 900h/year",
    M + 6, c.y - 8.5, 5.5, c.mono, C.label);
  c.y -= 12;

  // ── Alt bilgi ─────────────────────────────────────────────────────────────
  ensure(c, 20);
  c.y -= 8;
  txt(c, `Report generated by GO2 eFB . Archive copy . CAMO data not included . ${new Date().toUTCString()}`,
    M, c.y, 6, c.mono, C.label);

  // ── Belge ekleri (ORIJINAL sayfa boyutunda) ───────────────────────────────
  for (const att of attachments) {
    try {
      const src = await PDFDocument.load(att.bytes);
      const pages = await pdf.copyPages(src, src.getPageIndices());
      pages.forEach((p) => pdf.addPage(p));
    } catch { /* bozuk PDF -> atla */ }
  }

  // ── Sayfa numaralari ──────────────────────────────────────────────────────
  const all = pdf.getPages();
  all.forEach((p, i) => {
    p.drawText(`${i + 1} / ${all.length}`, {
      x: A4_W - M - 40, y: 16, size: 6,
      font: c.mono, color: C.label,
    });
  });

  return await pdf.save();
}
