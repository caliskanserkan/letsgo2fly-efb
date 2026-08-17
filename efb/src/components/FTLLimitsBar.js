// FTLLimitsBar.js — FTL sekmesinin ALTINDA SABIT duran limit gostergesi
//
// Serkan (17 Agu 2026): "benim sectigim araliktan bagimsiz surekli altta gorunen
// bir visual gosterge paneli olmasi lazim ... FTL sekmesinde hep en altta olsun,
// her 3 pilot icin de ayri ayri."
//
// ┌ NEDEN AYRI BILESEN ─────────────────────────────────────────────────────┐
// │ Ustteki FROM/TO filtresi bir ARALIK RAPORUDUR; toplamlari secilen        │
// │ araligin toplamidir. Limitler ise KAYAN PENCEREdir (son 7/14/28 gun,     │
// │ son 12 ay) ve takvim yilidir. Ikisini ayni yerde gostermek Ilke 1        │
// │ ihlalidir: 3 gunluk aralik secildiginde "12:00 / 100:00" gorunur ve      │
// │ "bol bol yerim var" der — oysa gercek 28 gunluk pencere 95 saatte        │
// │ olabilir. Bu panel araliga HIC BAKMAZ, hep "su an"a gore hesaplar.       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// TEK KAYNAK: hesap FTLEngine.cumulatives() — atama sihirbazinin (fitness)
// kullandigi fonksiyonun AYNISI. Panel kendi hesabini YAPMAZ; yapsaydi iki
// sayi er ya da gec ayrisirdi (Ilke 3).
//
// LIMITLER KODA GOMULU DEGIL: rules.cumulative_limits'ten okunur. Sirket
// ruleset panelinden limiti sikilastirirsa esikler kendiliginden kayar.
import React, { useMemo, useState } from 'react';
import { cumulatives, effectiveRules, fmtMin, daysOffSummary } from './FTLEngine';

const C = {
  bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)', border2:'var(--border2)',
  accent:'var(--accent)', green:'var(--green)', red:'var(--red)',
  amber:'var(--amber)', violet:'var(--violet)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)',
};

// PLANLANAN PAYIN RENGI SABIT MORDUR (Serkan, 17 Agu).
// Iki adimda buraya gelindi:
//   1) once tarali kisim cubugun KENDI esik rengiyle ciziliyordu -> gerceklesen
//      ile planlanan ayni renk olunca tarama secilemiyordu.
//   2) sari denendi; ama %75 esiginde DOLU kisim da sariya donuyor ve ayni
//      sorun geri geliyordu.
// Mor, yesil/sari/kirmizi paletinin DISINDA: o palet bir SEVIYE anlatir
// (limite ne kadar kaldi), mor ise seviye degil BOYUT anlatir (bu kadari
// henuz ucul-madi). Hangi esikte olursa olsun tarama okunur kalir.
const PLANNED = C.violet;

const PILOT_ROLES = ['pilot', 'admin_pilot'];

// Serkan (17 Agu): "yesil baslar, limit %25 kala turuncu, %5 kala kirmizi."
// ORAN olarak tutulur — ruleset limiti degisince esik kendiliginden kayar.
const AMBER = 0.75;   // limitin %75'i kullanildi = %25 kaldi
const RED   = 0.95;   // limitin %95'i kullanildi = %5 kaldi

// Satirlar: cumulatives() cikti anahtari + ruleset limit anahtari.
// "Son 12 ay" ile "takvim yili" AYNI SEY DEGILDIR ve ikisi de ayri limittir:
// Aralik'ta son 12 ay 980 saatte olabilirken takvim yili 700'de olur; 1 Ocak'ta
// takvim yili sifirlanir, son 12 ay SIFIRLANMAZ. Ikisi de gosterilir.
const ROWS = [
  { grp:'DUTY', key:'duty7d',      label:'LAST 7 D',   lim:'duty_7d_min' },
  { grp:'DUTY', key:'duty14d',     label:'LAST 14 D',  lim:'duty_14d_min' },
  { grp:'DUTY', key:'duty28d',     label:'LAST 28 D',  lim:'duty_28d_min' },
  { grp:'DUTY', key:'dutyCalYear', label:'CAL YEAR',   lim:'duty_cal_year_min', resets:true },
  { grp:'FLT',  key:'flt28d',      label:'LAST 28 D',  lim:'flt_28d_min' },
  { grp:'FLT',  key:'flt12mo',     label:'LAST 12 MO', lim:'flt_12mo_min' },
  { grp:'FLT',  key:'fltCalYear',  label:'CAL YEAR',   lim:'flt_cal_year_min', resets:true },
];

const stamp = (d) =>
  `${String(d.getUTCDate()).padStart(2,'0')} ${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getUTCMonth()]} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;

// ── Tek hucre: cubuk + sayi ─────────────────────────────────────────
// usedAll = gerceklesen + planlanan · usedAct = yalniz gerceklesen.
// Dolu kisim gerceklesen, TARALI kisim planlanan.
function Cell({ usedAll, usedAct, limit, noBaseline }) {
  // Ilke 1: baseline yoksa cubuk CIZILMEZ. Sifirdan baslayan cubuk YESIL
  // gorunur — oysa pilot gercekte 90 saatte olabilir. Yesil gosterip
  // yaniltmak, hic gostermemekten kotudur.
  if (noBaseline) {
    return (
      <td style={S.cell}>
        <span style={{ fontSize:9, letterSpacing:1, color:C.red, fontFamily:'var(--mono)' }}>BASELINE NOT SET</span>
      </td>
    );
  }
  if (limit == null) {
    return (
      <td style={S.cell}>
        <span style={{ fontSize:9, letterSpacing:1, color:C.t3, fontFamily:'var(--mono)' }}>NO LIMIT IN RULESET</span>
      </td>
    );
  }

  const rAll = usedAll / limit;
  const rAct = usedAct / limit;
  // Esik rengi GERCEK amber token'i (--amber). Once C.accent kullaniliyordu ama
  // bu temada accent MAVI (#38bdf8) — "%25 kala turuncu" kurali maviye dusuyordu.
  const color = rAll >= RED ? C.red : rAll >= AMBER ? C.amber : C.green;

  // Kirmizinin KAYNAGI onemli (denetimde karisirsa agir sonuc):
  //   taralidan geliyorsa  -> henuz ihlal DEGIL, duzeltilecek planlama hatasi
  //   doludan geliyorsa    -> OLMUS asim, bildirime konu
  const tag = usedAll > limit
    ? (usedAct > limit ? 'LIMIT EXCEEDED' : 'PLANNED EXCEEDS')
    : null;

  const wAct = Math.min(rAct, 1) * 100;
  const wPln = Math.max(0, Math.min(rAll, 1) - Math.min(rAct, 1)) * 100;

  return (
    <td style={S.cell}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={S.track}>
          <div style={{ width:`${wAct}%`, background:color, height:'100%' }} />
          <div style={{
            width:`${wPln}%`, height:'100%',
            // tarali = planlanan — rengi esikten BAGIMSIZ, hep sari
            backgroundImage:`repeating-linear-gradient(135deg, ${PLANNED} 0 2px, transparent 2px 5px)`,
          }} />
        </div>
        <span style={{ fontSize:11, fontFamily:'var(--mono)', fontVariantNumeric:'tabular-nums', color:C.t1, whiteSpace:'nowrap' }}>
          {fmtMin(usedAll)}<span style={{ color:C.t3 }}>/{fmtMin(limit)}</span>
        </span>
      </div>
      {/* PLANNED EXCEEDS etiketi de MOR — tarali kisma isaret ediyor.
          LIMIT EXCEEDED kirmizi kalir: o olmus bir asimdir. */}
      {tag && (
        <div style={{ marginTop:3, fontSize:8.5, letterSpacing:1, fontWeight:700, fontFamily:'var(--mono)',
                      color: tag === 'LIMIT EXCEEDED' ? C.red : C.violet }}>
          {tag}
        </div>
      )}
    </td>
  );
}

const S = {
  wrap:{ position:'sticky', bottom:0, zIndex:5, background:C.bg2, borderTop:`2px solid ${C.border2}`,
         boxShadow:'0 -6px 18px rgba(0,0,0,.28)' },
  head:{ display:'flex', alignItems:'center', gap:10, padding:'7px 16px', background:C.bg3,
         borderBottom:`1px solid ${C.border}`, fontFamily:'var(--mono)' },
  title:{ fontSize:10, fontWeight:700, letterSpacing:2, color:C.accent, textTransform:'uppercase' },
  meta:{ fontSize:9, letterSpacing:1, color:C.t3 },
  table:{ width:'100%', borderCollapse:'collapse' },
  grp:{ padding:'6px 10px 6px 16px', fontSize:9.5, fontWeight:700, letterSpacing:1.5, color:C.t2,
        fontFamily:'var(--mono)', textAlign:'left', whiteSpace:'nowrap', verticalAlign:'middle' },
  lbl:{ padding:'6px 14px 6px 0', fontSize:9.5, letterSpacing:1, color:C.t3,
        fontFamily:'var(--mono)', textAlign:'left', whiteSpace:'nowrap' },
  cell:{ padding:'5px 14px 5px 0', minWidth:210, verticalAlign:'middle' },
  th:{ padding:'6px 14px 6px 0', fontSize:9.5, fontWeight:700, letterSpacing:1.5, color:C.t1,
       fontFamily:'var(--mono)', textAlign:'left', whiteSpace:'nowrap' },
  track:{ flex:1, minWidth:70, height:7, background:'var(--bg3)', border:`1px solid ${C.border}`,
          display:'flex', overflow:'hidden' },
  note:{ padding:'6px 16px 8px', fontSize:9, letterSpacing:.5, color:C.t3, fontFamily:'var(--mono)' },
  toggle:{ marginLeft:'auto', background:'none', border:`1px solid ${C.border2}`, color:C.t3,
           fontSize:9, letterSpacing:1, fontFamily:'var(--mono)', padding:'3px 10px', cursor:'pointer' },
};

export default function FTLLimitsBar({ pilots, duties, baselines, ruleset, offTypes }) {
  const [open, setOpen] = useState(true);

  const { rules } = useMemo(() => effectiveRules(ruleset), [ruleset]);
  const lim = rules?.cumulative_limits || {};

  // Pencereler "su an"a gore geriye sayar — secilen araliga gore DEGIL.
  // `duties` bagimlisi BILEREK duruyor: gorev eklenip veri yeniden yuklenince
  // damga da tazelensin. eslint bunu "gereksiz" sayiyor cunku new Date()
  // duties'i okumuyor — ama tazeleme kancasi tam olarak bu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const asOf = useMemo(() => new Date(), [duties]);

  const crew = useMemo(
    () => (pilots || []).filter(p => PILOT_ROLES.includes(p.role)),
    [pilots]);

  const cols = useMemo(() => crew.map(p => {
    const mine = (duties || []).filter(d => d.pilot_id === p.id);
    const base = (baselines || {})[p.id] || null;
    // Iki kez kosuyoruz: hepsi (gerceklesen+planlanan) ve yalniz gerceklesen.
    // Farki = planlanan pay -> cubugun tarali kismi.
    const all = cumulatives(base, mine, asOf, rules);
    const act = cumulatives(base, mine.filter(d => d.status === 'actual'), asOf, rules);
    const off = daysOffSummary(mine, rules, { year: asOf.getUTCFullYear(), offTypes });
    return { pilot:p, all, act, off, noBaseline: !base };
  }), [crew, duties, baselines, rules, asOf, offTypes]);

  if (!ruleset || cols.length === 0) return null;

  const year = String(asOf.getUTCFullYear()).slice(2);

  return (
    <div style={S.wrap}>
      <div style={S.head}>
        <span style={S.title}>FTL Limits</span>
        <span style={S.meta}>
          as of {stamp(asOf)} UTC · ACTUAL + PLANNED · independent of selected range
        </span>
        <button style={S.toggle} onClick={() => setOpen(o => !o)}>
          {open ? 'HIDE' : 'SHOW'}
        </button>
      </div>

      {open && <>
        <table style={S.table}>
          <tbody>
            <tr>
              <th style={S.grp} />
              <th style={S.lbl} />
              {cols.map(c => (
                <th key={c.pilot.id} style={S.th}>
                  {(c.pilot.code ? c.pilot.code + ' — ' : '') + (c.pilot.full_name || '').toUpperCase()}
                </th>
              ))}
            </tr>

            {ROWS.map((r, i) => (
              <tr key={r.key}>
                <td style={S.grp}>{ROWS[i - 1]?.grp === r.grp ? '' : r.grp}</td>
                <td style={S.lbl}>
                  {r.label}{r.resets ? ` ${year}` : ''}
                  {r.resets && <span title="resets 1 JAN" style={{ marginLeft:5, color:C.t3 }}>⟲</span>}
                </td>
                {cols.map(c => (
                  <Cell key={c.pilot.id}
                        usedAll={c.all[r.key]} usedAct={c.act[r.key]}
                        limit={lim[r.lim]} noBaseline={c.noBaseline} />
                ))}
              </tr>
            ))}

            {/* OFF: RENKLENDIRILMEZ (Serkan, 17 Agu: "mantikli").
                Ucus saati bir TAVAN (dolmasi kotu), OFF gunu bir TABAN
                (dolmasi iyi). Ayni esik uygulanirsa yilin cogunda kirmizi
                yanar -> YANLIS ALARM, pilot uyarilari ciddiye almayi birakir. */}
            <tr>
              <td style={S.grp}>OFF</td>
              <td style={S.lbl}>CAL YEAR {year}</td>
              {cols.map(c => (
                <td key={c.pilot.id} style={S.cell}>
                  <span style={{ fontSize:11, fontFamily:'var(--mono)', fontVariantNumeric:'tabular-nums', color:C.t1 }}>
                    {c.off.count}
                    <span style={{ color:C.t3 }}>{c.off.required != null ? ` / ${c.off.required}` : ' / —'}</span>
                  </span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <div style={S.note}>
          <span style={{ display:'inline-block', width:14, height:7, background:C.green, verticalAlign:'middle', marginRight:5,
                         border:`1px solid ${C.border}` }} />
          actual
          <span style={{ display:'inline-block', width:14, height:7, marginLeft:14, marginRight:5, verticalAlign:'middle',
                         border:`1px solid ${C.border}`,
                         backgroundImage:`repeating-linear-gradient(135deg, ${PLANNED} 0 2px, transparent 2px 5px)` }} />
          <span style={{ color:C.violet }}>planned</span>
          <span style={{ marginLeft:18 }}>
            Based on ACTUAL + PLANNED duties — changes in planning will move these bars.
          </span>
        </div>
      </>}
    </div>
  );
}
