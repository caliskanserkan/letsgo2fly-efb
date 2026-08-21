// backdatedDuty.test.js — GECMISE GIRILEN GOREV (21 Agu 2026)
//
// 🔴 BU DOSYANIN VARLIK SEBEBI — SAHA BULGUSU (Serkan, 21 Agu):
//    "21 Agustos aksami, 21 Agustos sabahina 2 bacaklik gorev girdim, beni
//     uyarmadi halbuki saat gecti."
//    Kok neden: gecmis olcusu TARIH METNIYDI (`date < today`). Ayni gun icinde
//    bitmis gorev "gecmis" sayilmiyor, `planned` olarak aciliyor ve kumulatiflere
//    planli saat olarak giriyordu.
//
// Serkan'in kurali: "gorevin bitis saati ON block + 30, su anki andan geride ise"
//                   "gorevin bitis saati gorevin girildigi saatten geride ise"
import { isPastDuty, backdateRows } from './FTLEngine';

describe('isPastDuty — olcu gorevin BITISI', () => {
  test('SAHA VAKASI: bugun sabah biten gorev, aksam girilirse GECMISTIR', () => {
    // 21 Agu 08:00 rapor, iki bacak, ~13:30'da biten gorev; giris 21:57.
    expect(isPastDuty('2026-08-21T13:30:00.000Z', '2026-08-21T21:57:00.000Z')).toBe(true);
  });

  test('ESKI KUSUR: ayni gun oldugu icin "gecmis degil" demek YANLIS', () => {
    const eskiOlcu = '2026-08-21' < '2026-08-21T21:57:00.000Z'.slice(0, 10); // false
    expect(eskiOlcu).toBe(false);                                  // eski kod boyle diyordu
    expect(isPastDuty('2026-08-21T13:30:00.000Z', '2026-08-21T21:57:00.000Z')).toBe(true);
  });

  test('SUREGELEN gorev gecmis SAYILMAZ — bitisi ileride', () => {
    expect(isPastDuty('2026-08-21T23:30:00.000Z', '2026-08-21T21:57:00.000Z')).toBe(false);
  });

  test('gelecek gunun gorevi gecmis degildir', () => {
    expect(isPastDuty('2026-08-25T13:30:00.000Z', '2026-08-21T21:57:00.000Z')).toBe(false);
  });

  test('🔴 AN karsilastirilir, METIN degil — "+00:00" ile ".000Z" AYNI ANdir', () => {
    // Metin karsilastirmasi '+' < '.' oldugu icin "gecmis" derdi. 21 Agu sabahi
    // archive-flight'ta tam bu kusur sekiz bos denetim izi dusurdu.
    const end = '2026-08-21T12:00:00+00:00';
    const now = '2026-08-21T12:00:00.000Z';
    expect(end < now).toBe(true);            // metin: yanlis cevap
    expect(isPastDuty(end, now)).toBe(false); // an: dogru cevap (esit, geride degil)
  });

  test('bozuk/eksik saat gecmis SAYILMAZ — sessiz yanlis yerine hicbir sey', () => {
    expect(isPastDuty(null, '2026-08-21T21:57:00.000Z')).toBe(false);
    expect(isPastDuty('', '2026-08-21T21:57:00.000Z')).toBe(false);
    expect(isPastDuty('not-a-date', '2026-08-21T21:57:00.000Z')).toBe(false);
    expect(isPastDuty('2026-08-21T13:30:00.000Z', 'not-a-date')).toBe(false);
  });
});

describe('backdateRows — gecmis satirlar actual olur', () => {
  const now = '2026-08-21T21:57:00.000Z';
  const ucus = () => ({
    duty_type: 'flight', status: 'planned',
    report_time: '2026-08-21T07:00:00.000Z',
    duty_end: '2026-08-21T13:30:00.000Z',
    sectors: [
      { seq: 1, dep: 'LSGG', dest: 'EGLF', etd: '08:00', eta: '09:40', role: 'PF' },
      { seq: 2, dep: 'EGLF', dest: 'LTAC', etd: '10:30', eta: '13:00', role: 'PF' },
    ],
  });

  test('gecmis ucus: status actual + duty_finished + gercek bloklar', () => {
    const { past, rows } = backdateRows([ucus()], now);
    expect(past).toBe(true);
    expect(rows[0].status).toBe('actual');
    expect(rows[0].duty_finished).toBe(true);
    expect(rows[0].sectors.map(s => [s.off_block, s.on_block, s.entered_manually]))
      .toEqual([['08:00', '09:40', true], ['10:30', '13:00', true]]);
  });

  test('girdi DEGISTIRILMEZ (saf) — cagiran satiri hala planned gorur', () => {
    const girdi = ucus();
    backdateRows([girdi], now);
    expect(girdi.status).toBe('planned');
    expect(girdi.sectors[0].off_block).toBeUndefined();
  });

  test('gelecekteki gorev planned kalir', () => {
    const ileri = { ...ucus(), duty_end: '2026-08-25T13:30:00.000Z' };
    const { past, rows } = backdateRows([ileri], now);
    expect(past).toBe(false);
    expect(rows[0].status).toBe('planned');
  });

  test('GROUND satirinda bos `sectors: []` ACILMAZ (1b hayalet satiri)', () => {
    const gnd = { duty_type: 'ground', status: 'planned',
                  report_time: '2026-08-21T09:00:00.000Z',
                  duty_end: '2026-08-21T13:00:00.000Z' };
    const { past, rows } = backdateRows([gnd], now);
    expect(past).toBe(true);
    expect(rows[0].status).toBe('actual');
    expect('sectors' in rows[0]).toBe(false);
  });

  test('OFF satirina DOKUNULMAZ — durumu offPeriodStatuses belirler', () => {
    const off = { duty_type: 'off', status: 'planned', duty_date: '2026-08-19' };
    const { rows } = backdateRows([off, ucus()], now);
    expect(rows[0]).toBe(off);          // ayni nesne, hic dokunulmadi
    expect(rows[1].status).toBe('actual');
  });

  test('ayni atamanin butun pilot satirlari birlikte cevrilir', () => {
    const { past, rows } = backdateRows([ucus(), ucus()], now);
    expect(past).toBe(true);
    expect(rows.every(r => r.status === 'actual')).toBe(true);
  });
});
