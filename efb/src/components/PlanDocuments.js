// PlanDocuments.js — GO2 eFB
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const BUCKET = 'efb-docs';
const SECTION_META = {
  fuel:     { label:'Fuel Receipt',      icon:'⛽' },
  handling: { label:'Handling Receipt',  icon:'🤝' },
  crs:      { label:'CRS / Maintenance', icon:'🔧' },
  catering: { label:'Catering Receipt',  icon:'🍽' },
  security: { label:'Security Form',     icon:'🛡' },
  misc:     { label:'Misc.',             icon:'📂' },
};
function fmtSize(b){ if(!b)return'—'; if(b>1048576)return`${(b/1048576).toFixed(1)} MB`; return`${Math.round(b/1024)} KB`; }
function fmtTime(iso){ if(!iso)return'—'; const d=new Date(iso); return`${d.toLocaleDateString('en-GB')} ${d.toISOString().slice(11,16)} Z`; }

export default function PlanDocuments({ planId, archivedFlightId, readOnly=true }){
  const [docs,setDocs]=useState([]);
  const [profiles,setProfiles]=useState([]);
  const [loading,setLoading]=useState(true);
  const [opening,setOpening]=useState(null);

  const load=useCallback(async()=>{
    if(!planId&&!archivedFlightId){setLoading(false);return;}
    setLoading(true);
    let q=supabase.from('efb_documents').select('*').order('section').order('uploaded_at',{ascending:false});
    if(archivedFlightId) q=q.eq('archived_flight_id',archivedFlightId);
    else if(planId) q=q.eq('plan_id',planId);
    const{data}=await q;
    setDocs(data||[]);setLoading(false);
  },[planId,archivedFlightId]);

  useEffect(()=>{ supabase.from('profiles').select('id,full_name,code').then(({data})=>setProfiles(data||[])); },[]);
  useEffect(()=>{load();},[load]);

  const pilotName=id=>{ const p=profiles.find(x=>x.id===id); return p?`${p.code} — ${p.full_name}`:null; };

  const handleView=async(doc)=>{
    setOpening(doc.id);
    try{ const{data:s}=await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path,600); if(s?.signedUrl)window.open(s.signedUrl,'_blank'); }catch{}
    setOpening(null);
  };

  const grouped={};
  docs.forEach(d=>{ if(!grouped[d.section])grouped[d.section]=[]; grouped[d.section].push(d); });
  const totalCurrent=docs.filter(d=>d.status==='CURRENT').length;

  if(loading)return<div style={{padding:16,fontSize:11,color:'#546e7a',fontFamily:"'Courier New',monospace",textAlign:'center'}}>LOADING DOCUMENTS...</div>;
  if(!docs.length)return<div style={{padding:16,fontSize:11,color:'#37474f',fontFamily:"'Courier New',monospace",textAlign:'center'}}>NO DOCUMENTS ON FILE FOR THIS FLIGHT</div>;

  return(
    <div style={{fontFamily:"'Courier New',monospace"}}>
      <div style={{padding:'8px 16px',background:'#111620',borderBottom:'1px solid #1e2530',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:10,color:'#546e7a',letterSpacing:1}}>FLIGHT DOCUMENTS</span>
        <span style={{fontSize:10,color:'#4ade80',fontWeight:700}}>{totalCurrent} CURRENT · {docs.length} TOTAL</span>
      </div>
      {Object.entries(grouped).map(([section,sectionDocs])=>{
        const meta=SECTION_META[section]||{label:section,icon:'📄'};
        const current=sectionDocs.filter(d=>d.status==='CURRENT');
        return(
          <div key={section}>
            <div style={{padding:'7px 16px',background:'#0d1117',borderBottom:'1px solid #1e2530',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:13}}>{meta.icon}</span>
              <span style={{fontSize:10,color:'#607d8b',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{meta.label}</span>
              <span style={{marginLeft:'auto',fontSize:10,color:current.length>0?'#4ade80':'#455a64',fontWeight:700}}>{current.length>0?`${current.length} CURRENT`:'NONE'}</span>
            </div>
            {sectionDocs.map(doc=>{
              const isCurrent=doc.status==='CURRENT';
              const name=pilotName(doc.uploaded_by);
              return(
                <div key={doc.id} style={{padding:'10px 16px',borderBottom:'1px solid #1e2530',background:isCurrent?'#0d1117':'#0a0c10',opacity:isCurrent?1:0.55,display:'flex',alignItems:'flex-start',gap:10}}>
                  <span style={{fontSize:20,flexShrink:0}}>📄</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:12,fontWeight:700,color:isCurrent?'#eceff1':'#607d8b',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.file_name}</span>
                      <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,flexShrink:0,background:isCurrent?'rgba(74,222,128,0.12)':'rgba(100,100,100,0.1)',color:isCurrent?'#4ade80':'#546e7a',border:`1px solid ${isCurrent?'#1a4030':'#2a3040'}`}}>{doc.status}</span>
                    </div>
                    <div style={{fontSize:10,color:'#455a64',lineHeight:1.7}}>
                      <span>{fmtSize(doc.file_size)}</span><span style={{margin:'0 5px'}}>·</span><span>{fmtTime(doc.uploaded_at)}</span>
                      {name&&<><span style={{margin:'0 5px'}}>·</span><span style={{color:'#546e7a'}}>{name}</span></>}
                    </div>
                    {doc.notes&&<div style={{fontSize:10,color:'#607d8b',marginTop:3,fontStyle:'italic'}}>{doc.notes}</div>}
                  </div>
                  <button onClick={()=>handleView(doc)} disabled={opening===doc.id} style={{background:'none',border:'1px solid #1e2530',borderRadius:4,padding:'4px 10px',fontSize:11,color:opening===doc.id?'#546e7a':'#38bdf8',cursor:opening===doc.id?'default':'pointer',fontFamily:"'Courier New',monospace",flexShrink:0}}>
                    {opening===doc.id?'...':'VIEW'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{padding:'8px 16px',fontSize:9,color:'#263238',textAlign:'center',letterSpacing:1}}>AMC 20-25 §2.2 — DOCUMENTS ARCHIVED WITH FLIGHT RECORD</div>
    </div>
  );
}
