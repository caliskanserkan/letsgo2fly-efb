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
  // SHT-FTL/HG Md.5 — bos gunler (EASA'nin 'recurrent rest' kavraminin karsiligi)
  if (path === 'days_off.per_calendar_month_local_days') return 'increase_only';
  if (path === 'days_off.per_calendar_year_local_days') return 'increase_only';
  if (path === 'days_off.notice_hours') return 'increase_only';
  if (path === 'days_off.single_day_off_after_consecutive_days') return 'decrease_only';
  return 'free'; // diğerleri (şirket kuralları)
}

// ── Max FDP (Tablo-2) ───────────────────────────────────────────────
// reportLocalHHMM: YEREL rapor saati. sectors: bacak sayısı.
// 15 dk basamaklı bantlar ruleset'ten okunur — interpolasyon YOK.
// FAALIYET TIPI (Md.9): gerceklestirilen faaliyetin hukumleri gecerlidir.
//   air_taxi        → Md.22(2) Tablo 1 (matris)
//   aerial_work     → Md.26, hava taksi limitlerine alias
//   general_aviation→ Md.25 (duz: tek 12:00 / cift 14:00)
//   training        → Md.27 (UGS 12:00 + AYRI gunluk ucus suresi siniri)
export const OPERATION_TYPES = ['air_taxi', 'aerial_work', 'general_aviation', 'training'];

/** Faaliyet tipinin limit blogunu cozer (alias'i takip eder). Yoksa null. */
export function fdpLimitSet(rules, operationType = 'air_taxi') {
  const all = rules?.fdp_limits;
  if (!all) return null;
  let set = all[operationType] || all.air_taxi;
  if (set?.style === 'alias') set = all[set.same_as];
  return set || null;
}

/** Bu kural bu faaliyet tipine uygulanir mi? applies_to yoksa HEPSINE uygulanir. */
export function ruleAppliesTo(block, operationType = 'air_taxi') {
  if (!block) return false;
  if (!Array.isArray(block.applies_to)) return true;
  return block.applies_to.includes(operationType);
}

export function maxFdpMinutes(reportLocalHHMM, sectors, rules, opts = {}) {
  const t = toMin(reportLocalHHMM);
  const set = fdpLimitSet(rules, opts.operationType);
  if (!set || t == null) return null;

  // Md.27 — egitim: gunun UGS tavani sabit; ucus suresi AYRI kontrol edilir
  // (trainingFlightLimitMin). Bant/sektor ayrimi yoktur.
  if (set.style === 'training') return toMin(set.max_fdp) ?? null;

  // Md.25 — genel havacilik: duz limit, yalniz pilot sayisina bagli.
  if (set.style === 'flat') return toMin(opts.singlePilot ? set.single : set.dual) ?? null;

  // Md.22(2) Tablo 1 — matris: bant × sektor grubu (1-4 / 5 / 6+) × tek/cift.
  // Sektor cezasi ve FDP tabani YOK; deger dogrudan tablodan okunur.
  // (6 Agu 2026: eski havayolu SHT-FTL semasi KALDIRILDI — gecmis ucuslarin
  //  hepsi demo, eski EASA motoru baglamiyor. Taninmayan sema null doner:
  //  "hesaplayamadim" der, sayi UYDURMAZ — Ilke 1.)
  if (set.style !== 'matrix') return null;
  for (const b of set.bands) {
    const from = toMin(b.from), to = toMin(b.to);
    const inBand = from <= to ? (t >= from && t <= to) : (t >= from || t <= to); // 18:01–05:59 sarar
    if (!inBand) continue;
    const grp = sectors <= 4 ? 's1_4' : sectors === 5 ? 's5' : 's6plus';
    const col = opts.singlePilot ? 'single' : 'dual';
    return toMin(b.fdp?.[grp]?.[col]) ?? null;
  }
  return null;
}

/** Md.27 — egitim faaliyetinde GUNLUK azami ucus suresi (dk). Diger tiplerde null.
 *  Md.27(1)(c): ayni gun teorik egitim de yapildiysa bu sinir YARIYA iner. */
export function trainingFlightLimitMin(rules, trainingKind, sameDayTheory = false) {
  const set = fdpLimitSet(rules, 'training');
  if (set?.style !== 'training') return null;
  const k = set.kinds?.[trainingKind] || set.kinds?.instructor_examiner;
  const base = k?.flight_time_min;
  if (base == null) return null;
  return (sameDayTheory && set.same_day_theory_halves_flight) ? Math.floor(base / 2) : base;
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
  let extensionMin = hotelOk ? Math.floor(counted / 2) : 0;
  // SHT-FTL/HG Md.15(b): uzatma hicbir sekilde 4 saati asamaz (ruleset'ten).
  if (sd.extension_cap_min != null) extensionMin = Math.min(extensionMin, sd.extension_cap_min);
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

// ── Saat dilimi yardımcıları (saf hesap — I/O yok) ──────────────────
// Yerel duvar saatini bir IANA diliminde MUTLAK ana çevirir. Yerel gece /
// intibak hesapları bunu kullanır; panel de aynı fonksiyonu kullanır ki
// aynı aritmetiğin ikinci kopyası olmasın (K-2 dersi).
export function tzOffsetMin(tz, ts) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(new Date(ts)).map(x => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ts) / 60000;
}

export function zonedISO(dateStr, hhmm, tz) {
  if (!dateStr || !hhmm) return null;
  if (!tz) {
    const d = new Date(`${dateStr}T${String(hhmm).padStart(5, '0')}:00`);
    return isNaN(d) ? null : d.toISOString();
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = String(hhmm).split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let ts = guess - tzOffsetMin(tz, guess) * 60000;
  ts = guess - tzOffsetMin(tz, ts) * 60000;   // DST sınırı için ikinci geçiş
  return new Date(ts).toISOString();
}

const shiftDate = (dateStr, days) => {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── Boş günler (SHT-FTL/HG Md.5, tanım Md.4(ü)(ff)) ─────────────────
// TEK BOŞ GÜN = 1 yerel gün + 2 YEREL GECE. Yerel gece 22:00–08:00.
// Yani D günü tek boş gün sayılabilmesi için D-1 22:00→D 08:00 VE
// D 22:00→D+1 08:00 pencerelerinin ikisinin de tüm görevlerden muaf olması
// gerekir. Sadece "o gün görev yok" YETMEZ — Talimatın tanımı budur.
// tz: ekip üyesinin ana üs dilimi (yoksa tarayıcı yereli; sonuç yine döner
// ama hangi dilimde bakıldığı çağırana bildirilir).
export function isSingleDayOff(offDate, duties, rules, tz = null) {
  const cfg = rules?.days_off || {};
  const nStart = cfg.local_night_start || '22:00';
  const nEnd = cfg.local_night_end || '08:00';
  const windows = [
    [zonedISO(shiftDate(offDate, -1), nStart, tz), zonedISO(offDate, nEnd, tz)],
    [zonedISO(offDate, nStart, tz), zonedISO(shiftDate(offDate, 1), nEnd, tz)],
  ].map(([a, b]) => [new Date(a).getTime(), new Date(b).getTime()]);

  const busy = (duties || []).filter(d =>
    d.duty_type !== 'off' && d.status !== 'cancelled' && d.report_time && d.duty_end);
  for (const [ws, we] of windows) {
    for (const d of busy) {
      const s = new Date(d.report_time).getTime(), e = new Date(d.duty_end).getTime();
      if (s < we && e > ws) return false;      // pencereyle çakışıyor
    }
  }
  return true;
}

// Bir takvim ayı / yılı için boş gün özeti.
// offTypes: [{code, counts_as_recurrent_rest}] — hangi OFF alt tipi boş gün sayılır
// (kolon adı eski, anlamı Md.5'teki "boş gün"dür).
export function daysOffSummary(duties, rules, { year, month = null, tz = null, offTypes = null } = {}) {
  const cfg = rules?.days_off || {};
  const counts = (code) => {
    if (!offTypes || !code) return true;
    const t = offTypes.find(x => x.code === code);
    return t ? t.counts_as_recurrent_rest !== false : true;
  };
  const inPeriod = (dt) => {
    const [y, m] = dt.split('-').map(Number);
    return y === year && (month == null || m === month);
  };
  const offDates = [...new Set((duties || [])
    .filter(d => d.duty_type === 'off' && d.status !== 'cancelled' && d.duty_date
                 && inPeriod(d.duty_date) && counts(d.off_subtype))
    .map(d => d.duty_date))].sort();

  const valid = offDates.filter(dt => isSingleDayOff(dt, duties, rules, tz));

  // ardışık blokları çıkar (2+2+1+1+1 kontrolü ve denge için)
  const blocks = [];
  for (const dt of valid) {
    const last = blocks[blocks.length - 1];
    if (last && shiftDate(last[last.length - 1], 1) === dt) last.push(dt);
    else blocks.push([dt]);
  }
  const required = month != null
    ? (cfg.per_calendar_month_local_days ?? null)
    : (cfg.per_calendar_year_local_days ?? null);
  const half = (dt) => (Number(dt.slice(8, 10)) <= 15 ? 1 : 2);
  const firstHalf = valid.filter(d => half(d) === 1).length;
  const secondHalf = valid.length - firstHalf;
  const minBlocks2 = cfg.month_grouping_min_blocks_of_2 ?? 0;
  return {
    offDates, valid, invalid: offDates.filter(d => !valid.includes(d)),
    count: valid.length, required,
    ok: required == null ? null : valid.length >= required,
    blocks, blocksOf2: blocks.filter(b => b.length >= 2).length,
    groupingOk: month == null ? null : blocks.filter(b => b.length >= 2).length >= minBlocks2,
    firstHalf, secondHalf,
    balancedOk: month == null ? null : (firstHalf > 0 && secondHalf > 0),
  };
}

// ── Nöbet (SHT-FTL/HG Md.17) ────────────────────────────────────────
// HAVAALANI NÖBETİ (Md.17/1): tamamı görev süresidir; azami UGS, nöbette
//   geçen 4 saatin ÜZERİNDEKİ süre kadar kısalır; nöbet + tahsis edilen UGS
//   birleşik süresi 16 saati aşamaz.
// HAVAALANI HARİCİ NÖBET (Md.17/2): azami 16 saat; süresinin %25'i görev
//   sayılır; nöbet ilk 6 saatten SONRA biterse azami UGS aşan süre kadar
//   kısalır (UGS uçuş içi dinlenme veya açık mesai ile uzatıldıysa 6 → 8 saat);
//   görev verilmezse asgari 8 saat dinlenme gelir.
export function standbyEffect(standbyDuty, rules, opts = {}) {
  if (!standbyDuty || standbyDuty.duty_type !== 'ground') return null;
  const kind = standbyDuty.ground_kind;
  // RULESET NÖBET TANIMLAMIYORSA SAYIYI KODDAN UYDURMA (İlke 1 + "değerler koda
  // GÖMÜLMEZ" temel kuralı). Eski SHT-FTL Rev02 şemasında `standby` bloğu YOK;
  // `?? 240` gibi yedekler sessizce Türk HG rakamlarını uygular ve başka bir
  // regülasyondaki müşteriye yanlış limit dayatır. Hesaplayamıyorsak SÖYLERİZ.
  if (!rules?.standby) {
    return { kind, reference: 'Md.17', unavailable: true, standbyMin: null,
             fdpReductionMin: 0, dutyCreditMin: 0, invalid: false, maxExceeded: false };
  }
  const sb = rules.standby;
  if (!standbyDuty.report_time || !standbyDuty.duty_end) return null;
  const raw = (new Date(standbyDuty.duty_end) - new Date(standbyDuty.report_time)) / 60000;
  // BOZUK VERI SESSIZCE "ZARARSIZ" GORUNMESIN (kuru kosuda yakalandi, 6 Agu):
  // bitis baslangictan onceyse (gece yarisini gecen nobette yanlis tarih) fark
  // NEGATIF cikar. Sifira kirpmak, 17 SAATLIK bir nobeti "0 dk, etkisi yok,
  // gecerli" diye gostermek demektir — azami sure kontrolu de sessizce gecer.
  // Paneldeki kayit yolu nextDay() ile dogru tarihi yaziyor, yani bu veri
  // saha tarafindan uretilmiyor; ama motor VERIYE GUVENMEZ, isaretler.
  const invalid = !(raw > 0);
  const mins = Math.max(0, raw);

  if (kind === 'airport_standby') {
    const cfg = sb.airport || {};
    const after = cfg.fdp_reduction_after_min ?? 240;
    return {
      kind, reference: 'Md.17(1)', standbyMin: mins, invalid,
      fdpReductionMin: Math.max(0, mins - after),
      dutyCreditMin: Math.round(mins * (cfg.duty_credit_ratio ?? 1)),
      combinedCapMin: cfg.standby_plus_fdp_cap_min ?? 960,
      reductionThresholdMin: after,
      maxExceeded: false,
    };
  }
  if (kind === 'other_standby') {
    const cfg = sb.other || {};
    const after = opts.fdpExtended
      ? (cfg.fdp_reduction_after_min_if_extended_fdp ?? 480)
      : (cfg.fdp_reduction_after_min ?? 360);
    const maxMin = cfg.max_min ?? 960;
    return {
      kind, reference: 'Md.17(2)', standbyMin: mins, invalid,
      fdpReductionMin: Math.max(0, mins - after),
      dutyCreditMin: Math.round(mins * (cfg.duty_credit_ratio ?? 0.25)),
      maxStandbyMin: maxMin, maxExceeded: mins > maxMin,
      restIfNoDutyMin: cfg.rest_after_no_duty_min ?? 480,
      reductionThresholdMin: after,
    };
  }
  return null;
}

/** Bir uçuş görevinden ÖNCE gelen, aynı gün ve aynı pilota ait nöbeti bulur.
 *  reportISO verilirse nöbetin ondan önce bitmiş olması aranır. */
export function standbyBefore(duties, pilotId, dutyDate, reportISO = null) {
  const cands = (duties || []).filter(d =>
    d.pilot_id === pilotId && d.duty_type === 'ground' && d.status !== 'cancelled' &&
    (d.ground_kind === 'airport_standby' || d.ground_kind === 'other_standby') &&
    d.duty_date === dutyDate && d.duty_end);
  if (!cands.length) return null;
  const eligible = reportISO
    ? cands.filter(d => new Date(d.duty_end) <= new Date(reportISO))
    : cands;
  const pool = eligible.length ? eligible : cands;
  return pool.sort((a, b) => new Date(b.duty_end) - new Date(a.duty_end))[0];
}

/** Nöbet + görev birleşik kontrolleri (Md.17). standbyEffect'in verdiği ETKİYİ
 *  atanan UGS ile birleştirir ve İHLAL gerekçelerini üretir.
 *  Neden ayrı fonksiyon: birleşik tavan iki bilgiyi birden ister (nöbet süresi +
 *  tahsis edilen UGS); standbyEffect yalnız nöbeti görür. Panel, EDIT modali,
 *  arşiv ve rapor AYNI kaynağı kullansın diye motorda duruyor (K-2'nin dersi).
 *  effect: standbyEffect() çıktısı · assignedFdpMin: planlanan UGS (dk)
 *  Dönen: effect + { combinedMin, combinedExceeded, reasons:[...] } */
export function standbyLimits(effect, assignedFdpMin) {
  if (!effect) return null;
  const reasons = [];
  const out = { ...effect, assignedFdpMin: assignedFdpMin ?? null, combinedMin: null, combinedExceeded: false };

  // Kural seti nöbeti tanımlamıyorsa DOĞRULAYAMAYIZ. Sessizce "uygun" demek,
  // limiti bilmeden yasal ilan etmektir.
  if (out.unavailable) {
    reasons.push('THIS DUTY\'S RULESET DOES NOT DEFINE STANDBY RULES (Md.17) — the effect on max FDP cannot be verified; assign the duty under a ruleset that defines them');
    out.reasons = reasons; out.ok = false;
    return out;
  }

  // BOZUK NOBET KAYDI (bitis <= baslangic) sessizce "etkisi yok" sayilamaz —
  // 17 saatlik bir nobet 0 dk gorunur ve azami sure kontrolu de bosa duser.
  if (out.invalid) {
    reasons.push('STANDBY END IS NOT AFTER ITS START — duration cannot be determined (record is corrupt, fix the standby duty)');
  }

  // Md.17(1)(c) — HAVAALANI NÖBETİ: nöbet + tahsis edilen UGS birleşik süresi
  // 16 saati AŞAMAZ. Bu, UGS kısaltmasından AYRI ve ondan sonra gelen bir tavan;
  // kısaltma uygulandıktan sonra bile birleşik süre tavanı aşabilir.
  if (out.kind === 'airport_standby' && out.combinedCapMin != null && assignedFdpMin != null) {
    out.combinedMin = out.standbyMin + assignedFdpMin;
    out.combinedExceeded = out.combinedMin > out.combinedCapMin;
    if (out.combinedExceeded) {
      reasons.push(`STANDBY ${fmtMin(out.standbyMin)} + FDP ${fmtMin(assignedFdpMin)} = ${fmtMin(out.combinedMin)} > ${fmtMin(out.combinedCapMin)} COMBINED CAP (SHT-FTL/HG Md.17/1/c)`);
    }
  }
  // Md.17(2)(b) — HAVAALANI HARİCİ NÖBET azami 16 saat. Nöbetin KENDİ ihlali;
  // görev atanmasa da geçersizdir, bu yüzden assignedFdpMin'den bağımsız bakılır.
  if (out.kind === 'other_standby' && out.maxExceeded) {
    reasons.push(`OTHER STANDBY ${fmtMin(out.standbyMin)} > ${fmtMin(out.maxStandbyMin)} MAX (SHT-FTL/HG Md.17/2/b)`);
  }
  out.reasons = reasons;
  out.ok = reasons.length === 0;
  return out;
}

// ── İNTİBAK — Acclimatisation (SHT-FTL/HG Md.22(1)) ─────────────────
// Md.4(l): "İntibak edilmiş" = ekip üyesinin günlük biyolojik saatinin ilgili
//   meydanın yerel saatiyle uyumlu sayıldığı hal.
// Md.22(1) c.1: kalkış noktasındaki yerel saati çevreleyen 2 SAAT GENİŞLİĞİNDEKİ
//   dilimdeki bir meydana uçuş sonrası, asgari dinlenmeyi müteakip yapılacak
//   İLK görev için o meydanın yerel saatine intibak edilmiş sayılır.
// Md.22(1) c.2: azami günlük UGS hesabı için, görevin başladığı yerel saat bir
//   sonraki görevin başladığı yerel saatten 2 SAATTEN FAZLA farklıysa —
//     ana üs / geçici üs DIŞINDA 24 saatten AZ dinlenildiyse → İLK kalkış meydanı
//     24 saat ve ÜZERİ dinlenildiyse                        → MEVCUT kalkış meydanı
//
// NEDEN ÖNEMLİ: intibak edilen meydan, Tablo 1'in HANGİ SATIRININ okunacağını
// belirler. Rapor saatini kalkış meydanının saatiyle okumak, doğu-batı uçuşundan
// sonra YANLIŞ BANDA düşürür ve azami UGS'yi olduğundan büyük/küçük gösterir.
// Fiziksel saatler (report_time) DEĞİŞMEZ — değişen yalnız bandın okunduğu saat.
//
// Motor TZ SORGUSU YAPMAZ (saf kalır, longRange ile aynı desen): çağıran
// meydan dilimlerinin ofsetlerini geçirir.
//   prev: { refIcao, refOffsetMin, dutyEndISO } | null   (önceki intibak referansı)
//   next: { depIcao, depOffsetMin, reportISO, homeBaseIcao }
export function acclimatisation(prev, next, rules) {
  const cfg = rules?.acclimatisation;
  // Kural seti intibakı tanımlamıyorsa UYDURMA (İlke 1) — hangi bandın
  // okunacağını bilmeden azami UGS'yi doğrulamış sayılamayız.
  if (!cfg) {
    return { unavailable: true, icao: null, offsetMin: null, reference: 'Md.22(1)',
             reason: 'ruleset does not define acclimatisation (Md.22/1)' };
  }
  const band = cfg.band_tolerance_min ?? 120;
  const restThreshold = cfg.rest_threshold_min ?? 1440;
  const at = (icao, offsetMin, reason, extra = {}) =>
    ({ unavailable: false, icao, offsetMin, band, reference: 'Md.22(1)', reason, ...extra });

  if (!next?.depIcao || next.depOffsetMin == null) {
    return { unavailable: true, icao: null, offsetMin: null, reference: 'Md.22(1)',
             reason: 'departure aerodrome timezone unknown' };
  }
  // İlk görev / önceki referans yok: kalkış meydanına intibaklı kabul edilir.
  if (!prev?.refIcao || prev.refOffsetMin == null) {
    return at(next.depIcao, next.depOffsetMin, 'first duty in chain — acclimatised to departure aerodrome');
  }
  const diffMin = Math.abs(prev.refOffsetMin - next.depOffsetMin);
  // c.1 — 2 saatlik bant içinde: mevcut kalkış meydanına intibaklı.
  if (diffMin <= band) {
    return at(next.depIcao, next.depOffsetMin,
      `within the ${fmtMin(band)} band of the previous reference (${prev.refIcao})`, { diffMin });
  }
  // c.2 — bant dışı: dinlenme süresi ve yeri belirler.
  const restMin = (prev.dutyEndISO && next.reportISO)
    ? Math.max(0, (new Date(next.reportISO) - new Date(prev.dutyEndISO)) / 60000) : null;
  const atBase = !!(next.homeBaseIcao &&
    String(next.depIcao).toUpperCase() === String(next.homeBaseIcao).toUpperCase());
  if (atBase) {
    return at(next.depIcao, next.depOffsetMin,
      'rest taken at home base — acclimatised to home base', { diffMin, restMin });
  }
  if (restMin == null) {
    return { unavailable: true, icao: null, offsetMin: null, reference: 'Md.22(1)', diffMin,
             reason: 'rest duration unknown — cannot decide acclimatisation outside base' };
  }
  if (restMin < restThreshold) {
    return at(prev.refIcao, prev.refOffsetMin,
      `rested ${fmtMin(restMin)} (<${fmtMin(restThreshold)}) away from base — still acclimatised to ${prev.refIcao}`,
      { diffMin, restMin });
  }
  return at(next.depIcao, next.depOffsetMin,
    `rested ${fmtMin(restMin)} (≥${fmtMin(restThreshold)}) away from base — acclimatised to ${next.depIcao}`,
    { diffMin, restMin });
}

/** İntibak edilen meydanın YEREL saatiyle rapor saati — Tablo 1 bu saatle okunur.
 *  reportHHMM kalkış meydanının yerel saatidir; iki ofsetin farkı kadar kaydırılır. */
export function bandReportHHMM(reportHHMM, depOffsetMin, acclOffsetMin) {
  const r = toMin(reportHHMM);
  if (r == null || depOffsetMin == null || acclOffsetMin == null) return null;
  return fmtMin(((r + (acclOffsetMin - depOffsetMin)) % 1440 + 1440) % 1440);
}

// ── SKPK — Sorumlu Kaptan Pilot Kararı (SHT-FTL/HG Md.12) ───────────
// Md.12(1): "GÖREV BAŞLANGICI SONRASINDA başlayan öngörülemeyen haller" —
//   SKPK bir PLANLAMA aracı DEĞİLDİR, olmuş bitmiş bir olayın kaydıdır.
//   Bu yüzden yalnız gerçekleşmiş (actual) görevlere yazılır.
// Md.12(1)(a): azami UGS en fazla +2 saat; artırılmış ekipte +3 saat.
// Md.12(1)(c)(1): her SKPK'da işleticiye rapor — İSTİSNASIZ.
// Md.12(1)(c)(2): gerçekleşen uzatma VEYA kısaltma 1 saati AŞARSA, kaptan
//   raporunun kopyası işleticinin yorumlarıyla 28 gün içinde Genel Müdürlüğe.
// Md.12(2): dinlenme en fazla 2 saat kısaltılır; kısaltılırsa MÜTEAKİP GÖREV
//   sonrasındaki hak edilen dinlenme kısaltılan miktarın 2 KATI kadar artar;
//   hak edilen dinlenme 10 saatin altına inemez.
// Md.12(3): SKPK ile UZATILMIŞ bir UGS'yi müteakip dinlenme KISALTILAMAZ.
//
// ctx: { augmented, baseMaxFdpMin, fdpMin, earnedRestMin, prevMinRestMin,
//        prevHadSkpkExtension, dutyEndISO }
export function skpkLimits({ fdpExtensionMin = 0, restReductionMin = 0 } = {}, rules, ctx = {}) {
  const ext = Math.max(0, Math.round(fdpExtensionMin || 0));
  const red = Math.max(0, Math.round(restReductionMin || 0));
  const reasons = [];
  // RULESET SKPK TANIMLAMIYORSA TAVANI KODDAN UYDURMA (İlke 1). Yedek sabitler
  // (2h/3h/10h/28 gün) SHT-FTL/HG'nin rakamlarıdır; başka bir regülasyona tabi
  // müşteride sessizce yanlış tavan uygulanır ve ihlal "geçerli" görünür.
  if (!rules?.commander_discretion) {
    return { reference: 'Md.12', applied: ext > 0 || red > 0, unavailable: true,
      extensionMin: ext, reductionMin: red, extensionMaxMin: null, reductionMaxMin: null,
      extensionExceeded: false, reductionExceeded: false, restFloorMin: null,
      restAfterReductionMin: null, restFloorBreached: false, afterExtensionBlocked: false,
      compensationMin: 0, minRestWithCompensationMin: null, maxFdpWithSkpkMin: null,
      fdpStillExceeded: null, operatorReportRequired: ext > 0 || red > 0,
      authorityReportRequired: false, authorityReportOverMin: null,
      authorityReportDays: null, authorityDueISO: null,
      reasons: ['THIS DUTY\'S RULESET DOES NOT DEFINE COMMANDER\'S DISCRETION LIMITS (Md.12) — the entry cannot be validated'],
      ok: false };
  }
  const cfg = rules.commander_discretion;

  // — Md.12(1)(a) uzatma tavanı (artırılmış ekipte 3 saat)
  const extMax = ctx.augmented
    ? (cfg.fdp_extension_augmented_max_min ?? 180)
    : (cfg.fdp_extension_max_min ?? 120);
  const extensionExceeded = ext > extMax;
  if (extensionExceeded) {
    reasons.push(`SKPK FDP EXTENSION ${fmtMin(ext)} > ${fmtMin(extMax)} MAX${ctx.augmented ? ' (augmented crew)' : ''} (SHT-FTL/HG Md.12/1/a)`);
  }

  // — Md.12(2) kısaltma tavanı + 10 saat tabanı
  const redMax = cfg.rest_reduction_max_min ?? 120;
  const restFloor = cfg.rest_floor_min ?? 600;
  const reductionExceeded = red > redMax;
  if (reductionExceeded) {
    reasons.push(`SKPK REST REDUCTION ${fmtMin(red)} > ${fmtMin(redMax)} MAX (SHT-FTL/HG Md.12/2)`);
  }
  // Taban, KISALTILAN dinlenmenin kendisine uygulanır: hak edilen dinlenme
  // (onceki gorevin min_rest'i) eksi kisaltma, 10 saatin altina inemez.
  const earned = ctx.prevMinRestMin ?? ctx.earnedRestMin ?? null;
  const restAfterReductionMin = (red > 0 && earned != null) ? earned - red : null;
  const restFloorBreached = restAfterReductionMin != null && restAfterReductionMin < restFloor;
  if (restFloorBreached) {
    reasons.push(`REST AFTER REDUCTION ${fmtMin(restAfterReductionMin)} < ${fmtMin(restFloor)} FLOOR (SHT-FTL/HG Md.12/2)`);
  }

  // — Md.12(3): uzatılmış UGS'yi müteakip dinlenme kısaltılamaz.
  //   Bu görevin dinlenmesi kısaltıldıysa ve ÖNCEKİ görev SKPK ile uzatıldıysa
  //   ihlal vardır (kısaltılan dinlenme tam da o uzatmayı müteakip olandır).
  const afterExtensionBlocked = red > 0 && !!ctx.prevHadSkpkExtension
    && (cfg.no_rest_reduction_after_skpk_extension !== false);
  if (afterExtensionBlocked) {
    reasons.push('REST MAY NOT BE REDUCED AFTER AN FDP EXTENDED BY COMMANDER\'S DISCRETION (SHT-FTL/HG Md.12/3)');
  }

  // — Md.12(2): telafi, MÜTEAKİP GÖREV SONRASINDAKİ dinlenmeye eklenir (2 kat).
  //   Yani kısaltmayı taşıyan görevin KENDİ min_rest'i artar.
  const compensationMin = red > 0 ? red * 2 : 0;
  const minRestWithCompensationMin = ctx.earnedRestMin != null
    ? ctx.earnedRestMin + compensationMin : null;

  // — Md.12(1)(c): raporlama
  const any = ext > 0 || red > 0;
  const overMin = cfg.authority_report_over_min ?? 60;
  const authorityReportRequired = ext > overMin || red > overMin;
  const days = cfg.authority_report_days ?? 28;
  const authorityDueISO = (authorityReportRequired && ctx.dutyEndISO)
    ? new Date(new Date(ctx.dutyEndISO).getTime() + days * 86400000).toISOString() : null;

  return {
    reference: 'Md.12', applied: any,
    extensionMin: ext, extensionMaxMin: extMax, extensionExceeded,
    reductionMin: red, reductionMaxMin: redMax, reductionExceeded,
    restFloorMin: restFloor, restAfterReductionMin, restFloorBreached,
    afterExtensionBlocked,
    compensationMin, minRestWithCompensationMin,
    maxFdpWithSkpkMin: ctx.baseMaxFdpMin != null ? ctx.baseMaxFdpMin + ext : null,
    fdpStillExceeded: (ctx.baseMaxFdpMin != null && ctx.fdpMin != null)
      ? ctx.fdpMin > ctx.baseMaxFdpMin + ext : null,
    operatorReportRequired: any,
    authorityReportRequired, authorityReportOverMin: overMin,
    authorityReportDays: days, authorityDueISO,
    reasons, ok: reasons.length === 0,
  };
}

/** Bir görevin ÖNCESİNDEKİ (aynı pilot) en son görevi bulur — SKPK'nın
 *  "hak edilen dinlenme" ve Md.12(3) zincir kontrolü bunun üzerinden döner. */
export function previousDuty(duties, pilotId, reportISO, excludeId = null) {
  if (!reportISO) return null;
  const t = new Date(reportISO).getTime();
  return (duties || [])
    .filter(d => d.pilot_id === pilotId && d.id !== excludeId && d.duty_type !== 'off'
              && d.status !== 'cancelled' && d.duty_end && new Date(d.duty_end).getTime() <= t)
    .sort((a, b) => new Date(b.duty_end) - new Date(a.duty_end))[0] || null;
}

/** SKPK'nın insan-okur özeti — kayda donar (standby_ref ile aynı gerekçe). */
export function skpkRef(skpk) {
  if (!skpk?.applied) return null;
  const parts = [];
  if (skpk.extensionMin > 0) parts.push(`FDP +${fmtMin(skpk.extensionMin)} (max ${fmtMin(skpk.extensionMaxMin)})`);
  if (skpk.reductionMin > 0) parts.push(`REST −${fmtMin(skpk.reductionMin)} → next rest +${fmtMin(skpk.compensationMin)} (Md.12/2)`);
  parts.push(skpk.authorityReportRequired
    ? `DGCA REPORT DUE (>${fmtMin(skpk.authorityReportOverMin)}, ${skpk.authorityReportDays} days)`
    : 'OPERATOR REPORT ONLY');
  return `COMMANDER'S DISCRETION (SHT-FTL/HG Md.12) — ${parts.join(' · ')}`;
}

/** Nöbetin insan-okur özeti — kayda (crew_duties.standby_ref) donar.
 *  ruleset_snapshot mantığı: hesabın dayanağı, kaynak satır sonradan
 *  değişse/silinse bile kaydın İÇİNDE kalsın. */
export function standbyRef(standbyDuty, effect) {
  if (!standbyDuty || !effect) return null;
  const hhmm = (iso) => iso ? new Date(iso).toISOString().slice(11, 16) : '—';
  const label = effect.kind === 'airport_standby' ? 'AIRPORT STANDBY' : 'OTHER STANDBY';
  return `${label} ${standbyDuty.duty_date} ${hhmm(standbyDuty.report_time)}–${hhmm(standbyDuty.duty_end)}Z `
       + `(${fmtMin(effect.standbyMin)}, ${effect.reference}) → FDP −${fmtMin(effect.fdpReductionMin)}`;
}

// ── Kümülatifler ────────────────────────────────────────────────────
// baseline: ftl_pilot_baselines satırı (yoksa null)
// duties: pilotun crew_duties satırları (effective_date sonrası; status fark etmez — planned da sayılır)
// asOf: Date — pencere sonu
// Muhafazakâr devir: baseline penceresi, effective_date + pencere süresi boyunca TAM sayılır.
export function cumulatives(baseline, duties, asOf, rules = null) {
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
    if (d.report_time && d.duty_end) {
      const raw = Math.max(0, (new Date(d.duty_end) - new Date(d.report_time)) / 60000);
      // Md.17(2)(g): havaalanı harici nöbette geçen sürenin %25'i görev sayılır.
      // (Havaalanı nöbetinin TAMAMI görevdir — Md.17(1)(b), oran 1.)
      if (d.duty_type === 'ground' && d.ground_kind === 'other_standby') {
        const r = rules?.standby?.other?.duty_credit_ratio ?? 0.25;
        return Math.round(raw * r);
      }
      return raw;
    }
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
  const cum = cumulatives(baseline, duties, asOf || new Date(), rules);
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

  // SHT-FTL/HG Md.5(1)(a): birbirini takip eden 6 gunu muteakip asgari 1 tek
  // bos gun. Ruleset'te days_off tanimli DEGILSE (eski SHT-FTL semasi) kontrol
  // calismaz — eski davranis korunur. Gun karsilastirmasi duty_date (yerel gun)
  // dizgeleriyle yapilir.
  const consecReq = rules.days_off?.single_day_off_after_consecutive_days;
  if (consecReq != null && newDuty.dutyDate) {
    const dutyDays = new Set(
      duties.filter(d => d.duty_type !== 'off' && d.status !== 'cancelled' && d.duty_date)
            .map(d => d.duty_date));
    const base = new Date(newDuty.dutyDate + 'T12:00:00Z');
    let run = 0;
    for (let i = 1; i <= consecReq; i++) {
      const dt = new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10);
      if (dutyDays.has(dt)) run++; else break;
    }
    if (run >= consecReq) {
      reasons.push(`${consecReq} CONSECUTIVE DUTY DAYS — SINGLE DAY OFF REQUIRED (SHT-FTL/HG Md.5)`);
    }
  }

  return { legal: reasons.length === 0, reasons, cum };
}

// ── Görev penceresi (sihirbaz sonucu) ───────────────────────────────
// legs: [{dep,dest,etd,eta}] yerel saat. Dönen tüm değerler dk / "HH:MM".
export function dutyWindow(legs, accommodation, ruleset, opts = {}) {
  // opts: { operationType, trainingKind, sameDayTheory, singlePilot,
  //         threePilot, fourPilot, longRange, standbyReductionMin }
  //   longRange: kalkis-varis dilim farki >=4h (SHT-FTL/HG Md.4(ee)) — cagiran
  //   meydan tz'lerinden tespit edip gecirir; motor tz sorgusu YAPMAZ (saf kalir).
  const { rules, company } = effectiveRules(ruleset);
  if (!legs?.length) return null;
  const opType = opts.operationType || 'air_taxi';
  // BILDIRIM SURELERI (Md.10): sirket degeri regulasyon TABANININ altina inemez.
  // Egitim/simulator gorevinde ucus sonrasi taban 60 dk (Md.10(c)).
  const nt = rules.notification_times || {};
  const preFlightMin = Math.max(company.preFlightReportMin ?? 60, nt.preflight_report_min ?? 60);
  const postFlightMin = Math.max(
    company.postFlightDutyMin ?? 30,
    opType === 'training' ? (nt.postflight_sim_training_min ?? 60) : (nt.postflight_min ?? 30));
  const reportMin = toMin(legs[0].etd) - preFlightMin;
  const report = fmtMin((reportMin + 1440) % 1440);
  // en büyük ardışık mola
  let maxBreak = null;
  for (let i = 1; i < legs.length; i++) {
    const brk = spanMin(legs[i - 1].eta, legs[i].etd);
    if (brk != null && (maxBreak == null || brk > maxBreak.min)) {
      maxBreak = { min: brk, start: legs[i - 1].eta, end: legs[i].etd };
    }
  }
  // ACIK MESAI (Md.15) yalniz uygulanabilir faaliyet tiplerinde (applies_to).
  const splitAllowed = ruleAppliesTo(rules.split_duty, opType);
  const split = (maxBreak && splitAllowed)
    ? splitDuty(maxBreak.start, maxBreak.end, accommodation, rules)
    : { isSplit: false, extensionMin: 0 };
  // İNTİBAK (Md.22/1): Tablo 1'in bandı, ekibin İNTİBAK ETTİĞİ meydanın yerel
  // saatiyle okunur — kalkış meydanınınkiyle değil. Doğu-batı uçuşundan sonra
  // ikisi ayrışır ve yanlış bant, azami UGS'yi olduğundan büyük/küçük gösterir.
  // Çağıran ofset farkını çözüp `bandReport`'u geçirir (motor TZ sorgusu yapmaz).
  // Geçilmezse bandı kalkış saati belirler — eski davranış (tek dilimli operasyon).
  const bandReport = opts.bandReport || report;
  const baseFdp = maxFdpMinutes(bandReport, legs.length, rules,
    { singlePilot: opts.singlePilot, operationType: opType });
  let maxFdp = baseFdp != null ? baseFdp + split.extensionMin : null;
  // ARTIRILMIS UCUS EKIBI — SHT-FTL/HG Md.11(4): azami gunluk UGS, ucus
  // sirasindaki dinlenmeye bagli olarak BIR ilave pilotla +2 saat, IKI ilave
  // pilotla +3 saat uzatilir (tablo degerinin USTUNE — sabit tavan degil).
  // Md.11(2): UGS 3 sektorle sinirlidir. Md.15(d): acik mesai (split) ile
  // BIRLESTIRILEMEZ — bu yuzden augmented'da split uzatmasi uygulanmaz.
  let augmented = false;
  let augmentedSectorLimitExceeded = false;
  if ((opts.threePilot || opts.fourPilot) && ruleAppliesTo(rules.augmented_crew, opType)) {
    const ac = rules.augmented_crew || {};
    const ext = opts.fourPilot ? ac.extension_two_additional_min : ac.extension_one_additional_min;
    maxFdp = (baseFdp != null && ext != null) ? baseFdp + ext : null;  // split BILEREK haric
    if (legs.length > (ac.max_sectors ?? 3)) augmentedSectorLimitExceeded = true;
    augmented = true;
  }
  // UZUN MENZIL (HG Md.22(3)): >=4 saatlik dilim farki gecilen gorevde standart
  // ekiple azami gunluk UGS 14:00 — tablo degeri daha buyukse TAVAN uygulanir.
  // Artirilmis ekipte Md.11 uzatmasi gecerli kalir (Md.22(3) 'standart sayida
  // ekip' der), bu yuzden tavan yalniz augmented DEGILKEN uygulanir.
  let longRangeCapped = false;
  if (opts.longRange && !augmented && ruleAppliesTo(rules.long_range, opType)
      && rules.long_range?.max_daily_fdp != null && maxFdp != null) {
    const cap = toMin(rules.long_range.max_daily_fdp);
    if (cap != null && maxFdp > cap) { maxFdp = cap; longRangeCapped = true; }
  }
  // NOBET (Md.17): once nobette gecen sure kadar azami UGS kisalir. Cagiran
  // hesaplar (standbyReductionMin), motor yalnizca uygular ve raporlar.
  let standbyReducedMin = 0;
  if (opts.standbyReductionMin > 0 && maxFdp != null) {
    standbyReducedMin = opts.standbyReductionMin;
    maxFdp = Math.max(0, maxFdp - standbyReducedMin);
  }
  const lastEta = legs[legs.length - 1].eta;
  const fdpMin = spanMin(report, lastEta);              // FDP = report → son on block
  const dutyEndMin = toMin(lastEta) + postFlightMin;    // duty = ... + ucus sonrasi
  const dutyMin = fdpMin != null ? fdpMin + postFlightMin : null;
  const latestFdpEnd = maxFdp != null ? fmtMin((reportMin + maxFdp + 2880) % 1440) : null;
  // UCUS SURESI (blok) — Md.27 egitim gunluk siniri icin gerekli.
  const flightMin = legs.reduce((a, l) => a + (spanMin(l.etd, l.eta) || 0), 0);
  const flightLimitMin = opType === 'training'
    ? trainingFlightLimitMin(rules, opts.trainingKind, opts.sameDayTheory) : null;
  return {
    report, bandReport, acclimatisedTo: opts.acclimatisedTo ?? null,
    fdpMin, dutyMin,
    dutyEnd: fmtMin(((dutyEndMin ?? 0) + 2880) % 1440),
    maxFdpMin: maxFdp, latestFdpEnd,
    split, breakMin: maxBreak?.min ?? null,
    fdpExceeded: fdpMin != null && maxFdp != null && fdpMin > maxFdp,
    augmented, augmentedSectorLimitExceeded, longRangeCapped,
    operationType: opType, preFlightMin, postFlightMin,
    flightMin, flightLimitMin,
    flightLimitExceeded: flightLimitMin != null && flightMin > flightLimitMin,
    standbyReducedMin,
  };
}
