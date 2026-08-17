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
import { computeExpiry, medicalValidityMonths, trainingStatus, ageAt } from './TrainingRules';

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

describe('Alarm kademeleri 60/30/15 ve gun siniri', () => {
  const A = [60, 30, 15];
  test.each([
    ['2026-06-02', 'VALID'],
    ['2026-07-17', 'NOTICE'],
    ['2026-08-11', 'WARNING'],
    ['2026-08-21', 'CRITICAL'],
    ['2026-08-31', 'CRITICAL'],   // bitis GUNU hala gecerli
    ['2026-09-01', 'EXPIRED'],    // ertesi gun
  ])('%s -> %s', (t, want) => {
    expect(trainingStatus('2026-08-31', A, t).state).toBe(want);
  });
});
