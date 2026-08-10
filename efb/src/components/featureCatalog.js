// GO2 eFB — OZELLIK KATALOGU (super admin settings)
// Tam tasarim: GO2EFB/CLAUDE.md -> "SUPER ADMIN SETTINGS — onayli tasarim"
//
// TEK KAYNAK: hangi anahtar var, varsayilani ne, kapatilinca nereler etkilenir.
// DB'de yalnizca SAPMALAR tutulur (customers.features, ornek: {"ui.raaq": false}).
//
// KATALOGDA OLAN = KAPATILABILIR OLAN.
// Cekirdek moduller (Fuel, NavLog, T/O, LDG, Accept & Sign, arsiv) burada YOKTUR
// ve kodda isEnabled() cagirmazlar -> yapisal olarak kapatilamazlar. Boylece
// "cekirdek kapanmasin" kurali icin DB trigger'i gerekmez.
//
// KURAL 8 — BELIRSIZLIK = ACIK: katalogda olmayan anahtar, okunamayan
// konfigurasyon, bozuk snapshot -> modul GORUNUR ve kapi CALISIR. Asla ters yon;
// kapaliya dusmek kapi kaldirmak demektir.

export const FEATURE_CATALOG = [
  // ---------- UI (iPad) ----------
  {
    key: 'ui.flightcrew.czib', section: 'ui', module: 'FLT CREW', label: 'CZIB',
    kind: 'module', defaultOn: true,
    affects: [
      'FLT CREW ekranindaki CZIB gosterimi kalkar',
      'czib-check sorgusu HIC atilmaz (arka plan da calismaz)',
      'czib_snapshots kaydi olusmaz',
      'Rapordaki CZIB bolumu gorunmez',
      'Help/FAQ CZIB bolumu gorunmez',
    ],
    note: 'Kuresel bolge senkronu (czib-sync) etkilenmez — musteriye ozel degildir.',
  },
  {
    key: 'ui.raaq', section: 'ui', module: 'RAAQ', label: 'RAAQ modulu',
    kind: 'module', defaultOn: true,
    affects: [
      'RAAQ ekrani menude gorunmez',
      'Accept & Sign listesinden CIKAR (sayac 5/5 degil 4/4 olur)',
      'rass_data / RAAQ kaydi olusmaz',
      'Rapordaki RAAQ bolumu gorunmez',
      'Help/FAQ RAAQ bolumu gorunmez',
    ],
    note: 'Sahte GREEN yazilmaz — modul listeden cikarilir (Ilke 1).',
  },
  {
    key: 'ui.takeoff.oeo', section: 'ui', module: 'T/O DATA', label: 'OEO DP butonu',
    kind: 'button', defaultOn: true,
    affects: ['T/O ekranindaki OEO butonu gorunmez', 'perf_oeo ayristirmasi yapilmaz'],
    note: 'Kapisi YOK — hicbir zorunluluk kalkmaz.',
  },
  {
    key: 'ui.takeoff.lmc', section: 'ui', module: 'T/O DATA', label: 'LMC',
    kind: 'button', defaultOn: true,
    affects: ['T/O ekranindaki LMC alani gorunmez', 'Rapordaki LMC satiri gorunmez'],
    note: 'Kapisi YOK — PreArchiveCheck.swift:245 "LMC ve OTH: opsiyonel, kontrol edilmez".',
  },
  {
    key: 'ui.navlog.foreflight', section: 'ui', module: 'NAVLOG', label: 'OPEN FOREFLIGHT',
    kind: 'button', defaultOn: true,
    affects: ['NavLog\'daki ForeFlight butonu gorunmez'],
    note: 'Kapisi YOK — veri uretmez, yalnizca disari rota gonderir.',
  },
  {
    key: 'ui.navlog.fmsimport', section: 'ui', module: 'NAVLOG', label: 'ADD ROUTING FROM FMS',
    kind: 'button', defaultOn: true,
    affects: ['Waypoint editorundeki FMS foto butonu gorunmez', 'Vision islemesi hic calismaz'],
    note: 'Kapisi YOK — elle waypoint girisi her hâlukârda acik kalir.',
  },
  {
    key: 'ui.lnddata.qnh', section: 'ui', module: 'LDG DATA', label: 'QNH',
    kind: 'cell', defaultOn: true,
    affects: [
      'LDG DATA\'daki QNH alani gorunmez',
      'PreArchiveCheck "QNH missing" maddesi URETILMEZ',
      'Rapordaki QNH satiri gorunmez (BOS degil — HIC yok)',
    ],
    note: 'Kayit yeri meselesi: bazi operatorlerde deger FMS/ATIS akisinda kalir, OM\'leri EFB kaydini istemez.',
  },
  {
    key: 'ui.lnddata.rwycond', section: 'ui', module: 'LDG DATA', label: 'RUNWAY CONDITION',
    kind: 'cell', defaultOn: true,
    affects: [
      'LDG DATA\'daki RWY COND alani gorunmez',
      'PreArchiveCheck "RUNWAY CONDITION not set" maddesi URETILMEZ',
      'Rapordaki RWY COND satiri gorunmez',
    ],
    note: 'Serkan (10 Agu): bazi uygulamalarda FMS\'de seciliyor ve OM\'lerine gore yeterli; REC OFP kaydini istiyor.',
  },
  {
    key: 'ui.lnddata.vref', section: 'ui', module: 'LDG DATA', label: 'VREF',
    kind: 'cell', defaultOn: true,
    affects: [
      'LDG DATA\'daki VREF alani gorunmez',
      'PreArchiveCheck "VREF missing" maddesi URETILMEZ',
      'Rapordaki VREF satiri gorunmez',
    ],
    note: 'Serkan (10 Agu): flap secip surati FMS\'ten okuyup ayri perf hesabi yapan operatorler kaydi istemiyor.',
  },
  {
    key: 'ui.docupload.wb', section: 'ui', module: 'DOC UPLOAD', label: 'W&B belgesi',
    kind: 'cell', defaultOn: true,
    affects: [
      'DOC UPLOAD\'da W&B yuklemesi gorunmez',
      'EndFlt\'teki "W&B yok, yine de arsivle?" ONAY SORUSU sorulmaz',
      'Doc Upload modul statusu W&B\'siz de GREEN olabilir',
    ],
    note: 'Sert kapi degil, onayli uyari kapisi — PreArchiveCheck.swift:203.',
  },
  {
    key: 'ui.docupload.perf', section: 'ui', module: 'DOC UPLOAD', label: 'PERF belgesi',
    kind: 'cell', defaultOn: true,
    affects: [
      'DOC UPLOAD\'da PERF yuklemesi gorunmez',
      'PERF ayristirmasi (rota/tarih dogrulamasi, OEO usulleri) calismaz',
      'Doc Upload modul statusu PERF\'siz de GREEN olabilir',
    ],
    note: 'Serbest dokuman yukleme HER ZAMAN acik kalir — bu anahtar onu kapatmaz.',
  },

  // ---------- WEB ADMIN ----------
  {
    key: 'admin.ftl', section: 'admin', module: 'ADMIN', label: 'FTL modulu',
    kind: 'module', defaultOn: true,
    affects: [
      'Admin panelde FTL sekmesi gorunmez',
      'crew_duties satiri URETILMEZ (archive-flight FTL adimi calismaz)',
      'Rapordaki FTL bolumu gorunmez — calismayan modul hesap yapamaz',
      'Help/FAQ FTL bolumu gorunmez',
    ],
    note: 'Kural 7: sonradan acilirsa gecmis gorevler geriye donuk URETILMEZ; acildigi tarihten ilerler.',
  },
  {
    key: 'admin.raaq', section: 'admin', module: 'ADMIN', label: 'RAAQ / risk assessment listesi',
    kind: 'module', defaultOn: true,
    affects: [
      'Admin panelde RAAQ listesi gorunmez',
      'airport_risks yonetimi kullanilamaz',
    ],
  },
];

const BY_KEY = Object.fromEntries(FEATURE_CATALOG.map(f => [f.key, f]));

// Bir anahtar bu musteride etkin mi?
// features = customers.features (yalniz sapmalar). Bilinmeyen anahtar -> true (Kural 8).
export function isEnabled(features, key) {
  const entry = BY_KEY[key];
  if (!entry) return true;
  const v = features ? features[key] : undefined;
  if (v === undefined || v === null) return entry.defaultOn;
  return v !== false;
}

// Katalogun tamami cozulmus hâlde: { 'ui.raaq': true, ... }
// iOS'a aktivasyonda bu harita snapshot olarak gider (katalog cihaza gitmez).
export function resolveFeatures(features) {
  const out = {};
  for (const f of FEATURE_CATALOG) out[f.key] = isEnabled(features, f.key);
  return out;
}

// Kapatilmak istenen anahtarlarin etkileri — SAVE oncesi ozet ekrani icin.
export function affectsOf(keys) {
  return keys
    .map(k => BY_KEY[k])
    .filter(Boolean)
    .map(f => ({ key: f.key, label: f.label, module: f.module, affects: f.affects, note: f.note }));
}

// Settings ekraninin agaci: bolum -> modul -> hucreler.
export function catalogTree(section) {
  const rows = FEATURE_CATALOG.filter(f => f.section === section);
  const modules = [];
  for (const r of rows) {
    let m = modules.find(x => x.module === r.module);
    if (!m) { m = { module: r.module, items: [] }; modules.push(m); }
    m.items.push(r);
  }
  return modules;
}

export const FEATURE_KEYS = FEATURE_CATALOG.map(f => f.key);
