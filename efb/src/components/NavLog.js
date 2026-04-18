import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import SyncButton from './SyncButton';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const FIFTY_MIN = 50 * 60 * 1000;

// ─── Waypoint parser ──────────────────────────────────────────────────────────
function parseWaypoints(rawText, dep, dest, std) {
  if (!rawText || !dep || !dest) return [];

  // Find coordinate list section between DEP XXXX/ and DEST XXXX/
  // Format: "DEP   LTAC/ESB   ANKARA/ESENBOGA   N40:07.7   E032:59.7"
  //         "1   C3558   SID WAYPOINT   N40:07.4   E032:59.7"
  //         "DEST   LTAS/ONQ   ZONGULDAK/CAYCU   N41:30.4   E032:05.4"
  const depPattern = new RegExp(
    `DEP\\s+${dep}\\/\\S+[^\\n]*\\n([\\s\\S]*?)(?=DEST\\s+${dest}\\/)`,
    'i'
  );
  const sectionMatch = rawText.match(depPattern);
  const section = sectionMatch?.[1] || '';

  const wptNames = [];

  if (section) {
    const lines = section.split('\n');
    for (const line of lines) {
      if (!line.trim() || line.match(/-TOC-|-TOD-/)) continue;
      // Match: "1   C3558   SID WAYPOINT" or "4   GUMRU   GUMRU"
      const m = line.match(/^\s*\d+\s+([A-Z][A-Z0-9]{1,5})\s/);
      if (m) wptNames.push(m[1]);
    }
  }

  const waypoints = [];
  waypoints.push({ id: dep,  name: dep,  type: 'dep',  eta: std || '—', fl: '—', planFuel: null, custom: false });
  wptNames.forEach(name => {
    waypoints.push({ id: name, name, type: 'wpt', eta: '—', fl: '—', planFuel: null, custom: false });
  });
  waypoints.push({ id: dest, name: dest, type: 'dest', eta: '—', fl: '—', planFuel: null, custom: false });

  return waypoints;
}

function getFuelDestColor(fuel) {
  if (!fuel) return '#999';
  if (fuel < 4000) return '#e02020';
  if (fuel < 5000) return '#e8731a';
  if (fuel < 6000) return '#f0c040';
  return '#2d9e5f';
}

// ─── Input components ─────────────────────────────────────────────────────────
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
  const pri1 = parts[0] || '';
  const sby  = parts[1] || '';
  const pri2 = parts[2] || '';
  const ref2 = useRef(null);
  const ref3 = useRef(null);
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

// ─── Modals ───────────────────────────────────────────────────────────────────
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

function ArrivalModal({ wptName, isDivert, onClose, onSave, onDivert, initial }) {
  const [lndTime,    setLndTime]    = useState(initial.lndTime  || '');
  const [onBlock,    setOnBlock]    = useState(initial.onBlock   || '');
  const [remFuel,    setRemFuel]    = useState(initial.remFuel   || '');
  const [doDiv,      setDoDiv]      = useState(false);
  const [divertIcao, setDivertIcao] = useState('');
  const [divertRwy,  setDivertRwy]  = useState('');

  const handleSave = () => {
    if (doDiv && divertIcao.length === 4 && onDivert) {
      onDivert({ icao: divertIcao, rwy: divertRwy });
    }
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

          {/* Divert toggle — only for planned dest */}
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
                  <div style={{ padding:'7px 10px', borderRadius:5, background:'rgba(255,149,0,0.08)', fontSize:10, color:'#c4882a' }}>
                    ⚠ Landing page will auto-activate divert.
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

function WptModal({ wpt, onClose, onSave, onDirectTo, initial, wptList }) {
  const [ata,    setAta]    = useState(initial.ata  || '');
  const [fuel,   setFuel]   = useState(initial.fuel || '');
  const [rvsm,   setRvsm]   = useState(initial.rvsm || '');
  const [showDT, setShowDT] = useState(false);
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:320, overflow:'hidden', maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color: wpt.custom ? '#ff9500' : '#1a9bc4' }}>{wpt.name} — Waypoint Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>ATA</div><TimeBox value={ata} onChange={setAta} /></div>
          <div><div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Fuel Remaining</div><FuelBox value={fuel} onChange={setFuel} /></div>
          {!wpt.custom && (
            <div>
              <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>RVSM Altimeter Check</div>
              <RvsmBoxes value={rvsm} onChange={setRvsm} />
            </div>
          )}
          {!wpt.custom && wptList.length > 0 && (
            <div>
              <button onClick={() => setShowDT(!showDT)}
                style={{ width:'100%', background:'rgba(255,149,0,0.1)', border:'1px solid rgba(255,149,0,0.3)', borderRadius:6, padding:'9px', fontSize:12, fontWeight:700, color:'#ff9500', cursor:'pointer', fontFamily:'inherit' }}>
                ✈ Direct To...
              </button>
              {showDT && (
                <div style={{ marginTop:8, background:'#1e1e1e', borderRadius:6, overflow:'hidden', border:'1px solid #383838' }}>
                  {wptList.map(w => (
                    <div key={w.id} onClick={() => onDirectTo(w.id)}
                      style={{ padding:'10px 12px', borderBottom:'1px solid #383838', cursor:'pointer', fontSize:12, color:'#999', fontFamily:'monospace', display:'flex', justifyContent:'space-between' }}>
                      <span>{w.name}</span>
                      <span style={{ color:'#555' }}>ETA {w.eta}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onSave({ ata, fuel, rvsm })} style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

function AddWptModal({ onClose, onAdd, type }) {
  const [name, setName] = useState('');
  const isArpt = type === 'arpt';
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:`1px solid ${isArpt ? '#e8731a55' : '#ff950044'}`, borderRadius:12, width:300, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color: isArpt ? '#e8731a' : '#ff9500' }}>
            {isArpt ? '⚠ Add Divert Airport' : '+ Add Waypoint'}
          </span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          <div>
            <div style={{ fontSize:10, color: isArpt ? '#e8731a' : '#ff9500', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>
              {isArpt ? 'Airport ICAO *' : 'Waypoint Name'}
            </div>
            <input value={name} onChange={e => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0, isArpt ? 4 : 6))}
              placeholder={isArpt ? 'ICAO' : 'e.g. ROMEO'} maxLength={isArpt ? 4 : 6}
              style={{ width:'100%', background:'#1a1a1a', border:`1.5px solid ${isArpt ? '#e8731a' : '#ff9500'}`, borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color: isArpt ? '#e8731a' : '#ff9500', fontFamily:'monospace', outline:'none', textAlign:'center', letterSpacing:2 }} />
          </div>
          {isArpt && (
            <div style={{ padding:'7px 10px', borderRadius:5, background:'rgba(255,149,0,0.08)', fontSize:10, color:'#c4882a' }}>
              ⚠ Flight closes at this airport. Divert activates automatically on Landing page.
            </div>
          )}
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => { if (name.length >= 2) onAdd({ id: name, name, type: isArpt ? 'divert-arpt' : 'wpt', custom: true, eta:'—', fl:'—', planFuel:null, isArpt }); }}
            disabled={name.length < (isArpt ? 4 : 2)}
            style={{ flex:2, background: isArpt ? '#e8731a' : '#ff9500', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', opacity: name.length < (isArpt ? 4 : 2) ? 0.5 : 1 }}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NavLog Main ──────────────────────────────────────────────────────────────
function NavLog({ flightData, updateFlight, setStatus, activePlan, updateDivert }) {
  const [entries, setEntries]           = useState({});
  const [modal, setModal]               = useState(null);
  const [directTo, setDirectTo]         = useState(null);
  const [alert50, setAlert50]           = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(null);
  const [waypoints, setWaypoints]       = useState([]);
  const [addModal, setAddModal]         = useState(null);
  const [flightClosed, setFlightClosed] = useState(false);

  const dep  = activePlan?.dep  || 'DEP';
  const dest = activePlan?.dest || 'DEST';
  const std  = activePlan?.std  || '';

  useEffect(() => {
    if (!activePlan?.id) {
      setWaypoints([
        { id: dep,  name: dep,  type: 'dep',  eta: std || '—', fl: '—', planFuel: null, custom: false },
        { id: dest, name: dest, type: 'dest', eta: '—',        fl: '—', planFuel: null, custom: false },
      ]);
      return;
    }
    const fetchRaw = async () => {
      const { data } = await supabase
        .from('plan_versions')
        .select('raw_text')
        .eq('plan_id', activePlan.id)
        .order('version_no', { ascending: false })
        .limit(1)
        .single();
      if (data?.raw_text) {
        const wpts = parseWaypoints(data.raw_text, dep, dest, std);
        setWaypoints(wpts.length >= 2 ? wpts : [
          { id: dep,  name: dep,  type: 'dep',  eta: std || '—', fl: '—', planFuel: null, custom: false },
          { id: dest, name: dest, type: 'dest', eta: '—',        fl: '—', planFuel: null, custom: false },
        ]);
      }
    };
    fetchRaw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id]);

  useEffect(() => {
    setEntries({});
    setDirectTo(null);
    setAlert50(false);
    setLastCheckTime(null);
    setFlightClosed(false);
  }, [activePlan?.id]);

  useEffect(() => {
    if (!lastCheckTime) return;
    const interval = setInterval(() => {
      if (Date.now() - lastCheckTime >= FIFTY_MIN) setAlert50(true);
    }, 10000);
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

  const updateEntry = (id, data) =>
    setEntries(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...data } }));

  const handleDepSave = (data) => {
    updateEntry(dep, data);
    updateFlight('offBlock',    data.offBlock);
    updateFlight('takeoffTime', data.toTime);
    updateFlight('takeoffFuel', data.toFuel);
    setLastCheckTime(Date.now());
    setModal(null);
  };

  const handleArrivalSave = (wptId, data) => {
    updateEntry(wptId, data);
    updateFlight('landingTime',   data.lndTime);
    updateFlight('onBlock',       data.onBlock);
    updateFlight('remainingFuel', data.remFuel);
    setModal(null);
  };

  const handleDivert = (divertInfo) => {
    if (updateDivert) {
      updateDivert('active', true);
      updateDivert('icao',   divertInfo.icao);
      updateDivert('rwy',    divertInfo.rwy || '');
    }
  };

  const handleWptSave = (id, data) => {
    updateEntry(id, data);
    setLastCheckTime(Date.now());
    setAlert50(false);
    setModal(null);
  };

  const handleDirectTo = (fromId, toId) => {
    setDirectTo({ from: fromId, to: toId });
    setModal(null);
  };

  const handleAddWpt = (wpt) => {
    setWaypoints(prev => {
      const destIdx = prev.findIndex(w => w.type === 'dest');
      const updated = [...prev];
      updated.splice(destIdx, 0, wpt);
      return updated;
    });
    if (wpt.isArpt) {
      setFlightClosed(true);
      if (updateDivert) {
        updateDivert('active', true);
        updateDivert('icao', wpt.id);
      }
    }
    setAddModal(null);
  };

  const getToFuel = () => {
    const d = entries[dep];
    return d?.toFuel ? parseInt(d.toFuel.replace(/,/g,'')) : null;
  };

  const getFuelAtDest = (wpt) => {
    const e = entries[wpt.id];
    if (!e?.fuel) return null;
    return parseInt(e.fuel.replace(/,/g,''));
  };

  const isSkipped = (wpt, idx) => {
    if (!directTo) return false;
    const fromIdx = waypoints.findIndex(w => w.id === directTo.from);
    const toIdx   = waypoints.findIndex(w => w.id === directTo.to);
    return idx > fromIdx && idx < toIdx;
  };

  const toFuel       = getToFuel();
  const lastCheckStr = lastCheckTime ? new Date(lastCheckTime).toTimeString().slice(0,5) + ' Z' : '—';
  const modalWpt     = waypoints.find(w => w.id === modal);

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
          const e         = entries[wpt.id] || {};
          const skipped   = isSkipped(wpt, idx);
          const isDep     = wpt.type === 'dep';
          const isDest    = wpt.type === 'dest';
          const isDivArpt = wpt.type === 'divert-arpt';
          const isArrival = isDest || isDivArpt;
          const isDone    = isDep     ? !!(e.offBlock || e.toTime)
                          : isArrival ? !!(e.lndTime  || e.onBlock)
                          : !!(e.ata  || e.fuel);
          const isActive  = !isDone && !skipped && (idx === 0 || waypoints.slice(0, idx).every((w, wi) => {
            const pe = entries[w.id] || {};
            return w.type === 'dep' ? !!(pe.offBlock || pe.toTime)
                                    : !!(pe.ata || pe.fuel || pe.lndTime) || isSkipped(w, wi);
          }));
          const fuelAtDest = getFuelAtDest(wpt);
          const fuelColor  = getFuelDestColor(fuelAtDest);
          const rowBg      = isDivArpt ? 'rgba(255,149,0,0.08)' : skipped ? '#1e1e1e' : isDone ? '#1f2a1f' : isActive ? 'rgba(26,155,196,0.06)' : '#242424';
          const borderLeft = isDivArpt ? '3px solid #e8731a' : isActive ? '3px solid #1a9bc4' : isDone ? '3px solid #2d9e5f' : '3px solid transparent';
          const nameColor  = isDivArpt ? '#e8731a' : isDep||isDest ? '#1a9bc4' : isDone ? '#2d9e5f' : isActive ? '#1a9bc4' : wpt.custom ? '#ff9500' : '#666';
          const rvsmDisp   = e.rvsm ? e.rvsm.split('/')[0] + '…' : (isDep || isArrival ? 'N/A' : '—');

          return (
            <div key={wpt.id + idx} onClick={() => !skipped && setModal(wpt.id)}
              style={{ display:'grid', gridTemplateColumns:'70px 50px 50px 45px 60px 60px 60px 1fr', padding:'10px', borderBottom:'1px solid #383838', background:rowBg, borderLeft, cursor: skipped ? 'default' : 'pointer', opacity: skipped ? 0.3 : 1, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:700, fontFamily:'monospace', color: nameColor }}>{wpt.name}</div>
                {isDivArpt && <div style={{ fontSize:8, color:'#e8731a', marginTop:1 }}>DIVERT</div>}
                {wpt.custom && !isDivArpt && <div style={{ fontSize:8, color:'#ff9500', marginTop:1 }}>ADDED</div>}
                {directTo?.from === wpt.id && <div style={{ fontSize:9, color:'#ff9500', marginTop:1 }}>→ {directTo.to}</div>}
              </div>
              <div style={{ fontSize:11, color:'#555', fontFamily:'monospace' }}>{wpt.eta}</div>
              <div style={{ fontSize:11, fontFamily:'monospace', color: isDone ? '#2d9e5f' : '#444' }}>
                {isDep ? (e.toTime||'—') : isArrival ? (e.lndTime||'—') : (e.ata||'—')}
              </div>
              <div style={{ fontSize:11, color:'#777', fontFamily:'monospace' }}>{wpt.fl}</div>
              <div style={{ fontSize:11, fontFamily:'monospace', color: isDone ? '#2d9e5f' : '#444' }}>
                {isDep     ? (e.toFuel  ? parseInt(e.toFuel.replace(/,/g,'')).toLocaleString()  : '—')
                : isArrival ? (e.remFuel ? parseInt(e.remFuel.replace(/,/g,'')).toLocaleString() : '—')
                :              (e.fuel   ? parseInt(e.fuel.replace(/,/g,'')).toLocaleString()    : '—')}
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
          );
        })}

        {/* Add buttons */}
        {!flightClosed && (
          <div style={{ display:'flex', gap:8, padding:'10px' }}>
            <button onClick={() => setAddModal('wpt')}
              style={{ flex:1, background:'rgba(255,149,0,0.08)', border:'1px solid rgba(255,149,0,0.3)', borderRadius:7, padding:'8px', fontSize:11, fontWeight:700, color:'#ff9500', cursor:'pointer', fontFamily:'inherit' }}>
              + Add WP
            </button>
            <button onClick={() => setAddModal('arpt')}
              style={{ flex:1, background:'rgba(232,115,26,0.08)', border:'1px solid rgba(232,115,26,0.3)', borderRadius:7, padding:'8px', fontSize:11, fontWeight:700, color:'#e8731a', cursor:'pointer', fontFamily:'inherit' }}>
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

      {/* Modals */}
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
        const wptIdx   = waypoints.indexOf(modalWpt);
        const afterWpt = waypoints.filter((w, i) => i > wptIdx && w.type !== 'dest' && w.type !== 'divert-arpt');
        return (
          <WptModal
            wpt={modalWpt}
            onClose={() => setModal(null)}
            onSave={(data) => handleWptSave(modal, data)}
            onDirectTo={(toId) => handleDirectTo(modal, toId)}
            initial={entries[modal] || {}}
            wptList={afterWpt}
          />
        );
      })()}
      {addModal && (
        <AddWptModal type={addModal} onClose={() => setAddModal(null)} onAdd={handleAddWpt} />
      )}
    </div>
  );
}

export default NavLog;