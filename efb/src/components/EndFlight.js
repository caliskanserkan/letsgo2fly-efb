import React, { useState, useEffect } from 'react';
import SyncButton from './SyncButton';

const FINAL_RESERVE = 1447; // lb — 30min fuel from OFP

function Sep() {
  return <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />;
}

function Title({ t }) {
  return <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>{t}</div>;
}

function AutoRow({ label, value, valueColor, big }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
      <span style={{ fontSize:12.5, color:'#666' }}>{label}</span>
      <span style={{ fontSize: big ? 16 : 12.5, fontWeight: big ? 700 : 400, color: valueColor || '#999', fontFamily:'monospace' }}>{value}</span>
    </div>
  );
}

function TimeRow({ label, value, auto }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background: auto ? '#2a2a2a' : '#2e2e2e', borderBottom:'1px solid #383838' }}>
      <div>
        <div style={{ fontSize:12.5, color: auto ? '#666' : '#e8e8e8', fontWeight: auto ? 400 : 600 }}>{label}</div>
        {auto && <div style={{ fontSize:10, color:'#444', marginTop:1 }}>From NAV LOG</div>}
      </div>
      <span style={{ fontSize:15, fontWeight:700, color: auto ? (value ? '#1a9bc4' : '#444') : '#999', fontFamily:'monospace' }}>
        {value || '—'}
      </span>
    </div>
  );
}

function InputRow({ label, hint, value, onChange, unit, suffix }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', minHeight:52 }}>
      <div>
        <div style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>{label}</div>
        {hint && <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="—"
          style={{ background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'7px 10px', fontSize:14, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'right', width:90 }}
        />
        {unit && <span style={{ fontSize:11, color:'#555', minWidth:20 }}>{unit}</span>}
        {suffix && <span style={{ fontSize:11, color:'#2d9e5f', fontWeight:600 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function toMins(t) {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fromMins(m) {
  if (m === null || m < 0) return '—';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function EndFlight({ flightData, divertData, setStatus }) {
  const [pax, setPax]       = useState('');
  const [cycles, setCycles] = useState('1');

  const { offBlock, takeoffTime, landingTime, onBlock, takeoffFuel, remainingFuel } = flightData;
  const divert = divertData.active;

  const flightMins = toMins(landingTime) !== null && toMins(takeoffTime) !== null
    ? toMins(landingTime) - toMins(takeoffTime) : null;
  const blockMins  = toMins(onBlock) !== null && toMins(offBlock) !== null
    ? toMins(onBlock) - toMins(offBlock) : null;

  const toFuelNum  = takeoffFuel  ? parseInt(takeoffFuel.replace(/,/g,''))  : null;
  const remFuelNum = remainingFuel ? parseInt(remainingFuel.replace(/,/g,'')) : null;
  const burnoff    = toFuelNum && remFuelNum ? toFuelNum - remFuelNum : null;

  const remColor = remFuelNum === null ? '#999'
                 : remFuelNum < FINAL_RESERVE ? '#e02020'
                 : '#2d9e5f';

  const destIcao = divert && divertData.icao ? divertData.icao : 'LTBA';

  // setStatus logic
  const timesOk = !!(landingTime && onBlock && takeoffTime && offBlock);
  const fuelOk  = !!remainingFuel;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!setStatus) return;
    if (timesOk && fuelOk && pax) setStatus('green');
    else if (timesOk || fuelOk)   setStatus('amber');
    else                           setStatus('pending');
  }, [timesOk, fuelOk, pax]);

  return (
    <div>
      {divert && (
        <div style={{ background:'rgba(255,149,0,0.1)', borderBottom:'1px solid rgba(255,149,0,0.3)', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:16 }}>⚠</span>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'#e8731a' }}>DIVERT ACTIVE — {divertData.icao || '—'}</div>
            <div style={{ fontSize:10, color:'#888', marginTop:1 }}>RWY {divertData.rwy || '—'} · {divertData.len || '—'} ft</div>
          </div>
        </div>
      )}

      <Title t="Block & Flight Times" />
      <TimeRow label="Off Block"    value={offBlock}    auto />
      <TimeRow label="T/O Time"     value={takeoffTime}  auto />
      <TimeRow label="Landing Time" value={landingTime}  auto />
      <TimeRow label="On Block"     value={onBlock}      auto />

      <Sep />

      <Title t="Calculated" />
      <AutoRow label="Flight Time"  value={fromMins(flightMins)} valueColor={flightMins ? '#e8e8e8' : '#444'} big />
      <AutoRow label="Block Time"   value={fromMins(blockMins)}  valueColor={blockMins  ? '#e8e8e8' : '#444'} big />
      <AutoRow label="Landings"     value="1" valueColor="#e8e8e8" />
      <AutoRow label="Destination"  value={destIcao} valueColor={divert ? '#e8731a' : '#1a9bc4'} />

      <Sep />

      <Title t="Fuel Summary" />
      <AutoRow label="T/O Fuel" value={toFuelNum ? `${toFuelNum.toLocaleString()} lb` : '—'} />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
        <div>
          <div style={{ fontSize:12.5, color:'#666' }}>Remaining Fuel</div>
          {remFuelNum !== null && remFuelNum < FINAL_RESERVE && (
            <div style={{ fontSize:10, color:'#e02020', marginTop:2, fontWeight:700 }}>⚠ Below final reserve ({FINAL_RESERVE.toLocaleString()} lb)</div>
          )}
        </div>
        <span style={{ fontSize:16, fontWeight:700, color: remColor, fontFamily:'monospace' }}>
          {remFuelNum ? `${remFuelNum.toLocaleString()} lb` : '—'}
        </span>
      </div>
      <AutoRow label="Fuel Used (Burnoff)" value={burnoff ? `${burnoff.toLocaleString()} lb` : '—'} valueColor={burnoff ? '#e8e8e8' : '#444'} big />

      <Sep />

      <Title t="Tech Data" />
      <InputRow label="PAX" value={pax} onChange={setPax} unit="pax" />
      <InputRow label="Cycles" hint="+1 auto added" value={cycles} onChange={setCycles} suffix="cycle(s)" />

      <Sep />

      {divert && (
        <div style={{ margin:'10px 16px', border:'1px solid rgba(255,149,0,0.3)', borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:'rgba(255,149,0,0.12)', padding:'8px 14px', borderBottom:'1px solid rgba(255,149,0,0.2)' }}>
            <span style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>Reason for Divert</span>
          </div>
          <div style={{ padding:'12px 14px', background:'#1e1e1e' }}>
            <textarea
              value={divertData.reason}
              onChange={e => {}}
              placeholder="Enter reason for divert..."
              rows={4}
              style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #e8731a', borderRadius:6, padding:'10px 12px', fontSize:13, color:'#e8e8e8', fontFamily:'inherit', outline:'none', resize:'vertical', lineHeight:1.6 }}
            />
            <div style={{ fontSize:10, color:'#555', marginTop:6 }}>
              This information may be required by aviation authorities.
            </div>
          </div>
        </div>
      )}

      <SyncButton />
    </div>
  );
}

export default EndFlight;