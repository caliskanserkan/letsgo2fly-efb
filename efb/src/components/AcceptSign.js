import React, { useState, useRef, useEffect } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { supabase, logEvent } from '../supabaseClient';

const nowUTC = () => {
  const d = new Date();
  return `${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')} Z`;
};

function StatusRow({ label, ok, inProgress, value }) {
  const color = ok ? '#4ade80' : inProgress ? '#fbbf24' : '#475569';
  const icon  = ok ? '✓' : inProgress ? '◐' : '○';
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 16px', borderBottom:'1px solid #1e293b', minHeight:50 }}>
      <span style={{ fontSize:13, color:'#94a3b8', flex:1 }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:600, color, display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ width:18, height:18, borderRadius:'50%', background: ok ? 'rgba(74,222,128,0.15)' : inProgress ? 'rgba(251,191,36,0.15)' : 'rgba(71,85,105,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>{icon}</span>
        {value}
      </span>
    </div>
  );
}

function AcceptSign({ setStatus, pageStatus, activePlan }) {
  const planKey = activePlan?.id || 'default';

  const [preflightPilotId, setPreflightPilotId] = usePersistedState(`efb_accept_pilot_${planKey}`,      null);
  const [accepted,         setAccepted]          = usePersistedState(`efb_accept_accepted_${planKey}`,  false);
  const [acceptedAt,       setAcceptedAt]        = usePersistedState(`efb_accept_acceptedAt_${planKey}`,'');
  const [synced,           setSynced]            = usePersistedState(`efb_accept_synced_${planKey}`,    false);
  const [syncedAt,         setSyncedAt]          = usePersistedState(`efb_accept_syncedAt_${planKey}`,  '');

  const [pfId] = usePersistedState('efb_crew_pf', null);
  const [pmId] = usePersistedState('efb_crew_pm', null);
  const [crewPilots, setCrewPilots] = useState([]);
  const [signed,  setSigned]  = useState(false);
  const [drawing, setDrawing] = useState(false);
  const canvasRef = useRef(null);
  const ps = pageStatus || {};

  useEffect(() => {
    const ids = [pfId, pmId].filter(Boolean);
    if (!ids.length) { setCrewPilots([]); return; }
    (async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, code').in('id', ids);
      if (data) {
        const ordered = [];
        if (pfId) { const p = data.find(d => d.id === pfId); if (p) ordered.push({ ...p, role:'PF' }); }
        if (pmId) { const p = data.find(d => d.id === pmId); if (p) ordered.push({ ...p, role:'PM' }); }
        setCrewPilots(ordered);
      }
    })();
  }, [pfId, pmId]);

  const statuses = [
    { label:'Flight & crew assigned', ok:ps['flt-crew']==='green',  inProgress:ps['flt-crew']==='amber',  value:ps['flt-crew']==='green'?'Complete':ps['flt-crew']==='amber'?'In Progress…':'Pending' },
    { label:'Mandatory / Preflight',  ok:ps['mandatory']==='green', inProgress:ps['mandatory']==='amber', value:ps['mandatory']==='green'?'Complete':ps['mandatory']==='amber'?'In Progress…':'Pending' },
    { label:'eFP documents loaded',   ok:ps['efp']==='green',       inProgress:ps['efp']==='amber',       value:ps['efp']==='green'?'Loaded ✓':ps['efp']==='amber'?'In Progress…':'Not viewed' },
    { label:'Fuel uplift entered',    ok:ps['fuel']==='green',      inProgress:ps['fuel']==='amber',      value:ps['fuel']==='green'?'Complete':ps['fuel']==='amber'?'In Progress…':'Pending' },
  ];

  const allOk = statuses.every(s => s.ok);
  const doneCount = statuses.filter(s => s.ok).length;

  useEffect(() => {
    if (!setStatus) return;
    if (accepted)    setStatus('green');
    else if (signed) setStatus('amber');
    else             setStatus('pending');
  }, [accepted, signed, setStatus]);

  const getPos = (e) => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x:(src.clientX-rect.left)*scaleX, y:(src.clientY-rect.top)*scaleY };
  };

  const startDraw = (e) => { e.preventDefault(); if (accepted) return; setDrawing(true); setSigned(false); const pos=getPos(e); const ctx=canvasRef.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(pos.x,pos.y); };
  const draw = (e) => { e.preventDefault(); if (!drawing) return; const pos=getPos(e); const ctx=canvasRef.current.getContext('2d'); ctx.strokeStyle='#ef4444'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.lineTo(pos.x,pos.y); ctx.stroke(); };
  const endDraw = () => { setDrawing(false); setSigned(true); };

  const clearSig = () => {
    if (accepted) return;
    canvasRef.current.getContext('2d').clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
    setSigned(false);
  };

  const selectedPilot = crewPilots.find(p => p.id === preflightPilotId);
  const picPilot = crewPilots.find(p => p.role === 'PF');

  const handleAccept = () => {
    if (!signed || !allOk) return;
    const t = nowUTC();
    setAccepted(true); setAcceptedAt(t);
    logEvent(activePlan?.id, 'PLAN_ACCEPTED', { accepted_at:t, preflight_by:preflightPilotId, preflight_by_name:selectedPilot?.full_name, pic_code:picPilot?.code, pic_name:picPilot?.full_name });
  };

  const handleReEvaluate = () => {
    setAccepted(false); setSigned(false); setSynced(false); setSyncedAt(''); setAcceptedAt('');
    if (canvasRef.current) canvasRef.current.getContext('2d').clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
    logEvent(activePlan?.id, 'PLAN_ACCEPTANCE_REVOKED', {});
  };

  const handleSync = () => {
    const t = nowUTC(); setSynced(true); setSyncedAt(t);
    logEvent(activePlan?.id, 'SYNC_TO_PM', { synced_at:t });
  };

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>

      {/* Pre-flight Status */}
      <div style={{ padding:'16px 16px 8px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>Pre-flight Status</span>
        <span style={{ fontSize:12, color: allOk ? '#4ade80' : '#475569' }}>{doneCount} / {statuses.length}</span>
      </div>

      {/* Progress bar */}
      <div style={{ margin:'0 12px 12px', height:4, background:'#1e293b', borderRadius:2, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${(doneCount/statuses.length)*100}%`, background:allOk?'#4ade80':'#38bdf8', borderRadius:2, transition:'width 0.3s' }} />
      </div>

      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        {statuses.map((s,i) => <StatusRow key={i} {...s} />)}
      </div>

      {!allOk && (
        <div style={{ margin:'0 12px 16px', padding:'12px 14px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <span style={{ fontSize:12, color:'#fbbf24' }}>Complete all pending items before accepting.</span>
        </div>
      )}

      {/* Pre-flight performed by */}
      <div style={{ padding:'0 16px 8px' }}>
        <span style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>Pre-flight Performed By</span>
      </div>

      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #334155', fontSize:11, color:'#475569' }}>
          Select pilot who performed pre-flight inspection
        </div>
        {crewPilots.length === 0 && (
          <div style={{ padding:'16px 14px', fontSize:12, color:'#475569' }}>No pilots assigned — go to Flight & Crew first.</div>
        )}
        {crewPilots.map(p => {
          const sel = preflightPilotId === p.id;
          return (
            <div key={p.id} onClick={() => !accepted && setPreflightPilotId(p.id)}
              style={{ display:'flex', alignItems:'center', padding:'13px 14px', borderBottom:'1px solid #1e293b', cursor:accepted?'default':'pointer', background:sel?'rgba(56,189,248,0.08)':'transparent', minHeight:56, gap:12 }}>
              <div style={{ width:22, height:22, borderRadius:11, border:`2px solid ${sel?'#38bdf8':'#334155'}`, background:sel?'#38bdf8':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {sel && <div style={{ width:7, height:7, background:'#0f172a', borderRadius:4 }} />}
              </div>
              <span style={{ fontSize:13, color:sel?'#f1f5f9':'#94a3b8', flex:1, fontWeight:sel?600:400 }}>{p.code} — {p.full_name}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background:p.role==='PF'?'rgba(56,189,248,0.15)':'rgba(148,163,184,0.1)', color:p.role==='PF'?'#38bdf8':'#94a3b8', border:`1px solid ${p.role==='PF'?'rgba(56,189,248,0.3)':'rgba(148,163,184,0.2)'}` }}>
                {p.role}
              </span>
            </div>
          );
        })}
      </div>

      {/* PIC Declaration */}
      <div style={{ padding:'0 16px 8px' }}>
        <span style={{ fontSize:11, color:'#ef4444', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>PIC Declaration</span>
      </div>

      <div style={{ margin:'0 12px 12px', padding:'12px 14px', borderRadius:10, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', fontSize:12, color:'#fca5a5', lineHeight:1.7 }}>
        I confirm that pre-flight procedures have been completed, all entries are correct, and the aircraft is airworthy for this flight.
      </div>

      {/* Signature canvas */}
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:`1.5px solid ${accepted?'#4ade80':'rgba(239,68,68,0.4)'}`, overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${accepted?'rgba(74,222,128,0.2)':'rgba(239,68,68,0.2)'}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, color:accepted?'#4ade80':'#ef4444', fontWeight:600 }}>
            {accepted ? `✓ Signed & Accepted — ${picPilot?.full_name || 'PIC'}` : `✍️ PIC Signature — ${picPilot?.full_name || 'Select crew first'}`}
          </span>
          {signed && !accepted && (
            <span onClick={clearSig} style={{ fontSize:11, color:'#ef4444', cursor:'pointer', padding:'3px 8px', background:'rgba(239,68,68,0.1)', borderRadius:6 }}>Clear</span>
          )}
        </div>
        <canvas ref={canvasRef} width={450} height={120}
          style={{ display:'block', width:'100%', background:accepted?'#0a0a0a':'#0f172a', cursor:accepted?'default':'crosshair', touchAction:'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
        {accepted && (
          <div style={{ padding:'10px 14px', fontSize:12, color:'#4ade80', display:'flex', alignItems:'center', gap:8, borderTop:'1px solid rgba(74,222,128,0.15)' }}>
            <span>✓</span>
            <span>Accepted at {acceptedAt} · {selectedPilot ? `${selectedPilot.code} — ${selectedPilot.full_name}` : '—'}</span>
          </div>
        )}
        {!signed && !accepted && (
          <div style={{ padding:'8px', fontSize:11, color:'#334155', textAlign:'center', borderTop:'1px dashed #1e293b' }}>
            Sign with Apple Pencil or finger
          </div>
        )}
      </div>

      {/* Accept button */}
      {!accepted && (
        <div style={{ margin:'0 12px 16px' }}>
          <button onClick={handleAccept} disabled={!signed || !allOk}
            style={{ width:'100%', background:signed&&allOk?'#ef4444':'#1e293b', border:signed&&allOk?'none':'1px solid #334155', borderRadius:14, padding:16, fontSize:15, fontWeight:700, color:signed&&allOk?'#fff':'#334155', cursor:signed&&allOk?'pointer':'not-allowed', fontFamily:'inherit', transition:'background 0.2s' }}>
            {signed && allOk ? '✓ Accept & Sign Flight Plan' : 'Sign above to accept'}
          </button>
        </div>
      )}

      {/* Accepted state */}
      {accepted && (
        <>
          <div style={{ margin:'0 12px 12px', padding:'14px', borderRadius:14, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:24 }}>✅</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'#4ade80' }}>Accepted & Signed</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:3 }}>{acceptedAt} · {selectedPilot?`${selectedPilot.code} — ${selectedPilot.full_name}`:'—'}</div>
            </div>
            <button onClick={handleReEvaluate} style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'6px 12px', fontSize:11, color:'#94a3b8', cursor:'pointer', fontFamily:'inherit' }}>
              Re-evaluate
            </button>
          </div>

          <div style={{ margin:'0 12px 8px' }}>
            <button onClick={handleSync} disabled={synced}
              style={{ width:'100%', background:synced?'rgba(74,222,128,0.1)':'#f97316', border:synced?'1px solid rgba(74,222,128,0.3)':'none', borderRadius:14, padding:16, fontSize:15, fontWeight:700, color:synced?'#4ade80':'#fff', cursor:synced?'default':'pointer', fontFamily:'inherit' }}>
              {synced ? '✓ Synced to PM' : '⇄ Sync to PM'}
            </button>
            {syncedAt && <div style={{ fontSize:11, color:'#475569', marginTop:6, textAlign:'center' }}>Last sync: {syncedAt}</div>}
          </div>

          {synced && (
            <div style={{ margin:'8px 12px', padding:'12px 14px', borderRadius:10, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:16 }}>✓</span>
              <span style={{ fontSize:12, color:'#4ade80', fontWeight:600 }}>Flight plan sent to PM.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default AcceptSign;