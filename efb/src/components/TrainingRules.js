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

// ── BUGUN — CIHAZIN YEREL TAKVIM GUNU ───────────────────────────────
// Serkan (19 Agu 2026): "bu sayac lokal gun takip etmeli."
// Onceki surumde hem can hem TRAINING sekmesi kendi `toISOString()` kopyasini
// kullaniyordu. O UTC gunudur: Turkiye'de (UTC+3) gece 00:00-03:00 arasi tarih
// BIR GUN GERIDE kalir -> "kac gun kaldi" 1 fazla gorunur ve gun sinirinda
// yanlis renk cikar (bitis gunu sabah 01:00'de hala "1 gun var" der).
// 'sv-SE' yerel takvim gununu YYYY-MM-DD olarak verir.
// TEK YARDIMCI: hem can hem panel bunu cagirir, ikinci kopya yazilmaz (Ilke 3).
export const todayLocal = () => new Date().toLocaleDateString('sv-SE');

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

// ── HANGI KAYIT GECERLI — KRONOLOJIK ────────────────────────────────
// Serkan (19 Agu 2026): "her zaman kronolojik siraya gore takip edecegiz,
// en son tarih belirleyecek uyarinin ne olacagini" · "girili butun kayitlar
// duracak sistemde tabii ki, ama uyari esigi en guncele gore".
//
// 🔴 ONCEKI SURUM SIRAYA BAKMIYORDU. "Gecerli olan" `status='current'`
//    damgasiyla soyleniyordu ve damgayi TARIH degil GIRIS SIRASI belirliyordu:
//    + ADD TRN ile ne girilirse 'current' oluyor, o anda yururlukte olan
//    'superseded' ediliyordu. 19 Agu'da canli veride goruldu (AAK, LC):
//      LC 2025-10-08 -> 2026-10-31  current      <- eski kayit, IKINCI KEZ girilmis
//      LC 2025-10-08 -> 2026-10-31  superseded   <- birebir kopyasi
//      LC 2026-03-02 -> 2027-03-31  superseded   <- GERCEK EN YENI KONTROL
//    Ekranda LC 5 ay ERKEN bitiyor gorunuyordu ve HICBIR uyari cikmamisti.
//
// Artik "gecerli olan" SAKLANMIYOR, TURETILIYOR (Ilke 3): en buyuk
// completed_date; esitlikte sonra girilen (created_at) kazanir. `status`
// kolonu iz olarak durur ama HESAP ONA BAKMAZ — bu sayede damga kaysa da,
// `superseded_by` baglantisi kopsa da sonuc dogru kalir.

/** a, b'den daha guncel mi? (tarih; esitlikte sonra girilen) */
function dahaGuncel(a, b) {
  const ta = a.completed_date || '', tb = b.completed_date || '';
  if (ta !== tb) return ta > tb;
  return (a.created_at || '') > (b.created_at || '');
}

/**
 * Her (pilot + egitim kodu) icin GECERLI kaydi dondurur — uyari esigi buna
 * gore kurulur. Girilen diger kayitlar listede DURUR, sadece gecerli olan
 * bu degildir.
 */
export function latestPerTraining(rows) {
  const en = new Map();
  for (const r of rows || []) {
    const k = `${r.pilot_id}|${r.training_code}`;
    const v = en.get(k);
    if (!v || dahaGuncel(r, v)) en.set(k, r);
  }
  return [...en.values()];
}

/**
 * Devir (carry-forward) hesabinin capasi: verilen tarihten ONCEKI en yakin
 * kayit. `superseded_by` baglantisina BAKMAZ — baglanti kopsa bile dogru
 * calisir; zaten o baglantinin kopmasi 19 Agu'da acik bulgu olarak duruyordu.
 * @param excludeId  EDIT'te duzenlenen satirin kendisi haric tutulur
 */
export function previousRecord(rows, { pilotId, code, completed, excludeId = null }) {
  let best = null;
  for (const r of rows || []) {
    if (r.pilot_id !== pilotId || r.training_code !== code) continue;
    if (excludeId && r.id === excludeId) continue;
    if (!r.completed_date || !completed || r.completed_date >= completed) continue;
    if (!best || r.completed_date > best.completed_date) best = r;
  }
  return best;
}

// ── ALARM ESIKLERI — SABIT, DEGISTIRILEMEZ ──────────────────────────
// Serkan (19 Agu 2026): "ayni kalsin 60/30/15 degismesin."
//
// Onceki surumde her kayitta serbest metin bir esik alani vardi
// ("Alerts (days before)"). Iki ayri kusur uretiyordu:
//   · "60,30" gibi IKI sayi yazilirsa CRITICAL kademesi hic olusmuyordu —
//     bitise 1 gun kala bile uyari amber kaliyor, ASLA kirmiziya donmuyordu.
//   · "90,60,30,15" gibi DORT sayi yazilirsa sonuncusu sessizce dusuyordu.
//   · Can katalogun varsayilanini, TRAINING sekmesi koda gomulu varsayilani
//     okudugu icin AYNI KAYIT icin farkli durum gosterebiliyorlardi (Ilke 3).
// Artik tek kaynak burasi. `pilot_trainings.alert_days` kolonu semada DURUR
// (yazilmis iz silinmez, Ilke 4) ama ARTIK OKUNMAZ ve yeni kayda YAZILMAZ.
export const ALERT_DAYS = { NOTICE: 60, WARNING: 30, CRITICAL: 15 };

/**
 * Gecerlilik BITIS GUNUNUN SONUNA kadar surer -> bitis gunu daysLeft = 0 ve
 * kayit hala GECERLIDIR (CRITICAL); EXPIRED ertesi gun baslar.
 * Sinir hep SIKI tarafa duser: tam 60 -> NOTICE, tam 30 -> WARNING,
 * tam 15 -> CRITICAL. Emniyet kapisi gevsek tarafa kacmaz (Ilke 7).
 */
export function trainingStatus(expiresAt, todayStr) {
  if (!expiresAt) return { state: 'NO_EXPIRY', daysLeft: null };
  const left = diffDays(expiresAt, todayStr);
  if (left < 0)                    return { state: 'EXPIRED',  daysLeft: left };
  if (left <= ALERT_DAYS.CRITICAL) return { state: 'CRITICAL', daysLeft: left };
  if (left <= ALERT_DAYS.WARNING)  return { state: 'WARNING',  daysLeft: left };
  if (left <= ALERT_DAYS.NOTICE)   return { state: 'NOTICE',   daysLeft: left };
  return { state: 'VALID', daysLeft: left };
}

// ── RENK KADEMELERI ─────────────────────────────────────────────────
// Serkan (19 Agu 2026): "60-30 arasi sari, 30-15 arasi amber, 15-0 kirmizi."
//
// 🔑 TOKEN ADLARI YANILTICI — sec-me hatasi buradan cikar:
//    --amber (#fbbf24) ekranda SARI gorunur, --orange (#f97316) amber gorunur.
//    Serkan'in "amber" dedigi kademeye --amber verilseydi iki kademe ayirt
//    edilemeyen iki sariya coker ve ekranda UC degil IKI kademe kalirdi.
//    O yuzden App.css'e gercek sari (--yellow) eklendi, amber kademesi
//    --orange'a baglandi. Acik temada --amber (#b45309) zaten kahverengidir.
//
// EXPIRED, CRITICAL ile AYNI KIRMIZI (Serkan: "suresi gecmis egitimler kirmizi
// uyari versin"). Ayrimi renk degil YAZI tasir: can listesinde satirin ustunde
// EXPIRED rozeti cikar.
//
// TEK KAYNAK: hem TRAINING sekmesi hem can bu tablodan okur. Can eskiden kendi
// iki renkli mantigini kuruyordu ve 45 gun ile 20 gun ayni sariyi gosteriyordu.
export const STATE_COLOR = {
  VALID:     'var(--green)',
  NO_EXPIRY: 'var(--t3)',
  NOTICE:    'var(--yellow)',   // 60-30 gun  SARI
  WARNING:   'var(--orange)',   // 30-15 gun  AMBER (ekranda amber gorunen token)
  CRITICAL:  'var(--red)',      // 15-0  gun  KIRMIZI
  EXPIRED:   'var(--red)',      // suresi gecmis  KIRMIZI
};

// ── ONCELIK ─────────────────────────────────────────────────────────
// Dikkat isteyen kademeler, agirdan hafife. VALID ve NO_EXPIRY BURADA YOKTUR:
// cana dusmezler, listeye hic girmezler.
export const STATE_RANK = { EXPIRED: 4, CRITICAL: 3, WARNING: 2, NOTICE: 1 };

/**
 * Bir listedeki EN KOTU durum. Serkan: "en yuksek oncelik rengi belirler."
 * Ornek (Serkan, 19 Agu): 50 gun + 43 gun + 5 gun -> can KIRMIZI.
 * Sarinin icinde kirmiziyi saklamayiz. Hicbiri dikkat istemiyorsa null doner.
 */
export function worstState(states) {
  let worst = null, rank = 0;
  for (const s of states) {
    const k = STATE_RANK[s] || 0;
    if (k > rank) { rank = k; worst = s; }
  }
  return worst;
}
