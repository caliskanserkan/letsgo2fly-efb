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
  climbFuel:  2589,  // lb  (olculen)
  descMin:    25,    // dk  (standart; olculen 23)
  descNM:     115,   // NM  (olculen)
  descFuel:   224,   // lb  (olculen)
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
  const fuelLb = ac.groundFuel + ac.climbFuel + cruiseH * ac.cruiseFF + ac.descFuel;

  return {
    gcNM: distanceNM,    // buyuk daire — ekranda referans olarak kalir
    extraNM: extra,      // "conflict on route" -> elle girilen ekstra
    routeNM,             // hesapta KULLANILAN mesafe
    cruiseNM,
    groundSpeedKt: gs,
    windCompKt,
    flightMin,
    flightH: flightMin / 60,
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

  const fuelCost =
    outLeg.fuelTonnes * fuelPriceDepPerTonne +
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
