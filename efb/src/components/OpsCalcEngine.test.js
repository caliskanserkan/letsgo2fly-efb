import { fitPhaseProfile } from './OpsCalcEngine';


// ── KENDI VERIMIZDEN PROFIL (16 Agu 2026) ────────────────────────────────
// Gercek havuz verisiyle (TC-REC, 9 safha olcumu) dogrulanir.
describe('fitPhaseProfile', () => {
  // aircraft_perf_samples'tan alinan GERCEK satirlar
  const REAL = [
    { ete_min: 23,  trip_fuel_lb: 1311,  climb_min: 7,  desc_min: 13 },
    { ete_min: 24,  trip_fuel_lb: 1311,  climb_min: 7,  desc_min: 14 },
    { ete_min: 26,  trip_fuel_lb: 1561,  climb_min: 7,  desc_min: 15 },
    { ete_min: 27,  trip_fuel_lb: 1561,  climb_min: 7,  desc_min: 16 },
    { ete_min: 30,  trip_fuel_lb: 1472,  climb_min: 4,  desc_min: 8  },
    { ete_min: 55,  trip_fuel_lb: 3312,  climb_min: 11, desc_min: 14 },
    { ete_min: 60,  trip_fuel_lb: 3108,  climb_min: 9,  desc_min: 26 },
    { ete_min: 221, trip_fuel_lb: 10385, climb_min: 15, desc_min: 23 },
    { ete_min: 245, trip_fuel_lb: 11857, climb_min: 23, desc_min: 23 },
  ];

  test('gercek havuzdan uc safha sarfiyatini cozer', () => {
    const p = fitPhaseProfile(REAL);
    expect(p).not.toBeNull();
    // 12 Agu'da tek OFP'den ELLE olculen tirmanma 6754 lb/h idi — %5 icinde.
    expect(p.climbFF).toBeGreaterThan(6400);
    expect(p.climbFF).toBeLessThan(7600);
    expect(p.cruiseFF).toBeGreaterThan(2300);
    expect(p.cruiseFF).toBeLessThan(2800);
    expect(p.r2).toBeGreaterThan(0.99);
    expect(p.nPhase).toBe(9);
  });

  test('safha sirasi fizige uygun: tirmanma > seyir > alcalma degil, ama hepsi pozitif', () => {
    const p = fitPhaseProfile(REAL);
    expect(p.climbFF).toBeGreaterThan(p.cruiseFF);   // tirmanma en cok yakar
    expect(p.descFF).toBeGreaterThan(0);             // negatif sarfiyat olamaz
  });

  test('veri yetersizse null doner — uydurma yok', () => {
    expect(fitPhaseProfile([])).toBeNull();
    expect(fitPhaseProfile(REAL.slice(0, 2))).toBeNull();
  });

  test('safha olcumu olmayan ornekler haric tutulur', () => {
    const mixed = [...REAL, { ete_min: 45, trip_fuel_lb: 3295, climb_min: null, desc_min: null }];
    const p = fitPhaseProfile(mixed);
    expect(p.n).toBe(10);        // havuzdaki toplam
    expect(p.nPhase).toBe(9);    // olcumu OLAN
  });

  test('negatif/tutarsiz cozum uretirse null doner', () => {
    const bad = [
      { ete_min: 60, trip_fuel_lb: 100,   climb_min: 10, desc_min: 10 },
      { ete_min: 60, trip_fuel_lb: 20000, climb_min: 10, desc_min: 10 },
      { ete_min: 60, trip_fuel_lb: 50,    climb_min: 10, desc_min: 10 },
    ];
    expect(fitPhaseProfile(bad)).toBeNull();
  });
});
