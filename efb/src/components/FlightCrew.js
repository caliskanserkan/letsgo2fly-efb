import React, { useEffect, useState } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { supabase, logEvent } from '../supabaseClient';
import CzibCheck from './CzibCheck';

// ─── Info Row ─────────────────────────────────────────────────
function InfoRow({ label, value, accent }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', borderBottom:'1px solid #1e293b', minHeight:48 }}>
      <span style={{ fontSize:13, color:'#475569', flex:1 }}>{label}</span>
      <span style={{ fontSize:13, color: accent ? '#38bdf8' : '#f1f5f9', fontWeight: accent ? 600 : 400, textAlign:'right', maxWidth:'60%' }}>{value}</span>
    </div>
  );
}
// ─── Route/ATC Row (kopyala butonlu) ──────────────────────────
function RouteRow({ label, value, copyOnly }) {
  const [copied, setCopied] = React.useState(false);
  const has = value && value !== '—';
  const doCopy = () => {
    if (!has) return;
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', padding:'13px 16px', borderBottom:'1px solid #1e293b', minHeight:48, gap:12 }}>
      <span style={{ fontSize:13, color:'#475569', flex:'0 0 auto', paddingTop:2 }}>{label}</span>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flex:1 }}>
        {!copyOnly && has && (
          <span style={{ fontSize:12, color:'#38bdf8', textAlign:'right', fontFamily:'monospace', lineHeight:1.5, wordBreak:'break-word' }}>{value}</span>
        )}
        {has && (
          <button onClick={doCopy} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:600, color: copied ? '#22c55e' : '#38bdf8', background:'transparent', border:`1px solid ${copied ? '#22c55e' : '#38bdf8'}`, borderRadius:6, padding:'5px 10px', cursor:'pointer' }}>
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
        )}
        {!has && <span style={{ fontSize:13, color:'#475569' }}>—</span>}
      </div>
    </div>
  );
}

// ─── Pilot Row ────────────────────────────────────────────────
function PilotRow({ pilot, role, onSelect }) {
  const isPF = role === 'PF';
  const isPM = role === 'PM';

  return (
    <div onClick={onSelect} style={{
      display:'flex', alignItems:'center', padding:'12px 16px',
      borderBottom:'1px solid #1e293b', cursor:'pointer',
      background: isPF ? 'rgba(56,189,248,0.08)' : isPM ? 'rgba(148,163,184,0.06)' : 'transparent',
      transition:'background 0.15s',
      minHeight: 56,
    }}>
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: isPF ? 'rgba(56,189,248,0.15)' : isPM ? 'rgba(148,163,184,0.12)' : '#1e293b',
        border: `1px solid ${isPF ? 'rgba(56,189,248,0.3)' : isPM ? 'rgba(148,163,184,0.2)' : '#334155'}`,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize: 11, fontWeight: 700,
        color: isPF ? '#38bdf8' : isPM ? '#94a3b8' : '#334155',
        marginRight: 12,
      }}>
        {pilot.code?.slice(0,3) || '?'}
      </div>

      {/* Name */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight: (isPF || isPM) ? 600 : 400, color: (isPF || isPM) ? '#f1f5f9' : '#475569', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {pilot.full_name}
        </div>
        {(isPF || isPM) && (
          <div style={{ fontSize:10, color: isPF ? '#38bdf8' : '#94a3b8', marginTop:2 }}>
            {isPF ? 'Pilot Flying' : 'Pilot Monitoring'}
          </div>
        )}
      </div>

      {/* Badge */}
      {isPF && (
        <div style={{ background:'rgba(56,189,248,0.15)', border:'1px solid rgba(56,189,248,0.3)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'#38bdf8', flexShrink:0 }}>PF</div>
      )}
      {isPM && (
        <div style={{ background:'rgba(148,163,184,0.1)', border:'1px solid rgba(148,163,184,0.2)', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700, color:'#94a3b8', flexShrink:0 }}>PM</div>
      )}
      {!isPF && !isPM && (
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#334155', flexShrink:0 }} />
      )}
    </div>
  );
}

// ─── FlightCrew ───────────────────────────────────────────────
function FlightCrew({ setStatus, activePlan }) {
  const [pf, setPF] = usePersistedState('efb_crew_pf', null);
  const [pm, setPM] = usePersistedState('efb_crew_pm', null);
  const [pilots, setPilots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const acType = activePlan?.ac_type;
    setLoading(true);
    (async () => {
      if (!acType) {
        const { data } = await supabase.from('profiles').select('id, code, full_name').in('role', ['pilot', 'admin_pilot']).order('full_name');
        setPilots(data || []);
      } else {
        const { data: qualData } = await supabase.from('crew_qualifications').select('pilot_id').eq('ac_type', acType).neq('ac_type', 'EFB');
        if (!qualData || qualData.length === 0) {
          const { data } = await supabase.from('profiles').select('id, code, full_name').order('full_name');
          setPilots(data || []);
        } else {
          const qualifiedIds = [...new Set(qualData.map(q => q.pilot_id))];
          const { data } = await supabase.from('profiles').select('id, code, full_name').in('id', qualifiedIds).order('full_name');
          setPilots(data || []);
        }
      }
      setLoading(false);
    })();
  }, [activePlan?.ac_type]);

  const saveToPlan = async (newPF, newPM) => {
    if (!activePlan?.id || !newPF || !newPM) return;
    setSaving(true);
    const { error } = await supabase.from('plans').update({ pf_pilot: newPF, pm_pilot: newPM }).eq('id', activePlan.id);
    if (!error) {
      const pfPilot = pilots.find(p => p.id === newPF);
      const pmPilot = pilots.find(p => p.id === newPM);
      logEvent(activePlan.id, 'CREW_ASSIGNED', { pf_id:newPF, pm_id:newPM, pf_code:pfPilot?.code, pm_code:pmPilot?.code, pf_name:pfPilot?.full_name, pm_name:pmPilot?.full_name });
    }
    setSaving(false);
  };

  const handleSelect = (id) => {
    let newPF = pf, newPM = pm;
    if (pf === id)       { newPF = pm; newPM = id; }
    else if (pm === id)  { newPF = id; newPM = pf; }
    else if (!pf)        { newPF = id; }
    else if (!pm)        { newPM = id; }
    else                 { newPF = id; }
    setPF(newPF); setPM(newPM);
    setStatus('green');
    saveToPlan(newPF, newPM);
  };

  const pfPilot = pilots.find(p => p.id === pf);
  const pmPilot = pilots.find(p => p.id === pm);

  const flightId  = activePlan?.callsign || activePlan?.dispatch_no || '—';
  const logNr     = activePlan?.log_nr   || '—';
  const dof       = activePlan?.date     || '—';
  const std       = activePlan?.std      || '—';
  const aircraft  = activePlan ? `${activePlan.reg || '—'} / ${activePlan.ac_type || '—'}` : '—';
  const dep       = activePlan?.dep      || '—';
  const dest      = activePlan?.dest     || '—';
  const alternate = activePlan?.alternate|| '—';
  const fmsIdent   = activePlan?.fms_ident   || '—';
  const levelSpeed = activePlan?.level_speed || '—';
  const routeTxt   = activePlan?.route       || '—';
  const atcFpl     = activePlan?.atc_fpl     || '';

  return (
    <div style={{ background:'#0f172a', minHeight:'100%' }}>

      {/* Flight Information Section */}
      <div style={{ padding:'16px 16px 8px' }}>
        <div style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>Flight Information</div>
      </div>

      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="Flight ID / Log no." value={`${flightId} / ${logNr}`} />
        <InfoRow label="DOF / STD"           value={`${dof} · ${std} Z`} />
        <InfoRow label="Aircraft"            value={aircraft} accent />
        <InfoRow label="Departure"           value={dep} accent />
        <InfoRow label="Destination"         value={dest} accent />
        <InfoRow label="Alternate 1"         value={alternate} />
        <InfoRow label="FMS Ident"           value={fmsIdent} />
        <InfoRow label="Level / Speed"       value={levelSpeed} accent />
        <RouteRow  label="Route"    value={routeTxt} />
      </div>

      {/* EASA CZIB — catisma bolgesi kontrolu (ROUTE altinda) */}
      <CzibCheck activePlan={activePlan} />

      {/* Crew Assignment Section */}
      <div style={{ padding:'0 16px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>Crew Assignment</div>
        {saving && <span style={{ fontSize:11, color:'#475569' }}>Saving...</span>}
      </div>

      {activePlan?.ac_type && (
        <div style={{ margin:'0 12px 10px', padding:'10px 14px', borderRadius:10, background:'rgba(56,189,248,0.06)', border:'1px solid rgba(56,189,248,0.15)', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:16 }}>✈️</span>
          <span style={{ fontSize:12, color:'#38bdf8' }}>
            Showing pilots qualified for <b>{activePlan.ac_type}</b>
            {pilots.length === 0 && !loading && ' — none found, showing all'}
          </span>
        </div>
      )}

      {loading && (
        <div style={{ padding:'32px 16px', color:'#475569', fontSize:13, textAlign:'center' }}>
          Loading crew...
        </div>
      )}

      {!loading && pilots.length === 0 && (
        <div style={{ margin:'0 12px', padding:'24px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', color:'#475569', fontSize:13, textAlign:'center' }}>
          No qualified pilots found.<br />Add qualifications in Admin Panel.
        </div>
      )}

      {!loading && pilots.length > 0 && (
        <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
          <div style={{ padding:'10px 16px', borderBottom:'1px solid #334155', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:16 }}>👥</span>
            <span style={{ fontSize:11, color:'#475569', fontWeight:600, letterSpacing:'0.5px' }}>Tap to assign · Tap again to rotate PF / PM</span>
          </div>
          {pilots.map(p => (
            <PilotRow
              key={p.id}
              pilot={p}
              role={pf === p.id ? 'PF' : pm === p.id ? 'PM' : null}
              onSelect={() => handleSelect(p.id)}
            />
          ))}
        </div>
      )}

      {/* Summary Card */}
      {pfPilot && pmPilot && (
        <div style={{ margin:'0 12px 20px', background:'rgba(56,189,248,0.06)', border:'1px solid rgba(56,189,248,0.15)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(56,189,248,0.1)', fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1px' }}>CREW CONFIRMED</div>
          <div style={{ padding:'12px 14px', display:'flex', gap:12 }}>
            <div style={{ flex:1, background:'rgba(56,189,248,0.08)', borderRadius:10, padding:'12px', border:'1px solid rgba(56,189,248,0.15)' }}>
              <div style={{ fontSize:10, color:'#38bdf8', fontWeight:600, marginBottom:4 }}>PF — PILOT FLYING</div>
              <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{pfPilot.full_name}</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>{pfPilot.code}</div>
            </div>
            <div style={{ flex:1, background:'rgba(148,163,184,0.06)', borderRadius:10, padding:'12px', border:'1px solid rgba(148,163,184,0.15)' }}>
              <div style={{ fontSize:10, color:'#94a3b8', fontWeight:600, marginBottom:4 }}>PM — PILOT MONITORING</div>
              <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{pmPilot.full_name}</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>{pmPilot.code}</div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default FlightCrew;