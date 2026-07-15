// FTLEngine.js — saf FTL hesap motoru (UI yok, Supabase yok)
// TEK KAYNAK: ftl_rulesets satırı (regulation + company JSONB).
// Değerler koda GÖMÜLMEZ — SHT-FTL/EASA/FAA farkları ruleset'ten gelir.
// Tüm süreler DAKİKA cinsinden hesaplanır; "HH:MM" yalnız giriş/çıkış formatıdır.

// ── zaman yardımcıları ──────────────────────────────────────────────
export const toMin = (hhmm) => {
  if (hhmm == null || hhmm === '') return null;
  if (typeof hhmm === 'number') return hhmm;
  const parts = String(hhmm).split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts[0] * 60 + (parts[1] || 0);
};

export const fmtMin = (min) => {
  if (min == null || isNaN(min)) return '—';
  const neg = min < 0; const a = Math.abs(Math.round(min));
  return `${neg ? '-' : ''}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
};

// dakika farkı, gece yarısını geçen aralıklar için (end < start ise +24h)
export const spanMin = (startHHMM, endHHMM) => {
  const s = toMin(startHHMM), e = toMin(endHHMM);
  if (s == null || e == null) return null;
  return e >= s ? e - s : e + 1440 - s;
};

// ── etkin kurallar: regulation + company (override yalnız emniyetli yönde) ──
// company.overrides = { "cumulative_limits.flt_28d_min": 5400, "min_rest.home_base_min": 780, ... }
// Emniyetli yön: *_limit → yalnız DÜŞÜK kabul; min_rest/min_off → yalnız YÜKSEK kabul.
// Yanlış yönlü override SESSİZCE YOK SAYILMAZ — {ignored:[...]} içinde raporlanır (UI uyarı basar).
export function effectiveRules(ruleset) {
  const reg = ruleset?.regulation || {};
  const comp = ruleset?.company || {};
  const eff = JSON.parse(JSON.stringify(reg));
  const ignored = [];
  const overrides = comp.overrides || {};
  Object.entries(overrides).forEach(([path, val]) => {
    const keys = path.split('.');
    let node = eff;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] == null) { node = null; break; }
      node = node[keys[i]];
    }
    if (!node) { ignored.push({ path, val, reason: 'unknown parameter' }); return; }
    const leaf = keys[keys.length - 1];
    const regVal = node[leaf];
    const dir = overrideDirection(path);
    if (dir === 'decrease_only' && val > regVal) { ignored.push({ path, val, reason: 'above regulation' }); return; }
    if (dir === 'increase_only' && val < regVal) { ignored.push({ path, val, reason: 'below regulation' }); return; }
    node[leaf] = val;
  });
  return {
    rules: eff,
    company: {
      preFlightReportMin: comp.pre_flight_report_minutes ?? 60,
      postFlightDutyMin: comp.post_flight_duty_minutes ?? 30,
      mandatoryReportHours: comp.mandatory_report_hours ?? 72,
      minOffDaysPerMonth: comp.min_off_days_per_month ?? null,
    },
    ignored,
  };
}

// parametrenin emniyetli yönü — limit mi taban mı?
export function overrideDirection(path) {
  if (path.startsWith('cumulative_limits.')) return 'decrease_only';   // max limitler
  if (path.startsWith('min_rest.') && path.endsWith('_min')) return 'increase_only';
  if (path.startsWith('recurrent_rest.min_hours')) return 'increase_only';
  if (path.startsWith('recurrent_rest.max_between_hours')) return 'decrease_only';
  return 'free'; // diğerleri (şirket kuralları)
}

// ── Max FDP (Tablo-2) ───────────────────────────────────────────────
// reportLocalHHMM: YEREL rapor saati. sectors: bacak sayısı.
// 15 dk basamaklı bantlar ruleset'ten okunur — interpolasyon YOK.
export function maxFdpMinutes(reportLocalHHMM, sectors, rules) {
  const table = rules?.max_fdp_table;
  const t = toMin(reportLocalHHMM);
  if (!table || t == null) return null;
  let base = null;
  for (const b of table.bands) {
    const from = toMin(b.from), to = toMin(b.to);
    const inBand = from <= to ? (t >= from && t <= to) : (t >= from || t <= to); // 17:00–04:59 sarar
    if (inBand) { base = toMin(b.fdp); break; }
  }
  if (base == null) return null;
  const n = Math.min(Math.max(sectors, 1), table.max_sectors || 10);
  const penalty = Math.max(0, n - ((table.penalty_from_sector || 3) - 1)) * (table.sector_penalty_min || 30);
  return Math.max(toMin(table.fdp_floor || '09:00'), base - penalty);
}

// ── Split duty ──────────────────────────────────────────────────────
// breakStart/breakEnd YEREL "HH:MM". Dönen: {isSplit, extensionMin, countedBreakMin}
// Kural (CS FTL.1.220 / ruleset): eşik ≥ break_threshold_min; uzatma molanın %50'si;
// molanın 6h üstü ve WOCL'ye (02:00–05:59) giren kısmı sayılmaz; otel şart, uçakta uzatma yok.
export function splitDuty(breakStartHHMM, breakEndHHMM, accommodation, rules) {
  const sd = rules?.split_duty || {};
  const brk = spanMin(breakStartHHMM, breakEndHHMM);
  if (brk == null || brk < (sd.break_threshold_min ?? 180)) return { isSplit: false, extensionMin: 0, countedBreakMin: 0 };
  let counted = brk;
  if (sd.break_over_6h_not_counted) counted = Math.min(counted, 360);
  if (sd.wocl_portion_not_counted) counted -= woclOverlapMin(breakStartHHMM, breakEndHHMM);
  counted = Math.max(0, counted);
  const hotelOk = !sd.requires_suitable_accommodation || accommodation === 'hotel';
  const extensionMin = hotelOk ? Math.floor(counted / 2) : 0;
  return { isSplit: true, extensionMin, countedBreakMin: counted };
}

// WOCL: 02:00–05:59 yerel (EASA tanımı)
export function woclOverlapMin(startHHMM, endHHMM) {
  const s = toMin(startHHMM); let e = toMin(endHHMM);
  if (s == null || e == null) return 0;
  if (e < s) e += 1440;
  let overlap = 0;
  for (const [ws, we] of [[120, 360], [120 + 1440, 360 + 1440]]) {
    overlap += Math.max(0, Math.min(e, we) - Math.max(s, ws));
  }
  return overlap;
}

// ── Min rest ────────────────────────────────────────────────────────
// prevDutyMin: biten görevin süresi (dk). atBase: üste mi dinlenecek?
// travelMin: otele yol (tek yön, dk) — 30 dk üstünün 2 katı eklenir (üs dışı).
export function minRestMinutes(prevDutyMin, atBase, travelMin, rules, opts = {}) {
  const mr = rules?.min_rest || {};
  const floor = atBase ? (mr.home_base_min ?? 720)
    : (opts.tz4Rotation ? (mr.tz4_rotation_out_of_base_min ?? 840) : (mr.out_of_base_min ?? 600));
  let rest = Math.max(prevDutyMin || 0, floor);
  if (!atBase && travelMin > 30 && mr.travel_over_30min === '2x_excess_added') {
    rest += (travelMin - 30) * 2;
  }
  return rest;
}

// ── Kümülatifler ────────────────────────────────────────────────────
// baseline: ftl_pilot_baselines satırı (yoksa null)
// duties: pilotun crew_duties satırları (effective_date sonrası; status fark etmez — planned da sayılır)
// asOf: Date — pencere sonu
// Muhafazakâr devir: baseline penceresi, effective_date + pencere süresi boyunca TAM sayılır.
export function cumulatives(baseline, duties, asOf) {
  const DAY = 86400000;
  const asOfT = asOf.getTime();
  const winStart = (days) => asOfT - days * DAY;
  const baseT = baseline ? new Date(baseline.effective_date).getTime() : null;
  const baseCarry = (days, val) => {
    if (!baseline || baseT == null) return 0;
    return (baseT + days * DAY) >= asOfT ? (val || 0) : 0; // pencere hâlâ devri kapsıyor mu
  };
  const inWin = (d, days) => {
    const t = new Date(d.report_time || d.duty_date).getTime();
    return t >= winStart(days) && t <= asOfT && (!baseT || t >= baseT);
  };
  const year = asOf.getFullYear();
  const inCalYear = (d) => {
    const t = new Date(d.report_time || d.duty_date);
    return t.getFullYear() === year && t.getTime() <= asOfT && (!baseT || t.getTime() >= baseT);
  };
  const dutyMin = (d) => {
    if (d.duty_type === 'off') return 0;
    if (d.report_time && d.duty_end) return Math.max(0, (new Date(d.duty_end) - new Date(d.report_time)) / 60000);
    return d.fdp_minutes || 0;
  };
  const fltMin = (d) => {
    if (d.duty_type !== 'flight') return 0;
    let sum = 0;
    (d.sectors || []).forEach(s => {
      if (s.off_block && s.on_block) sum += spanMin(s.off_block, s.on_block) || 0;
      else if (s.etd && s.eta) sum += spanMin(s.etd, s.eta) || 0;
    });
    return sum;
  };
  const sum = (days, fn) => duties.filter(d => inWin(d, days)).reduce((a, d) => a + fn(d), 0);
  const sumCalYear = (fn) => duties.filter(inCalYear).reduce((a, d) => a + fn(d), 0);
  // 12 ay penceresi devri: takvim yılıyla aynı muhafazakâr yaklaşım (365 gün)
  return {
    duty7d:  baseCarry(7, baseline?.duty_7d_min)  + sum(7, dutyMin),
    duty14d: baseCarry(14, baseline?.duty_14d_min) + sum(14, dutyMin),
    duty28d: baseCarry(28, baseline?.duty_28d_min) + sum(28, dutyMin),
    dutyCalYear: (baseline && new Date(baseline.effective_date).getFullYear() === year ? (baseline.duty_cal_year_min || 0) : 0) + sumCalYear(dutyMin),
    flt28d:  baseCarry(28, baseline?.flt_28d_min) + sum(28, fltMin),
    fltCalYear: (baseline && new Date(baseline.effective_date).getFullYear() === year ? (baseline.flt_cal_year_min || 0) : 0) + sumCalYear(fltMin),
    flt12mo: baseCarry(365, baseline?.flt_12mo_min) + sum(365, fltMin),
  };
}

// ── Uygunluk (fitness) — "bu pilot bu görevi uçabilir mi?" ──────────
// newDuty: {reportLocal, sectors:[{etd,eta}...], dutyDate}
// Dönen: {legal, reasons:[...], checks:{...}}
export function fitness({ pilot, baseline, duties, ruleset, newDuty, asOf }) {
  const { rules } = effectiveRules(ruleset);
  const lim = rules.cumulative_limits || {};
  const reasons = [];

  if (!baseline) reasons.push('BASELINE NOT SET');

  // 1) dinlenme tamamlanmış mı — son görevin earliest_next_report'u
  const past = duties
    .filter(d => d.duty_type !== 'off' && d.earliest_next_report)
    .sort((a, b) => new Date(b.earliest_next_report) - new Date(a.earliest_next_report));
  const lastENR = past[0]?.earliest_next_report;
  const newReport = newDuty.reportISO ? new Date(newDuty.reportISO) : null;
  if (lastENR && newReport && new Date(lastENR) > newReport) {
    reasons.push(`REST UNTIL ${new Date(lastENR).toISOString().slice(5, 16).replace('T', ' ')} > report`);
  }

  // 2) kümülatifler — bu görev eklenince limit aşılır mı
  const cum = cumulatives(baseline, duties, asOf || new Date());
  const addFlt = (newDuty.sectors || []).reduce((a, s) => a + (spanMin(s.etd, s.eta) || 0), 0);
  const addDuty = newDuty.dutyMin || 0;
  const over = (used, add, limit, label) => {
    if (limit != null && used + add > limit) reasons.push(`${label} ${fmtMin(used)} + ${fmtMin(add)} > ${fmtMin(limit)}`);
  };
  over(cum.flt28d, addFlt, lim.flt_28d_min, 'FLT 28D');
  over(cum.fltCalYear, addFlt, lim.flt_cal_year_min, 'FLT CAL YEAR');
  over(cum.flt12mo, addFlt, lim.flt_12mo_min, 'FLT 12MO');
  over(cum.duty7d, addDuty, lim.duty_7d_min, 'DUTY 7D');
  over(cum.duty14d, addDuty, lim.duty_14d_min, 'DUTY 14D');
  over(cum.duty28d, addDuty, lim.duty_28d_min, 'DUTY 28D');
  over(cum.dutyCalYear, addDuty, lim.duty_cal_year_min, 'DUTY CAL YEAR');

  return { legal: reasons.length === 0, reasons, cum };
}

// ── Görev penceresi (sihirbaz sonucu) ───────────────────────────────
// legs: [{dep,dest,etd,eta}] yerel saat. Dönen tüm değerler dk / "HH:MM".
export function dutyWindow(legs, accommodation, ruleset) {
  const { rules, company } = effectiveRules(ruleset);
  if (!legs?.length) return null;
  const reportMin = toMin(legs[0].etd) - company.preFlightReportMin;
  const report = fmtMin((reportMin + 1440) % 1440);
  // en büyük ardışık mola
  let maxBreak = null;
  for (let i = 1; i < legs.length; i++) {
    const brk = spanMin(legs[i - 1].eta, legs[i].etd);
    if (brk != null && (maxBreak == null || brk > maxBreak.min)) {
      maxBreak = { min: brk, start: legs[i - 1].eta, end: legs[i].etd };
    }
  }
  const split = maxBreak
    ? splitDuty(maxBreak.start, maxBreak.end, accommodation, rules)
    : { isSplit: false, extensionMin: 0 };
  const baseFdp = maxFdpMinutes(report, legs.length, rules);
  const maxFdp = baseFdp != null ? baseFdp + split.extensionMin : null;
  const lastEta = legs[legs.length - 1].eta;
  const fdpMin = spanMin(report, lastEta);                       // FDP = report → son on block
  const dutyEndMin = toMin(lastEta) + company.postFlightDutyMin; // duty = ... + post flight
  const dutyMin = fdpMin != null ? fdpMin + company.postFlightDutyMin : null;
  const latestFdpEnd = maxFdp != null ? fmtMin((reportMin + maxFdp + 2880) % 1440) : null;
  return {
    report, fdpMin, dutyMin,
    dutyEnd: fmtMin(((dutyEndMin ?? 0) + 2880) % 1440),
    maxFdpMin: maxFdp, latestFdpEnd,
    split, breakMin: maxBreak?.min ?? null,
    fdpExceeded: fdpMin != null && maxFdp != null && fdpMin > maxFdp,
  };
}
