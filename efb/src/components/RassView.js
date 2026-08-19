// RassView.js — GO2 eFB
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

const C = { bg2:'#1e293b', bg3:'#0f172a', border:'#334155', accent:'#38bdf8', t3:'#475569' };
const parseIcao = (raw) => raw ? raw.split('/')[0].trim().toUpperCase() : null;
const RISK_META = {
  LOW:     { color:'#38bdf8', bg:'rgba(56,189,248,0.10)',  border:'#38bdf8' },
  MEDIUM:  { color:'#fbbf24', bg:'rgba(251,191,36,0.10)',  border:'#fbbf24' },
  HIGH:    { color:'#f97316', bg:'rgba(249,115,22,0.10)',  border:'#f97316' },
  EXTREME: { color:'#ef4444', bg:'rgba(239,68,68,0.12)',   border:'#ef4444' },
};
const getRiskMeta = (l) => RISK_META[l] || RISK_META.LOW;
const opsColor = (t) => !t ? C.t3 : t.includes('OPS MANAGER') ? '#ef4444' : t.includes('CAPTAIN') ? '#f97316' : '#4ade80';

function PpsSection({ title, text, color }) {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:9, color:color||'#38bdf8', fontWeight:700, letterSpacing:1.2, marginBottom:8,
        fontFamily:"'Courier New',monospace", borderBottom:`1px solid ${color||'#38bdf8'}30`, paddingBottom:4 }}>
        {title}
      </div>
      {lines.map((line,i) => {
        const ci = line.indexOf(':');
        const hasKey = ci > 0 && ci < 22;
        return (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ color:color||'#38bdf8', fontSize:10, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:11, color:'#94a3b8', fontFamily:"'Courier New',monospace", lineHeight:1.6 }}>
              {hasKey && <span style={{ color:'#f1f5f9', fontWeight:700 }}>{line.slice(0,ci)}: </span>}
              {hasKey ? line.slice(ci+1).trim() : line}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ┌ FOP-FRM-02 · ROUTE AND AERODROME QUALIFICATION TRAINING FORM ───────────┐
// │ Rev 0 · 2023-10-31. iOS RaaqView.swift ile BIREBIR — ikisi ayrisamaz.    │
// │                                                                          │
// │ 19 Agu 2026 (Serkan): "Survey yapilmis veya yapilmamis olsun, butun risk │
// │ assessmentlarin icinde 5 maddeyle beraber ustunde ki hucrede yazanlar da │
// │ yer alacak." -> Eskiden maddeler YALNIZ survey yokken gosteriliyordu;    │
// │ artik ikisi birden, kagit formdaki sirayla:                              │
// │      BLOK 1 -> BLOK 2 -> SPECIAL REMARKS -> imza                         │
// │ ("bizim girdigimiz REMARKS lar en altta olmali")                         │
// │                                                                          │
// │ 🔑 METINLER FORMDAN BIREBIR. Onceki surumde iki sapma vardi:             │
// │      (1) "approach patterns" -> yanlislikla "APPROACH PROCEDURES"        │
// │      (5) "considered to pose certain problems" ibaresi DUSMUSTU          │
// └──────────────────────────────────────────────────────────────────────────┘

// BLOK 1 — kutusuz beyan listesi (kagit formda da kutu yoktur), kategoriden
// BAGIMSIZ: her meydanda ayni yedi kalem.
const RAAQ_BRIEF_ITEMS = [
  'TERRAIN AND SAFE ALTITUDES',
  'COMMUNICATION AND ATC FACILITIES',
  'SEARCH & RESCUE PROCEDURES',
  'AIRPORT LAYOUT',
  'APPROACH AIDS',
  'INSTRUMENT APPROACH AND HOLD PROCEDURES',
  'OPERATING MINIMA',
];

// BLOK 2 — kutulu ozel maddeler. BESI DE her zaman basilir; tiklenenler
// kategoriye gore: CAT A/B -> 1-4, CAT C -> 1-5.
const RAAQ_ITEMS = [
  'NON-STANDARD APPROACH AIDS OR APPROACH PATTERNS',
  'UNUSUAL LOCAL WEATHER CONDITIONS',
  'UNUSUAL CHARACTERISTICS OR PERFORMANCE LIMITATIONS',
  'OTHER RELEVANT CONSIDERATIONS INCLUDING OBSTRUCTIONS, PHYSICAL LAYOUT, LIGHTING ETC.',
  'CATEGORY C AERODROMES: ADDITIONAL CONSIDERATIONS CONSIDERED TO POSE CERTAIN PROBLEMS FOR THE APPROACH, LANDING OR TAKE-OFF. SPECIAL TRAINING COMPLETED BY AIRCREW.',
];

export const catOf = (c) => (c || '').trim().toUpperCase();

const S_LBL = { fontSize:9.5, color:'#94a3b8', fontFamily:"'Courier New',monospace", letterSpacing:.5, marginBottom:7, lineHeight:1.5 };
const S_BOX = { border:'1px solid #334155', borderRadius:6, padding:11 };

function BriefBlock() {
  return (
    <div style={{ marginBottom:14 }}>
      <div style={S_LBL}>FOLLOWING ITEMS WERE BRIEFED AND FAMILIARIZED FOR THE ROUTE FLOWN:</div>
      <div style={S_BOX}>
        {RAAQ_BRIEF_ITEMS.map(t => (
          <div key={t} style={{ fontSize:10.5, color:'#f1f5f9', fontFamily:"'Courier New',monospace", lineHeight:1.9 }}>{t}</div>
        ))}
      </div>
    </div>
  );
}

// Kategori bilinmiyorsa HICBIRI tiklenmez — bilmedigimizi onaylanmis gibi
// gostermeyiz (Ilke 1). Uyari bandi kartin en ustunde ayrica duruyor.
function RaaqBlock({ cat, checked }) {
  const c = catOf(cat);
  const bilinen = !!c;
  const tikliSayisi = bilinen ? (c === 'C' ? 5 : 4) : 0;
  const etkin = bilinen && checked;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={S_LBL}>SPECIAL ITEMS BRIEFED DUE TO AERODROME CATEGORY:</div>
      <div style={S_BOX}>
        {RAAQ_ITEMS.map((t, i) => {
          const on = etkin && i < tikliSayisi;
          return (
            <div key={i} style={{ display:'flex', gap:9, alignItems:'flex-start', marginBottom:i === RAAQ_ITEMS.length - 1 ? 0 : 7 }}>
              <div style={{ width:14, height:14, borderRadius:3, flexShrink:0, marginTop:2,
                            border:`2px solid ${on ? '#4ade80' : '#334155'}`, background:on ? '#4ade80' : 'transparent',
                            display:'flex', alignItems:'center', justifyContent:'center' }}>
                {on && <span style={{ color:'#0f172a', fontSize:9, lineHeight:1, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:10.5, color:on ? '#f1f5f9' : '#94a3b8', fontFamily:"'Courier New',monospace", lineHeight:1.5 }}>
                ({i + 1}) {t}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize:8.5, marginTop:8, fontFamily:"'Courier New',monospace", lineHeight:1.5,
                    color: !bilinen ? '#fbbf24' : (etkin ? '#4ade80' : '#334155') }}>
        {!bilinen
          ? 'CATEGORY UNKNOWN — NO ITEM CAN BE CHECKED (CAT A/B: 1-4 · CAT C: 1-5)'
          : etkin
            ? `ITEMS AUTO-CHECKED ON REVIEW — AERODROME CAT ${c}${c === 'C' ? '' : ' · ITEM (5) APPLIES TO CAT C ONLY'}`
            : `ITEMS WILL BE AUTO-CHECKED WHEN REVIEW IS CONFIRMED BELOW — AERODROME CAT ${c}`}
      </div>
    </div>
  );
}

// PPS brifingi (SECTION 1/2/3) buraya girer — kagit formdaki gibi EN ALTTA.
// Brifing yoksa kutu BOS BIRAKILMAZ (Ilke 1).
function RemarksBlock({ data }) {
  const hasPps = data && (data.section1 || data.section2 || data.section3);
  return (
    <div>
      <div style={S_LBL}>SPECIAL REMARKS:</div>
      <div style={S_BOX}>
        {hasPps ? <>
          <div style={{ fontSize:9, color:'#475569', fontFamily:"'Courier New',monospace", letterSpacing:1, marginBottom:10 }}>
            PPS BRIEFING {data.ra_assessed_by ? `— ${data.ra_assessed_by}` : ''} {data.ra_assessment_date ? `· ${data.ra_assessment_date}` : ''}
          </div>
          <PpsSection title="SECTION 1 — TRAFFIC / ATC / TAXI / RWY OPS" text={data.section1} color="#38bdf8" />
          <PpsSection title="SECTION 2 — METEOROLOGY / WIND"              text={data.section2} color="#fbbf24" />
          <PpsSection title="SECTION 3 — SECURITY / HANDLING / NAV"       text={data.section3} color="#4ade80" />
        </> : (
          <div style={{ fontSize:10, color:'#64748b', fontFamily:"'Courier New',monospace" }}>NO PPS BRIEFING ON FILE</div>
        )}
      </div>
    </div>
  );
}

// Kartin EN USTUNDEKI bant (Serkan, 19 Agu): "RAAQ modulde gorunur bir sekilde
// bu meydanin kategorisi saptanmamis demesi lazim bize." Uyari eskiden
// maddelerin altinda kaliyordu.
function CategoryBanner({ icao }) {
  return (
    <div style={{ background:'rgba(251,191,36,0.15)', borderBottom:'2px solid #fbbf24', color:'#fbbf24',
                  padding:'11px 14px', fontFamily:"'Courier New',monospace", lineHeight:1.6 }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:.6 }}>
        ⚠ {icao || '----'} — AERODROME CATEGORY NOT SET · CONTACT DISPATCH
      </div>
      <div style={{ fontSize:9, color:'#fcd34d' }}>
        RAAQ CANNOT BE COMPLETED — ITEMS WILL NOT BE CHECKED AND THIS MODULE CANNOT TURN GREEN
      </div>
    </div>
  );
}

function AirportCard({ role, icao, data, checked, onCheck }) {
  const rm = data ? getRiskMeta(data.risk_level) : { color:C.t3, bg:'transparent', border:C.border };
  // Kategori bilinmeden form doldurulamaz -> onay verilemez, kutu tiklenmez.
  const cat = catOf(data?.category);
  const categoryKnown = !!cat;
  const etkin = categoryKnown && checked;
  return (
    <div style={{ flex:1, minWidth:0, background:C.bg2,
                  border:`1px solid ${etkin ? '#4ade80' : (categoryKnown ? rm.border : '#fbbf24')}`,
                  borderRadius:12, overflow:'hidden', transition:'border-color 0.2s' }}>
      {!categoryKnown && <CategoryBanner icao={icao} />}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', background:rm.bg, borderBottom:`1px solid ${rm.border}` }}>
        <div>
          <div style={{ fontSize:9, color:C.t3, fontFamily:"'Courier New',monospace", letterSpacing:1.5, marginBottom:2 }}>{role}</div>
          <div style={{ fontSize:22, fontWeight:700, color:'#f1f5f9', fontFamily:"'Courier New',monospace", letterSpacing:2 }}>{icao||'----'}</div>
          {data?.name && <div style={{ fontSize:10, color:'#94a3b8', fontFamily:"'Courier New',monospace", marginTop:2 }}>{data.name}</div>}
        </div>
        <div style={{ textAlign:'right' }}>
          {data ? <>
            <div style={{ fontSize:13, fontWeight:800, color:rm.color, fontFamily:"'Courier New',monospace", letterSpacing:1.5,
              background:rm.bg, border:`1px solid ${rm.border}`, padding:'4px 12px', borderRadius:6 }}>
              {data.risk_level||'—'}
            </div>
            <div style={{ fontSize:10, color:C.t3, marginTop:4, fontFamily:"'Courier New',monospace" }}>
              SCORE: <span style={{ color:rm.color, fontWeight:700 }}>{data.base_score??'—'}</span>
            </div>
          </> : <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace" }}>NO DATA</span>}
        </div>
      </div>

      {data ? <>
        {[['CATEGORY', categoryKnown ? `CAT ${cat}` : 'NOT SET', categoryKnown ? null : '#fbbf24'],
          ['ELEVATION', data.ad_elev_ft?`${data.ad_elev_ft} FT`:'—', null],
          ['MAX S', data.max_s??'—', null],
          ['MAX L', data.max_l??'—', null]].map(([l,v,col])=>(
          <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 14px', borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace" }}>{l}</span>
            <span style={{ fontSize:11, color:col||'#f1f5f9', fontFamily:"'Courier New',monospace", fontWeight:700 }}>{v}</span>
          </div>
        ))}
        {data.ops_approval && (
          <div style={{ padding:'8px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace" }}>OPS APPROVAL</span>
            <span style={{ fontSize:10, fontWeight:700, color:opsColor(data.ops_approval), fontFamily:"'Courier New',monospace", textAlign:'right', maxWidth:180 }}>{data.ops_approval}</span>
          </div>
        )}
        {/* KAGIT FORMDAKI SIRA: BLOK 1 -> BLOK 2 -> SPECIAL REMARKS */}
        <div style={{ padding:'12px 14px' }}>
          <BriefBlock />
          <RaaqBlock cat={data.category} checked={checked} />
          <RemarksBlock data={data} />
        </div>
      </> : (
        // Veritabaninda kayit yok — form yine de MATBU gelir, ekip
        // degerlendirmesiz kalmaz (8 Agu). Kategori de bilinmedigi icin
        // bant zaten ustte ve onay kilitli.
        <div style={{ padding:'12px 14px' }}>
          <div style={{ fontSize:11, color:C.t3, fontFamily:"'Courier New',monospace", marginBottom:10 }}>
            NOT FOUND IN DATABASE — CONTACT DISPATCH
          </div>
          <BriefBlock />
          <RaaqBlock cat={null} checked={checked} />
          <RemarksBlock data={null} />
        </div>
      )}

      {/* Kategori bilinmiyorsa onay KILITLI (Serkan: "meydan kategorisi
          belirlensin ilk once, RAAQ Modul YESIL olamaz"). */}
      <div onClick={() => { if (categoryKnown && onCheck) onCheck(!checked); }}
        data-testid="raaq-review" data-locked={categoryKnown ? 'no' : 'yes'}
        style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 14px',
                 background:etkin?'rgba(74,222,128,0.08)':'rgba(255,255,255,0.02)',
                 borderTop:`1px solid ${etkin?'#4ade80':C.border}`,
                 cursor:categoryKnown?'pointer':'not-allowed', transition:'background 0.15s', minHeight:48 }}>
        <div style={{ width:22, height:22, borderRadius:6, flexShrink:0,
                      border:`2px solid ${etkin?'#4ade80':(categoryKnown?'#334155':'#64748b')}`,
                      background:etkin?'#4ade80':'transparent',
                      display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
          {etkin && <span style={{ color:'#0f172a', fontSize:13, lineHeight:1, fontWeight:700 }}>✓</span>}
          {!categoryKnown && <span style={{ color:'#64748b', fontSize:12, lineHeight:1, fontWeight:700 }}>✕</span>}
        </div>
        <span style={{ fontSize:11, color:!categoryKnown?C.t3:(checked?'#4ade80':C.t3),
                       fontFamily:"'Courier New',monospace", fontWeight:etkin?700:400 }}>
          {!categoryKnown ? 'REVIEW LOCKED — AERODROME CATEGORY REQUIRED FIRST'
            : (checked ? 'Risk assessment reviewed ✓' : 'I have reviewed this risk assessment')}
        </span>
      </div>
    </div>
  );
}

function MissionRisk({ airports }) {
  const levels = ['LOW','MEDIUM','HIGH','EXTREME'];
  const present = airports.filter(Boolean).map(a=>a.risk_level).filter(Boolean);
  if (!present.length) return null;
  const highest = levels.reduce((max,l)=>present.includes(l)?l:max,'LOW');
  const rm = getRiskMeta(highest);
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:rm.bg, border:`1px solid ${rm.border}`, borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace", letterSpacing:1.5 }}>MISSION RISK INDEX</span>
        <span style={{ fontSize:13, fontWeight:800, color:rm.color, fontFamily:"'Courier New',monospace", letterSpacing:1.5, background:rm.bg, border:`1px solid ${rm.border}`, padding:'3px 12px', borderRadius:6 }}>
          {highest}
        </span>
      </div>
      <div style={{ display:'flex', gap:4 }}>
        {levels.map(l=>(
          <div key={l} style={{ width:28, height:8, borderRadius:4, background:levels.indexOf(l)<=levels.indexOf(highest)?getRiskMeta(l).color:'rgba(255,255,255,0.06)' }}/>
        ))}
      </div>
    </div>
  );
}

export default function RassView({ setStatus }) {
  const [plan,    setPlan]    = useState(null);
  const [risks,   setRisks]   = useState({ dep:null, dest:null, altn:null });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [checked, setChecked] = useState({ dep:false, dest:false, altn:false });

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data:plans, error:planErr } = await supabase.from('plans').select('id,dep,dest,alternate,dispatch_no,reg,date').eq('status','active').limit(1);
      if (planErr) { setError(planErr.message); setLoading(false); return; }
      if (!plans?.length) { setError('NO ACTIVE PLAN'); setLoading(false); return; }
      const p = plans[0]; setPlan(p);
      const depIcao=parseIcao(p.dep), destIcao=parseIcao(p.dest), altnIcao=parseIcao(p.alternate);
      const icaos=[...new Set([depIcao,destIcao,altnIcao].filter(Boolean))];
      const { data:riskData } = await supabase.from('airport_risks')
        .select('icao,name,category,base_score,risk_level,ops_approval,ad_elev_ft,max_s,max_l,section1,section2,section3,ra_assessed_by,ra_assessment_date')
        .in('icao', icaos);
      const byIcao={};
      (riskData||[]).forEach(r=>{ byIcao[r.icao]=r; });
      setRisks({ dep:byIcao[depIcao]||null, dest:byIcao[destIcao]||null, altn:byIcao[altnIcao]||null });
      setLoading(false);
    })();
  }, []);

  // ── MEYDAN KATEGORISI KAPISI (Serkan, 19 Agu 2026) ───────────────────
  // "Meydan kategorisi belirlensin ilk once, RAAQ Modul YESIL olamaz."
  // Kategori FOP-FRM-02'nin hangi maddelerinin gecerli oldugunu belirler;
  // bilinmeden form doldurulamaz. iOS RaaqView ile birebir ayni kural.
  // 🔴 Sonucu agir, bilerek: RAAQ yesile donmezse Accept & Sign de gecmez.
  const missingCategory = useMemo(() => {
    const altnIcao = parseIcao(plan?.alternate);
    const roller = altnIcao ? ['dep','dest','altn'] : ['dep','dest'];
    const icaolar = { dep:parseIcao(plan?.dep), dest:parseIcao(plan?.dest), altn:altnIcao };
    return roller.filter(k => icaolar[k] && !catOf(risks[k]?.category)).map(k => icaolar[k]);
  }, [plan, risks]);

  useEffect(() => {
    if (!setStatus || loading) return;
    const altnIcao = parseIcao(plan?.alternate);
    const required = altnIcao ? ['dep','dest','altn'] : ['dep','dest'];
    const allChecked = required.every(k => checked[k]) && missingCategory.length === 0;
    const anyChecked = required.some(k => checked[k]);
    if (allChecked)      setStatus('green');
    else if (anyChecked) setStatus('amber');
    else                 setStatus('pending');
  }, [checked, loading, plan, setStatus, missingCategory]);

  if (loading) return (
    <div style={{ padding:40, textAlign:'center', color:C.t3, fontFamily:"'Courier New',monospace", fontSize:11, letterSpacing:2, background:'#0f172a', minHeight:'100%' }}>
      LOADING RAAQ DATA...
    </div>
  );
  if (error) return (
    <div style={{ padding:40, textAlign:'center', color:'#ef4444', fontFamily:"'Courier New',monospace", fontSize:11, letterSpacing:2, background:'#0f172a', minHeight:'100%' }}>
      {error}
    </div>
  );

  const depIcao=parseIcao(plan?.dep), destIcao=parseIcao(plan?.dest), altnIcao=parseIcao(plan?.alternate);
  const required = altnIcao ? ['dep','dest','altn'] : ['dep','dest'];
  const allChecked = required.every(k => checked[k]) && missingCategory.length === 0;

  return (
    <div style={{ padding:'16px 12px 24px', background:'#0f172a', minHeight:'100%' }}>

      {/* Flight header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, padding:'12px 14px', background:'#1e293b', border:`1px solid #334155`, borderRadius:12 }}>
        <div>
          <span style={{ fontSize:16, fontWeight:700, color:'#38bdf8', fontFamily:"'Courier New',monospace", letterSpacing:1.5 }}>{depIcao} → {destIcao}</span>
          {altnIcao && <span style={{ fontSize:11, color:C.t3, marginLeft:12, fontFamily:"'Courier New',monospace" }}>ALTN: {altnIcao}</span>}
        </div>
        <div style={{ fontSize:10, color:C.t3, textAlign:'right', lineHeight:1.8, fontFamily:"'Courier New',monospace" }}>
          <div>{plan?.reg||'—'} · {plan?.date||'—'}</div>
          <div>{plan?.dispatch_no||'—'}</div>
        </div>
      </div>

      <MissionRisk airports={[risks.dep,risks.dest,risks.altn]}/>

      <div style={{ display:'flex', gap:10, marginBottom:10, alignItems:'flex-start' }}>
        <AirportCard role="DEP — DEPARTURE"    icao={depIcao}  data={risks.dep}  checked={checked.dep}  onCheck={v=>setChecked(p=>({...p,dep:v}))}  />
        <AirportCard role="DEST — DESTINATION" icao={destIcao} data={risks.dest} checked={checked.dest} onCheck={v=>setChecked(p=>({...p,dest:v}))} />
      </div>

      {altnIcao && (
        <div style={{ marginBottom:10 }}>
          <AirportCard role="ALTN — ALTERNATE" icao={altnIcao} data={risks.altn} checked={checked.altn} onCheck={v=>setChecked(p=>({...p,altn:v}))} />
        </div>
      )}

      {/* Eksik kategori BURADA da soylenir: kullanici kartlara inmeden
          modulun neden yesile donmedigini gormeli (Ilke 1). */}
      {missingCategory.length > 0 && (
        <div style={{ marginTop:6, padding:'10px 14px', borderRadius:10, background:'rgba(251,191,36,0.07)',
                      border:'1px solid rgba(251,191,36,0.5)', color:'#fbbf24',
                      fontFamily:"'Courier New',monospace", fontSize:10, fontWeight:700, lineHeight:1.6 }}>
          ⚠ CATEGORY NOT SET: {missingCategory.join(', ')} — RAAQ CANNOT BE COMPLETED
        </div>
      )}
      <div style={{ marginTop:6, padding:'10px 14px', borderRadius:10, background:allChecked?'rgba(74,222,128,0.06)':'rgba(56,189,248,0.04)', border:`1px solid ${allChecked?'#4ade80':'rgba(56,189,248,0.12)'}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:9, color:'#334155', fontFamily:"'Courier New',monospace", letterSpacing:1.5 }}>
          READ-ONLY · MANAGED BY DISPATCH · REF: ICAO DOC 9859 / AMC 20-25
        </span>
        {allChecked && <span style={{ fontSize:10, color:'#4ade80', fontFamily:"'Courier New',monospace", fontWeight:700 }}>✓ ALL REVIEWED</span>}
      </div>
    </div>
  );
}