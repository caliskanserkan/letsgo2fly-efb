import React, { useState, useEffect, useRef } from 'react';
import SyncButton from './SyncButton';

const FIFTY_MIN = 50 * 60 * 1000;

const WAYPOINTS = [
  { id:'LTAC',  name:'LTAC',  type:'dep',  eta:'09:05', fl:'—',   planFuel:12600 },
  { id:'UMRUN', name:'UMRUN', type:'wpt',  eta:'09:15', fl:'280', planFuel:11266 },
  { id:'TOKER', name:'TOKER', type:'wpt',  eta:'09:22', fl:'280', planFuel:10792 },
  { id:'BA997', name:'BA997', type:'wpt',  eta:'09:33', fl:'280', planFuel:10334 },
  { id:'VAZZO', name:'VAZZO', type:'wpt',  eta:'09:44', fl:'280', planFuel:10003 },
  { id:'LTBA',  name:'LTBA',  type:'dest', eta:'09:48', fl:'—',   planFuel:9887  },
];

function getFuelDestColor(fuel) {
  if (!fuel) return '#999';
  if (fuel < 4000) return '#e02020';
  if (fuel < 5000) return '#e8731a';
  if (fuel < 6000) return '#f0c040';
  return '#2d9e5f';
}

// ── Auto-format time input: "0928" → "09:28" ──────────
function TimeBox({ value, onChange, placeholder }) {
  const handleChange = (e) => {
    let v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
    onChange(v);
  };
  return (
    <input
      value={value}
      onChange={handleChange}
      placeholder={placeholder || 'HH:MM'}
      maxLength={5}
      style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'center' }}
    />
  );
}

// ── Fuel input box ────────────────────────────────────
function FuelBox({ value, onChange, placeholder }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value.replace(/[^0-9,]/g, ''))}
      placeholder={placeholder || 'lb'}
      style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'9px 12px', fontSize:16, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'center' }}
    />
  );
}

// ── RVSM 3-box auto-advance: 5 digits each ───────────
function RvsmBoxes({ value, onChange }) {
  // value stored as "29000/29010/29000"
  const parts = (value || '//').split('/');
  const pri1 = parts[0] || '';
  const sby  = parts[1] || '';
  const pri2 = parts[2] || '';

  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const ref3 = useRef(null);

  const update = (p1, p2, p3) => onChange(`${p1}/${p2}/${p3}`);

  const handleP1 = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
    update(v, sby, pri2);
    if (v.length === 5) ref2.current && ref2.current.focus();
  };
  const handleSby = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
    update(pri1, v, pri2);
    if (v.length === 5) ref3.current && ref3.current.focus();
  };
  const handleP2 = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
    update(pri1, sby, v);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {[
        { label:'PRI 1', ref:ref1, value:pri1, onChange:handleP1 },
        { label:'SBY',   ref:ref2, value:sby,  onChange:handleSby },
        { label:'PRI 2', ref:ref3, value:pri2, onChange:handleP2 },
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

// ── DEP Modal ────────────────────────────────────────
function DepModal({ onClose, onSave, initial }) {
  const [offBlock, setOffBlock] = useState(initial.offBlock || '');
  const [toTime,   setToTime]   = useState(initial.toTime   || '');
  const [toFuel,   setToFuel]   = useState(initial.toFuel   || '');

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:320, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1a9bc4' }}>LTAC — Departure Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Off Block</div>
            <TimeBox value={offBlock} onChange={setOffBlock} />
          </div>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>T/O Time</div>
            <TimeBox value={toTime} onChange={setToTime} />
          </div>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>T/O Fuel</div>
            <FuelBox value={toFuel} onChange={setToFuel} placeholder="lb" />
          </div>
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onSave({ offBlock, toTime, toFuel })}
            style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── DEST Modal ───────────────────────────────────────
function DestModal({ onClose, onSave, initial }) {
  const [lndTime, setLndTime] = useState(initial.lndTime || '');
  const [onBlock, setOnBlock] = useState(initial.onBlock  || '');
  const [remFuel, setRemFuel] = useState(initial.remFuel  || '');

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:320, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1a9bc4' }}>LTBA — Arrival Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Landing Time</div>
            <TimeBox value={lndTime} onChange={setLndTime} />
          </div>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>On Block</div>
            <TimeBox value={onBlock} onChange={setOnBlock} />
          </div>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Remaining Fuel</div>
            <FuelBox value={remFuel} onChange={setRemFuel} />
          </div>
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onSave({ lndTime, onBlock, remFuel })}
            style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── WPT Modal ────────────────────────────────────────
function WptModal({ wpt, onClose, onSave, onDirectTo, initial, wptList }) {
  const [ata,    setAta]    = useState(initial.ata  || '');
  const [fuel,   setFuel]   = useState(initial.fuel || '');
  const [rvsm,   setRvsm]   = useState(initial.rvsm || '');
  const [showDT, setShowDT] = useState(false);

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:320, overflow:'hidden', maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1a9bc4' }}>{wpt.name} — Waypoint Data</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'14px 16px', display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>ATA</div>
            <TimeBox value={ata} onChange={setAta} />
          </div>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>Fuel Remaining</div>
            <FuelBox value={fuel} onChange={setFuel} />
          </div>
          <div>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6 }}>RVSM Altimeter Check</div>
            <RvsmBoxes value={rvsm} onChange={setRvsm} />
          </div>
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
        </div>
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={() => onSave({ ata, fuel, rvsm })}
            style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── NavLog Main ──────────────────────────────────────
function NavLog({ flightData, updateFlight }) {
  const [entries, setEntries]             = useState({});
  const [modal, setModal]                 = useState(null);
  const [directTo, setDirectTo]           = useState(null);
  const [alert50, setAlert50]             = useState(false);
  const [lastCheckTime, setLastCheckTime] = useState(null);

  useEffect(() => {
    if (!lastCheckTime) return;
    const interval = setInterval(() => {
      if (Date.now() - lastCheckTime >= FIFTY_MIN) {
        setAlert50(true);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [lastCheckTime]);

  const updateEntry = (id, data) => {
    setEntries(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...data } }));
  };

  const handleDepSave = (data) => {
    updateEntry('LTAC', data);
    updateFlight('offBlock',    data.offBlock);
    updateFlight('takeoffTime', data.toTime);
    updateFlight('takeoffFuel', data.toFuel);
    setLastCheckTime(Date.now());
    setModal(null);
  };

  const handleDestSave = (data) => {
    updateEntry('LTBA', data);
    updateFlight('landingTime',   data.lndTime);
    updateFlight('onBlock',       data.onBlock);
    updateFlight('remainingFuel', data.remFuel);
    setModal(null);
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

  const getToFuel = () => {
    const dep = entries['LTAC'];
    return dep && dep.toFuel ? parseInt(dep.toFuel.replace(/,/g,'')) : null;
  };

  const getFuelAtDest = (wpt) => {
    const e = entries[wpt.id];
    if (!e || !e.fuel) return null;
    return parseInt(e.fuel.replace(/,/g,''));
  };

  const isSkipped = (wpt, idx) => {
    if (!directTo) return false;
    const fromIdx = WAYPOINTS.findIndex(w => w.id === directTo.from);
    const toIdx   = WAYPOINTS.findIndex(w => w.id === directTo.to);
    return idx > fromIdx && idx < toIdx;
  };

  const toFuel = getToFuel();
  const lastCheckStr = lastCheckTime
    ? new Date(lastCheckTime).toTimeString().slice(0,5) + ' Z'
    : '—';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>

      {/* 50min alert */}
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

      {/* Summary bar */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:1, background:'#383838', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {[
          { label:'T/O Fuel',   value: toFuel ? `${toFuel.toLocaleString()} lb` : '—', color:'#e8e8e8' },
          { label:'T/O Time',   value: entries['LTAC'] ? (entries['LTAC'].toTime || '—') : '—', color:'#1a9bc4' },
          { label:'Last Check', value: lastCheckStr, color: alert50 ? '#e02020' : '#1a9bc4' },
        ].map((s, i) => (
          <div key={i} style={{ background:'#2a2a2a', padding:'9px 12px' }}>
            <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:14, fontWeight:700, color:s.color, fontFamily:'monospace' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Table header */}
      <div style={{ display:'grid', gridTemplateColumns:'70px 50px 50px 45px 60px 70px 65px 1fr', background:'#1a1a1a', borderBottom:'1px solid #383838', padding:'6px 10px', flexShrink:0 }}>
        {['WPT','ETA','ATA','FL','FUEL REM','RVSM','FUEL@DEST','STATUS'].map(h => (
          <div key={h} style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.5 }}>{h}</div>
        ))}
      </div>

      {/* Waypoints */}
      <div style={{ flex:1, overflowY:'auto' }}>
        {WAYPOINTS.map((wpt, idx) => {
          const e       = entries[wpt.id] || {};
          const skipped = isSkipped(wpt, idx);
          const isDep   = wpt.type === 'dep';
          const isDest  = wpt.type === 'dest';
          const isDone  = isDep  ? !!(e.offBlock || e.toTime)
                        : isDest ? !!(e.lndTime  || e.onBlock)
                        : !!(e.ata || e.fuel);
          const isActive = !isDone && !skipped && (idx === 0 || WAYPOINTS.slice(0, idx).every((w, wi) => {
            const pe = entries[w.id] || {};
            return w.type === 'dep' ? !!(pe.offBlock || pe.toTime)
                                    : !!(pe.ata || pe.fuel) || isSkipped(w, wi);
          }));
          const fuelAtDest = getFuelAtDest(wpt);
          const fuelColor  = getFuelDestColor(fuelAtDest);
          const bgColor    = skipped ? '#1e1e1e' : isDone ? '#1f2a1f' : isActive ? 'rgba(26,155,196,0.06)' : '#242424';
          const borderLeft = isActive ? '3px solid #1a9bc4' : isDone ? '3px solid #2d9e5f' : '3px solid transparent';

          // RVSM display — show first part
          const rvsmParts = (e.rvsm || '').split('/');
          const rvsmDisplay = e.rvsm ? rvsmParts[0] + '…' : (isDep || isDest ? 'N/A' : '—');

          return (
            <div key={wpt.id} onClick={() => !skipped && setModal(wpt.id)}
              style={{ display:'grid', gridTemplateColumns:'70px 50px 50px 45px 60px 70px 65px 1fr', padding:'10px', borderBottom:'1px solid #383838', background:bgColor, borderLeft, cursor: skipped ? 'default' : 'pointer', opacity: skipped ? 0.3 : 1, alignItems:'center' }}>

              <div>
                <div style={{ fontSize:12, fontWeight:700, fontFamily:'monospace', color: isDep||isDest ? '#1a9bc4' : isDone ? '#2d9e5f' : isActive ? '#1a9bc4' : '#666' }}>{wpt.name}</div>
                {directTo && directTo.from === wpt.id && <div style={{ fontSize:9, color:'#ff9500', marginTop:1 }}>→ {directTo.to}</div>}
              </div>
              <div style={{ fontSize:11, color:'#555', fontFamily:'monospace' }}>{wpt.eta}</div>
              <div style={{ fontSize:11, fontFamily:'monospace', color: isDone ? '#2d9e5f' : '#444' }}>
                {isDep ? (e.toTime||'—') : isDest ? (e.lndTime||'—') : (e.ata||'—')}
              </div>
              <div style={{ fontSize:11, color:'#777', fontFamily:'monospace' }}>{wpt.fl}</div>
              <div style={{ fontSize:11, fontFamily:'monospace', color: isDone ? '#2d9e5f' : '#444' }}>
                {isDep  ? (e.toFuel  ? `${parseInt(e.toFuel.replace(/,/g,'')).toLocaleString()}`  : '—')
                : isDest ? (e.remFuel ? `${parseInt(e.remFuel.replace(/,/g,'')).toLocaleString()}` : '—')
                :           (e.fuel   ? `${parseInt(e.fuel.replace(/,/g,'')).toLocaleString()}`   : '—')}
              </div>
              <div style={{ fontSize:10, color: e.rvsm ? '#2d9e5f' : '#444', fontFamily:'monospace' }}>
                {rvsmDisplay}
              </div>
              <div style={{ fontSize:11, fontWeight: fuelAtDest ? 700 : 400, color: fuelAtDest ? fuelColor : '#333', fontFamily:'monospace' }}>
                {fuelAtDest ? `${fuelAtDest.toLocaleString()}` : '—'}
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
      </div>

      <SyncButton />

      {modal === 'LTAC' && <DepModal onClose={() => setModal(null)} onSave={handleDepSave} initial={entries['LTAC'] || {}} />}
      {modal === 'LTBA' && <DestModal onClose={() => setModal(null)} onSave={handleDestSave} initial={entries['LTBA'] || {}} />}
      {modal && modal !== 'LTAC' && modal !== 'LTBA' && (() => {
        const wpt      = WAYPOINTS.find(w => w.id === modal);
        const wptIdx   = WAYPOINTS.indexOf(wpt);
        const afterWpt = WAYPOINTS.filter((w, i) => i > wptIdx && w.type !== 'dest');
        return (
          <WptModal
            wpt={wpt}
            onClose={() => setModal(null)}
            onSave={(data) => handleWptSave(modal, data)}
            onDirectTo={(toId) => handleDirectTo(modal, toId)}
            initial={entries[modal] || {}}
            wptList={afterWpt}
          />
        );
      })()}
    </div>
  );
}

export default NavLog;