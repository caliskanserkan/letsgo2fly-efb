import React, { useState, useRef, useEffect } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';

const pilots = [
  { code: 'AAK', name: 'Capt. Ahmet Akpinar' },
  { code: 'SEL', name: 'Capt. Selcuk Ekinci' },
  { code: 'SCL', name: 'Capt. Serkan Caliskan' },
];

function StatusRow({ label, ok, inProgress, value }) {
  const color = ok ? '#2d9e5f' : inProgress ? '#ff9500' : '#555';
  const icon  = ok ? '✓' : inProgress ? '◐' : '○';
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
      <span style={{ fontSize:12.5, color:'#999' }}>{label}</span>
      <span style={{ fontSize:11, fontWeight:600, color }}>{icon} {value}</span>
    </div>
  );
}

function Sep() {
  return <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />;
}

function Title({ t }) {
  return <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>{t}</div>;
}

const now = () => {
  const d = new Date();
  return `${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')} Z`;
};

function AcceptSign({ setStatus, pageStatus }) {
  const [preflightPilot, setPreflightPilot] = usePersistedState('efb_accept_pilot',      'AAK');
  const [accepted,       setAccepted]       = usePersistedState('efb_accept_accepted',    false);
  const [acceptedAt,     setAcceptedAt]     = usePersistedState('efb_accept_acceptedAt',  '');
  const [synced,         setSynced]         = usePersistedState('efb_accept_synced',       false);
  const [syncedAt,       setSyncedAt]       = usePersistedState('efb_accept_syncedAt',    '');

  // signature canvas — can't persist, but if already accepted canvas is irrelevant
  const [signed,  setSigned]  = useState(false);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef(null);
  const ps = pageStatus || {};

  const statuses = [
    { label:'Flight & crew assigned', ok: ps['flt-crew']==='green',  inProgress: ps['flt-crew']==='amber',  value: ps['flt-crew']==='green'  ? 'Complete' : ps['flt-crew']==='amber'  ? 'In Progress…' : 'Pending' },
    { label:'Mandatory / Preflight',  ok: ps['mandatory']==='green', inProgress: ps['mandatory']==='amber', value: ps['mandatory']==='green' ? 'Complete' : ps['mandatory']==='amber' ? 'In Progress…' : 'Pending' },
    { label:'eFP documents loaded',   ok: ps['efp']==='green',       inProgress: ps['efp']==='amber',       value: ps['efp']==='green'       ? 'Loaded ✓' : ps['efp']==='amber'       ? 'In Progress…' : 'Not viewed' },
    { label:'FUEL uplift entered',    ok: ps['fuel']==='green',      inProgress: ps['fuel']==='amber',      value: ps['fuel']==='green'      ? 'Complete' : ps['fuel']==='amber'      ? 'In Progress…' : 'Pending' },
  ];

  const allOk = statuses.every(s => s.ok);

  useEffect(() => {
    if (!setStatus) return;
    if (accepted)    setStatus('green');
    else if (signed) setStatus('amber');
    else             setStatus('pending');
  }, [accepted, signed, setStatus]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  };

  const startDraw = (e) => {
    e.preventDefault();
    if (accepted) return;
    setDrawing(true);
    setSigned(false);
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e) => {
    e.preventDefault();
    if (!drawing) return;
    const pos = getPos(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.strokeStyle = '#1a9bc4';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => { setDrawing(false); setSigned(true); };

  const clearSig = () => {
    if (accepted) return;
    canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setSigned(false);
  };

  const handleAccept = () => {
    if (!signed || !allOk) return;
    setAccepted(true);
    setAcceptedAt(now());
  };

  const handleReEvaluate = () => {
    setAccepted(false);
    setSigned(false);
    setSynced(false);
    setSyncedAt('');
    setAcceptedAt('');
    if (canvasRef.current) canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };

  const handleSync = () => { setSynced(true); setSyncedAt(now()); };

  return (
    <div>
      <Title t="Pre-flight Status" />
      {statuses.map((s, i) => (
        <StatusRow key={i} label={s.label} ok={s.ok} inProgress={s.inProgress} value={s.value} />
      ))}

      <Sep />

      <Title t="Pre-flight Check Performed By" />
      <div style={{ margin:'0 16px 8px', background:'#2e2e2e', border:'1px solid #383838', borderRadius:8, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', color:'#555', padding:'7px 12px', fontSize:10, fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', textTransform:'uppercase' }}>
          Select pilot who performed pre-flight inspection
        </div>
        {pilots.map(p => {
          const selected = preflightPilot === p.code;
          return (
            <div key={p.code} onClick={() => !accepted && setPreflightPilot(p.code)}
              style={{ display:'flex', alignItems:'center', padding:'11px 12px', borderBottom:'1px solid rgba(255,255,255,0.04)', cursor: accepted ? 'default' : 'pointer', background: selected ? 'rgba(26,155,196,0.08)' : 'transparent', borderLeft: selected ? '2px solid #1a9bc4' : '2px solid transparent', gap:10 }}>
              <div style={{ width:18, height:18, borderRadius:9, border:`2px solid ${selected ? '#1a9bc4' : '#444'}`, background: selected ? '#1a9bc4' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {selected && <div style={{ width:6, height:6, background:'#fff', borderRadius:3 }} />}
              </div>
              <span style={{ fontSize:12.5, color: selected ? '#e8e8e8' : '#666', flex:1 }}>{p.code} — {p.name}</span>
              {selected && <span style={{ fontSize:10, fontWeight:700, color:'#1a9bc4', background:'rgba(26,155,196,0.15)', padding:'2px 8px', borderRadius:4 }}>Selected ✓</span>}
            </div>
          );
        })}
      </div>

      <Sep />

      <Title t="PIC Declaration" />
      <div style={{ margin:'0 16px 8px', padding:'10px 12px', borderRadius:6, background:'rgba(26,155,196,0.08)', borderLeft:'3px solid #1a9bc4', fontSize:11, color:'#7bbdd4', lineHeight:1.6 }}>
        I confirm that pre-flight procedures have been completed, all entries are correct, and the aircraft is airworthy for this flight.
      </div>

      <div style={{ margin:'8px 16px', border:`1px solid ${accepted ? '#2d9e5f' : '#383838'}`, borderRadius:8, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', borderBottom:`1px solid ${accepted ? '#2d9e5f' : '#383838'}`, padding:'7px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:10, color: accepted ? '#2d9e5f' : '#555', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase' }}>
            {accepted ? '✓ Signed & Accepted' : 'PIC Digital Signature'}
          </span>
          {signed && !accepted && (
            <span onClick={clearSig} style={{ fontSize:10, color:'#e02020', cursor:'pointer' }}>Clear</span>
          )}
        </div>
        <canvas
          ref={canvasRef}
          width={450} height={120}
          style={{ display:'block', width:'100%', background: accepted ? '#111' : '#1a1a1a', cursor: accepted ? 'default' : 'crosshair' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        />
        {accepted && (
          <div style={{ padding:'8px', fontSize:11, color:'#2d9e5f', textAlign:'center', borderTop:'1px solid rgba(45,158,95,0.2)' }}>
            ✓ Accepted at {acceptedAt}
          </div>
        )}
        {!signed && !accepted && (
          <div style={{ padding:'8px', fontSize:11, color:'#444', textAlign:'center', borderTop:'1px dashed #333' }}>
            ✍ Sign with mouse or Apple Pencil
          </div>
        )}
      </div>

      <Sep />

      {!accepted ? (
        <>
          {!allOk && (
            <div style={{ margin:'8px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #ff9500', fontSize:11, color:'#c4882a' }}>
              ⚠ Complete all pending items before accepting.
            </div>
          )}
          <button onClick={handleAccept} disabled={!signed || !allOk}
            style={{ width:'calc(100% - 32px)', margin:'12px 16px', background: signed && allOk ? '#2d9e5f' : '#2a2a2a', border:'none', borderRadius:10, padding:14, fontSize:14, fontWeight:700, color: signed && allOk ? '#fff' : '#444', cursor: signed && allOk ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
            {signed && allOk ? '✓ Accept & Sign Flight Plan' : 'Sign above to accept'}
          </button>
        </>
      ) : (
        <>
          <div style={{ margin:'8px 16px', padding:'12px', borderRadius:8, background:'rgba(45,158,95,0.1)', border:'1px solid rgba(45,158,95,0.3)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}>✅</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#2d9e5f' }}>Accepted & Signed</div>
              <div style={{ fontSize:10, color:'#555', marginTop:2 }}>
                {acceptedAt} · {pilots.find(p => p.code === preflightPilot)?.name}
              </div>
            </div>
            <button onClick={handleReEvaluate}
              style={{ background:'transparent', border:'1px solid #555', borderRadius:6, padding:'5px 10px', fontSize:10, fontWeight:700, color:'#777', cursor:'pointer', fontFamily:'inherit' }}>
              ↺ Re-evaluate
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', margin:'8px 16px 4px' }}>
            <button onClick={handleSync} disabled={synced}
              style={{ width:'100%', background: synced ? '#2d9e5f' : '#e8731a', border:'none', borderRadius:10, padding:14, fontSize:14, fontWeight:700, color:'#fff', cursor: synced ? 'default' : 'pointer', fontFamily:'inherit' }}>
              {synced ? '✓ Synced to PM' : '⇄ Sync to PM'}
            </button>
            {syncedAt && <div style={{ fontSize:10, color:'#555', marginTop:5 }}>Last sync: {syncedAt}</div>}
          </div>

          {synced && (
            <div style={{ margin:'4px 16px 12px', padding:'10px 12px', borderRadius:6, background:'rgba(45,158,95,0.08)', borderLeft:'3px solid #2d9e5f', fontSize:11, color:'#6db890' }}>
              ✓ Flight plan sent to PM.
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AcceptSign;