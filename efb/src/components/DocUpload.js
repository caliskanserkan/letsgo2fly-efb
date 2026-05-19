import React, { useEffect, useRef } from 'react';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';

const SECTIONS = [
  { id:'fuel',     label:'Fuel Receipt',            icon:'⛽', required:true  },
  { id:'handling', label:'Handling',                icon:'🤝', required:false },
  { id:'crs',      label:'CRS / Maint.',            icon:'🔧', required:false },
  { id:'catering', label:'Catering',                icon:'🍽', required:false },
  { id:'security', label:'Security',                icon:'🛡', required:true  },
  { id:'misc',     label:'Misc.',                   icon:'📂', required:false },
];

const DEFAULT_DOCS = { fuel:[], handling:[], crs:[], catering:[], security:[], misc:[] };

function DocItem({ doc, onDelete }) {
  return (
    <div style={{ background:'#0f172a', border:'1px solid #334155', borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
      <div style={{ width:40, height:40, borderRadius:10, background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
        {doc.type === 'pdf' ? '📄' : '🖼️'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:500, color:'#f1f5f9', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
        <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>{doc.size} · {doc.time}</div>
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <button style={{ background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:8, padding:'5px 10px', fontSize:11, color:'#38bdf8', cursor:'pointer', fontFamily:'inherit' }}>View</button>
        <button onClick={onDelete} style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'5px 10px', fontSize:11, color:'#ef4444', cursor:'pointer', fontFamily:'inherit' }}>✕</button>
      </div>
    </div>
  );
}

function UploadArea({ onUpload, compact }) {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const now = new Date();
    const time = `${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')} Z`;
    const sizeKb = (file.size/1024).toFixed(0);
    const size = sizeKb > 1024 ? `${(sizeKb/1024).toFixed(1)} MB` : `${sizeKb} KB`;
    const type = file.type.includes('pdf') ? 'pdf' : 'img';
    onUpload({ name:file.name, size, time, by:'AAK', type });
    e.target.value = '';
  };

  if (compact) {
    return (
      <div style={{ marginBottom:12 }}>
        <div onClick={() => inputRef.current.click()}
          style={{ border:'1.5px dashed #334155', borderRadius:12, padding:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
          <span style={{ fontSize:18 }}>➕</span>
          <span style={{ fontSize:13, color:'#475569' }}>Add another document</span>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display:'none' }} />
      </div>
    );
  }

  return (
    <div style={{ marginBottom:16 }}>
      <div onClick={() => inputRef.current.click()}
        style={{ border:'1.5px dashed #334155', borderRadius:14, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:14, cursor:'pointer', background:'rgba(56,189,248,0.02)' }}>
        <div style={{ fontSize:44 }}>📎</div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:14, color:'#94a3b8', marginBottom:4 }}>Tap to upload document</div>
          <div style={{ fontSize:12, color:'#334155' }}>Photo or PDF</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <div style={{ background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:600, color:'#38bdf8' }}>📷 Camera</div>
          <div style={{ background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:10, padding:'9px 18px', fontSize:13, fontWeight:600, color:'#38bdf8' }}>📁 Files</div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display:'none' }} />
    </div>
  );
}

function DocUpload({ setStatus }) {
  const [active, setActive] = usePersistedState('efb_docupload_active', 'fuel');
  const [docs,   setDocs]   = usePersistedState('efb_docupload_docs',   DEFAULT_DOCS);

  const addDoc = (section, doc) => setDocs(prev => ({ ...prev, [section]: [...(prev[section]||[]), doc] }));
  const delDoc = (section, idx)  => setDocs(prev => ({ ...prev, [section]: prev[section].filter((_,i) => i !== idx) }));

  const requiredDone = (docs.fuel?.length > 0) && (docs.security?.length > 0);
  const anyUploaded  = Object.values(docs).some(d => d.length > 0);

  useEffect(() => {
    if (!setStatus) return;
    if (requiredDone)     setStatus('green');
    else if (anyUploaded) setStatus('amber');
    else                  setStatus('pending');
  }, [requiredDone, anyUploaded, setStatus]);

  const activeSection = SECTIONS.find(s => s.id === active);
  const activeDocs    = docs[active] || [];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0f172a' }}>

      {/* Section tabs */}
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'1px solid #334155', flexShrink:0, overflowX:'auto' }}>
        {SECTIONS.map(s => {
          const cnt = docs[s.id]?.length || 0;
          const sel = active === s.id;
          return (
            <div key={s.id} onClick={() => setActive(s.id)}
              style={{ padding:'10px 12px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, cursor:'pointer', color:sel?'#38bdf8':'#475569', borderBottom:sel?'2px solid #38bdf8':'2px solid transparent', display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ fontSize:14 }}>{s.icon}</span>
              <span>{s.label}</span>
              {cnt > 0 && <span style={{ background:'#4ade80', color:'#0f172a', borderRadius:10, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{cnt}</span>}
              {s.required && cnt === 0 && <span style={{ background:'#f97316', color:'#fff', borderRadius:10, padding:'1px 5px', fontSize:9, fontWeight:700 }}>!</span>}
            </div>
          );
        })}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>

        {/* Section header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:20 }}>{activeSection?.icon}</span>
            <span style={{ fontSize:14, fontWeight:600, color:'#f1f5f9' }}>{activeSection?.label}</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {activeDocs.length > 0
              ? <span style={{ fontSize:11, fontWeight:700, color:'#4ade80', background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.2)', padding:'3px 10px', borderRadius:20 }}>{activeDocs.length} ✓</span>
              : activeSection?.required
                ? <span style={{ fontSize:11, fontWeight:700, color:'#f97316', background:'rgba(249,115,22,0.1)', border:'1px solid rgba(249,115,22,0.2)', padding:'3px 10px', borderRadius:20 }}>REQUIRED</span>
                : <span style={{ fontSize:11, color:'#334155' }}>Optional</span>
            }
          </div>
        </div>

        {/* Fuel info */}
        {active === 'fuel' && (
          <div style={{ marginBottom:14, background:'rgba(56,189,248,0.06)', border:'1px solid rgba(56,189,248,0.15)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(56,189,248,0.1)', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1px' }}>FUEL DATA — FROM FUEL PAGE</div>
            <div style={{ padding:'10px 14px', display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'#475569' }}>Uplift entered</span>
              <span style={{ fontSize:12, color:'#475569', fontFamily:'monospace' }}>— lb</span>
            </div>
          </div>
        )}

        {/* Misc info */}
        {active === 'misc' && (
          <div style={{ marginBottom:14, padding:'12px 14px', borderRadius:12, background:'rgba(56,189,248,0.04)', border:'1px solid rgba(56,189,248,0.1)', fontSize:12, color:'#475569', lineHeight:1.6 }}>
            Upload cargo manifests, EIC forms, permits, or any other relevant paperwork.
          </div>
        )}

        {/* Documents */}
        {activeDocs.map((doc, idx) => <DocItem key={idx} doc={doc} onDelete={() => delDoc(active, idx)} />)}

        {/* Upload area */}
        <UploadArea onUpload={doc => addDoc(active, doc)} compact={activeDocs.length > 0} />

        {/* All documents summary */}
        <div style={{ marginTop:8 }}>
          <div style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:10 }}>All Documents</div>
          <div style={{ background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
            {SECTIONS.map(s => (
              <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:48 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <div>
                    <span style={{ fontSize:13, color:'#94a3b8' }}>{s.label}</span>
                    {s.required && <span style={{ fontSize:9, color:'#f97316', fontWeight:700, marginLeft:6 }}>REQ</span>}
                  </div>
                </div>
                <span style={{ fontSize:12, fontWeight:600, color:(docs[s.id]?.length>0)?'#4ade80':(s.required?'#f97316':'#334155') }}>
                  {(docs[s.id]?.length>0)?`${docs[s.id].length} ✓`:'—'}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div style={{ padding:'0 12px 12px' }}><SyncButton /></div>
    </div>
  );
}

export default DocUpload;