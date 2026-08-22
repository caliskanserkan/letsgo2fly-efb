// mixedOperation.test.js — KARISIK FAALIYET TIPLI GOREV (22 Agu 2026)
//
// 🔴 SAHA: tek gorevin iki bacagi FARKLI tipteydi —
//    LTAC→LTFE `RMK/BUSINESS FLIGHT` (hava taksi, Md.22 Tablo-1)
//    LTFE→LFMN `RMK/PRIVATE FLIGHT`  (genel havacilik, Md.25 duz)
//    Serkan: *"birinci bacak business ikinci bacak general aviation, bu sekilde
//    uculdu."* Gorev tek tip tasidigi icin arsiv `match_review` kaldirmisti.
//
// 🔑 Serkan'in kurali: *"en dar kapsamli belirler gorev suresi limitini, ve bu
//    mutlaka uyari olarak verilmeli: mix bir gorev olarak planlandi, kapsam dar
//    olana gore belirlenecek desin PLANLAMA YAPILIRKEN."*
//    Gerekcesi Ilke 7: bir bacagi ticari ise, o bacagi da kapsayan TEK UGS
//    penceresine genel havaciligin daha UZUN limitini uygulamak gevsetmedir.
//
// SIRALAMA KODA GOMULU DEGIL: hangi tipin dar oldugu ruleset'ten OLCULUR.
import fs from 'fs';
import path from 'path';
import { dutyWindow, governingOperation, maxFdpMinutes, effectiveRules } from './FTLEngine';

const REG = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'ruleset-hg', 'ruleset_hg_regulation.json'), 'utf8'));
const RS = { regulation: REG,
             company: { overrides:{}, pre_flight_report_minutes:60,
                        post_flight_duty_minutes:30, mandatory_report_hours:72 } };
const { rules } = effectiveRules(RS);

const bacak = (dep, dest, etd, eta, tip) => ({ dep, dest, etd, eta, operation_type: tip });

describe('Ruleset ne diyor — sayilar OLCULUR, varsayilmaz', () => {
  test('06:00-15:00 bandi, 2 sektor, cift pilot: hava taksi 13:30 / genel havacilik 14:00', () => {
    expect(maxFdpMinutes('07:00', 2, rules, { operationType:'air_taxi' })).toBe(13 * 60 + 30);
    expect(maxFdpMinutes('07:00', 2, rules, { operationType:'general_aviation' })).toBe(14 * 60);
  });
});

describe('governingOperation — en KISITLAYICI kazanir', () => {
  test('hava taksi + genel havacilik → hava taksi (13:30 < 14:00)', () => {
    expect(governingOperation(['general_aviation','air_taxi'], '07:00', 2, rules))
      .toBe('air_taxi');
  });

  test('sira onemsiz — girdi sirasi sonucu degistirmez', () => {
    expect(governingOperation(['air_taxi','general_aviation'], '07:00', 2, rules))
      .toBe('air_taxi');
  });

  test('tek tip varsa o doner', () => {
    expect(governingOperation(['general_aviation'], '07:00', 2, rules)).toBe('general_aviation');
  });

  test('tip yoksa null — uydurma yok', () => {
    expect(governingOperation([], '07:00', 2, rules)).toBeNull();
  });
});

describe('dutyWindow — SAHA VAKASI (22 Agu, LTAC→LTFE→LFMN)', () => {
  const legs = [
    bacak('LTAC','LTFE','08:00','09:05','air_taxi'),          // BUSINESS
    bacak('LTFE','LFMN','10:40','13:35','general_aviation'),  // PRIVATE
  ];

  test('KARISIK oldugu SOYLENIR — ekran uyarabilsin diye', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.mixedOperation).toBe(true);
    expect(w.operationTypes.sort()).toEqual(['air_taxi','general_aviation']);
  });

  test('🔴 LIMIT EN DAR TIPE GORE — 13:30, 14:00 DEGIL', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.operationType).toBe('air_taxi');
    expect(w.maxFdpMin).toBe(13 * 60 + 30);
  });

  test('gevsek tip secilseydi limit 14:00 olurdu — kaybedilen emniyet payi 30 dk', () => {
    const hepsiGA = legs.map(l => ({ ...l, operation_type: 'general_aviation' }));
    expect(dutyWindow(hepsiGA, 'hotel', RS).maxFdpMin).toBe(14 * 60);
  });

  test('tek tipli gorevde karisik BAYRAGI kalkmaz', () => {
    const hepsiAT = legs.map(l => ({ ...l, operation_type: 'air_taxi' }));
    const w = dutyWindow(hepsiAT, 'hotel', RS);
    expect(w.mixedOperation).toBe(false);
    expect(w.operationType).toBe('air_taxi');
  });

  test('ESKI CAGRILAR BOZULMAZ: bacaklarda tip yoksa opts.operationType gecerli', () => {
    const tipsiz = legs.map(({ operation_type, ...r }) => r);
    const w = dutyWindow(tipsiz, 'hotel', RS, { operationType: 'general_aviation' });
    expect(w.mixedOperation).toBe(false);
    expect(w.operationType).toBe('general_aviation');
    expect(w.maxFdpMin).toBe(14 * 60);
  });
});

describe('DH bacagi tip belirlemez (Md.14/1/b — sektor sayilmaz)', () => {
  test('konumlandirma bacagi karisiklik URETMEZ', () => {
    const legs = [
      { dep:'LTAC', dest:'LTBA', etd:'06:00', eta:'07:00', deadhead:true, operation_type:'air_taxi' },
      bacak('LTBA','LFMN','09:00','12:00','general_aviation'),
    ];
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.mixedOperation).toBe(false);
    expect(w.operationType).toBe('general_aviation');
  });
});
