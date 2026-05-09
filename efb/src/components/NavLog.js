import React, { useState, useEffect, useRef } from 'react';
import { supabase, logEvent } from '../supabaseClient';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';

const FIFTY_MIN = 50 * 60 * 1000;

function parseCoord(str) {
  const m = str.match(/N(\d+):(\d+\.?\d*)\s*E(\d+):(\d+\.?\d*)/i);
  if (!m) return null;
  return { lat: parseFloat(m[1]) + parseFloat(m[2]) / 60, lon: parseFloat(m[3]) + parseFloat(m[4]) / 60 };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function toMins(t) {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function fromMins(m) {
  if (m === null || m === undefined) return null;
  const n = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}

function fmtDev(dev) {
  if (dev === null || dev === undefined) return null;
  if (dev === 0) return { label:'±0', color:'#2d9e5f' };
  if (dev > 0)   return { label:`+${dev}`, color:'#e8731a' };
  return { label:`${dev}`, color:'#2d9e5f' };
}

// ─── PPS Air Support OFP Parser ───────────────────────────────────────────────
// Route section line pairs:
//   Line 1: [AWY] [WPT] [FIR4] ... [TFREM]   ← TFREM = last 4-5 digit number
//   Line 2: [MORA] [FL]  ...  [DTG] [ATM]     ← ATM = cumulative time H:MM
// ETA = STD + ATM(minutes)
// planFuel = TFREM (lbs remaining at that waypoint per OFP)
function parseWaypoints(rawText, dep, dest, std) {
  if (!rawText || !dep || !dest) return [];
  const stdMins = toMins(std);

  // ── Step 1: Route section → ATM + TFREM per WPT ──────────────────────────
  const routeData = {};
  const lines = rawText.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const line1 = lines[i];
    const line2 = lines[i + 1];

    // AWY WPT FIR (FIR is exactly 4 uppercase letters: LTBB, LTAA, etc.)
    const wptMatch = line1.match(/^\s+\S+\s+([A-Z][A-Z0-9]{1,5})\s+[A-Z]{4}\s/);
    if (!wptMatch) continue;
    const rawName = wptMatch[1];
    if (rawName.includes('TOC') || rawName.includes('TOD')) continue;

    // TFREM: last 4-5 digit number on line 1
    const tfremMatch = line1.match(/\b(\d{4,5})\s*$/);
    const planFuel = tfremMatch ? parseInt(tfremMatch[1]) : null;

    // ATM: first H:MM on line 2 (cumulative time from departure)
    const atmMatch = line2.match(/\b(\d+:\d{2})\b/);
    if (!atmMatch) continue;
    const atmMins = toMins(atmMatch[1]);
    if (atmMins === null || stdMins === null) continue;

    routeData[rawName] = { eta: fromMins(stdMins + atmMins), planFuel };
  }

  // Fuzzy lookup: "C2000" matches "C2000F" etc.
  const getRouteData = name => {
    if (routeData[name]) return routeData[name];
    const key = Object.keys(routeData).find(k => k.startsWith(name) || name.startsWith(k));
    return key ? routeData[key] : {};
  };

  // ── Step 2: Coordinate section → WPT names + coords ──────────────────────
  const depPat = new RegExp(`DEP\\s+${dep}\\/\\S+[^\\n]*\\n([\\s\\S]*?)(?=DEST\\s+${dest}\\/)`, 'i');
  const coordSection = rawText.match(depPat)?.[1] || '';

  const depCoord = parseCoord(rawText.match(new RegExp(`DEP\\s+${dep}\\/\\S+[^\\n]*(N\\d+:\\d+\\.?\\d*\\s*E\\d+:\\d+\\.?\\d*)`, 'i'))?.[1] || '');
  const destLine = rawText.match(new RegExp(`DEST\\s+${dest}\\/\\S+[^\\n]*`, 'i'))?.[0] || '';
  const destCoord = parseCoord(destLine);

  const coordWpts = [];
  for (const line of coordSection.split('\n')) {
    if (!line.trim() || line.match(/-TOC-|-TOD-/)) continue;
    const m = line.match(/^\s*\d+\s+([A-Z][A-Z0-9]{1,5})\s/);
    if (m) coordWpts.push({ name: m[1], coord: parseCoord(line) });
  }

  // ── Step 3: Assemble waypoints ────────────────────────────────────────────
  const destRD = getRouteData(dest);
  const waypoints = [];

  waypoints.push({ uid:dep, name:dep, type:'dep', eta:std||'—', fl:'—', planFuel:null, custom:false, coord:depCoord });

  coordWpts.forEach(w => {
    const rd = getRouteData(w.name);
    waypoints.push({ uid:w.name, name:w.name, type:'wpt', eta:rd.eta||'—', fl:'—', planFuel:rd.planFuel||null, custom:false, coord:w.coord });
  });

  waypoints.push({ uid:dest, name:dest, type:'dest', eta:destRD.eta||'—', fl:'—', planFuel:destRD.planFuel||null, custom:false, coord:destCoord });

  return waypoints;
}

function useGPS() {
  const [pos, setPos] = useState(null);
  const [error, setError] = useState(null);
  const watchId = useRef(null);
  const start = () => {
    if (!navigator.geolocation) { setError('GPS not supported'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      p => setPos({ lat:p.coords.latitude, lon:p.coords.longitude, acc:p.coords.accuracy }),
      e => setError(e.message),
      { enableHighAccuracy:true, maximumAge:5000, timeout:10000 }
    );
  };
  const stop = () => {
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current=null; setPos(null); setError(null); }
  };
  useEffect(() => () => stop(), []); // eslint-disable-line
  return { pos, error, active: watchId.current !== null, start, stop };
}

function getFuelColor(fuel) {
  if (!fuel) return '#999';
  if (fuel < 4000) return '#e02020';
  if (fuel < 5000) return '#e8731a';
  if (fuel < 6000) return '#f0c040';
  return '#2d9e5f';
}

function TimeBox({ value, onChange, placeholder }) {
  const handleChange = e => { let v=e.target.value.replace(/[^0-9]/g,'').slice(0,4); if(v.length>2)v=v.slice(0,2)+':'+v.slice(2); onChange(v); };
  return <input value={value} onChange={handleChange} placeholder={placeholder||'HH:MM'} maxLength={5}
    style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'center' }}/>;
}

function FuelBox({ value, onChange, placeholder }) {
  return <input value={value} onChange={e=>onChange(e.target.value.replace(/[^0-9,]/g,''))} placeholder={placeholder||'lb'}
    style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'center' }}/>;
}

function RvsmBoxes({ value, onChange }) {
  const parts=(value||'//').split('/'); const pri1=parts[0]||'',sby=parts[1]||'',pri2=parts[2]||'';
  const ref2=useRef(null),ref3=useRef(null); const update=(p1,p2,p3)=>onChange(`${p1}/${p2}/${p3}`);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {[
        { label:'PRI 1', ref:null, val:pri1, chg:e=>{const v=e.target.value.replace(/[^0-9]/g,'').slice(0,5);update(v,sby,pri2);if(v.length===5)ref2.current?.focus();} },
        { label:'SBY',   ref:ref2, val:sby,  chg:e=>{const v=e.target.value.replace(/[^0-9]/g,'').slice(0,5);update(pri1,v,pri2);if(v.length===5)ref3.current?.focus();} },
        { label:'PRI 2', ref:ref3, val:pri2, chg:e=>{const v=e.target.value.replace(/[^0-9]/g,'').slice(0,5);update(pri1,sby,v);} },
      ].map(f=>(
        <div key={f.label} style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:10, color:'#555', fontWeight:700, textTransform:'uppercase', width:40, flexShrink:0 }}>{f.label}</div>
          <input ref={f.ref} value={f.val} onChange={f.chg} placeholder="00000" maxLength={5}
            style={{ flex:1, background:'#1a1a1a', border:'1.5px solid rgba(45,158,95,0.6)', borderRadius:6, padding:'8px 10px', fontSize:14, fontWeight:700, color:'#2d9e5f', fontFamily:'monospace', outline:'none', textAlign:'center' }}/>
          <span style={{ fontSize:10, color:'#555', width:16, flexShrink:0 }}>ft</span>
        </div>
      ))}
    </div>
  );
}

function DepModal({ dep, onClose, onSave, initial }) {
  const [offBlock,setOffBlock]=useState(initial.offBlock||'');
  const [toTime,setToTime]=useState(initial.toTime||'');
  const [toFuel,setToFuel]=useState(initial.toFuel||'');
  return (
    <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}>
      <div style={{ background:'#252525',border:'1px solid #383838',borderRadius:12,width:320,overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f',padding:'10px 16px',borderBottom:'1px solid #383838',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ fontSize:12,fontWeight:700,color:'#1a9bc4' }}>{dep} — Departure Data</span>
          <span onClick={onClose} style={{ color:'#555',cursor:'pointer',fontSize:20,lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px',display:'flex',flexDirection:'column',gap:14 }}>
          <div><div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Off Block</div><TimeBox value={offBlock} onChange={setOffBlock}/></div>
          <div><div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>T/O Time</div><TimeBox value={toTime} onChange={setToTime}/></div>
          <div><div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>T/O Fuel</div><FuelBox value={toFuel} onChange={setToFuel} placeholder="lb"/></div>
        </div>
        <div style={{ padding:'0 16px 16px',display:'flex',gap:8 }}>
          <button onClick={onClose} style={{ flex:1,background:'#2a2a2a',border:'1px solid #383838',borderRadius:7,padding:10,fontSize:13,color:'#666',cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
          <button onClick={()=>onSave({offBlock,toTime,toFuel})} style={{ flex:2,background:'#1a9bc4',border:'none',borderRadius:7,padding:10,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function ArrivalModal({ wptName, isDivert, onClose, onSave, onDivert, initial }) {
  const [lndTime,setLndTime]=useState(initial.lndTime||'');
  const [onBlock,setOnBlock]=useState(initial.onBlock||'');
  const [remFuel,setRemFuel]=useState(initial.remFuel||'');
  const [doDiv,setDoDiv]=useState(false);
  const [divertIcao,setDivertIcao]=useState('');
  const [divertRwy,setDivertRwy]=useState('');
  const handleSave=()=>{ if(doDiv&&divertIcao.length===4&&onDivert)onDivert({icao:divertIcao,rwy:divertRwy}); onSave({lndTime,onBlock,remFuel}); };
  return (
    <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}>
      <div style={{ background:'#252525',border:`1px solid ${isDivert?'#e8731a55':'#383838'}`,borderRadius:12,width:320,overflow:'hidden',maxHeight:'90vh',overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f',padding:'10px 16px',borderBottom:'1px solid #383838',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ fontSize:12,fontWeight:700,color:isDivert?'#e8731a':'#1a9bc4' }}>{wptName} — Arrival Data</span>
          <span onClick={onClose} style={{ color:'#555',cursor:'pointer',fontSize:20,lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px',display:'flex',flexDirection:'column',gap:14 }}>
          <div><div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Landing Time</div><TimeBox value={lndTime} onChange={setLndTime}/></div>
          <div><div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>On Block</div><TimeBox value={onBlock} onChange={setOnBlock}/></div>
          <div><div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Remaining Fuel</div><FuelBox value={remFuel} onChange={setRemFuel}/></div>
          {!isDivert&&(
            <div style={{ borderTop:'1px solid #383838',paddingTop:12 }}>
              <div onClick={()=>setDoDiv(!doDiv)} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',padding:'8px 10px',borderRadius:7,background:doDiv?'rgba(255,149,0,0.1)':'#1f1f1f',border:`1px solid ${doDiv?'rgba(255,149,0,0.4)':'#383838'}` }}>
                <span style={{ fontSize:12,fontWeight:700,color:doDiv?'#e8731a':'#555' }}>⚠ DIVERT</span>
                <div style={{ width:36,height:20,background:doDiv?'#e8731a':'#333',borderRadius:10,position:'relative',transition:'background 0.2s' }}>
                  <div style={{ position:'absolute',width:16,height:16,background:'#fff',borderRadius:8,top:2,left:doDiv?18:2,transition:'left 0.2s' }}/>
                </div>
              </div>
              {doDiv&&(
                <div style={{ marginTop:10,display:'flex',flexDirection:'column',gap:10 }}>
                  <div><div style={{ fontSize:10,color:'#e8731a',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Divert ICAO *</div>
                    <input value={divertIcao} onChange={e=>setDivertIcao(e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4))} placeholder="ICAO" maxLength={4}
                      style={{ width:'100%',background:'#1a1a1a',border:'1.5px solid #e8731a',borderRadius:6,padding:'9px 12px',fontSize:16,fontWeight:700,color:'#e8731a',fontFamily:'monospace',outline:'none',textAlign:'center',letterSpacing:2 }}/>
                  </div>
                  <div><div style={{ fontSize:10,color:'#e8731a',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Runway</div>
                    <input value={divertRwy} onChange={e=>setDivertRwy(e.target.value.toUpperCase())} placeholder="e.g. 27L"
                      style={{ width:'100%',background:'#1a1a1a',border:'1.5px solid #e8731a',borderRadius:6,padding:'9px 12px',fontSize:14,fontWeight:700,color:'#e8731a',fontFamily:'monospace',outline:'none',textAlign:'center' }}/>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding:'0 16px 16px',display:'flex',gap:8 }}>
          <button onClick={onClose} style={{ flex:1,background:'#2a2a2a',border:'1px solid #383838',borderRadius:7,padding:10,fontSize:13,color:'#666',cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={doDiv&&divertIcao.length!==4}
            style={{ flex:2,background:doDiv?'#e8731a':'#1a9bc4',border:'none',borderRadius:7,padding:10,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit',opacity:doDiv&&divertIcao.length!==4?0.5:1 }}>
            {doDiv?'⚠ Save + Divert':'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function WptModal({ wpt, onClose, onSave, onDirectTo, onAddWpt, onDelete, initial, wptList, estimatedATA, estimatedFuel, plannedFuel }) {
  const [ata,setAta]=useState(initial.ata||''); const [fuel,setFuel]=useState(initial.fuel||''); const [rvsm,setRvsm]=useState(initial.rvsm||'');
  const [showDT,setShowDT]=useState(false); const [showAdd,setShowAdd]=useState(false); const [addPos,setAddPos]=useState('after'); const [addName,setAddName]=useState('');
  const handleAdd=()=>{ if(addName.length<2)return; onAddWpt({uid:`${addName}_${Date.now()}`,name:addName,type:'wpt',custom:true,eta:'—',fl:'—',planFuel:null,coord:null},addPos); setAddName('');setShowAdd(false); };
  return (
    <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}>
      <div style={{ background:'#252525',border:'1px solid #383838',borderRadius:12,width:320,overflow:'hidden',maxHeight:'92vh',overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f',padding:'10px 16px',borderBottom:'1px solid #383838',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ fontSize:12,fontWeight:700,color:wpt.custom?'#ff9500':'#1a9bc4' }}>{wpt.name}</span>
          <span onClick={onClose} style={{ color:'#555',cursor:'pointer',fontSize:20,lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px',display:'flex',flexDirection:'column',gap:14 }}>

          {/* OFP Plan Info */}
          {(wpt.eta!=='—'||wpt.planFuel)&&(
            <div style={{ background:'#1a1a1a',borderRadius:6,padding:'8px 12px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
              {wpt.eta!=='—'&&<div><div style={{ fontSize:9,color:'#555',marginBottom:2 }}>ETA PLAN</div><div style={{ fontSize:13,fontWeight:700,color:'#888',fontFamily:'monospace' }}>{wpt.eta} UTC</div></div>}
              {wpt.planFuel&&<div><div style={{ fontSize:9,color:'#555',marginBottom:2 }}>FUEL PLAN</div><div style={{ fontSize:13,fontWeight:700,color:'#888',fontFamily:'monospace' }}>{wpt.planFuel.toLocaleString()} lb</div></div>}
            </div>
          )}

          {/* ATA */}
          <div>
            <div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <span>ATA (ACTUAL)</span>
              {estimatedATA&&!ata&&(
                <span style={{ fontSize:10,color:'#555',fontStyle:'italic' }}>
                  Est: <span style={{ color:'#888',fontFamily:'monospace' }}>{estimatedATA}</span>
                  <button onClick={()=>setAta(estimatedATA)} style={{ marginLeft:6,background:'rgba(26,155,196,0.15)',border:'1px solid rgba(26,155,196,0.3)',borderRadius:4,padding:'1px 7px',fontSize:9,color:'#1a9bc4',cursor:'pointer',fontFamily:'inherit' }}>Use</button>
                </span>
              )}
            </div>
            <TimeBox value={ata} onChange={setAta} placeholder={estimatedATA||'HH:MM'}/>
          </div>

          {/* Fuel */}
          <div>
            <div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <span>ACTUAL FUEL REM</span>
              {estimatedFuel&&!fuel&&(
                <span style={{ fontSize:10,color:'#555',fontStyle:'italic' }}>
                  Est: <span style={{ color:'#888',fontFamily:'monospace' }}>{estimatedFuel.toLocaleString()}</span>
                  <button onClick={()=>setFuel(String(estimatedFuel))} style={{ marginLeft:6,background:'rgba(26,155,196,0.15)',border:'1px solid rgba(26,155,196,0.3)',borderRadius:4,padding:'1px 7px',fontSize:9,color:'#1a9bc4',cursor:'pointer',fontFamily:'inherit' }}>Use</button>
                </span>
              )}
            </div>
            <FuelBox value={fuel} onChange={setFuel} placeholder={estimatedFuel?String(estimatedFuel):'lb'}/>
            {/* Deviation preview */}
            {fuel&&plannedFuel&&(()=>{
              const dev=parseInt(fuel.replace(/,/g,''))-plannedFuel;
              const color=Math.abs(dev)<50?'#2d9e5f':dev>0?'#2d9e5f':'#e02020';
              const label=Math.abs(dev)<50?'±0':dev>0?`+${dev.toLocaleString()}`:dev.toLocaleString();
              return <div style={{ marginTop:6,textAlign:'right',fontSize:11,fontWeight:700,color,fontFamily:'monospace' }}>vs plan: {label} lb</div>;
            })()}
          </div>

          {/* RVSM */}
          <div>
            <div style={{ fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>RVSM Altimeter Check</div>
            <RvsmBoxes value={rvsm} onChange={setRvsm}/>
          </div>

          {/* Direct To */}
          {wptList.length>0&&(
            <div>
              <button onClick={()=>setShowDT(!showDT)} style={{ width:'100%',background:'rgba(255,149,0,0.1)',border:'1px solid rgba(255,149,0,0.3)',borderRadius:6,padding:'9px',fontSize:12,fontWeight:700,color:'#ff9500',cursor:'pointer',fontFamily:'inherit' }}>✈ Direct To...</button>
              {showDT&&(
                <div style={{ marginTop:8,background:'#1e1e1e',borderRadius:6,overflow:'hidden',border:'1px solid #383838' }}>
                  {wptList.map(w=>(
                    <div key={w.uid} onClick={()=>onDirectTo(w.uid)} style={{ padding:'10px 12px',borderBottom:'1px solid #383838',cursor:'pointer',fontSize:12,fontFamily:'monospace',display:'flex',justifyContent:'space-between' }}>
                      <span style={{ color:w.custom?'#ff9500':'#999' }}>{w.name}</span>
                      <span style={{ color:'#555' }}>ETA {w.eta}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add Before/After */}
          <div style={{ borderTop:'1px solid #2a2a2a',paddingTop:12 }}>
            <button onClick={()=>setShowAdd(!showAdd)} style={{ width:'100%',background:showAdd?'rgba(255,149,0,0.1)':'#1f1f1f',border:`1px solid ${showAdd?'rgba(255,149,0,0.4)':'#383838'}`,borderRadius:6,padding:'9px',fontSize:12,fontWeight:700,color:showAdd?'#ff9500':'#555',cursor:'pointer',fontFamily:'inherit' }}>
              {showAdd?'✕ Cancel Add':'+ Add Waypoint'}
            </button>
            {showAdd&&(
              <div style={{ marginTop:10,display:'flex',flexDirection:'column',gap:10 }}>
                <div style={{ display:'flex',gap:6 }}>
                  {['before','after'].map(pos=>(
                    <button key={pos} onClick={()=>setAddPos(pos)} style={{ flex:1,background:addPos===pos?'rgba(255,149,0,0.15)':'#1f1f1f',border:`1px solid ${addPos===pos?'#ff9500':'#383838'}`,borderRadius:6,padding:'7px',fontSize:11,fontWeight:700,color:addPos===pos?'#ff9500':'#555',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase' }}>
                      {pos==='before'?'↑ Before':'↓ After'}
                    </button>
                  ))}
                </div>
                <div><div style={{ fontSize:10,color:'#ff9500',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Waypoint Name</div>
                  <input value={addName} onChange={e=>setAddName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6))} placeholder="e.g. ROMEO" maxLength={6}
                    style={{ width:'100%',background:'#1a1a1a',border:'1.5px solid #ff9500',borderRadius:6,padding:'9px 12px',fontSize:16,fontWeight:700,color:'#ff9500',fontFamily:'monospace',outline:'none',textAlign:'center',letterSpacing:2,boxSizing:'border-box' }}/>
                </div>
                <button onClick={handleAdd} disabled={addName.length<2} style={{ width:'100%',background:addName.length>=2?'#ff9500':'#2a2a2a',border:'none',borderRadius:7,padding:'9px',fontSize:13,fontWeight:700,color:addName.length>=2?'#fff':'#444',cursor:addName.length>=2?'pointer':'not-allowed',fontFamily:'inherit' }}>
                  Add {addPos==='before'?'Before':'After'} {wpt.name}
                </button>
              </div>
            )}
          </div>

          {wpt.custom&&(
            <div style={{ borderTop:'1px solid #2a2a2a',paddingTop:12 }}>
              <button onClick={onDelete} style={{ width:'100%',background:'rgba(224,32,32,0.08)',border:'1px solid rgba(224,32,32,0.3)',borderRadius:6,padding:'9px',fontSize:12,fontWeight:700,color:'#e02020',cursor:'pointer',fontFamily:'inherit' }}>🗑 Delete Waypoint</button>
            </div>
          )}
        </div>
        <div style={{ padding:'0 16px 16px',display:'flex',gap:8 }}>
          <button onClick={onClose} style={{ flex:1,background:'#2a2a2a',border:'1px solid #383838',borderRadius:7,padding:10,fontSize:13,color:'#666',cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
          <button onClick={()=>onSave({ata,fuel,rvsm})} style={{ flex:2,background:'#1a9bc4',border:'none',borderRadius:7,padding:10,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function DivertArptModal({ onClose, onAdd }) {
  const [name,setName]=useState('');
  return (
    <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100 }}>
      <div style={{ background:'#252525',border:'1px solid #e8731a55',borderRadius:12,width:300,overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f',padding:'10px 16px',borderBottom:'1px solid #383838',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ fontSize:12,fontWeight:700,color:'#e8731a' }}>⚠ Add Divert Airport</span>
          <span onClick={onClose} style={{ color:'#555',cursor:'pointer',fontSize:20,lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:10,color:'#e8731a',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:6 }}>Airport ICAO *</div>
          <input value={name} onChange={e=>setName(e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4))} placeholder="ICAO" maxLength={4}
            style={{ width:'100%',background:'#1a1a1a',border:'1.5px solid #e8731a',borderRadius:6,padding:'9px 12px',fontSize:16,fontWeight:700,color:'#e8731a',fontFamily:'monospace',outline:'none',textAlign:'center',letterSpacing:2 }}/>
        </div>
        <div style={{ padding:'0 16px 16px',display:'flex',gap:8 }}>
          <button onClick={onClose} style={{ flex:1,background:'#2a2a2a',border:'1px solid #383838',borderRadius:7,padding:10,fontSize:13,color:'#666',cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
          <button onClick={()=>{if(name.length===4)onAdd(name);}} disabled={name.length!==4}
            style={{ flex:2,background:'#e8731a',border:'none',borderRadius:7,padding:10,fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit',opacity:name.length!==4?0.5:1 }}>
            Add Divert
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NavLog Main ──────────────────────────────────────────────────────────────
function NavLog({ flightData, updateFlight, setStatus, activePlan, updateDivert }) {
  const planKey = activePlan?.id || 'default';
  const [entries,       setEntries]       = usePersistedState(`efb_navlog_entries_${planKey}`,       {});
  const [waypoints,     setWaypoints]     = usePersistedState(`efb_navlog_waypoints_${planKey}`,     []);
  const [directTo,      setDirectTo]      = usePersistedState(`efb_navlog_directTo_${planKey}`,      null);
  const [flightClosed,  setFlightClosed]  = usePersistedState(`efb_navlog_flightClosed_${planKey}`,  false);
  const [lastCheckTime, setLastCheckTime] = usePersistedState(`efb_navlog_lastCheckTime_${planKey}`, null);

  const [modal,setModal]=useState(null); const [showDivert,setShowDivert]=useState(false);
  const [alert50,setAlert50]=useState(false); const [acPosition,setAcPosition]=useState(null);
  const { pos, error:gpsError, active:gpsActive, start:startGPS, stop:stopGPS } = useGPS();
  const [gpsWarningAccepted,setGpsWarningAccepted]=useState(false);
  const [showGpsWarning,setShowGpsWarning]=useState(false);
  const handleStartGPS=()=>{ if(!gpsWarningAccepted){setShowGpsWarning(true);return;} startGPS(); };

  const dep  = activePlan?.dep  || 'DEP';
  const dest = activePlan?.dest || 'DEST';
  const std  = activePlan?.std  || '';

  useEffect(()=>{
    if(!pos){setAcPosition(null);return;}
    const cw=waypoints.map((w,i)=>({...w,idx:i})).filter(w=>w.coord);
    if(cw.length===0){setAcPosition(null);return;}
    const sorted=cw.map(w=>({...w,dist:haversine(pos.lat,pos.lon,w.coord.lat,w.coord.lon)})).sort((a,b)=>a.dist-b.dist);
    if(sorted.length===1){setAcPosition({prev:sorted[0].uid,next:null});return;}
    const top2=[sorted[0],sorted[1]].sort((a,b)=>a.idx-b.idx);
    setAcPosition({prev:top2[0].uid,next:top2[1].uid});
  },[pos,waypoints]);

  useEffect(()=>{
    if(!activePlan?.id){
      if(waypoints.length===0)setWaypoints([
        {uid:dep,name:dep,type:'dep',eta:std||'—',fl:'—',planFuel:null,custom:false,coord:null},
        {uid:dest,name:dest,type:'dest',eta:'—',fl:'—',planFuel:null,custom:false,coord:null},
      ]);
      return;
    }
    (async()=>{
      try{
        const{data}=await supabase.from('plan_versions').select('raw_text').eq('plan_id',activePlan.id).order('version_no',{ascending:false}).limit(1).single();
        if(data?.raw_text){
          const wpts=parseWaypoints(data.raw_text,dep,dest,std);
          const customWpts=waypoints.filter(w=>w.custom);
          if(wpts.length>=2){
            const destIdx=wpts.findIndex(w=>w.type==='dest');
            const merged=[...wpts];
            customWpts.forEach(cw=>{if(!merged.find(w=>w.uid===cw.uid))merged.splice(destIdx,0,cw);});
            setWaypoints(merged);
          }
        }
      }catch{
        if(waypoints.length===0)setWaypoints([
          {uid:dep,name:dep,type:'dep',eta:std||'—',fl:'—',planFuel:null,custom:false,coord:null},
          {uid:dest,name:dest,type:'dest',eta:'—',fl:'—',planFuel:null,custom:false,coord:null},
        ]);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activePlan?.id]);

  useEffect(()=>{
    if(!lastCheckTime)return;
    const iv=setInterval(()=>{if(Date.now()-lastCheckTime>=FIFTY_MIN)setAlert50(true);},10000);
    return()=>clearInterval(iv);
  },[lastCheckTime]);

  const depDone  = !!(entries[dep]  && (entries[dep].offBlock  || entries[dep].toTime));
  const destDone = !!(entries[dest] && (entries[dest].lndTime  || entries[dest].onBlock)) || flightClosed;

  useEffect(()=>{
    if(!setStatus)return;
    if(depDone&&destDone)setStatus('green');
    else if(depDone)setStatus('amber');
    else setStatus('pending');
  },[depDone,destDone,setStatus]);

  const updateEntry=(uid,data)=>setEntries(prev=>({...prev,[uid]:{...(prev[uid]||{}),...data}}));

  const handleDepSave=data=>{
    updateEntry(dep,data); updateFlight('offBlock',data.offBlock); updateFlight('takeoffTime',data.toTime); updateFlight('takeoffFuel',data.toFuel);
    setLastCheckTime(Date.now());
    if(data.offBlock)logEvent(activePlan?.id,'OFF_BLOCKS',{time:data.offBlock,role:'PIC'});
    if(data.toTime)logEvent(activePlan?.id,'TAKEOFF',{time:data.toTime,role:'PIC',fuel_lb:data.toFuel});
    setModal(null);
  };

  const handleArrivalSave=(uid,data)=>{
    updateEntry(uid,data); updateFlight('landingTime',data.lndTime); updateFlight('onBlock',data.onBlock); updateFlight('remainingFuel',data.remFuel);
    if(data.lndTime)logEvent(activePlan?.id,'LANDING',{time:data.lndTime,role:'PIC'});
    if(data.onBlock)logEvent(activePlan?.id,'ON_BLOCKS',{time:data.onBlock,role:'PIC'});
    if(data.remFuel)logEvent(activePlan?.id,'FUEL_REMAINING',{fuel_lb:data.remFuel});
    setModal(null);
  };

  const handleDivert=info=>{if(updateDivert){updateDivert('active',true);updateDivert('icao',info.icao);updateDivert('rwy',info.rwy||'');}};

  const handleWptSave=(uid,data)=>{
    updateEntry(uid,data); setLastCheckTime(Date.now()); setAlert50(false);
    if(data.rvsm)logEvent(activePlan?.id,'RVSM_CHECK',{waypoint:waypoints.find(w=>w.uid===uid)?.name,rvsm:data.rvsm,ata:data.ata,fuel_lb:data.fuel});
    setModal(null);
  };

  const handleDirectTo=(fromUid,toUid)=>{setDirectTo({from:fromUid,to:toUid});setModal(null);};
  const handleDeleteWpt=uid=>{setWaypoints(p=>p.filter(w=>w.uid!==uid));setEntries(p=>{const n={...p};delete n[uid];return n;});if(directTo?.from===uid||directTo?.to===uid)setDirectTo(null);setModal(null);};
  const handleAddWptAt=(newWpt,position,relativeUid)=>{setWaypoints(prev=>{const idx=prev.findIndex(w=>w.uid===relativeUid);if(idx===-1)return prev;const u=[...prev];u.splice(position==='before'?idx:idx+1,0,newWpt);return u;});setModal(null);};
  const handleAddDivertArpt=icao=>{const uid=`${icao}_divert_${Date.now()}`;setWaypoints(p=>[...p,{uid,name:icao,type:'divert-arpt',custom:true,eta:'—',fl:'—',planFuel:null,coord:null}]);setFlightClosed(true);if(updateDivert){updateDivert('active',true);updateDivert('icao',icao);}setShowDivert(false);};

  const isSkipped=(wpt,idx)=>{if(!directTo)return false;const fi=waypoints.findIndex(w=>w.uid===directTo.from);const ti=waypoints.findIndex(w=>w.uid===directTo.to);return idx>fi&&idx<ti;};

  // ── Auto ATA (T/O actual + planned offset) ────────────────────────────────
  const getAutoATA=(wpt,idx)=>{
    if(!wpt.eta||wpt.eta==='—')return null;
    const planEta=toMins(wpt.eta); if(planEta===null)return null;
    let refA=null,refP=null;
    const de=entries[dep]||{};
    if(de.toTime){const pTO=toMins(std),aTO=toMins(de.toTime);if(pTO!==null&&aTO!==null){refA=aTO;refP=pTO;}}
    for(let i=1;i<idx;i++){const w=waypoints[i];if(!w.eta||w.eta==='—')continue;const e=entries[w.uid]||{};if(!e.ata)continue;const aM=toMins(e.ata);const pM=toMins(w.eta);if(aM!==null&&pM!==null){refA=aM;refP=pM;}}
    if(refA===null)return null;
    return fromMins(planEta+(refA-refP));
  };

  const getDeviation=wpt=>{
    if(!wpt.eta||wpt.eta==='—')return null;
    const e=entries[wpt.uid]||{};
    const aT=wpt.type==='dep'?e.toTime:(wpt.type==='dest'||wpt.type==='divert-arpt')?e.lndTime:e.ata;
    if(!aT)return null;
    const pM=toMins(wpt.eta),aM=toMins(aT);
    if(pM===null||aM===null)return null;
    return aM-pM;
  };

  // ── Fuel calculations ─────────────────────────────────────────────────────
  const getBurnRate=()=>{
    const tf=activePlan?.trip_fuel?parseInt(activePlan.trip_fuel):null;
    const tm=toMins(activePlan?.eta)-toMins(std);
    if(!tf||!tm||tm<=0)return null; return tf/tm;
  };

  // getPlanFuelAt: OFP TFREM (most accurate) or burn rate fallback
  const getPlanFuelAt=wpt=>{
    if(wpt.planFuel)return wpt.planFuel;
    if(!wpt.eta||wpt.eta==='—')return null;
    const de=entries[dep]||{}; const toFuelNum=de.toFuel?parseInt(de.toFuel.replace(/,/g,'')):null;
    if(!toFuelNum)return null; const br=getBurnRate(); if(!br)return null;
    const elapsed=toMins(wpt.eta)-toMins(std); if(!elapsed||elapsed<=0)return null;
    return Math.round(toFuelNum-br*elapsed);
  };

  const getAutoFuel=(wpt,idx)=>{
    if(!wpt.eta||wpt.eta==='—')return null;
    const wptM=toMins(wpt.eta); if(wptM===null)return null;
    const br=getBurnRate(); if(!br)return null;
    const de=entries[dep]||{};
    let lastFuel=de.toFuel?parseInt(de.toFuel.replace(/,/g,'')):null;
    let lastM=toMins(std||'');
    for(let i=1;i<idx;i++){const w=waypoints[i];if(!w.eta||w.eta==='—')continue;const e=entries[w.uid]||{};if(!e.fuel)continue;const fn=parseInt(e.fuel.replace(/,/g,''));const em=toMins(w.eta);if(!isNaN(fn)&&em!==null){lastFuel=fn;lastM=em;}}
    if(lastFuel===null||lastM===null)return null;
    const elapsed=wptM-lastM; if(elapsed<=0)return null;
    const est=Math.round(lastFuel-br*elapsed); return est>0?est:null;
  };

  const getFuelDev=(wpt,actualNum)=>{
    if(!actualNum)return null;
    const planned=getPlanFuelAt(wpt); if(!planned)return null;
    return actualNum-planned;
  };

  const fmtFuelDev=dev=>{
    if(dev===null||dev===undefined)return null;
    if(Math.abs(dev)<50)return{label:'±0',color:'#2d9e5f'};
    if(dev>0)return{label:`+${dev.toLocaleString()}`,color:'#2d9e5f'};
    return{label:dev.toLocaleString(),color:'#e02020'};
  };

  const toFuelNum   = (()=>{const d=entries[dep];return d?.toFuel?parseInt(d.toFuel.replace(/,/g,'')):null;})();
  const lastCheckStr = lastCheckTime?new Date(lastCheckTime).toTimeString().slice(0,5)+' Z':'—';
  const modalWpt    = waypoints.find(w=>w.uid===modal);
  const hasCoords   = waypoints.some(w=>w.coord);

  return (
    <div style={{ display:'flex',flexDirection:'column',height:'100%' }}>

      {alert50&&(
        <div style={{ background:'rgba(224,32,32,0.12)',borderBottom:'1px solid rgba(224,32,32,0.3)',padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div><div style={{ fontSize:12,fontWeight:700,color:'#e02020' }}>FUEL & RVSM CHECK REQUIRED</div><div style={{ fontSize:10,color:'#888',marginTop:1 }}>50 minutes since last check</div></div>
          <button onClick={()=>setAlert50(false)} style={{ marginLeft:'auto',background:'transparent',border:'1px solid #555',borderRadius:5,padding:'3px 8px',fontSize:10,color:'#666',cursor:'pointer',fontFamily:'inherit' }}>Dismiss</button>
        </div>
      )}

      {hasCoords&&(
        <div style={{ background:gpsActive?'rgba(45,158,95,0.1)':'#1e1e1e',borderBottom:'1px solid #383838',padding:'7px 12px',display:'flex',alignItems:'center',gap:10,flexShrink:0 }}>
          <span style={{ fontSize:14 }}>✈</span>
          <div style={{ flex:1 }}>
            {gpsActive&&pos&&<span style={{ fontSize:10,color:'#2d9e5f',fontFamily:'monospace' }}>{pos.lat.toFixed(4)}N {pos.lon.toFixed(4)}E · ±{Math.round(pos.acc)}m{acPosition&&<span style={{ color:'#1a9bc4',marginLeft:8 }}>{waypoints.find(w=>w.uid===acPosition.prev)?.name}{acPosition.next?` ✈ ${waypoints.find(w=>w.uid===acPosition.next)?.name}`:' ✈'}</span>}</span>}
            {gpsActive&&!pos&&<span style={{ fontSize:10,color:'#555' }}>Acquiring GPS...</span>}
            {!gpsActive&&<span style={{ fontSize:10,color:'#555' }}>GPS position tracking</span>}
            {gpsError&&<span style={{ fontSize:10,color:'#e02020',marginLeft:8 }}>⚠ {gpsError}</span>}
          </div>
          <button onClick={gpsActive?stopGPS:handleStartGPS} style={{ background:gpsActive?'rgba(224,32,32,0.15)':'rgba(45,158,95,0.15)',border:`1px solid ${gpsActive?'#e02020':'#2d9e5f'}`,borderRadius:6,padding:'4px 10px',fontSize:10,fontWeight:700,color:gpsActive?'#e02020':'#2d9e5f',cursor:'pointer',fontFamily:'inherit' }}>
            {gpsActive?'Stop':'Start GPS'}
          </button>
        </div>
      )}

      {/* Summary */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:1,background:'#383838',borderBottom:'1px solid #383838',flexShrink:0 }}>
        {[
          {label:'T/O Fuel',value:toFuelNum?`${toFuelNum.toLocaleString()} lb`:'—',color:'#e8e8e8'},
          {label:'T/O Time',value:entries[dep]?.toTime||'—',color:'#1a9bc4'},
          {label:'Last Check',value:lastCheckStr,color:alert50?'#e02020':'#1a9bc4'},
        ].map((s,i)=>(
          <div key={i} style={{ background:'#2a2a2a',padding:'9px 12px' }}>
            <div style={{ fontSize:9,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:14,fontWeight:700,color:s.color,fontFamily:'monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Column headers */}
      <div style={{ display:'grid',gridTemplateColumns:'68px 48px 58px 40px 58px 50px 62px 1fr',background:'#1a1a1a',borderBottom:'1px solid #383838',padding:'5px 10px',flexShrink:0 }}>
        {['WPT','ETA','ATA +/-','FL','FUEL ACT','RVSM','FUEL DEV','STATUS'].map(h=>(
          <div key={h} style={{ fontSize:9,color:'#555',fontWeight:700,letterSpacing:0.5 }}>{h}</div>
        ))}
      </div>

      <div style={{ flex:1,overflowY:'auto' }}>
        {waypoints.length===0?(
          <div style={{ padding:20,textAlign:'center',color:'#444',fontSize:12 }}>Loading waypoints...</div>
        ):waypoints.map((wpt,idx)=>{
          const e=entries[wpt.uid]||{};
          const skipped=isSkipped(wpt,idx);
          const isDep=wpt.type==='dep';const isDest=wpt.type==='dest';const isDivArpt=wpt.type==='divert-arpt';const isArrival=isDest||isDivArpt;
          const isDone=isDep?!!(e.offBlock||e.toTime):isArrival?!!(e.lndTime||e.onBlock):!!(e.ata||e.fuel);
          const isActive=!isDone&&!skipped&&(idx===0||waypoints.slice(0,idx).every((w,wi)=>{const pe=entries[w.uid]||{};return w.type==='dep'?!!(pe.offBlock||pe.toTime):!!(pe.ata||pe.fuel||pe.lndTime)||isSkipped(w,wi);}));
          const rowBg=isDivArpt?'rgba(255,149,0,0.08)':skipped?'#1e1e1e':isDone?'#1f2a1f':isActive?'rgba(26,155,196,0.06)':'#242424';
          const borderLeft=isDivArpt?'3px solid #e8731a':isActive?'3px solid #1a9bc4':isDone?'3px solid #2d9e5f':'3px solid transparent';
          const nameColor=isDivArpt?'#e8731a':isDep||isDest?'#1a9bc4':isDone?'#2d9e5f':isActive?'#1a9bc4':wpt.custom?'#ff9500':'#666';

          const actualATA=isDep?e.toTime:isArrival?e.lndTime:e.ata;
          const autoATA=!actualATA?getAutoATA(wpt,idx):null;
          const deviation=getDeviation(wpt);
          const devFmt=fmtDev(deviation);
          const showAcAfter=gpsActive&&acPosition&&acPosition.prev===wpt.uid&&acPosition.next;

          const actualFuelStr=isDep?e.toFuel:isArrival?e.remFuel:e.fuel;
          const actualFuelNum=actualFuelStr?parseInt(actualFuelStr.replace(/,/g,'')):null;
          const autoFuelNum=!actualFuelNum&&!isDep?getAutoFuel(wpt,idx):null;
          const planFuel=getPlanFuelAt(wpt);
          const fuelDev=!isDep&&!isArrival?fmtFuelDev(getFuelDev(wpt,actualFuelNum)):null;

          return(
            <React.Fragment key={wpt.uid}>
              <div onClick={()=>!skipped&&setModal(wpt.uid)}
                style={{ display:'grid',gridTemplateColumns:'68px 48px 58px 40px 58px 50px 62px 1fr',padding:'9px 10px',borderBottom:'1px solid #383838',background:rowBg,borderLeft,cursor:skipped?'default':'pointer',opacity:skipped?0.3:1,alignItems:'center' }}>

                {/* WPT */}
                <div>
                  <div style={{ fontSize:12,fontWeight:700,fontFamily:'monospace',color:nameColor }}>{wpt.name}</div>
                  {isDivArpt&&<div style={{ fontSize:8,color:'#e8731a',marginTop:1 }}>DIVERT</div>}
                  {wpt.custom&&!isDivArpt&&<div style={{ fontSize:8,color:'#ff9500',marginTop:1 }}>ADDED</div>}
                </div>

                {/* ETA (plan) */}
                <div style={{ fontSize:11,color:wpt.eta!=='—'?'#666':'#333',fontFamily:'monospace' }}>{wpt.eta}</div>

                {/* ATA + deviation */}
                <div style={{ fontSize:11,fontFamily:'monospace' }}>
                  {actualATA?(
                    <div>
                      <span style={{ color:'#2d9e5f',fontWeight:700 }}>{actualATA}</span>
                      {devFmt&&<span style={{ fontSize:9,color:devFmt.color,marginLeft:3,fontWeight:700 }}>{devFmt.label}</span>}
                    </div>
                  ):autoATA?(
                    <div>
                      <span style={{ color:'#555',fontStyle:'italic' }}>{autoATA}</span>
                      <span style={{ fontSize:8,color:'#444',marginLeft:2 }}>est</span>
                    </div>
                  ):<span style={{ color:'#333' }}>—</span>}
                </div>

                {/* FL */}
                <div style={{ fontSize:11,color:'#777',fontFamily:'monospace' }}>{wpt.fl}</div>

                {/* Actual fuel */}
                <div style={{ fontSize:11,fontFamily:'monospace' }}>
                  {actualFuelNum?(
                    <div>
                      <span style={{ color:'#2d9e5f',fontWeight:700 }}>{actualFuelNum.toLocaleString()}</span>
                      {planFuel&&!isDep&&!isArrival&&<div style={{ fontSize:9,color:'#444' }}>p:{planFuel.toLocaleString()}</div>}
                    </div>
                  ):autoFuelNum?(
                    <span style={{ color:'#555',fontStyle:'italic' }}>{autoFuelNum.toLocaleString()}<span style={{ fontSize:8,color:'#444',marginLeft:2 }}>est</span></span>
                  ):<span style={{ color:'#333' }}>—</span>}
                </div>

                {/* RVSM */}
                <div style={{ fontSize:10,color:e.rvsm?'#2d9e5f':'#444',fontFamily:'monospace' }}>
                  {e.rvsm?e.rvsm.split('/')[0]+'…':(isDep||isArrival?'N/A':'—')}
                </div>

                {/* Fuel deviation vs plan */}
                <div style={{ fontSize:11,fontFamily:'monospace' }}>
                  {fuelDev?(
                    <span style={{ color:fuelDev.color,fontWeight:700,fontSize:10 }}>{fuelDev.label}</span>
                  ):!isDep&&!isArrival&&planFuel&&!actualFuelNum?(
                    <span style={{ color:'#333',fontSize:10 }}>p:{planFuel.toLocaleString()}</span>
                  ):<span style={{ color:'#333' }}>—</span>}
                </div>

                {/* Status */}
                <div style={{ textAlign:'right' }}>
                  {skipped?<span style={{ fontSize:9,color:'#444' }}>SKIP</span>
                  :isDone?<span style={{ fontSize:10,fontWeight:700,color:'#2d9e5f',background:'rgba(45,158,95,0.12)',padding:'2px 6px',borderRadius:3 }}>✓ DONE</span>
                  :isActive?<span style={{ fontSize:10,fontWeight:700,color:'#1a9bc4',background:'rgba(26,155,196,0.12)',padding:'2px 6px',borderRadius:3 }}>● ACTIVE</span>
                  :<span style={{ fontSize:9,color:'#444' }}>Pending</span>}
                </div>
              </div>

              {showAcAfter&&(
                <div style={{ display:'flex',alignItems:'center',padding:'6px 10px',background:'rgba(45,158,95,0.07)',borderBottom:'1px solid rgba(45,158,95,0.2)',borderLeft:'3px solid #2d9e5f' }}>
                  <span style={{ fontSize:16,marginRight:8 }}>✈</span>
                  <span style={{ fontSize:11,fontWeight:700,color:'#2d9e5f',fontFamily:'monospace' }}>{pos?.lat.toFixed(4)}N {pos?.lon.toFixed(4)}E</span>
                  <span style={{ fontSize:10,color:'#555',marginLeft:8 }}>±{pos?Math.round(pos.acc):'—'}m</span>
                  <span style={{ marginLeft:'auto',fontSize:9,fontWeight:700,color:'#2d9e5f',background:'rgba(45,158,95,0.15)',padding:'2px 8px',borderRadius:3 }}>AIRCRAFT</span>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {!flightClosed&&(
          <div style={{ padding:'10px' }}>
            <button onClick={()=>setShowDivert(true)} style={{ width:'100%',background:'rgba(232,115,26,0.08)',border:'1px solid rgba(232,115,26,0.3)',borderRadius:7,padding:'10px',fontSize:11,fontWeight:700,color:'#e8731a',cursor:'pointer',fontFamily:'inherit' }}>⚠ Add Divert ARPT</button>
          </div>
        )}
        {flightClosed&&<div style={{ margin:'10px',padding:'8px 12px',borderRadius:6,background:'rgba(255,149,0,0.08)',border:'1px solid rgba(255,149,0,0.2)',fontSize:11,color:'#e8731a',textAlign:'center' }}>⚠ Flight closed at divert airport</div>}
      </div>

      {showGpsWarning&&(
        <div style={{ position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
          <div style={{ background:'#1a1a1a',border:'2px solid #e8731a',borderRadius:12,width:340,overflow:'hidden' }}>
            <div style={{ background:'rgba(232,115,26,0.15)',padding:'14px 16px',borderBottom:'1px solid #e8731a',display:'flex',alignItems:'center',gap:10 }}>
              <span style={{ fontSize:22 }}>⚠️</span>
              <div><div style={{ fontSize:13,fontWeight:700,color:'#e8731a' }}>NOT FOR NAVIGATION</div><div style={{ fontSize:10,color:'#888',marginTop:2 }}>AMC 20-25 Compliance Notice</div></div>
            </div>
            <div style={{ padding:'16px',fontSize:12,color:'#ccc',lineHeight:1.8 }}>
              GPS display is for situational awareness only — <b style={{ color:'#fff' }}>NOT for primary navigation</b>. Per EASA AMC 20-25, navigate using certified aircraft systems only.
            </div>
            <div style={{ padding:'0 16px 16px',display:'flex',gap:8 }}>
              <button onClick={()=>setShowGpsWarning(false)} style={{ flex:1,background:'#2a2a2a',border:'1px solid #383838',borderRadius:7,padding:10,fontSize:12,color:'#666',cursor:'pointer',fontFamily:'inherit' }}>Cancel</button>
              <button onClick={()=>{setGpsWarningAccepted(true);setShowGpsWarning(false);startGPS();logEvent(activePlan?.id,'GPS_ACTIVATED',{notice:'NOT_FOR_NAVIGATION_acknowledged'});}}
                style={{ flex:2,background:'#e8731a',border:'none',borderRadius:7,padding:10,fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit' }}>
                I Understand — Activate GPS
              </button>
            </div>
          </div>
        </div>
      )}

      <SyncButton/>

      {modal===dep&&<DepModal dep={dep} onClose={()=>setModal(null)} onSave={handleDepSave} initial={entries[dep]||{}}/>}

      {modal&&modal!==dep&&modalWpt&&(modalWpt.type==='dest'||modalWpt.type==='divert-arpt')&&(
        <ArrivalModal wptName={modalWpt.name} isDivert={modalWpt.type==='divert-arpt'} onClose={()=>setModal(null)} onSave={data=>handleArrivalSave(modal,data)} onDivert={handleDivert} initial={entries[modal]||{}}/>
      )}

      {modal&&modal!==dep&&modalWpt&&modalWpt.type==='wpt'&&(()=>{
        const wptIdx=waypoints.findIndex(w=>w.uid===modal);
        const afterWpt=waypoints.filter((w,i)=>i>wptIdx&&w.type!=='dest'&&w.type!=='divert-arpt');
        return(
          <WptModal wpt={modalWpt} onClose={()=>setModal(null)}
            onSave={data=>handleWptSave(modal,data)}
            onDirectTo={toUid=>handleDirectTo(modal,toUid)}
            onAddWpt={(newWpt,position)=>handleAddWptAt(newWpt,position,modal)}
            onDelete={()=>handleDeleteWpt(modal)}
            initial={entries[modal]||{}}
            wptList={afterWpt}
            estimatedATA={getAutoATA(modalWpt,wptIdx)}
            estimatedFuel={getAutoFuel(modalWpt,wptIdx)}
            plannedFuel={getPlanFuelAt(modalWpt)}
          />
        );
      })()}

      {showDivert&&<DivertArptModal onClose={()=>setShowDivert(false)} onAdd={handleAddDivertArpt}/>}
    </div>
  );
}

export default NavLog;