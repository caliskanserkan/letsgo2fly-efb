// TrainingRules.test.js — EGITIM GECERLILIK HESABI REGRESYON TESTI
//
// Bu dosyanin varlik sebebi: 17 Agu 2026'da ilk surumde CARRY_FORWARD dali
// duz addMonths kullaniyordu ve TAKVIM AYI sayan kalemlerde zincir kayiyordu:
//   12 SUB 26 -> 31 AGU 26 -> 28 SUB 27 -> 28 AGU 27   (olmasi gereken 31 AGU)
// Ekranda fark 3 gundu; kimse gozle yakalamazdi. Test yakaladi.
//
// Beklenen degerler MEVZUAT METNINDEN turetilmistir — degistirmeden once
// kaynagi oku:
//   SHT-OPS EK-3 · ORO.FC.230 (b)(3),(c),(d),(g),(h)
//   SHT-FCL     · FCL.740(a), FCL.740.A(a)(1), FCL.055(c)
//   SHT-MED     · MED.A.045 (a)(1),(a)(2),(a)(5),(b)
import {
  computeExpiry, medicalValidityMonths, trainingStatus, ageAt,
  todayLocal, ALERT_DAYS, STATE_COLOR, STATE_RANK, worstState,
  latestPerTraining, previousRecord,
} from './TrainingRules';

// Katalog satirlarinin test karsiliklari (goc dosyasindaki seed ile ayni).
const OPC  = { anchor_rule:'END_OF_MONTH', carry_forward_window:3,  carry_forward_unit:'MONTHS', legal_reference:'ORO.FC.230' };
const MED  = { anchor_rule:'CHECK_DATE',   carry_forward_window:45, carry_forward_unit:'DAYS',   age_dependent:true, legal_reference:'MED.A.045' };
const LPC  = { anchor_rule:'CHECK_DATE',   carry_forward_window:3,  carry_forward_unit:'MONTHS', legal_reference:'FCL.740' };
const ELP6 = { no_expiry:true, legal_reference:'FCL.055(c)' };

const exp = (o) => computeExpiry(o).expiresAt;

describe('ORO.FC.230(g) — gecerlilik KONTROLUN YAPILDIGI AYIN SONUNDAN sayilir', () => {
  test('OPC 12 SUB 26 + 6 takvim ayi -> 31 AGU 26 (12 AGU degil)', () => {
    expect(exp({ completed:'2026-02-12', validityMonths:6, cat:OPC })).toBe('2026-08-31');
  });
  test('uygulanan kural kayda gecer', () => {
    expect(computeExpiry({ completed:'2026-02-12', validityMonths:6, cat:OPC }).appliedRule)
      .toBe('END_OF_MONTH');
  });
});

describe('ORO.FC.230(h) — son 3 ay icinde yenileme, ASIL SON GECERLILIK TARIHINDEN', () => {
  test('bitis 31 AGU 26, yenileme 10 TEM 26 (pencere ICI) -> 28 SUB 27', () => {
    expect(exp({ completed:'2026-07-10', validityMonths:6, cat:OPC, prevExpiry:'2026-08-31' }))
      .toBe('2027-02-28');
  });

  // 🔴 REGRESYON: capa ay sonu ise SONUC DA ay sonudur. Duz addMonths
  //    28 SUB + 6 ay = 28 AGU verir ve zincir her turda birkac gun kayar.
  test('bir sonraki tur da pencere ICI -> ay SABIT kalir (31 AGU, 28 AGU degil)', () => {
    expect(exp({ completed:'2027-01-15', validityMonths:6, cat:OPC, prevExpiry:'2027-02-28' }))
      .toBe('2027-08-31');
  });

  test('pencere DISI yenileme -> capa kontrol ayinin sonuna kayar', () => {
    expect(exp({ completed:'2026-03-10', validityMonths:6, cat:OPC, prevExpiry:'2026-08-31' }))
      .toBe('2026-09-30');
  });
  test('gecikmis yenileme (bitisten SONRA) -> devir yok', () => {
    expect(exp({ completed:'2026-09-05', validityMonths:6, cat:OPC, prevExpiry:'2026-08-31' }))
      .toBe('2027-03-31');
  });
});

describe('MED.A.045(b) — temdit penceresi 45 GUN (ay degil)', () => {
  test('bitise 36 gun kala temdit -> onceki bitisten', () => {
    expect(exp({ completed:'2027-05-01', validityMonths:12, cat:MED, prevExpiry:'2027-06-06' }))
      .toBe('2028-06-06');
  });
  test('bitise 66 gun kala (pencere DISI) -> muayene tarihinden', () => {
    expect(exp({ completed:'2027-04-01', validityMonths:12, cat:MED, prevExpiry:'2027-06-06' }))
      .toBe('2028-04-01');
  });
  test('ilk kayit -> muayene tarihinden, ay sonuna YUVARLANMAZ', () => {
    expect(exp({ completed:'2026-06-06', validityMonths:12, cat:MED })).toBe('2027-06-06');
  });
});

describe('MED.A.045(a)(2),(a)(5)(i) — yas MUAYENE TARIHINDEKI yastir', () => {
  test('muayenede 59 -> 12 ay (sure icinde 60 olmasi kisaltmaz)', () => {
    expect(ageAt('1966-03-01', '2026-02-01')).toBe(59);
    expect(medicalValidityMonths('1966-03-01', '2026-02-01')).toBe(12);
  });
  test('muayenede 60 -> 6 ay', () => {
    expect(ageAt('1966-03-01', '2026-04-01')).toBe(60);
    expect(medicalValidityMonths('1966-03-01', '2026-04-01')).toBe(6);
  });
  test('tek pilotlu ticari yolcu + 40 yas -> 6 ay', () => {
    expect(medicalValidityMonths('1980-01-01', '2026-01-01', { singlePilotPax:true })).toBe(6);
  });
  // Ilke 1: bilmedigimizi bilmiyormus gibi degil, HIC hesaplamayiz.
  test('dogum tarihi yoksa null doner — varsayilan uydurulmaz', () => {
    expect(medicalValidityMonths(null, '2026-01-01')).toBeNull();
  });
});

describe('FCL.740 — tip yetkisi 12 ay, pencere 3 ay', () => {
  test('pencere ICI yenileme -> onceki bitisten', () => {
    expect(exp({ completed:'2027-01-10', validityMonths:12, cat:LPC, prevExpiry:'2027-02-28' }))
      .toBe('2028-02-28');
  });
  test('pencere DISI (erken) -> "yeterlilik kontrolu TARIHINDEN itibaren"', () => {
    expect(exp({ completed:'2026-10-01', validityMonths:12, cat:LPC, prevExpiry:'2027-02-28' }))
      .toBe('2027-10-01');
  });
});

describe('FCL.055(c) — seviye 6 yeniden degerlendirilmez', () => {
  test('ELP6 suresizdir', () => {
    const r = computeExpiry({ completed:'2026-01-01', validityMonths:null, cat:ELP6 });
    expect(r.expiresAt).toBeNull();
    expect(r.appliedRule).toBe('NO_EXPIRY');
  });
});

describe('Sure girilmemisse hesap YAPILMAZ (Ilke 1)', () => {
  test('validityMonths yoksa INTERVAL NOT SET', () => {
    const r = computeExpiry({ completed:'2026-01-01', validityMonths:null, cat:OPC });
    expect(r.expiresAt).toBeNull();
    expect(r.note).toBe('INTERVAL NOT SET');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 19 AGU 2026 — SABIT ESIKLER + UC RENK KADEMESI
// Serkan: "60-30 arasi sari, 30-15 arasi amber, 15-0 kirmizi",
//         "ayni kalsin 60/30/15 degismesin",
//         "en yuksek oncelik rengi belirler".
// ═══════════════════════════════════════════════════════════════════
describe('Alarm kademeleri SABIT 60/30/15 ve gun siniri', () => {
  test('esikler kayit basina degistirilemez — tek kaynak', () => {
    expect(ALERT_DAYS).toEqual({ NOTICE: 60, WARNING: 30, CRITICAL: 15 });
  });

  test.each([
    ['2026-06-02', 'VALID'],
    ['2026-07-02', 'NOTICE'],     // tam 60 gun -> sinir SIKI tarafa duser
    ['2026-07-17', 'NOTICE'],
    ['2026-08-01', 'WARNING'],    // tam 30 gun
    ['2026-08-11', 'WARNING'],
    ['2026-08-16', 'CRITICAL'],   // tam 15 gun
    ['2026-08-21', 'CRITICAL'],
    ['2026-08-31', 'CRITICAL'],   // bitis GUNU hala gecerli (daysLeft = 0)
    ['2026-09-01', 'EXPIRED'],    // ertesi gun
  ])('%s -> %s', (t, want) => {
    expect(trainingStatus('2026-08-31', t).state).toBe(want);
  });

  // 🔴 REGRESYON: sayac HER GUN geriye dusmeli (Serkan). Sayi saklanmaz,
  //    her cagride expires_at'ten turetilir.
  test('sayac her gun bir azalir', () => {
    expect(trainingStatus('2026-08-31', '2026-08-21').daysLeft).toBe(10);
    expect(trainingStatus('2026-08-31', '2026-08-22').daysLeft).toBe(9);
    expect(trainingStatus('2026-08-31', '2026-08-30').daysLeft).toBe(1);
    expect(trainingStatus('2026-08-31', '2026-08-31').daysLeft).toBe(0);
  });
});

describe('Renk kademeleri — UC AYRI renk olmak ZORUNDA', () => {
  // Bu testin varlik sebebi: 19 Agu'dan once NOTICE --amber (#fbbf24) idi ve
  // o token ekranda SARI gorunuyor. "amber" kademesine de --amber verilseydi
  // iki kademe tek renge coker, ekranda UC degil IKI kademe kalirdi.
  test('sari / amber / kirmizi birbirinden farkli', () => {
    const uc = [STATE_COLOR.NOTICE, STATE_COLOR.WARNING, STATE_COLOR.CRITICAL];
    expect(new Set(uc).size).toBe(3);
  });
  test('60-30 SARI, 30-15 AMBER, 15-0 KIRMIZI', () => {
    expect(STATE_COLOR.NOTICE).toBe('var(--yellow)');
    expect(STATE_COLOR.WARNING).toBe('var(--orange)');
    expect(STATE_COLOR.CRITICAL).toBe('var(--red)');
  });
  // Serkan: "suresi gecmis egitimler kirmizi uyari versin" — ayrimi renk degil
  // canda satirin ustundeki EXPIRED rozeti tasir.
  test('EXPIRED de kirmizi', () => {
    expect(STATE_COLOR.EXPIRED).toBe(STATE_COLOR.CRITICAL);
  });
});

describe('Oncelik — en yuksek kademe rengi belirler', () => {
  test('VALID ve NO_EXPIRY oncelik tablosunda YOK (cana dusmezler)', () => {
    expect(STATE_RANK.VALID).toBeUndefined();
    expect(STATE_RANK.NO_EXPIRY).toBeUndefined();
    expect(STATE_RANK.EXPIRED).toBeGreaterThan(STATE_RANK.CRITICAL);
    expect(STATE_RANK.CRITICAL).toBeGreaterThan(STATE_RANK.WARNING);
    expect(STATE_RANK.WARNING).toBeGreaterThan(STATE_RANK.NOTICE);
  });

  // 🔑 SERKAN'IN ORNEGI (19 Agu): "3 egitim var, 1. 50 gun kalmis, 2. 43 gun
  //    ve 3. 5 gun — can kirmizi olmasi lazim."
  test('50 gun + 43 gun + 5 gun -> can KIRMIZI', () => {
    const t = '2026-08-19';
    const durumlar = ['2026-10-08', '2026-10-01', '2026-08-24']
      .map(e => trainingStatus(e, t).state);
    expect(durumlar).toEqual(['NOTICE', 'NOTICE', 'CRITICAL']);
    expect(worstState(durumlar)).toBe('CRITICAL');
    expect(STATE_COLOR[worstState(durumlar)]).toBe('var(--red)');
  });

  test('hepsi sari ise can SARI — kirmizi uydurulmaz', () => {
    expect(STATE_COLOR[worstState(['NOTICE', 'NOTICE'])]).toBe('var(--yellow)');
  });
  test('dikkat isteyen yoksa null — can renksiz kalir', () => {
    expect(worstState([])).toBeNull();
    expect(worstState(['VALID', 'NO_EXPIRY'])).toBeNull();
  });
});

describe('Bugun YEREL takvim gunudur (UTC degil)', () => {
  // Serkan: "bu sayac lokal gun takip etmeli."
  // toISOString() UTC gunu verir: Turkiye'de (UTC+3) gece 00:00-03:00 arasi
  // tarih BIR GUN GERIDE kalir ve sayac 1 fazla gorunur.
  test('YYYY-MM-DD ve cihazin YEREL gunu', () => {
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const yerel = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(todayLocal()).toBe(yerel);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 19 AGU 2026 — KRONOLOJIK KURAL
// Serkan: "her zaman kronolojik siraya gore takip edecegiz, en son tarih
// belirleyecek uyarinin ne olacagini" · "girili butun kayitlar duracak
// sistemde tabii ki, ama uyari esigi en guncele gore".
//
// 🔴 BU BOLUMUN VARLIK SEBEBI CANLI VERIDIR. 19 Agu'da uretimden cekilen
//    AAK/LC satirlari: eski tarihli bir kayit IKINCI KEZ girilmis, giris
//    sirasina bakan eski mantik onu 'current' yapmis ve GERCEK EN YENI
//    kontrolu (2026-03-02) devre disi birakmisti. Ekranda LC bes ay ERKEN
//    bitiyor gorunuyordu, hicbir uyari cikmamisti.
// ═══════════════════════════════════════════════════════════════════
describe('Kronolojik kural — gecerli kaydi TARIH belirler, damga degil', () => {
  // Uretimden alinan gercek satirlar (AAK, LC). status alanlari BILEREK
  // yanlis: testin isi damganin yanlis oldugu durumda dogru cevabi vermek.
  const AAK_LC = [
    { id:'a', pilot_id:'AAK', training_code:'LC', completed_date:'2025-10-08',
      expires_at:'2026-10-31', status:'current',    created_at:'2026-08-18T10:00:00Z' },
    { id:'b', pilot_id:'AAK', training_code:'LC', completed_date:'2025-10-08',
      expires_at:'2026-10-31', status:'superseded', created_at:'2026-08-17T10:00:00Z' },
    { id:'c', pilot_id:'AAK', training_code:'LC', completed_date:'2026-03-02',
      expires_at:'2027-03-31', status:'superseded', created_at:'2026-08-17T11:00:00Z' },
  ];

  test('EN SON TARIHLI kayit gecerlidir — status damgasi yok sayilir', () => {
    const g = latestPerTraining(AAK_LC);
    expect(g).toHaveLength(1);
    expect(g[0].id).toBe('c');                    // 2026-03-02, damgasi 'superseded'
    expect(g[0].expires_at).toBe('2027-03-31');   // 2026-10-31 DEGIL
  });

  test('eski tarihli kaydi ikinci kez girmek daha yeniyi DEVIRMEZ', () => {
    // "a" satiri sonradan girilmis eski tarihli kopyadir; yine de gecerli olan
    // en yeni TARIHLI kayittir.
    expect(latestPerTraining(AAK_LC)[0].completed_date).toBe('2026-03-02');
  });

  test('ayni tarihli iki kayitta sonra girilen kazanir', () => {
    const g = latestPerTraining([AAK_LC[1], AAK_LC[0]]);   // ikisi de 2025-10-08
    expect(g[0].id).toBe('a');                             // created_at daha yeni
  });

  test('her (pilot + egitim) icin TEK gecerli kayit, digerleri listede kalir', () => {
    const hepsi = [...AAK_LC,
      { id:'d', pilot_id:'SCL', training_code:'LC', completed_date:'2026-03-02',
        expires_at:'2027-03-31', status:'current', created_at:'2026-08-17T12:00:00Z' }];
    expect(latestPerTraining(hepsi).map(r => r.id).sort()).toEqual(['c', 'd']);
    expect(hepsi).toHaveLength(4);   // kaynak liste DOKUNULMAZ — kayit silinmez
  });
});

describe('Devir capasi TARIHTEN bulunur — superseded_by baglantisina bakmaz', () => {
  const R = [
    { id:'x', pilot_id:'P', training_code:'OPC', completed_date:'2025-09-15', expires_at:'2026-03-31' },
    { id:'y', pilot_id:'P', training_code:'OPC', completed_date:'2026-02-10', expires_at:'2026-09-30' },
    { id:'z', pilot_id:'P', training_code:'LC',  completed_date:'2026-01-01', expires_at:'2027-01-31' },
  ];

  test('bir onceki kayit tarihe gore secilir', () => {
    expect(previousRecord(R, { pilotId:'P', code:'OPC', completed:'2026-08-01' }).id).toBe('y');
    expect(previousRecord(R, { pilotId:'P', code:'OPC', completed:'2026-01-01' }).id).toBe('x');
  });
  test('baska egitim kodu karismaz', () => {
    expect(previousRecord(R, { pilotId:'P', code:'LC', completed:'2026-08-01' }).id).toBe('z');
  });
  test('oncesinde kayit yoksa null — ilk kayit devir uygulamaz', () => {
    expect(previousRecord(R, { pilotId:'P', code:'OPC', completed:'2025-01-01' })).toBeNull();
  });
  test("EDIT: duzenlenen satirin capasi bir onceki kayittir", () => {
    // 'y' duzenleniyor -> capa 'x' olmali (kendisi haric, tarihce bir gerideki)
    expect(previousRecord(R, { pilotId:'P', code:'OPC', completed:'2026-02-10', excludeId:'y' }).id)
      .toBe('x');
  });

  test('EDIT: satir KENDI KENDISININ capasi olamaz', () => {
    // 'y' duzenlenip tarihi ileri aliniyor. excludeId olmasaydi 'y' kendi eski
    // tarihiyle (2026-02-10) kendi capasi olarak secilir ve bitis tarihi
    // kendi kendini besleyerek her duzenlemede kayardi.
    expect(previousRecord(R, { pilotId:'P', code:'OPC', completed:'2026-08-01' }).id).toBe('y');
    expect(previousRecord(R, { pilotId:'P', code:'OPC', completed:'2026-08-01', excludeId:'y' }).id)
      .toBe('x');
  });

  // Kural + capa birlikte: AAK'nin gercek LC zinciri bastan hesaplanirsa
  // en yeni kayit dogru tarihi vermeli (ORO.FC.230(g), pencere DISI yenileme).
  test('AAK/LC gercek zinciri: 2026-03-02 -> 2027-03-31', () => {
    const LC = { anchor_rule:'END_OF_MONTH', carry_forward_window:3, carry_forward_unit:'MONTHS' };
    expect(computeExpiry({ completed:'2026-03-02', validityMonths:12, cat:LC,
                           prevExpiry:'2026-10-31' }).expiresAt).toBe('2027-03-31');
  });
});
