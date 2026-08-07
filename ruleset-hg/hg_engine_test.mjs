import { maxFdpMinutes, dutyWindow, splitDuty, fitness, fmtMin, trainingFlightLimitMin, isSingleDayOff, daysOffSummary,
         standbyEffect, standbyBefore, standbyLimits, standbyRef,
         skpkLimits, skpkRef, previousDuty, tzOffsetMin, spanMin, acclimatisation, bandReportHHMM } from '../efb/src/components/FTLEngine.js';
import { readFileSync } from 'fs';
const regulation = JSON.parse(readFileSync(new URL('./ruleset_hg_regulation.json', import.meta.url),'utf8'));
const rs = { regulation, company: { overrides:{}, pre_flight_report_minutes:60, post_flight_duty_minutes:30, mandatory_report_hours:72 } };
const rules = regulation;
let pass=0, fail=0;
const eq = (name, got, want) => { const ok = got===want; ok?pass++:fail++; console.log((ok?'✓':'✗ FAIL'), name, '→', got, ok?'':'(beklenen '+want+')'); };

// Tablo 1 — 9 hucre × cift pilot + 3 tek pilot ornegi (dakika)
eq('06:00 band 2 sec dual (13:30)', maxFdpMinutes('07:00',2,rules), 810);
eq('06:00 band 5 sec dual (12:30)', maxFdpMinutes('14:59',5,rules), 750);
eq('06:00 band 6 sec dual (11:30)', maxFdpMinutes('06:00',6,rules), 690);
eq('15:01 band 4 sec dual (12:30)', maxFdpMinutes('16:00',4,rules), 750);
eq('15:01 band 5 sec dual (11:30)', maxFdpMinutes('18:00',5,rules), 690);
eq('15:01 band 7 sec dual (10:30)', maxFdpMinutes('15:01',7,rules), 630);
eq('gece band 1 sec dual (11:30)',  maxFdpMinutes('02:00',1,rules), 690);
eq('gece band 5 sec dual (10:30)',  maxFdpMinutes('23:00',5,rules), 630);
eq('gece band 8 sec dual (09:30)',  maxFdpMinutes('05:59',8,rules), 570);
eq('06:00 band 2 sec SINGLE (11:00)', maxFdpMinutes('07:00',2,rules,{singlePilot:true}), 660);
eq('gece band 6 sec SINGLE (07:00)',  maxFdpMinutes('19:00',6,rules,{singlePilot:true}), 420);

// dutyWindow: 07:00 rapor (ETD 08:00), 2 sektor → max 13:30; augmented → +2:00 = 15:30
const legs2 = [{dep:'LTAC',dest:'LTFE',etd:'08:00',eta:'09:15'},{dep:'LTFE',dest:'LTAC',etd:'10:00',eta:'11:15'}];
const w1 = dutyWindow(legs2,'hotel',rs,{});
eq('dutyWindow rapor 07:00 max (810)', w1.maxFdpMin, 810);
const w2 = dutyWindow(legs2,'hotel',rs,{threePilot:true});
eq('augmented +2h (930)', w2.maxFdpMin, 930);
eq('augmented bayrak', w2.augmented, true);
const legs4 = [...legs2, {dep:'LTAC',dest:'LTBA',etd:'12:00',eta:'13:00'}, {dep:'LTBA',dest:'LTAC',etd:'14:00',eta:'15:00'}];
const w3 = dutyWindow(legs4,'hotel',rs,{threePilot:true});
eq('augmented 4 sektor > limit uyarisi', w3.augmentedSectorLimitExceeded, true);

// uzun menzil: 07:00 rapor 1 sektor dual normal 13:30 → longRange tavan 14:00 UYGULANMAZ (13:30<14:00)…
const wLR1 = dutyWindow([{dep:'LTAC',dest:'KJFK',etd:'08:00',eta:'18:00'}],'hotel',rs,{longRange:true});
eq('uzun menzil: tablo 13:30 < tavan → 810 kalir', wLR1.maxFdpMin, 810);
// split ile 13:30+4:00=17:30 olurdu → tavan 14:00 keser
const legsSplit = [{dep:'LTAC',dest:'KJFK',etd:'08:00',eta:'12:00'},{dep:'KJFK',dest:'LTAC',etd:'20:00',eta:'23:00'}]; // 8h mola
const wLR2 = dutyWindow(legsSplit,'hotel',rs,{longRange:true});
console.log('  split+longRange:', fmtMin(wLR2.maxFdpMin), 'split ext:', wLR2.split.extensionMin, 'capped:', wLR2.longRangeCapped);
eq('uzun menzil tavan 14:00 (840)', wLR2.maxFdpMin, 840);

// split tavani: 10h mola → %50=5h ama cap 4h
const sd = splitDuty('10:00','20:00','hotel',rules);
eq('split uzatma tavani 240', sd.extensionMin, 240);

// Md.5 — 6 ardisik gun sonrasi 7. gune gorev → NOT LEGAL
const mkDuty = (date) => ({duty_type:'flight',status:'actual',duty_date:date,report_time:date+'T05:00:00Z',duty_end:date+'T13:00:00Z',sectors:[]});
const six = ['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06'].map(mkDuty);
const f1 = fitness({pilot:{},baseline:null,duties:six,ruleset:rs,
  newDuty:{reportISO:'2026-08-07T05:00:00Z',sectors:legs2,dutyMin:600,dutyDate:'2026-08-07'},asOf:new Date('2026-08-07T00:00:00Z')});
eq('6 ardisik gun → ihlal var', f1.reasons.some(r=>r.includes('CONSECUTIVE')), true);
const f2 = fitness({pilot:{},baseline:null,duties:six.slice(0,5),ruleset:rs,
  newDuty:{reportISO:'2026-08-07T05:00:00Z',sectors:legs2,dutyMin:600,dutyDate:'2026-08-07'},asOf:new Date('2026-08-07T00:00:00Z')});
eq('5 gun + bosluk → ihlal yok', f2.reasons.some(r=>r.includes('CONSECUTIVE')), false);

// Kumulatif: flt_cal_year limiti YOK → kontrol calismamali (HG Md.13'te yok)
eq('flt_cal_year kontrolu devre disi', f2.reasons.some(r=>r.includes('FLT CAL YEAR')), false);
// ── FAALIYET TIPI (Md.9 / 22 / 25 / 26 / 27) ──
eq('GH cift pilot 14:00 (840)', maxFdpMinutes('07:00',2,rules,{operationType:'general_aviation'}), 840);
eq('GH tek pilot 12:00 (720)',  maxFdpMinutes('07:00',2,rules,{operationType:'general_aviation',singlePilot:true}), 720);
eq('GH GECE de 14:00 (bant yok)', maxFdpMinutes('23:00',6,rules,{operationType:'general_aviation'}), 840);
eq('hava isi = hava taksi alias (810)', maxFdpMinutes('07:00',2,rules,{operationType:'aerial_work'}), 810);
eq('egitim UGS 12:00 (720)', maxFdpMinutes('07:00',2,rules,{operationType:'training'}), 720);
eq('egitim UGS gece de 720', maxFdpMinutes('23:00',5,rules,{operationType:'training'}), 720);
eq('egitim ucus siniri ogretmen 6h', trainingFlightLimitMin(rules,'instructor_examiner'), 360);
eq('egitim ucus siniri PPL/tip 4h',  trainingFlightLimitMin(rules,'ppl_cpl_ir_type'), 240);
eq('ayni gun teorik → yariya iner',   trainingFlightLimitMin(rules,'instructor_examiner',true), 180);

// Egitim gorevinde ucus suresi siniri ihlali + ucus sonrasi 60 dk (Md.10(c))
const trLegs = [{dep:'LTAC',dest:'LTAC',etd:'08:00',eta:'15:00'}]; // 7 saat ucus
const wTr = dutyWindow(trLegs,'hotel',rs,{operationType:'training',trainingKind:'instructor_examiner'});
eq('egitim ucus 7h > 6h siniri', wTr.flightLimitExceeded, true);
eq('egitim ucus sonrasi 60 dk', wTr.postFlightMin, 60);
const wTr2 = dutyWindow([{dep:'LTAC',dest:'LTAC',etd:'08:00',eta:'13:00'}],'hotel',rs,{operationType:'training',trainingKind:'instructor_examiner'});
eq('egitim ucus 5h ≤ 6h ihlal yok', wTr2.flightLimitExceeded, false);

// GH: artirilmis ekip ve uzun menzil tavani UYGULANMAZ (applies_to)
const wGa = dutyWindow(legs2,'hotel',rs,{operationType:'general_aviation',threePilot:true});
eq('GH: augmented uygulanmaz → 840 kalir', wGa.maxFdpMin, 840);
eq('GH: augmented bayragi kapali', wGa.augmented, false);
const wGaLr = dutyWindow(legsSplit,'hotel',rs,{operationType:'general_aviation',longRange:true});
eq('GH: uzun menzil tavani yok → 840', wGaLr.maxFdpMin, 840);
eq('GH: split uzatmasi yok', wGaLr.split.extensionMin, 0);

// ── NOBET (Md.17) ────────────────────────────────────────────────────
const wSb = dutyWindow(legs2,'hotel',rs,{standbyReductionMin:90});
eq('nobet kisaltmasi 810-90=720', wSb.maxFdpMin, 720);

const sbDuty = (kind, startZ, endZ, date='2026-08-10', pilot='P1') => ({
  id:`sb_${kind}_${startZ}`, pilot_id:pilot, duty_type:'ground', ground_kind:kind, status:'planned',
  duty_date:date, report_time:`${date}T${startZ}:00Z`, duty_end:`${date}T${endZ}:00Z` });

// Md.17(1) HAVAALANI NOBETI — tamami gorev, 4 saat USTU kadar UGS kisalir
const eApt6 = standbyEffect(sbDuty('airport_standby','04:00','10:00'), rules);
eq('APT nobet 6h suresi', eApt6.standbyMin, 360);
eq('APT nobet: 4h ustu 2h kisaltma', eApt6.fdpReductionMin, 120);
eq('APT nobet: tamami gorev sayilir', eApt6.dutyCreditMin, 360);
const eApt3 = standbyEffect(sbDuty('airport_standby','07:00','10:00'), rules);
eq('APT nobet 3h → kisaltma YOK', eApt3.fdpReductionMin, 0);

// Md.17(1)(c) BIRLESIK TAVAN 16:00 — kisaltmadan AYRI, ondan SONRA gelir
eq('APT birlesik 6h+9h=15h → tavan asilmaz', standbyLimits(eApt6, 540).combinedExceeded, false);
const cmb = standbyLimits(eApt6, 660);   // 6h nobet + 11h UGS = 17h
eq('APT birlesik 6h+11h=17h → TAVAN ASILDI', cmb.combinedExceeded, true);
eq('APT birlesik toplam dakika', cmb.combinedMin, 1020);
eq('APT birlesik ihlal gerekce uretir', cmb.reasons.length, 1);
eq('APT birlesik ok=false', cmb.ok, false);

// Md.17(2) HARICI NOBET — %25 gorev kredisi, 6h ustu kisaltma, azami 16h
const eOth8 = standbyEffect(sbDuty('other_standby','02:00','10:00'), rules);
eq('HARICI 8h: %25 gorev kredisi 2h', eOth8.dutyCreditMin, 120);
eq('HARICI 8h: 6h ustu 2h kisaltma', eOth8.fdpReductionMin, 120);
eq('HARICI 8h: azami asilmadi', eOth8.maxExceeded, false);
eq('HARICI: gorev yoksa 8h dinlenme', eOth8.restIfNoDutyMin, 480);
// UGS uzatilmissa esik 6h → 8h olur
const eOth8x = standbyEffect(sbDuty('other_standby','02:00','10:00'), rules, {fdpExtended:true});
eq('HARICI 8h + uzatilmis UGS → kisaltma 0', eOth8x.fdpReductionMin, 0);
// Azami 16 saat — nobetin KENDI ihlali, gorev atanmasa da gecersiz
const eOth17 = standbyEffect(sbDuty('other_standby','00:00','17:00'), rules);
eq('HARICI 17h → azami asildi', eOth17.maxExceeded, true);
eq('HARICI 17h: gorev atanmadan da ihlal', standbyLimits(eOth17, null).ok, false);
// Harici nobette BIRLESIK TAVAN YOKTUR (yalniz Md.17/1'e ait)
eq('HARICI: birlesik tavan uygulanmaz', standbyLimits(eOth8, 660).combinedExceeded, false);

// BOZUK NOBET KAYDI — bitis baslangictan once (kuru kosuda yakalandi, 6 Agu).
// Negatifi sifira kirpip "etkisi yok, gecerli" demek 17 saatlik bir nobeti
// zararsiz gosterirdi; azami sure kontrolu de sessizce gecerdi.
const eBad = standbyEffect(sbDuty('other_standby','13:00','06:00'), rules);   // ayni gun → negatif
eq('bozuk nobet isaretlenir', eBad.invalid, true);
eq('bozuk nobet sure 0', eBad.standbyMin, 0);
eq('bozuk nobet SESSIZCE gecmez', standbyLimits(eBad, 300).ok, false);
eq('saglam nobet invalid degil', standbyEffect(sbDuty('other_standby','02:00','10:00'), rules).invalid, false);

// standbyBefore — ayni gun + ayni pilot; rapordan ONCE bitmis olan tercih edilir
const sbDay = '2026-08-10';
const pool = [ sbDuty('airport_standby','04:00','08:00',sbDay,'P1'),
               sbDuty('other_standby','09:00','12:00',sbDay,'P1'),
               sbDuty('airport_standby','04:00','08:00',sbDay,'P2') ];
eq('nobet bulundu (P1)', standbyBefore(pool,'P1',sbDay,`${sbDay}T08:30:00Z`)?.ground_kind, 'airport_standby');
eq('baska pilotun nobeti alinmaz', standbyBefore(pool,'P3',sbDay,`${sbDay}T08:30:00Z`), null);
eq('rapordan SONRA biten nobet elenir', standbyBefore(pool,'P1',sbDay,`${sbDay}T08:30:00Z`)?.duty_end, `${sbDay}T08:00:00Z`);

// Uctan uca: nobet → kisaltilmis pencere → kayda yazilan degerler
// legs2 raporu 07:00, tablo 13:30 (810). 6h APT nobeti → 810-120 = 690.
const wSbFull = dutyWindow(legs2,'hotel',rs,{standbyReductionMin:eApt6.fdpReductionMin});
eq('uctan uca: kisaltilmis azami UGS 11:30', wSbFull.maxFdpMin, 690);
eq('uctan uca: kayda yazilan kisaltma', wSbFull.standbyReducedMin, 120);
eq('uctan uca: 4:15 UGS asmaz', wSbFull.fdpExceeded, false);
// standbyRef — kayda donan insan-okur ozet (kaynak silinse de kalir)
const refTxt = standbyRef(sbDuty('airport_standby','04:00','10:00'), eApt6);
eq('standbyRef madde referansi tasir', refTxt.includes('Md.17(1)'), true);
eq('standbyRef kisaltmayi tasir', refTxt.includes('−02:00'), true);
eq('standbyRef saatleri tasir', refTxt.includes('04:00–10:00Z'), true);

// ── SKPK — SORUMLU KAPTAN PILOT KARARI (Md.12) ───────────────────────
// Md.12(1)(a) uzatma tavani: 2h standart, 3h artirilmis ekip
eq('SKPK +2h standart ekip → gecerli', skpkLimits({fdpExtensionMin:120}, rules, {}).extensionExceeded, false);
eq('SKPK +2:01 standart ekip → TAVAN ASILDI', skpkLimits({fdpExtensionMin:121}, rules, {}).extensionExceeded, true);
eq('SKPK +3h artirilmis ekip → gecerli', skpkLimits({fdpExtensionMin:180}, rules, {augmented:true}).extensionExceeded, false);
eq('SKPK +3h STANDART ekip → TAVAN ASILDI', skpkLimits({fdpExtensionMin:180}, rules, {}).extensionExceeded, true);
eq('SKPK artirilmis tavan degeri 180', skpkLimits({fdpExtensionMin:0}, rules, {augmented:true}).extensionMaxMin, 180);

// Md.12(2) kisaltma tavani 2h + 10 saat TABANI
eq('SKPK dinlenme −2h → gecerli', skpkLimits({restReductionMin:120}, rules, {prevMinRestMin:720}).reductionExceeded, false);
eq('SKPK dinlenme −2:30 → TAVAN ASILDI', skpkLimits({restReductionMin:150}, rules, {prevMinRestMin:720}).reductionExceeded, true);
// 12h hak edilen − 2h = 10h → tam tabanda, gecerli
eq('12h−2h=10h → taban delinmez', skpkLimits({restReductionMin:120}, rules, {prevMinRestMin:720}).restFloorBreached, false);
// 11h hak edilen − 2h = 9h → taban delinir
const flr = skpkLimits({restReductionMin:120}, rules, {prevMinRestMin:660});
eq('11h−2h=9h → TABAN DELINDI', flr.restFloorBreached, true);
eq('taban delinince kalan sure', flr.restAfterReductionMin, 540);
eq('taban ihlali gerekce uretir', flr.reasons.length, 1);

// Md.12(2) TELAFI: musteakip gorev sonrasi dinlenme 2 KAT artar
const cmp = skpkLimits({restReductionMin:90}, rules, {prevMinRestMin:720, earnedRestMin:720});
eq('telafi = kisaltmanin 2 kati', cmp.compensationMin, 180);
eq('bu gorevin min_rest i 12h+3h=15h', cmp.minRestWithCompensationMin, 900);
eq('kisaltma yoksa telafi yok', skpkLimits({fdpExtensionMin:60}, rules, {earnedRestMin:720}).compensationMin, 0);

// Md.12(3) uzatilmis UGS yi MUTEAKIP dinlenme kisaltilamaz
eq('onceki gorev SKPK ile uzatildi + kisaltma → YASAK',
   skpkLimits({restReductionMin:60}, rules, {prevMinRestMin:720, prevHadSkpkExtension:true}).afterExtensionBlocked, true);
eq('onceki gorevde uzatma yok → kisaltma serbest',
   skpkLimits({restReductionMin:60}, rules, {prevMinRestMin:720, prevHadSkpkExtension:false}).afterExtensionBlocked, false);
eq('uzatma var ama kisaltma yok → ihlal yok',
   skpkLimits({fdpExtensionMin:60}, rules, {prevHadSkpkExtension:true}).afterExtensionBlocked, false);

// Md.12(1)(c) RAPORLAMA — isleticiye HER ZAMAN, Genel Mudurluge 1 SAATI ASARSA
eq('SKPK yoksa isletici raporu da yok', skpkLimits({}, rules, {}).operatorReportRequired, false);
eq('30dk uzatma → isletici raporu VAR', skpkLimits({fdpExtensionMin:30}, rules, {}).operatorReportRequired, true);
eq('60dk → 1 saati ASMIYOR, SHGM raporu YOK', skpkLimits({fdpExtensionMin:60}, rules, {}).authorityReportRequired, false);
eq('61dk → 1 saati ASIYOR, SHGM raporu VAR', skpkLimits({fdpExtensionMin:61}, rules, {}).authorityReportRequired, true);
eq('kisaltma 90dk → SHGM raporu VAR', skpkLimits({restReductionMin:90}, rules, {prevMinRestMin:720}).authorityReportRequired, true);
const due = skpkLimits({fdpExtensionMin:90}, rules, {dutyEndISO:'2026-08-10T18:00:00Z'});
eq('SHGM son tarihi = gorev sonu + 28 gun', due.authorityDueISO.slice(0,10), '2026-09-07');

// UGS asimi: SKPK uzatmasi YETIYORSA asim kalkar, YETMIYORSA surer
eq('13:30 tavan + 2h SKPK → 14:30 UGS asmaz',
   skpkLimits({fdpExtensionMin:120}, rules, {baseMaxFdpMin:810, fdpMin:870}).fdpStillExceeded, false);
eq('13:30 tavan + 2h SKPK → 16:00 UGS HALA ASIYOR',
   skpkLimits({fdpExtensionMin:120}, rules, {baseMaxFdpMin:810, fdpMin:960}).fdpStillExceeded, true);
eq('SKPK sonrasi azami UGS', skpkLimits({fdpExtensionMin:120}, rules, {baseMaxFdpMin:810}).maxFdpWithSkpkMin, 930);

// previousDuty — zincirin ONCEKI halkasi (Md.12/3 ve hak edilen dinlenme icin)
const chain = [
  {id:'d1', pilot_id:'P1', duty_type:'flight', status:'actual', duty_end:'2026-08-09T18:00:00Z'},
  {id:'d2', pilot_id:'P1', duty_type:'flight', status:'actual', duty_end:'2026-08-10T12:00:00Z'},
  {id:'d3', pilot_id:'P2', duty_type:'flight', status:'actual', duty_end:'2026-08-10T12:00:00Z'},
  {id:'d4', pilot_id:'P1', duty_type:'flight', status:'cancelled', duty_end:'2026-08-10T14:00:00Z'},
];
eq('onceki gorev = en yakin biten', previousDuty(chain,'P1','2026-08-10T20:00:00Z','dX')?.id, 'd2');
eq('iptal edilmis gorev sayilmaz', previousDuty(chain,'P1','2026-08-10T20:00:00Z','d2')?.id, 'd1');
eq('kendi kendini secmez', previousDuty(chain,'P1','2026-08-10T13:00:00Z','d2')?.id, 'd1');
eq('baska pilotun gorevi alinmaz', previousDuty(chain,'P3','2026-08-10T20:00:00Z')?.id ?? null, null);

// skpkRef — kayda donan ozet
const sk = skpkLimits({fdpExtensionMin:90, restReductionMin:60}, rules, {prevMinRestMin:720, dutyEndISO:'2026-08-10T18:00:00Z'});
const skTxt = skpkRef(sk);
eq('skpkRef madde referansi', skTxt.includes('Md.12'), true);
eq('skpkRef uzatmayi tasir', skTxt.includes('FDP +01:30'), true);
eq('skpkRef telafiyi tasir', skTxt.includes('next rest +02:00'), true);
eq('skpkRef SHGM yukumlulugunu tasir', skTxt.includes('DGCA REPORT DUE'), true);
eq('SKPK yoksa ref null', skpkRef(skpkLimits({}, rules, {})), null);

// ── SEKTOR SAYISI = EMNIYET GIRDISI (arsiv turetmesinin korudugu ozellik) ──
// "Illegalite olmasin, saatler yeter" (Serkan, 6 Agu). Saatler dogru olsa bile
// SEKTOR EKSIK sayilirsa azami UGS OLDUGUNDAN BUYUK cikar ve asim GORUNMEZ.
// Rapordan sokulen kusur (sectors:1 sabit) ve arsiv turetmesinde tekrarlanmasi
// engellenen kusur tam olarak budur — asagidaki fark onun buyuklugu.
const rep = '07:00';
eq('1 sektor (06:00 bandi) 13:30', maxFdpMinutes(rep, 1, rules), 810);
eq('4 sektor ayni bant 13:30', maxFdpMinutes(rep, 4, rules), 810);
eq('5 sektor ayni bant 12:30', maxFdpMinutes(rep, 5, rules), 750);
eq('6 sektor ayni bant 11:30', maxFdpMinutes(rep, 6, rules), 690);
// Eksik saymanin bedeli: 6 bacakli gun 1 bacak sayilirsa limit 2 SAAT gevser
eq('6 bacagi 1 sayarsan limit 2h gevser',
   maxFdpMinutes(rep, 1, rules) - maxFdpMinutes(rep, 6, rules), 120);
// 12:00'lik gerceklesen UGS: 6 sektorde ASIM, 1 sektorde gorunmez
eq('6 sektorde 12:00 UGS ASIYOR', 720 > maxFdpMinutes(rep, 6, rules), true);
eq('1 sektor sayilsa ASIM GORUNMEZDI', 720 > maxFdpMinutes(rep, 1, rules), false);
// Nobet/SKPK etkileri yeni tabanin uzerine tasinir (recomputeMaxFdp'nin kurali)
const reBase = maxFdpMinutes(rep, 6, rules);              // 690
eq('yeni taban − nobet + SKPK', Math.max(0, reBase - 120) + 60, 630);

// ── INTIBAK (Md.22/1) ──────────────────────────────────────────────────────
// Bant 2h; bant disinda: us DISINDA <24h → ILK kalkis meydani, >=24h → MEVCUT.
const H = 60;
const prevAt = (icao, offH, endISO) => ({ refIcao:icao, refOffsetMin: offH*H, dutyEndISO: endISO });
const nextAt = (icao, offH, repISO, home=null) =>
  ({ depIcao:icao, depOffsetMin: offH*H, reportISO: repISO, homeBaseIcao: home });

// Ilk gorev: zincirde onceki yok → kalkis meydanina intibakli
eq('ilk gorev → kalkis meydani', acclimatisation(null, nextAt('LTAC',3,'2026-08-10T06:00:00Z'), rules).icao, 'LTAC');

// c.1 — 2 saatlik BANT ICINDE: mevcut kalkis meydani (dinlenmeye bakilmaz)
eq('bant ici (+3 → +2, 1h fark) → mevcut meydan',
   acclimatisation(prevAt('LTAC',3,'2026-08-09T18:00:00Z'), nextAt('EDDF',2,'2026-08-10T06:00:00Z'), rules).icao, 'EDDF');
eq('bant siniri TAM 2h → hala bant ici',
   acclimatisation(prevAt('LTAC',3,'2026-08-09T18:00:00Z'), nextAt('EGLL',1,'2026-08-10T06:00:00Z'), rules).icao, 'EGLL');

// c.2 — BANT DISI (+3 vs −4 = 7h) us DISINDA
// 12 saat dinlenme (<24h) → ILK kalkis meydanina intibakli KALIR
const short = acclimatisation(prevAt('LTAC',3,'2026-08-09T18:00:00Z'),
                              nextAt('KJFK',-4,'2026-08-10T06:00:00Z','LTAC'), rules);
eq('bant disi + 12h dinlenme → ILK meydan (LTAC)', short.icao, 'LTAC');
eq('bant disi dinlenme suresi tasinir', short.restMin, 720);
eq('bant disi dilim farki 7h', short.diffMin, 420);
// 30 saat dinlenme (>=24h) → MEVCUT kalkis meydanina intibak
eq('bant disi + 30h dinlenme → MEVCUT meydan (KJFK)',
   acclimatisation(prevAt('LTAC',3,'2026-08-09T00:00:00Z'),
                   nextAt('KJFK',-4,'2026-08-10T06:00:00Z','LTAC'), rules).icao, 'KJFK');
// Esik TAM 24h → MEVCUT (">= 24 saat" hukmu)
eq('TAM 24h → MEVCUT meydan',
   acclimatisation(prevAt('LTAC',3,'2026-08-09T06:00:00Z'),
                   nextAt('KJFK',-4,'2026-08-10T06:00:00Z','LTAC'), rules).icao, 'KJFK');
// ANA USTE dinlenildiyse: 24h kurali islemez, ana usse intibakli
eq('ana uste dinlenme → ana us (kisa dinlenmede bile)',
   acclimatisation(prevAt('KJFK',-4,'2026-08-09T18:00:00Z'),
                   nextAt('LTAC',3,'2026-08-10T06:00:00Z','LTAC'), rules).icao, 'LTAC');

// Bilinmeyenler UYDURULMAZ (Ilke 1)
eq('kural seti intibak tanimlamiyorsa → unavailable',
   acclimatisation(null, nextAt('LTAC',3,'2026-08-10T06:00:00Z'), { min_rest:{} }).unavailable, true);
eq('kalkis meydani dilimi bilinmiyorsa → unavailable',
   acclimatisation(null, { depIcao:'XXXX', depOffsetMin:null, reportISO:'2026-08-10T06:00:00Z' }, rules).unavailable, true);
eq('bant disi + dinlenme suresi bilinmiyorsa → unavailable',
   acclimatisation({ refIcao:'LTAC', refOffsetMin:180, dutyEndISO:null },
                   nextAt('KJFK',-4,'2026-08-10T06:00:00Z','LTAC'), rules).unavailable, true);

// bandReportHHMM — Tablo 1'in okundugu saat
eq('LTAC(+3) intibakli, KJFK(-4) kalkis: 06:00 → 13:00', bandReportHHMM('06:00', -4*H, 3*H), '13:00');
eq('ayni dilim → saat degismez', bandReportHHMM('06:00', 3*H, 3*H), '06:00');
eq('gece yarisini sarar', bandReportHHMM('23:00', 0, 3*H), '02:00');

// ETKI: intibak BANDI DEGISTIRIR, azami UGS degisir
// KJFK'ten 06:00 yerel kalkis, 2 sektor: kalkis saatiyle 06:00 bandi → 13:30
eq('kalkis saatiyle band (06:00) → 13:30', dutyWindow(
  [{dep:'KJFK',dest:'LTAC',etd:'07:00',eta:'15:00'}], 'hotel', rs, {}).maxFdpMin, 810);
// LTAC'a intibakli kalmissa ayni an 13:00 → 15:01-18:00 bandinin da otesinde? hayir:
// 13:00 hala 06:00-15:00 bandinda → 13:30. Gece ornegi ile ayrisma gosterilir:
eq('intibak bandi 19:00 → gece bandi 11:30', dutyWindow(
  [{dep:'KJFK',dest:'LTAC',etd:'07:00',eta:'15:00'}], 'hotel', rs,
  { bandReport:'19:00' }).maxFdpMin, 690);
eq('intibak bandi kayda doner', dutyWindow(
  [{dep:'KJFK',dest:'LTAC',etd:'07:00',eta:'15:00'}], 'hotel', rs,
  { bandReport:'19:00', acclimatisedTo:'LTAC' }).acclimatisedTo, 'LTAC');
eq('band gecilmezse kalkis saati kullanilir', dutyWindow(
  [{dep:'KJFK',dest:'LTAC',etd:'07:00',eta:'15:00'}], 'hotel', rs, {}).bandReport, '06:00');

// ── SAATLER UTC, BANT YEREL (Serkan ilkesi 6 Agu + Md.22/2) ────────────────
// "Butun zamanlar UTC olmali; lokal time isleri icin kendi hesaplamasini
//  yapabilir." Girilen/gosterilen saat UTC; Tablo 1 ise YEREL saat ister.
// Bandi UTC ile okumak YANLIS SATIRI secer — asagidaki fark tam olarak o.
// LTAC (+03), ETD 04:00Z → rapor 03:00Z → YEREL 06:00 → gunduz bandi 13:30.
eq('UTC rapor 03:00 → yerel 06:00 (+03)', bandReportHHMM('03:00', 0, 180), '06:00');
eq('YEREL bant ile 2 sektor = 13:30', maxFdpMinutes('06:00', 2, rules), 810);
eq('UTC ile okunsaydi GECE bandi = 11:30', maxFdpMinutes('03:00', 2, rules), 690);
eq('fark 2 saat (yanlis bant bedeli)',
   maxFdpMinutes('06:00', 2, rules) - maxFdpMinutes('03:00', 2, rules), 120);
// dutyWindow: rapor UTC kalir, bant ayri okunur — fiziksel saat DEGISMEZ
const legsUtc = [{dep:'LTAC',dest:'LTFE',etd:'04:00',eta:'05:15'}];
const wUtc = dutyWindow(legsUtc, 'hotel', rs, {});
eq('rapor UTC 03:00 (girilen saatten turer)', wUtc.report, '03:00');
eq('bant gecilmezse rapor saati kullanilir → 690', wUtc.maxFdpMin, 690);
const wBand = dutyWindow(legsUtc, 'hotel', rs, { bandReport: bandReportHHMM('03:00', 0, 180) });
eq('bant yerel verilince → 810', wBand.maxFdpMin, 810);
eq('rapor saati DEGISMEDI (fiziksel zaman ayni)', wBand.report, '03:00');
eq('bandReport kayda doner', wBand.bandReport, '06:00');
// Bati yonu: LEIB (+02) degil, KJFK (−04) — UTC 10:00 → yerel 06:00
eq('UTC 10:00 → KJFK yerel 06:00', bandReportHHMM('10:00', 0, -240), '06:00');
// Gece yarisini saran kayma
eq('UTC 23:00 → +03 yerel 02:00', bandReportHHMM('23:00', 0, 180), '02:00');
eq('UTC 01:00 → −04 yerel 21:00', bandReportHHMM('01:00', 0, -240), '21:00');

// ── KURAL SETI TANIMLAMIYORSA SAYIYI KODDAN UYDURMA (Ilke 1) ───────────────
// Canli ruleset (SHT-FTL Rev02) taramasinda bulundu: `standby` ve
// `commander_discretion` bloklari YOKKEN motor `?? 240` gibi yedeklerle Turk HG
// rakamlarini SESSIZCE uyguluyordu. Baska regulasyondaki musteriye yanlis limit
// dayanir ve ihlal "gecerli" gorunur. Artik "hesaplayamiyorum" der.
const noSb = { min_rest:{}, cumulative_limits:{} };   // eski sema: standby/skpk yok
const eNo = standbyEffect(sbDuty('airport_standby','00:00','06:00'), noSb);
eq('nobet tanimsiz → unavailable', eNo.unavailable, true);
eq('nobet tanimsiz → kisaltma UYDURULMAZ', eNo.fdpReductionMin, 0);
eq('nobet tanimsiz → dogrulanamaz (ok=false)', standbyLimits(eNo, 300).ok, false);
const kNo = skpkLimits({fdpExtensionMin:121}, noSb, {});
eq('SKPK tanimsiz → unavailable', kNo.unavailable, true);
eq('SKPK tanimsiz → tavan UYDURULMAZ', kNo.extensionMaxMin, null);
eq('SKPK tanimsiz → dogrulanamaz (ok=false)', kNo.ok, false);
eq('SKPK tanimsiz → SHGM yukumlulugu uydurulmaz', kNo.authorityDueISO, null);
// HG ruleset'iyle ayni cagrilar CALISMAYA devam eder
eq('HG ile nobet calisir', standbyEffect(sbDuty('airport_standby','00:00','06:00'), rules).fdpReductionMin, 120);
eq('HG ile SKPK calisir', skpkLimits({fdpExtensionMin:121}, rules, {}).extensionExceeded, true);

// GERCEKLESEN UGS — SAAT DILIMI TUZAGI (panelin SKPK onerisi bunu kullanir).
// report_time MUTLAK (timestamptz), on_block YEREL "HH:MM". Dogrudan
// karsilastirmak +03'te 3 saat hata verir; rapor once gorevin KENDI diliminde
// (report_tz = kalkis meydani) yerellestirilmeli.
const repLocal = (iso, tz) => {
  const t = new Date(iso).getTime();
  return fmtMin(((t / 60000) + tzOffsetMin(tz, t)) % 1440);
};
eq('TR yaz saati: 04:00Z → 07:00 yerel', repLocal('2026-08-10T04:00:00Z','Europe/Istanbul'), '07:00');
eq('gerceklesen UGS 07:00→21:42 = 14:42', spanMin(repLocal('2026-08-10T04:00:00Z','Europe/Istanbul'),'21:42'), 882);
eq('gece yarisini gecen UGS 20:00→02:30 = 6:30', spanMin(repLocal('2026-08-10T17:00:00Z','Europe/Istanbul'),'02:30'), 390);
eq('KIS saati (EST −5): 12:00Z → 07:00 yerel', repLocal('2026-01-10T12:00:00Z','America/New_York'), '07:00');
eq('UTC meydanda kayma yok', repLocal('2026-08-10T06:15:00Z','UTC'), '06:15');
// Yerellestirmeden hesaplamak YANLIS olurdu — tuzagin kendisi de test edilir
eq('ham UTC ile hesap 3 saat SAPAR (yapilmamali)',
   spanMin('04:00','21:42') - spanMin(repLocal('2026-08-10T04:00:00Z','Europe/Istanbul'),'21:42'), 180);

// ── BOS GUNLER (Md.5 · tanim Md.4(u)(ff)) — TR dilimi (+03) ──
const TZ = 'Europe/Istanbul';
const dutyAt = (date, repZ, endZ, type='flight') =>
  ({duty_type:type,status:'actual',duty_date:date,report_time:`${date}T${repZ}:00Z`,duty_end:`${date}T${endZ}:00Z`,sectors:[]});
const offAt = (date, sub='OFF') => ({duty_type:'off',status:'actual',duty_date:date,off_subtype:sub});

// D=10 Agu. Gece pencereleri: 09/22:00-10/08:00 ve 10/22:00-11/08:00 (yerel)
eq('bos gun: komsu gorev yok → gecerli',
   isSingleDayOff('2026-08-10', [offAt('2026-08-10')], rules, TZ), true);
eq('bos gun: onceki gorev 21:00 yerelde biter → gecerli',
   isSingleDayOff('2026-08-10', [offAt('2026-08-10'), dutyAt('2026-08-09','08:00','18:00')], rules, TZ), true);
eq('bos gun: onceki gorev 23:00 yerelde biter → GECERSIZ (1. gece delinir)',
   isSingleDayOff('2026-08-10', [offAt('2026-08-10'), dutyAt('2026-08-09','08:00','20:00')], rules, TZ), false);
eq('bos gun: ertesi gorev 07:00 yerelde baslar → GECERSIZ (2. gece delinir)',
   isSingleDayOff('2026-08-10', [offAt('2026-08-10'), dutyAt('2026-08-11','04:00','12:00')], rules, TZ), false);
eq('bos gun: ertesi gorev 09:00 yerelde baslar → gecerli',
   isSingleDayOff('2026-08-10', [offAt('2026-08-10'), dutyAt('2026-08-11','06:00','12:00')], rules, TZ), true);

// Aylik ozet: 7 gun gerekli; 2+2+1+1+1 gruplama; ay yarilarina denge
const monthDuties = ['2026-08-02','2026-08-03','2026-08-09','2026-08-10','2026-08-16','2026-08-22','2026-08-28'].map(d=>offAt(d));
const sum = daysOffSummary(monthDuties, rules, { year:2026, month:8, tz:TZ });
eq('aylik bos gun sayisi 7', sum.count, 7);
eq('aylik gereklilik 7', sum.required, 7);
eq('aylik yeterli', sum.ok, true);
eq('iki adet 2-gunluk blok var', sum.blocksOf2, 2);
eq('gruplama uygun (2+2+1+1+1)', sum.groupingOk, true);
eq('ay yarilarina dengeli', sum.balancedOk, true);
const sum2 = daysOffSummary(monthDuties.slice(0,5), rules, { year:2026, month:8, tz:TZ });
eq('5 gun → yetersiz', sum2.ok, false);
// Gecerli olmayan bos gun sayilmaz
const brokenOff = [offAt('2026-08-10'), dutyAt('2026-08-09','08:00','20:00')];
eq('gecesi delinen OFF sayilmaz', daysOffSummary(brokenOff, rules, {year:2026,month:8,tz:TZ}).count, 0);
eq('gecersiz listesinde gorunur', daysOffSummary(brokenOff, rules, {year:2026,month:8,tz:TZ}).invalid.length, 1);
// OFF alt tipi bos gun saymiyorsa haric tutulur
const offTypes = [{code:'MEDC', counts_as_recurrent_rest:false},{code:'OFF', counts_as_recurrent_rest:true}];
eq('MEDC bos gun sayilmaz', daysOffSummary([offAt('2026-08-10','MEDC')], rules, {year:2026,month:8,tz:TZ,offTypes}).count, 0);
eq('OFF bos gun sayilir', daysOffSummary([offAt('2026-08-10','OFF')], rules, {year:2026,month:8,tz:TZ,offTypes}).count, 1);
// Yillik
eq('yillik gereklilik 96', daysOffSummary(monthDuties, rules, {year:2026,tz:TZ}).required, 96);

// ESKI EASA SEMASI ARTIK TANINMIYOR: sayi uydurmak yerine null (Ilke 1)
const legacyRules = { max_fdp_table: { bands:[{from:'06:00',to:'13:29',fdp:'13:00'}], fdp_floor:'09:00', max_sectors:10, sector_penalty_min:30, penalty_from_sector:3 } };
eq('legacy sema -> null (uydurma yok)', maxFdpMinutes('07:00', 2, legacyRules), null);

console.log(`\nSONUC: ${pass} gecti, ${fail} kaldi`);
process.exit(fail?1:0);
