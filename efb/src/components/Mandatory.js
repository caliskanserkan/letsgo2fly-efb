import React, { useState, useEffect } from 'react';

const INITIAL_CHECKS = [
  { id:1, label:'General remarks & photos',    done:true,  badge:'✓',        badgeColor:'#2d9e5f' },
  { id:2, label:'Tech log remarks',            done:true,  badge:'1071',     badgeColor:'#2d9e5f' },
  { id:3, label:'Pre-flight acceptance',       done:true,  badge:'Offline ✓',badgeColor:'#2d9e5f' },
  { id:4, label:'AIRCRAFT SECURITY CHECKLIST', done:true,  badge:'✓',        badgeColor:'#2d9e5f', section:'Aircraft Checklists' },
  { id:5, label:'EFB CHECKLIST',              done:true,  badge:'✓',        badgeColor:'#2d9e5f' },
  { id:6, label:'MEL-HIL',                    done:false, badge:'Pending',  badgeColor:'#ff9500' },
];

function SectionHeader({ title }) {
  return (
    <div style={{ background:'#1f1f1f', padding:'7px 16px', fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', borderTop:'1px solid #383838', textTransform:'uppercase' }}>
      {title}
    </div>
  );
}

function Mandatory({ setStatus }) {
  const [checks, setChecks] = useState(INITIAL_CHECKS);

  const toggle = (id) => {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c));
  };

  useEffect(() => {
    const allDone = checks.every(c => c.done);
    const anyDone = checks.some(c => c.done);
    if (allDone) setStatus('green');
    else if (anyDone) setStatus('amber');
    else setStatus('pending');
  }, [checks, setStatus]);

  const allDone = checks.every(c => c.done);

  return (
    <div>
      <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>
        Checks & Remarks
      </div>

      {checks.map((c, idx) => (
        <React.Fragment key={c.id}>
          {c.section && <SectionHeader title={c.section} />}
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