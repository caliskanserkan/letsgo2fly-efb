import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const TOPICS = [
  'Approach & Traffic Density','Obstacles / Terrain','Seasonal / Meteorology',
  'ATC Phraseology / Language','Complex Taxi Routings','RWY Ops / Late Clearance',
  'Security / Terror Threat','Handling / Fuel / Pax Support','Radio Nav / GNSS Reliability',
  'Other Local Constraints',
];

const ADDONS = [
  {key:'night',label:'Night Ops',pts:1},{key:'xw',label:'Strong XW/Gust',pts:2},
  {key:'wet',label:'RWY Wet/Contam',pts:2},{key:'lv',label:'Low Vis/TS',pts:2},
  {key:'fam',label:'Crew Low FAM',pts:2},
];

const RISK_C = {
  LOW:    {bg:'rgba(56,189,248,0.12)',border:'#38bdf8',text:'#38bdf8'},
  MEDIUM: {bg:'rgba(232,163,32,0.12)',border:'#e8a320',text:'#e8a320'},
  HIGH:   {bg:'rgba(232,115,26,0.12)',border:'#f97316',text:'#f97316'},
  EXTREME:{bg:'rgba(224,32,32,0.12)', border:'#ef4444',text:'#ef4444'},
};

const cellC = (s) => s>=20?{bg:'#3a0808',text:'#f06060'}:s>=12?{bg:'#2a1200',text:'#f97316'}:s>=6?{bg:'#0a1a00',text:'#6db890'}:{bg:'#0a1a2a',text:'#4a9bc4'};
const sColor = (v) => v>=5?'#ef4444':v>=4?'#f97316':v>=3?'#e8a320':v>=2?'#38bdf8':'#4ade80';
const getRisk = (t) => t<=6?'LOW':t<=9?'MEDIUM':t<=12?'HIGH':'EXTREME';

export function RiskAssessment({ icao, onClose }) {
  const [ap, setAp]     = useState(null);
  const [loading, setL] = useState(true);
  const [addons, setAd] = useState({});
  const [tab, setTab]   = useState('matrix');

  useEffect(() => {
    if (!icao) return;
    setL(true);
    supabase.from('airport_risks').select('*').eq('icao', icao.toUpperCase()).single()
      .then(({ data }) => { setAp(data); setL(false); });
  }, [icao]);

  if (!icao) return null;
  if (loading) return <div style={{padding:24,textAlign:'center',color:'#475569',fontFamily:"'Courier New',monospace"}}>LOADING {icao}...</div>;
  if (!ap) return <div style={{padding:16,color:'#ef4444',fontFamily:"'Courier New',monospace"}}>Not found: {icao}</div>;

  const s = ap.s_scores || [];
  const l = ap.l_scores || [];
  const adPts = ADDONS.reduce((sum, a) => sum + (addons[a.key] ? a.pts : 0), 0);
  const total = (ap.base_score || 0) + adPts;
  const rl = getRisk(total);
  const rc = RISK_C[rl] || RISK_C.LOW;
  const maxS = ap.max_s || 1;
  const maxL = ap.max_l || 1;

  const tabS = (t) => ({flex:1,padding:'8px 4px',textAlign:'center',cursor:'pointer',fontFamily:"'Courier New',monospace",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:tab===t?'#38bdf8':'#555',borderBottom:tab===t?'2px solid #38bdf8':'2px solid transparent',background:'transparent',border:'none'});

  return (
    <div style={{fontFamily:"'Courier New',monospace",color:'#e8e8e8',background:'#111'}}>
      <div style={{padding:'14px 18px',background:'#1e293b',borderBottom:'1px solid #1e293b',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:'#e8a020',letterSpacing:2}}>{ap.icao}</div>
          <div style={{fontSize:13,color:'#e8e8e8',marginTop:2}}>{ap.name}</div>
          <div style={{fontSize:10,color:'#475569',marginTop:3}}>CAT {ap.category||'B'}{ap.ad_elev_ft?` · ${ap.ad_elev_ft} ft`:''}</div>
        </div>
        {onClose && <button onClick={onClose} style={{background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:20}}>x</button>}
      </div>
      <div style={{display:'flex',gap:2,margin:'12px 12px 0',background:'#1e293b',padding:2}}>
        <div style={{flex:1,background:rc.bg,border:`2px solid ${rc.border}`,padding:'12px 10px',textAlign:'center'}}>
          <div style={{fontSize:36,fontWeight:800,color:rc.text,lineHeight:1}}>{total}</div>
          <div style={{fontSize:9,color:rc.text,opacity:.7,marginTop:2}}>BASE {ap.base_score||0}{adPts>0?` + ${adPts}`:''}</div>
        </div>
        <div style={{flex:2,background:'#1e293b',border:`2px solid ${rc.border}`,padding:'12px 14px'}}>
          <div style={{fontSize:18,fontWeight:800,color:rc.text}}>{rl}</div>
          <div style={{fontSize:10,color:rc.text,opacity:.8,marginTop:4}}>{total>12?'OPS MANAGER APPROVAL REQUIRED':total>9?'CAPTAIN REVIEW / DISPATCH':'DISPATCH OK'}</div>
        </div>
        <div style={{flex:2,background:'#1e293b',border:'2px solid #1e293b',padding:'12px 14px',fontSize:10,color:'#777',lineHeight:1.8}}>
          <div>MAX S: <span style={{color:'#e8e8e8',fontWeight:700}}>{maxS}</span></div>
          <div>MAX L: <span style={{color:'#e8e8e8',fontWeight:700}}>{maxL}</span></div>
        </div>
      </div>
      <div style={{margin:'10px 12px 0',background:'#1e293b',border:'1px solid #1e293b',padding:'10px 12px'}}>
        <div style={{fontSize:9,color:'#475569',fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:'uppercase'}}>Operasyonel Faktörler</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {ADDONS.map(a=>(
            <div key={a.key} onClick={()=>setAd(p=>({...p,[a.key]:!p[a.key]}))} style={{cursor:'pointer',padding:'5px 10px',borderRadius:4,fontSize:10,fontWeight:700,background:addons[a.key]?'rgba(232,115,26,0.2)':'#1e293b',border:`1px solid ${addons[a.key]?'#f97316':'#334155'}`,color:addons[a.key]?'#f97316':'#555'}}>
              {addons[a.key]?'✓':'+'} {a.label} (+{a.pts})
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex',margin:'10px 12px 0',borderBottom:'1px solid #1e293b'}}>
        <button style={tabS('matrix')} onClick={()=>setTab('matrix')}>5x5 Matrix</button>
        <button style={tabS('topics')} onClick={()=>setTab('topics')}>Topic Scores</button>
        <button style={tabS('briefing')} onClick={()=>setTab('briefing')}>PPS Briefing</button>
      </div>
      <div style={{margin:'0 12px 12px',background:'#1e293b',border:'1px solid #1e293b'}}>
        {tab==='matrix'&&(
          <div style={{padding:12}}>
            <div style={{display:'grid',gridTemplateColumns:'24px repeat(5,1fr)',gap:2,marginBottom:2}}>
              <div style={{fontSize:9,color:'#334155',textAlign:'center'}}>L\S</div>
              {[1,2,3,4,5].map(sv=><div key={sv} style={{fontSize:9,color:'#475569',textAlign:'center',fontWeight:700}}>S{sv}</div>)}
            </div>
            {[5,4,3,2,1].map(lv=>(
              <div key={lv} style={{display:'grid',gridTemplateColumns:'24px repeat(5,1fr)',gap:2,marginBottom:2}}>
                <div style={{fontSize:9,color:'#475569',textAlign:'center',fontWeight:700,alignSelf:'center'}}>L{lv}</div>
                {[1,2,3,4,5].map(sv=>{const cs=lv*sv;const cc=cellC(cs);const isCur=lv===maxL&&sv===maxS;return <div key={sv} style={{background:cc.bg,border:isCur?`2px solid ${rc.border}`:'1px solid #1e293b',borderRadius:3,padding:'6px 0',textAlign:'center',fontSize:isCur?13:11,fontWeight:isCur?800:600,color:cc.text}}>{isCur?'> ':''}{cs}</div>;})}
              </div>
            ))}
          </div>
        )}
        {tab==='topics'&&(
          <div style={{padding:8}}>
            {TOPICS.map((topic,i)=>{const sv=parseFloat(s[i])||0;const lv=parseFloat(l[i])||0;const score=Math.round(sv*lv);return(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderBottom:'1px solid #222'}}>
                <div style={{flex:1,fontSize:10,color:'#999'}}>{i+1}. {topic}</div>
                <div style={{background:sColor(sv),color:'#fff',borderRadius:3,padding:'2px 6px',fontSize:10,fontWeight:700,width:28,textAlign:'center'}}>S{sv}</div>
                <div style={{fontSize:9,color:'#334155'}}>x</div>
                <div style={{background:sColor(lv),color:'#fff',borderRadius:3,padding:'2px 6px',fontSize:10,fontWeight:700,width:28,textAlign:'center'}}>L{lv}</div>
                <div style={{fontSize:11,fontWeight:700,color:'#e8e8e8',width:24,textAlign:'right'}}>{score}</div>
              </div>
            );})}
          </div>
        )}
        {tab==='briefing'&&(
          <div style={{padding:12}}>
            {[{title:'SECTION 1 - Traffic / ATC / Taxi / RWY Ops',key:'section1'},{title:'SECTION 2 - Meteorology / Wind',key:'section2'},{title:'SECTION 3 - Security / Handling / Nav',key:'section3'}].map(sec=>ap[sec.key]?(
              <div key={sec.key} style={{marginBottom:12}}>
                <div style={{fontSize:9,color:'#38bdf8',fontWeight:700,letterSpacing:1,marginBottom:6,textTransform:'uppercase'}}>{sec.title}</div>
                <div style={{fontSize:11,color:'#aaa',lineHeight:1.8,whiteSpace:'pre-line',padding:'8px 10px',background:'#151515',borderLeft:'2px solid rgba(56,189,248,0.2)'}}>{ap[sec.key]}</div>
              </div>
            ):null)}
          </div>
        )}
      </div>
    </div>
  );
}

export default RiskAssessment;
