// archiveDutyReport.test.js — GOREV RAPOR SAATI GERCEK OFF-BLOCK'TAN TURER
//
// 🔴 20 AGU 2026 SAHA (Serkan): gorev 18 Agu'da elle girilen bacaklarla
// acildi (etd 11:00 -> rapor 10:00), plan ucus SABAHI geldi (std 12:00) ve
// gercek off-block 11:10 oldu. `archive-flight` sektorleri, duty_end'i ve
// fdp_minutes'i guncelledi ama `report_time`'a HIC DOKUNMADI. 15 Tem karar
// metninde de o alan LISTEDE YOK — spec'te unutulmus.
//
// Serkan'in kurali: "plan saatlerine degil ACTUAL saatlere bakacagiz ...
// olmasi gereken: actual off-block -1h."
// Gecikme korumasi YOK cunku genel havacilikta ekip ucakta beklemez;
// koordinasyonu pilotlar yapar, saat kayarsa gorev de kayar.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../../../supabase/functions/archive-flight/index.ts');
const src = () => fs.readFileSync(SRC, 'utf8');

describe('rapor saati gercek off-block eksi bildirim suresi', () => {
  test('ilk sektorun GERCEK off-block u kaynak alinir', () => {
    expect(src()).toMatch(/const firstOff = sectors\[0\]\?\.off_block \? ts\(sectors\[0\]\.off_block, dutyDay\) : null;/);
  });

  test('bildirim suresi GOREVIN KENDI snapshot undan okunur (bugunun kurali degil)', () => {
    expect(src()).toMatch(/snapC0\.preFlightReportMin \?\? 60/);
    expect(src()).toMatch(/snapR0\.notification_times\?\.preflight_report_min \?\? 60/);
  });

  // 🔴 REGRESYON (21 Agu, uretimde goruldu): ilk surum METIN karsilastiriyordu.
  // Postgres timestamptz'i "...+00:00", toISOString() "....000Z" verir — ayni
  // an, farkli metin. Koruma hic calismadi; ikinci REGEN ayni degeri tekrar
  // yazip denetim tablosuna `10:10 -> 10:10` gibi BOS iz dusurdu (22 izin 8'i).
  test('rapor saati yalniz DEGISTIYSE yazilir — AN karsilastirilir, metin degil', () => {
    expect(src()).toMatch(/const prevMs = duty\.report_time \? new Date\(duty\.report_time\)\.getTime\(\) : NaN;/);
    expect(src()).toMatch(/if \(prevMs !== candMs\) \{/);
    expect(src()).not.toMatch(/if \(cand !== duty\.report_time\)/);
  });

  test('ayni an farkli metin olarak yazilabilir — kusurun kaynagi', () => {
    const pg  = '2026-08-20T10:10:00+00:00';        // Postgres timestamptz
    const iso = new Date(pg).toISOString();          // toISOString()
    expect(iso).not.toBe(pg);                        // metin FARKLI
    expect(new Date(iso).getTime()).toBe(new Date(pg).getTime());  // an AYNI
  });

  // 🔴 FDP rapor saatinden olculur; bayat degerle olculurse sure yanlis cikar.
  test('FDP GUNCEL rapor saatinden olculur', () => {
    expect(src()).toMatch(/new Date\(effReport\)\.getTime\(\)\) \/ 60000\);/);
    expect(src()).not.toMatch(/new Date\(duty\.report_time\)\.getTime\(\)\) \/ 60000\);/);
  });

  // Tablo-1 bandi RAPOR SAATINDEN okunur — rapor kayinca limit de kayabilir.
  test('azami UGS yeniden hesaplanir', () => {
    expect(src()).toMatch(/recomputeMaxFdp\(\{ \.\.\.duty, report_time: cand \}/);
  });

  // Denetim tablosunda saat SESSIZCE degismez.
  test('degisiklik ftl_duty_edits e gerekceyle yazilir', () => {
    expect(src()).toMatch(/field_name: "report_time"/);
    expect(src()).toMatch(/Derived from actual off-block/);
  });
});

describe('20 AGU sayilariyla dogrulama', () => {
  // Sahadaki gercek degerler — kuralin ne uretecegi burada acikca duruyor.
  const dk = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  test('off-block 11:10 -> rapor 10:10 (eskiden 10:00 idi)', () => {
    expect(hhmm(dk('11:10') - 60)).toBe('10:10');
  });

  test('FDP: son on-block 17:25 - rapor 10:10 = 7:15 (eskiden 7:25)', () => {
    expect(hhmm(dk('17:25') - dk('10:10'))).toBe('07:15');
    expect(hhmm(dk('17:25') - dk('10:00'))).toBe('07:25');   // eski, bayat rapor
  });
});
