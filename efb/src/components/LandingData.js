import React, { useState, useEffect, useRef, useCallback } from 'react';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';
import { logEvent, supabase } from '../supabaseClient';

const RWY_CONDITIONS = [
  { id:'DRY',           label:'DRY',           factor:1.00, color:'#4ade80' },
  { id:'WET',           label:'WET',           factor:1.15, color:'#fbbf24' },
  { id:'SLIPPERY_WET',  label:'SLIPPERY WET',  factor:1.40, color:'#f97316' },
  { id:'COMPACTED_SNOW',label:'COMP. SNOW',    factor:1.45, color:'#f97316' },
  { id:'WET_ICE',       label:'WET ICE',       factor:1.67, color:'#ef4444' },
];

function getStopMarginColor(m) {
  if (m === null) return '#94a3b8';
  if (m > 500) return '#4ade80';
  if (m > 300) return '#fbbf24';
  if (m > 100) return '#f97316';
  return '#ef4444';
}

const toInHg = (hpa) => hpa ? (parseFloat(hpa) * 0.02953).toFixed(2) : null;

const iStyle = {
  background:'#0f172a', border:'1.5px solid #38bdf8', borderRadius:10,
  padding:'9px 12px', fontSize:14, fontWeight:700, color:'#38bdf8',
  fontFamily:'monospace', outline:'none', WebkitAppearance:'none',
};
const iAmber = {
  background:'#0f172a', border:'1.5px solid #f97316', borderRadius:10,
  padding:'9px 12px', fontSize:14, fontWeight:700, color:'#f97316',
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

function NightBadge({ status, loading }) {
  if (loading) return <span style={{ fontSize:11, color:'#475569' }}>checking...</span>;
  if (!status) return null;
  const cfg = {
    NIGHT:    { color:'#38bdf8', bg:'rgba(56,189,248,0.12)',  border:'rgba(56,189,248,0.3)',  icon:'🌙' },
    DAY:      { color:'#4ade80', bg:'rgba(74,222,128,0.12)',   border:'rgba(74,222,128,0.3)',   icon:'☀️' },
    TWILIGHT: { color:'#fbbf24', bg:'rgba(251,191,36,0.12)',  border:'rgba(251,191,36,0.3)',  icon:'🌅' },
    UNKNOWN:  { color:'#475569', bg:'rgba(71,85,105,0.1)',    border:'#334155',               icon:'?' },
  }[status] || { color:'#475569', bg:'transparent', border:'#334155', icon:'?' };
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20, background:cfg.bg, border:`1px solid ${cfg.border}`, color:cfg.color }}>
      {cfg.icon} {status}
    </span>
  );
}

function LandingData({ flightData, divertData, updateDivert, setStatus, activePlan }) {
  const [icao,      setIcao]      = usePersistedState('efb_lnd_icao',      activePlan?.dest || 'LTBA');
  const [selRwy,    setSelRwy]    = usePersistedState('efb_lnd_selRwy',    null);
  const [manualRwy, setManualRwy] = usePersistedState('efb_lnd_manualRwy', '');
  const [manualLen, setManualLen] = usePersistedState('efb_lnd_manualLen', '');
  const [arrAtis,   setArrAtis]   = usePersistedState('efb_lnd_arrAtis',   '');
  const [arrPhoto,  setArrPhoto]  = usePersistedState('efb_lnd_arrPhoto',  false);
  const [reqLnd,    setReqLnd]    = usePersistedState('efb_lnd_reqLnd',    '');
  const [actualLw,  setActualLw]  = usePersistedState('efb_lnd_actualLw',  '');
  const [vref,      setVref]      = usePersistedState('efb_lnd_vref',      '');
  const [qnh,       setQnh]       = usePersistedState('efb_lnd_qnh',       '');
  const [rwyCond,   setRwyCond]   = usePersistedState('efb_lnd_rwyCond',   'DRY');

  const [nightStatus,   setNightStatus]   = useState(null);
  const [nightLoading,  setNightLoading]  = useState(false);
  const [sunsetInfo,    setSunsetInfo]    = useState(null);
  const [airportCoords, setAirportCoords] = useState(null);
  const [runways,       setRunways]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [noData,        setNoData]        = useState(false);
  const divert = divertData.active;

  const atisTimer  = useRef(null);
  const qnhTimer   = useRef(null);
  const perfLogged = useRef(false);

  useEffect(() => { if (!selRwy||!activePlan?.id) return; logEvent(activePlan.id,'LND_RWY_SELECTED',{rwy:selRwy}); }, [selRwy]); // eslint-disable-line
  useEffect(() => { if (!arrAtis||!activePlan?.id) return; clearTimeout(atisTimer.current); atisTimer.current=setTimeout(()=>{ logEvent(activePlan.id,'LND_ATIS_ENTERED',{arr_atis:arrAtis,qnh:qnh||null,rwy_cond:rwyCond}); },2000); return ()=>clearTimeout(atisTimer.current); }, [arrAtis,qnh,rwyCond]); // eslint-disable-line
  useEffect(() => { if (!qnh||!activePlan?.id) return; clearTimeout(qnhTimer.current); qnhTimer.current=setTimeout(()=>{ logEvent(activePlan.id,'LND_QNH_ENTERED',{qnh_hpa:qnh,qnh_inhg:toInHg(qnh)}); },2000); return ()=>clearTimeout(qnhTimer.current); }, [qnh]); // eslint-disable-line
  useEffect(() => { if (!actualLw&&!vref){perfLogged.current=false;return;} if(!activePlan?.id||perfLogged.current)return; perfLogged.current=true; logEvent(activePlan.id,'LND_PERF_DATA',{actual_lw:actualLw,vref,req_lnd_dist:reqLnd,rwy_cond:rwyCond,qnh:qnh||null,night:nightStatus||null}); }, [actualLw,vref,reqLnd,rwyCond,qnh,nightStatus]); // eslint-disable-line
  useEffect(() => { if (activePlan?.dest) setIcao(activePlan.dest); }, [activePlan?.dest]); // eslint-disable-line

  const fetchRunways = useCallback(async (code) => {
    setLoading(true); setNoData(false); setRunways([]); setSelRwy(null); setAirportCoords(null);
    try {
      const { data } = await supabase.from('airport_risks').select('runways').eq('icao', code.toUpperCase()).single();
      if (data?.runways) {
        const rwys = data.runways.split(',').map(r => r.trim()).filter(Boolean);
        if (rwys.length > 0) { setRunways(rwys.map(r => ({ id:r, length:null }))); setNoData(false); setLoading(false); return; }
      }
    } catch {}
    setNoData(true);
    setLoading(false);
  }, [setSelRwy]);

  useEffect(() => { if(icao.length===4)fetchRunways(icao.toUpperCase()); }, [icao,fetchRunways]);

  useEffect(() => {
    if(!airportCoords)return;
    const fetchSunTimes=async()=>{
      setNightLoading(true);
      try{
        const date=activePlan?.date?(()=>{ const months={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'}; const parts=activePlan.date.trim().split(/\s+/); if(parts.length===3){const d=parts[0].padStart(2,'0'),m=months[parts[1].toUpperCase()]||'01',y=parts[2];return `${y}-${m}-${d}`;}return new Date().toISOString().slice(0,10);})():new Date().toISOString().slice(0,10);
        const url=`https://api.sunrise-sunset.org/json?lat=${airportCoords.lat}&lng=${airportCoords.lon}&date=${date}&formatted=0`;
        const resp=await fetch(url); const data=await resp.json();
        if(data.status==='OK') setSunsetInfo({sunrise:new Date(data.results.sunrise),sunset:new Date(data.results.sunset),civil_twilight_begin:new Date(data.results.civil_twilight_begin),civil_twilight_end:new Date(data.results.civil_twilight_end)});
      }catch{}
      setNightLoading(false);
    };
    fetchSunTimes();
  }, [airportCoords,activePlan?.date]);

  useEffect(() => {
    if(!sunsetInfo){setNightStatus(null);return;}
    const landingTimeStr=flightData?.landingTime||activePlan?.eta;
    if(!landingTimeStr){setNightStatus(null);return;}
    const [hStr,mStr]=landingTimeStr.replace(' Z','').replace('Z','').split(':');
    const h=parseInt(hStr),m=parseInt(mStr);
    if(isNaN(h)||isNaN(m)){setNightStatus(null);return;}
    const landingDate=new Date(sunsetInfo.sunrise);
    landingDate.setUTCHours(h,m,0,0);
    const{sunrise,sunset,civil_twilight_begin,civil_twilight_end}=sunsetInfo;
    if(landingDate<civil_twilight_begin||landingDate>civil_twilight_end)setNightStatus('NIGHT');
    else if(landingDate<sunrise||landingDate>sunset)setNightStatus('TWILIGHT');
    else setNightStatus('DAY');
  }, [sunsetInfo,flightData?.landingTime,activePlan?.eta]);

  const runwayOk=divert?!!(divertData.icao&&divertData.rwy):!!(selRwy||manualRwy);
  const atisOk=!!arrAtis, qnhOk=!!qnh;

  useEffect(() => {
    if(!setStatus)return;
    if(runwayOk&&atisOk&&qnhOk)setStatus('green');
    else if(runwayOk||atisOk)setStatus('amber');
    else setStatus('pending');
  }, [runwayOk,atisOk,qnhOk,setStatus]); // eslint-disable-line

  const selectedRwy=runways.find(r=>r.id===selRwy);
  const divLenNum=divertData.len?parseInt(divertData.len.replace(/[^0-9]/g,'')):null;
  const activeLenFt=divert&&divLenNum?divLenNum:selectedRwy?selectedRwy.length:(manualLen?parseInt(manualLen.replace(/[^0-9]/g,'')):null);
  const reqLndNum=reqLnd?parseInt(reqLnd.replace(/[^0-9]/g,'')):null;
  const condObj=RWY_CONDITIONS.find(c=>c.id===rwyCond)||RWY_CONDITIONS[0];
  const reqLndAdjusted=reqLndNum?Math.ceil(reqLndNum*condObj.factor):null;
  const stopMargin=activeLenFt&&reqLndAdjusted?activeLenFt-reqLndAdjusted:null;
  const marginColor=getStopMarginColor(stopMargin);
  const planLw=activePlan?.zfw?`${parseInt(activePlan.zfw).toLocaleString()} lb`:'—';
  const actualLwNum=actualLw?parseInt(actualLw.replace(/[^0-9]/g,'')):null;
  const lwExceeded=actualLwNum&&actualLwNum>66000;
  const qnhInHg=toInHg(qnh), qnhLow=qnh&&parseFloat(qnh)<950;

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>

      {/* ATIS */}
      <SectionTitle title="ATIS" icon="📡" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>Arrival ATIS</span>
            <button onClick={() => setArrPhoto(!arrPhoto)} style={{ background:arrPhoto?'rgba(74,222,128,0.1)':'#0f172a', border:`1px solid ${arrPhoto?'#4ade80':'#334155'}`, borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:600, color:arrPhoto?'#4ade80':'#475569', cursor:'pointer', fontFamily:'inherit' }}>
              {arrPhoto ? '✓ Photo' : '📷 ATIS Photo'}
            </button>
          </div>
          <input style={{ ...iStyle, width:'100%', fontSize:13 }} value={arrAtis} onChange={e => setArrAtis(e.target.value)} placeholder="Enter ATIS information..." />
        </div>
        {/* QNH */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', minHeight:56 }}>
          <div>
            <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>QNH</span>
            {qnhInHg && <span style={{ fontSize:11, color:'#475569', marginLeft:8 }}>{qnhInHg} inHg</span>}
            {qnhLow && <span style={{ fontSize:11, color:'#ef4444', marginLeft:8, fontWeight:600 }}>LOW — verify ATC</span>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input value={qnh} onChange={e => setQnh(e.target.value)} placeholder="——" maxLength={4}
              style={{ ...iStyle, border:`1.5px solid ${qnhLow?'#ef4444':'#38bdf8'}`, color:qnhLow?'#ef4444':'#38bdf8', width:90, textAlign:'center' }} />
            <span style={{ fontSize:12, color:'#475569' }}>hPa</span>
          </div>
        </div>
      </div>

      {/* RWY Condition */}
      <SectionTitle title="RWY Condition" icon="🛬" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', padding:'14px' }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: rwyCond!=='DRY'?12:0 }}>
          {RWY_CONDITIONS.map(c => (
            <button key={c.id} onClick={() => setRwyCond(c.id)}
              style={{ background:rwyCond===c.id?`${c.color}15`:'#0f172a', border:`1.5px solid ${rwyCond===c.id?c.color:'#334155'}`, borderRadius:10, padding:'8px 12px', fontSize:11, fontWeight:600, color:rwyCond===c.id?c.color:'#475569', cursor:'pointer', fontFamily:'inherit' }}>
              {c.label}
            </button>
          ))}
        </div>
        {rwyCond !== 'DRY' && (
          <div style={{ padding:'10px 12px', borderRadius:10, background:`${condObj.color}08`, border:`1px solid ${condObj.color}30`, fontSize:12, color:condObj.color }}>
            Landing factor: ×{condObj.factor.toFixed(2)} — adjusted distance shown below
          </div>
        )}
      </div>

      {/* Landing Aerodrome */}
      <div style={{ opacity:divert?0.3:1, pointerEvents:divert?'none':'auto' }}>
        <SectionTitle title="Landing Runway" icon="🏁" />
        <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:13, color:'#94a3b8', width:50 }}>ICAO</span>
            <input value={icao} onChange={e => setIcao(e.target.value.toUpperCase())} maxLength={4} placeholder="LTBA"
              style={{ ...iStyle, width:100, textAlign:'center', letterSpacing:3 }} />
            {loading && <span style={{ fontSize:11, color:'#475569' }}>Loading...</span>}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              {sunsetInfo && (
                <div style={{ fontSize:10, color:'#334155', textAlign:'right', lineHeight:1.7 }}>
                  <div>SR {sunsetInfo.sunrise.toISOString().slice(11,16)}Z</div>
                  <div>SS {sunsetInfo.sunset.toISOString().slice(11,16)}Z</div>
                </div>
              )}
              <NightBadge status={nightStatus} loading={nightLoading} />
            </div>
          </div>

          {(flightData?.landingTime||activePlan?.eta) && (
            <div style={{ padding:'8px 16px', borderBottom:'1px solid #1e293b', fontSize:11, color:'#475569', display:'flex', alignItems:'center', gap:8 }}>
              <span>{flightData?.landingTime?`Landing: ${flightData.landingTime} Z (actual)`:`ETA: ${activePlan.eta} Z (planned)`}</span>
              {nightStatus && <span style={{ color:nightStatus==='NIGHT'?'#38bdf8':nightStatus==='TWILIGHT'?'#fbbf24':'#4ade80', fontWeight:600 }}>→ {nightStatus}</span>}
            </div>
          )}

          {runways.length > 0 && (
            <div style={{ padding:'12px 16px', borderBottom:'1px solid #1e293b' }}>
              <div style={{ fontSize:11, color:'#475569', marginBottom:10 }}>Select Runway</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {runways.map(r => (
                  <button key={r.id} onClick={() => setSelRwy(r.id)}
                    style={{ background:selRwy===r.id?'rgba(56,189,248,0.12)':'#0f172a', border:`1.5px solid ${selRwy===r.id?'#38bdf8':'#334155'}`, borderRadius:10, padding:'8px 14px', fontSize:12, fontWeight:600, color:selRwy===r.id?'#38bdf8':'#475569', cursor:'pointer', fontFamily:'inherit' }}>
                    {r.id} <span style={{ fontSize:10, color:'#475569', marginLeft:4 }}>{r.length.toLocaleString()} ft</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {noData && (
            <div style={{ padding:'12px 16px' }}>
              <div style={{ marginBottom:10, padding:'10px 12px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', fontSize:12, color:'#fbbf24' }}>No runway data. Enter manually.</div>
              <div style={{ display:'flex', gap:8 }}>
                <input value={manualRwy} onChange={e => setManualRwy(e.target.value.toUpperCase())} placeholder="RWY" style={{ ...iStyle, width:100, textAlign:'center' }} />
                <input value={manualLen} onChange={e => setManualLen(e.target.value)} placeholder="Length (ft)" style={{ ...iStyle, flex:1, textAlign:'center' }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Landing Weights */}
      <SectionTitle title="Landing Weights" icon="⚖️" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        {[['Plan LW (ZFW)',planLw,null],['Max LWT','66,000 lb',null]].map(([l,v,c])=>(
          <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:48 }}>
            <span style={{ fontSize:13, color:'#475569' }}>{l}</span>
            <span style={{ fontSize:13, color:c||'#94a3b8', fontFamily:'monospace' }}>{v}</span>
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56 }}>
          <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>Actual LW</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input value={actualLw} onChange={e => setActualLw(e.target.value)} placeholder="——"
              style={{ ...iStyle, border:`1.5px solid ${lwExceeded?'#ef4444':'#38bdf8'}`, color:lwExceeded?'#ef4444':'#38bdf8', width:110, textAlign:'right' }} />
            <span style={{ fontSize:12, color:'#475569' }}>lb</span>
          </div>
        </div>
        {lwExceeded && <div style={{ padding:'10px 14px', fontSize:12, color:'#ef4444', fontWeight:700, background:'rgba(239,68,68,0.06)', borderTop:'1px solid rgba(239,68,68,0.2)' }}>⚠️ EXCEEDS MAX LWT (66,000 lb)</div>}
        {actualLwNum && !lwExceeded && <div style={{ padding:'10px 14px', fontSize:12, color:'#4ade80', background:'rgba(74,222,128,0.04)', borderTop:'1px solid rgba(74,222,128,0.1)' }}>✓ LW OK — Margin: {(66000-actualLwNum).toLocaleString()} lb</div>}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', minHeight:56 }}>
          <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>Vref</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input value={vref} onChange={e => setVref(e.target.value)} placeholder="——" style={{ ...iStyle, width:90, textAlign:'center' }} />
            <span style={{ fontSize:12, color:'#475569' }}>kt</span>
          </div>
        </div>
      </div>

      {/* Performance */}
      <SectionTitle title="Performance" icon="📏" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56 }}>
          <span style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>Req Landing Distance</span>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input style={{ ...iStyle, width:110, textAlign:'center' }} value={reqLnd} onChange={e => setReqLnd(e.target.value)} placeholder="——" />
            <span style={{ fontSize:12, color:'#475569' }}>ft</span>
          </div>
        </div>
        {reqLndNum && rwyCond !== 'DRY' && (
          <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b' }}>
            <span style={{ fontSize:13, color:'#475569' }}>Adjusted ({condObj.label} ×{condObj.factor.toFixed(2)})</span>
            <span style={{ fontSize:13, color:condObj.color, fontFamily:'monospace', fontWeight:600 }}>{reqLndAdjusted?.toLocaleString()} ft</span>
          </div>
        )}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', minHeight:52 }}>
          <span style={{ fontSize:13, color:'#475569' }}>
            Stop Margin {divert&&divertData.rwy?`(DIVERT ${divertData.rwy})`:selectedRwy?`(RWY ${selectedRwy.id})`:manualRwy?`(RWY ${manualRwy})`:''}
            {rwyCond!=='DRY'&&<span style={{ fontSize:11, color:condObj.color, marginLeft:6 }}>[{condObj.label}]</span>}
          </span>
          <span style={{ fontSize:18, fontWeight:700, color:marginColor, fontFamily:'monospace' }}>
            {stopMargin !== null ? `${stopMargin.toLocaleString()} ft` : '—'}
          </span>
        </div>
        {stopMargin !== null && stopMargin < 0 && (
          <div style={{ padding:'10px 14px', fontSize:12, color:'#ef4444', fontWeight:700, background:'rgba(239,68,68,0.06)', borderTop:'1px solid rgba(239,68,68,0.2)' }}>
            ⚠️ INSUFFICIENT RUNWAY — {Math.abs(stopMargin).toLocaleString()} ft SHORT
          </div>
        )}
        {stopMargin !== null && stopMargin >= 0 && stopMargin < 300 && (
          <div style={{ padding:'10px 14px', fontSize:12, color:'#f97316', fontWeight:600, background:'rgba(249,115,22,0.06)', borderTop:'1px solid rgba(249,115,22,0.2)' }}>
            Low stop margin — exercise caution
          </div>
        )}
      </div>

      {/* Divert */}
      <SectionTitle title="Divert" icon="⚠️" />
      <div style={{ margin:'0 12px 16px', background:divert?'rgba(249,115,22,0.06)':'#1e293b', borderRadius:14, border:`1px solid ${divert?'rgba(249,115,22,0.3)':'#334155'}`, overflow:'hidden' }}>
        <div onClick={() => updateDivert('active',!divert)}
          style={{ padding:'14px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
          <span style={{ fontSize:13, fontWeight:600, color:divert?'#f97316':'#94a3b8' }}>DIVERT ACTIVATED</span>
          <div style={{ width:44, height:24, background:divert?'#f97316':'#334155', borderRadius:12, position:'relative', transition:'background 0.2s', flexShrink:0 }}>
            <div style={{ position:'absolute', width:20, height:20, background:'#fff', borderRadius:10, top:2, left:divert?22:2, transition:'left 0.2s' }} />
          </div>
        </div>
        {divert && (
          <div style={{ padding:'0 16px 16px', display:'flex', flexDirection:'column', gap:12, borderTop:'1px solid rgba(249,115,22,0.2)' }}>
            <div style={{ paddingTop:12, fontSize:11, color:'#f97316', fontWeight:600 }}>Divert Aerodrome — Pilot Entry</div>
            <div style={{ display:'flex', gap:8 }}>
              {[{label:'ICAO',val:divertData.icao,upd:v=>updateDivert('icao',v.toUpperCase()),max:4,ph:'ICAO',ls:2},{label:'Runway',val:divertData.rwy,upd:v=>updateDivert('rwy',v.toUpperCase()),ph:'RWY'},{label:'Length',val:divertData.len,upd:v=>updateDivert('len',v),ph:'ft'}].map(f=>(
                <div key={f.label} style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:'#f97316', fontWeight:600, letterSpacing:'0.5px', textTransform:'uppercase', marginBottom:6 }}>{f.label}</div>
                  <input value={f.val} onChange={e=>f.upd(e.target.value)} placeholder={f.ph} maxLength={f.max} style={{ ...iAmber, width:'100%', textAlign:'center', letterSpacing:f.ls||0 }}/>
                </div>
              ))}
            </div>
            <div style={{ padding:'10px 12px', borderRadius:10, background:'rgba(249,115,22,0.08)', border:'1px solid rgba(249,115,22,0.2)', fontSize:12, color:'#f97316' }}>
              Divert activated — destination updates across all pages.
            </div>
          </div>
        )}
      </div>

      <div style={{ margin:'0 12px' }}><SyncButton /></div>
    </div>
  );
}

export default LandingData;