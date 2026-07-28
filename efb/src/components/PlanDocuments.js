// PlanDocuments.js — GO2 eFB
import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const BUCKET = 'efb-documents';
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
  // Uygulama ici onizleyici: VIEW once ACAR; indirme/print karari kullanicinin.
  const [viewer,setViewer]=useState(null); // {url, name}

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

  // VIEW: belgeyi uygulama ici onizleyicide ACAR (indirme degil).
  // Blob URL kullanilir -> Safari popup engeliyle hic temas yok.
  const handleView=async(doc)=>{
    setOpening(doc.id);
    try{
      const{data:s,error}=await supabase.storage.from(BUCKET).createSignedUrl(doc.file_path,600);
      if(error||!s?.signedUrl) throw new Error(error?.message||'signed URL alinamadi');
      const resp=await fetch(s.signedUrl);
      if(!resp.ok) throw new Error('indirme hatasi: HTTP '+resp.status);
      const blob=await resp.blob();
      setViewer({ url:URL.createObjectURL(blob), name:doc.file_name||doc.file_path.split('/').pop()||'document.pdf' });
    }catch(err){
      console.error('[DOC VIEW]',err,doc.file_path);
      alert('Document could not be opened: '+(err?.message||err));
    }
    setOpening(null);
  };

  const closeViewer=()=>{ if(viewer?.url)URL.revokeObjectURL(viewer.url); setViewer(null); };
  const downloadViewer=()=>{
    if(!viewer)return;
    const a=document.createElement('a');
    a.href=viewer.url; a.download=viewer.name;
    document.body.appendChild(a); a.click(); a.remove();
  };

  const grouped={};
  docs.forEach(d=>{ if(!grouped[d.section])grouped[d.section]=[]; grouped[d.section].push(d); });
  const totalCurrent=docs.filter(d=>d.status==='CURRENT').length;

  if(loading)return<div style={{padding:16,fontSize:11,color:'var(--t3)',fontFamily:'var(--mono)',textAlign:'center'}}>LOADING DOCUMENTS...</div>;
  if(!docs.length)return<div style={{padding:16,fontSize:11,color:'var(--border)',fontFamily:'var(--mono)',textAlign:'center'}}>NO DOCUMENTS ON FILE FOR THIS FLIGHT</div>;

  return(
    <div style={{fontFamily:'var(--mono)'}}>
      {viewer&&(
        <div style={{position:'fixed',inset:0,background:'var(--backdrop)',zIndex:300,display:'flex',flexDirection:'column'}}>
          <div style={{background:'var(--bg2)',borderBottom:'1px solid var(--border)',padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <span style={{fontSize:12,fontWeight:700,color:'var(--t1)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{viewer.name}</span>
            <button onClick={()=>{const f=document.getElementById('doc-viewer-frame');try{f?.contentWindow?.print();}catch{window.print();}}}
              style={{background:'var(--accent)',border:'none',borderRadius:6,padding:'7px 14px',fontSize:11,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'var(--mono)',letterSpacing:1}}>🖨 PRINT</button>
            <button onClick={downloadViewer}
              style={{background:'none',border:'1px solid var(--accent)',borderRadius:6,padding:'7px 14px',fontSize:11,fontWeight:700,color:'var(--accent)',cursor:'pointer',fontFamily:'var(--mono)',letterSpacing:1}}>⬇ DOWNLOAD</button>
            <button onClick={closeViewer}
              style={{background:'none',border:'1px solid var(--border2)',borderRadius:6,padding:'7px 14px',fontSize:11,fontWeight:700,color:'var(--t2)',cursor:'pointer',fontFamily:'var(--mono)',letterSpacing:1}}>✕ CLOSE</button>
          </div>
          <iframe id="doc-viewer-frame" title={viewer.name} src={viewer.url} style={{flex:1,border:'none',background:'#525659'}}/>
        </div>
      )}
      <div style={{padding:'8px 16px',background:'var(--bg3)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:10,color:'var(--t3)',letterSpacing:1}}>FLIGHT DOCUMENTS</span>
        <span style={{fontSize:10,color:'var(--green)',fontWeight:700}}>{totalCurrent} CURRENT · {docs.length} TOTAL</span>
      </div>
      {Object.entries(grouped).map(([section,sectionDocs])=>{
        const meta=SECTION_META[section]||{label:section,icon:'📄'};
        const current=sectionDocs.filter(d=>d.status==='CURRENT');
        return(
          <div key={section}>
            <div style={{padding:'7px 16px',background:'var(--bg2)',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:13}}>{meta.icon}</span>
              <span style={{fontSize:10,color:'var(--t2)',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{meta.label}</span>
              <span style={{marginLeft:'auto',fontSize:10,color:current.length>0?'var(--green)':'var(--border2)',fontWeight:700}}>{current.length>0?`${current.length} CURRENT`:'NONE'}</span>
            </div>
            {sectionDocs.map(doc=>{
              const isCurrent=doc.status==='CURRENT';
              const name=pilotName(doc.uploaded_by);
              return(
                <div key={doc.id} style={{padding:'10px 16px',borderBottom:'1px solid var(--border)',background:isCurrent?'var(--bg2)':'var(--bg)',opacity:isCurrent?1:0.55,display:'flex',alignItems:'flex-start',gap:10}}>
                  <span style={{fontSize:20,flexShrink:0}}>📄</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                      <span style={{fontSize:12,fontWeight:700,color:isCurrent?'var(--t1)':'var(--t2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.file_name}</span>
                      <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:3,flexShrink:0,background:isCurrent?'rgba(74,222,128,0.12)':'rgba(100,100,100,0.1)',color:isCurrent?'var(--green)':'var(--t3)',border:`1px solid ${isCurrent?'var(--green-soft)':'var(--border2)'}`}}>{doc.status}</span>
                    </div>
                    <div style={{fontSize:10,color:'var(--border2)',lineHeight:1.7}}>
                      <span>{fmtSize(doc.file_size)}</span><span style={{margin:'0 5px'}}>·</span><span>{fmtTime(doc.uploaded_at)}</span>
                      {name&&<><span style={{margin:'0 5px'}}>·</span><span style={{color:'var(--t3)'}}>{name}</span></>}
                    </div>
                    {doc.notes&&<div style={{fontSize:10,color:'var(--t2)',marginTop:3,fontStyle:'italic'}}>{doc.notes}</div>}
                  </div>
                  <button onClick={()=>handleView(doc)} disabled={opening===doc.id} style={{background:'none',border:'1px solid var(--border)',borderRadius:4,padding:'4px 10px',fontSize:11,color:opening===doc.id?'var(--t3)':'var(--accent)',cursor:opening===doc.id?'default':'pointer',fontFamily:'var(--mono)',flexShrink:0}}>
                    {opening===doc.id?'...':'VIEW'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
      <div style={{padding:'8px 16px',fontSize:9,color:'var(--bg3)',textAlign:'center',letterSpacing:1}}>AMC 20-25 §2.2 — DOCUMENTS ARCHIVED WITH FLIGHT RECORD</div>
    </div>
  );
}
