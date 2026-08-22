// deadhead.test.js — KONUMLANDIRMA (SHT-FTL/HG Md.14), 22 Agu 2026
//
// Serkan: *"yer gorevlerine DH deadhead (baska bir havayolu ile pozisyon
// ucusu); burada yapilan ucus suresi kadar duty time girilir (flt duty
// degil)"* · *"duty time devamindaki resti belirler ama flight duty gibi flt
// time limitlerini belirlemez"* · *"DH arkasina DH sektor ekleme veya FLT duty
// ekleme opsiyonu koyacagiz."*
//
// Kurallar UYDURULMADI, Serkan "SHT'ye bak" dedi ve mevzuattan okundu:
//   Md.14(1)(a) konumlandirmada harcanan TUM ZAMAN gorev suresidir
//   Md.14(1)(b) konumlandirma SEKTOR SAYILMAZ; ancak ucus operasyonu
//               ONCESINDEKI konumlandirma UGS (FDP) olarak sayilir
//   Md.14(1)(c) ucus sonrasi konumlandirma hak edilen dinlenmede dikkate alinir
//   Md.4(n)     yerel ulasim konumlandirma DEGILDIR -> rapor payi yok
import fs from 'fs';
import path from 'path';
import { dutyWindow, cumulatives } from './FTLEngine';

const REG = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'ruleset-hg', 'ruleset_hg_regulation.json'), 'utf8'));
const RS = { regulation: REG,
             company: { overrides:{}, pre_flight_report_minutes:60,
                        post_flight_duty_minutes:30, mandatory_report_hours:72 } };

const dh   = (dep, dest, etd, eta, flt) => ({ dep, dest, etd, eta, flight_no: flt, deadhead: true });
const uçuş = (dep, dest, etd, eta)      => ({ dep, dest, etd, eta });

describe('DH bacagi UGS icindedir ama SEKTOR degildir', () => {
  // Konumlandirma LTAC->IST 08:00-09:30, sonra IST'ten ucus 11:00-14:00.
  const legs = [dh('LTAC','LTBA','08:00','09:30','TK123'), uçuş('LTBA','LFMN','11:00','14:00')];

  test('UGS konumlandirmanin KALKISINDA baslar — rapor payi EKLENMEZ (Md.4/n)', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.report).toBe('08:00');            // 07:00 DEGIL
  });

  test('UGS son ucusun inisine kadar surer (Md.14/1/b)', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.fdpMin).toBe(6 * 60);             // 08:00 → 14:00
  });

  test('🔴 SEKTOR SAYISI DH HARIC — Tablo-1 bir sektor okur, iki degil', () => {
    const dhli   = dutyWindow(legs, 'hotel', RS);
    const dhsiz  = dutyWindow([uçuş('LTBA','LFMN','11:00','14:00')], 'hotel', RS);
    // Ayni bantta ayni sektor sayisi -> ayni azami UGS
    expect(dhli.maxFdpMin).toBe(dhsiz.maxFdpMin);
  });

  test('🔴 UCUS SURESI DH HARIC (Md.27 gunluk sinir)', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.flightMin).toBe(3 * 60);          // yalniz 11:00-14:00; DH'nin 1:30'u YOK
  });

  test('GOREV SURESI ucus sonrasi payla biter', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.dutyMin).toBe(6 * 60 + 30);
  });

  test('DH ile baslamayan gorevde rapor payi AYNEN durur', () => {
    const w = dutyWindow([uçuş('LTBA','LFMN','11:00','14:00')], 'hotel', RS);
    expect(w.report).toBe('10:00');
  });
});

describe('Acik mesai (Md.15) DH beklemesinden UZATMA almaz', () => {
  // Aktarmali konumlandirma: aradaki 2,5 saatlik bekleme bir "mola" degildir.
  // Uzatma vermek UGS tavanini yukseltirdi -> emniyet kapisi gevserdi (Ilke 7).
  const legs = [dh('LTAC','LTBA','08:00','09:30','TK123'),
                dh('LTBA','LFMN','12:00','14:00','TK456'),
                uçuş('LFMN','LIMJ','15:00','16:00')];

  test('DH aktarma beklemesi split molasi sayilmaz', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    expect(w.split.isSplit).toBe(false);
    expect(w.split.extensionMin).toBe(0);
  });

  test('tek ucus bacagi kaldigi icin sektor sayisi 1', () => {
    const w = dutyWindow(legs, 'hotel', RS);
    const tek = dutyWindow([uçuş('LFMN','LIMJ','15:00','16:00')], 'hotel', RS);
    expect(w.maxFdpMin).toBe(tek.maxFdpMin);
  });
});

describe('Kumulatifler — DH ucus saatine girmez, gorev saatine girer', () => {
  const gorev = {
    id: 'd1', pilot_id: 'P1', duty_type: 'flight', status: 'actual',
    duty_date: '2026-08-20',
    report_time: '2026-08-20T08:00:00Z',
    duty_end:    '2026-08-20T14:30:00Z',
    sectors: [
      { dep:'LTAC', dest:'LTBA', off_block:'08:00', on_block:'09:30', deadhead: true },
      { dep:'LTBA', dest:'LFMN', off_block:'11:00', on_block:'14:00' },
    ],
  };
  const asOf = new Date('2026-08-20T20:00:00Z');

  test('🔴 UCUS SAATI yalniz gercek sektorden — DH sayilmaz', () => {
    const c = cumulatives(null, [gorev], asOf, REG);
    expect(c.flt28d).toBe(3 * 60);             // 4:30 DEGIL
  });

  test('GOREV SURESI butun pencereden sayilir (Md.14/1/a)', () => {
    const c = cumulatives(null, [gorev], asOf, REG);
    expect(c.duty7d).toBe(6 * 60 + 30);        // 08:00 → 14:30
  });
});
