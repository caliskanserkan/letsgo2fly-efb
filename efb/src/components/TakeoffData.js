import React, { useState, useEffect, useRef } from 'react';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';
import { logEvent, supabase } from '../supabaseClient';

function getStopMarginColor(margin) {
  if (margin === null) return '#94a3b8';
  if (margin > 500)  return '#4ade80';
  if (margin > 300)  return '#fbbf24';
  if (margin > 100)  return '#f97316';
  return '#ef4444';
}

const iStyle = {
  background:'#0f172a', border:'1.5px solid #38bdf8', borderRadius:10,
  padding:'9px 12px', fontSize:14, fontWeight:700, color:'#38bdf8',
  fontFamily:'monospace', outline:'none', WebkitAppearance:'none',
};

function SectionTitle({ title, icon }) {
  return (
    <div style={{ padding:'16px 16px 8px', display:'flex', alignItems:'center', gap:8 }}>
      {icon && <span style={{ fontSize:16 }}>{icon}</span>}
      <span style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>{title}</span>
    </div>
  );
}

function SpeedRow({ label, value, onChange, unit, color }) {
  const c = color || '#38bdf8';
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56 }}>
      <span style={{ fontSize:15, fontWeight:700, color:'#f1f5f9', width:50 }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input style={{ ...iStyle, border:`1.5px solid ${c}`, color:c, width:90, textAlign:'center' }} value={value} onChange={e => onChange(e.target.value)} placeholder="—" />
        <span style={{ fontSize:12, color:'#475569', width:24 }}>{unit}</span>
      </div>
    </div>
  );
}

function AtisRow({ label, value, onChange, photo, onPhoto }) {
  return (
    <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
        <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>{label}</span>
        <button onClick={onPhoto} style={{ background:photo?'rgba(74,222,128,0.1)':'#1e293b', border:`1px solid ${photo?'#4ade80':'#334155'}`, borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:600, color:photo?'#4ade80':'#475569', cursor:'pointer', fontFamily:'inherit' }}>
          {photo ? '✓ Photo' : '📷 ATIS Photo'}
        </button>
      </div>
      <input style={{ ...iStyle, width:'100%', fontSize:13 }} value={value} onChange={e => onChange(e.target.value)} placeholder="Enter ATIS information..." />
    </div>
  );
}

function RvsmRow({ label, value, onChange }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid rgba(74,222,128,0.1)', minHeight:52 }}>
      <span style={{ fontSize:13, color:'#94a3b8' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input style={{ background:'#0f172a', border:'1.5px solid rgba(74,222,128,0.4)', borderRadius:10, padding:'9px 12px', fontSize:14, fontWeight:700, color:'#4ade80', fontFamily:'monospace', outline:'none', textAlign:'center', width:100, WebkitAppearance:'none' }}
          value={value} onChange={e => onChange(e.target.value)} placeholder="——" />
        <span style={{ fontSize:12, color:'#475569' }}>ft</span>
      </div>
    </div>
  );
}

function TakeoffData({ setStatus, activePlan }) {
  const dep = activePlan?.dep || 'LTAC';

  const [icao,      setIcao]      = usePersistedState('efb_tkof_icao',      dep);
  const [selRwy,    setSelRwy]    = usePersistedState('efb_tkof_selRwy',    null);
  const [manualRwy, setManualRwy] = usePersistedState('efb_tkof_manualRwy', '');
  const [manualLen, setManualLen] = usePersistedState('efb_tkof_manualLen', '');
  const [depAtis,   setDepAtis]   = usePersistedState('efb_tkof_depAtis',   '');
  const [depPhoto,  setDepPhoto]  = usePersistedState('efb_tkof_depPhoto',  false);
  const [sid,       setSid]       = usePersistedState('efb_tkof_sid',       '');
  const [fl,        setFl]        = usePersistedState('efb_tkof_fl',        '');
  const [sq,        setSq]        = usePersistedState('efb_tkof_sq',        '');
  const [oth,       setOth]       = usePersistedState('efb_tkof_oth',       '');
  const [dclPhoto,  setDclPhoto]  = usePersistedState('efb_tkof_dclPhoto',  false);
  const [v1,        setV1]        = usePersistedState('efb_tkof_v1',        '');
  const [vr,        setVr]        = usePersistedState('efb_tkof_vr',        '');
  const [v2,        setV2]        = usePersistedState('efb_tkof_v2',        '');
  const [vse,       setVse]       = usePersistedState('efb_tkof_vse',       '');
  const [trim,      setTrim]      = usePersistedState('efb_tkof_trim',      '');
  const [reqRw,     setReqRw]     = usePersistedState('efb_tkof_reqRw',     '');
  const [rvsm1,     setRvsm1]     = usePersistedState('efb_tkof_rvsm1',     '');
  const [rvsmSby,   setRvsmSby]   = usePersistedState('efb_tkof_rvsmSby',   '');
  const [rvsm2,     setRvsm2]     = usePersistedState('efb_tkof_rvsm2',     '');

  const [runways, setRunways] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noData,  setNoData]  = useState(false);

  const atisTimer    = useRef(null);
  const sidTimer     = useRef(null);
  const speedsLogged = useRef(false);
  const rvsmLogged   = useRef(false);

  useEffect(() => { if (!selRwy||!activePlan?.id) return; logEvent(activePlan.id,'TKOF_RWY_SELECTED',{rwy:selRwy}); }, [selRwy]); // eslint-disable-line
  useEffect(() => { if (!depAtis||!activePlan?.id) return; clearTimeout(atisTimer.current); atisTimer.current=setTimeout(()=>{ logEvent(activePlan.id,'TKOF_ATIS_ENTERED',{dep_atis:depAtis}); },2000); return ()=>clearTimeout(atisTimer.current); }, [depAtis]); // eslint-disable-line
  useEffect(() => { if (!v1||!vr||!v2){speedsLogged.current=false;return;} if(!activePlan?.id||speedsLogged.current)return; speedsLogged.current=true; logEvent(activePlan.id,'TKOF_SPEEDS_ENTERED',{v1,vr,v2,vse,trim}); }, [v1,vr,v2,vse,trim]); // eslint-disable-line
  useEffect(() => { if (!sid||!activePlan?.id)return; clearTimeout(sidTimer.current); sidTimer.current=setTimeout(()=>{ logEvent(activePlan.id,'TKOF_ATC_CLR',{sid,fl,sq,oth}); },2000); return ()=>clearTimeout(sidTimer.current); }, [sid,fl,sq,oth]); // eslint-disable-line
  useEffect(() => { if (!rvsm1||!rvsmSby||!rvsm2){rvsmLogged.current=false;return;} if(!activePlan?.id||rvsmLogged.current)return; rvsmLogged.current=true; logEvent(activePlan.id,'TKOF_RVSM_GROUND',{rvsm1,rvsm_sby:rvsmSby,rvsm2}); }, [rvsm1,rvsmSby,rvsm2]); // eslint-disable-line

  useEffect(() => { if (activePlan?.dep && icao === dep) setIcao(activePlan.dep); }, [activePlan?.dep]); // eslint-disable-line

  const fetchRunways = async (code) => {
    setLoading(true); setNoData(false); setRunways([]); setSelRwy(null);
    try {
      const { data: wxData } = await supabase.from('wx_snapshots').select('raw_text').eq('icao', code.toUpperCase()).order('fetched_at',{ascending:false}).limit(1).single();
      if (wxData?.raw_text) {
        const m = wxData.raw_text.match(/RWY\s+([\dLRC\s]+?)(?:\n|VAR|$)/);
        if (m) {
          const rwys = m[1].trim().split(/\s+/).filter(r => /^\d{2}[LRC]?$/.test(r));
          if (rwys.length > 0) { setRunways(rwys.map(r => ({ id:r, length:null }))); setNoData(false); setLoading(false); return; }
        }
      }
    } catch {}
    setNoData(true);
    setLoading(false);
  };

  useEffect(() => { if (icao.length === 4) fetchRunways(icao.toUpperCase()); }, [icao]); // eslint-disable-line

  const runwayOk = !!(selRwy || manualRwy);
  const speedsOk = !!(v1 && vr && v2);
  const atisOk   = !!depAtis;

  useEffect(() => {
    if (!setStatus) return;
    if (runwayOk && speedsOk && atisOk) setStatus('green');
    else if (runwayOk || speedsOk || atisOk) setStatus('amber');
    else setStatus('pending');
  }, [runwayOk, speedsOk, atisOk, setStatus]);

  const selectedRwy  = runways.find(r => r.id === selRwy);
  const activeLenFt  = selectedRwy ? selectedRwy.length : (manualLen ? parseInt(manualLen.replace(/[^0-9]/g,'')) : null);
  const reqRwNum     = reqRw ? parseInt(reqRw.replace(/[^0-9]/g,'')) : null;
  const stopMargin   = activeLenFt && reqRwNum ? activeLenFt - reqRwNum : null;
  const marginColor  = getStopMarginColor(stopMargin);
  const tow = activePlan?.tow ? `${parseInt(activePlan.tow).toLocaleString()} lb` : '—';
  const zfw = activePlan?.zfw ? `${parseInt(activePlan.zfw).toLocaleString()} lb` : '—';

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>

      {/* ATIS */}
      <SectionTitle title="ATIS" icon="📡" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <AtisRow label="Departure ATIS" value={depAtis} onChange={setDepAtis} photo={depPhoto} onPhoto={() => setDepPhoto(!depPhoto)} />
      </div>

      {/* Runway */}
      <SectionTitle title="Departure Runway" icon="🛫" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:13, color:'#94a3b8', width:50 }}>ICAO</span>
          <input value={icao} onChange={e => setIcao(e.target.value.toUpperCase())} maxLength={4} placeholder="LTAC"
            style={{ ...iStyle, width:100, textAlign:'center', letterSpacing:3 }} />
          {loading && <span style={{ fontSize:11, color:'#475569' }}>Loading...</span>}
        </div>

        {runways.length > 0 && (
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b' }}>
            <div style={{ fontSize:11, color:'#475569', marginBottom:10 }}>Select Runway</div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {runways.map(r => (
                <button key={r.id} onClick={() => { setSelRwy(r.id); setManualRwy(''); }}
                  style={{ background:selRwy===r.id?'rgba(56,189,248,0.12)':'#0f172a', border:`1.5px solid ${selRwy===r.id?'#38bdf8':'#334155'}`, borderRadius:10, padding:'8px 14px', fontSize:12, fontWeight:600, color:selRwy===r.id?'#38bdf8':'#475569', cursor:'pointer', fontFamily:'inherit' }}>
                  {r.id}
                </button>
              ))}
              <button onClick={() => { setSelRwy(null); setManualRwy(''); }}
                ENTER
              </button>
            </div>
          </div>
        )}

        {noData && (
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b' }}>
            <div style={{ marginBottom:10, padding:'10px 12px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', fontSize:12, color:'#fbbf24' }}>
              No runway data available. Enter manually.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={manualRwy} onChange={e => setManualRwy(e.target.value.toUpperCase())} placeholder="RWY" style={{ ...iStyle, width:100, textAlign:'center' }} />
              <input value={manualLen} onChange={e => setManualLen(e.target.value)} placeholder="Length (ft)" style={{ ...iStyle, flex:1, textAlign:'center' }} />
            </div>
          </div>
        )}
      </div>

      {/* OFP Weights */}
      <SectionTitle title="OFP — Weights" icon="⚖️" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        {[['TOW',tow],['ZFW',zfw],['MZFW','49,000 lb'],['MTOW','74,600 lb'],['MLWT','66,000 lb']].map(([l,v]) => (
          <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:48 }}>
            <span style={{ fontSize:13, color:'#475569' }}>{l}</span>
            <span style={{ fontSize:13, color:'#94a3b8', fontFamily:'monospace' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Speeds */}
      <SectionTitle title="Performance Speeds" icon="💨" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <SpeedRow label="V1"   value={v1}   onChange={setV1}   unit="kt" color="#38bdf8" />
        <SpeedRow label="VR"   value={vr}   onChange={setVr}   unit="kt" color="#38bdf8" />
        <SpeedRow label="V2"   value={v2}   onChange={setV2}   unit="kt" color="#38bdf8" />
        <SpeedRow label="VSE"  value={vse}  onChange={setVse}  unit="kt" color="#94a3b8" />
        <SpeedRow label="Trim" value={trim} onChange={setTrim} unit="°"  color="#94a3b8" />

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56 }}>
          <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>Req RWY Length</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input style={{ ...iStyle, width:100, textAlign:'center' }} value={reqRw} onChange={e => setReqRw(e.target.value)} placeholder="——" />
            <span style={{ fontSize:12, color:'#475569' }}>ft</span>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', minHeight:52 }}>
          <span style={{ fontSize:13, color:'#475569' }}>Stop Margin {selectedRwy?`(RWY ${selectedRwy.id})`:manualRwy?`(RWY ${manualRwy})`:''}</span>
          <span style={{ fontSize:16, fontWeight:700, color:marginColor, fontFamily:'monospace' }}>
            {stopMargin !== null ? `${stopMargin.toLocaleString()} ft` : '—'}
          </span>
        </div>
      </div>

      {/* ATC CLR */}
      <SectionTitle title="ATC Clearance" icon="📻" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#475569' }}>ATC CLR / DCL</span>
          <button onClick={() => setDclPhoto(!dclPhoto)} style={{ background:dclPhoto?'rgba(74,222,128,0.1)':'#0f172a', border:`1px solid ${dclPhoto?'#4ade80':'#334155'}`, borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:600, color:dclPhoto?'#4ade80':'#475569', cursor:'pointer', fontFamily:'inherit' }}>
            {dclPhoto ? '✓ Uploaded' : '📤 DCL Upload'}
          </button>
        </div>
        <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[{label:'SID',value:sid,onChange:setSid},{label:'FL',value:fl,onChange:setFl},{label:'SQ',value:sq,onChange:setSq},{label:'OTH',value:oth,onChange:setOth}].map(f => (
            <div key={f.label}>
              <div style={{ fontSize:10, color:'#475569', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', marginBottom:6 }}>{f.label}</div>
              <input style={{ ...iStyle, width:'100%', fontSize:13 }} value={f.value} onChange={e => f.onChange(e.target.value)} placeholder="——" />
            </div>
          ))}
        </div>
      </div>

      {/* RVSM */}
      <SectionTitle title="RVSM Ground Check" icon="📊" />
      <div style={{ margin:'0 12px 16px', background:'rgba(74,222,128,0.04)', borderRadius:14, border:'1px solid rgba(74,222,128,0.2)', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(74,222,128,0.15)', fontSize:11, color:'#4ade80', fontWeight:600 }}>
          Altimeter Cross-check
        </div>
        <RvsmRow label="PRI 1 (ALT)" value={rvsm1}   onChange={setRvsm1}   />
        <RvsmRow label="SBY ALT"     value={rvsmSby} onChange={setRvsmSby} />
        <RvsmRow label="PRI 2 (ALT)" value={rvsm2}   onChange={setRvsm2}   />
      </div>

      <div style={{ margin:'0 12px' }}>
        <SyncButton />
      </div>

    </div>
  );
}

export default TakeoffData;