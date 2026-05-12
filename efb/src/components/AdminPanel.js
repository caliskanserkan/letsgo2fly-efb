// AdminPanel.js — GO2 eFB Admin Panel v3
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const C = {
  bg:'#0a0c10',bg2:'#0d1117',bg3:'#111620',border:'#1e2530',border2:'#2a3040',
  accent:'#e8a020',accentDim:'#4a3010',t1:'#ffffff',t2:'#ffffff',t3:'#ffffff',
  green:'#2d7a4f',greenDim:'#0a1a10',red:'#c04040',redDim:'#1a0808',
  blue:'#1a6b9c',blueDim:'#0a1a2a',
};
const S = {
  sidebar:{width:200,background:C.bg2,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0},
  navItem:(a)=>({padding:'11px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,borderLeft:`3px solid ${a?C.accent:'transparent'}`,background:a?`${C.accent}10`:'transparent',borderBottom:`1px solid ${C.border}`,transition:'all 0.15s'}),
  navLabel:(a)=>({fontSize:16,fontWeight:a?700:500,color:a?C.accent:C.t1,letterSpacing:0.5,fontFamily:"'Courier New',monospace",textTransform:'uppercase'}),
  navIcon:{fontSize:18,width:20,textAlign:'center'},
  label:{fontSize:11,color:C.t3,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',fontFamily:"'Courier New',monospace"},
  table:{width:'100%',borderCollapse:'collapse',fontSize:11},
  th:{padding:'10px 14px',textAlign:'left',fontSize:14,color:'#fff',fontWeight:700,letterSpacing:1,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`,fontFamily:"'Courier New',monospace",background:C.bg3},
  td:{padding:'11px 14px',borderBottom:`1px solid ${C.border}`,color:'#fff',fontFamily:"'Courier New',monospace",fontSize:15,fontWeight:600,verticalAlign:'middle'},
  badge:(c)=>({display:'inline-block',padding:'3px 9px',fontSize:13,letterSpacing:1,fontWeight:700,fontFamily:"'Courier New',monospace",background:c==='green'?C.greenDim:c==='red'?C.redDim:c==='blue'?C.blueDim:`${C.accent}10`,color:c==='green'?'#40d080':c==='red'?'#f06060':c==='blue'?'#4a9bc4':C.accent,border:`1px solid ${c==='green'?'#1a4030':c==='red'?'#602020':c==='blue'?'#1a3a5a':C.accentDim}`}),
  input:{width:'100%',background:'#080c12',border:`1px solid ${C.border}`,color:'#fff',padding:'10px 12px',fontSize:16,fontFamily:"'Courier New',monospace",outline:'none',boxSizing:'border-box'},
  select:{width:'100%',background:'#080c12',border:`1px solid ${C.border}`,color:'#fff',padding:'10px 12px',fontSize:16,fontFamily:"'Courier New',monospace",outline:'none',boxSizing:'border-box',appearance:'none'},
  btnPrimary:{background:C.accent,color:'#0a0c10',border:'none',padding:'10px 22px',fontSize:14,fontFamily:"'Courier New',monospace",fontWeight:700,letterSpacing:1.5,cursor:'pointer',textTransform:'uppercase'},
  btnSecondary:{background:'none',color:'#fff',border:`1px solid ${C.border2}`,padding:'8px 16px',fontSize:14,fontFamily:"'Courier New',monospace",cursor:'pointer',letterSpacing:1},
  btnDanger:{background:'none',color:C.red,border:'1px solid #3a1010',padding:'7px 14px',fontSize:14,fontFamily:"'Courier New',monospace",cursor:'pointer',letterSpacing:1},
  formGroup:{marginBottom:16},
  formLabel:{display:'block',fontSize:14,color:'#fff',letterSpacing:1,fontWeight:700,textTransform:'uppercase',fontFamily:"'Courier New',monospace",marginBottom:7},
  modal:{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200},
  modalBox:{background:C.bg2,border:`1px solid ${C.border2}`,padding:28,minWidth:400,maxWidth:560,width:'90%',maxHeight:'85vh',overflowY:'auto'},
  toast:(t)=>({position:'fixed',bottom:24,right:24,background:t==='error'?C.redDim:C.greenDim,border:`1px solid ${t==='error'?'#602020':'#206040'}`,color:t==='error'?'#f06060':'#40d080',padding:'10px 18px',fontSize:11,fontFamily:"'Courier New',monospace",zIndex:1000,letterSpacing:1}),
};

function Toast({msg,type,onClose}){
  useEffect(()=>{const t=setTimeout(onClose,3500);return()=>clearTimeout(t);},[onClose]);
  if(!msg)return null;
  return <div style={S.toast(type)}>{type==='error'?'! ':'OK '}{msg}</div>;
}
function Modal({title,children,onClose,width}){
  return(
    <div style={S.modal} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{...S.modalBox,...(width?{minWidth:width}:{})}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:11,color:C.accent,letterSpacing:3,fontWeight:700,fontFamily:"'Courier New',monospace",textTransform:'uppercase'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18}}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function DetailPanel({title,children,onClose,width}){
  if(!children)return null;
  return(
    <div style={{width:width||360,background:C.bg2,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:2,fontFamily:"'Courier New',monospace",textTransform:'uppercase'}}>{title}</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:16}}>x</button>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>{children}</div>
    </div>
  );
}
function DetailRow({label,value,accent}){
  return(
    <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:14,color:'#fff',fontWeight:700,letterSpacing:1,fontFamily:"'Courier New',monospace",textTransform:'uppercase'}}>{label}</span>
      <span style={{fontSize:15,color:accent?C.accent:'#fff',fontFamily:"'Courier New',monospace",fontWeight:700}}>{value||'—'}</span>
    </div>
  );
}

// ─── ACTION META (tüm log tipleri) ────────────────────────────────────────────
const ACTION_META = {
  PLAN_RELEASED:              {icon:'>>',label:'Plan Released',          color:'#e8a020'},
  PLAN_DOWNLOADED:            {icon:'<<',label:'Plan Downloaded',        color:'#1a9bc4'},
  CREW_ASSIGNED:              {icon:'**',label:'Crew Assigned',          color:'#1a9bc4'},
  PREFLIGHT_MANDATORY_COMPLETE:{icon:'OK',label:'Mandatory Complete',    color:'#2d9e5f'},
  MANDATORY_CHECK_DONE:       {icon:'[x]',label:'Check Done',            color:'#2d9e5f'},
  MANDATORY_CHECK_UNDONE:     {icon:'[ ]',label:'Check Undone',          color:'#e8731a'},
  MANDATORY_SIGNED:           {icon:'///',label:'Mandatory Signed',      color:'#2d9e5f'},
  FUEL_CHECKED:               {icon:'F',  label:'Fuel Checked',          color:'#2d9e5f'},
  PLAN_ACCEPTED:              {icon:'SIG',label:'Plan Accepted & Signed',color:'#2d9e5f'},
  PLAN_ACCEPTANCE_REVOKED:    {icon:'REV',label:'Acceptance Revoked',    color:'#e02020'},
  SYNC_TO_PM:                 {icon:'<>',label:'Synced to PM',           color:'#1a9bc4'},
  // T/O Data
  TKOF_RWY_SELECTED:          {icon:'RWY',label:'T/O Runway Selected',  color:'#1a9bc4'},
  TKOF_ATIS_ENTERED:          {icon:'ATI',label:'DEP ATIS Entered',      color:'#1a9bc4'},
  TKOF_SPEEDS_ENTERED:        {icon:'V',  label:'T/O Speeds (V1/VR/V2)',color:'#e8a020'},
  TKOF_ATC_CLR:               {icon:'ATC',label:'ATC Clearance',         color:'#1a9bc4'},
  TKOF_RVSM_GROUND:           {icon:'RVG',label:'RVSM Ground Check',     color:'#2d9e5f'},
  // NavLog
  OFF_BLOCKS:                 {icon:'OFB',label:'Off Blocks',            color:'#e8a020'},
  TAKEOFF:                    {icon:'T/O',label:'Takeoff',               color:'#e8a020'},
  RVSM_CHECK:                 {icon:'RVC',label:'RVSM Check',            color:'#1a9bc4'},
  GPS_ACTIVATED:              {icon:'GPS',label:'GPS Activated',         color:'#2d9e5f'},
  LANDING:                    {icon:'LND',label:'Landing',               color:'#e8a020'},
  ON_BLOCKS:                  {icon:'ONB',label:'On Blocks',             color:'#e8a020'},
  FUEL_REMAINING:             {icon:'FR', label:'Fuel Remaining',        color:'#2d9e5f'},
  // LND Data
  LND_RWY_SELECTED:           {icon:'RWY',label:'LND Runway Selected',  color:'#1a9bc4'},
  LND_ATIS_ENTERED:           {icon:'ATI',label:'ARR ATIS Entered',      color:'#1a9bc4'},
  LND_PERF_DATA:              {icon:'LW', label:'LND Perf Data',         color:'#e8a020'},
  // Archive
  FLIGHT_ARCHIVED:            {icon:'ARC',label:'Flight Archived',       color:'#2d9e5f'},
  ADMIN_EDIT:                 {icon:'EDT',label:'Admin Edit',            color:'#e02020'},
};

// Milestone events (ozet gorunum icin)
const MILESTONE_ACTIONS = new Set([
  'PLAN_RELEASED','PLAN_DOWNLOADED','PLAN_ACTIVATED',
  'CREW_ASSIGNED',
  'PREFLIGHT_MANDATORY_COMPLETE','MANDATORY_SIGNED',
  'FUEL_CHECKED',
  'PLAN_ACCEPTED','PLAN_ACCEPTANCE_REVOKED','SYNC_TO_PM',
  'TKOF_SPEEDS_ENTERED','TKOF_RVSM_GROUND',
  'OFF_BLOCKS','TAKEOFF','LANDING','ON_BLOCKS','FUEL_REMAINING',
  'LND_PERF_DATA',
  'FLIGHT_ARCHIVED',
]);

// ─── Flight Timeline ──────────────────────────────────────────────────────────
function FlightTimeline({ planId, live=false, milestoneOnly=false }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    const { data } = await supabase
      .from('flight_logs')
      .select('*')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true });
    const all = data || [];
    setLogs(milestoneOnly ? all.filter(l=>MILESTONE_ACTIONS.has(l.action)) : all);
    setLoading(false);
  }, [planId, milestoneOnly]);

  useEffect(() => {
    load();
    if (!live) return;
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [load, live]);

  const fmtTime = iso => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-GB')} ${d.toTimeString().slice(0,8)} UTC`;
  };
  const detailStr = details => {
    if (!details) return '';
    return Object.entries(details)
      .filter(([k]) => !['platform','timestamp_utc'].includes(k))
      .map(([k,v]) => `${k}: ${v}`)
      .join('  ·  ');
  };

  if (loading) return <div style={{padding:20,color:C.t3,fontSize:11,textAlign:'center',fontFamily:"'Courier New',monospace"}}>LOADING TIMELINE...</div>;
  if (!logs.length) return <div style={{padding:20,color:C.t3,fontSize:11,textAlign:'center',fontFamily:"'Courier New',monospace"}}>NO LOG ENTRIES</div>;

  return (
    <div style={{padding:'12px 16px'}}>
      {live && (
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
          <div style={{width:7,height:7,borderRadius:4,background:'#40d080',boxShadow:'0 0 6px rgba(64,208,128,0.6)'}}/>
          <span style={{fontSize:10,color:'#40d080',fontFamily:"'Courier New',monospace",letterSpacing:1}}>LIVE — 30s refresh</span>
          <span style={{marginLeft:'auto',fontSize:10,color:C.t3,fontFamily:"'Courier New',monospace"}}>{logs.length} entries</span>
        </div>
      )}
      {logs.map((l, idx) => {
        const meta = ACTION_META[l.action] || { icon:'·', label: l.action, color: C.t3 };
        const isLast = idx === logs.length - 1;
        return (
          <div key={l.id} style={{display:'flex',gap:10}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',width:28,flexShrink:0}}>
              <div style={{width:26,height:26,borderRadius:13,background:`${meta.color}20`,border:`2px solid ${meta.color}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:meta.color,fontWeight:700,flexShrink:0,fontFamily:"'Courier New',monospace"}}>
                {meta.icon}
              </div>
              {!isLast && <div style={{width:2,flex:1,background:C.border,minHeight:12,margin:'2px 0'}}/>}
            </div>
            <div style={{flex:1,paddingBottom:12}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:2}}>
                <span style={{fontSize:12,fontWeight:700,color:meta.color,fontFamily:"'Courier New',monospace"}}>{meta.label}</span>
                <span style={{fontSize:9,color:C.t3,fontFamily:"'Courier New',monospace",whiteSpace:'nowrap',marginLeft:8}}>{fmtTime(l.created_at)}</span>
              </div>
              {l.profiles && (
                <div style={{fontSize:10,color:C.t1,marginBottom:2,fontFamily:"'Courier New',monospace"}}>
                  <span style={{color:C.accent,fontWeight:700}}>{l.profiles.code}</span>{' · '}{l.profiles.full_name}
                </div>
              )}
              {l.details && Object.keys(l.details).filter(k=>!['platform','timestamp_utc'].includes(k)).length > 0 && (
                <div style={{fontSize:10,color:C.t3,fontFamily:"'Courier New',monospace",background:C.bg3,padding:'4px 8px',borderLeft:`2px solid ${meta.color}40`,lineHeight:1.7}}>
                  {detailStr(l.details)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Collapsible Edit Box (Archived FLTs) ─────────────────────────────────────
function CollapsibleEditBox({ title, icon, color, logs, fields, flight, onSave, toast, user, pilots=[] }) {
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState(false);
  const [form,    setForm]    = useState({});
  const [reason,  setReason]  = useState('');
  const [saving,  setSaving]  = useState(false);

  const openEdit = () => {
    const init = {};
    (fields||[]).forEach(f => {
      let val = flight[f.key];
      if (f.type === 'time' && val) val = new Date(val).toISOString().slice(11,16);
      init[f.key] = val != null ? String(val) : '';
    });
    setForm(init);
    setReason('');
    setEditing(true);
  };

  const handleSave = async () => {
    if (!reason.trim()) { toast('Reason is mandatory.', 'error'); return; }
    if (!fields || !fields.length) return;
    setSaving(true);
    const changes = fields.filter(f => String(form[f.key]||'') !== String(flight[f.key]??''));
    if (!changes.length) { toast('No changes detected.', 'error'); setSaving(false); return; }
    const updateObj = {};
    changes.forEach(f => { updateObj[f.key] = form[f.key] || null; });
    const { error: upErr } = await supabase.from('archived_flights').update(updateObj).eq('id', flight.id);
    if (upErr) { toast(`Update failed: ${upErr.message}`, 'error'); setSaving(false); return; }
    for (const f of changes) {
      await supabase.from('admin_edits').insert({
        archived_flight_id: flight.id,
        plan_id:            flight.plan_id,
        field_name:         f.key,
        old_value:          String(flight[f.key]??''),
        new_value:          String(form[f.key]||''),
        reason,
        edit_type:         'EDIT',
        edited_by:          user?.id ?? null,
      });
    }
    toast(`${changes.length} field(s) updated.`, 'success');
    setSaving(false);
    setEditing(false);
    onSave();
  };

  const fmtTime = iso => iso ? new Date(iso).toISOString().slice(11,16) + ' Z' : null;

  return (
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      {/* Header */}
      <div onClick={() => setOpen(o=>!o)}
        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',cursor:'pointer',background:open?`${color}08`:'transparent',borderLeft:`3px solid ${open?color:'transparent'}`}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:color,fontWeight:700,fontFamily:"'Courier New',monospace",width:30}}>{icon}</span>
          <span style={{fontSize:12,color:open?color:C.t3,fontWeight:700,fontFamily:"'Courier New',monospace",letterSpacing:1,textTransform:'uppercase'}}>{title}</span>
          {logs && logs.length > 0 && (
            <span style={{fontSize:9,color:C.t3,background:C.bg3,padding:'1px 6px',borderRadius:3,fontFamily:"'Courier New',monospace"}}>{logs.length}</span>
          )}
        </div>
        <span style={{fontSize:12,color:C.t3}}>{open?'v':'^'}</span>
      </div>

      {open && (
        <div style={{background:C.bg3}}>
          {/* Log entries for this category */}
          {logs && logs.length > 0 && (
            <div style={{borderBottom:`1px solid ${C.border}`}}>
              {logs.map(l => {
                const meta = ACTION_META[l.action] || { icon:'·', label: l.action, color: C.t3 };
                return (
                  <div key={l.id} style={{padding:'7px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'flex-start'}}>
                    <span style={{fontSize:9,color:meta.color,fontWeight:700,fontFamily:"'Courier New',monospace",width:28,flexShrink:0,paddingTop:2}}>{meta.icon}</span>
                    <div style={{flex:1}}>
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        <span style={{fontSize:11,color:meta.color,fontFamily:"'Courier New',monospace",fontWeight:700}}>{meta.label}</span>
                        <span style={{fontSize:9,color:C.t3,fontFamily:"'Courier New',monospace"}}>{new Date(l.created_at).toLocaleTimeString('en-GB').slice(0,8)} UTC</span>
                      </div>
                      {l.details && (
                        <div style={{fontSize:9,color:C.t3,fontFamily:"'Courier New',monospace",marginTop:2,lineHeight:1.7}}>
                          {Object.entries(l.details).filter(([k])=>!['platform','timestamp_utc'].includes(k)).map(([k,v])=>`${k}: ${v}`).join('  ·  ')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Current archived values */}
          {fields && fields.length > 0 && (
            <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:1,fontFamily:"'Courier New',monospace",marginBottom:6}}>CURRENT VALUES</div>
              {fields.map(f => {
                let val = flight[f.key];
                if (f.type === 'time' && val) val = fmtTime(val);
                if (f.type === 'pilot' && val) {
                  const p = pilots.find(x=>x.id===val);
                  val = p ? `${p.code} — ${p.full_name}` : val.slice(0,8)+'...';
                }
                return (
                  <div key={f.key} style={{display:'flex',justifyContent:'space-between',padding:'3px 0'}}>
                    <span style={{fontSize:11,color:C.t3,fontFamily:"'Courier New',monospace"}}>{f.label}</span>
                    <span style={{fontSize:11,color:val?C.t1:'#333',fontFamily:"'Courier New',monospace",fontWeight:700}}>{val||'—'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Edit form */}
          {fields && fields.length > 0 && !editing && (
            <div style={{padding:'8px 16px'}}>
              <button style={{...S.btnPrimary,fontSize:11,padding:'6px 14px'}} onClick={openEdit}>EDIT THIS SECTION</button>
            </div>
          )}
          {editing && (
            <div style={{padding:'10px 16px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                {fields.map(f => (
                  <div key={f.key}>
                    <div style={{fontSize:10,color:C.t3,fontFamily:"'Courier New',monospace",marginBottom:3}}>{f.label}</div>
                    {f.type==='pilot'?(
                      <select style={{...S.select,fontSize:13,padding:'6px 8px'}}
                        value={form[f.key]||''}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}>
                        <option value="">— Select —</option>
                        {pilots.map(p=><option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>)}
                      </select>
                    ):(
                      <input style={{...S.input,fontSize:13,padding:'6px 8px'}}
                        value={form[f.key]||''}
                        placeholder={f.type==='time'?'HH:MM':'—'}
                        onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}/>
                    )}
                  </div>
                ))}
              </div>
              <div style={{marginBottom:8}}>
                <div style={{fontSize:10,color:C.t3,fontFamily:"'Courier New',monospace",marginBottom:3}}>REASON *</div>
                <textarea style={{...S.input,minHeight:56,resize:'vertical',fontSize:12}}
                  value={reason} onChange={e=>setReason(e.target.value)} placeholder="Mandatory: explain why..."/>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button style={{...S.btnSecondary,fontSize:11,padding:'6px 12px'}} onClick={()=>setEditing(false)}>CANCEL</button>
                <button style={{...S.btnPrimary,fontSize:11,padding:'6px 14px'}} onClick={handleSave} disabled={saving}>
                  {saving?'SAVING...':'SAVE & LOG'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AdminEditsHistory ────────────────────────────────────────────────────────
export function AdminEditsHistory({archivedFlightId, readOnly=false}){
  const [edits,setEdits]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!archivedFlightId)return;
    (async()=>{
      setLoading(true);
      const{data}=await supabase.from('admin_edits').select('id,created_at,edit_type,field_name,old_value,new_value,reason').eq('archived_flight_id',archivedFlightId).order('created_at',{ascending:false});
      setEdits(data||[]);setLoading(false);
    })();
  },[archivedFlightId]);
  if(loading)return<div style={{padding:'10px 16px',fontSize:11,color:C.t3,fontFamily:"'Courier New',monospace"}}>LOADING EDIT HISTORY...</div>;
  if(!edits.length)return<div style={{padding:'10px 16px',fontSize:11,color:C.t3,fontFamily:"'Courier New',monospace"}}>NO ADMIN EDITS ON RECORD</div>;
  return(
    <div>
      <div style={{padding:'8px 16px',background:C.bg3,borderBottom:`1px solid ${C.border}`,borderTop:`1px solid ${C.border}`}}>
        <span style={{...S.label,color:readOnly?'#4a9bc4':C.accent}}>{readOnly?'ADMIN EDIT HISTORY — READ ONLY':'EDIT HISTORY'}</span>
      </div>
      {edits.map(e=>(
        <div key={e.id} style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${e.edit_type==='DELETE'?C.red:C.accent}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={S.badge(e.edit_type==='DELETE'?'red':'')}>{e.edit_type||'EDIT'}</span>
            <span style={{fontSize:10,color:C.t3,fontFamily:"'Courier New',monospace"}}>{new Date(e.created_at).toLocaleString('en-GB')}</span>
          </div>
          {e.field_name!=='RECORD_DELETED'&&(
            <div style={{fontSize:11,color:C.t1,fontFamily:"'Courier New',monospace",marginBottom:3}}>
              <span style={{color:C.accent}}>{e.field_name}</span>{' '}
              <span style={{color:C.t3}}>{String(e.old_value||'—').slice(0,25)}</span>{' > '}
              <span style={{color:'#40d080'}}>{String(e.new_value||'—').slice(0,25)}</span>
            </div>
          )}
          <div style={{fontSize:11,color:C.t2,fontFamily:"'Courier New',monospace",lineHeight:1.5}}>
            <span style={{color:C.t3}}>Reason: </span>{e.reason||'—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 1. Active FLTs ───────────────────────────────────────────────────────────
function ActiveFlts({toast}){
  const [plans,setPlans]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  const [detailTab,setDetailTab]=useState('details'); // 'details' | 'timeline'
  const [pilots,setPilots]=useState([]);

  useEffect(()=>{
    supabase.from('profiles').select('id,full_name,code').then(({data})=>setPilots(data||[]));
  },[]);

  const pilotName = id => {
    if (!id) return '—';
    const p = pilots.find(x=>x.id===id);
    return p ? `${p.code} — ${p.full_name}` : id.slice(0,8)+'...';
  };

  useEffect(()=>{
    const load=async()=>{
      setLoading(true);
      const{data}=await supabase.from('plans').select('*').eq('status','active').order('created_at',{ascending:false});
      setPlans(data||[]);setLoading(false);
    };
    load();const iv=setInterval(load,30000);return()=>clearInterval(iv);
  },[]);

  const sel=plans.find(p=>p.id===selected);

  const handleSelect = (id) => {
    setSelected(id===selected?null:id);
    setDetailTab('details');
  };

  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:8,height:8,borderRadius:4,background:'#40d080',boxShadow:'0 0 8px rgba(64,208,128,0.6)'}}/>
          <span style={S.label}>Live — refreshes every 30s</span>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11,letterSpacing:2}}>LOADING...</div>}
        {!loading&&plans.length===0&&<div style={{padding:48,textAlign:'center',color:C.t3,fontSize:11,letterSpacing:2}}>NO ACTIVE FLIGHTS</div>}
        {plans.map(p=>(
          <div key={p.id} onClick={()=>handleSelect(p.id)}
            style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:selected===p.id?`${C.accent}08`:'transparent',borderLeft:selected===p.id?`3px solid ${C.accent}`:'3px solid transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <span style={{fontSize:14,fontWeight:700,color:C.accent,fontFamily:"'Courier New',monospace",letterSpacing:1}}>{p.dep} → {p.dest}</span>
              <span style={S.badge('green')}>ACTIVE</span>
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>
              {[['REG',p.reg],['TYPE',p.ac_type],['STD',p.std],['ETA',p.eta],['DISP',p.dispatch_no]].map(([l,v])=>(
                <div key={l}><div style={S.label}>{l}</div><div style={{fontSize:11,color:C.t2,fontFamily:"'Courier New',monospace"}}>{v||'—'}</div></div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sel&&(
        <DetailPanel title={`${sel.dep} → ${sel.dest}`} onClose={()=>setSelected(null)} width={400}>
          {/* Tab bar */}
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,background:C.bg3}}>
            {['details','timeline'].map(tab=>(
              <div key={tab} onClick={()=>setDetailTab(tab)}
                style={{flex:1,padding:'10px',textAlign:'center',cursor:'pointer',fontFamily:"'Courier New',monospace",fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',
                  color:detailTab===tab?C.accent:C.t3,
                  borderBottom:detailTab===tab?`2px solid ${C.accent}`:'2px solid transparent',
                  background:detailTab===tab?`${C.accent}08`:'transparent'}}>
                {tab==='timeline'?'TIMELINE':'DETAILS'}
              </div>
            ))}
          </div>

          {detailTab==='details'&&(
            <div>
              <DetailRow label="Route"       value={`${sel.dep} → ${sel.dest}`} accent/>
              <DetailRow label="Registration" value={sel.reg}/>
              <DetailRow label="Type"         value={sel.ac_type}/>
              <DetailRow label="Dispatch No"  value={sel.dispatch_no}/>
              <DetailRow label="STD"          value={sel.std}/>
              <DetailRow label="ETA"          value={sel.eta}/>
              <DetailRow label="PF Pilot"     value={pilotName(sel.pf_pilot)}/>
              <DetailRow label="PM Pilot"     value={pilotName(sel.pm_pilot)}/>
            </div>
          )}

          {detailTab==='timeline'&&(
            <FlightTimeline planId={sel.id} live={true} milestoneOnly={true}/>
          )}
        </DetailPanel>
      )}
    </div>
  );
}

// ─── 2. Archived FLTs ─────────────────────────────────────────────────────────
function ArchivedFlts({toast,user}){
  const[flights,setFlights]=useState([]);
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[filter,setFilter]=useState({route:''});
  const[editModal,setEditModal]=useState(false);
  const[deleteModal,setDeleteModal]=useState(false);
  const[editForm,setEditForm]=useState({});
  const[deleteReason,setDeleteReason]=useState('');
  const[saving,setSaving]=useState(false);
  const[planLogs,setPlanLogs]=useState([]);
  const[pilots,setPilots]=useState([]);

  useEffect(()=>{
    supabase.from('profiles').select('id,full_name,code').order('full_name').then(({data})=>setPilots(data||[]));
  },[]);

  // eslint-disable-next-line no-unused-vars
  const pilotName = id => {
    if (!id) return '—';
    const p = pilots.find(x=>x.id===id);
    return p ? `${p.code} — ${p.full_name}` : id.slice(0,8)+'...';
  };

  const load=useCallback(async()=>{
    setLoading(true);
    const{data,error}=await supabase.from('archived_flights')
      .select('*,plans(dep,dest,date,reg,ac_type,dispatch_no,pf_pilot,pm_pilot)')
      .order('archived_at',{ascending:false,nullsFirst:false}).limit(200);
    if(error)console.error('ArchivedFlts:',error);
    setFlights(data||[]);setLoading(false);
  },[]);

  useEffect(()=>{load();},[load]);

  // Flight_logs for selected flight
  useEffect(()=>{
    const sel=flights.find(f=>f.id===selected);
    if(!sel?.plan_id){setPlanLogs([]);return;}
    supabase.from('flight_logs').select('*')
      .eq('plan_id', sel.plan_id)
      .order('created_at',{ascending:true})
      .then(({data})=>setPlanLogs(data||[]));
  },[selected,flights]);

  const filtered=flights.filter(f=>{const p=f.plans||{};return!filter.route||`${p.dep}${p.dest}`.toLowerCase().includes(filter.route.toLowerCase());});
  const sel=flights.find(f=>f.id===selected);
  const fmtMins=m=>m?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`:'—';

  // Group logs by category
  // Milestone only — detay FLT Logs & Times'da
  const logsByCategory = {
    crew:      planLogs.filter(l=>['CREW_ASSIGNED'].includes(l.action)).slice(-1),
    mandatory: planLogs.filter(l=>['PREFLIGHT_MANDATORY_COMPLETE','MANDATORY_SIGNED'].includes(l.action)).slice(-2),
    fuel:      planLogs.filter(l=>['FUEL_CHECKED'].includes(l.action)).slice(-1),
    accepted:  planLogs.filter(l=>['PLAN_ACCEPTED','PLAN_ACCEPTANCE_REVOKED','SYNC_TO_PM'].includes(l.action)),
    tkof:      planLogs.filter(l=>['TKOF_RVSM_GROUND','TKOF_SPEEDS_ENTERED'].includes(l.action)).slice(-2),
    navlog:    planLogs.filter(l=>['OFF_BLOCKS','TAKEOFF','LANDING','ON_BLOCKS','FUEL_REMAINING'].includes(l.action)),
    lnd:       planLogs.filter(l=>['LND_PERF_DATA','LND_RWY_SELECTED'].includes(l.action)).slice(-2),
  };

  const openEdit=f=>{
    setEditForm({
      off_blocks:f.off_blocks?new Date(f.off_blocks).toISOString().slice(11,16):'',
      takeoff_time:f.takeoff_time?new Date(f.takeoff_time).toISOString().slice(11,16):'',
      landing_time:f.landing_time?new Date(f.landing_time).toISOString().slice(11,16):'',
      on_blocks:f.on_blocks?new Date(f.on_blocks).toISOString().slice(11,16):'',
      block_minutes:f.block_minutes||'',airborne_minutes:f.airborne_minutes||'',
      takeoff_fuel:f.takeoff_fuel||'',remaining_fuel:f.remaining_fuel||'',
      actual_lw:f.actual_lw||'',vref:f.vref||'',req_landing_dist:f.req_landing_dist||'',
      dep_rwy:f.dep_rwy||'',arr_rwy:f.arr_rwy||'',dep_atis:f.dep_atis||'',
      arr_atis:f.arr_atis||'',sid:f.sid||'',pax:f.pax||'',
      landing_count:f.landing_count||1,is_night_landing:f.is_night_landing||false,reason:'',
    });
    setEditModal(true);
  };

  const handleSaveEdit=async()=>{
    if(!editForm.reason){toast('Reason is mandatory.','error');return;}
    setSaving(true);
    const{reason,...fields}=editForm;
    const changes=Object.entries(fields).filter(([k,v])=>String(v)!==String(sel[k]==null?'':sel[k]));
    if(!changes.length){toast('No changes detected.','error');setSaving(false);return;}
    const updateObj={};changes.forEach(([k,v])=>{updateObj[k]=v;});
    const{error:upErr}=await supabase.from('archived_flights').update(updateObj).eq('id',sel.id);
    if(upErr){toast(`Update failed: ${upErr.message}`,'error');setSaving(false);return;}
    for(const[k,v]of changes){
      await supabase.from('admin_edits').insert({
        archived_flight_id:sel.id,plan_id:sel.plan_id,
        field_name:k,old_value:String(sel[k]??''),new_value:String(v),
        reason,edit_type:'EDIT',edited_by:user?.id??null,
      });
    }
    toast(`${changes.length} field(s) updated and logged.`,'success');
    setEditModal(false);setSaving(false);load();
  };

  const handleDelete=async()=>{
    if(!deleteReason){toast('Reason is mandatory.','error');return;}
    setSaving(true);
    await supabase.from('admin_edits').insert({
      archived_flight_id:sel.id,plan_id:sel.plan_id,
      field_name:'RECORD_DELETED',old_value:String(sel.id),new_value:'DELETED',
      reason:deleteReason,edit_type:'DELETE',edited_by:user?.id??null,
    });
    await supabase.from('archived_flights').delete().eq('id',sel.id);
    if(sel.plan_id) await supabase.from('plans').update({status:'deleted'}).eq('id',sel.plan_id);
    toast('Record deleted and logged.','success');
    setDeleteModal(false);setSelected(null);setDeleteReason('');setSaving(false);load();
  };

  const EF=({label,k,type='text'})=>(
    <div style={{marginBottom:10}}>
      <label style={S.formLabel}>{label}</label>
      {type==='toggle'?(
        <div style={{display:'flex',gap:10}}>
          {['YES','NO'].map(v=>(
            <button key={v} onClick={()=>setEditForm(p=>({...p,[k]:v==='YES'}))}
              style={{...S.btnSecondary,background:editForm[k]===(v==='YES')?`${C.accent}20`:'none',borderColor:editForm[k]===(v==='YES')?C.accent:C.border2,color:editForm[k]===(v==='YES')?C.accent:C.t2}}>
              {v}
            </button>
          ))}
        </div>
      ):(
        <input style={S.input} value={editForm[k]||''} type={type} onChange={e=>setEditForm(p=>({...p,[k]:e.target.value}))}/>
      )}
    </div>
  );

  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}>
          <input placeholder="Route / ICAO..." value={filter.route} onChange={e=>setFilter(p=>({...p,route:e.target.value}))} style={{...S.input,width:200}}/>
          <span style={{...S.label,marginLeft:'auto'}}>{filtered.length} RECORDS</span>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['ARCHIVED','ROUTE','REG','BLOCK','FLIGHT','LANDINGS','PF','PM'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(f=>{
              const p=f.plans||{};
              const pfPilot=pilots.find(x=>x.id===f.pf_id||x.id===p.pf_pilot);
              const pmPilot=pilots.find(x=>x.id===f.sic_id||x.id===p.pm_pilot);
              return(
                <tr key={f.id} onClick={()=>setSelected(f.id===selected?null:f.id)} style={{cursor:'pointer',background:selected===f.id?`${C.accent}08`:'transparent'}}>
                  <td style={S.td}>{f.archived_at?new Date(f.archived_at).toLocaleString('en-GB'):'—'}</td>
                  <td style={{...S.td,color:C.accent,fontWeight:700}}>{p.dep||'—'} → {p.dest||'—'}</td>
                  <td style={S.td}>{p.reg||'—'}</td>
                  <td style={S.td}>{fmtMins(f.block_minutes)}</td>
                  <td style={S.td}>{fmtMins(f.airborne_minutes)}</td>
                  <td style={S.td}>{f.landing_count||'—'}</td>
                  <td style={{...S.td,color:'#1a9bc4'}}>{pfPilot?pfPilot.full_name:'—'}</td>
                  <td style={{...S.td,color:'#888'}}>{pmPilot?pmPilot.full_name:'—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel&&(
        <DetailPanel title="Archive Detail" onClose={()=>setSelected(null)} width={400}>

          {/* Basic flight data */}
          <DetailRow label="Route"        value={`${sel.plans?.dep} → ${sel.plans?.dest}`} accent/>
          <DetailRow label="Date"         value={sel.plans?.date}/>
          <DetailRow label="Registration" value={sel.plans?.reg}/>
          <DetailRow label="Archived"     value={sel.archived_at?new Date(sel.archived_at).toLocaleString('en-GB'):'—'}/>

          <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:14,color:'#fff',fontWeight:700,letterSpacing:1,fontFamily:"'Courier New',monospace",textTransform:'uppercase'}}>PF</span>
            <span style={{fontSize:13,color:C.accent,fontFamily:"'Courier New',monospace",fontWeight:700}}>{pilotName(sel.pf_id||sel.plans?.pf_pilot)||'—'}</span>
          </div>
          <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:14,color:'#fff',fontWeight:700,letterSpacing:1,fontFamily:"'Courier New',monospace",textTransform:'uppercase'}}>PM</span>
            <span style={{fontSize:13,color:'#aaa',fontFamily:"'Courier New',monospace",fontWeight:700}}>{pilotName(sel.sic_id||sel.plans?.pm_pilot)||'—'}</span>
          </div>
          <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.t3,fontFamily:"'Courier New',monospace",lineHeight:2}}>
            <div>OFF BLOCK: <span style={{color:C.t1}}>{sel.off_blocks?new Date(sel.off_blocks).toISOString().slice(11,16)+' Z':'—'}</span></div>
            <div>T/O TIME:  <span style={{color:C.t1}}>{sel.takeoff_time?new Date(sel.takeoff_time).toISOString().slice(11,16)+' Z':'—'}</span></div>
            <div>LANDING:   <span style={{color:C.t1}}>{sel.landing_time?new Date(sel.landing_time).toISOString().slice(11,16)+' Z':'—'}</span></div>
            <div>ON BLOCK:  <span style={{color:C.t1}}>{sel.on_blocks?new Date(sel.on_blocks).toISOString().slice(11,16)+' Z':'—'}</span></div>
            <div>BLOCK:     <span style={{color:C.accent}}>{fmtMins(sel.block_minutes)}</span></div>
            <div>FLIGHT:    <span style={{color:C.accent}}>{fmtMins(sel.airborne_minutes)}</span></div>
          </div>

          {/* ── Collapsible edit boxes ── */}
          <div style={{borderTop:`1px solid ${C.border}`}}>
            <div style={{padding:'7px 16px',background:C.bg3,fontSize:10,color:C.t3,fontWeight:700,letterSpacing:1.5,fontFamily:"'Courier New',monospace"}}>
              FLIGHT DATA — CLICK TO EXPAND / EDIT
            </div>

            <CollapsibleEditBox
              title="Flight Crew" icon="**" color="#1a9bc4"
              logs={logsByCategory.crew}
              fields={[
                {key:'pf_id',  label:'PF Pilot', type:'pilot'},
                {key:'sic_id', label:'PM Pilot', type:'pilot'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
            <CollapsibleEditBox
              title="Mandatory" icon="OK" color="#2d9e5f"
              logs={logsByCategory.mandatory}
              fields={[]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
            <CollapsibleEditBox
              title="Fuel" icon="F" color="#2d9e5f"
              logs={logsByCategory.fuel}
              fields={[
                {key:'takeoff_fuel',   label:'T/O Fuel (lb)',  type:'text'},
                {key:'remaining_fuel', label:'Rem Fuel (lb)',  type:'text'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
            <CollapsibleEditBox
              title="Accept & Sign" icon="SIG" color="#e8a020"
              logs={logsByCategory.accepted}
              fields={[]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
            <CollapsibleEditBox
              title="T/O Data" icon="T/O" color="#e8a020"
              logs={logsByCategory.tkof}
              fields={[
                {key:'dep_rwy',   label:'DEP RWY',  type:'text'},
                {key:'dep_atis',  label:'DEP ATIS', type:'text'},
                {key:'sid',       label:'SID',      type:'text'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
            <CollapsibleEditBox
              title="NAV LOG" icon="NAV" color="#1a9bc4"
              logs={logsByCategory.navlog}
              fields={[
                {key:'off_blocks',   label:'Off Blocks (HH:MM)',  type:'time'},
                {key:'takeoff_time', label:'T/O Time (HH:MM)',    type:'time'},
                {key:'landing_time', label:'Landing (HH:MM)',     type:'time'},
                {key:'on_blocks',    label:'On Blocks (HH:MM)',   type:'time'},
                {key:'takeoff_fuel', label:'T/O Fuel (lb)',       type:'text'},
                {key:'remaining_fuel',label:'Rem Fuel (lb)',      type:'text'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
            <CollapsibleEditBox
              title="LND Data" icon="LND" color="#1a9bc4"
              logs={logsByCategory.lnd}
              fields={[
                {key:'arr_rwy',          label:'ARR RWY',        type:'text'},
                {key:'arr_atis',         label:'ARR ATIS',       type:'text'},
                {key:'actual_lw',        label:'Actual LW (lb)', type:'text'},
                {key:'vref',             label:'Vref (kt)',      type:'text'},
                {key:'req_landing_dist', label:'Req LND Dist',   type:'text'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}
            />
          </div>

          {/* Admin edit history */}
          <AdminEditsHistory archivedFlightId={sel.id} readOnly={false}/>

          {/* Action buttons */}
          <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:8}}>
            <button style={S.btnPrimary} onClick={()=>openEdit(sel)}>EDIT ALL FIELDS</button>
            <button style={S.btnDanger}  onClick={()=>setDeleteModal(true)}>DELETE RECORD</button>
          </div>
        </DetailPanel>
      )}

      {/* Edit All Fields Modal */}
      {editModal&&sel&&(
        <Modal title="EDIT ARCHIVED FLIGHT — REPORT REQUIRED" onClose={()=>setEditModal(false)} width={520}>
          <div style={{fontSize:11,color:'#e8731a',marginBottom:16,padding:'8px 12px',background:'rgba(232,115,26,0.08)',border:'1px solid rgba(232,115,26,0.2)'}}>
            All edits are logged. Only changed fields will be updated.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <EF label="OFF BLOCK (HH:MM)" k="off_blocks"/>
            <EF label="T/O TIME (HH:MM)"  k="takeoff_time"/>
            <EF label="LANDING (HH:MM)"   k="landing_time"/>
            <EF label="ON BLOCK (HH:MM)"  k="on_blocks"/>
            <EF label="BLOCK MINS"        k="block_minutes"/>
            <EF label="FLIGHT MINS"       k="airborne_minutes"/>
            <EF label="T/O FUEL (lb)"     k="takeoff_fuel"/>
            <EF label="REM FUEL (lb)"     k="remaining_fuel"/>
            <EF label="ACTUAL LW (lb)"    k="actual_lw"/>
            <EF label="VREF (kt)"         k="vref"/>
            <EF label="REQ LND DIST (ft)" k="req_landing_dist"/>
            <EF label="LANDINGS"          k="landing_count"/>
            <EF label="DEP RWY"           k="dep_rwy"/>
            <EF label="ARR RWY"           k="arr_rwy"/>
            <EF label="SID"               k="sid"/>
            <EF label="PAX"               k="pax"/>
          </div>
          <EF label="DEP ATIS" k="dep_atis"/>
          <EF label="ARR ATIS" k="arr_atis"/>
          <EF label="NIGHT LANDING" k="is_night_landing" type="toggle"/>
          <div style={{marginTop:16}}>
            <label style={S.formLabel}>REASON / REPORT *</label>
            <textarea style={{...S.input,minHeight:80,resize:'vertical'}} value={editForm.reason}
              onChange={e=>setEditForm(p=>({...p,reason:e.target.value}))} placeholder="Mandatory: explain why this edit is required..."/>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
            <button style={S.btnSecondary} onClick={()=>setEditModal(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleSaveEdit} disabled={saving}>{saving?'SAVING...':'SAVE & LOG EDITS'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteModal&&sel&&(
        <Modal title="DELETE ARCHIVED FLIGHT RECORD" onClose={()=>setDeleteModal(false)}>
          <div style={{fontSize:12,color:'#e02020',marginBottom:16,padding:'10px 12px',background:'rgba(224,32,32,0.08)',border:'1px solid rgba(224,32,32,0.2)'}}>
            Irreversible. Record will be permanently deleted and logged.
          </div>
          <DetailRow label="Flight"   value={`${sel.plans?.dep} → ${sel.plans?.dest}`} accent/>
          <DetailRow label="Archived" value={sel.archived_at?new Date(sel.archived_at).toLocaleString('en-GB'):'—'}/>
          <div style={{marginTop:16}}>
            <label style={S.formLabel}>REASON FOR DELETION *</label>
            <textarea style={{...S.input,minHeight:80,resize:'vertical'}} value={deleteReason}
              onChange={e=>setDeleteReason(e.target.value)} placeholder="Mandatory: explain why this record is being deleted..."/>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
            <button style={S.btnSecondary} onClick={()=>setDeleteModal(false)}>CANCEL</button>
            <button style={S.btnDanger} onClick={handleDelete} disabled={saving}>{saving?'DELETING...':'CONFIRM DELETE'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── AIRCRAFT DATABASE ───────────────────────────────────────────────────────
const AIRCRAFT_DB = {
  'Gulfstream': [
    {model:'G200',  ac_type:'G200'}, {model:'G280',  ac_type:'G280'},
    {model:'G300',  ac_type:'GLF3'}, {model:'G350',  ac_type:'GLF4'},
    {model:'G400',  ac_type:'GLF4'}, {model:'G450',  ac_type:'GLF4'},
    {model:'G500',  ac_type:'GLF5'}, {model:'G550',  ac_type:'GLF5'},
    {model:'G600',  ac_type:'GLF6'}, {model:'G650',  ac_type:'GLF6'},
    {model:'G700',  ac_type:'G700'},
  ],
  'Falcon (Dassault)': [
    {model:'Falcon 6X',    ac_type:'F6X'},  {model:'Falcon 7X',    ac_type:'F7X'},
    {model:'Falcon 8X',    ac_type:'F8X'},  {model:'Falcon 900',   ac_type:'F900'},
    {model:'Falcon 2000',  ac_type:'F2TH'}, {model:'Falcon 2000S', ac_type:'F2TH'},
    {model:'Falcon 2000LX',ac_type:'F2TH'},
  ],
  'Bombardier': [
    {model:'Challenger 300',ac_type:'CL30'}, {model:'Challenger 350',ac_type:'CL35'},
    {model:'Challenger 604',ac_type:'CL60'}, {model:'Challenger 605',ac_type:'CL60'},
    {model:'Challenger 650',ac_type:'CL60'}, {model:'Global 5000',  ac_type:'GL5T'},
    {model:'Global 6000',  ac_type:'GL6T'}, {model:'Global 7500',  ac_type:'GL7T'},
    {model:'Learjet 45',   ac_type:'LJ45'},  {model:'Learjet 75',   ac_type:'LJ75'},
  ],
  'Hawker': [
    {model:'Hawker 400XP',ac_type:'BE40'}, {model:'Hawker 750',  ac_type:'H25B'},
    {model:'Hawker 800XP',ac_type:'H25B'}, {model:'Hawker 900XP',ac_type:'H25B'},
    {model:'Hawker 4000', ac_type:'HA4T'},
  ],
  'Embraer': [
    {model:'Phenom 100',  ac_type:'E50P'}, {model:'Phenom 300',  ac_type:'E55P'},
    {model:'Legacy 450',  ac_type:'E45X'}, {model:'Legacy 500',  ac_type:'E50P'},
    {model:'Legacy 600',  ac_type:'E135'}, {model:'Legacy 650',  ac_type:'E135'},
    {model:'Praetor 500', ac_type:'E55P'}, {model:'Praetor 600', ac_type:'E50P'},
  ],
};

// Shared Aircraft Form (Add + Edit)
function AircraftForm({form, setForm, onSave, onCancel, saveLabel='SAVE'}){
  const manufacturers = Object.keys(AIRCRAFT_DB);
  const models = form.manufacturer && AIRCRAFT_DB[form.manufacturer] ? AIRCRAFT_DB[form.manufacturer] : null;

  const handleManufacturer = (mfr) => {
    setForm(p=>({...p, manufacturer:mfr, model:'', ac_type:''}));
  };
  const handleModel = (modelStr) => {
    const entry = models?.find(m=>m.model===modelStr);
    setForm(p=>({...p, model:modelStr, ac_type:entry?.ac_type||p.ac_type}));
  };

  return (
    <div>
      <div style={S.formGroup}>
        <label style={S.formLabel}>REGISTRATION *</label>
        <input style={S.input} placeholder="TC-REC" value={form.registration||''} onChange={e=>setForm(p=>({...p,registration:e.target.value.toUpperCase()}))}/>
      </div>
      <div style={S.formGroup}>
        <label style={S.formLabel}>MANUFACTURER</label>
        <select style={S.select} value={form.manufacturer||''}
          onChange={e=>handleManufacturer(e.target.value)}>
          <option value="">— Select —</option>
          {manufacturers.map(m=><option key={m} value={m}>{m}</option>)}
          <option value="__other__">Other</option>
        </select>
        {form.manufacturer==='__other__'&&(
          <input style={{...S.input,marginTop:8}} placeholder="Manufacturer name" value={form._mfrCustom||''}
            onChange={e=>setForm(p=>({...p,_mfrCustom:e.target.value,manufacturer:e.target.value}))}/>
        )}
      </div>
      <div style={S.formGroup}>
        <label style={S.formLabel}>MODEL</label>
        {models ? (
          <select style={S.select} value={form.model||''} onChange={e=>handleModel(e.target.value)}>
            <option value="">— Select model —</option>
            {models.map(m=><option key={m.model} value={m.model}>{m.model}</option>)}
            <option value="__other__">Other</option>
          </select>
        ) : (
          <input style={S.input} placeholder="Model name" value={form.model||''} onChange={e=>setForm(p=>({...p,model:e.target.value}))}/>
        )}
        {form.model==='__other__'&&(
          <input style={{...S.input,marginTop:8}} placeholder="Model name" value={form._modelCustom||''}
            onChange={e=>setForm(p=>({...p,_modelCustom:e.target.value,model:e.target.value}))}/>
        )}
      </div>
      <div style={S.formGroup}>
        <label style={S.formLabel}>ICAO TYPE CODE *</label>
        <input style={S.input} placeholder="e.g. GLF4" value={form.ac_type||''} onChange={e=>setForm(p=>({...p,ac_type:e.target.value.toUpperCase()}))}/>
        {form.ac_type&&<div style={{fontSize:10,color:C.t3,marginTop:4,fontFamily:"'Courier New',monospace"}}>Auto-filled from model selection. Edit if needed.</div>}
      </div>
      <div style={S.formGroup}>
        <label style={S.formLabel}>LANDING CATEGORY</label>
        <select style={S.select} value={form.landing_cat||'CAT1'} onChange={e=>setForm(p=>({...p,landing_cat:e.target.value}))}>
          <option value="CAT1">CAT I</option><option value="CAT2">CAT II</option><option value="CAT3">CAT III</option>
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={S.formGroup}>
          <label style={S.formLabel}>BASELINE HOURS</label>
          <input style={S.input} placeholder="0" type="number" value={form.total_hours||''} onChange={e=>setForm(p=>({...p,total_hours:e.target.value}))}/>
          <div style={{fontSize:10,color:C.t3,marginTop:4}}>Hours before app tracking started</div>
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>BASELINE CYCLES</label>
          <input style={S.input} placeholder="0" type="number" value={form.total_cycles||''} onChange={e=>setForm(p=>({...p,total_cycles:e.target.value}))}/>
          <div style={{fontSize:10,color:C.t3,marginTop:4}}>Cycles before app tracking started</div>
        </div>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
        <button style={S.btnSecondary} onClick={onCancel}>CANCEL</button>
        <button style={S.btnPrimary} onClick={onSave}>{saveLabel}</button>
      </div>
    </div>
  );
}

// ─── 3. Aircrafts ─────────────────────────────────────────────────────────────
function Aircrafts({toast}){
  const[list,setList]=useState([]);const[loading,setLoading]=useState(true);
  const[showAdd,setShowAdd]=useState(false);const[selected,setSelected]=useState(null);
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({registration:'',manufacturer:'',model:'',ac_type:'',landing_cat:'CAT1',total_hours:0,total_cycles:0});
  const[editForm,setEditForm]=useState({});
  const[saving,setSaving]=useState(false);
  const[acStats,setAcStats]=useState({}); // reg → {hours, cycles} from archived_flights

  const load=useCallback(async()=>{
    setLoading(true);
    const[{data:acData},{data:flData}]=await Promise.all([
      supabase.from('aircraft').select('*').order('registration'),
      supabase.from('archived_flights').select('airborne_minutes,landing_count,plans(reg)'),
    ]);
    setList(acData||[]);
    // Aggregate hours/cycles per registration from archived_flights
    const stats={};
    (flData||[]).forEach(f=>{
      const reg=f.plans?.reg;
      if(!reg)return;
      if(!stats[reg])stats[reg]={mins:0,cycles:0};
      stats[reg].mins   +=(f.airborne_minutes||0);
      stats[reg].cycles +=(f.landing_count||0);
    });
    setAcStats(stats);
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const sel=list.find(a=>a.id===selected);

  // Total = baseline (aircraft table) + accumulated (archived_flights)
  const getTotals=(a)=>{
    const s=acStats[a.registration]||{mins:0,cycles:0};
    const baseMins=Math.round((parseFloat(a.total_hours)||0)*60);
    const totalMins=baseMins+s.mins;
    const totalHours=totalMins/60;
    const totalCycles=(a.total_cycles||0)+s.cycles;
    return{
      hours: totalMins>0 ? `${Math.floor(totalHours)}:${String(Math.round((totalHours%1)*60)).padStart(2,'0')}` : '0:00',
      cycles: totalCycles,
      appMins: s.mins,
      appCycles: s.cycles,
    };
  };

  const handleAdd=async()=>{
    if(!form.registration||!form.ac_type){toast('Registration and type required.','error');return;}
    const{registration,manufacturer,model,ac_type,landing_cat,total_hours,total_cycles}=form;
    const{error}=await supabase.from('aircraft').insert({registration,manufacturer,model,ac_type,landing_cat,
      total_hours:parseFloat(total_hours)||0, total_cycles:parseInt(total_cycles)||0});
    if(error){toast(error.message,'error');return;}
    toast('Aircraft added.','success');
    setShowAdd(false);setForm({registration:'',manufacturer:'',model:'',ac_type:'',landing_cat:'CAT1',total_hours:0,total_cycles:0});load();
  };

  const openEdit=()=>{
    if(!sel)return;
    setEditForm({registration:sel.registration||'',manufacturer:sel.manufacturer||'',model:sel.model||'',
      ac_type:sel.ac_type||'',landing_cat:sel.landing_cat||'CAT1',
      total_hours:sel.total_hours||0, total_cycles:sel.total_cycles||0});
    setEditing(true);
  };

  const handleSaveEdit=async()=>{
    if(!editForm.registration||!editForm.ac_type){toast('Registration and type required.','error');return;}
    setSaving(true);
    const{registration,manufacturer,model,ac_type,landing_cat,total_hours,total_cycles}=editForm;
    const{error}=await supabase.from('aircraft').update({registration,manufacturer,model,ac_type,landing_cat,
      total_hours:parseFloat(total_hours)||0, total_cycles:parseInt(total_cycles)||0}).eq('id',sel.id);
    if(error){toast(error.message,'error');}
    else{toast('Aircraft updated.','success');setEditing(false);load();}
    setSaving(false);
  };

  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={S.label}>{list.length} AIRCRAFT REGISTERED</span>
          <button style={S.btnPrimary} onClick={()=>setShowAdd(true)}>+ ADD AIRCRAFT</button>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['REGISTRATION','MANUFACTURER','MODEL','TYPE','CAT','TOTAL HOURS','TOTAL CYCLES','STATUS'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map(a=>{
              const t=getTotals(a);
              return(
              <tr key={a.id} onClick={()=>{setSelected(a.id===selected?null:a.id);setEditing(false);}} style={{cursor:'pointer',background:selected===a.id?`${C.accent}08`:'transparent'}}>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{a.registration}</td>
                <td style={S.td}>{a.manufacturer||'—'}</td><td style={S.td}>{a.model||'—'}</td>
                <td style={S.td}>{a.ac_type||'—'}</td>
                <td style={S.td}><span style={S.badge('blue')}>{a.landing_cat}</span></td>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{t.hours}</td>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{t.cycles}</td>
                <td style={S.td}><span style={S.badge(a.active?'green':'red')}>{a.active?'ACTIVE':'INACTIVE'}</span></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel&&!editing&&(()=>{
        const t=getTotals(sel);
        const appHours=t.appMins>0?`${Math.floor(t.appMins/60)}:${String(t.appMins%60).padStart(2,'0')}`:'0:00';
        return(
        <DetailPanel title="Aircraft Detail" onClose={()=>setSelected(null)}>
          <DetailRow label="Registration" value={sel.registration} accent/>
          <DetailRow label="Manufacturer"  value={sel.manufacturer}/>
          <DetailRow label="Model"         value={sel.model}/>
          <DetailRow label="ICAO Type"     value={sel.ac_type}/>
          <DetailRow label="Landing Cat"   value={sel.landing_cat}/>
          <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:12,color:C.t3,fontFamily:"'Courier New',monospace"}}>TOTAL HOURS</span>
              <span style={{fontSize:15,color:C.accent,fontFamily:"'Courier New',monospace",fontWeight:700}}>{t.hours}</span>
            </div>
            <div style={{fontSize:10,color:'#555',fontFamily:"'Courier New',monospace"}}>
              Baseline: {sel.total_hours||0}h + App logged: {appHours}
            </div>
          </div>
          <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
              <span style={{fontSize:12,color:C.t3,fontFamily:"'Courier New',monospace"}}>TOTAL CYCLES</span>
              <span style={{fontSize:15,color:C.accent,fontFamily:"'Courier New',monospace",fontWeight:700}}>{t.cycles}</span>
            </div>
            <div style={{fontSize:10,color:'#555',fontFamily:"'Courier New',monospace"}}>
              Baseline: {sel.total_cycles||0} + App logged: {t.appCycles}
            </div>
          </div>
          <DetailRow label="Status" value={sel.active?'Active':'Inactive'}/>
          <div style={{padding:'12px 16px'}}>
            <button style={{...S.btnPrimary,width:'100%'}} onClick={openEdit}>EDIT AIRCRAFT</button>
          </div>
        </DetailPanel>
        );
      })()}

      {sel&&editing&&(
        <DetailPanel title={`EDIT — ${sel.registration}`} onClose={()=>setEditing(false)} width={380}>
          <div style={{padding:'12px 16px',overflowY:'auto'}}>
            <AircraftForm
              form={editForm} setForm={setEditForm}
              onSave={handleSaveEdit} onCancel={()=>setEditing(false)}
              saveLabel={saving?'SAVING...':'SAVE CHANGES'}
            />
          </div>
        </DetailPanel>
      )}

      {showAdd&&(
        <Modal title="ADD AIRCRAFT" onClose={()=>setShowAdd(false)} width={480}>
          <AircraftForm
            form={form} setForm={setForm}
            onSave={handleAdd} onCancel={()=>setShowAdd(false)}
            saveLabel="ADD AIRCRAFT"
          />
        </Modal>
      )}
    </div>
  );
}
// ─── 4. Crews ─────────────────────────────────────────────────────────────────
function Crews({toast}){
  const[pilots,setPilots]=useState([]);const[quals,setQuals]=useState([]);
  const[loading,setLoading]=useState(true);const[selected,setSelected]=useState(null);
  const[showQual,setShowQual]=useState(false);const[showEfb,setShowEfb]=useState(false);
  const[editingCrew,setEditingCrew]=useState(false);
  const[crewEditForm,setCrewEditForm]=useState({});
  const[showAdd,setShowAdd]=useState(false);
  const[deleteModal,setDeleteModal]=useState(false);
  const[deleteTarget,setDeleteTarget]=useState(null);
  const[deleteConfirm,setDeleteConfirm]=useState(false);
  const[saving,setSaving]=useState(false);
  const[addForm,setAddForm]=useState({full_name:'',code:'',email:'',role:'pilot',password:''});
  const[qualForm,setQualForm]=useState({ac_type:'',seat:'CPT',hand:'BOTH',landing_cat:'CAT1',valid_from:'',valid_until:''});
  const[efbForm,setEfbForm]=useState({efb_training_date:'',efb_training_valid_until:'',efb_training_type:'Initial',efb_trained_by:''});

  const load=useCallback(async()=>{
    setLoading(true);
    const[{data:p},{data:q}]=await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('crew_qualifications').select('*')
    ]);
    setPilots(p||[]);setQuals(q||[]);setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  const sel=pilots.find(p=>p.id===selected);
  const selQuals=quals.filter(q=>q.pilot_id===selected);
  const efbRecord=selQuals.find(q=>q.efb_training_date);

  // Add crew — creates auth user via Supabase admin REST API
  const handleAddCrew=async()=>{
    if(!addForm.full_name||!addForm.code||!addForm.email||!addForm.password){
      toast('All fields required.','error');return;
    }
    setSaving(true);
    try{
      // Create auth user via Supabase admin API
      const url=`${process.env.REACT_APP_SUPABASE_URL}/auth/v1/admin/users`;
      const svcKey=process.env.REACT_APP_SUPABASE_SERVICE_KEY;
      if(!svcKey){toast('REACT_APP_SUPABASE_SERVICE_KEY not set in .env','error');setSaving(false);return;}
      const res=await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':svcKey,'Authorization':`Bearer ${svcKey}`},
        body:JSON.stringify({email:addForm.email,password:addForm.password,email_confirm:true,user_metadata:{full_name:addForm.full_name,code:addForm.code}})
      });
      const authUser=await res.json();
      if(!res.ok){toast(authUser.msg||'Auth user creation failed','error');setSaving(false);return;}
      // Upsert profile
      const{error:profErr}=await supabase.from('profiles').upsert({
        id:authUser.id,full_name:addForm.full_name,code:addForm.code.toUpperCase(),
        email:addForm.email,role:addForm.role
      },{onConflict:'id'});
      if(profErr){toast(`Profile error: ${profErr.message}`,'error');setSaving(false);return;}
      toast(`${addForm.full_name} added successfully.`,'success');
      setShowAdd(false);
      setAddForm({full_name:'',code:'',email:'',role:'pilot',password:''});
      load();
    }catch(e){toast(e.message,'error');}
    setSaving(false);
  };

  // Delete crew — two step confirmation
  const handleDeleteStep1=(pilot)=>{setDeleteTarget(pilot);setDeleteModal(true);setDeleteConfirm(false);};
  const handleDeleteConfirm=async()=>{
    if(!deleteTarget)return;
    setSaving(true);
    try{
      // Delete auth user via admin API
      const url=`${process.env.REACT_APP_SUPABASE_URL}/auth/v1/admin/users/${deleteTarget.id}`;
      const svcKey=process.env.REACT_APP_SUPABASE_SERVICE_KEY;
      await fetch(url,{method:'DELETE',headers:{'apikey':svcKey,'Authorization':`Bearer ${svcKey}`}});
      // Delete profile (cascade should handle qualifications)
      await supabase.from('crew_qualifications').delete().eq('pilot_id',deleteTarget.id);
      await supabase.from('profiles').delete().eq('id',deleteTarget.id);
      toast(`${deleteTarget.full_name} deleted.`,'success');
      setDeleteModal(false);setDeleteTarget(null);setSelected(null);load();
    }catch(e){toast(e.message,'error');}
    setSaving(false);
  };

  const handleAddQual=async()=>{
    if(!qualForm.ac_type){toast('Aircraft type required.','error');return;}
    const{error}=await supabase.from('crew_qualifications').upsert({pilot_id:selected,...qualForm});
    if(error){toast(error.message,'error');return;}
    toast('Qualification saved.','success');setShowQual(false);load();
  };

  const handleSaveCrew=async()=>{
    if(!crewEditForm.full_name||!crewEditForm.code){toast('Name and code required.','error');return;}
    const{error}=await supabase.from('profiles').update({
      full_name:crewEditForm.full_name,
      code:crewEditForm.code.toUpperCase(),
      role:crewEditForm.role,
    }).eq('id',sel.id);
    if(error){toast(error.message,'error');return;}
    toast('Crew updated.','success');setEditingCrew(false);load();
  };
  const handleSaveEfb=async()=>{
    if(!efbForm.efb_training_date){toast('Training date required.','error');return;}
    const existing=selQuals[0];
    if(existing){await supabase.from('crew_qualifications').update(efbForm).eq('id',existing.id);}
    else{await supabase.from('crew_qualifications').insert({pilot_id:selected,ac_type:'EFB',seat:'BOTH',hand:'BOTH',landing_cat:'CAT1',...efbForm});}
    toast('EFB training record saved.','success');setShowEfb(false);load();
  };
  const efbStatus=rec=>{
    if(!rec?.efb_training_date)return{color:'#e02020',label:'NO RECORD'};
    if(!rec.efb_training_valid_until)return{color:'#2d9e5f',label:'CURRENT'};
    const d=Math.floor((new Date(rec.efb_training_valid_until)-new Date())/86400000);
    if(d<0)return{color:'#e02020',label:'EXPIRED'};
    if(d<30)return{color:'#e8731a',label:`${d}d LEFT`};
    return{color:'#2d9e5f',label:'CURRENT'};
  };

  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={S.label}>{pilots.length} CREW MEMBERS</span>
          <div style={{display:'flex',gap:8}}>
            <button style={S.btnPrimary} onClick={()=>setShowAdd(true)}>+ ADD CREW</button>
            {selected&&<button style={S.btnDanger} onClick={()=>handleDeleteStep1(sel)}>DELETE CREW</button>}
          </div>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['CODE','FULL NAME','ROLE','EMAIL','QUALIFICATIONS','EFB TRAINING','PWD'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {pilots.map(p=>{
              const pQ=quals.filter(q=>q.pilot_id===p.id);const pE=pQ.find(q=>q.efb_training_date);const pS=efbStatus(pE);
              return(
                <tr key={p.id} onClick={()=>setSelected(p.id===selected?null:p.id)} style={{cursor:'pointer',background:selected===p.id?`${C.accent}08`:'transparent'}}>
                  <td style={{...S.td,color:C.accent,fontWeight:700,fontSize:13}}>{p.code||'—'}</td>
                  <td style={{...S.td,color:C.t1}}>{p.full_name||'—'}</td>
                  <td style={S.td}><span style={S.badge(p.role==='admin'?'':'blue')}>{(p.role||'—').toUpperCase()}</span></td>
                  <td style={S.td}>{p.email||'—'}</td>
                  <td style={S.td}>{pQ.filter(q=>q.ac_type!=='EFB').length===0?<span style={{color:C.t3}}>—</span>:pQ.filter(q=>q.ac_type!=='EFB').map(q=><span key={q.id} style={{...S.badge('blue'),marginRight:4}}>{q.ac_type} {q.seat} {q.landing_cat}</span>)}</td>
                  <td style={S.td}><span style={{...S.badge(''),color:pS.color,background:`${pS.color}15`,border:`1px solid ${pS.color}40`}}>{pS.label}</span></td>
                  <td style={S.td}><button style={S.btnSecondary} onClick={async e=>{e.stopPropagation();if(!p.email)return;const{error}=await supabase.auth.resetPasswordForEmail(p.email);if(error)toast(error.message,'error');else toast(`Reset sent to ${p.email}`,'success');}}>RESET PWD</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel&&(
        <DetailPanel title={`${sel.code} — ${sel.full_name}`} onClose={()=>{setSelected(null);setEditingCrew(false);}}>
          {!editingCrew ? (<>
            <DetailRow label="Code" value={sel.code} accent/><DetailRow label="Full Name" value={sel.full_name}/>
            <DetailRow label="Email" value={sel.email}/><DetailRow label="Role" value={sel.role}/>
            <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}>
              <button style={{...S.btnSecondary,width:'100%'}} onClick={()=>{setCrewEditForm({full_name:sel.full_name||'',code:sel.code||'',role:sel.role||'pilot'});setEditingCrew(true);}}>
                EDIT PROFILE
              </button>
            </div>
          </>) : (<>
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{...S.label,marginBottom:12}}>EDIT CREW PROFILE</div>
              <div style={S.formGroup}><label style={S.formLabel}>FULL NAME *</label>
                <input style={S.input} value={crewEditForm.full_name} onChange={e=>setCrewEditForm(p=>({...p,full_name:e.target.value}))}/>
              </div>
              <div style={S.formGroup}><label style={S.formLabel}>CODE *</label>
                <input style={S.input} maxLength={5} value={crewEditForm.code} onChange={e=>setCrewEditForm(p=>({...p,code:e.target.value.toUpperCase()}))}/>
              </div>
              <div style={S.formGroup}><label style={S.formLabel}>ROLE</label>
                <select style={S.select} value={crewEditForm.role} onChange={e=>setCrewEditForm(p=>({...p,role:e.target.value}))}>
                  <option value="pilot">Pilot</option>
                  <option value="admin">Admin</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="admin_pilot">Admin + Pilot</option>
                </select>
              </div>
              <div style={{display:'flex',gap:8}}>
                <button style={{...S.btnSecondary,flex:1}} onClick={()=>setEditingCrew(false)}>CANCEL</button>
                <button style={{...S.btnPrimary,flex:2}} onClick={handleSaveCrew}>SAVE</button>
              </div>
            </div>
          </>)}
          <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{...S.label,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span>EFB Training</span>
              {(()=>{const st=efbStatus(efbRecord);return<span style={{...S.badge(''),color:st.color,background:`${st.color}15`,border:`1px solid ${st.color}40`}}>{st.label}</span>;})()}
            </div>
            {efbRecord?(<div style={{fontSize:12,color:C.t1,fontFamily:"'Courier New',monospace",lineHeight:2}}>
              <div>Type: <span style={{color:C.accent}}>{efbRecord.efb_training_type||'—'}</span></div>
              <div>Date: {efbRecord.efb_training_date}</div>
              <div>Valid Until: {efbRecord.efb_training_valid_until||'—'}</div>
              <div>Trained By: {efbRecord.efb_trained_by||'—'}</div>
            </div>):<div style={{fontSize:12,color:'#e02020',marginBottom:8}}>No EFB training record on file</div>}
            <button style={{...S.btnPrimary,marginTop:10,width:'100%'}} onClick={()=>{setEfbForm({efb_training_date:efbRecord?.efb_training_date||'',efb_training_valid_until:efbRecord?.efb_training_valid_until||'',efb_training_type:efbRecord?.efb_training_type||'Initial',efb_trained_by:efbRecord?.efb_trained_by||''});setShowEfb(true);}}>
              {efbRecord?'UPDATE EFB TRAINING':'ADD EFB TRAINING'}
            </button>
          </div>
          <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}>
            <div style={{...S.label,marginBottom:8}}>Type Qualifications</div>
            {selQuals.filter(q=>q.ac_type!=='EFB').length===0&&<div style={{fontSize:12,color:C.t3}}>No qualifications</div>}
            {selQuals.filter(q=>q.ac_type!=='EFB').map(q=>(
              <div key={q.id} style={{marginBottom:8,padding:'8px 10px',background:C.bg3,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.accent,fontWeight:700,fontFamily:"'Courier New',monospace"}}>{q.ac_type}</div>
                <div style={{fontSize:11,color:C.t2,marginTop:3,fontFamily:"'Courier New',monospace"}}>{q.seat} · {q.hand} · {q.landing_cat}</div>
              </div>
            ))}
            <button style={{...S.btnPrimary,marginTop:8,width:'100%'}} onClick={()=>setShowQual(true)}>+ ADD QUALIFICATION</button>
          </div>
        </DetailPanel>
      )}

      {/* Add Crew Modal */}
      {showAdd&&(
        <Modal title="ADD CREW MEMBER" onClose={()=>setShowAdd(false)} width={480}>
          <div style={{fontSize:11,color:'#e8731a',marginBottom:16,padding:'8px 12px',background:'rgba(232,115,26,0.08)',border:'1px solid rgba(232,115,26,0.2)'}}>
            REACT_APP_SUPABASE_SERVICE_KEY must be set in .env for user creation.
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={S.formGroup}><label style={S.formLabel}>FULL NAME *</label><input style={S.input} placeholder="Capt. Ali Veli" value={addForm.full_name} onChange={e=>setAddForm(p=>({...p,full_name:e.target.value}))}/></div>
            <div style={S.formGroup}><label style={S.formLabel}>CODE *</label><input style={S.input} placeholder="AAK" maxLength={5} value={addForm.code} onChange={e=>setAddForm(p=>({...p,code:e.target.value.toUpperCase()}))}/></div>
            <div style={S.formGroup}><label style={S.formLabel}>EMAIL *</label><input style={S.input} placeholder="pilot@airline.com" type="email" value={addForm.email} onChange={e=>setAddForm(p=>({...p,email:e.target.value}))}/></div>
            <div style={S.formGroup}><label style={S.formLabel}>TEMP PASSWORD *</label><input style={S.input} placeholder="Min 8 chars" type="password" value={addForm.password} onChange={e=>setAddForm(p=>({...p,password:e.target.value}))}/></div>
          </div>
          <div style={S.formGroup}><label style={S.formLabel}>ROLE</label>
            <select style={S.select} value={addForm.role} onChange={e=>setAddForm(p=>({...p,role:e.target.value}))}>
              <option value="pilot">Pilot</option>
              <option value="admin">Admin</option>
              <option value="dispatcher">Dispatcher</option>
                  <option value="admin_pilot">Admin + Pilot</option>
            </select>
          </div>
          <div style={{fontSize:11,color:C.t3,marginTop:4,fontFamily:"'Courier New',monospace",lineHeight:1.6}}>
            After creation, add qualifications from the crew detail panel. Pilot will appear in flight crew selection only for plans matching their qualified aircraft type.
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
            <button style={S.btnSecondary} onClick={()=>setShowAdd(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAddCrew} disabled={saving}>{saving?'CREATING...':'CREATE CREW MEMBER'}</button>
          </div>
        </Modal>
      )}

      {/* Delete Crew Modal — Step 1: which crew */}
      {deleteModal&&deleteTarget&&!deleteConfirm&&(
        <Modal title="DELETE CREW MEMBER" onClose={()=>{setDeleteModal(false);setDeleteTarget(null);}}>
          <div style={{fontSize:12,color:'#e02020',marginBottom:16,padding:'10px 12px',background:'rgba(224,32,32,0.08)',border:'1px solid rgba(224,32,32,0.2)'}}>
            This will permanently delete the crew member and all their qualifications.
          </div>
          <DetailRow label="Name"  value={deleteTarget.full_name} accent/>
          <DetailRow label="Code"  value={deleteTarget.code}/>
          <DetailRow label="Email" value={deleteTarget.email}/>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={S.btnSecondary} onClick={()=>{setDeleteModal(false);setDeleteTarget(null);}}>CANCEL</button>
            <button style={S.btnDanger} onClick={()=>setDeleteConfirm(true)}>CONTINUE</button>
          </div>
        </Modal>
      )}

      {/* Delete Crew Modal — Step 2: confirm */}
      {deleteModal&&deleteTarget&&deleteConfirm&&(
        <Modal title="CONFIRM DELETION" onClose={()=>{setDeleteModal(false);setDeleteTarget(null);setDeleteConfirm(false);}}>
          <div style={{fontSize:14,color:'#fff',textAlign:'center',padding:'20px 0'}}>
            Are you sure you want to delete<br/>
            <span style={{color:'#e02020',fontWeight:700}}>{deleteTarget.full_name}</span>?<br/>
            <span style={{fontSize:11,color:C.t3}}>This action cannot be undone.</span>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
            <button style={S.btnSecondary} onClick={()=>{setDeleteModal(false);setDeleteTarget(null);setDeleteConfirm(false);}}>NO — CANCEL</button>
            <button style={S.btnDanger} onClick={handleDeleteConfirm} disabled={saving}>{saving?'DELETING...':'YES — DELETE'}</button>
          </div>
        </Modal>
      )}

      {showEfb&&selected&&(
        <Modal title="EFB TRAINING RECORD — AMC 20-25" onClose={()=>setShowEfb(false)}>
          <div style={S.formGroup}><label style={S.formLabel}>TRAINING TYPE</label>
            <select style={S.select} value={efbForm.efb_training_type} onChange={e=>setEfbForm(p=>({...p,efb_training_type:e.target.value}))}>
              <option value="Initial">Initial</option><option value="Recurrent">Recurrent</option><option value="Differences">Differences</option><option value="OJT">OJT</option>
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={S.formGroup}><label style={S.formLabel}>TRAINING DATE *</label><input type="date" style={S.input} value={efbForm.efb_training_date} onChange={e=>setEfbForm(p=>({...p,efb_training_date:e.target.value}))}/></div>
            <div style={S.formGroup}><label style={S.formLabel}>VALID UNTIL</label><input type="date" style={S.input} value={efbForm.efb_training_valid_until} onChange={e=>setEfbForm(p=>({...p,efb_training_valid_until:e.target.value}))}/></div>
          </div>
          <div style={S.formGroup}><label style={S.formLabel}>TRAINED BY</label><input style={S.input} placeholder="Name or organization" value={efbForm.efb_trained_by} onChange={e=>setEfbForm(p=>({...p,efb_trained_by:e.target.value}))}/></div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={S.btnSecondary} onClick={()=>setShowEfb(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleSaveEfb}>SAVE RECORD</button>
          </div>
        </Modal>
      )}
      {showQual&&selected&&(
        <Modal title="ADD QUALIFICATION" onClose={()=>setShowQual(false)}>
          <div style={S.formGroup}><label style={S.formLabel}>AIRCRAFT TYPE *</label><input style={S.input} placeholder="GLF4" value={qualForm.ac_type} onChange={e=>setQualForm(p=>({...p,ac_type:e.target.value.toUpperCase()}))}/></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={S.formGroup}><label style={S.formLabel}>SEAT</label><select style={S.select} value={qualForm.seat} onChange={e=>setQualForm(p=>({...p,seat:e.target.value}))}><option value="CPT">CPT</option><option value="FO">FO</option><option value="BOTH">BOTH</option></select></div>
            <div style={S.formGroup}><label style={S.formLabel}>HAND</label><select style={S.select} value={qualForm.hand} onChange={e=>setQualForm(p=>({...p,hand:e.target.value}))}><option value="LH">LH</option><option value="RH">RH</option><option value="BOTH">BOTH</option></select></div>
          </div>
          <div style={S.formGroup}><label style={S.formLabel}>LANDING CATEGORY</label>
            <select style={S.select} value={qualForm.landing_cat} onChange={e=>setQualForm(p=>({...p,landing_cat:e.target.value}))}>
              <option value="CAT1">CAT I</option><option value="CAT2">CAT II</option><option value="CAT3">CAT III</option>
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div style={S.formGroup}><label style={S.formLabel}>VALID FROM</label><input type="date" style={S.input} value={qualForm.valid_from} onChange={e=>setQualForm(p=>({...p,valid_from:e.target.value}))}/></div>
            <div style={S.formGroup}><label style={S.formLabel}>VALID UNTIL</label><input type="date" style={S.input} value={qualForm.valid_until} onChange={e=>setQualForm(p=>({...p,valid_until:e.target.value}))}/></div>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={S.btnSecondary} onClick={()=>setShowQual(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAddQual}>SAVE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
// ─── 5. Statistics ────────────────────────────────────────────────────────────
function Statistics(){
  const[flights,setFlights]=useState([]);
  const[pilots,setPilots]=useState([]);
  const[aircraft,setAircraft]=useState([]);
  const[loading,setLoading]=useState(true);
  const[filterReg,setFilterReg]=useState('');
  const[filterCrew,setFilterCrew]=useState('');

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const[{data:f},{data:p},{data:a}]=await Promise.all([
        supabase.from('archived_flights').select('*,plans(dep,dest,reg,ac_type,pf_pilot,pm_pilot)').order('archived_at',{ascending:false}),
        supabase.from('profiles').select('id,full_name,code').in('role',['pilot','admin_pilot']).order('full_name'),
        supabase.from('aircraft').select('registration').order('registration'),
      ]);
      setFlights(f||[]);setPilots(p||[]);setAircraft(a||[]);
      setLoading(false);
    })();
  },[]);

  const fmt=m=>m?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`:'0:00';

  const filtered=flights.filter(f=>{
    const reg=f.plans?.reg||'';
    const pfId=f.plans?.pf_pilot||f.pf_id||'';
    const pmId=f.plans?.pm_pilot||f.sic_id||'';
    const regOk=!filterReg||reg===filterReg;
    const crewOk=!filterCrew||(pfId===filterCrew||pmId===filterCrew);
    return regOk&&crewOk;
  });

  const calcStats=arr=>({
    total:arr.length,
    totalFlightMins:arr.reduce((s,f)=>s+(f.airborne_minutes||0),0),
    totalBlockMins:arr.reduce((s,f)=>s+(f.block_minutes||0),0),
    totalLandings:arr.reduce((s,f)=>s+(f.landing_count||0),0),
    nightLandings:arr.filter(f=>f.is_night_landing).length,
  });
  const stats=calcStats(filtered);

  const selPilot=pilots.find(p=>p.id===filterCrew);
  const title=filterReg&&filterCrew
    ? `${filterReg} · ${selPilot?.code||''}`
    : filterReg ? filterReg
    : filterCrew ? `${selPilot?.code} — ${selPilot?.full_name}`
    : 'ALL FLIGHTS';

  return(
    <div style={{flex:1,overflowY:'auto'}}>
      {/* Filter bar */}
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',background:C.bg3}}>
        <span style={S.label}>FILTER:</span>
        <select style={{...S.select,width:140}} value={filterReg} onChange={e=>setFilterReg(e.target.value)}>
          <option value="">All Aircraft</option>
          {aircraft.filter(a=>a.registration).map(a=>(
            <option key={a.registration} value={a.registration}>{a.registration}</option>
          ))}
        </select>
        <select style={{...S.select,width:200}} value={filterCrew} onChange={e=>setFilterCrew(e.target.value)}>
          <option value="">All Crew</option>
          {pilots.map(p=>(
            <option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>
          ))}
        </select>
        {(filterReg||filterCrew)&&(
          <button style={{...S.btnSecondary,fontSize:11,padding:'5px 12px'}} onClick={()=>{setFilterReg('');setFilterCrew('');}}>
            CLEAR
          </button>
        )}
        <span style={{...S.label,marginLeft:'auto',color:C.accent}}>{title}</span>
      </div>

      {/* Stats cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:C.border,borderBottom:`1px solid ${C.border}`}}>
        {loading?<div style={{padding:24,color:C.t3,fontSize:11,gridColumn:'1/-1',textAlign:'center'}}>LOADING...</div>:[
          {label:'Total Flights',  value:stats.total},
          {label:'Flight Hours',   value:fmt(stats.totalFlightMins)},
          {label:'Block Hours',    value:fmt(stats.totalBlockMins)},
          {label:'Total Landings', value:stats.totalLandings},
          {label:'Night Landings', value:stats.nightLandings},
        ].map(({label,value})=>(
          <div key={label} style={{background:C.bg2,padding:'16px 20px'}}>
            <div style={S.label}>{label}</div>
            <div style={{fontSize:22,fontWeight:700,color:C.accent,fontFamily:"'Courier New',monospace",marginTop:6}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Flights table */}
      <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}>
        <span style={{...S.label,fontSize:10}}>{filtered.length} FLIGHTS</span>
      </div>
      <SortableTable flights={filtered} fmt={fmt}/>
    </div>
  );
}

function SortableTable({flights, fmt}){
  const[sortKey,setSortKey]=useState('archived_at');
  const[sortDir,setSortDir]=useState('desc'); // default: newest first

  const COLS=[
    {key:'archived_at',  label:'DATE'},
    {key:'dep',          label:'DEP'},
    {key:'dest',         label:'DEST'},
    {key:'reg',          label:'REG'},
    {key:'block_minutes',label:'BLOCK'},
    {key:'airborne_minutes',label:'FLIGHT'},
    {key:'landing_count',label:'LANDINGS'},
    {key:'is_night_landing',label:'NIGHT'},
  ];

  const toggle=(key)=>{
    if(sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc');
    else{setSortKey(key);setSortDir('asc');}
  };

  const getValue=(f,key)=>{
    if(key==='dep')  return f.departure_icao||f.plans?.dep||'';
    if(key==='dest') return f.destination_icao||f.plans?.dest||'';
    if(key==='reg')  return f.plans?.reg||'';
    return f[key]??'';
  };

  const sorted=[...flights].sort((a,b)=>{
    const av=getValue(a,sortKey), bv=getValue(b,sortKey);
    const dir=sortDir==='asc'?1:-1;
    if(typeof av==='number'&&typeof bv==='number') return (av-bv)*dir;
    return String(av).localeCompare(String(bv))*dir;
  });

  const icon=(key)=>{
    if(sortKey!==key) return <span style={{color:'#333',marginLeft:4}}>⇅</span>;
    return <span style={{color:C.accent,marginLeft:4}}>{sortDir==='asc'?'↑':'↓'}</span>;
  };

  return(
    <table style={S.table}>
      <thead>
        <tr>
          {COLS.map(c=>(
            <th key={c.key} style={{...S.th,cursor:'pointer',userSelect:'none'}} onClick={()=>toggle(c.key)}>
              {c.label}{icon(c.key)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map(f=>(
          <tr key={f.id}>
            <td style={S.td}>{f.archived_at?new Date(f.archived_at).toLocaleDateString('en-GB'):'—'}</td>
            <td style={{...S.td,color:C.accent}}>{f.departure_icao||f.plans?.dep||'—'}</td>
            <td style={{...S.td,color:C.accent}}>{f.destination_icao||f.plans?.dest||'—'}</td>
            <td style={S.td}>{f.plans?.reg||'—'}</td>
            <td style={S.td}>{fmt(f.block_minutes)}</td>
            <td style={S.td}>{fmt(f.airborne_minutes)}</td>
            <td style={S.td}>{f.landing_count||'—'}</td>
            <td style={S.td}>{f.is_night_landing?<span style={S.badge('blue')}>NIGHT</span>:'—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── 6. Station INFO ──────────────────────────────────────────────────────────
function StationInfo({toast}){
  const [airports,   setAirports]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState(null);
  const [riskModal,  setRiskModal]  = useState(null); // ICAO string

  useEffect(()=>{
    setLoading(true);
    supabase.from('airport_risks').select('icao,name,country,category,base_score,risk_level,ops_approval,ad_elev_ft,max_s,max_l,mitigation')
      .order('icao').then(({data})=>{setAirports(data||[]);setLoading(false);});
  },[]);

  const filtered = airports.filter(a =>
    !search || a.icao.toLowerCase().includes(search.toLowerCase()) ||
    (a.name||'').toLowerCase().includes(search.toLowerCase())
  );

  const sel = airports.find(a=>a.icao===selected);

  const riskBadge = (level) => {
    const textColors = {LOW:'#4a9bc4', MEDIUM:'#e8a320', HIGH:'#e8731a', EXTREME:'#e02020'};
    return (
      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',
        background: level==='LOW'?C.blueDim: level==='MEDIUM'?'#2a1a00': level==='HIGH'?'#1a0a00':'#1a0000',
        color: textColors[level]||'#888',
        border:`1px solid ${textColors[level]||'#444'}`}}>
        {level||'—'}
      </span>
    );
  };

  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}>
          <input placeholder="ICAO veya havalimanı adı..." value={search}
            onChange={e=>setSearch(e.target.value.toUpperCase())}
            style={{...S.input,width:260}}/>
          <span style={{...S.label,marginLeft:'auto'}}>{filtered.length} AIRPORTS</span>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['ICAO','AIRPORT NAME','CAT','ELEV FT','BASE SCORE','RISK LEVEL','OPS APPROVAL'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(a=>(
              <tr key={a.icao} onClick={()=>setSelected(a.icao===selected?null:a.icao)}
                style={{cursor:'pointer',background:selected===a.icao?`${C.accent}08`:'transparent'}}>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{a.icao}</td>
                <td style={S.td}>{a.name||'—'}</td>
                <td style={S.td}><span style={S.badge('blue')}>{a.category||'B'}</span></td>
                <td style={S.td}>{a.ad_elev_ft||'—'}</td>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{a.base_score||0}</td>
                <td style={S.td}>{riskBadge(a.risk_level)}</td>
                <td style={{...S.td,fontSize:11,color:C.t3}}>{a.ops_approval||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel&&(
        <DetailPanel title={sel.icao} onClose={()=>setSelected(null)} width={360}>
          <DetailRow label="ICAO"       value={sel.icao} accent/>
          <DetailRow label="Name"       value={sel.name}/>
          <DetailRow label="Category"   value={sel.category||'B'}/>
          <DetailRow label="Elevation"  value={sel.ad_elev_ft ? `${sel.ad_elev_ft} ft` : '—'}/>
          <DetailRow label="Base Score" value={sel.base_score||0}/>
          <DetailRow label="Risk Level" value={sel.risk_level||'—'}/>
          <DetailRow label="Max S"      value={sel.max_s||1}/>
          <DetailRow label="Max L"      value={sel.max_l||1}/>
          {sel.mitigation&&(
            <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.t3,lineHeight:1.7}}>
              {sel.mitigation}
            </div>
          )}
          <div style={{padding:'12px 16px'}}>
            <button style={{...S.btnPrimary,width:'100%'}} onClick={()=>setRiskModal(sel.icao)}>
              RISK ASSESSMENT MATRIX
            </button>
          </div>
        </DetailPanel>
      )}

      {/* Risk Assessment Modal */}
      {riskModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:20}}>
          <div style={{background:'#111',border:'1px solid #2a2a2a',width:'100%',maxWidth:640,maxHeight:'90vh',overflowY:'auto',borderRadius:8}}>
            <RiskAssessmentInline icao={riskModal} onClose={()=>setRiskModal(null)}/>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline version of Risk Assessment for AdminPanel (no external import)
function RiskAssessmentInline({icao, onClose}){
  const TOPICS_LIST = [
    'Approach & Traffic Density','Obstacles / Terrain','Seasonal / Meteorology',
    'ATC Phraseology / Language','Complex Taxi Routings','RWY Ops / Late Clearance',
    'Security / Terror Threat','Handling / Fuel / Pax Support','Radio Nav / GNSS Reliability',
    'Other Local Constraints',
  ];
  const ADDONS_LIST = [
    {key:'night',label:'Night Ops',pts:1},{key:'xw',label:'Strong XW/Gust',pts:2},
    {key:'wet',label:'RWY Wet/Contam',pts:2},{key:'lv',label:'Low Vis/TS',pts:2},
    {key:'fam',label:'Crew Low FAM',pts:2},
  ];
  const RISK_C = {
    LOW:    {bg:'rgba(26,155,196,0.12)',border:'#1a9bc4',text:'#1a9bc4'},
    MEDIUM: {bg:'rgba(232,163,32,0.12)',border:'#e8a320',text:'#e8a320'},
    HIGH:   {bg:'rgba(232,115,26,0.12)',border:'#e8731a',text:'#e8731a'},
    EXTREME:{bg:'rgba(224,32,32,0.12)', border:'#e02020',text:'#e02020'},
  };
  const cellC = (score) => score>=20?{bg:'#3a0808',text:'#f06060'}:score>=12?{bg:'#2a1200',text:'#e8731a'}:score>=6?{bg:'#0a1a00',text:'#6db890'}:{bg:'#0a1a2a',text:'#4a9bc4'};
  const sColor = (v) => v>=5?'#e02020':v>=4?'#e8731a':v>=3?'#e8a320':v>=2?'#1a9bc4':'#2d9e5f';
  const getRisk = (t) => t<=6?'LOW':t<=9?'MEDIUM':t<=12?'HIGH':'EXTREME';
  const getOps  = (rl,cat) => rl==='EXTREME'?'OPS MANAGER APPROVAL REQUIRED':rl==='HIGH'&&cat==='C'?'OPS MANAGER APPROVAL REQUIRED':rl==='HIGH'?'CAPTAIN REVIEW / DISPATCH COORDINATION':'DISPATCH OK';

  const [ap,      setAp]    = useState(null);
  const [loading, setLoad]  = useState(true);
  const [addons,  setAd]    = useState({});
  const [tab,     setTab]   = useState('matrix');
  const [editing, setEditing]= useState(false);
  const [saving,  setSaving] = useState(false);
  // Edit form state
  const [sEdit,   setSEdit]  = useState(Array(10).fill(1));
  const [lEdit,   setLEdit]  = useState(Array(10).fill(1));
  const [catEdit, setCatEdit]= useState('B');
  const [mitEdit, setMitEdit]= useState('');

  useEffect(()=>{
    supabase.from('airport_risks').select('*').eq('icao',icao).single()
      .then(({data})=>{
        setAp(data);
        if(data){
          const ss = typeof data.s_scores==='string' ? JSON.parse(data.s_scores) : (data.s_scores||[]);
          const ls = typeof data.l_scores==='string' ? JSON.parse(data.l_scores) : (data.l_scores||[]);
          setSEdit(ss.map(v=>parseFloat(v)||1));
          setLEdit(ls.map(v=>parseFloat(v)||1));
          setCatEdit(data.category||'B');
          setMitEdit(data.mitigation||'');
        }
        setLoad(false);
      });
  },[icao]);

  if(loading) return <div style={{padding:32,textAlign:'center',color:'#555',fontFamily:"'Courier New',monospace"}}>LOADING {icao}...</div>;
  if(!ap) return <div style={{padding:16,color:'#e02020',fontFamily:"'Courier New',monospace"}}>Not found: {icao}</div>;

  // Compute from edit arrays when editing, else from DB
  const sArr = editing ? sEdit : (ap.s_scores||[]).map(v=>parseFloat(v)||0);
  const lArr = editing ? lEdit : (ap.l_scores||[]).map(v=>parseFloat(v)||0);
  // Max score = max of S×L per topic
  const topicScores = sArr.map((sv,i)=>sv*(lArr[i]||0));
  const baseScore   = editing ? Math.max(...topicScores,0) : (ap.base_score||0);
  const maxSVal     = editing ? (sArr.reduce((a,b)=>Math.max(a,b),1)) : (ap.max_s||1);
  const maxLVal     = editing ? (lArr.reduce((a,b)=>Math.max(a,b),1)) : (ap.max_l||1);
  const adPts = ADDONS_LIST.reduce((s,a)=>s+(addons[a.key]?a.pts:0),0);
  const total = baseScore + adPts;
  const rl = getRisk(total);
  const rc = RISK_C[rl]||RISK_C.LOW;

  const handleSave = async () => {
    setSaving(true);
    const newBase = Math.max(...topicScores, 0);
    const newMaxS = sEdit.reduce((a,b)=>Math.max(a,b),1);
    const newMaxL = lEdit.reduce((a,b)=>Math.max(a,b),1);
    const newRL   = getRisk(newBase);
    const newOps  = getOps(newRL, catEdit);
    const {error} = await supabase.from('airport_risks').update({
      s_scores:   JSON.stringify(sEdit),
      l_scores:   JSON.stringify(lEdit),
      base_score: newBase,
      max_s:      newMaxS,
      max_l:      newMaxL,
      risk_level: newRL,
      ops_approval: newOps,
      category:   catEdit,
      mitigation: mitEdit,
      updated_at: new Date().toISOString(),
    }).eq('icao', icao);
    if(error){ alert(error.message); }
    else {
      // Refresh
      const {data} = await supabase.from('airport_risks').select('*').eq('icao',icao).single();
      setAp(data);
      setEditing(false);
    }
    setSaving(false);
  };

  const tabS = (t) => ({flex:1,padding:'8px 4px',textAlign:'center',cursor:'pointer',
    fontFamily:"'Courier New',monospace",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',
    color:tab===t?'#1a9bc4':'#555',borderBottom:tab===t?'2px solid #1a9bc4':'2px solid transparent',background:'transparent',border:'none'});

  const ScoreInput = ({val, onChange}) => (
    <select value={val} onChange={e=>onChange(parseInt(e.target.value))}
      style={{background:'#1a1a1a',border:'1px solid #383838',color:'#e8e8e8',fontSize:11,padding:'3px 6px',borderRadius:3,fontFamily:"'Courier New',monospace",width:44}}>
      {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
    </select>
  );

  return(
    <div style={{fontFamily:"'Courier New',monospace",color:'#e8e8e8'}}>
      {/* Header */}
      <div style={{padding:'14px 18px',background:'#1a1a1a',borderBottom:'1px solid #2a2a2a',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:'#e8a020',letterSpacing:2}}>{ap.icao}</div>
          <div style={{fontSize:13,color:'#e8e8e8',marginTop:2}}>{ap.name}</div>
          <div style={{fontSize:10,color:'#555',marginTop:3}}>CAT {editing?catEdit:ap.category||'B'}{ap.ad_elev_ft?` · ${ap.ad_elev_ft} ft`:''}</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {!editing ? (
            <button onClick={()=>setEditing(true)}
              style={{...S.btnSecondary,fontSize:10,padding:'5px 12px'}}>EDIT SCORES</button>
          ) : (
            <>
              <button onClick={()=>setEditing(false)}
                style={{...S.btnSecondary,fontSize:10,padding:'5px 12px'}}>CANCEL</button>
              <button onClick={handleSave} disabled={saving}
                style={{...S.btnPrimary,fontSize:10,padding:'5px 12px'}}>{saving?'SAVING...':'SAVE'}</button>
            </>
          )}
          <button onClick={onClose} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:20}}>x</button>
        </div>
      </div>

      {/* Category edit when editing */}
      {editing && (
        <div style={{padding:'8px 12px',background:'#161616',borderBottom:'1px solid #2a2a2a',display:'flex',gap:16,alignItems:'center'}}>
          <div style={{fontSize:10,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Category</div>
          <select value={catEdit} onChange={e=>setCatEdit(e.target.value)}
            style={{background:'#1a1a1a',border:'1px solid #383838',color:'#e8e8e8',fontSize:11,padding:'4px 8px',borderRadius:3}}>
            <option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
          <div style={{fontSize:10,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Mitigation</div>
          <input value={mitEdit} onChange={e=>setMitEdit(e.target.value)}
            style={{...S.input,flex:1,fontSize:11}} placeholder="Brief mitigation note..."/>
        </div>
      )}

      {/* Score card */}
      <div style={{display:'flex',gap:2,margin:'12px 12px 0',background:'#2a2a2a',padding:2}}>
        <div style={{flex:1,background:rc.bg,border:`2px solid ${rc.border}`,padding:'12px 10px',textAlign:'center'}}>
          <div style={{fontSize:36,fontWeight:800,color:rc.text,lineHeight:1}}>{total}</div>
          <div style={{fontSize:9,color:rc.text,opacity:.7,marginTop:2}}>BASE {baseScore}{adPts>0?` + ${adPts}`:''}</div>
        </div>
        <div style={{flex:2,background:'#1a1a1a',border:`2px solid ${rc.border}`,padding:'12px 14px'}}>
          <div style={{fontSize:18,fontWeight:800,color:rc.text}}>{rl}</div>
          <div style={{fontSize:10,color:rc.text,opacity:.8,marginTop:4}}>{getOps(rl,editing?catEdit:ap.category)}</div>
        </div>
        <div style={{flex:2,background:'#1a1a1a',border:'2px solid #2a2a2a',padding:'12px 14px',fontSize:10,color:'#777',lineHeight:1.8}}>
          <div>MAX S: <span style={{color:'#e8e8e8',fontWeight:700}}>{maxSVal}</span></div>
          <div>MAX L: <span style={{color:'#e8e8e8',fontWeight:700}}>{maxLVal}</span></div>
          <div style={{marginTop:4,color:'#555',fontSize:9}}>{(editing?mitEdit:ap.mitigation||'').slice(0,60)}</div>
        </div>
      </div>

      {/* Addons */}
      <div style={{margin:'10px 12px 0',background:'#1a1a1a',border:'1px solid #2a2a2a',padding:'10px 12px'}}>
        <div style={{fontSize:9,color:'#555',fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:'uppercase'}}>Operasyonel Faktörler</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {ADDONS_LIST.map(a=>(
            <div key={a.key} onClick={()=>setAd(p=>({...p,[a.key]:!p[a.key]}))}
              style={{cursor:'pointer',padding:'5px 10px',borderRadius:4,fontSize:10,fontWeight:700,
                background:addons[a.key]?'rgba(232,115,26,0.2)':'#252525',
                border:`1px solid ${addons[a.key]?'#e8731a':'#383838'}`,
                color:addons[a.key]?'#e8731a':'#555'}}>
              {addons[a.key]?'✓':'+'} {a.label} (+{a.pts})
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',margin:'10px 12px 0',borderBottom:'1px solid #2a2a2a'}}>
        <button style={tabS('matrix')}  onClick={()=>setTab('matrix')}>5×5 Matrix</button>
        <button style={tabS('topics')}  onClick={()=>setTab('topics')}>{editing?'✏ Edit Scores':'Topic Scores'}</button>
        <button style={tabS('briefing')} onClick={()=>setTab('briefing')}>PPS Briefing</button>
      </div>

      <div style={{margin:'0 12px 12px',background:'#1a1a1a',border:'1px solid #2a2a2a',overflowX:'auto'}}>
        {/* 5x5 Matrix */}
        {tab==='matrix'&&(
          <div style={{padding:12}}>
            <div style={{fontSize:9,color:'#555',marginBottom:8}}>Mevcut: S={maxSVal} × L={maxLVal} → Base {baseScore} · Total {total}</div>
            <div style={{display:'grid',gridTemplateColumns:'24px repeat(5,1fr)',gap:2,marginBottom:2}}>
              <div style={{fontSize:9,color:'#444',textAlign:'center'}}>L\S</div>
              {[1,2,3,4,5].map(sv=><div key={sv} style={{fontSize:9,color:'#555',textAlign:'center',fontWeight:700}}>S{sv}</div>)}
            </div>
            {[5,4,3,2,1].map(lv=>(
              <div key={lv} style={{display:'grid',gridTemplateColumns:'24px repeat(5,1fr)',gap:2,marginBottom:2}}>
                <div style={{fontSize:9,color:'#555',textAlign:'center',fontWeight:700,alignSelf:'center'}}>L{lv}</div>
                {[1,2,3,4,5].map(sv=>{
                  const cs=lv*sv; const cc=cellC(cs); const isCur=lv===maxLVal&&sv===maxSVal;
                  return <div key={sv} style={{background:cc.bg,border:isCur?`2px solid ${rc.border}`:'1px solid #2a2a2a',borderRadius:3,padding:'6px 0',textAlign:'center',fontSize:isCur?13:11,fontWeight:isCur?800:600,color:cc.text}}>
                    {isCur?'▶':''}{cs}
                  </div>;
                })}
              </div>
            ))}
          </div>
        )}

        {/* Topic Scores — view or edit */}
        {tab==='topics'&&(
          <div style={{padding:8}}>
            {editing && (
              <div style={{padding:'6px 8px',marginBottom:4,background:'rgba(232,115,26,0.08)',border:'1px solid rgba(232,115,26,0.2)',fontSize:10,color:'#e8731a'}}>
                S = Severity (1-5) · L = Likelihood (1-5) · Max score auto-calculated
              </div>
            )}
            {TOPICS_LIST.map((topic,i)=>{
              const sv = editing ? sEdit[i]||1 : parseFloat(sArr[i])||0;
              const lv = editing ? lEdit[i]||1 : parseFloat(lArr[i])||0;
              const score = Math.round(sv*lv);
              return(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 8px',borderBottom:'1px solid #222'}}>
                  <div style={{flex:1,fontSize:10,color:'#999'}}>{i+1}. {topic}</div>
                  {editing ? (<>
                    <ScoreInput val={sv} onChange={v=>setSEdit(p=>{const n=[...p];n[i]=v;return n;})}/>
                    <div style={{fontSize:9,color:'#444'}}>×</div>
                    <ScoreInput val={lv} onChange={v=>setLEdit(p=>{const n=[...p];n[i]=v;return n;})}/>
                  </>) : (<>
                    <div style={{background:sColor(sv),color:'#fff',borderRadius:3,padding:'2px 6px',fontSize:10,fontWeight:700,width:28,textAlign:'center'}}>S{sv}</div>
                    <div style={{fontSize:9,color:'#444'}}>×</div>
                    <div style={{background:sColor(lv),color:'#fff',borderRadius:3,padding:'2px 6px',fontSize:10,fontWeight:700,width:28,textAlign:'center'}}>L{lv}</div>
                  </>)}
                  <div style={{fontSize:11,fontWeight:700,color:sColor(Math.max(sv,lv)),width:28,textAlign:'right'}}>{score}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* PPS Briefing */}
        {tab==='briefing'&&(
          <div style={{padding:12}}>
            {[{title:'SECTION 1 — Traffic / ATC / Taxi / RWY Ops',key:'section1'},{title:'SECTION 2 — Meteorology / Wind',key:'section2'},{title:'SECTION 3 — Security / Handling / Nav',key:'section3'}].map(sec=>ap[sec.key]?(
              <div key={sec.key} style={{marginBottom:12}}>
                <div style={{fontSize:9,color:'#1a9bc4',fontWeight:700,letterSpacing:1,marginBottom:6,textTransform:'uppercase'}}>{sec.title}</div>
                <div style={{fontSize:11,color:'#aaa',lineHeight:1.8,whiteSpace:'pre-line',padding:'8px 10px',background:'#151515',borderLeft:'2px solid rgba(26,155,196,0.2)'}}>{ap[sec.key]}</div>
              </div>
            ):null)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 7. FLT Logs & Times ─────────────────────────────────────────────────────
function FltLogsAndTimes(){
  const[plans,setPlans]=useState([]);const[selected,setSelected]=useState(null);
  const[filter,setFilter]=useState({dep:'',dest:''});const[loadingP,setLoadingP]=useState(true);
  useEffect(()=>{(async()=>{setLoadingP(true);const{data}=await supabase.from('plans').select('id,dep,dest,date,dispatch_no,reg,status,created_at').in('status',['active','archived','available']).order('created_at',{ascending:false}).limit(200);setPlans(data||[]);setLoadingP(false);})();},[]);
  const filteredPlans=plans.filter(p=>(!filter.dep||(p.dep||'').toLowerCase().includes(filter.dep.toLowerCase()))&&(!filter.dest||(p.dest||'').toLowerCase().includes(filter.dest.toLowerCase())));
  const selectedPlan=plans.find(p=>p.id===selected);
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{width:280,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:6,flexDirection:'column'}}>
          <div style={{display:'flex',gap:6}}>
            <input placeholder="DEP" value={filter.dep} onChange={e=>setFilter(p=>({...p,dep:e.target.value}))} style={{...S.input,width:'50%',fontSize:12}}/>
            <input placeholder="DEST" value={filter.dest} onChange={e=>setFilter(p=>({...p,dest:e.target.value}))} style={{...S.input,width:'50%',fontSize:12}}/>
          </div>
          <span style={{...S.label,fontSize:10}}>{filteredPlans.length} FLIGHTS</span>
        </div>
        <div style={{flex:1,overflowY:'auto'}}>
          {loadingP&&<div style={{padding:20,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
          {filteredPlans.map(p=>(
            <div key={p.id} onClick={()=>setSelected(p.id===selected?null:p.id)}
              style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:selected===p.id?`${C.accent}12`:'transparent',borderLeft:`3px solid ${selected===p.id?C.accent:'transparent'}`}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,fontWeight:700,color:C.accent,fontFamily:"'Courier New',monospace"}}>{p.dep} → {p.dest}</span>
                <span style={S.badge(p.status==='active'?'green':'')}>{p.status==='active'?'ACTIVE':'ARCH'}</span>
              </div>
              <div style={{fontSize:11,color:C.t3,marginTop:3,fontFamily:"'Courier New',monospace"}}>{p.date||'—'}  ·  {p.reg||'—'}</div>
              <div style={{fontSize:10,color:C.t3,marginTop:2,fontFamily:"'Courier New',monospace"}}>{p.dispatch_no||p.id.slice(0,8)}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!selected&&<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:C.t3,fontSize:13,letterSpacing:2}}>SELECT A FLIGHT</div>}
        {selected&&(<>
          <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <span style={{fontSize:14,fontWeight:700,color:C.accent,fontFamily:"'Courier New',monospace"}}>{selectedPlan?.dep} → {selectedPlan?.dest}</span>
              <span style={{fontSize:11,color:C.t3,marginLeft:12,fontFamily:"'Courier New',monospace"}}>{selectedPlan?.date}  ·  {selectedPlan?.reg}</span>
            </div>
          </div>
          <div style={{flex:1,overflow:'hidden'}}>
            <FlightTimeline planId={selected} live={selectedPlan?.status==='active'}/>
          </div>
        </>)}
      </div>
    </div>
  );
}

// ─── 8. Edit Reports ──────────────────────────────────────────────────────────
function EditReports(){
  const[reports,setReports]=useState([]);const[loading,setLoading]=useState(true);const[filter,setFilter]=useState('');
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const{data}=await supabase.from('admin_edits').select('id,created_at,edit_type,field_name,old_value,new_value,reason,plan_id,plans:plan_id(dep,dest,date)').order('created_at',{ascending:false}).limit(500);
      setReports(data||[]);setLoading(false);
    })();
  },[]);
  const filtered=reports.filter(r=>!filter||r.field_name?.toLowerCase().includes(filter.toLowerCase())||r.reason?.toLowerCase().includes(filter.toLowerCase())||`${r.plans?.dep}${r.plans?.dest}`.toLowerCase().includes(filter.toLowerCase()));
  return(
    <div style={{flex:1,overflowY:'auto'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}>
        <input placeholder="Search by route, field, reason..." value={filter} onChange={e=>setFilter(e.target.value)} style={{...S.input,width:300}}/>
        <span style={{...S.label,marginLeft:'auto'}}>{filtered.length} REPORTS</span>
      </div>
      {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
      {!loading&&filtered.length===0&&<div style={{padding:48,textAlign:'center',color:C.t3,fontSize:11,letterSpacing:2}}>NO REPORTS</div>}
      <table style={S.table}>
        <thead><tr>{['DATE','TYPE','FLIGHT','FIELD','OLD VALUE','NEW VALUE','REASON'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {filtered.map(r=>(
            <tr key={r.id}>
              <td style={{...S.td,fontSize:11,whiteSpace:'nowrap'}}>{new Date(r.created_at).toLocaleString('en-GB')}</td>
              <td style={S.td}><span style={S.badge(r.edit_type==='DELETE'?'red':'')}>{r.edit_type||'EDIT'}</span></td>
              <td style={{...S.td,color:C.accent,fontWeight:700}}>{r.plans?`${r.plans.dep} → ${r.plans.dest}`:r.plan_id?.slice(0,8)||'—'}</td>
              <td style={{...S.td,color:C.accent}}>{r.field_name||'—'}</td>
              <td style={{...S.td,color:C.t3,fontSize:12}}>{String(r.old_value||'—').slice(0,30)}</td>
              <td style={{...S.td,color:'#40d080',fontSize:12}}>{String(r.new_value||'—').slice(0,30)}</td>
              <td style={{...S.td,color:C.t2,maxWidth:320,fontSize:12}}>{r.reason||'—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Nav + Main ───────────────────────────────────────────────────────────────
const NAV=[
  {id:'active',  icon:'●',label:'Active FLTs'},
  {id:'archived',icon:'◎',label:'Archived FLTs'},
  {id:'aircrafts',icon:'✈',label:'Aircrafts'},
  {id:'crews',   icon:'◈',label:'Crews'},
  {id:'stats',   icon:'▦',label:'Statistics'},
  {id:'stations',icon:'◉',label:'Station INFO'},
  {id:'logs',    icon:'≡',label:'FLTs Logs & Times'},
  {id:'reports', icon:'R',label:'Edit Reports'},
];

export default function AdminPanel({onBack}){
  const[tab,setTab]=useState('active');
  const[ready,setReady]=useState(false);
  const[user,setUser]=useState(null);
  const[toast,setToast]=useState({msg:'',type:'success'});
  const showToast=useCallback((msg,type='success')=>setToast({msg,type}),[]);
  useEffect(()=>{
    (async()=>{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){onBack();return;}
      setUser(session.user);setReady(true);
    })();
  },[onBack]);
  if(!ready)return(<div style={{display:'flex',width:'100vw',minHeight:'100vh',background:C.bg,alignItems:'center',justifyContent:'center'}}><div style={{color:C.accent,letterSpacing:3,fontSize:11,fontFamily:"'Courier New',monospace"}}>CHECKING AUTHORIZATION...</div></div>);
  const tabTitle=NAV.find(n=>n.id===tab)?.label||'';
  return(
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh',background:C.bg,fontFamily:"'Courier New',monospace"}}>
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.border}`,padding:'0 20px',height:44,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:3}}>GO2</span>
          <span style={{width:1,height:18,background:C.border}}/>
          <span style={{fontSize:10,color:C.t3,letterSpacing:2}}>ADMIN PANEL</span>
          <span style={{...S.badge(''),fontSize:9}}>ADMIN MODE</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <span style={{fontSize:10,color:C.t3}}>{user?.email}</span>
          <button style={S.btnSecondary} onClick={onBack}>DASHBOARD</button>
        </div>
      </div>
      <div style={{display:'flex',flex:1,overflow:'hidden'}}>
        <div style={S.sidebar}>
          <div style={{flex:1,overflowY:'auto'}}>
            {NAV.map(n=>(
              <div key={n.id} style={S.navItem(tab===n.id)} onClick={()=>setTab(n.id)}>
                <span style={{...S.navIcon,color:tab===n.id?C.accent:C.t3}}>{n.icon}</span>
                <span style={S.navLabel(tab===n.id)}>{n.label}</span>
              </div>
            ))}
          </div>
          <div style={{padding:'14px 16px',borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:10,color:C.t1,fontWeight:700,letterSpacing:1,marginBottom:4}}>{user?.email?.split('@')[0]?.toUpperCase()}</div>
            <button onClick={async()=>{await supabase.auth.signOut();onBack();}} style={{...S.btnDanger,width:'100%',marginTop:6,textAlign:'center'}}>LOGOUT</button>
          </div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3,flexShrink:0}}>
            <span style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:3}}>{tabTitle.toUpperCase()}</span>
          </div>
          <div style={{flex:1,display:'flex',overflow:'hidden'}}>
            {tab==='active'    && <ActiveFlts   toast={showToast}/>}
            {tab==='archived'  && <ArchivedFlts toast={showToast} user={user}/>}
            {tab==='aircrafts' && <Aircrafts    toast={showToast}/>}
            {tab==='crews'     && <Crews        toast={showToast}/>}
            {tab==='stats'     && <Statistics/>}
            {tab==='stations'  && <StationInfo  toast={showToast}/>}
            {tab==='logs'      && <FltLogsAndTimes/>}
            {tab==='reports'   && <EditReports/>}
          </div>
        </div>
      </div>
      {toast.msg&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast({msg:'',type:'success'})}/>}
    </div>
  );
}