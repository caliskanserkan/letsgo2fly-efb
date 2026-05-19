import React, { useEffect, useRef, useState } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { supabase, logEvent } from '../supabaseClient';

const INITIAL_CHECKS = [
  { id:1, label:'General remarks & photos reviewed',  done:false },
  { id:2, label:'Tech log remarks reviewed',           done:false },
  { id:3, label:'Pre-flight acceptance completed',     done:false },
  { id:4, label:'AIRCRAFT SECURITY CHECKLIST',         done:false, section:'Aircraft Checklists' },
  { id:5, label:'MEL / HIL checked',                   done:false },
  { id:6, label:'EFB_CHECKLIST_CONSOLIDATED',          done:false, section:'EFB Checklist — AMC 20-25', isEfbConsolidated:true },
];

function SectionHeader({ title }) {
  return (
    <div style={{ padding:'8px 16px 4px', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', marginTop:8 }}>
      {title}
    </div>
  );
}

function SignatureCanvas({ onSave, onClear }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const ctx       = useRef(null);

  const initCtx = () => {
    if (ctx.current) return ctx.current;
    const c = canvasRef.current; if (!c) return null;
    const cx = c.getContext('2d');
    cx.strokeStyle = '#38bdf8'; cx.lineWidth = 2.5;
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    ctx.current = cx; return cx;
  };

  const getPos = (e) => {
    const c = canvasRef.current; if (!c) return {x:0,y:0};
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width, sy = c.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x:(src.clientX-r.left)*sx, y:(src.clientY-r.top)*sy };
  };

  const start = (e) => { e.preventDefault(); drawing.current=true; const cx=initCtx(); if(!cx)return; const p=getPos(e); cx.beginPath(); cx.moveTo(p.x,p.y); };
  const draw  = (e) => { e.preventDefault(); if(!drawing.current)return; const cx=initCtx(); if(!cx)return; const p=getPos(e); cx.lineTo(p.x,p.y); cx.stroke(); };
  const end   = () => { drawing.current=false; };

  const handleClear = () => {
    const c=canvasRef.current; if(!c)return;
    c.getContext('2d').clearRect(0,0,c.width,c.height);
    ctx.current=null; onClear();
  };

  const handleSave = () => {
    const c=canvasRef.current; if(!c)return;
    onSave(c.toDataURL('image/png'));
  };

  return (
    <div style={{ marginTop:12 }}>
      <div style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #334155', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#94a3b8', fontWeight:600, letterSpacing:'0.5px' }}>✍️ Digital Signature</span>
          <button onClick={handleClear} style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'4px 10px', fontSize:11, color:'#ef4444', cursor:'pointer', fontFamily:'inherit' }}>Clear</button>
        </div>
        <canvas ref={canvasRef} width={560} height={120}
          onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={end}
          style={{ display:'block', width:'100%', background:'#0f172a', cursor:'crosshair', touchAction:'none' }}/>
        <div style={{ padding:'6px 8px', fontSize:10, color:'#334155', textAlign:'center', borderTop:'1px solid #334155', fontStyle:'italic' }}>Sign above</div>
      </div>
      <button onClick={handleSave}
        style={{ marginTop:10, width:'100%', background:'#38bdf8', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:600, color:'#0f172a', cursor:'pointer', fontFamily:'inherit' }}>
        Save Signature
      </button>
    </div>
  );
}

function Mandatory({ setStatus, activePlan }) {
  const planKey = activePlan?.id || 'default';

  const [checks,        setChecks]        = usePersistedState(`efb_mandatory_checks_${planKey}`,    INITIAL_CHECKS);
  const [selectedPilot, setSelectedPilot] = usePersistedState(`efb_mandatory_sel_pilot_${planKey}`, null);
  const [signedBy,      setSignedBy]      = usePersistedState(`efb_mandatory_signed_by_${planKey}`, null);
  const [signedAt,      setSignedAt]      = usePersistedState(`efb_mandatory_signed_at_${planKey}`, null);
  const [sigDataUrl,    setSigDataUrl]    = usePersistedState(`efb_mandatory_sig_${planKey}`,       null);

  const [pfId] = usePersistedState('efb_crew_pf', null);
  const [pmId] = usePersistedState('efb_crew_pm', null);
  const [crewPilots, setCrewPilots] = useState([]);

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

  const toggle = (id) => {
    setChecks(prev => {
      const updated = prev.map(c => c.id===id ? {...c, done:!c.done} : c);
      const item = updated.find(c => c.id===id);
      logEvent(activePlan?.id, item.done ? 'MANDATORY_CHECK_DONE' : 'MANDATORY_CHECK_UNDONE', { check_label:item.label, check_id:id });
      return updated;
    });
  };

  const allDone = checks.every(c => c.done);
  const signed  = !!(signedBy && sigDataUrl);
  const doneCount = checks.filter(c => c.done).length;

  useEffect(() => {
    if (!setStatus) return;
    if (allDone && signed)                        setStatus('green');
    else if (allDone || checks.some(c => c.done)) setStatus('amber');
    else                                          setStatus('pending');
    if (allDone && signed) logEvent(activePlan?.id, 'PREFLIGHT_MANDATORY_COMPLETE', { checks_count:checks.length, signed_by:signedBy });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, signed]);

  const handleSaveSig = (dataUrl) => {
    if (!selectedPilot) return;
    const pilot = crewPilots.find(p => p.id === selectedPilot);
    setSigDataUrl(dataUrl); setSignedBy(selectedPilot); setSignedAt(new Date().toISOString());
    logEvent(activePlan?.id, 'MANDATORY_SIGNED', { pilot_id:selectedPilot, pilot_code:pilot?.code, pilot_name:pilot?.full_name, signed_at:new Date().toISOString() });
  };

  const handleClearSig = () => { setSigDataUrl(null); setSignedBy(null); setSignedAt(null); };
  const signingPilot = crewPilots.find(p => p.id === signedBy);

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>

      {/* Progress */}
      <div style={{ padding:'16px 16px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>Checks & Remarks</span>
          <span style={{ fontSize:12, color: allDone ? '#4ade80' : '#475569' }}>{doneCount} / {checks.length}</span>
        </div>
        <div style={{ height:4, background:'#1e293b', borderRadius:2, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(doneCount/checks.length)*100}%`, background: allDone ? '#4ade80' : '#38bdf8', borderRadius:2, transition:'width 0.3s' }} />
        </div>
      </div>

      {/* Checklist */}
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden', marginBottom:16 }}>
        {checks.map((c, idx) => (
          <React.Fragment key={c.id}>
            {c.section && (
              <div style={{ padding:'8px 16px', background:'#0f172a', borderTop: idx > 0 ? '1px solid #334155' : 'none', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1px', textTransform:'uppercase' }}>
                {c.section}
              </div>
            )}
            {c.isEfbConsolidated ? (
              <div onClick={() => toggle(c.id)}
                style={{ display:'flex', alignItems:'flex-start', padding:'14px 16px', borderBottom:'1px solid #1e293b', gap:14, cursor:'pointer', background: c.done ? 'rgba(74,222,128,0.04)' : 'transparent', minHeight:60 }}>
                <div style={{ width:24, height:24, borderRadius:7, flexShrink:0, marginTop:2, background: c.done ? '#4ade80' : 'transparent', border:`2px solid ${c.done ? '#4ade80' : '#334155'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {c.done && <span style={{ fontSize:13, color:'#0f172a', fontWeight:700 }}>✓</span>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color: c.done ? '#475569' : '#94a3b8', lineHeight:1.7, textDecoration: c.done ? 'line-through' : 'none', fontStyle:'italic' }}>
                    EFB battery ≥80%, application version current, screen brightness suitable for conditions, backup procedure available, EFB secured at duty station, GPS NOT FOR NAVIGATION acknowledged.
                  </div>
                  {!c.done && <div style={{ fontSize:11, color:'#f97316', fontWeight:600, marginTop:6 }}>Tap to confirm all EFB checklist items</div>}
                  {c.done  && <div style={{ fontSize:11, color:'#4ade80', fontWeight:600, marginTop:6 }}>✓ Read and acknowledged</div>}
                </div>
              </div>
            ) : (
              <div onClick={() => toggle(c.id)}
                style={{ display:'flex', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid #1e293b', gap:14, cursor:'pointer', background: c.done ? 'rgba(74,222,128,0.04)' : 'transparent', minHeight:56 }}>
                <div style={{ width:24, height:24, borderRadius:7, flexShrink:0, background: c.done ? '#4ade80' : 'transparent', border:`2px solid ${c.done ? '#4ade80' : '#334155'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {c.done && <span style={{ fontSize:13, color:'#0f172a', fontWeight:700 }}>✓</span>}
                </div>
                <span style={{ fontSize:13, color: c.done ? '#475569' : '#f1f5f9', flex:1, textDecoration: c.done ? 'line-through' : 'none' }}>{c.label}</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Warning */}
      {!allDone && (
        <div style={{ margin:'0 12px 16px', padding:'12px 14px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>⚠️</span>
          <span style={{ fontSize:12, color:'#fbbf24' }}>Complete all checks before signing.</span>
        </div>
      )}

      {/* Sign-off Section */}
      <div style={{ padding:'0 16px 8px' }}>
        <div style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>Preflight Sign-off</div>
      </div>

      {/* Signed */}
      {signed && (
        <div style={{ margin:'0 12px 16px', background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid rgba(74,222,128,0.15)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:'#4ade80' }}>✓ Preflight Signed</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>
                {signingPilot ? `${signingPilot.code} — ${signingPilot.full_name}` : signedBy}
                {signedAt && <span style={{ marginLeft:8 }}>{new Date(signedAt).toLocaleTimeString('en-GB').slice(0,5)} UTC</span>}
              </div>
            </div>
            <button onClick={handleClearSig} style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:'6px 12px', fontSize:11, color:'#94a3b8', cursor:'pointer', fontFamily:'inherit' }}>Re-sign</button>
          </div>
          {sigDataUrl && <img src={sigDataUrl} alt="sig" style={{ width:'100%', height:70, objectFit:'contain', background:'#0f172a', display:'block' }} />}
        </div>
      )}

      {/* Not signed */}
      {!signed && (
        <div style={{ margin:'0 12px 16px' }}>
          <div style={{ fontSize:11, color:'#475569', marginBottom:10 }}>Select pilot performing preflight:</div>

          {crewPilots.length === 0 && (
            <div style={{ padding:'12px 14px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', fontSize:12, color:'#fbbf24' }}>
              No pilots assigned. Go to Flight & Crew first.
            </div>
          )}

          {crewPilots.map(pilot => (
            <div key={pilot.id} onClick={() => setSelectedPilot(pilot.id)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 14px', marginBottom:8, borderRadius:12, cursor:'pointer', background: selectedPilot===pilot.id ? 'rgba(56,189,248,0.08)' : '#1e293b', border:`1.5px solid ${selectedPilot===pilot.id ? '#38bdf8' : '#334155'}`, minHeight:56 }}>
              <div style={{ width:20, height:20, borderRadius:10, border:`2px solid ${selectedPilot===pilot.id ? '#38bdf8' : '#334155'}`, background: selectedPilot===pilot.id ? '#38bdf8' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {selectedPilot===pilot.id && <div style={{ width:6, height:6, borderRadius:3, background:'#0f172a' }} />}
              </div>
              <div style={{ flex:1 }}>
                <span style={{ fontSize:13, color: selectedPilot===pilot.id ? '#f1f5f9' : '#94a3b8', fontWeight:600 }}>{pilot.code} — {pilot.full_name}</span>
              </div>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: pilot.role==='PF' ? 'rgba(56,189,248,0.15)' : 'rgba(148,163,184,0.1)', color: pilot.role==='PF' ? '#38bdf8' : '#94a3b8', border:`1px solid ${pilot.role==='PF' ? 'rgba(56,189,248,0.3)' : 'rgba(148,163,184,0.2)'}` }}>
                {pilot.role}
              </span>
            </div>
          ))}

          {selectedPilot && <SignatureCanvas onSave={handleSaveSig} onClear={handleClearSig} />}
          {!selectedPilot && crewPilots.length > 0 && (
            <div style={{ padding:'10px 0', fontSize:12, color:'#334155', fontStyle:'italic' }}>Select a pilot above to sign.</div>
          )}
        </div>
      )}

      {/* Final status */}
      {allDone && signed && (
        <div style={{ margin:'0 12px', padding:'12px 14px', borderRadius:10, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>✅</span>
          <span style={{ fontSize:12, color:'#4ade80', fontWeight:600 }}>All checks complete and signed off.</span>
        </div>
      )}
      {allDone && !signed && (
        <div style={{ margin:'0 12px', padding:'12px 14px', borderRadius:10, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:18 }}>✍️</span>
          <span style={{ fontSize:12, color:'#fbbf24', fontWeight:600 }}>Checks complete — signature required.</span>
        </div>
      )}
    </div>
  );
}

export default Mandatory;