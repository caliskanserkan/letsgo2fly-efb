import React, { useEffect } from 'react';
import SyncButton from './SyncButton';
import { createClient } from '@supabase/supabase-js';
import { usePersistedState } from '../hooks/usePersistedState';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

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
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="—"
          style={{ background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'7px 10px', fontSize:14, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'right', width:90 }} />
        {unit   && <span style={{ fontSize:11, color:'#555', minWidth:20 }}>{unit}</span>}
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
  return String(Math.floor(m / 60)).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0');
}

// rawText'teki DEST satırından koordinat çıkar
function parseDestCoords(rawText) {
  if (!rawText) return { lat: null, lon: null };
  const m = rawText.match(/^DEST\s+\S+\s+.*?N(\d+):(\d+\.?\d*)\s+E(\d+):(\d+\.?\d*)/m);
  if (!m) return { lat: null, lon: null };
  return {
    lat: parseFloat(m[1]) + parseFloat(m[2]) / 60,
    lon: parseFloat(m[3]) + parseFloat(m[4]) / 60,
  };
}

function EndFlight({ flightData, divertData, setStatus, activePlan, rawText }) {
  const [pax,       setPax]      = usePersistedState('efb_endflt_pax',      '');
  const [cycles,    setCycles]   = usePersistedState('efb_endflt_cycles',   '1');
  const [archived,  setArchived] = usePersistedState('efb_endflt_archived', false);
  const [archiving, setArchiving] = React.useState(false);

  const { offBlock, takeoffTime, landingTime, onBlock, takeoffFuel, remainingFuel } = flightData;
  const divert = divertData.active;

  const dep    = activePlan?.dep     || '—';
  const dest   = activePlan?.dest    || '—';
  const date   = activePlan?.date    || '—';
  const reg    = activePlan?.reg     || '—';
  const acType = activePlan?.ac_type || '—';

  function n(v) {
    if (!v) return null;
    const p = parseInt(v.toString().replace(/,/g,''));
    return isNaN(p) ? null : p;
  }

  const finalRes = n(activePlan?.reserve_fuel) || 1447;

  const flightMins = toMins(landingTime) !== null && toMins(takeoffTime) !== null
    ? toMins(landingTime) - toMins(takeoffTime) : null;
  const blockMins  = toMins(onBlock) !== null && toMins(offBlock) !== null
    ? toMins(onBlock) - toMins(offBlock) : null;

  const toFuelNum  = takeoffFuel   ? parseInt(takeoffFuel.replace(/,/g,''))   : null;
  const remFuelNum = remainingFuel ? parseInt(remainingFuel.replace(/,/g,'')) : null;
  const burnoff    = toFuelNum && remFuelNum ? toFuelNum - remFuelNum : null;
  const remColor   = remFuelNum === null ? '#999' : remFuelNum < finalRes ? '#e02020' : '#2d9e5f';

  const destIcao = divert && divertData.icao ? divertData.icao : dest;
  const timesOk  = !!(landingTime && onBlock && takeoffTime && offBlock);
  const fuelOk   = !!remainingFuel;

  useEffect(() => {
    if (!setStatus) return;
    if (archived)                      setStatus('green');
    else if (timesOk && fuelOk && pax) setStatus('green');
    else if (timesOk || fuelOk)        setStatus('amber');
    else                               setStatus('pending');
  }, [timesOk, fuelOk, pax, archived, setStatus]);

  const handleArchive = async () => {
    if (!activePlan?.id) return;
    setArchiving(true);
    try {
      // 1 — plans tablosunu archived yap
      await supabase
        .from('plans')
        .update({ status: 'archived', archived_at: new Date().toISOString() })
        .eq('id', activePlan.id);

      // 2 — DEST koordinatlarını rawText'ten çek
      const { lat: destLat, lon: destLon } = parseDestCoords(rawText);

      // 3 — archived_flights'a kayıt at → trigger pilot_stats'ı otomatik günceller
      const { error: archiveError } = await supabase
        .from('archived_flights')
        .insert({
          plan_id:          activePlan.id,
          pic_id:           activePlan.pf_pilot,
          sic_id:           activePlan.pm_pilot,
          pf_id:            activePlan.pf_pilot,
          departure_icao:   dep,
          destination_icao: destIcao,
          off_blocks:       offBlock    ? new Date(`${date}T${offBlock}:00Z`)    : null,
          on_blocks:        onBlock     ? new Date(`${date}T${onBlock}:00Z`)     : null,
          block_minutes:    blockMins,
          airborne_minutes: flightMins,
          landing_count:    parseInt(cycles) || 1,
          dest_lat:         destLat,
          dest_lon:         destLon,
          is_night_landing: false,   // gece hesabı bir sonraki adımda
        });

      if (archiveError) throw archiveError;
      setArchived(true);
    } catch (e) {
      console.error('Archive error:', e);
    }
    setArchiving(false);
  };

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

      <Title t="Flight Summary" />
      <AutoRow label="Route"    value={`${dep} → ${dest}`}   valueColor="#1a9bc4" />
      <AutoRow label="Date"     value={date}                  valueColor="#e8e8e8" />
      <AutoRow label="Aircraft" value={`${reg} / ${acType}`} valueColor="#e8e8e8" />

      <Sep />

      <Title t="Block & Flight Times" />
      <TimeRow label="Off Block"    value={offBlock}    auto />
      <TimeRow label="T/O Time"     value={takeoffTime} auto />
      <TimeRow label="Landing Time" value={landingTime} auto />
      <TimeRow label="On Block"     value={onBlock}     auto />

      <Sep />

      <Title t="Calculated" />
      <AutoRow label="Flight Time"  value={fromMins(flightMins)} valueColor={flightMins ? '#e8e8e8' : '#444'} big />
      <AutoRow label="Block Time"   value={fromMins(blockMins)}  valueColor={blockMins  ? '#e8e8e8' : '#444'} big />
      <AutoRow label="Landings"     value="1"        valueColor="#e8e8e8" />
      <AutoRow label="Destination"  value={destIcao} valueColor={divert ? '#e8731a' : '#1a9bc4'} />

      <Sep />

      <Title t="Fuel Summary" />
      <AutoRow label="T/O Fuel" value={toFuelNum ? toFuelNum.toLocaleString() + ' lb' : '—'} />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
        <div>
          <div style={{ fontSize:12.5, color:'#666' }}>Remaining Fuel</div>
          {remFuelNum !== null && remFuelNum < finalRes && (
            <div style={{ fontSize:10, color:'#e02020', marginTop:2, fontWeight:700 }}>
              ⚠ Below final reserve ({finalRes.toLocaleString()} lb)
            </div>
          )}
        </div>
        <span style={{ fontSize:16, fontWeight:700, color: remColor, fontFamily:'monospace' }}>
          {remFuelNum ? remFuelNum.toLocaleString() + ' lb' : '—'}
        </span>
      </div>
      <AutoRow label="Fuel Used (Burnoff)" value={burnoff ? burnoff.toLocaleString() + ' lb' : '—'} valueColor={burnoff ? '#e8e8e8' : '#444'} big />

      <Sep />

      <Title t="Tech Data" />
      <InputRow label="PAX"    value={pax}    onChange={setPax}    unit="pax" />
      <InputRow label="Cycles" hint="+1 auto added" value={cycles} onChange={setCycles} suffix="cycle(s)" />

      <Sep />

      {divert && (
        <div style={{ margin:'10px 16px', border:'1px solid rgba(255,149,0,0.3)', borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:'rgba(255,149,0,0.12)', padding:'8px 14px', borderBottom:'1px solid rgba(255,149,0,0.2)' }}>
            <span style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>Reason for Divert</span>
          </div>
          <div style={{ padding:'12px 14px', background:'#1e1e1e' }}>
            <textarea value={divertData.reason} onChange={() => {}} placeholder="Enter reason for divert..." rows={4}
              style={{ width:'100%', background:'#1a1a1a', border:'1.5px solid #e8731a', borderRadius:6, padding:'10px 12px', fontSize:13, color:'#e8e8e8', fontFamily:'inherit', outline:'none', resize:'vertical', lineHeight:1.6 }} />
          </div>
        </div>
      )}

      <Sep />

      <div style={{ margin:'12px 16px 4px' }}>
        {!archived ? (
          <>
            <button onClick={handleArchive} disabled={archiving || !timesOk}
              style={{ width:'100%', background: timesOk ? 'rgba(45,158,95,0.12)' : '#1e1e1e', border:'1px solid ' + (timesOk ? '#2d9e5f' : '#333'), borderRadius:10, padding:14, fontSize:14, fontWeight:700, color: timesOk ? '#2d9e5f' : '#444', cursor: timesOk ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
              {archiving ? '⏳ Archiving...' : '📁 Archive Flight'}
            </button>
            {!timesOk && <div style={{ fontSize:10, color:'#555', textAlign:'center', marginTop:6 }}>Complete flight times to archive</div>}
          </>
        ) : (
          <div style={{ padding:'12px 14px', borderRadius:8, background:'rgba(45,158,95,0.1)', border:'1px solid rgba(45,158,95,0.3)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>✅</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'#2d9e5f' }}>Flight Archived</div>
              <div style={{ fontSize:10, color:'#555', marginTop:2 }}>Plan moved to archive — read only</div>
            </div>
          </div>
        )}
      </div>

      <SyncButton />
    </div>
  );
}

export default EndFlight;