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

// ─── Flight Timeline ──────────────────────────────────────────────────────────
function FlightTimeline({ planId, live=false }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!planId) return;
    const { data } = await supabase
      .from('flight_logs')
      .select('*,profiles(full_name,code)')
      .eq('plan_id', planId)
      .order('created_at', { ascending: true });
    setLogs(data || []);
    setLoading(false);
  }, [planId]);

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
function CollapsibleEditBox({ title, icon, color, logs, fields, flight, onSave, toast, user }) {
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
                    <input style={{...S.input,fontSize:13,padding:'6px 8px'}}
                      value={form[f.key]||''}
                      placeholder={f.type==='time'?'HH:MM':'—'}
                      onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}/>
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
              <DetailRow label="PF Pilot"     value={sel.pf_pilot}/>
              <DetailRow label="PM Pilot"     value={sel.pm_pilot}/>
            </div>
          )}

          {detailTab==='timeline'&&(
            <FlightTimeline planId={sel.id} live={true}/>
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
    supabase.from('flight_logs').select('*,profiles(full_name,code)')
      .eq('plan_id', sel.plan_id)
      .order('created_at',{ascending:true})
      .then(({data})=>setPlanLogs(data||[]));
  },[selected,flights]);

  const filtered=flights.filter(f=>{const p=f.plans||{};return!filter.route||`${p.dep}${p.dest}`.toLowerCase().includes(filter.route.toLowerCase());});
  const sel=flights.find(f=>f.id===selected);
  const fmtMins=m=>m?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`:'—';

  // Group logs by category
  const logsByCategory = {
    crew:      planLogs.filter(l=>['CREW_ASSIGNED'].includes(l.action)),
    mandatory: planLogs.filter(l=>['MANDATORY_CHECK_DONE','MANDATORY_CHECK_UNDONE','MANDATORY_SIGNED','PREFLIGHT_MANDATORY_COMPLETE'].includes(l.action)),
    fuel:      planLogs.filter(l=>['FUEL_CHECKED'].includes(l.action)),
    accepted:  planLogs.filter(l=>['PLAN_ACCEPTED','PLAN_ACCEPTANCE_REVOKED'].includes(l.action)),
    tkof:      planLogs.filter(l=>['TKOF_RWY_SELECTED','TKOF_ATIS_ENTERED','TKOF_SPEEDS_ENTERED','TKOF_ATC_CLR','TKOF_RVSM_GROUND'].includes(l.action)),
    navlog:    planLogs.filter(l=>['OFF_BLOCKS','TAKEOFF','RVSM_CHECK','GPS_ACTIVATED','LANDING','ON_BLOCKS','FUEL_REMAINING'].includes(l.action)),
    lnd:       planLogs.filter(l=>['LND_RWY_SELECTED','LND_ATIS_ENTERED','LND_PERF_DATA'].includes(l.action)),
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
          <thead><tr>{['ARCHIVED','ROUTE','REG','BLOCK','FLIGHT','LANDINGS','PF'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(f=>{
              const p=f.plans||{};
              return(
                <tr key={f.id} onClick={()=>setSelected(f.id===selected?null:f.id)} style={{cursor:'pointer',background:selected===f.id?`${C.accent}08`:'transparent'}}>
                  <td style={S.td}>{f.archived_at?new Date(f.archived_at).toLocaleString('en-GB'):'—'}</td>
                  <td style={{...S.td,color:C.accent,fontWeight:700}}>{p.dep||'—'} → {p.dest||'—'}</td>
                  <td style={S.td}>{p.reg||'—'}</td>
                  <td style={S.td}>{fmtMins(f.block_minutes)}</td>
                  <td style={S.td}>{fmtMins(f.airborne_minutes)}</td>
                  <td style={S.td}>{f.landing_count||'—'}</td>
                  <td style={S.td}>{f.pf_id?f.pf_id.slice(0,8)+'...':'—'}</td>
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
              fields={[]}
              flight={sel} onSave={load} toast={toast} user={user}
            />
            <CollapsibleEditBox
              title="Mandatory" icon="OK" color="#2d9e5f"
              logs={logsByCategory.mandatory}
              fields={[]}
              flight={sel} onSave={load} toast={toast} user={user}
            />
            <CollapsibleEditBox
              title="Fuel" icon="F" color="#2d9e5f"
              logs={logsByCategory.fuel}
              fields={[
                {key:'takeoff_fuel',   label:'T/O Fuel (lb)',  type:'text'},
                {key:'remaining_fuel', label:'Rem Fuel (lb)',  type:'text'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user}
            />
            <CollapsibleEditBox
              title="Accept & Sign" icon="SIG" color="#e8a020"
              logs={logsByCategory.accepted}
              fields={[]}
              flight={sel} onSave={load} toast={toast} user={user}
            />
            <CollapsibleEditBox
              title="T/O Data" icon="T/O" color="#e8a020"
              logs={logsByCategory.tkof}
              fields={[
                {key:'dep_rwy',   label:'DEP RWY',  type:'text'},
                {key:'dep_atis',  label:'DEP ATIS', type:'text'},
                {key:'sid',       label:'SID',      type:'text'},
              ]}
              flight={sel} onSave={load} toast={toast} user={user}
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
              flight={sel} onSave={load} toast={toast} user={user}
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
              flight={sel} onSave={load} toast={toast} user={user}
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

// ─── 3. Aircrafts ─────────────────────────────────────────────────────────────
function Aircrafts({toast}){
  const[list,setList]=useState([]);const[loading,setLoading]=useState(true);
  const[showAdd,setShowAdd]=useState(false);const[selected,setSelected]=useState(null);
  const[form,setForm]=useState({registration:'',manufacturer:'',model:'',ac_type:'',landing_cat:'CAT1'});
  const fetch=useCallback(async()=>{setLoading(true);const{data}=await supabase.from('aircraft').select('*').order('registration');setList(data||[]);setLoading(false);},[]);
  useEffect(()=>{fetch();},[fetch]);
  const handleAdd=async()=>{
    if(!form.registration||!form.ac_type){toast('Registration and type required.','error');return;}
    const{error}=await supabase.from('aircraft').insert(form);
    if(error){toast(error.message,'error');return;}
    toast('Aircraft added.','success');setShowAdd(false);setForm({registration:'',manufacturer:'',model:'',ac_type:'',landing_cat:'CAT1'});fetch();
  };
  const sel=list.find(a=>a.id===selected);
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={S.label}>{list.length} AIRCRAFT REGISTERED</span>
          <button style={S.btnPrimary} onClick={()=>setShowAdd(true)}>+ ADD AIRCRAFT</button>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['REGISTRATION','MANUFACTURER','MODEL','TYPE','CAT','HOURS','CYCLES','STATUS'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map(a=>(
              <tr key={a.id} onClick={()=>setSelected(a.id===selected?null:a.id)} style={{cursor:'pointer',background:selected===a.id?`${C.accent}08`:'transparent'}}>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{a.registration}</td>
                <td style={S.td}>{a.manufacturer||'—'}</td><td style={S.td}>{a.model||'—'}</td>
                <td style={S.td}>{a.ac_type||'—'}</td>
                <td style={S.td}><span style={S.badge('blue')}>{a.landing_cat}</span></td>
                <td style={S.td}>{a.total_hours||0}</td><td style={S.td}>{a.total_cycles||0}</td>
                <td style={S.td}><span style={S.badge(a.active?'green':'red')}>{a.active?'ACTIVE':'INACTIVE'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel&&(<DetailPanel title="Aircraft Detail" onClose={()=>setSelected(null)}>
        <DetailRow label="Registration" value={sel.registration} accent/><DetailRow label="Manufacturer" value={sel.manufacturer}/>
        <DetailRow label="Model" value={sel.model}/><DetailRow label="Type" value={sel.ac_type}/>
        <DetailRow label="Landing Cat" value={sel.landing_cat}/><DetailRow label="Total Hours" value={sel.total_hours}/>
        <DetailRow label="Total Cycles" value={sel.total_cycles}/><DetailRow label="Status" value={sel.active?'Active':'Inactive'}/>
      </DetailPanel>)}
      {showAdd&&(
        <Modal title="ADD AIRCRAFT" onClose={()=>setShowAdd(false)}>
          {[{key:'registration',label:'REGISTRATION *',ph:'TC-REC'},{key:'manufacturer',label:'MANUFACTURER',ph:'Gulfstream'},{key:'model',label:'MODEL',ph:'G450'},{key:'ac_type',label:'ICAO TYPE *',ph:'GLF4'}].map(({key,label,ph})=>(
            <div key={key} style={S.formGroup}><label style={S.formLabel}>{label}</label><input style={S.input} placeholder={ph} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/></div>
          ))}
          <div style={S.formGroup}><label style={S.formLabel}>LANDING CATEGORY</label>
            <select style={S.select} value={form.landing_cat} onChange={e=>setForm(p=>({...p,landing_cat:e.target.value}))}>
              <option value="CAT1">CAT I</option><option value="CAT2">CAT II</option><option value="CAT3">CAT III</option>
            </select>
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={S.btnSecondary} onClick={()=>setShowAdd(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAdd}>SAVE</button>
          </div>
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
  const[qualForm,setQualForm]=useState({ac_type:'',seat:'CPT',hand:'BOTH',landing_cat:'CAT1',valid_from:'',valid_until:''});
  const[efbForm,setEfbForm]=useState({efb_training_date:'',efb_training_valid_until:'',efb_training_type:'Initial',efb_trained_by:''});
  const fetch=useCallback(async()=>{
    setLoading(true);
    const[{data:p},{data:q}]=await Promise.all([supabase.from('profiles').select('*').order('full_name'),supabase.from('crew_qualifications').select('*')]);
    setPilots(p||[]);setQuals(q||[]);setLoading(false);
  },[]);
  useEffect(()=>{fetch();},[fetch]);
  const sel=pilots.find(p=>p.id===selected);
  const selQuals=quals.filter(q=>q.pilot_id===selected);
  const efbRecord=selQuals.find(q=>q.efb_training_date);
  const handleAddQual=async()=>{
    if(!qualForm.ac_type){toast('Aircraft type required.','error');return;}
    const{error}=await supabase.from('crew_qualifications').upsert({pilot_id:selected,...qualForm});
    if(error){toast(error.message,'error');return;}
    toast('Qualification saved.','success');setShowQual(false);fetch();
  };
  const handleSaveEfb=async()=>{
    if(!efbForm.efb_training_date){toast('Training date required.','error');return;}
    const existing=selQuals[0];
    if(existing){await supabase.from('crew_qualifications').update(efbForm).eq('id',existing.id);}
    else{await supabase.from('crew_qualifications').insert({pilot_id:selected,ac_type:'EFB',seat:'BOTH',hand:'BOTH',landing_cat:'CAT1',...efbForm});}
    toast('EFB training record saved.','success');setShowEfb(false);fetch();
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
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}><span style={S.label}>{pilots.length} CREW MEMBERS</span></div>
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
        <DetailPanel title={`${sel.code} — ${sel.full_name}`} onClose={()=>setSelected(null)}>
          <DetailRow label="Code" value={sel.code} accent/><DetailRow label="Full Name" value={sel.full_name}/>
          <DetailRow label="Email" value={sel.email}/><DetailRow label="Role" value={sel.role}/>
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
  const[stats,setStats]=useState(null);const[flights,setFlights]=useState([]);
  const[filter,setFilter]=useState({dep:'',dest:''});const[loading,setLoading]=useState(true);
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      const{data}=await supabase.from('archived_flights').select('*,plans(dep,dest,reg,ac_type)').order('archived_at',{ascending:false});
      const arr=data||[];setFlights(arr);
      setStats({totalFlightMins:arr.reduce((s,f)=>s+(f.airborne_minutes||0),0),totalBlockMins:arr.reduce((s,f)=>s+(f.block_minutes||0),0),totalLandings:arr.reduce((s,f)=>s+(f.landing_count||0),0),nightLandings:arr.filter(f=>f.is_night_landing).length,total:arr.length});
      setLoading(false);
    })();
  },[]);
  const fmt=m=>m?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`:'0:00';
  const filtered=flights.filter(f=>(!filter.dep||(f.departure_icao||f.plans?.dep||'').toLowerCase().includes(filter.dep.toLowerCase()))&&(!filter.dest||(f.destination_icao||f.plans?.dest||'').toLowerCase().includes(filter.dest.toLowerCase())));
  return(
    <div style={{flex:1,overflowY:'auto'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:C.border,borderBottom:`1px solid ${C.border}`}}>
        {loading?<div style={{padding:24,color:C.t3,fontSize:11,gridColumn:'1/-1',textAlign:'center'}}>LOADING...</div>:stats&&[
          {label:'Total Flights',value:stats.total},{label:'Flight Hours',value:fmt(stats.totalFlightMins)},
          {label:'Block Hours',value:fmt(stats.totalBlockMins)},{label:'Total Landings',value:stats.totalLandings},{label:'Night Landings',value:stats.nightLandings},
        ].map(({label,value})=>(
          <div key={label} style={{background:C.bg2,padding:'16px 20px'}}>
            <div style={S.label}>{label}</div>
            <div style={{fontSize:22,fontWeight:700,color:C.accent,fontFamily:"'Courier New',monospace",marginTop:6}}>{value}</div>
          </div>
        ))}
      </div>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}>
        <span style={S.label}>FILTER:</span>
        <input placeholder="DEP" value={filter.dep} onChange={e=>setFilter(p=>({...p,dep:e.target.value}))} style={{...S.input,width:100}}/>
        <span style={{color:C.t3}}>-></span>
        <input placeholder="DEST" value={filter.dest} onChange={e=>setFilter(p=>({...p,dest:e.target.value}))} style={{...S.input,width:100}}/>
        <span style={{...S.label,marginLeft:'auto'}}>{filtered.length} FLIGHTS</span>
      </div>
      <table style={S.table}>
        <thead><tr>{['DATE','DEP','DEST','REG','BLOCK','FLIGHT','LANDINGS','NIGHT'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {filtered.map(f=>(
            <tr key={f.id}>
              <td style={S.td}>{f.archived_at?new Date(f.archived_at).toLocaleDateString('en-GB'):'—'}</td>
              <td style={{...S.td,color:C.accent}}>{f.departure_icao||f.plans?.dep||'—'}</td>
              <td style={{...S.td,color:C.accent}}>{f.destination_icao||f.plans?.dest||'—'}</td>
              <td style={S.td}>{f.plans?.reg||'—'}</td>
              <td style={S.td}>{fmt(f.block_minutes)}</td><td style={S.td}>{fmt(f.airborne_minutes)}</td>
              <td style={S.td}>{f.landing_count||'—'}</td>
              <td style={S.td}>{f.is_night_landing?<span style={S.badge('blue')}>NIGHT</span>:'—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 6. Station INFO ──────────────────────────────────────────────────────────
function StationInfo({toast}){
  const[stations,setStations]=useState([]);const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);const[showAdd,setShowAdd]=useState(false);
  const[form,setForm]=useState({icao:'',name:'',country:'',handling_company:'',handling_contact:'',handling_vhf:'',catering_company:'',catering_contact:'',permit_required:false,permit_details:'',entry_requirements:'',risk_assessment:''});
  const fetch=useCallback(async()=>{setLoading(true);const{data}=await supabase.from('stations').select('*').order('icao');setStations(data||[]);setLoading(false);},[]);
  useEffect(()=>{fetch();},[fetch]);
  const handleSave=async()=>{
    if(!form.icao){toast('ICAO required.','error');return;}
    const{error}=await supabase.from('stations').upsert({...form,updated_at:new Date().toISOString()});
    if(error){toast(error.message,'error');return;}
    toast('Station saved.','success');setShowAdd(false);fetch();
  };
  const sel=stations.find(s=>s.id===selected);
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between'}}>
          <span style={S.label}>{stations.length} STATIONS</span>
          <button style={S.btnPrimary} onClick={()=>setShowAdd(true)}>+ ADD STATION</button>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['ICAO','NAME','COUNTRY','HANDLING','CATERING','PERMIT','RISK'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {stations.map(s=>(
              <tr key={s.id} onClick={()=>setSelected(s.id===selected?null:s.id)} style={{cursor:'pointer',background:selected===s.id?`${C.accent}08`:'transparent'}}>
                <td style={{...S.td,color:C.accent,fontWeight:700}}>{s.icao}</td>
                <td style={S.td}>{s.name||'—'}</td><td style={S.td}>{s.country||'—'}</td>
                <td style={S.td}>{s.handling_company||'—'}</td><td style={S.td}>{s.catering_company||'—'}</td>
                <td style={S.td}>{s.permit_required?<span style={S.badge('')}>REQ</span>:'—'}</td>
                <td style={S.td}>{s.risk_assessment?<span style={S.badge('blue')}>ON FILE</span>:'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel&&(<DetailPanel title={`${sel.icao}`} onClose={()=>setSelected(null)}>
        <DetailRow label="ICAO" value={sel.icao} accent/><DetailRow label="Country" value={sel.country}/>
        <DetailRow label="Handling" value={sel.handling_company}/><DetailRow label="Handling Tel" value={sel.handling_contact}/>
        <DetailRow label="Handling VHF" value={sel.handling_vhf}/><DetailRow label="Catering" value={sel.catering_company}/>
        <DetailRow label="Catering Tel" value={sel.catering_contact}/><DetailRow label="Permit Req" value={sel.permit_required?'YES':'NO'}/>
      </DetailPanel>)}
      {showAdd&&(
        <Modal title="ADD / EDIT STATION" onClose={()=>setShowAdd(false)} width={500}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[{key:'icao',label:'ICAO *',ph:'LTFM'},{key:'name',label:'AIRPORT NAME',ph:'Istanbul'},{key:'country',label:'COUNTRY',ph:'Turkey'},{key:'handling_company',label:'HANDLING CO.',ph:'Celebi'},{key:'handling_contact',label:'HANDLING TEL',ph:'+90...'},{key:'handling_vhf',label:'HANDLING VHF',ph:'130.675'},{key:'catering_company',label:'CATERING CO.',ph:'Do & Co'},{key:'catering_contact',label:'CATERING TEL',ph:'+90...'}].map(({key,label,ph})=>(
              <div key={key} style={S.formGroup}><label style={S.formLabel}>{label}</label><input style={S.input} placeholder={ph} value={form[key]||''} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/></div>
            ))}
          </div>
          {[{key:'entry_requirements',label:'ENTRY REQUIREMENTS'},{key:'permit_details',label:'PERMIT DETAILS'},{key:'risk_assessment',label:'RISK ASSESSMENT'}].map(({key,label})=>(
            <div key={key} style={S.formGroup}><label style={S.formLabel}>{label}</label><textarea style={{...S.input,minHeight:60,resize:'vertical'}} value={form[key]||''} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/></div>
          ))}
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}>
            <button style={S.btnSecondary} onClick={()=>setShowAdd(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleSave}>SAVE</button>
          </div>
        </Modal>
      )}
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