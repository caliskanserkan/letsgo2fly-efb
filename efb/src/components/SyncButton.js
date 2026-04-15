import React, { useState } from 'react';

function SyncButton() {
  const [status, setStatus] = useState('idle'); // idle | synced
  const [syncedAt, setSyncedAt] = useState('');

  const now = () => {
    const d = new Date();
    return `${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')} Z`;
  };

  const handleSync = () => {
    setStatus('synced');
    setSyncedAt(now());
  };

  const handleReSync = () => {
    setStatus('idle');
    setSyncedAt('');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'16px 16px 20px', borderTop:'1px solid #383838', marginTop:8 }}>
      {status === 'idle' ? (
        <button onClick={handleSync}
          style={{ background:'#e8731a', border:'none', borderRadius:10, padding:'13px 40px', fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3 }}>
          ⇄ Sync to PM
        </button>
      ) : (
        <button onClick={handleReSync}
          style={{ background:'#2d9e5f', border:'none', borderRadius:10, padding:'13px 40px', fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3 }}>
          ✓ Synced to PM
        </button>
      )}
      {syncedAt && (
        <div style={{ fontSize:10, color:'#555', marginTop:6 }}>Last sync: {syncedAt}</div>
      )}
    </div>
  );
}

export default SyncButton;