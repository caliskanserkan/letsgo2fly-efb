import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';

const FIFTY_MIN = 50 * 60 * 1000;

function parseCoord(str) {
  const m = str.match(/N(\d+):(\d+\.?\d*)\s*E(\d+):(\d+\.?\d*)/i);
  if (!m) return null;
  return {
    lat: parseFloat(m[1]) + parseFloat(m[2]) / 60,
    lon: parseFloat(m[3]) + parseFloat(m[4]) / 60,
  };
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function parseWaypoints(rawText, dep, dest, std) {
  if (!rawText || !dep || !dest) return [];
  const depPattern = new RegExp(`DEP\\s+${dep}\\/\\S+[^\\n]*\\n([\\s\\S]*?)(?=DEST\\s+${dest}\\/)`, 'i');
  const sectionMatch = rawText.match(depPattern);
  const section = sectionMatch?.[1] || '';
  const depCoordMatch = rawText.match(new RegExp(`DEP\\s+${dep}\\/\\S+[^\\n]*(N\\d+:\\d+\\.?\\d*\\s*E\\d+:\\d+\\.?\\d*)`, 'i'));
  const depCoord = depCoordMatch ? parseCoord(depCoordMatch[1]) : null;
  const destCoordMatch = rawText.match(new RegExp(`DEST\\s+${dest}\\/\\S+[^\\n]*(N\\d+:\\d+\\.?\\d*\\s*E\\d+:\\d+\\.?\\d*)`, 'i'));
  const destCoord = destCoordMatch ? parseCoord(destCoordMatch[1]) : null;
  const wptList = [];
  if (section) {
    for (const line of section.split('\n')) {
      if (!line.trim() || line.match(/-TOC-|-TOD-/)) continue;
      const m = line.match(/^\s*\d+\s+([A-Z][A-Z0-9]{1,5})\s/);
      if (m) wptList.push({ name: m[1], coord: parseCoord(line) });
    }
  }
  const waypoints = [];
  waypoints.push({ uid: dep,  name: dep,  type: 'dep',  eta: std || '—', fl: '—', planFuel: null, custom: false, coord: depCoord });
  wptList.forEach(w => waypoints.push({ uid: w.name, name: w.name, type: 'wpt', eta: '—', fl: '—', planFuel: null, custom: false, coord: w.coord }));
  waypoints.push({ uid: dest, name: dest, type: 'dest', eta: '—', fl: '—', planFuel: null, custom: false, coord: destCoord });
  return waypoints;
}

function useGPS() {
  const [pos, setPos] = useState(null);
  const [error, setError] = useState(null);
  const watchId = useRef(null);
  const start = () => {
    if (!navigator.geolocation) { setError('GPS not supported'); return; }
    watchId.current = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => setError(e.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };
  const stop = () => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null; setPos(null); setError(null);
    }
  };
  useEffect(() => () => stop(), []); // eslint-disable-line
  return { pos, error, active: watchId.current !== null, start, stop };
}

function getFuelDestColor(fuel) {
  if (!fuel) return '#999';
  if (fuel < 4000) return '#e02020';
  if (fuel < 5000) return '#e8731a';
  if (fuel < 6000) return '#f0c040';
  return '#2d9e5f';
}

function TimeBox({ value, onChange, placeholder }) {
  const handleChange = (e) => {
    let v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
    onChange(v);
  };
  return (
    <input value={value} onChange={handleChange} placeholder={placeholder || 'HH:MM'} maxLength={5}
      style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'center' }} />
  );
}

function FuelBox({ value, onChange, placeholder }) {
  return (
    <input value={value} onChange={e => onChange(e.target.value.replace(/[^0-9,]/g, ''))} placeholder={placeholder || 'lb'}
      style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'center' }} />
  );
}

function RvsmBoxes({ value, onChange }) {
  const parts = (value || '//').split('/');
  const pri1 = parts[0] || '', sby = parts[1] || '', pri2 = parts[2] || '';
  const ref2 = useRef(null), ref3 = useRef(null);
  const update = (p1, p2, p3) => onChange(`${p1}/${p2}/${p3}`);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {[
        { label:'PRI 1', ref:null, value:pri1, onChange:(e) => { const v=e.target.value.replace(/[^0-9]/g,'').slice(0,5); update(v,sby,pri2); if(v.length===5) ref2.current?.focus(); } },
        { label:'SBY',   ref:ref2, value:sby,  onChange:(e) => { const v=e.target.value.replace(/[^0-9]/g,'').slice(0,5); update(pri1,v,pri2); if(v.length===5) ref3.current?.focus(); } },
        { label:'PRI 2', ref:ref3, value:pri2, onChange:(e) => { const v=e.target.value.replace(/[^0-9]/g,'').slice(0,5); update(pri1,sby,v); } },
      ].map(f => (
        <div key={f.label} style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:10, color:'#555', fontWeight:700, textTransform:'uppercase', width:40, flexShrink:0 }}>{f.label}</div>
          <input ref={f.ref} value={f.value} onChange={f.onChange} placeholder="00000" maxLength={5}
            style={{ flex:1, background:'#1a1a1a', border:'1.5px solid rgba(45,158,95,0.6)', borderRadius:6, padding:'8px 10px', fontSize:14, fontWeight:700, color:'#2d9e5f', fontFamily:'monospace', outline:'none', textAlign:'center' }} />
          <span style={{ fontSize:10, color:'#555', width:16, flexShrink:0 }}>ft</span>
        </div>
      ))}
    </div>
  );
}

// ─── Dep Modal ────────────────────────────────────────────────────────────────
function DepModal({ dep, onClose, onSave, initial }) {
  const [offBlock, setOffBlock] = useState(initial.offBlock || '');
  const [toTime,   setToTime]   = useState(initial.toTime   || '');
  const [toFuel,   setToFuel]   = useState(initial.toFuel   || '');
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:320, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1a9bc4' }}>{dep} — Departure Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Off Block</div><TimeBox value={offBlock} onChange={setOffBlock} /></div>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>T/O Time</div><TimeBox value={toTime} onChange={setToTime} /></div>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>T/O Fuel</div><FuelBox value={toFuel} onChange={setToFuel} placeholder="lb" /></div>
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onSave({ offBlock, toTime, toFuel })} style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Arrival Modal ────────────────────────────────────────────────────────────
function ArrivalModal({ wptName, isDivert, onClose, onSave, onDivert, initial }) {
  const [lndTime,    setLndTime]    = useState(initial.lndTime  || '');
  const [onBlock,    setOnBlock]    = useState(initial.onBlock   || '');
  const [remFuel,    setRemFuel]    = useState(initial.remFuel   || '');
  const [doDiv,      setDoDiv]      = useState(false);
  const [divertIcao, setDivertIcao] = useState('');
  const [divertRwy,  setDivertRwy]  = useState('');
  const handleSave = () => {
    if (doDiv && divertIcao.length === 4 && onDivert) onDivert({ icao: divertIcao, rwy: divertRwy });
    onSave({ lndTime, onBlock, remFuel });
  };
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:`1px solid ${isDivert ? '#e8731a55' : '#383838'}`, borderRadius:12, width:320, overflow:'hidden', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color: isDivert ? '#e8731a' : '#1a9bc4' }}>{wptName} — Arrival Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Landing Time</div><TimeBox value={lndTime} onChange={setLndTime} /></div>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>On Block</div><TimeBox value={onBlock} onChange={setOnBlock} /></div>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Remaining Fuel</div><FuelBox value={remFuel} onChange={setRemFuel} /></div>
          {!isDivert && (
            <div style={{ borderTop:'1px solid #383838', paddingTop:12 }}>
              <div onClick={() => setDoDiv(!doDiv)}
                style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', padding:'8px 10px', borderRadius:7, background: doDiv ? 'rgba(255,149,0,0.1)' : '#1f1f1f', border:`1px solid ${doDiv ? 'rgba(255,149,0,0.4)' : '#383838'}` }}>
                <span style={{ fontSize:12, fontWeight:700, color: doDiv ? '#e8731a' : '#555' }}>⚠ DIVERT</span>
                <div style={{ width:36, height:20, background: doDiv ? '#e8731a' : '#333', borderRadius:10, position:'relative', transition:'background 0.2s' }}>
                  <div style={{ position:'absolute', width:16, height:16, background:'#fff', borderRadius:8, top:2, left: doDiv ? 18 : 2, transition:'left 0.2s' }} />
                </div>
              </div>
              {doDiv && (
                <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:10 }}>
                  <div>
                    <div style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Divert ICAO *</div>
                    <input value={divertIcao} onChange={e => setDivertIcao(e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0,4))} placeholder="ICAO" maxLength={4}
                      style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #e8731a', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#e8731a', fontFamily:'monospace', outline:'none', textAlign:'center', letterSpacing:2 }} />
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Runway</div>
                    <input value={divertRwy} onChange={e => setDivertRwy(e.target.value.toUpperCase())} placeholder="e.g. 27L"
                      style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #e8731a', borderRadius:6, padding:'9px 12px', fontSize:14, fontWeight:700, color:'#e8731a', fontFamily:'monospace', outline:'none', textAlign:'center' }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={doDiv && divertIcao.length !== 4}
            style={{ flex:2, background: doDiv ? '#e8731a' : '#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', opacity: doDiv && divertIcao.length !== 4 ? 0.5 : 1 }}>
            {doDiv ? '⚠ Save + Divert' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Wpt Modal (Add Before/After dahil) ──────────────────────────────────────
function WptModal({ wpt, onClose, onSave, onDirectTo, onAddWpt, initial, wptList }) {
  const [ata,     setAta]     = useState(initial.ata  || '');
  const [fuel,    setFuel]    = useState(initial.fuel || '');
  const [rvsm,    setRvsm]    = useState(initial.rvsm || '');
  const [showDT,  setShowDT]  = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addPos,  setAddPos]  = useState('after');
  const [addName, setAddName] = useState('');

  const handleAdd = () => {
    if (addName.length < 2) return;
    const uid = `${addName}_${Date.now()}`;
    onAddWpt({ uid, name: addName, type: 'wpt', custom: true, eta: '—', fl: '—', planFuel: null, coord: null }, addPos);
    setAddName(''); setShowAdd(false);
  };

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:320, overflow:'hidden', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color: wpt.custom ? '#ff9500' : '#1a9bc4' }}>{wpt.name} — Waypoint Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>

        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          {/* ATA */}
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>ATA</div>
            <TimeBox value={ata} onChange={setAta} />
          </div>

          {/* Fuel */}
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Fuel Remaining</div>
            <FuelBox value={fuel} onChange={setFuel} />
          </div>

          {/* RVSM */}
          {!wpt.custom && (
            <div>
              <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>RVSM Altimeter Check</div>
              <RvsmBoxes value={rvsm} onChange={setRvsm} />
            </div>
          )}

          {/* Direct To */}
          {!wpt.custom && wptList.length > 0 && (
            <div>
              <button onClick={() => setShowDT(!showDT)}
                style={{ width:'100%', background:'rgba(255,149,0,0.1)', border:'1px solid rgba(255,149,0,0.3)', borderRadius:6, padding:'9px', fontSize:12, fontWeight:700, color:'#ff9500', cursor:'pointer', fontFamily:'inherit' }}>
                ✈ Direct To...
              </button>
              {showDT && (
                <div style={{ marginTop:8, background:'#1e1e1e', borderRadius:6, overflow:'hidden', border:'1px solid #383838' }}>
                  {wptList.map(w => (
                    <div key={w.uid} onClick={() => onDirectTo(w.uid)}
                      style={{ padding:'10px 12px', borderBottom:'1px solid #383838', cursor:'pointer', fontSize:12, color:'#999', fontFamily:'monospace', display:'flex', justifyContent:'space-between' }}>
                      <span>{w.name}</span>
                      <span style={{ color:'#555' }}>ETA {w.eta}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add Before / After */}
          <div style={{ borderTop:'1px solid #2a2a2a', paddingTop:12 }}>
            <button onClick={() => setShowAdd(!showAdd)}
              style={{ width:'100%', background: showAdd ? 'rgba(255,149,0,0.1)' : '#1f1f1f', border:`1px solid ${showAdd ? 'rgba(255,149,0,0.4)' : '#383838'}`, borderRadius:6, padding:'9px', fontSize:12, fontWeight:700, color: showAdd ? '#ff9500' : '#555', cursor:'pointer', fontFamily:'inherit' }}>
              {showAdd ? '✕ Cancel Add' : '+ Add Waypoint'}
            </button>

            {showAdd && (
              <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:10 }}>
                {/* Before / After toggle */}
                <div style={{ display:'flex', gap:6 }}>
                  {['before', 'after'].map(pos => (
                    <button key={pos} onClick={() => setAddPos(pos)}
                      style={{ flex:1, background: addPos === pos ? 'rgba(255,149,0,0.15)' : '#1f1f1f', border:`1px solid ${addPos === pos ? '#ff9500' : '#383838'}`, borderRadius:6, padding:'7px', fontSize:11, fontWeight:700, color: addPos === pos ? '#ff9500' : '#555', cursor:'pointer', fontFamily:'inherit', textTransform:'uppercase' }}>
                      {pos === 'before' ? '↑ Before' : '↓ After'}
                    </button>
                  ))}
                </div>

                {/* Name input */}
                <div>
                  <div style={{ fontSize:10, color:'#ff9500', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Waypoint Name</div>
                  <input
                    value={addName}
                    onChange={e => setAddName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    placeholder="e.g. ROMEO"
                    maxLength={6}
                    style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #ff9500', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#ff9500', fontFamily:'monospace', outline:'none', textAlign:'center', letterSpacing:2, boxSizing:'border-box' }}
                  />
                </div>

                <div style={{ fontSize:10, color:'#444', lineHeight:1.5, padding:'4px 2px' }}>
                  ⚠ Konumu hava haritası üzerinden doğrulayın. Airway/WPT veritabanı kullanılmıyor.
                </div>

                <button
                  onClick={handleAdd}
                  disabled={addName.length < 2}
                  style={{ width:'100%', background: addName.length >= 2 ? '#ff9500' : '#2a2a2a', border:'none', borderRadius:7, padding:'9px', fontSize:13, fontWeight:700, color: addName.length >= 2 ? '#fff' : '#444', cursor: addName.length >= 2 ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
                  Add {addPos === 'before' ? 'Before' : 'After'} {wpt.name}
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onSave({ ata, fuel, rvsm })} style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Divert Airport Modal ─────────────────────────────────────────────────────
function DivertArptModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #e8731a55', borderRadius:12, width:300, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#e8731a' }}>⚠ Add Divert Airport</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px' }}>
          <div style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Airport ICAO *</div>
          <input value={name} onChange={e => setName(e.target.value.toUpperCase().replace(/[^A-Z]/g,'').slice(0, 4))}
            placeholder="ICAO" maxLength={4}
            style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #e8731a', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#e8731a', fontFamily:'monospace', outline:'none', textAlign:'center', letterSpacing:2 }} />
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => { if (name.length === 4) onAdd(name); }}
            disabled={name.length !== 4}
            style={{ flex:2, background:'#e8731a', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', opacity: name.length !== 4 ? 0.5 : 1 }}>
            Add Divert
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NavLog Main ──────────────────────────────────────────────────────────────
function NavLog({ flightData, updateFlight, setStatus, activePlan, updateDivert }) {
  const [entries,       setEntries]       = usePersistedState('efb_navlog_entries',       {});
  const [waypoints,     setWaypoints]     = usePersistedState('efb_navlog_waypoints',     []);
  const [directTo,      setDirectTo]      = usePersistedState('efb_navlog_directTo',      null);
  const [flightClosed,  setFlightClosed]  = usePersistedState('efb_navlog_flightClosed',  false);
  const [lastCheckTime, setLastCheckTime] = usePersistedState('efb_navlog_lastCheckTime', null);

  const [modal,      setModal]      = useState(null); // wpt.uid
  const [showDivert, setShowDivert] = useState(false);
  const [alert50,    setAlert50]    = useState(false);
  // GPS uçak pozisyonu: { prev: uid, next: uid } — iki waypoint arası
  const [acPosition, setAcPosition] = useState(null);

  const { pos, error: gpsError, active: gpsActive, start: startGPS, stop: stopGPS } = useGPS();

  const dep  = activePlan?.dep  || 'DEP';
  const dest = activePlan?.dest || 'DEST';
  const std  = activePlan?.std  || '';

  // GPS → en yakın iki waypoint arası hesapla
  useEffect(() => {
    if (!pos) { setAcPosition(null); return; }
    const coordWpts = waypoints
      .map((w, i) => ({ ...w, idx: i }))
      .filter(w => w.coord);
    if (coordWpts.length === 0) { setAcPosition(null); return; }
    const sorted = coordWpts
      .map(w => ({ ...w, dist: haversine(pos.lat, pos.lon, w.coord.lat, w.coord.lon) }))
      .sort((a, b) => a.dist - b.dist);
    if (sorted.length === 1) {
      setAcPosition({ prev: sorted[0].uid, next: null });
      return;
    }
    // En yakın 2 noktayı liste sırasına göre sırala (prev önce, next sonra)
    const top2 = [sorted[0], sorted[1]].sort((a, b) => a.idx - b.idx);
    setAcPosition({ prev: top2[0].uid, next: top2[1].uid });
  }, [pos, waypoints]);

  useEffect(() => {
    if (!activePlan?.id) {
      if (waypoints.length === 0) setWaypoints([
        { uid: dep,  name: dep,  type: 'dep',  eta: std || '—', fl: '—', planFuel: null, custom: false, coord: null },
        { uid: dest, name: dest, type: 'dest', eta: '—',        fl: '—', planFuel: null, custom: false, coord: null },
      ]);
      return;
    }
    const fetchRaw = async () => {
      try {
        const { data } = await supabase
          .from('plan_versions').select('raw_text')
          .eq('plan_id', activePlan.id).order('version_no', { ascending: false }).limit(1).single();
        if (data?.raw_text) {
          const wpts = parseWaypoints(data.raw_text, dep, dest, std);
          const customWpts = waypoints.filter(w => w.custom);
          if (wpts.length >= 2) {
            const destIdx = wpts.findIndex(w => w.type === 'dest');
            const merged = [...wpts];
            customWpts.forEach(cw => { if (!merged.find(w => w.uid === cw.uid)) merged.splice(destIdx, 0, cw); });
            setWaypoints(merged);
          }
        }
      } catch {
        if (waypoints.length === 0) setWaypoints([
          { uid: dep,  name: dep,  type: 'dep',  eta: std || '—', fl: '—', planFuel: null, custom: false, coord: null },
          { uid: dest, name: dest, type: 'dest', eta: '—',        fl: '—', planFuel: null, custom: false, coord: null },
        ]);
      }
    };
    fetchRaw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id]);

  useEffect(() => {
    if (!lastCheckTime) return;
    const interval = setInterval(() => { if (Date.now() - lastCheckTime >= FIFTY_MIN) setAlert50(true); }, 10000);
    return () => clearInterval(interval);
  }, [lastCheckTime]);

  const depDone  = !!(entries[dep]  && (entries[dep].offBlock  || entries[dep].toTime));
  const destDone = !!(entries[dest] && (entries[dest].lndTime  || entries[dest].onBlock)) || flightClosed;

  useEffect(() => {
    if (!setStatus) return;
    if (depDone && destDone) setStatus('green');
    else if (depDone)        setStatus('amber');
    else                     setStatus('pending');
  }, [depDone, destDone, setStatus]);

  const updateEntry = (uid, data) => setEntries(prev => ({ ...prev, [uid]: { ...(prev[uid] || {}), ...data } }));

  const handleDepSave = (data) => {
    updateEntry(dep, data);
    updateFlight('offBlock', data.offBlock);
    updateFlight('takeoffTime', data.toTime);
    updateFlight('takeoffFuel', data.toFuel);
    setLastCheckTime(Date.now());
    setModal(null);
  };

  const handleArrivalSave = (uid, data) => {
    updateEntry(uid, data);
    updateFlight('landingTime', data.lndTime);
    updateFlight('onBlock', data.onBlock);
    updateFlight('remainingFuel', data.remFuel);
    setModal(null);
  };

  const handleDivert = (info) => {
    if (updateDivert) { updateDivert('active', true); updateDivert('icao', info.icao); updateDivert('rwy', info.rwy || ''); }
  };

  const handleWptSave = (uid, data) => {
    updateEntry(uid, data);
    setLastCheckTime(Date.now());
    setAlert50(false);
    setModal(null);
  };

  const handleDirectTo = (fromUid, toUid) => { setDirectTo({ from: fromUid, to: toUid }); setModal(null); };

  // WptModal'dan Add Before/After
  const handleAddWptAt = (newWpt, position, relativeUid) => {
    setWaypoints(prev => {
      const idx = prev.findIndex(w => w.uid === relativeUid);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated.splice(position === 'before' ? idx : idx + 1, 0, newWpt);
      return updated;
    });
    setModal(null);
  };

  const handleAddDivertArpt = (icao) => {
    const uid = `${icao}_divert_${Date.now()}`;
    setWaypoints(prev => [...prev, { uid, name: icao, type: 'divert-arpt', custom: true, eta: '—', fl: '—', planFuel: null, coord: null }]);
    setFlightClosed(true);
    if (updateDivert) { updateDivert('active', true); updateDivert('icao', icao); }
    setShowDivert(false);
  };

  const getToFuel    = () => { const d = entries[dep]; return d?.toFuel ? parseInt(d.toFuel.replace(/,/g,'')) : null; };
  const getFuelAtWpt = (wpt) => { const e = entries[wpt.uid]; if (!e?.fuel) return null; return parseInt(e.fuel.replace(/,/g,'')); };
  const isSkipped    = (wpt, idx) => {
    if (!directTo) return false;
    const fromIdx = waypoints.findIndex(w => w.uid === directTo.from);
    const toIdx   = waypoints.findIndex(w => w.uid === directTo.to);
    return idx > fromIdx && idx < toIdx;
  };

  const toFuel       = getToFuel();
  const lastCheckStr = lastCheckTime ? new Date(lastCheckTime).toTimeString().slice(0,5) + ' Z' : '—';
  const modalWpt     = waypoints.find(w => w.uid === modal);
  const hasCoords    = waypoints.some(w => w.coord);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {alert50 && (
        <div style={{ background:'rgba(224,32,32,0.12)', borderBottom:'1px solid rgba(224,32,32,0.3)', padding:'10px 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#e02020' }}>FUEL & RVSM CHECK REQUIRED</div>
            <div style={{ fontSize:10, color:'#888', marginTop:1 }}>50 minutes since last check</div>
          </div>
          <button onClick={() => setAlert50(false)} style={{ marginLeft:'auto', background:'transparent', border:'1px solid #555', borderRadius:5, padding:'3px 8px', fontSize:10, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Dismiss</button>
        </div>
      )}

      {hasCoords && (
        <div style={{ background: gpsActive ? 'rgba(45,158,95,0.1)' : '#1e1e1e', borderBottom:'1px solid #383838', padding:'7px 12px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontSize:14 }}>✈</span>
          <div style={{ flex:1 }}>
            {gpsActive && pos && (
              <span style={{ fontSize:10, color:'#2d9e5f', fontFamily:'monospace' }}>
                {pos.lat.toFixed(4)}N {pos.lon.toFixed(4)}E · ±{Math.round(pos.acc)}m
                {acPosition && (
                  <span style={{ color:'#1a9bc4', marginLeft:8 }}>
                    {waypoints.find(w=>w.uid===acPosition.prev)?.name}
                    {acPosition.next ? ` ✈ ${waypoints.find(w=>w.uid===acPosition.next)?.name}` : ' ✈'}
                  </span>
                )}
              </span>
            )}
            {gpsActive && !pos && <span style={{ fontSize:10, color:'#555' }}>Acquiring GPS...</span>}
            {!gpsActive && <span style={{ fontSize:10, color:'#555' }}>GPS position tracking</span>}
            {gpsError && <span style={{ fontSize:10, color:'#e02020', marginLeft:8 }}>⚠ {gpsError}</span>}
          </div>
          <button onClick={gpsActive ? stopGPS : startGPS}
            style={{ background: gpsActive ? 'rgba(224,32,32,0.15)' : 'rgba(45,158,95,0.15)', border:`1px solid ${gpsActive ? '#e02020' : '#2d9e5f'}`, borderRadius:6, padding:'4px 10px', fontSize:10, fontWeight:700, color: gpsActive ? '#e02020' : '#2d9e5f', cursor:'pointer', fontFamily:'inherit' }}>
            {gpsActive ? 'Stop' : 'Start GPS'}
          </button>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'#383838', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {[
          { label:'T/O Fuel',   value: toFuel ? `${toFuel.toLocaleString()} lb` : '—', color:'#e8e8e8' },
          { label:'T/O Time',   value: entries[dep]?.toTime || '—', color:'#1a9bc4' },
          { label:'Last Check', value: lastCheckStr, color: alert50 ? '#e02020' : '#1a9bc4' },
        ].map((s, i) => (
          <div key={i} style={{ background:'#2a2a2a', padding:'9px 12px' }}>
            <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'70px 50px 50px 45px 60px 60px 60px 1fr', background:'#1a1a1a', borderBottom:'1px solid #383838', padding:'6px 10px', flexShrink:0 }}>
        {['WPT','ETA','ATA','FL','FUEL REM','RVSM','FUEL DST','STATUS'].map(h => (
          <div key={h} style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.5 }}>{h}</div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        {waypoints.length === 0 ? (
          <div style={{ padding:20, textAlign:'center', color:'#444', fontSize:12 }}>Loading waypoints...</div>
        ) : waypoints.map((wpt, idx) => {
          const e          = entries[wpt.uid] || {};
          const skipped    = isSkipped(wpt, idx);
          const isDep      = wpt.type === 'dep';
          const isDest     = wpt.type === 'dest';
          const isDivArpt  = wpt.type === 'divert-arpt';
          const isArrival  = isDest || isDivArpt;
          const isDone     = isDep ? !!(e.offBlock || e.toTime) : isArrival ? !!(e.lndTime || e.onBlock) : !!(e.ata || e.fuel);
          const isActive   = !isDone && !skipped && (idx === 0 || waypoints.slice(0, idx).every((w, wi) => {
            const pe = entries[w.uid] || {};
            return w.type === 'dep' ? !!(pe.offBlock || pe.toTime) : !!(pe.ata || pe.fuel || pe.lndTime) || isSkipped(w, wi);
          }));
          const fuelAtDest = getFuelAtWpt(wpt);
          const fuelColor  = getFuelDestColor(fuelAtDest);
          const rowBg      = isDivArpt ? 'rgba(255,149,0,0.08)' : skipped ? '#1e1e1e' : isDone ? '#1f2a1f' : isActive ? 'rgba(26,155,196,0.06)' : '#242424';
          const borderLeft = isDivArpt ? '3px solid #e8731a' : isActive ? '3px solid #1a9bc4' : isDone ? '3px solid #2d9e5f' : '3px solid transparent';
          const nameColor  = isDivArpt ? '#e8731a' : isDep||isDest ? '#1a9bc4' : isDone ? '#2d9e5f' : isActive ? '#1a9bc4' : wpt.custom ? '#ff9500' : '#666';
          const rvsmDisp   = e.rvsm ? e.rvsm.split('/')[0] + '…' : (isDep || isArrival ? 'N/A' : '—');

          // Bu satırdan SONRA uçak simgesi eklenecek mi?
          const showAcAfter = gpsActive && acPosition && acPosition.prev === wpt.uid && acPosition.next;

          return (
            <React.Fragment key={wpt.uid}>
              <div onClick={() => !skipped && setModal(wpt.uid)}
                style={{ display:'grid', gridTemplateColumns:'70px 50px 50px 45px 60px 60px 60px 1fr', padding:'10px', borderBottom:'1px solid #383838', background:rowBg, borderLeft, cursor: skipped ? 'default' : 'pointer', opacity: skipped ? 0.3 : 1, alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, fontFamily:'monospace', color: nameColor }}>
                    {wpt.name}
                  </div>
                  {isDivArpt && <div style={{ fontSize:8, color:'#e8731a', marginTop:1 }}>DIVERT</div>}
                  {wpt.custom && !isDivArpt && <div style={{ fontSize:8, color:'#ff9500', marginTop:1 }}>ADDED</div>}
                  {directTo?.from === wpt.uid && directTo?.to && <div style={{ fontSize:9, color:'#ff9500', marginTop:1 }}>→ {waypoints.find(w=>w.uid===directTo.to)?.name}</div>}
                </div>
                <div style={{ fontSize:11, color:'#555', fontFamily:'monospace' }}>{wpt.eta}</div>
                <div style={{ fontSize:11, fontFamily:'monospace', color: isDone ? '#2d9e5f' : '#444' }}>
                  {isDep ? (e.toTime||'—') : isArrival ? (e.lndTime||'—') : (e.ata||'—')}
                </div>
                <div style={{ fontSize:11, color:'#777', fontFamily:'monospace' }}>{wpt.fl}</div>
                <div style={{ fontSize:11, fontFamily:'monospace', color: isDone ? '#2d9e5f' : '#444' }}>
                  {isDep ? (e.toFuel ? parseInt(e.toFuel.replace(/,/g,'')).toLocaleString() : '—')
                  : isArrival ? (e.remFuel ? parseInt(e.remFuel.replace(/,/g,'')).toLocaleString() : '—')
                  : (e.fuel ? parseInt(e.fuel.replace(/,/g,'')).toLocaleString() : '—')}
                </div>
                <div style={{ fontSize:10, color: e.rvsm ? '#2d9e5f' : '#444', fontFamily:'monospace' }}>{rvsmDisp}</div>
                <div style={{ fontSize:11, fontWeight: fuelAtDest ? 700 : 400, color: fuelAtDest ? fuelColor : '#333', fontFamily:'monospace' }}>
                  {fuelAtDest ? fuelAtDest.toLocaleString() : '—'}
                </div>
                <div style={{ textAlign:'right' }}>
                  {skipped   ? <span style={{ fontSize:9, color:'#444' }}>SKIP</span>
                  : isDone   ? <span style={{ fontSize:10, fontWeight:700, color:'#2d9e5f', background:'rgba(45,158,95,0.12)', padding:'2px 6px', borderRadius:3 }}>✓ DONE</span>
                  : isActive ? <span style={{ fontSize:10, fontWeight:700, color:'#1a9bc4', background:'rgba(26,155,196,0.12)', padding:'2px 6px', borderRadius:3 }}>● ACTIVE</span>
                  : <span style={{ fontSize:9, color:'#444' }}>Pending</span>}
                </div>
              </div>

              {/* ✈ Uçak pozisyon satırı — prev'den sonra, next'ten önce */}
              {showAcAfter && (
                <div style={{ display:'flex', alignItems:'center', padding:'6px 10px', background:'rgba(45,158,95,0.07)', borderBottom:'1px solid rgba(45,158,95,0.2)', borderLeft:'3px solid #2d9e5f' }}>
                  <span style={{ fontSize:16, marginRight:8 }}>✈</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#2d9e5f', fontFamily:'monospace' }}>
                      {pos?.lat.toFixed(4)}N {pos?.lon.toFixed(4)}E
                    </span>
                    <span style={{ fontSize:10, color:'#555', marginLeft:8 }}>±{pos ? Math.round(pos.acc) : '—'}m</span>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, color:'#2d9e5f', background:'rgba(45,158,95,0.15)', padding:'2px 8px', borderRadius:3 }}>
                    AIRCRAFT
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}

        {/* Sadece ⚠ Add Divert ARPT */}
        {!flightClosed && (
          <div style={{ padding:'10px' }}>
            <button onClick={() => setShowDivert(true)}
              style={{ width:'100%', background:'rgba(232,115,26,0.08)', border:'1px solid rgba(232,115,26,0.3)', borderRadius:7, padding:'10px', fontSize:11, fontWeight:700, color:'#e8731a', cursor:'pointer', fontFamily:'inherit' }}>
              ⚠ Add Divert ARPT
            </button>
          </div>
        )}
        {flightClosed && (
          <div style={{ margin:'10px', padding:'8px 12px', borderRadius:6, background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.2)', fontSize:11, color:'#e8731a', textAlign:'center' }}>
            ⚠ Flight closed at divert airport
          </div>
        )}
      </div>

      <SyncButton />

      {modal === dep && (
        <DepModal dep={dep} onClose={() => setModal(null)} onSave={handleDepSave} initial={entries[dep] || {}} />
      )}

      {modal && modal !== dep && modalWpt && (modalWpt.type === 'dest' || modalWpt.type === 'divert-arpt') && (
        <ArrivalModal
          wptName={modalWpt.name}
          isDivert={modalWpt.type === 'divert-arpt'}
          onClose={() => setModal(null)}
          onSave={(data) => handleArrivalSave(modal, data)}
          onDivert={handleDivert}
          initial={entries[modal] || {}}
        />
      )}

      {modal && modal !== dep && modalWpt && modalWpt.type === 'wpt' && (() => {
        const wptIdx   = waypoints.findIndex(w => w.uid === modal);
        const afterWpt = waypoints.filter((w, i) => i > wptIdx && w.type !== 'dest' && w.type !== 'divert-arpt');
        return (
          <WptModal
            wpt={modalWpt}
            onClose={() => setModal(null)}
            onSave={(data) => handleWptSave(modal, data)}
            onDirectTo={(toUid) => handleDirectTo(modal, toUid)}
            onAddWpt={(newWpt, position) => handleAddWptAt(newWpt, position, modal)}
            initial={entries[modal] || {}}
            wptList={afterWpt}
          />
        );
      })()}

      {showDivert && <DivertArptModal onClose={() => setShowDivert(false)} onAdd={handleAddDivertArpt} />}
    </div>
  );
}

export default NavLog;