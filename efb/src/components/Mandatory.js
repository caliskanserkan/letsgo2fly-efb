import React, { useState } from 'react';

function CheckItem({ label, done: initialDone, badge, badgeColor }) {
  const [done, setDone] = useState(initialDone);
  return (
    <div onClick={() => setDone(!done)} style={{ display:'flex', alignItems:'center', padding:'12px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', gap:12, cursor:'pointer' }}>
      <div style={{ width:20, height:20, borderRadius:4, border: done ? 'none' : '1px solid #444', background: done ? '#2d9e5f' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:11, color:'#fff' }}>
        {done ? '✓' : ''}
      </div>
      <span style={{ fontSize:12.5, color: done ? '#4a4a4a' : '#999', flex:1, textDecoration: done ? 'line-through' : 'none' }}>
        {label}
      </span>
      {badge && (
        <span style={{ fontSize:11, fontWeight:600, color: badgeColor || (done ? '#2d9e5f' : '#ff9500') }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{ background:'#1f1f1f', padding:'7px 16px', fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', borderTop:'1px solid #383838', textTransform:'uppercase' }}>
      {title}
    </div>
  );
}

function Mandatory() {
  return (
    <div>
      <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>
        Checks & Remarks
      </div>

      <CheckItem label="General remarks & photos" done={true} badge="✓" badgeColor="#2d9e5f" />
      <CheckItem label="Tech log remarks" done={true} badge="1071" badgeColor="#2d9e5f" />
      <CheckItem label="Pre-flight acceptance" done={true} badge="Offline ✓" badgeColor="#2d9e5f" />

      <SectionHeader title="Aircraft Checklists" />

      <CheckItem label="AIRCRAFT SECURITY CHECKLIST" done={true} badge="✓" badgeColor="#2d9e5f" />
      <CheckItem label="EFB CHECKLIST" done={true} badge="✓" badgeColor="#2d9e5f" />
      <CheckItem label="MEL-HIL" done={false} badge="Pending" badgeColor="#ff9500" />


      <div style={{ margin:'12px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #ff9500', fontSize:11, color:'#c4882a', lineHeight:1.6 }}>
        ⚠ Tüm kontroller tamamlanmadan Accept & Sign sayfasına geçilemez.
      </div>
    </div>
  );
}

export default Mandatory;