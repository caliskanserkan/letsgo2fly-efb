// RassView.js — GO2 eFB
// Pilot tarafı read-only. PPS Briefing: survey'den gelen section1/2/3.

import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const C = { bg2:'#0d1117', bg3:'#111620', border:'#1e2530', accent:'#e8a020', t3:'#546e7a' };
const parseIcao = (raw) => raw ? raw.split('/')[0].trim().toUpperCase() : null;
const RISK_META = {
  LOW:     { color:'#1a9bc4', bg:'rgba(26,155,196,0.10)',  border:'#1a9bc4' },
  MEDIUM:  { color:'#e8a320', bg:'rgba(232,163,32,0.10)',  border:'#e8a320' },
  HIGH:    { color:'#e8731a', bg:'rgba(232,115,26,0.10)',  border:'#e8731a' },
  EXTREME: { color:'#e02020', bg:'rgba(224,32,32,0.12)',   border:'#e02020' },
};
const getRiskMeta = (l) => RISK_META[l] || RISK_META.LOW;
const opsColor = (t) => !t ? C.t3 : t.includes('OPS MANAGER') ? '#e02020' : t.includes('CAPTAIN') ? '#e8731a' : '#2d9e5f';

function PpsSection({ title, text, color }) {
  if (!text) return null;
  const lines = text.split('\n').filter(l => l.trim());
  if (!lines.length) return null;
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:9, color:color||'#1a9bc4', fontWeight:700, letterSpacing:1.2, marginBottom:8,
        fontFamily:"'Courier New',monospace", borderBottom:`1px solid ${color||'#1a9bc4'}30`, paddingBottom:4 }}>
        {title}
      </div>
      {lines.map((line,i) => {
        const ci = line.indexOf(':');
        const hasKey = ci > 0 && ci < 22;
        return (
          <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ color:color||'#1a9bc4', fontSize:10, flexShrink:0, marginTop:1 }}>▸</span>
            <span style={{ fontSize:11, color:'#b0bec5', fontFamily:"'Courier New',monospace", lineHeight:1.6 }}>
              {hasKey && <span style={{ color:'#eceff1', fontWeight:700 }}>{line.slice(0,ci)}: </span>}
              {hasKey ? line.slice(ci+1).trim() : line}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AirportCard({ role, icao, data }) {
  const rm = data ? getRiskMeta(data.risk_level) : { color:C.t3, bg:'transparent', border:C.border };
  const hasPps = data && (data.section1 || data.section2 || data.section3);
  return (
    <div style={{ flex:1, minWidth:0, background:C.bg2, border:`1px solid ${rm.border}`, borderRadius:6, overflow:'hidden' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:rm.bg, borderBottom:`1px solid ${rm.border}` }}>
        <div>
          <div style={{ fontSize:9, color:C.t3, fontFamily:"'Courier New',monospace", letterSpacing:1.5, marginBottom:2 }}>{role}</div>
          <div style={{ fontSize:22, fontWeight:700, color:'#eceff1', fontFamily:"'Courier New',monospace", letterSpacing:2 }}>{icao||'----'}</div>
          {data?.name && <div style={{ fontSize:10, color:'#90a4ae', fontFamily:"'Courier New',monospace", marginTop:2 }}>{data.name}</div>}
        </div>
        <div style={{ textAlign:'right' }}>
          {data ? <>
            <div style={{ fontSize:13, fontWeight:800, color:rm.color, fontFamily:"'Courier New',monospace", letterSpacing:1.5,
              background:rm.bg, border:`1px solid ${rm.border}`, padding:'4px 12px', borderRadius:3 }}>
              {data.risk_level||'—'}
            </div>
            <div style={{ fontSize:10, color:C.t3, marginTop:4, fontFamily:"'Courier New',monospace" }}>
              SCORE: <span style={{ color:rm.color, fontWeight:700 }}>{data.base_score??'—'}</span>
            </div>
          </> : <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace" }}>NO DATA</span>}
        </div>
      </div>
      {data ? <>
        {[['CATEGORY', data.category?`CAT ${data.category}`:'—'],['ELEVATION',data.ad_elev_ft?`${data.ad_elev_ft} FT`:'—'],['MAX S',data.max_s??'—'],['MAX L',data.max_l??'—']].map(([l,v])=>(
          <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 14px', borderBottom:`1px solid ${C.border}` }}>
            <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace" }}>{l}</span>
            <span style={{ fontSize:11, color:'#cfd8dc', fontFamily:"'Courier New',monospace", fontWeight:700 }}>{v}</span>
          </div>
        ))}
        {data.ops_approval && (
          <div style={{ padding:'7px 14px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace" }}>OPS APPROVAL</span>
            <span style={{ fontSize:10, fontWeight:700, color:opsColor(data.ops_approval), fontFamily:"'Courier New',monospace", textAlign:'right', maxWidth:180 }}>{data.ops_approval}</span>
          </div>
        )}
        <div style={{ padding:'10px 14px' }}>
          {hasPps ? <>
            <div style={{ fontSize:9, color:'#37474f', fontFamily:"'Courier New',monospace", letterSpacing:1, marginBottom:10 }}>
              PPS BRIEFING {data.ra_assessed_by ? `— ${data.ra_assessed_by}` : ''} {data.ra_assessment_date ? `· ${data.ra_assessment_date}` : ''}
            </div>
            <PpsSection title="SECTION 1 — TRAFFIC / ATC / TAXI / RWY OPS" text={data.section1} color="#1a9bc4" />
            <PpsSection title="SECTION 2 — METEOROLOGY / WIND"              text={data.section2} color="#e8a320" />
            <PpsSection title="SECTION 3 — SECURITY / HANDLING / NAV"       text={data.section3} color="#2d9e5f" />
          </> : (
            <div style={{ fontSize:10, color:'#37474f', fontFamily:"'Courier New',monospace", fontStyle:'italic' }}>
              No PPS briefing on file — admin risk survey not yet completed.
            </div>
          )}
        </div>
      </> : (
        <div style={{ padding:'16px 14px', fontSize:11, color:C.t3, fontFamily:"'Courier New',monospace" }}>
          NOT FOUND IN DATABASE — CONTACT DISPATCH
        </div>
      )}
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
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:rm.bg, border:`1px solid ${rm.border}`, borderRadius:6, padding:'10px 18px', marginBottom:14 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:10, color:C.t3, fontFamily:"'Courier New',monospace", letterSpacing:1.5 }}>MISSION RISK INDEX</span>
        <span style={{ fontSize:13, fontWeight:800, color:rm.color, fontFamily:"'Courier New',monospace", letterSpacing:1.5, background:rm.bg, border:`1px solid ${rm.border}`, padding:'3px 12px', borderRadius:3 }}>
          {highest}
        </span>
      </div>
      <div style={{ display:'flex', gap:4 }}>
        {levels.map(l=>(
          <div key={l} style={{ width:28, height:8, borderRadius:2, background:levels.indexOf(l)<=levels.indexOf(highest)?getRiskMeta(l).color:'rgba(255,255,255,0.06)' }}/>
        ))}
      </div>
    </div>
  );
}

export default function RassView() {
  const [plan,    setPlan]    = useState(null);
  const [risks,   setRisks]   = useState({ dep:null, dest:null, altn:null });
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

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

  if (loading) return <div style={{ padding:40, textAlign:'center', color:C.t3, fontFamily:"'Courier New',monospace", fontSize:11, letterSpacing:2 }}>LOADING RASS DATA...</div>;
  if (error)   return <div style={{ padding:40, textAlign:'center', color:'#e02020', fontFamily:"'Courier New',monospace", fontSize:11, letterSpacing:2 }}>{error}</div>;

  const depIcao=parseIcao(plan?.dep), destIcao=parseIcao(plan?.dest), altnIcao=parseIcao(plan?.alternate);

  return (
    <div style={{ padding:'16px 16px 24px', fontFamily:"'Courier New',monospace" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, padding:'8px 14px', background:C.bg3, border:`1px solid ${C.border}`, borderRadius:5 }}>
        <div>
          <span style={{ fontSize:15, fontWeight:700, color:C.accent, letterSpacing:1.5 }}>{depIcao} → {destIcao}</span>
          {altnIcao && <span style={{ fontSize:11, color:C.t3, marginLeft:12 }}>ALTN: {altnIcao}</span>}
        </div>
        <div style={{ fontSize:10, color:C.t3, textAlign:'right', lineHeight:1.8 }}>
          <div>{plan?.reg||'—'} · {plan?.date||'—'}</div>
          <div>{plan?.dispatch_no||'—'}</div>
        </div>
      </div>
      <MissionRisk airports={[risks.dep,risks.dest,risks.altn]}/>
      <div style={{ display:'flex', gap:10, marginBottom:10, alignItems:'flex-start' }}>
        <AirportCard role="DEP — DEPARTURE"    icao={depIcao}  data={risks.dep}  />
        <AirportCard role="DEST — DESTINATION" icao={destIcao} data={risks.dest} />
      </div>
      {altnIcao && <div style={{ marginBottom:10 }}><AirportCard role="ALTN — ALTERNATE" icao={altnIcao} data={risks.altn}/></div>}
      <div style={{ marginTop:6, padding:'7px 12px', background:'rgba(26,155,196,0.04)', border:'1px solid rgba(26,155,196,0.12)', borderRadius:4, textAlign:'center' }}>
        <span style={{ fontSize:9, color:'#37474f', fontFamily:"'Courier New',monospace", letterSpacing:1.5 }}>
          READ-ONLY · MANAGED BY DISPATCH · REF: ICAO DOC 9859 / AMC 20-25
        </span>
      </div>
    </div>
  );
}