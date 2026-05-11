import React, { useEffect, useState } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { supabase, logEvent } from '../supabaseClient';

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', minHeight:44 }}>
      <span style={{ fontSize:12.5, color:'#999' }}>{label}</span>
      <span style={{ fontSize:12.5, color:'#e8e8e8' }}>{value}</span>
    </div>
  );
}

function PilotRow({ pilot, role, onSelect }) {
  const isPF = role === 'PF';
  const isPM = role === 'PM';
  return (
    <div onClick={onSelect} style={{ display:'flex', alignItems:'center', padding:'11px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer', background: isPF ? 'rgba(26,155,196,0.08)' : isPM ? 'rgba(142,142,147,0.06)' : 'transparent', borderLeft: isPF ? '2px solid #1a9bc4' : isPM ? '2px solid #555' : '2px solid transparent', gap:10 }}>
      <span style={{ fontSize:11, color:'#555', width:36 }}>{pilot.code}</span>
      <span style={{ fontSize:12.5, color: (isPF || isPM) ? '#e8e8e8' : '#555', flex:1 }}>{pilot.full_name}</span>
      {isPF && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'rgba(26,155,196,0.2)', color:'#1a9bc4' }}>PF ✓</span>}
      {isPM && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'rgba(142,142,147,0.15)', color:'#888' }}>PM ✓</span>}
      {!isPF && !isPM && <span style={{ fontSize:10, color:'#333', border:'1px solid #333', padding:'2px 8px', borderRadius:4 }}>—</span>}
    </div>
  );
}

function FlightCrew({ setStatus, activePlan }) {
  const [pf, setPF] = usePersistedState('efb_crew_pf', null);
  const [pm, setPM] = usePersistedState('efb_crew_pm', null);
  const [pilots, setPilots] = useState([]); // [{id, code, full_name}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load pilots filtered by plan's ac_type
  useEffect(() => {
    const acType = activePlan?.ac_type;
    setLoading(true);

    (async () => {
      if (!acType) {
        // No ac_type — show all pilots
        const { data } = await supabase
          .from('profiles')
          .select('id, code, full_name')
          .in('role', ['pilot', 'admin_pilot'])
          .order('full_name');
        setPilots(data || []);
      } else {
        // Show only pilots qualified for this ac_type
        const { data: qualData } = await supabase
          .from('crew_qualifications')
          .select('pilot_id')
          .eq('ac_type', acType)
          .neq('ac_type', 'EFB');

        if (!qualData || qualData.length === 0) {
          // Fallback: show all pilots if none qualified
          const { data } = await supabase
            .from('profiles')
            .select('id, code, full_name')
            .order('full_name');
          setPilots(data || []);
        } else {
          const qualifiedIds = [...new Set(qualData.map(q => q.pilot_id))];
          const { data } = await supabase
            .from('profiles')
            .select('id, code, full_name')
            .in('id', qualifiedIds)
            .order('full_name');
          setPilots(data || []);
        }
      }
      setLoading(false);
    })();
  }, [activePlan?.ac_type]);

  // Save PF/PM to plans table
  const saveToPlan = async (newPF, newPM) => {
    if (!activePlan?.id) return;
    if (!newPF || !newPM) return;
    setSaving(true);
    const { error } = await supabase
      .from('plans')
      .update({ pf_pilot: newPF, pm_pilot: newPM })
      .eq('id', activePlan.id);
    if (!error) {
      const pfPilot = pilots.find(p => p.id === newPF);
      const pmPilot = pilots.find(p => p.id === newPM);
      logEvent(activePlan.id, 'CREW_ASSIGNED', {
        pf_id:   newPF,
        pm_id:   newPM,
        pf_code: pfPilot?.code,
        pm_code: pmPilot?.code,
        pf_name: pfPilot?.full_name,
        pm_name: pmPilot?.full_name,
      });
    } else {
      console.error('Crew save error:', error);
    }
    setSaving(false);
  };

  const handleSelect = (id) => {
    let newPF = pf;
    let newPM = pm;

    if (pf === id) {
      // Clicking PF again → swap roles
      newPF = pm;
      newPM = id;
    } else if (pm === id) {
      // Clicking PM again → swap roles
      newPF = id;
      newPM = pf;
    } else if (!pf) {
      // No PF yet → assign as PF
      newPF = id;
    } else if (!pm) {
      // PF set, no PM → assign as PM
      newPM = id;
    } else {
      // Both set, new pilot → replace PF, keep PM
      newPF = id;
    }

    setPF(newPF);
    setPM(newPM);
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

      <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>
        Crew Assignment {saving && <span style={{ color:'#555', fontWeight:400 }}>· saving...</span>}
      </div>

      {activePlan?.ac_type && (
        <div style={{ margin:'0 16px 8px', padding:'7px 12px', borderRadius:6, background:'rgba(26,155,196,0.08)', border:'1px solid rgba(26,155,196,0.2)', fontSize:11, color:'#1a9bc4', fontFamily:'monospace' }}>
          Showing pilots qualified for {activePlan.ac_type}
          {pilots.length === 0 && !loading && ' — none found, showing all'}
        </div>
      )}

      {loading && (
        <div style={{ padding:'20px 16px', color:'#555', fontSize:11, textAlign:'center' }}>Loading crew...</div>
      )}

      {!loading && pilots.length === 0 && (
        <div style={{ padding:'20px 16px', color:'#555', fontSize:12, textAlign:'center' }}>
          No qualified pilots found. Add qualifications in Admin Panel.
        </div>
      )}

      {!loading && pilots.length > 0 && (
        <div style={{ margin:'8px 16px', background:'#2e2e2e', border:'1px solid #383838', borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:'#1f1f1f', color:'#555', padding:'7px 12px', fontSize:10, fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', textTransform:'uppercase' }}>
            Tap to rotate PF / PM
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

      {pfPilot && pmPilot && (
        <div style={{ margin:'8px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(26,155,196,0.08)', borderLeft:'3px solid #1a9bc4', fontSize:11, color:'#7bbdd4', lineHeight:1.6 }}>
          PF: <b>{pfPilot.full_name}</b><br />
          PM: <b>{pmPilot.full_name}</b>
        </div>
      )}
    </div>
  );
}

export default FlightCrew;