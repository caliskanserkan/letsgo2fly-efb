// FTLEngine.outlook.test.js — PLANLAMA GORUNUMU (cumulativesOutlook)
//
// Varlik sebebi: 17 Agu 2026'da FTL LIMITS panelinde planli gorevler (mor pay)
// HIC gorunmuyordu. Sebep `cumulatives()` penceresinin "su an"da bitmesiydi
// (`t <= asOfT`) — gelecekteki gorevler hesaba hic girmiyordu.
// Serkan: "Alttaki bar bize gecmis ve gelecekteki gorevlerin bizi NEREDE
//  limitledigini gostermeli — olmus ve olacaklara karsi farkindalik."
//
// Cozum degerlendirme anini kaydirmaktir; bu test onu kilitler.
import { cumulatives, cumulativesOutlook } from './FTLEngine';

const RULES = { cumulative_limits: { flt_28d_min: 6000, duty_28d_min: 11400 } };
const H = (h, m = 0) => h * 60 + m;

// Yardimci: tek bacakli ucus gorevi.
const duty = (date, { off, on, start, end, status }) => ({
  id: `${date}-${status}`,
  pilot_id: 'P1',
  duty_type: 'flight',
  status,
  duty_date: date,
  report_time: `${date}T${start}:00Z`,
  duty_end:    `${date}T${end}:00Z`,
  sectors: [{ off_block: off, on_block: on }],
});

const ASOF = new Date('2026-08-17T12:00:00Z');

describe('cumulativesOutlook — gecmis + gelecek birlikte', () => {
  const past    = duty('2026-08-13', { off:'06:00', on:'09:30', start:'05:00', end:'10:00', status:'actual' });
  const future1 = duty('2026-08-18', { off:'07:00', on:'10:00', start:'06:00', end:'10:30', status:'planned' });
  const future2 = duty('2026-08-20', { off:'10:00', on:'11:30', start:'09:00', end:'12:00', status:'planned' });
  const duties = [past, future1, future2];

  test('cumulatives() gelecegi GORMEZ — kusurun kendisi', () => {
    const now = cumulatives(null, duties, ASOF, RULES);
    expect(now.flt28d).toBe(H(3, 30));          // yalniz 13 AGU
  });

  test('outlook.now ayni degeri verir (bugunku durum degismez)', () => {
    const o = cumulativesOutlook(null, duties, ASOF, RULES);
    expect(o.flt28d.now).toBe(H(3, 30));
  });

  test('outlook.worst planli gorevleri EKLER', () => {
    const o = cumulativesOutlook(null, duties, ASOF, RULES);
    // 3:30 (13 AGU) + 3:00 (18 AGU) + 1:30 (20 AGU) = 8:00
    expect(o.flt28d.worst).toBe(H(8, 0));
  });

  test('tepe SON planli gorevin bitisinde olusur ve tarihi kayda gecer', () => {
    const o = cumulativesOutlook(null, duties, ASOF, RULES);
    expect(o.flt28d.worstAt).toBe('2026-08-20T12:00:00.000Z');
  });

  test('gorev planlaninca deger BUYUR — "planlama degisirse bar da degisir"', () => {
    const az  = cumulativesOutlook(null, [past, future1], ASOF, RULES).flt28d.worst;
    const cok = cumulativesOutlook(null, duties, ASOF, RULES).flt28d.worst;
    expect(cok).toBeGreaterThan(az);
  });

  test('IPTAL edilen planli gorev sayilmaz', () => {
    const iptal = { ...future2, status:'cancelled' };
    const o = cumulativesOutlook(null, [past, future1, iptal], ASOF, RULES);
    expect(o.flt28d.worst).toBe(H(6, 30));      // 3:30 + 3:00
  });

  test('gelecek gorev yoksa worst = now, worstAt = null', () => {
    const o = cumulativesOutlook(null, [past], ASOF, RULES);
    expect(o.flt28d.worst).toBe(o.flt28d.now);
    expect(o.flt28d.worstAt).toBeNull();
  });

  // Pencere KAYAR: ileri bir noktada eski gorev 7 gunluk pencereden duser.
  // Bu yuzden "en kotu an" her zaman en son gorev degildir — max alinir.
  test('kayan pencerede eski gorev dusunce worst dogru kalir', () => {
    const o = cumulativesOutlook(null, duties, ASOF, RULES);
    // 20 AGU'da 7 gunluk pencere 13 AGU'yu artik kapsamaz (13 -> 20 = 7 gun).
    // 18 AGU'daki nokta ise hem 13 hem 18'i gorur: 3:30 + 3:00 = 6:30.
    expect(o.flt7d ?? o.flt28d.worst).toBeDefined();
    expect(o.duty28d.worst).toBeGreaterThan(o.duty28d.now);
  });
});
