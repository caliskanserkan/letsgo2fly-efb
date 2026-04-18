import React, { useState } from 'react';

const ALL_PILOTS = [
  { code: 'AAK', name: 'Capt. Ahmet Akpinar' },
  { code: 'SEL', name: 'Capt. Selcuk Ekinci' },
  { code: 'SCL', name: 'Capt. Serkan Caliskan' },
];

function Row({ label, value, accent }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', minHeight:44 }}>
      <span style={{ fontSize:12.5, color:'#999' }}>{label}</span>
      <span style={{ fontSize:12.5, color: accent ? '#1a9bc4' : '#e8e8e8' }}>{value}</span>
    </div>
  );
}

function PilotRow({ pilot, role, onSelect }) {
  const isPF = role === 'PF';
  const isPM = role === 'PM';
  return (
    <div onClick={onSelect} style={{ display:'flex', alignItems:'center', padding:'11px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer', background: isPF ? 'rgba(26,155,196,0.08)' : isPM ? 'rgba(142,142,147,0.06)' : 'transparent', borderLeft: isPF ? '2px solid #1a9bc4' : isPM ? '2px solid #555' : '2px solid transparent', gap:10 }}>
      <span style={{ fontSize:11, color:'#555', width:30 }}>{pilot.code}</span>
      <span style={{ fontSize:12.5, color: (isPF || isPM) ? '#e8e8e8' : '#555', flex:1 }}>{pilot.name}</span>
      {isPF && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'rgba(26,155,196,0.2)', color:'#1a9bc4' }}>PF ✓</span>}
      {isPM && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'rgba(142,142,147,0.15)', color:'#888' }}>PM ✓</span>}
      {!isPF && !isPM && <span style={{ fontSize:10, color:'#333', border:'1px solid #333', padding:'2px 8px', borderRadius:4 }}>—</span>}
    </div>
  );
}

function FlightCrew({ setStatus, activePlan }) {
  const [pf, setPF] = useState('AAK');
  const [pm, setPM] = useState('SEL');

  const handleSelect = (code) => {
    if (pf === code) { setPF(pm); setPM(code); }
    else if (pm === code) { setPM(pf); setPF(code); }
    else { setPF(code); }
    setStatus('green');
  };

  // Aktif plandan veri çek, yoksa varsayılan göster
  const flightId  = activePlan?.callsign || activePlan?.dispatch_no || '—';
  const logNr     = activePlan?.log_nr   || '—';
  const dof       = activePlan?.date     || '—';
  const std       = activePlan?.std      || '—';
  const aircraft  = activePlan ? `${activePlan.reg || '—'} / ${activePlan.ac_type || '—'}` : '—';
  const dep       = activePlan?.dep      || '—';
  const dest      = activePlan?.dest     || '—';
  const alternate = activePlan?.alternate|| '—';

  return (
    <div>
      <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>Flight Information</div>
      <Row label="Flight ID / Log no." value={`${flightId} / FMS ${logNr}`} />
      <Row label="DOF / STD"           value={`${dof} · ${std} Z`} />
      <Row label="Aircraft"            value={aircraft} />
      <Row label="Departure"           value={dep} />
      <Row label="Destination"         value={dest} />
      <Row label="Alternate 1"         value={alternate} />

      <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />

      <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>Crew Assignment</div>
      <div style={{ margin:'8px 16px', background:'#2e2e2e', border:'1px solid #383838', borderRadius:8, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', color:'#555', padding:'7px 12px', fontSize:10, fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', textTransform:'uppercase' }}>
          Tap to rotate PF / PM
        </div>
        {ALL_PILOTS.map(p => (
          <PilotRow key={p.code} pilot={p}
            role={pf === p.code ? 'PF' : pm === p.code ? 'PM' : null}
            onSelect={() => handleSelect(p.code)}
          />
        ))}
      </div>

      <div style={{ margin:'8px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(26,155,196,0.08)', borderLeft:'3px solid #1a9bc4', fontSize:11, color:'#7bbdd4', lineHeight:1.6 }}>
        PF: <b>{ALL_PILOTS.find(p => p.code === pf)?.name}</b><br />
        PM: <b>{ALL_PILOTS.find(p => p.code === pm)?.name}</b>
      </div>
    </div>
  );
}

export default FlightCrew;