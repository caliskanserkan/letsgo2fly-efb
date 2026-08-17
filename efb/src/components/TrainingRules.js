// TrainingRules.js — EGITIM GECERLILIK HESABI (saf mantik, UI yok)
//
// Serkan (17 Agu 2026): "Bizim kurallarimiz degil, mevzuati takip edelim."
// ve: "Modul icinde bu referansi yazalim, her ikisini de."
//
// ┌ KAYNAK METINLER ───────────────────────────────────────────────────────┐
// │ SHT-OPS EK-3 (BOLUM-ORO) ORO.FC.230, s.42:                             │
// │   (g) "(b)(3), (c) ve (d) maddelerinde belirtilen gecerlilik sureleri,  │
// │       KONTROLUN YAPILDIGI AYIN SONUNDAN ITIBAREN sayilmaya baslanacak." │
// │   (h) "...gecerlilik suresinin SON 3 AYI icerisinde yapildigi           │
// │       durumlarda, yeni gecerlilik suresi ASIL SON GECERLILIK TARIHINDEN │
// │       ITIBAREN sayilmaya baslanacaktir."                               │
// │ AMC1 ORO.FC.230(b)(4) — ayni kural, EU 965/2012.                       │
// │ SHT-OPS MADDE 4(2): EASA AMC/CS'in EN GUNCEL HALI kullanilir            │
// │   -> AMC Turk isleticiye dogrudan uygulanir.                           │
// │                                                                        │
// │ SHT-FCL FCL.740(a): tip yetkisi 1 yil; "daha erken yerine getirmeyi     │
// │   tercih etmeleri halinde, yeni gecerlilik suresi YETERLILIK KONTROLU   │
// │   TARIHINDEN itibaren baslar."  FCL.740.A(a)(1): pencere "UC AY".      │
// │                                                                        │
// │ SHT-MED MED.A.045(a)(5)(ii): ilk/yenileme -> muayene tarihinden;        │
// │   TEMDIT -> "onceki saglik sertifikasinin gecerlilik suresinin sona     │
// │   erdigi tarihten itibaren".  (b): temdit muayenesi bitisten "EN GEC    │
// │   45 GUN ONCE" yapilabilir  -> pencere 45 GUN (ay degil).              │
// │ MED.A.045(a)(1),(2): 12 ay; 60 yasinda (veya tek pilotlu ticari yolcu   │
// │   + 40 yas) 6 aya duser.  (a)(5)(i): yas MUAYENE TARIHINDEKI yastir.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// 🔑 PENCERE BIRIMI TEK TIP DEGILDIR: ORO ve FCL "ay", MED "gun" der. Tek bir
//    "ay" alanina sikistirilirsa medical yanlis hesaplanir. Bu yuzden
//    carry_forward_window + carry_forward_unit AYRI iki alandir.
//
// Tarihler 'YYYY-MM-DD' DIZGE olarak islenir — saat dilimi kaymasi olmasin
// diye Date nesnesine hic girilmez (crew_duties.duty_date ile ayni yaklasim).

// ── Dizge tarih yardimcilari ────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Ayin son gunu (1-12 ay numarasi). */
export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();   // m=1..12 -> ayin son gunu
}

/** '2026-02-12' -> '2026-02-28' (o ayin son gunu) */
export function endOfMonth(dateStr) {
  if (!dateStr) return null;
  const [y, m] = dateStr.split('-').map(Number);
  return ymd(y, m, daysInMonth(y, m));
}

/**
 * Takvim ayi ekle. Gun ayin sonunu asarsa AYIN SONUNA kirpilir:
 *   2026-08-31 + 6 ay -> 2027-02-28  (28 Subat, 31'i yok)
 * Bu, "takvim ayi" ifadesinin dogru karsiligidir.
 */
export function addMonths(dateStr, n) {
  if (!dateStr || n == null) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(dateStr, n) {
  if (!dateStr) return null;
  const t = new Date(dateStr + 'T00:00:00Z').getTime() + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** a - b, GUN farki (ikisi de 'YYYY-MM-DD'). */
export function diffDays(a, b) {
  if (!a || !b) return null;
  return Math.round(
    (new Date(a + 'T00:00:00Z') - new Date(b + 'T00:00:00Z')) / 86400000);
}

/** Muayene/kontrol tarihindeki tam yas — MED.A.045(a)(5)(i). */
export function ageAt(dobStr, onStr) {
  if (!dobStr || !onStr) return null;
  const [by, bm, bd] = dobStr.split('-').map(Number);
  const [ay, am, ad] = onStr.split('-').map(Number);
  let age = ay - by;
  if (am < bm || (am === bm && ad < bd)) age -= 1;
  return age;
}

// ── MEDICAL: yasa bagli gecerlilik ──────────────────────────────────
/**
 * MED.A.045(a)(1),(2) — 1. sinif 12 ay; 6 aya DUSER:
 *   (i)  tek pilotlu ticari hava tasimaciliginda yolcu tasiyor VE 40+
 *   (ii) 60+
 * Yas MUAYENE TARIHINDEKI yastir: muayenede 59 ise 12 ay olur, sure
 * icinde 60'a girmesi sertifikayi KISALTMAZ.
 *
 * REC iki pilotla uculuyor -> singlePilotPax varsayilan false.
 */
export function medicalValidityMonths(dobStr, examDateStr, { singlePilotPax = false } = {}) {
  const age = ageAt(dobStr, examDateStr);
  if (age == null) return null;                 // dogum tarihi yoksa HESAPLAMA — uydurma yok
  if (age >= 60) return 6;
  if (singlePilotPax && age >= 40) return 6;
  return 12;
}

// ── ASIL HESAP ──────────────────────────────────────────────────────
/**
 * @param completed       'YYYY-MM-DD' kontrol/muayene tarihi
 * @param validityMonths  gecerlilik (takvim ayi). null + noExpiry -> suresiz
 * @param cat             katalog satiri: { anchor_rule, carry_forward_window,
 *                          carry_forward_unit, no_expiry, legal_reference }
 * @param prevExpiry      ayni pilot+kod icin ONCEKI kaydin bitisi (varsa)
 * @returns { expiresAt, appliedRule, anchorDate, note }
 *
 * appliedRule sonucun YANINDA SAKLANIR — denetci tarihi de gorur, tarihi
 * ureten maddeyi de. (OFP decoder'daki "nasil hesaplandigi da saklanir"
 * ilkesinin ayinisi.)
 */
export function computeExpiry({ completed, validityMonths, cat, prevExpiry = null }) {
  if (!cat) return { expiresAt: null, appliedRule: null, anchorDate: null, note: 'NO CATALOG ENTRY' };

  if (cat.no_expiry) {
    return { expiresAt: null, appliedRule: 'NO_EXPIRY', anchorDate: null,
             note: `no re-assessment required — ${cat.legal_reference || ''}`.trim() };
  }
  if (!completed || validityMonths == null) {
    // Ilke 1: hesaplayamadigimizi hesaplamis gibi gostermeyiz.
    return { expiresAt: null, appliedRule: null, anchorDate: null, note: 'INTERVAL NOT SET' };
  }

  // 1) DEVIR (carry-forward) — pencere icinde mi?
  //    Pencere onceki BITISTEN geriye sayilir; yenileme o araliktaysa capa
  //    onceki bitistir. Boylece ay SABIT kalir, surekli one cekme olmaz.
  const win = cat.carry_forward_window;
  const unit = cat.carry_forward_unit;
  if (prevExpiry && win) {
    const windowStart = unit === 'DAYS' ? addDays(prevExpiry, -win) : addMonths(prevExpiry, -win);
    const inWindow = completed >= windowStart && completed <= prevExpiry;
    if (inWindow) {
      // 🔴 TAKVIM AYI SAYAN KALEMDE SONUC DA AY SONUDUR.
      // Ilk surumde burada duz addMonths vardi ve zincir kayiyordu:
      //   12 SUB 26 -> 31 AGU 26 -> 28 SUB 27 -> 28 AGU 27  (olmasi gereken 31 AGU)
      // Cunku 28 Subat'a 6 ay eklenince 28 Agustos cikiyor. Oysa ORO.FC.230
      // TAKVIM AYI sayar; capa zaten bir ay sonu oldugu icin sonuc da ay sonu
      // olmak zorundadir (OPC/LC/EMERG her zaman ay sonunda biter).
      // MED ve LPC tam tarihle calisir — onlarda sarmalanmaz.
      const raw = addMonths(prevExpiry, validityMonths);
      return {
        expiresAt: cat.anchor_rule === 'END_OF_MONTH' ? endOfMonth(raw) : raw,
        appliedRule: 'CARRY_FORWARD',
        anchorDate: prevExpiry,
        note: `carried from previous expiry ${prevExpiry} — ${cat.legal_reference || ''}`.trim(),
      };
    }
  }

  // 2) TABAN kural
  if (cat.anchor_rule === 'END_OF_MONTH') {
    const anchor = endOfMonth(completed);                    // ORO.FC.230 (g)
    return {
      expiresAt: endOfMonth(addMonths(anchor, validityMonths)),
      appliedRule: 'END_OF_MONTH',
      anchorDate: anchor,
      note: `counted from end of check month — ${cat.legal_reference || ''}`.trim(),
    };
  }
  return {
    expiresAt: addMonths(completed, validityMonths),
    appliedRule: 'CHECK_DATE',
    anchorDate: completed,
    note: `counted from check date — ${cat.legal_reference || ''}`.trim(),
  };
}

// ── ALARM DURUMU ────────────────────────────────────────────────────
// Serkan: 60 / 30 / 15 gun kala uyari; esikler egitim basina degistirilebilir.
// Gecerlilik BITIS GUNUNUN SONUNA kadar surer -> bitis gunu daysLeft = 0 ve
// hala VALID sayilir; EXPIRED ertesi gun baslar.
export const DEFAULT_ALERTS = [60, 30, 15];

export function trainingStatus(expiresAt, alertDays, todayStr) {
  if (!expiresAt) return { state: 'NO_EXPIRY', daysLeft: null };
  const left = diffDays(expiresAt, todayStr);
  if (left < 0) return { state: 'EXPIRED', daysLeft: left };
  const a = [...(alertDays && alertDays.length ? alertDays : DEFAULT_ALERTS)].sort((x, y) => y - x);
  const [notice, warning, critical] = [a[0], a[1], a[2]];
  if (critical != null && left <= critical) return { state: 'CRITICAL', daysLeft: left };
  if (warning != null && left <= warning) return { state: 'WARNING', daysLeft: left };
  if (notice != null && left <= notice) return { state: 'NOTICE', daysLeft: left };
  return { state: 'VALID', daysLeft: left };
}

export const STATE_COLOR = {
  VALID:     'var(--green)',
  NO_EXPIRY: 'var(--t3)',
  NOTICE:    'var(--amber)',
  WARNING:   'var(--orange)',
  CRITICAL:  'var(--red)',
  EXPIRED:   'var(--red)',
};
