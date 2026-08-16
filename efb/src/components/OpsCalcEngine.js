// OPS CALCULATOR — hesap motoru (SAF: ag yok, React yok, yan etki yok)
//
// Teklif hazirlarken "bu is ne kadar surer, ne kadara mal olur" sorusuna cevap
// verir. MUHASEBE DEGIL, TAHMIN — ciktinin ustunde de oyle yazar.
//
// NEDEN AYRI DOSYA: dogrulugun onemli oldugu yer burasi. Arayuzden ayrildigi
// icin gercek OFP rakamlariyla sinanabiliyor (OpsCalcEngine.test.js).
//
// ============================================================================
// KATSAYILAR NEREDEN GELDI
// ============================================================================
// Hicbiri uydurulmadi. GO2EFBTests/Fixtures/OFP_OMAA_LTAC.txt (TCREC / GLF4,
// FL400, OMAA-LTAC) ayristirilarak olculdu:
//
//   TOC   : 0:23 · 162 NM · 2589 lb      (navlog kumulatif kolonlari)
//   TOD   : 3:42 · 1669 NM · 11633 lb
//   TRIP  : 4:05 · 11857 lb
//   -> seyir = 3:19 · 1507 NM · 9044 lb  -> 2727 lb/h,  TAS 435 kt @ FL400
//   -> alcalma = 23 dk · ~115 NM · 224 lb
//
// SERKAN'IN STANDARDI (12 Agu 2026): tirmanma ve alcalma HER ZAMAN 25 dk,
// gerisi duz ucus. Olculen 23/23 idi; 25 secildi cunku sureyi az degil FAZLA
// tahmin eder — teklifte dogru yon.
//
// DIKKAT — mesafe ve yakit OLCULEN degerlerdir, 25 dk'ya olceklenmedi.
// Bilincli: climbNM'i 162'de birakmak seyir mesafesini buyutur, yani sureyi
// yine yukari iter. Olcekleseydik (176 NM) tahmin kisalirdi.
export const AC_GLF4 = {
  label:      'GULFSTREAM 450 (GLF4)',
  cruiseTAS:  435,   // kt @ FL400
  cruiseFF:   2727,  // lb/h
  climbMin:   25,    // dk  (standart; olculen 23)
  climbNM:    162,   // NM  (olculen)
  climbFuel:  2589,  // lb  (olculen — 23 dk'lik tirmanmanin TOPLAMI)
  descMin:    25,    // dk  (standart; olculen 23)
  descNM:     115,   // NM  (olculen)
  descFuel:   224,   // lb  (olculen — 23 dk'lik alcalmanin TOPLAMI)
  // ── ORANSAL YAKIT (15 Agu 2026, Serkan) ────────────────────────────────
  // "Tirmanista oransal yakit; gazlar hep ilerde, saatte kac yakiyorsa yarim
  //  saatte yarisini yakar."
  // Seviye girdisi gelince tirmanma suresi 5-30 dk arasinda degisiyor; sabit
  // 2589 lb yazmak FL150'ye tirmanan ucaga FL400'un yakitini yuklerdi.
  // Oran KODA GOMULMEZ: `profileForLevel` her ucagin KENDI saklanan
  // toplam/sure ciftinden turetir (GLF4 icin 2589 lb / 25 dk -> 6214 lb/h,
  // 224 lb / 25 dk -> 538 lb/h). Boylece filodaki her ucak kendi olculen
  // degeriyle calisir, ikinci bir katsayi listesi olusmaz.
  // Serkan: "her zaman 1000 lb ekle, hem taksiler hem yerde beklemeler icin".
  // OFP'nin taksi yakiti 400 lb (~15 dk), yani 1000 lb ~35 dk yer calismasi.
  groundFuel: 1000,  // lb/bacak
  // DOC "motor calistirmadan motor kapatmaya" (Serkan) -> ucus suresi + bu.
  // 35 dk, groundFuel ile AYNI yer suresini anlatir: tek sure, iki tuketici.
  // Ayri sayilar verirsek ayni ucusun yer suresi iki yerde farkli olur.
  groundMin:  35,    // dk/bacak
};

export const LB_PER_TONNE = 2204.62;
export const KMH_PER_KT   = 1.852;

// ============================================================================
// GEOMETRI
// ============================================================================

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Iki meydan arasi buyuk daire mesafesi (NM). Haversine. */
export function greatCircleNM(lat1, lon1, lat2, lon2) {
  const R = 3440.065; // Dunya yaricapi, deniz mili
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Baslangic rotasi (initial great-circle bearing, derece). */
export function initialBearing(lat1, lon1, lat2, lon2) {
  const dLon = rad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
            Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(dLon);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Buyuk daire uzerinde ara nokta (f = 0..1). Ruzgar ornekleme icin. */
export function intermediatePoint(lat1, lon1, lat2, lon2, f) {
  const d = greatCircleNM(lat1, lon1, lat2, lon2) / 3440.065; // acisal mesafe
  if (d === 0) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(rad(lat1)) * Math.cos(rad(lon1)) + B * Math.cos(rad(lat2)) * Math.cos(rad(lon2));
  const y = A * Math.cos(rad(lat1)) * Math.sin(rad(lon1)) + B * Math.cos(rad(lat2)) * Math.sin(rad(lon2));
  const z = A * Math.sin(rad(lat1)) + B * Math.sin(rad(lat2));
  return { lat: deg(Math.atan2(z, Math.hypot(x, y))), lon: deg(Math.atan2(y, x)) };
}

/**
 * Ruzgarin rota uzerindeki bileseni (kt).
 * POZITIF = kuyruk ruzgari (GS artar), NEGATIF = kafa ruzgari.
 * windDirDeg meteorolojik yondur: ruzgarin GELDIGI yon.
 */
export function windComponentKt(windDirDeg, windKt, courseDeg) {
  const head = windKt * Math.cos(rad(windDirDeg - courseDeg));
  return -head;
}

// ============================================================================
// BACAK HESABI
// ============================================================================
// SEVIYEYE BAGLI PROFIL (15 Agu 2026, Serkan)
// ============================================================================
// Serkan: "G450 FL100 ve altinda 250 kt, ustunde 300/0.8M default ucus
//  yapiyoruz. FL100/150/200/250/300/350/400/450 seviye girelim, sen ruzgari
//  canli al ve bu seviyeye gore tirmanma soyle olsun 5/7/10/13/15/20/25/30 dk,
//  alcalmalar ise 5/10/15/20/25/30/35/40 dk. Sadece seviye girecez."
//
// NEDEN GEREKTI: tek profil (OMAA-LTAC, FL400) kisa sektorde cokuyordu.
// Tirmanma 162 + alcalma 115 = 277 NM oldugu icin 277 NM'nin ALTINDAKI HER
// sektor ayni sonucu veriyordu: 0:50 ve 3813 lb — mesafe ve ruzgar sonuca hic
// girmiyordu (Serkan yakaladi: "bodrum mikonos 111 nm 50 dk normal mi?").
// Seviye girdi olunca tirmanma/alcalma gercege oturuyor ve seyir dilimi
// olustugu icin RUZGAR da fiilen hesaba giriyor.
export const CLIMB_MIN = { 100:5, 150:7,  200:10, 250:13, 300:15, 350:20, 400:25, 450:30 };
export const DESC_MIN  = { 100:5, 150:10, 200:15, 250:20, 300:25, 350:30, 400:35, 450:40 };

// SEVIYE LISTESI (16 Agu 2026, Serkan): yarim seviyeler de secilebilmeli.
// "Ticari bir ucus hep iki bacak planlanir" ve dogu/bati kurali geregi gidis
// FL400 ise donus FL410 olur — iki bacak AYRI seviye secer.
export const LEVELS = [100, 110, 150, 160, 200, 210, 250, 260,
                       300, 310, 350, 360, 400, 410, 430, 450];

// Ara seviyelerin (110, 160, 210, 260, 310, 360, 410, 430) OLCUMU YOK.
// Uydurmak yerine OLCULEN IKI NOKTA ARASINDA interpolasyon yapilir: deger
// tablonun disina cikmaz, yalnizca mevcut egri okunur.
//   FL430 -> 400'de 25 dk ile 450'de 30 dk arasindan 28 dk.
// Tablonun DISINA (FL100 alti / FL450 ustu) tasilmaz: orada olcum yok, `null`
// doner ve hesap "tanimsiz seviyede uydurma yok" kuralinca durur.
function interp(table, fl) {
  if (table[fl] != null) return table[fl];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (fl < keys[0] || fl > keys[keys.length - 1]) return null;
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) { if (k <= fl) lo = k; if (k >= fl) { hi = k; break; } }
  if (lo === hi) return table[lo];
  return table[lo] + ((fl - lo) / (hi - lo)) * (table[hi] - table[lo]);
}
export const climbMinFor = (fl) => interp(CLIMB_MIN, fl);
export const descMinFor  = (fl) => interp(DESC_MIN, fl);

// ── STANDART ATMOSFER ────────────────────────────────────────────────────
// Hiz kurali Serkan'in: FL100 ve alti 250 KIAS, ustu 300 KIAS / M0.80.
// TAS bundan TUREVLENIR — uydurma katsayi yok, ISA formulu.
// Yuksekte M0.80, alcakta 300 KIAS baglar; ikisinden KUCUGU gecerlidir
// (ucagin fiilen uctugu profil).
const T0 = 288.15, A0 = 661.4788;              // K, kt (deniz seviyesi ses hizi)
function isa(altFt) {
  const t = altFt < 36089 ? T0 - 0.0019812 * altFt : 216.65;   // K
  const theta = t / T0;
  const delta = altFt < 36089
    ? Math.pow(theta, 5.2559)
    : 0.223361 * Math.exp(-(altFt - 36089) / 20806);
  return { theta, delta, sigma: delta / theta, a: A0 * Math.sqrt(theta) };
}
/** KIAS -> TAS (sikistirilabilirlik ihmal; teklif hesabi icin yeterli). */
function tasFromKias(kias, altFt) { return kias / Math.sqrt(isa(altFt).sigma); }
/** Mach -> TAS. */
function tasFromMach(mach, altFt) { return mach * isa(altFt).a; }

/** Serkan'in hiz kuralinin verdigi TAS — belirtilen irtifada. */
export function profileTAS(altFt) {
  if (altFt <= 10000) return tasFromKias(250, altFt);
  return Math.min(tasFromKias(300, altFt), tasFromMach(0.80, altFt));
}

/// Tirmanma/alcalmada KAT EDILEN MESAFE: sure Serkan'in tablosundan, hiz yine
/// Serkan'in kuralindan — dilimin ORTA irtifasinda. Ayri bir mesafe tablosu
/// istemeye gerek yok, iki girdi zaten yeterli.
function phaseNM(minutes, cruiseAltFt) {
  return profileTAS(cruiseAltFt / 2) * (minutes / 60);
}

/** Seviyeye gore profil — computeLeg'in `ac` yerine kullandigi sekil. */
export function profileForLevel(fl, base = AC_GLF4) {
  const alt = fl * 100;
  // Yarim seviyelerde (FL410, FL430 ...) olculen iki nokta arasindan okunur.
  const climbMin = climbMinFor(fl), descMin = descMinFor(fl);
  if (climbMin == null || descMin == null) return null;   // tanimsiz seviye: uydurma yok
  // ORAN, UCAGIN KENDI OLCUMUNDEN: saklanan safha TOPLAMI, saklanan safha
  // SURESINE bolunur. Serkan: "gazlar hep ilerde, saatte kac yakiyorsa yarim
  // saatte yarisini yakar; 15 dk'da 1/4 yakar." Yani safha yakiti sureyle
  // DOGRU ORANTILI — tek gereken lb/h.
  const rate = (total, minutes) => (minutes > 0 ? total / (minutes / 60) : 0);
  return {
    ...base,
    fl,
    cruiseTAS: Math.round(profileTAS(alt)),
    climbFF: rate(base.climbFuel ?? 0, base.climbMin),
    descFF:  rate(base.descFuel  ?? 0, base.descMin),
    climbMin, descMin,
    climbNM: Math.round(phaseNM(climbMin, alt)),
    descNM:  Math.round(phaseNM(descMin, alt)),
  };
}

/// FL -> Open-Meteo basinc seviyesi. Standart atmosfer basinc irtifasi;
/// API'nin sundugu seviyelerden EN YAKINI secilir (uydurma yok, ISA tablosu).
///   FL100 697 hPa -> 700 · FL150 572 -> 600 · FL200 466 -> 500 · FL250 376 -> 400
///   FL300 301 -> 300 · FL350 238 -> 250 · FL400 188 -> 200 · FL450 148 -> 150
export const HPA_FOR_FL = { 100:700, 150:600, 200:500, 250:400, 300:300, 350:250, 400:200, 450:150 };

// ============================================================================

/**
 * Tek bacak: sure (dk), yakit (lb), DOC saati.
 *
 * distanceNM: BUYUK DAIRE mesafesi. Rota katsayisi UYGULANMAZ.
 * windCompKt: rota uzerindeki bilesen (+kuyruk / -kafa). Bilinmiyorsa 0.
 *             SAKIN HAVA UYARISI cagiranin isi — burada sessizce 0 kabul edilir.
 * extraNM:    "Any conflict on the route?" -> YES ise dispatcher'in elle
 *             girdigi EKSTRA MESAFE. Saat degil NM: boylece ekstra mesafe de
 *             seyir hesabindan gecer ve AYNI RUZGAR ona da uygulanir. Saat
 *             girseydik ruzgardan bagimsiz sabit bir sure eklemis olurduk.
 *
 * 🔑 NEDEN MESAFE KATSAYISI YOK (Serkan, 12 Agu): ucaklar duz cizgide ucmuyor,
 * ama sapmanin sebebi cogu zaman KAPALI HAVA SAHASI ve o aylara gore degisiyor.
 * Olculdu: OMAA-LTAC buyuk daire 1441 NM, gercekte 1784 NM uculdu (+%24) —
 * ama sebebi kapali hava sahasiydi, tipik rota verimsizligi degil. Bu rotaya
 * gore ayarlanmis global bir katsayi normal rotalari %24 sisirirdi.
 * Hangi hava sahasinin kapali oldugunu yazilim BILEMEZ ve bakimi imkansizdir;
 * DISPATCHER bilir. O yuzden yazilim yalniz duz mesafeyi hesaplar, ekstra
 * sureyi bilene sorar (Ilke 1: bilmedigini bilirmis gibi yapma).
 *
 * Ekstra sure UC yere birden yansir: ucus suresi, yakit (ekstra saat x seyir
 * akisi) ve DOC (motor saati artar). Tek girdi, uc tuketici.
 */
export function computeLeg({ distanceNM, windCompKt = 0, extraNM = 0, ac = AC_GLF4 }) {
  const extra = Math.max(0, extraNM);
  const routeNM = distanceNM + extra;
  const cruiseNM = Math.max(0, routeNM - ac.climbNM - ac.descNM);
  const gs = Math.max(50, ac.cruiseTAS + windCompKt); // 50 kt taban: sifira bolme korumasi
  const cruiseH = cruiseNM / gs;

  const flightMin = ac.climbMin + cruiseH * 60 + ac.descMin;
  // Her safha KENDI akisiyla: sure x lb/h. Sabit toplam yazmak, seviyeye gore
  // degisen tirmanma suresini yok sayardi (15 Agu kurali).
  const climbFuel = (ac.climbFF ?? 0) * (ac.climbMin / 60);
  const descFuel  = (ac.descFF  ?? 0) * (ac.descMin  / 60);
  const fuelLb = ac.groundFuel + climbFuel + cruiseH * ac.cruiseFF + descFuel;

  return {
    gcNM: distanceNM,    // buyuk daire — ekranda referans olarak kalir
    extraNM: extra,      // "conflict on route" -> elle girilen ekstra
    routeNM,             // hesapta KULLANILAN mesafe
    cruiseNM,
    groundSpeedKt: gs,
    windCompKt,
    flightMin,
    flightH: flightMin / 60,
    // Safha kirilimi — ekranda "neden bu sayi" sorusunun cevabi.
    climbMin: ac.climbMin, descMin: ac.descMin,
    cruiseMin: cruiseH * 60,
    climbFuelLb: climbFuel, descFuelLb: descFuel,
    cruiseFuelLb: cruiseH * ac.cruiseFF,
    cruiseTASKt: ac.cruiseTAS,
    fl: ac.fl ?? null,
    docH: (flightMin + ac.groundMin) / 60,   // motor calistirma -> kapatma
    fuelLb,
    fuelTonnes: fuelLb / LB_PER_TONNE,
  };
}

// ============================================================================
// HARCIRAH / KONAKLAMA
// ============================================================================

/**
 * Yer suresi -> harcirah gunu.
 * Serkan kurali: 8 saati ASAN kalislarda harcirah var; "30 saat iki gun"
 * yani gun = ceil(saat / 24).
 */
export function perDiemDays(groundHours) {
  if (!(groundHours > 8)) return 0;
  return Math.ceil(groundHours / 24);
}

/** Konaklama gecesi: varista ve donuste TAKVIM gecesi sayilir. */
export function hotelNights(outArrival, retDeparture) {
  const a = new Date(outArrival), b = new Date(retDeparture);
  const d0 = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const d1 = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.max(0, Math.round((d1 - d0) / 86400000));
}

// ============================================================================
// TAM HESAP
// ============================================================================

/**
 * Gidis-donus is emri. Butun para birimleri USD.
 * legs: [gidis, donus] — computeLeg ciktilari
 */
export function computeTrip({
  outLeg, retLeg,
  outDepartUTC, outArriveUTC, retDepartUTC,
  crewCount = 2,
  // TANKERING (Serkan, 12 Agu): "sadece DEP meydaninda yakit alip DEST'te
  // ikmal yapmadan donusler oluyor". Acikken gidis-donus yakitinin TAMAMI
  // DEP fiyatindan hesaplanir, DEST fiyati kullanilmaz.
  tankering = false,
  fuelPriceDepPerTonne = 0,   // gidis bacaginin yakiti DEP'ten alinir
  fuelPriceDestPerTonne = 0,  // donus bacaginin yakiti DEST'ten alinir
  hotelNightly = 0,
  perDiemDaily = 0,
  catering = 0,
  handlingDep = 0,
  handlingDest = 0,
  docHourly = 0,
}) {
  const groundHours = (new Date(retDepartUTC) - new Date(outArriveUTC)) / 3600000;
  const nights = hotelNights(outArriveUTC, retDepartUTC);
  const pdDays = perDiemDays(groundHours);

  const fuelTonnes = outLeg.fuelTonnes + retLeg.fuelTonnes;
  const fuelCost = tankering
    ? fuelTonnes * fuelPriceDepPerTonne                      // hepsi DEP'ten
    : outLeg.fuelTonnes * fuelPriceDepPerTonne +
      retLeg.fuelTonnes * fuelPriceDestPerTonne;
  const hotelCost   = nights * crewCount * hotelNightly;
  const perDiemCost = pdDays * crewCount * perDiemDaily;
  const docCost     = (outLeg.docH + retLeg.docH) * docHourly;
  const handling    = handlingDep + handlingDest;

  const total = fuelCost + hotelCost + perDiemCost + docCost + handling + catering;
  const totalFlightH = outLeg.flightH + retLeg.flightH;

  return {
    groundHours, nights, perDiemDays: pdDays,
    totalFlightH, totalDocH: outLeg.docH + retLeg.docH,
    tankering, fuelTonnes,
    fuelCost, hotelCost, perDiemCost, docCost, handling, catering,
    total,
    // Serkan: "bir deger cikar ortalama, buna gore fiyat verilir"
    costPerFlightHour: totalFlightH > 0 ? total / totalFlightH : 0,
  };
}

/** dk -> "HH:MM" */
export function hhmm(minutes) {
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

// ════════════════════════════════════════════════════════════════════════
// KENDI VERIMIZDEN YAKIT PROFILI (16 Agu 2026, Serkan)
//
// "Elimizde zaten OFP planlar var; her planda FL, trip time, trip fuel
//  verileri var. PPS'in gonderdigi plana gore hareket edelim cunku gercege
//  cok yakin veri tutuyor."  ·  "Bizim sabit degerler anlamsiz olur cunku
//  elimizde veri var."  ·  "Veri arttikca dogruluk artacak."
//
// MODEL:  yakit = clbFF·(clb saat) + crzFF·(crz saat) + dscFF·(dsc saat)
// Sabit terim YOKTUR: sure sifirsa yakit sifirdir. Uc bilinmeyen, N denklem
// -> en kucuk kareler (3x3 normal denklemler, Gauss elemesi).
//
// 🔑 NEDEN TOPLAM SUREYE DEGIL SAFHA SURELERINE GORE: ilk denemede
// `yakit = a + b·toplam sure` kurulmustu ve kisa ucuslarda `b` seyir sanilip
// aslinda TIRMANMA sarfiyatini olcuyordu — 23 dakikalik ucusta seyir dilimi
// yalnizca 3 DAKIKA (olculdu). Serkan yakaladi: "15 lb kac dakikada yakmis,
// o sureyi saate cevirince ayni sarfiyat cikar" — ve oyle cikti: o gruptaki
// regresyon egimi 3642 lb/h, ayni ucuslarin ortalama sarfiyati 3647 lb/h.
// Yani sayi yanlis degildi, YORUMU yanlisti: seyir orani degil, ortalama.
//
// ⚠️ ALCALMA DILIMI SAF DEGILDIR (Serkan): "bazi alcalmalarda OFP irtifa
// tahdidi varsa kademeli alcalis veriyor, onu descent saymiyor." Kot
// kisitinda ucak duz ucar ve orada yakit seyir oraninda yanar, ama o dakikalar
// bizim alcalma dilimimizin icindedir. Bu yuzden `dscFF` saf alcalma degil,
// O DILIMIN ORTALAMASIDIR — toplami bozmaz, etiketi yaklasiktir. Ekranda
// boyle yazilir (Ilke 1).
// ════════════════════════════════════════════════════════════════════════

/**
 * Ornek havuzundan uc safha sarfiyatini cozer.
 * @param {Array} samples `aircraft_perf_samples` satirlari
 * @returns {{climbFF,cruiseFF,descFF,climbMin,descMin,n,nPhase,r2}|null}
 */
export function fitPhaseProfile(samples) {
  const usable = (samples || []).filter(
    (s) => s && s.ete_min > 0 && s.trip_fuel_lb > 0 &&
           s.climb_min > 0 && s.desc_min > 0 &&
           s.ete_min - s.climb_min - s.desc_min >= 0
  );
  if (usable.length < 3) return null;          // uc bilinmeyen, en az uc denklem

  const A = [], y = [];
  for (const s of usable) {
    const c = s.climb_min / 60;
    const d = s.desc_min / 60;
    const z = (s.ete_min - s.climb_min - s.desc_min) / 60;
    A.push([c, z, d]);
    y.push(s.trip_fuel_lb);
  }
  // Normal denklemler (AᵀA)x = Aᵀy — 3x3, kismi pivotlu Gauss
  const n = 3;
  const M = [];
  for (let i = 0; i < n; i++) {
    const row = [];
    for (let j = 0; j < n; j++) row.push(A.reduce((t, a) => t + a[i] * a[j], 0));
    row.push(A.reduce((t, a, k) => t + a[i] * y[k], 0));
    M.push(row);
  }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-9) return null;   // cozulemez (veri yetersiz)
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i] / M[i][i];
      for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  const x = [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
  const [climbFF, cruiseFF, descFF] = x;
  // Negatif sarfiyat fiziksel olarak imkansiz — veri yetersizse uydurma yapma.
  if (!(climbFF > 0 && cruiseFF > 0 && descFF > 0)) return null;

  const pred = A.map((a) => climbFF * a[0] + cruiseFF * a[1] + descFF * a[2]);
  const my = y.reduce((t, v) => t + v, 0) / y.length;
  const sst = y.reduce((t, v) => t + (v - my) ** 2, 0);
  const ssr = y.reduce((t, v, k) => t + (v - pred[k]) ** 2, 0);

  const avg = (f) => usable.reduce((t, s) => t + f(s), 0) / usable.length;
  return {
    climbFF, cruiseFF, descFF,
    climbMin: Math.round(avg((s) => s.climb_min)),
    descMin:  Math.round(avg((s) => s.desc_min)),
    n: (samples || []).length,        // havuzdaki TOPLAM ornek
    nPhase: usable.length,            // safha olcumu OLAN ornek
    r2: sst > 0 ? 1 - ssr / sst : 0,
  };
}
