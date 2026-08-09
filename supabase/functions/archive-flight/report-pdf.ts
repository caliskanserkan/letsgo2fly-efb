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

function truncS(s: string, n = 14): string {
  return s.length > n ? s.slice(0, n - 1) + ".." : s;
}

/** Metni hucre genisligine gore satirlara boler.
 *  SAHA BULGUSU (2 Agu 2026, Serkan — End Flt raporu): uzun elle yazilmis ATIS
 *  hucrenin disina, sayfa kenarindan disari tasiyordu. Sebep: `txt()` pdf-lib'in
 *  `drawText`ini maxWidth VERMEDEN cagiriyor; pdf-lib maxWidth yoksa SARMAZ,
 *  metni tek satir cizer. Bu ATIS'e ozel degildi — rapordaki HER serbest metin
 *  alani ayni yoldaydi (DIVERT REASON, NOTE, ATC clearance OTH...).
 *  Font monospace oldugu icin genislik olcumu kesin; kelime kelime paketliyoruz,
 *  tek kelime hucreye sigmiyorsa karakterden kiriliyor (tasma ihtimali kalmasin). */
function wrapToWidth(s: string, font: PDFFont, size: number, maxW: number): string[] {
  const src = (s ?? "").trim();
  if (!src) return [""];
  const out: string[] = [];
  let line = "";
  for (const word of src.split(/\s+/)) {
    const cand = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(cand, size) <= maxW) { line = cand; continue; }
    if (line) { out.push(line); line = ""; }
    if (font.widthOfTextAtSize(word, size) > maxW) {
      let chunk = "";
      for (const ch of word) {
        if (chunk && font.widthOfTextAtSize(chunk + ch, size) > maxW) { out.push(chunk); chunk = ch; }
        else chunk += ch;
      }
      line = chunk;
    } else line = word;
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

/** TEK SATIR kalmasi gereken yerler icin: kolona sigmiyorsa PUNTOYU KUCULTUR.
 *  Sigacak punto doner, metne DOKUNMAZ.
 *
 *  IKI KURAL, IKISI DE SERKAN (2 Agu 2026):
 *  (1) NavLog tablosu satir satir okunur — bir satir iki satira cikarsa goz kayar
 *      ve SATIR ATLANIR. Bu yuzden o tabloda sarma YOK.
 *  (2) VERI ASLA EKSILTILMEZ. Rapor bir denetim kaydidir; kirpilan karakter
 *      kaybolan kanittir. O yuzden "…" ile kisaltma da YOK — punto kuculur.
 *  Pratikte zaten devreye girmez: NavLog degerleri maskeli ve sabit formatlidir
 *  (WPT <=6 karakter, HH:MM, sayi). Bu, tasmaya karsi son emniyet. */
function fitSize(s: string, font: PDFFont, size: number, maxW: number, min = 4.5): number {
  const src = s ?? "";
  let sz = size;
  while (sz > min && font.widthOfTextAtSize(src, sz) > maxW) sz -= 0.25;
  return sz;
}

/** Sarmali metin ciz. CIZILEN SATIR SAYISINI doner — cagiran satir yuksekligini
 *  ona gore buyutur. Rapordaki HER VERI alani bundan gecmeli; sabit etiketler
 *  (baslik, kolon adi, altbilgi) yazarken bilindigi icin `txt()` kullanabilir. */
function txtWrap(
  c: Ctx, s: string, x: number, y: number, maxW: number,
  size = 8, font: PDFFont = c.mono, color = C.text, lineH = 9,
): number {
  const lines = wrapToWidth(s, font, size, maxW);
  lines.forEach((ln, i) => txt(c, ln, x, y - i * lineH, size, font, color));
  return lines.length;
}

/** Etiket/deger hucrelerinden olusan satir ciz.
 *  amend: eski deger KIRMIZI ustu cizili + ALTINDA YESIL yeni deger.
 *  Deger hucreye sigmiyorsa ALT SATIRA gecer ve satir yuksekligi buyur. */
function cellRow(
  c: Ctx,
  cells: { lbl: string; val: string; note?: string; color?: any; amend?: { o: string; n: string } }[],
): void {
  const PAD = 6, VAL_SIZE = 9, LINE_H = 10;
  const w = CONTENT_W / cells.length;
  const maxW = w - PAD * 2;

  // Once TUM hucrelerin satirlarini hesapla — satir yuksekligi en uzun hucreye gore.
  // amend hucresinde eski deger USTTE (ustu cizili), yeni deger ALTINDA; ikisi de
  // sarilir. Eskiden truncS ile KESILIYORDU — duzeltme gerekcesi denetim kaydidir,
  // kirpilmaz.
  const wrapped = cells.map((cell) => {
    if (cell.amend) {
      const o = wrapToWidth(cell.amend.o, c.mono, 7.5, maxW);
      const n = wrapToWidth(cell.amend.n, c.monoBold, 8.5, maxW);
      return { o, n, lines: o.length + n.length };
    }
    const v = wrapToWidth(cell.val, c.monoBold, VAL_SIZE, maxW);
    return { v, lines: v.length };
  });
  const maxLines = Math.max(1, ...wrapped.map((x) => x.lines));
  const extra = (maxLines - 1) * LINE_H;
  const h = 28 + extra;              // tek satirda eski geometri birebir korunur

  ensure(c, h);
  cells.forEach((cell, i) => {
    const x = M + i * w;
    const wr = wrapped[i];
    box(c, x, c.y - h, w, h);
    txt(c, cell.lbl, x + PAD, c.y - 10, 6.5, c.mono, C.label);
    if (cell.amend) {
      (wr.o ?? []).forEach((ln, k) => {
        const yy = c.y - 21 - k * LINE_H;
        txt(c, ln, x + PAD, yy, 7.5, c.mono, C.red);
        const ow = c.mono.widthOfTextAtSize(ln, 7.5);
        c.page.drawLine({
          start: { x: x + PAD, y: yy + 2.5 }, end: { x: x + PAD + ow, y: yy + 2.5 },
          thickness: 1, color: C.red,
        });
      });
      (wr.n ?? []).forEach((ln, k) => {
        txt(c, ln, x + PAD, c.y - 21 - ((wr.o?.length ?? 0) + k) * LINE_H,
            8.5, c.monoBold, C.green);
      });
      txt(c, "AMENDED", x + PAD, c.y - 26.5 - extra, 5, c.monoBold, C.red);
    } else {
      (wr.v ?? [""]).forEach((ln, k) => {
        txt(c, ln, x + PAD, c.y - 21 - k * LINE_H, VAL_SIZE, c.monoBold, cell.color ?? C.text);
      });
      if (cell.note) txt(c, cell.note, x + PAD, c.y - 26 - extra, 5.5, c.mono, C.label);
    }
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
  // FOTO EKLERI (31 Tem saha bulgusu — "tek booklet"): ATIS/DCL/fuel receipt
  // fotolari + resim formatli belgeler rapora SAYFA olarak gomulur.
  photos?: { name: string; category: string; bytes: Uint8Array }[];
  // Admin duzeltmeleri (admin_edits): PDF'e GORSEL katman olarak islenir —
  // orijinal deger ustu cizili + yaninda yesil YENI deger (kagit logbook gelenegi).
  // fr verisi ORIJINALDIR; duzeltme yalniz gosterimdir (EASA: kayit degismez).
  amendments?: { field_name: string; old_value: string | null; new_value: string | null; reason?: string | null; created_at?: string | null }[];
  // FTL: pilot_id -> guncel crew_duties satiri. Rapor bu degerleri BASAR,
  // yeniden HESAPLAMAZ (K-2). Cagiran, 14. adimi PDF'ten ONCE kosup verir.
  duties?: Record<string, any>;
  // pilot_id -> 14. adimin sonucu ("no_duty_found" / "match_review" / ...).
  // Gorev baglanamadiginda raporda SEBEBI yazabilmek icin (Ilke 1).
  ftlStatus?: Record<string, string>;
}

export async function buildReportPdf(input: ReportInput): Promise<Uint8Array> {
  const { fr, plan, signatures, attachments } = input;
  const amendments = input.amendments ?? [];

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

  // Duzeltme haritasi: alan basina SON duzeltme gecerli (eski->yeni zinciri annexte tam durur)
  const am = new Map<string, { o: string; n: string }>();
  for (const a of amendments) am.set(a.field_name, { o: V(a.old_value), n: V(a.new_value) });
  // Hucreye duzeltme bagla: alan duzeltilmisse amend eklenir
  const A = (field: string, cell: any) => am.has(field) ? { ...cell, amend: am.get(field) } : cell;

  // ── Baslik ────────────────────────────────────────────────────────────────
  txt(c, "GO2 eFB - FLIGHT REPORT", M, c.y - 12, 13, c.monoBold, C.text);
  txt(
    c,
    `${V(plan?.reg)} . ${depIcao}-${destIcao} . ${V(plan?.date)}`,
    M, c.y - 24, 8, c.mono, C.muted,
  );
  if (isDivert) {
    // DIVERT REASON serbest metin — uzunlugu sinirsiz, sarmali cizilir.
    const n = txtWrap(c, `DIVERT: ${V(fr.divert_reason)}`, M, c.y - 34,
                      CONTENT_W, 7.5, c.monoBold, C.divert, 9);
    c.y -= 10 + (n - 1) * 9;
  }
  c.y -= 34;

  // ── Duzeltme bandi ────────────────────────────────────────────────────────
  if (amendments.length) {
    ensure(c, 18);
    fill(c, M, c.y - 14, CONTENT_W, 14, rgb(0.996, 0.906, 0.906));
    box(c, M, c.y - 14, CONTENT_W, 14, C.red);
    txt(c,
      `AMENDED RECORD - ${amendments.length} CORRECTION(S) AFTER ARCHIVING - original struck through, new value in green. See AMENDMENTS annex.`,
      M + 6, c.y - 10, 6.2, c.monoBold, C.red);
    c.y -= 18;
  }

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
    A("pax", { lbl: "Pax", val: V(fr.pax) }),
  ]);
  // 3 PILOT / CHECK RIDE (4 Agu): PF/PM icin nasil veri uretiliyorsa CRZ CPT
  // ve TRE/TRI de raporda ayni sekilde gorunur (Serkan talebi).
  if (fr.crew?.crz?.name || fr.crew?.check_ride) {
    cellRow(c, [
      { lbl: "CRZ CPT", val: V(fr.crew?.crz?.name) },
      { lbl: "Check Ride", val: fr.crew?.check_ride ? "YES" : DASH },
      { lbl: "TRE/TRI (external)", val: V(fr.crew?.external_examiner) },
    ]);
  }

  // ── 2) FLIGHT DATA ────────────────────────────────────────────────────────
  // ⚠️ KURGU (9 Agu 2026, Serkan): "LTAC altinda STD ve actual time (off block
  // ve take off), DEST altinda STA ve actual zamanlar, diger kolonda flt time
  // ve block time yer almali — mantikli bir kurgu olmali."
  //
  // ESKI DUZEN DAGINIKTI: STD ilk satirin SAGINDA, STA UCUNCU satirda, gercek
  // saatler ortada; plan ile gercegi karsilastirmak icin goz uc satir arasinda
  // gidip geliyordu. Yeni duzen ucusun kendi mantigini izliyor:
  //   KALKIS sutunu (plan + gercek) · VARIS sutunu (plan + gercek) · SURELER
  // Her sutun kendi icinde ustten alta PLANDAN GERCEGE okunur.
  cardHeader(c, "FLIGHT DATA");
  subHeader(c, `DEPARTURE ${depIcao}`, C.dep);
  cellRow(c, [
    { lbl: "STD (PLAN)", val: V(plan?.std) },
    A("off_blocks", { lbl: "OFF BLOCK", val: V(fr.off_block) + " UTC" }),
    A("takeoff_time", { lbl: "TAKE OFF", val: V(fr.takeoff_time) + " UTC" }),
  ]);
  subHeader(c, `ARRIVAL ${destIcao}`, isDivert ? C.divert : C.dest,
            isDivert ? "DIVERT" : undefined);
  cellRow(c, [
    { lbl: "STA (PLAN)", val: V(plan?.eta) },
    A("landing_time", { lbl: "LANDING", val: V(fr.landing_time) + " UTC" }),
    A("on_blocks", { lbl: "ON BLOCK", val: V(fr.on_block) + " UTC" }),
  ]);
  subHeader(c, "TIMES", C.wpt);
  cellRow(c, [
    A("airborne_minutes", { lbl: "FLIGHT TIME", val: fromMins(fr.airborne_minutes) }),
    A("block_minutes", { lbl: "BLOCK TIME", val: fromMins(fr.block_minutes) }),
    A("landing_count", { lbl: "LANDINGS", val: V(fr.landing_count ?? 1) }),
    { lbl: "ALTERNATE", val: V(plan?.alternate) },
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
    A("takeoff_fuel", { lbl: "T/O Fuel", val: fmtLb(fr.takeoff_fuel) }),
    A("remaining_fuel", { lbl: "Remaining", val: fmtLb(fr.remaining_fuel) }),
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

    // BOS TABLO SESSIZ KALMAZ (9 Agu 2026, LTAC-EGLF) — Ilke 1.
    // Rapor `flt_report`tan uretilir; o satir sunucudaki `navlog_data` aynasi
    // bayatken yazildiysa tablo bastan sona tire cikar. Aciklamasiz bir tire
    // tablosu denetciye "pilot hicbir sey girmedi" der — YANLIS ve agir bir
    // iddia. Boyle bir durumda sebep ACIKCA yazilir; tablo yine cizilir ki
    // rota ve plan degerleri (denetimin diger yarisi) gorunmeye devam etsin.
    if (!nav.some((r) => r && (r.ata != null || r.fuel_actual != null))) {
      ensure(c, 24);
      const n = txtWrap(c,
        "NO ACTUAL TIMES OR FUEL WERE ON THE SERVER WHEN THIS FLIGHT WAS ARCHIVED - " +
        "the tablet that closed the flight held its NavLog locally only. " +
        "This is a synchronisation gap, NOT a missing crew entry. " +
        "Re-generate this report after the NavLog mirror has synchronised.",
        M + 4, c.y - 9, CONTENT_W - 8, 6.5, c.monoBold, C.divert, 8);
      c.y -= n * 8 + 5;
    }

    // 31 Tem saha (Serkan ekibi): "NavLog neyse rapor o olmali" — her wpt icin
    // plan/gercek zaman + plan/gercek yakit + SAPMALAR (T-DEV dk, F-DEV lb).
    // FL KOLONU EKLENDI (9 Agu 2026 saha, Serkan): ucus FL430'da gecti, rapor
    // seviyeyi HIC gostermiyordu. Genislikler yeniden dengelendi; RVSM son
    // kolon oldugu icin artan genisligi o alir (fitSize zaten tasmayi onler).
    const cols = [
      { t: "WPT",   w: 70 },
      { t: "TYPE",  w: 44 },
      { t: "FL",    w: 44 },
      { t: "ETA",   w: 42 },
      { t: "ATA",   w: 42 },
      { t: "T-DEV", w: 42 },
      { t: "PLN FUEL", w: 56 },
      { t: "ACT FUEL", w: 56 },
      { t: "F-DEV", w: 50 },
      { t: "RVSM",  w: CONTENT_W - 446 },
    ];
    const toMins = (s: unknown): number | null => {
      if (typeof s !== "string" || !/^\d{1,2}:\d{2}/.test(s)) return null;
      const [h, m] = s.split(":").map((x) => parseInt(x, 10));
      return h * 60 + m;
    };

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

    // ── BACAK BAZLI SAPMA (saha maddesi 6, 6 Agu 2026, Serkan) ────────────
    // iOS NavLog'daki DEV/F-DEV artik "BU BACAKTA ne kazandim/kaybettim" gosteriyor
    // (plan bacak − gercek bacak; + = kazanc). Rapor kumulatif ata−eta / actual−plan
    // basmaya devam etseydi UYGULAMAYLA CELISIRDI — CLAUDE.md kurali: "NavLog neyse
    // rapor o". Ayni kural burada da uygulanir; ARALIK son GERCEK GIRISLI satirdan
    // bu satira (aradaki bos noktalar plan tarafinda da atlandigi icin dogru kalir).
    //
    // NOT: ±1000 lb VURGUSU kumulatif farkta kalir (fuel_actual − fuel_plan) —
    // o bir yakit DURUMU isareti, bacak VERIMI degil. Ikisi ayri sorudur.
    const hasActual = (r: any) => r && !(r.ata == null && r.fuel_actual == null);
    const legDev = (idx: number): { t: number | null; f: number | null; multi: boolean } => {
      const row = nav[idx];
      if (!hasActual(row)) return { t: null, f: null, multi: false };
      let ai = -1;
      for (let i = idx - 1; i >= 0; i--) if (hasActual(nav[i])) { ai = i; break; }
      if (ai < 0) return { t: null, f: null, multi: false };
      const anc = nav[ai];
      let t: number | null = null;
      const pN = toMins(row.eta), pA = toMins(anc.eta);
      const aN = toMins(row.ata), aA = toMins(anc.ata);
      if (pN !== null && pA !== null && aN !== null && aA !== null) {
        // GECE DEVRI mi, SIRA BOZUKLUGU mu? (9 Agu 2026, GILDA bulgusu — Serkan)
        // Eski kural HER negatif farki gece yarisi sayip +1440 ekliyordu.
        // 09 AUG LTAC-EGLF: NILON ATA 12:50 -> GILDA ATA 12:49 (1 dk GERI, iki
        // nokta planda ayni ETA'da ve otomatik ATA sirasi kaymis). Fark -1 idi,
        // +1440 ile 1439'a cikti ve rapora "T-DEV -1439m" basildi — 1 dakikalik
        // sira kaymasi 24 SAATLIK sapma iddiasina donustu. Yanlis alarm da
        // tehlikelidir: denetci bu satiri gorup ucusu sorgulamaya baslar.
        //
        // Gercek bir gece devri kisa bir bacakta BUYUK negatif olarak gorunur
        // (10 dk'lik bacak -1430 verir). 12 saatten kucuk geri fark gece devri
        // DEGILDIR, gercekten geriye adimdir ve oylece gosterilmelidir.
        const wrapDay = (d: number) => d < -720 ? d + 1440 : d;
        const planLeg = wrapDay(pN - pA);
        const actLeg  = wrapDay(aN - aA);
        t = planLeg - actLeg;
      }
      let f: number | null = null;
      if (row.fuel_plan != null && anc.fuel_plan != null &&
          row.fuel_actual != null && anc.fuel_actual != null) {
        f = (Number(anc.fuel_plan) - Number(row.fuel_plan))
          - (Number(anc.fuel_actual) - Number(row.fuel_actual));
      }
      return { t, f, multi: idx - ai > 1 };
    };

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

      // NAVLOG CIZIM KURALI (Serkan, 2 Agu 2026):
      //   (1) HER SATIR TEK SATIR. Bu tablo satir satir okunur; bir satir ikiye
      //       cikarsa goz kayar ve SATIR ATLANIR. Burada sarma YOK.
      //   (2) VERI EKSILTILMEZ. Sigmiyorsa punto kuculur, karakter atilmaz.
      //   Pratikte devreye girmez (degerler maskeli ve sabit formatli); bu,
      //   yan kolona tasmaya karsi son emniyet.
      const navCell = (s: string, cx: number, colW: number, size: number,
                       font: PDFFont, color: any) =>
        txt(c, s, cx + 4, ty, fitSize(s, font, size, colW - 8), font, color);

      // WPT + rozet (rozet ayni kolonu paylasir -> WPT'ye kalan genislik dusulur)
      const badge = isDiv ? "[DIVERT]" : isPlt ? "[+PLT]" : "";
      const badgeW = badge ? c.monoBold.widthOfTextAtSize(badge, 5.5) + 2 : 0;
      const wptSize = fitSize(V(row.wpt), c.monoBold, 7.5, cols[0].w - 8 - badgeW);
      txt(c, V(row.wpt), x + 4, ty, wptSize, c.monoBold, fg);
      const wptW = c.monoBold.widthOfTextAtSize(V(row.wpt), wptSize);
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

      navCell(notFlown ? "NOT FLOWN" : V(row.type).toUpperCase(), x, cols[1].w, 6, c.mono, C.label);
      x += cols[1].w;
      // FL: pilot seviye girdiyse GERCEK deger (mavi/kalin), yoksa planin degeri.
      // Tirmanis/alcalis isaretleri (CLB/DSC) plandan gelir ve degismez —
      // seyir seviyesi onlarin uzerine tasinmaz (iOS ile ayni kural).
      {
        const flAct = row.fl_actual ? String(row.fl_actual) : null;
        navCell(flAct ?? V(row.fl), x, cols[2].w, 6.5,
                flAct ? c.monoBold : c.mono,
                notFlown ? C.label : (flAct ? C.wpt : C.muted));
      }
      x += cols[2].w;
      navCell(V(row.eta), x, cols[3].w, 7, c.mono, notFlown ? C.label : C.muted);
      x += cols[3].w;
      navCell(V(row.ata), x, cols[4].w, 7, c.monoBold, notFlown ? C.label : C.text);
      x += cols[4].w;
      // T-DEV: BU BACAKTA kazanilan dakika (plan bacak − gercek bacak).
      // + = erken vardin (kazanc). |>=15 dk| vurgulu.
      {
        const td = notFlown ? null : legDev(idx).t;
        const tStr = td === null ? DASH : (td > 0 ? "+" : "") + td + "m";
        navCell(tStr, x, cols[5].w, 7, Math.abs(td ?? 0) >= 15 ? c.monoBold : c.mono,
                td === null ? C.label : (Math.abs(td) >= 15 ? C.divert : C.muted));
      }
      x += cols[5].w;
      navCell(row.fuel_plan != null ? fmtLb(row.fuel_plan) : DASH, x, cols[6].w, 7, c.mono,
              notFlown ? C.label : C.muted);
      x += cols[6].w;
      navCell(row.fuel_actual != null ? fmtLb(row.fuel_actual) : DASH, x, cols[7].w, 7, c.monoBold,
              notFlown ? C.label : C.text);
      x += cols[7].w;
      // F-DEV: BU BACAKTA kazanilan lb (plan yanma − gercek yanma). + = az yaktin.
      // VURGU ise KUMULATIF yakit durumuna bakar (actual − plan >= 1000 lb) —
      // bacak kucuk olsa da toplam yakit durumu bozulmus olabilir.
      {
        const fd = notFlown ? null : legDev(idx).f;
        const cum = (row.fuel_plan != null && row.fuel_actual != null && !notFlown)
          ? Number(row.fuel_actual) - Number(row.fuel_plan) : null;
        const hot = Math.abs(cum ?? 0) >= 1000;
        const fStr = fd === null ? DASH : (fd > 0 ? "+" : "") + fd.toLocaleString("en-US");
        navCell(fStr, x, cols[8].w, 7, hot ? c.monoBold : c.mono,
                fd === null ? C.label : (hot ? C.divert : C.muted));
      }
      x += cols[8].w;
      navCell(V(row.rvsm), x, cols[9].w, 6.5, c.mono, C.muted);

      c.y -= 13;
    });

    // TANIM SATIRI: denetci hangi tanimi okudugunu bilmeli. "+ = kazanc"
    // sezgisel degildir ve isaret ters okunursa rapor yanlis yorumlanir.
    // 🔴 SARMA ZORUNLU (9 Agu 2026 saha, Serkan: "tasma olmasin, gerekirse 2
    // satir olsun"). Bu satir 201 karakter; 5,5 punto mono ile 663 pt eder ama
    // kullanilabilir genislik 531 pt — sayfadan 132 pt TASIYORDU. 2 Agu'da tum
    // VERI alanlarini sarmaya almistik; bu SABIT etiket `txt()` ile kalmisti,
    // "uzunlugu yazarken biliniyor" gerekcesiyle. Gerekce yanlisti: uzunlugu
    // bilmek tasmayi engellemiyor, olcmek engelliyor.
    ensure(c, 20);
    const defLines = txtWrap(c,
      "T-DEV / F-DEV = per leg, measured from the previous point that has an actual entry: " +
      "planned leg minus actual leg. Positive = time or fuel SAVED. " +
      "Bold/red marks a cumulative fuel gap of 1000 lb or more.",
      M + 2, c.y - 8, CONTENT_W - 4, 5.5, c.mono, C.label, 7);
    c.y -= defLines * 7 + 4;

    // ── WAYPOINT NOTLARI (9 Agu 2026) ───────────────────────────────────────
    // Pilotun bir noktaya yazdigi serbest metin. 09 AUG LTAC-EGLF'te enroute
    // alternatif meydan hava kontrolleri buraya yazilmisti (MAKOL: "LTBA LBSF
    // LROP LHBP LOWW WXR CHECKED") — arsiv zincirinin hicbir yerinde
    // tasinmadigi icin denetim kaydindan tamamen dusuyordu.
    //
    // NEDEN AYRI BLOK, NEDEN TABLOYA KOLON DEGIL: iki kural birden gecerli —
    // NavLog tablosu TEK SATIR kalmali (satir ikiye cikarsa goz kayar, satir
    // atlanir) ve serbest metin ASLA KIRPILMAZ (kirpilan karakter kaybolan
    // kanittir). Ikisi ayni hucrede saglanamaz; ayri blokta ikisi de saglanir:
    // burada metin SARILIR, tablonun satir duzeni bozulmaz.
    const navNotes = nav.filter((r) => r && typeof r.note === "string" && r.note.trim() !== "");
    if (navNotes.length) {
      subHeader(c, "NAV LOG NOTES - crew free text", C.wpt);
      const LBL_W = 64;
      navNotes.forEach((r) => {
        ensure(c, 13);
        txt(c, V(r.wpt), M + 4, c.y - 8, 7, c.monoBold, C.wpt);
        const n = txtWrap(c, String(r.note).trim(), M + 4 + LBL_W, c.y - 8,
                          CONTENT_W - LBL_W - 10, 7, c.mono, C.text, 8.5);
        c.y -= Math.max(11, n * 8.5 + 2.5);
      });
      c.y -= 3;
    }
  }

  // ── 5) T/O & LANDING ──────────────────────────────────────────────────────
  const tk = fr.takeoff, ld = fr.landing;
  if (tk || ld) {
    cardHeader(c, "T/O & LANDING DATA");
    if (tk) {
      subHeader(c, `TAKEOFF - ${V(tk.icao || depIcao)}`, C.dep);
      cellRow(c, [
        A("dep_rwy", { lbl: "RWY", val: V(tk.rwy) }),
        { lbl: "V1", val: V(tk.v1) },
        { lbl: "VR", val: V(tk.vr) },
        { lbl: "V2", val: V(tk.v2) },
        { lbl: "TRIM", val: V(tk.trim) },
      ]);
      cellRow(c, [
        A("sid", { lbl: "SID", val: V(tk.sid) }),
        { lbl: "REQ RW", val: V(tk.req_rw) },
        { lbl: "RWY LEN", val: V(tk.rwy_len) },
        A("dep_atis", { lbl: "ATIS", val: V(tk.atis) }),
        {
          lbl: "RVSM (P1/SBY/P2)",
          val: [tk.rvsm?.pri1, tk.rvsm?.sby, tk.rvsm?.pri2].map((v) => V(v)).join("/"),
        },
      ]);
    }
    if (ld) {
      subHeader(c, `LANDING - ${V(ld.icao || destIcao)}`, C.dest, ld.is_divert ? "DIVERT" : undefined);
      cellRow(c, [
        A("arr_rwy", { lbl: "RWY", val: V(ld.rwy) }),
        A("vref", { lbl: "VREF", val: V(ld.vref) }),
        { lbl: "QNH", val: V(ld.qnh) },
        A("req_landing_dist", { lbl: "REQ LND", val: V(ld.req_lnd) }),
        A("actual_lw", { lbl: "ACTUAL LW", val: V(ld.actual_lw) }),
      ]);
      cellRow(c, [
        { lbl: "RWY COND", val: V(ld.rwy_cond) },
        { lbl: "RWY LEN", val: V(ld.rwy_len) },
        A("arr_atis", { lbl: "ATIS", val: V(ld.arr_atis ?? ld.atis) }),
      ]);
    }
  }

  // ── 6) SIGNATURES ─────────────────────────────────────────────────────────
  const sigOf = (id: string | null | undefined): string => {
    if (!id) return DASH;
    if (id === fr.crew?.pf?.id) return fr.crew.pf.name || String(id);
    if (id === fr.crew?.pm?.id) return fr.crew.pm.name || String(id);
    if (id === fr.crew?.crz?.id) return fr.crew.crz.name || String(id);
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
    // Dosya adi sinirsiz uzunlukta olabilir (pilotun cektigi foto, yuklenen PDF)
    // -> sarilir, satir yuksekligi buyur. Boyut/tarih sabit formatli, tek satir.
    const SEC_W = 126 - 8, NAME_W = 230 - 8, DOC_LINE_H = 9;
    docs.forEach((d) => {
      const secL = wrapToWidth(V(d.section).toUpperCase(), c.monoBold, 6.5, SEC_W);
      const namL = wrapToWidth(V(d.file_name), c.mono, 7, NAME_W);
      const n = Math.max(secL.length, namL.length);
      const h = 13 + (n - 1) * DOC_LINE_H;
      ensure(c, h);
      box(c, M, c.y - h, CONTENT_W, h);
      secL.forEach((ln, i) =>
        txt(c, ln, M + 4, c.y - 9.5 - i * DOC_LINE_H, 6.5, c.monoBold, C.wpt));
      namL.forEach((ln, i) =>
        txt(c, ln, M + 130, c.y - 9.5 - i * DOC_LINE_H, 7, c.mono, C.text));
      txt(c, d.file_size ? Math.round(d.file_size / 1024) + " KB" : DASH,
        M + 360, c.y - 9.5, 6.5, c.mono, C.muted);
      txt(c, d.uploaded_at ? String(d.uploaded_at).slice(0, 16).replace("T", " ") : DASH,
        M + 430, c.y - 9.5, 6.5, c.mono, C.label);
      c.y -= h;
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

  // ── 9) FTL — KAYITLI GOREVDEN BASILIR, BURADA HESAP YOK ───────────────────
  // K-2 KAPANDI (6 Agu 2026, Serkan karari). Eskiden bu bolum KENDI EASA
  // tablosunu tasiyordu: sabit "Report = STD-01:00", gomulu bant tablosu,
  // gomulu 12:00/10:00 dinlenme ve — en kotusu — SEKTOR SAYISI SABIT 1.
  // Sonuc: kanunun UCUNCU kopyasi (panel, motor, rapor), birbirinden bagimsiz
  // sapan; cok bacakli gorevde azami UGS oldugundan BUYUK cikiyordu (gevsek
  // yon, yani emniyetsiz yon). SHT-FTL/HG'ye gecisle celiskisi de kacinilmazdi.
  //
  // YENI KURAL: RAPOR HESAP YAPMAZ. crew_duties satirindaki degeri BASAR.
  // O deger gorevin KENDI ruleset_snapshot'iyla, nobet (Md.17) ve SKPK (Md.12)
  // etkileri islenmis halde panel/motor tarafindan yazildi. Rapor onun aynasidir.
  // Gorev kaydi yoksa SAYI UYDURULMAZ — neden basilamadigi yazilir (Ilke 1).
  const duties = input.duties ?? {};
  const ftlStatus = input.ftlStatus ?? {};
  const OPS: Record<string, string> = {
    air_taxi: "AIR TAXI (Md.22)", aerial_work: "AERIAL WORK (Md.26)",
    general_aviation: "GENERAL AVIATION (Md.25)", training: "TRAINING (Md.27)",
  };
  const hhmmZ = (iso: string | null | undefined): string =>
    iso ? String(new Date(iso).toISOString()).slice(11, 16) : DASH;
  const dmyZ = (iso: string | null | undefined): string =>
    iso ? String(new Date(iso).toISOString()).slice(0, 10) : DASH;

  cardHeader(c, "FTL - CREW DUTY & REST (recorded values, not recomputed here)");

  const ftlRoles: ("pf" | "pm" | "crz")[] = fr.crew?.crz ? ["pf", "pm", "crz"] : ["pf", "pm"];
  for (const who of ftlRoles) {
    const crew = fr.crew?.[who];
    const duty = crew?.id ? duties[crew.id] : null;
    subHeader(
      c,
      `${who === "crz" ? "CRZ CPT" : who.toUpperCase()} - ${V(crew?.name)}   Home: ${V(crew?.home_base)}`,
      who === "pf" ? C.wpt : rgb(0.059, 0.463, 0.431),
    );
    if (!duty) {
      // Gorev kaydi yok/eslesmedi: SESSIZ GECILMEZ, sebebi yazilir.
      const why = (crew?.id && ftlStatus[crew.id]) || "no crew duty record";
      cellRow(c, [{ lbl: "Duty record", val: "NOT LINKED",
        note: `FTL values cannot be shown - ${why}`, color: C.red }]);
      continue;
    }
    const fdpOk = duty.fdp_exceeded === true ? false
                : duty.fdp_minutes != null && duty.max_fdp_minutes != null ? true : null;
    cellRow(c, [
      { lbl: "Operation", val: OPS[duty.operation_type] ?? V(duty.operation_type),
        note: duty.operation_type_source ? String(duty.operation_type_source).slice(0, 46) : undefined },
      { lbl: "Report Time", val: hhmmZ(duty.report_time) + " UTC",
        note: duty.report_tz ? String(duty.report_tz) : undefined },
      { lbl: "Duty End", val: hhmmZ(duty.duty_end) + " UTC" },
    ]);
    cellRow(c, [
      { lbl: "FDP", val: fromMins(duty.fdp_minutes),
        note: duty.max_fdp_minutes != null ? "Max: " + fromMins(duty.max_fdp_minutes) : undefined,
        color: fdpOk === null ? C.text : (fdpOk ? C.green : C.red) },
      { lbl: "Min Rest", val: fromMins(duty.min_rest_minutes) },
      { lbl: "Earliest Next Duty", val: hhmmZ(duty.earliest_next_report) + " UTC",
        note: dmyZ(duty.earliest_next_report) },
      { lbl: "Status", val: String(duty.status ?? DASH).toUpperCase(),
        note: duty.match_review ? "MATCH REVIEW" : undefined,
        color: duty.match_review ? C.red : C.text },
    ]);
    // AZAMI UGS'nin NEDEN o deger oldugu raporda dursun: nobet kisaltmasi ve
    // komutan karari, denetimin ilk soracagi iki seydir.
    // Md.22(1) — azami UGS'nin bandi hangi meydanin saatiyle okundu. Kalkis
    // meydanindan FARKLIYSA basilir; ayni ise bilgi tasimaz (gurultu uretme).
    if (duty.acclimatised_to &&
        String(duty.acclimatised_to).toUpperCase() !== String(depIcao).toUpperCase()) {
      cellRow(c, [{ lbl: "Acclimatised to (Md.22/1)", val: String(duty.acclimatised_to),
        note: `Table 1 band read in ${duty.acclimatised_to} local time, not ${depIcao}` }]);
    }
    if (duty.standby_reduction_min > 0) {
      cellRow(c, [{ lbl: "Standby (Md.17)", val: "-" + fromMins(duty.standby_reduction_min),
        note: duty.standby_ref ? String(duty.standby_ref).slice(0, 92) : "max FDP reduced" }]);
    }
    if ((duty.skpk_fdp_extension_min ?? 0) > 0 || (duty.skpk_rest_reduction_min ?? 0) > 0) {
      const due = duty.skpk_authority_due
        ? ` | DGCA due ${dmyZ(duty.skpk_authority_due)}${duty.skpk_authority_reported_at ? " (sent)" : " NOT SENT"}`
        : " | operator report only";
      cellRow(c, [{ lbl: "Commander's discretion (Md.12)",
        val: `FDP +${fromMins(duty.skpk_fdp_extension_min ?? 0)} / REST -${fromMins(duty.skpk_rest_reduction_min ?? 0)}`,
        note: ((duty.skpk_reason ? String(duty.skpk_reason) : "") + due).slice(0, 92),
        color: duty.skpk_authority_due && !duty.skpk_authority_reported_at ? C.red : C.text }]);
    }
  }

  ensure(c, 14);
  fill(c, M, c.y - 12, CONTENT_W, 12, C.hdrBg);
  box(c, M, c.y - 12, CONTENT_W, 12);
  txt(c, "Values above are the RECORDED duty values (crew_duties) computed under that duty's own ruleset snapshot - this report does not recompute limits.",
    M + 6, c.y - 8.5, 5.5, c.mono, C.label);
  c.y -= 12;

  // ── 10) AMENDMENTS ANNEX ──────────────────────────────────────────────────
  // Tum duzeltme zinciri (ayni alanda coklu duzeltme dahil) sirali listelenir.
  if (amendments.length) {
    cardHeader(c, "AMENDMENTS - ADMIN CORRECTIONS (original archived record unchanged)");
    // Bu ek bir DENETIM kaydidir: hangi alan, hangi degerden hangi degere,
    // hangi gerekce ile degistirildi. Eskiden truncS ile kirpiliyordu
    // (deger 18, gerekce 34 karakter) — yani kanit sessizce kayboluyordu.
    // Artik uc bolge de kendi genisliginde SARILIR, hicbiri kesilmez.
    const FLD_W = 112, CHG_X = M + 120, CHG_W = 200;
    const RSN_X = M + 330, RSN_W = CONTENT_W - 330 - 4, AM_LINE_H = 9;
    amendments.forEach((a) => {
      const fldL = wrapToWidth(V(a.field_name).toUpperCase(), c.monoBold, 6.5, FLD_W);
      const oldL = wrapToWidth(V(a.old_value), c.mono, 7, CHG_W);
      const newL = wrapToWidth(`> ${V(a.new_value)}`, c.monoBold, 7.5, CHG_W);
      const when = a.created_at ? String(a.created_at).slice(0, 16).replace("T", " ") : DASH;
      const rsnL = wrapToWidth(`${V(a.reason)} . ${when}`, c.mono, 6, RSN_W);

      const n = Math.max(fldL.length, oldL.length + newL.length, rsnL.length);
      const h = 13 + (n - 1) * AM_LINE_H;
      ensure(c, h);
      box(c, M, c.y - h, CONTENT_W, h);

      fldL.forEach((ln, i) =>
        txt(c, ln, M + 4, c.y - 9.5 - i * AM_LINE_H, 6.5, c.monoBold, C.red));
      oldL.forEach((ln, i) => {
        const yy = c.y - 9.5 - i * AM_LINE_H;
        txt(c, ln, CHG_X, yy, 7, c.mono, C.red);
        const ow = c.mono.widthOfTextAtSize(ln, 7);
        c.page.drawLine({ start: { x: CHG_X, y: yy + 2.5 }, end: { x: CHG_X + ow, y: yy + 2.5 },
                          thickness: 0.8, color: C.red });
      });
      newL.forEach((ln, i) =>
        txt(c, ln, CHG_X, c.y - 9.5 - (oldL.length + i) * AM_LINE_H, 7.5, c.monoBold, C.green));
      rsnL.forEach((ln, i) =>
        txt(c, ln, RSN_X, c.y - 9.5 - i * AM_LINE_H, 6, c.mono, C.muted));
      c.y -= h;
    });
  }

  // ── Alt bilgi ─────────────────────────────────────────────────────────────
  ensure(c, 20);
  c.y -= 8;
  txt(c, `Report generated by GO2 eFB . Archive copy . CAMO data not included . ${new Date().toUTCString()}`,
    M, c.y, 6, c.mono, C.label);

  // ── Foto ekleri (31 Tem — tek booklet): her foto A4 sayfaya sigdirilir ────
  const CAT_LABEL: Record<string, string> = {
    fuel_receipt: "FUEL RECEIPT", tkof_atis: "DEP ATIS", tkof_dcl: "DCL / CLEARANCE",
    lnd_atis: "ARR ATIS", ANY_UPLOAD: "DOCUMENT", PERF_LOADING: "W&B / PERF",
  };
  // TEKILLESTIRME (1 Agu saha: "her ek 2'ser defa eklenmis"). Kok neden iki
  // tabletin ayni fotoyu ayri adlarla yuklemesiydi (iOS'ta belirlenimci yol ile
  // cozuldu); burada ikinci savunma: ayni ad/boyut ikilisi bir kez basilir.
  const seenPhoto = new Set<string>();
  for (const ph of (input.photos ?? [])) {
    const pk = `${ph.category}|${ph.name}|${ph.bytes.length}`;
    if (seenPhoto.has(pk)) continue;
    seenPhoto.add(pk);
    try {
      const isPng = ph.bytes.length > 1 && ph.bytes[0] === 0x89 && ph.bytes[1] === 0x50;
      const img = isPng ? await pdf.embedPng(ph.bytes) : await pdf.embedJpg(ph.bytes);
      const maxW = A4_W - 2 * M, maxH = A4_H - 2 * M - 24;
      const s = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * s, h = img.height * s;
      const page = pdf.addPage([A4_W, A4_H]);
      page.drawText(`ATTACHMENT — ${CAT_LABEL[ph.category] ?? ph.category.toUpperCase()} — ${ph.name}`,
        { x: M, y: A4_H - M, size: 8, font: c.bold, color: C.label });
      page.drawImage(img, { x: (A4_W - w) / 2, y: A4_H - M - 16 - h, width: w, height: h });
    } catch { /* bozuk gorsel -> atla */ }
  }

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
