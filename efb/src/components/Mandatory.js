import React, { useEffect } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { logEvent } from '../supabaseClient';

const INITIAL_CHECKS = [
  // ── Genel Uçuş Öncesi ─────────────────────────────────────────────────────
  { id:1, label:'General remarks & photos reviewed',  done:false, badge:'', badgeColor:'#2d9e5f' },
  { id:2, label:'Tech log remarks reviewed',          done:false, badge:'', badgeColor:'#2d9e5f' },
  { id:3, label:'Pre-flight acceptance completed',    done:false, badge:'', badgeColor:'#2d9e5f' },
  { id:4, label:'AIRCRAFT SECURITY CHECKLIST',        done:false, badge:'', badgeColor:'#2d9e5f', section:'Aircraft Checklists' },
  { id:5, label:'MEL / HIL checked',                 done:false, badge:'', badgeColor:'#ff9500' },
  // ── EFB Checklist — AMC 20-25 ─────────────────────────────────────────────
  { id:6, label:'EFB_CHECKLIST_CONSOLIDATED',         done:false, badge:'', badgeColor:'#2d9e5f', section:'EFB Checklist — AMC 20-25', isEfbConsolidated: true },
];

function SectionHeader({ title }) {
  return (
    <div style={{ background:'#1f1f1f', padding:'7px 16px', fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', borderTop:'1px solid #383838', textTransform:'uppercase' }}>
      {title}
    </div>
  );
}

function Mandatory({ setStatus, activePlan }) {
  const [checks, setChecks] = usePersistedState('efb_mandatory_checks', INITIAL_CHECKS);

  const toggle = (id) => {
    setChecks(prev => {
      const updated = prev.map(c => c.id === id ? { ...c, done: !c.done } : c);
      const item = updated.find(c => c.id === id);
      // Log her check toggle
      logEvent(activePlan?.id, item.done ? 'MANDATORY_CHECK_DONE' : 'MANDATORY_CHECK_UNDONE', {
        check_label: item.label,
        check_id: id,
      });
      return updated;
    });
  };

  useEffect(() => {
    const allDone = checks.every(c => c.done);
    const anyDone = checks.some(c => c.done);
    if (allDone) {
      setStatus('green');
      logEvent(activePlan?.id, 'PREFLIGHT_MANDATORY_COMPLETE', {
        checks_count: checks.length,
      });
    } else if (anyDone) setStatus('amber');
    else setStatus('pending');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks]);

  const allDone = checks.every(c => c.done);

  return (
    <div>
      <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>
        Checks & Remarks
      </div>

      {checks.map((c) => (
        <React.Fragment key={c.id}>
          {c.section && <SectionHeader title={c.section} />}

          {c.isEfbConsolidated ? (
            /* ── Konsolide EFB Checklist maddesi ── */
            <div onClick={() => toggle(c.id)}
              style={{ display:'flex', alignItems:'flex-start', padding:'14px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', gap:12, cursor:'pointer' }}>
              <div style={{ width:20, height:20, borderRadius:4, border: c.done ? 'none' : '1px solid #444', background: c.done ? '#2d9e5f' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, color:'#fff', marginTop:2 }}>
                {c.done ? '✓' : ''}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color: c.done ? '#555' : '#888', marginBottom:6, lineHeight:1.7, fontStyle:'italic', textDecoration: c.done ? 'line-through' : 'none' }}>
                  <span style={{ fontWeight:700, color: c.done ? '#555' : '#aaa' }}>"</span>
                  <span style={{ fontWeight:700 }}>EFB battery ≥80%, application version current, screen brightness suitable for conditions, backup procedure available (paper/alternate), EFB secured at duty station, GPS position NOT FOR NAVIGATION acknowledged.</span>
                  <span style={{ fontWeight:700, color: c.done ? '#555' : '#aaa' }}>"</span>
                </div>
                {!c.done && (
                  <div style={{ fontSize:10, color:'#e8731a', fontWeight:700 }}>
                    Tap to confirm you have read and understood all EFB checklist items above.
                  </div>
                )}
                {c.done && (
                  <div style={{ fontSize:10, color:'#2d9e5f', fontWeight:700 }}>
                    ✓ Read and acknowledged
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Normal madde ── */
            <div onClick={() => toggle(c.id)}
              style={{ display:'flex', alignItems:'center', padding:'12px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', gap:12, cursor:'pointer' }}>
              <div style={{ width:20, height:20, borderRadius:4, border: c.done ? 'none' : '1px solid #444', background: c.done ? '#2d9e5f' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, color:'#fff' }}>
                {c.done ? '✓' : ''}
              </div>
              <span style={{ fontSize:12.5, color: c.done ? '#4a4a4a' : '#999', flex:1, textDecoration: c.done ? 'line-through' : 'none' }}>
                {c.label}
              </span>
              {c.badge && (
                <span style={{ fontSize:11, fontWeight:600, color: c.badgeColor || (c.done ? '#2d9e5f' : '#ff9500') }}>
                  {c.done ? c.badge : 'Pending'}
                </span>
              )}
            </div>
          )}
        </React.Fragment>
      ))}

      {!allDone && (
        <div style={{ margin:'12px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #ff9500', fontSize:11, color:'#c4882a', lineHeight:1.6 }}>
          ⚠ Complete all checks before proceeding to Accept & Sign.
        </div>
      )}
      {allDone && (
        <div style={{ margin:'12px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(45,158,95,0.08)', borderLeft:'3px solid #2d9e5f', fontSize:11, color:'#6db890', lineHeight:1.6 }}>
          ✓ All checks complete.
        </div>
      )}
    </div>
  );
}

export default Mandatory;