import React, { useEffect, useRef } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { logEvent } from '../supabaseClient';

// Same pilot list as FlightCrew.js
const ALL_PILOTS = [
  { code:'AAK', name:'Capt. Ahmet Akpinar'  },
  { code:'SEL', name:'Capt. Selcuk Ekinci'  },
  { code:'SCL', name:'Capt. Serkan Caliskan'},
];

const INITIAL_CHECKS = [
  { id:1, label:'General remarks & photos reviewed', done:false },
  { id:2, label:'Tech log remarks reviewed',         done:false },
  { id:3, label:'Pre-flight acceptance completed',   done:false },
  { id:4, label:'AIRCRAFT SECURITY CHECKLIST',       done:false, section:'Aircraft Checklists' },
  { id:5, label:'MEL / HIL checked',                done:false },
  { id:6, label:'EFB_CHECKLIST_CONSOLIDATED',        done:false, section:'EFB Checklist — AMC 20-25', isEfbConsolidated:true },
];

function SectionHeader({ title }) {
  return (
    <div style={{ background:'#1f1f1f', padding:'7px 16px', fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.8, borderBottom:'1px solid #383838', borderTop:'1px solid #383838', textTransform:'uppercase' }}>
      {title}
    </div>
  );
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────
function SignatureCanvas({ onSave, onClear }) {
  const canvasRef = useRef(null);
  const drawing   = useRef(false);
  const ctx       = useRef(null);

  const initCtx = () => {
    if (ctx.current) return ctx.current;
    const c = canvasRef.current; if (!c) return null;
    const cx = c.getContext('2d');
    cx.strokeStyle = '#1a9bc4'; cx.lineWidth = 2.5;
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
    <div style={{marginTop:10}}>
      <div style={{background:'#1f1f1f',border:'1px solid #383838',borderRadius:8,overflow:'hidden'}}>
        <div style={{padding:'7px 12px',borderBottom:'1px solid #383838',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.7,textTransform:'uppercase'}}>Digital Signature</span>
          <button onClick={handleClear} style={{background:'none',border:'1px solid #444',borderRadius:4,padding:'2px 8px',fontSize:10,color:'#e02020',cursor:'pointer',fontFamily:'inherit'}}>Clear</button>
        </div>
        <canvas ref={canvasRef} width={560} height={120}
          onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={end}
          style={{display:'block',width:'100%',background:'#1a1a1a',cursor:'crosshair',touchAction:'none'}}/>
        <div style={{padding:'6px 8px',fontSize:10,color:'#444',textAlign:'center',borderTop:'1px solid #383838',fontStyle:'italic'}}>Sign above</div>
      </div>
      <button onClick={handleSave}
        style={{marginTop:8,width:'100%',background:'#1a9bc4',border:'none',borderRadius:8,padding:'12px',fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit'}}>
        ✎ Save Signature
      </button>
    </div>
  );
}

// ─── Mandatory Main ───────────────────────────────────────────────────────────
function Mandatory({ setStatus, activePlan }) {
  const planKey = activePlan?.id || 'default';

  const [checks,         setChecks]         = usePersistedState(`efb_mandatory_checks_${planKey}`,     INITIAL_CHECKS);
  const [selectedPilot,  setSelectedPilot]  = usePersistedState(`efb_mandatory_sel_pilot_${planKey}`,  null);
  const [signedBy,       setSignedBy]       = usePersistedState(`efb_mandatory_signed_by_${planKey}`,  null);
  const [signedAt,       setSignedAt]       = usePersistedState(`efb_mandatory_signed_at_${planKey}`,  null);
  const [sigDataUrl,     setSigDataUrl]     = usePersistedState(`efb_mandatory_sig_${planKey}`,        null);

  // Read assigned crew codes from FlightCrew (same keys)
  const [pfCode] = usePersistedState('efb_crew_pf', 'AAK');
  const [pmCode] = usePersistedState('efb_crew_pm', 'SEL');

  // Build pilot list from assigned crew
  const crewPilots = [pfCode, pmCode]
    .filter(Boolean)
    .map(code => ({ ...ALL_PILOTS.find(p => p.code === code), role: code === pfCode ? 'PF' : 'PM' }))
    .filter(p => p.code);

  const toggle = (id) => {
    setChecks(prev => {
      const updated = prev.map(c => c.id===id ? {...c, done:!c.done} : c);
      const item    = updated.find(c => c.id===id);
      logEvent(activePlan?.id, item.done ? 'MANDATORY_CHECK_DONE' : 'MANDATORY_CHECK_UNDONE', {
        check_label: item.label, check_id: id,
      });
      return updated;
    });
  };

  const allDone = checks.every(c => c.done);
  const signed  = !!(signedBy && sigDataUrl);

  useEffect(() => {
    if (!setStatus) return;
    if (allDone && signed)         setStatus('green');
    else if (allDone || checks.some(c => c.done)) setStatus('amber');
    else                           setStatus('pending');
    if (allDone && signed) {
      logEvent(activePlan?.id, 'PREFLIGHT_MANDATORY_COMPLETE', {
        checks_count: checks.length, signed_by: signedBy,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, signed]);

  const handleSaveSig = (dataUrl) => {
    if (!selectedPilot) return;
    setSigDataUrl(dataUrl);
    setSignedBy(selectedPilot);
    setSignedAt(new Date().toISOString());
    logEvent(activePlan?.id, 'MANDATORY_SIGNED', {
      pilot_code: selectedPilot,
      pilot_name: ALL_PILOTS.find(p => p.code === selectedPilot)?.name,
      signed_at:  new Date().toISOString(),
    });
  };

  const handleClearSig = () => { setSigDataUrl(null); setSignedBy(null); setSignedAt(null); };

  const signingPilot = ALL_PILOTS.find(p => p.code === signedBy);

  return (
    <div>
      <div style={{fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.9,padding:'12px 16px 5px',textTransform:'uppercase'}}>
        Checks & Remarks
      </div>

      {checks.map(c => (
        <React.Fragment key={c.id}>
          {c.section && <SectionHeader title={c.section}/>}

          {c.isEfbConsolidated ? (
            <div onClick={()=>toggle(c.id)}
              style={{display:'flex',alignItems:'flex-start',padding:'14px 16px',background:'#2e2e2e',borderBottom:'1px solid #383838',gap:12,cursor:'pointer'}}>
              <div style={{width:20,height:20,borderRadius:4,border:c.done?'none':'1px solid #444',background:c.done?'#2d9e5f':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,color:'#fff',marginTop:2}}>
                {c.done?'✓':''}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:c.done?'#555':'#888',marginBottom:6,lineHeight:1.7,fontStyle:'italic',textDecoration:c.done?'line-through':'none'}}>
                  <b>"</b><b>EFB battery ≥80%, application version current, screen brightness suitable for conditions, backup procedure available (paper/alternate), EFB secured at duty station, GPS position NOT FOR NAVIGATION acknowledged.</b><b>"</b>
                </div>
                {!c.done && <div style={{fontSize:10,color:'#e8731a',fontWeight:700}}>Tap to confirm all EFB checklist items.</div>}
                {c.done  && <div style={{fontSize:10,color:'#2d9e5f',fontWeight:700}}>✓ Read and acknowledged</div>}
              </div>
            </div>
          ) : (
            <div onClick={()=>toggle(c.id)}
              style={{display:'flex',alignItems:'center',padding:'12px 16px',background:'#2e2e2e',borderBottom:'1px solid #383838',gap:12,cursor:'pointer'}}>
              <div style={{width:20,height:20,borderRadius:4,border:c.done?'none':'1px solid #444',background:c.done?'#2d9e5f':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,color:'#fff'}}>
                {c.done?'✓':''}
              </div>
              <span style={{fontSize:12.5,color:c.done?'#4a4a4a':'#999',flex:1,textDecoration:c.done?'line-through':'none'}}>{c.label}</span>
            </div>
          )}
        </React.Fragment>
      ))}

      {!allDone && (
        <div style={{margin:'12px 16px',padding:'10px 12px',borderRadius:6,background:'rgba(255,149,0,0.08)',borderLeft:'3px solid #ff9500',fontSize:11,color:'#c4882a',lineHeight:1.6}}>
          Complete all checks before signing.
        </div>
      )}

      {/* ── Sign-off Section ─────────────────────────────────────────────── */}
      <div style={{height:12,background:'#1e1e1e',borderTop:'1px solid #383838',borderBottom:'1px solid #383838'}}/>
      <div style={{fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.9,padding:'12px 16px 5px',textTransform:'uppercase'}}>
        Preflight Check Sign-off
      </div>

      {/* Already signed — summary */}
      {signed && (
        <div style={{margin:'8px 16px',padding:'12px 14px',borderRadius:8,background:'rgba(45,158,95,0.08)',border:'1px solid rgba(45,158,95,0.25)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'#2d9e5f'}}>✓ Preflight signed</div>
              <div style={{fontSize:11,color:'#555',marginTop:2}}>
                {signingPilot ? `${signingPilot.code} — ${signingPilot.name}` : signedBy}
                {signedAt && <span style={{marginLeft:8,color:'#444'}}>{new Date(signedAt).toLocaleTimeString('en-GB').slice(0,5)} UTC</span>}
              </div>
            </div>
            <button onClick={handleClearSig}
              style={{background:'none',border:'1px solid #444',borderRadius:5,padding:'4px 10px',fontSize:10,color:'#666',cursor:'pointer',fontFamily:'inherit'}}>
              Re-sign
            </button>
          </div>
          {sigDataUrl && (
            <img src={sigDataUrl} alt="sig"
              style={{width:'100%',height:60,objectFit:'contain',background:'#1a1a1a',borderRadius:5,border:'1px solid #2a3040'}}/>
          )}
        </div>
      )}

      {/* Not yet signed — pilot selection + canvas */}
      {!signed && (
        <div style={{margin:'8px 16px'}}>
          <div style={{fontSize:10,color:'#555',fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',marginBottom:8}}>
            Select pilot performing preflight:
          </div>

          {/* PF and PM from FlightCrew */}
          {crewPilots.map(pilot => (
            <div key={pilot.code} onClick={()=>setSelectedPilot(pilot.code)}
              style={{
                display:'flex',alignItems:'center',gap:12,padding:'11px 12px',marginBottom:6,
                borderRadius:7,cursor:'pointer',
                background: selectedPilot===pilot.code ? 'rgba(26,155,196,0.1)' : '#2a2a2a',
                border:`1px solid ${selectedPilot===pilot.code ? '#1a9bc4' : '#383838'}`,
              }}>
              {/* Radio */}
              <div style={{width:18,height:18,borderRadius:9,border:`2px solid ${selectedPilot===pilot.code?'#1a9bc4':'#444'}`,background:selectedPilot===pilot.code?'#1a9bc4':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {selectedPilot===pilot.code && <div style={{width:6,height:6,borderRadius:3,background:'#fff'}}/>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:12.5,color:selectedPilot===pilot.code?'#e8e8e8':'#999',fontWeight:600}}>
                  {pilot.code} — {pilot.name}
                </div>
              </div>
              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:4,letterSpacing:0.5,
                background:pilot.role==='PF'?'rgba(26,155,196,0.2)':'rgba(142,142,147,0.15)',
                color:pilot.role==='PF'?'#1a9bc4':'#777'}}>
                {pilot.role}
              </span>
            </div>
          ))}

          {/* Signature canvas — after pilot selected */}
          {selectedPilot && (
            <SignatureCanvas onSave={handleSaveSig} onClear={handleClearSig}/>
          )}

          {!selectedPilot && (
            <div style={{padding:'8px 0',fontSize:11,color:'#444',fontStyle:'italic'}}>
              Select a pilot above to sign.
            </div>
          )}
        </div>
      )}

      {/* Final status */}
      {allDone && signed && (
        <div style={{margin:'12px 16px 4px',padding:'10px 12px',borderRadius:6,background:'rgba(45,158,95,0.08)',borderLeft:'3px solid #2d9e5f',fontSize:11,color:'#6db890',lineHeight:1.6}}>
          ✓ All checks complete and signed off.
        </div>
      )}
      {allDone && !signed && (
        <div style={{margin:'12px 16px 4px',padding:'10px 12px',borderRadius:6,background:'rgba(255,149,0,0.08)',borderLeft:'3px solid #ff9500',fontSize:11,color:'#c4882a',lineHeight:1.6}}>
          Checks complete — signature required.
        </div>
      )}
    </div>
  );
}

export default Mandatory;