import React, { useEffect, useRef } from 'react';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';

const SECTIONS = [
  { id:'fuel',     label:'Fuel Receipt',             icon:'⛽', required:true  },
  { id:'handling', label:'Handling Receipt',          icon:'🤝', required:false },
  { id:'crs',      label:'CRS / Maintenance',        icon:'🔧', required:false },
  { id:'catering', label:'Catering Receipt',         icon:'🍽', required:false },
  { id:'security', label:'Security Form',            icon:'🛡', required:true  },
  { id:'misc',     label:'Misc. (Cargo, EIC etc.)',  icon:'📂', required:false },
];

const DEFAULT_DOCS = { fuel:[], handling:[], crs:[], catering:[], security:[], misc:[] };

function Sep() {
  return <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />;
}

function DocItem({ doc, onDelete }) {
  return (
    <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, margin:'0 16px 8px' }}>
      <span style={{ fontSize:24 }}>{doc.type === 'pdf' ? '📄' : '🖼'}</span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#e8e8e8' }}>{doc.name}</div>
        <div style={{ fontSize:10, color:'#555', marginTop:1 }}>{doc.size} · {doc.time} · {doc.by}</div>
      </div>
      <button style={{ background:'#333', border:'1px solid #444', borderRadius:4, padding:'4px 8px', fontSize:11, color:'#aaa', cursor:'pointer', fontFamily:'inherit' }}>View</button>
      <button onClick={onDelete} style={{ background:'#333', border:'1px solid #444', borderRadius:4, padding:'4px 8px', fontSize:11, color:'#e02020', cursor:'pointer', fontFamily:'inherit' }}>✕</button>
    </div>
  );
}

function UploadArea({ onUpload, compact }) {
  const inputRef = useRef(null);
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const now = new Date();
    const time = `${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')} Z`;
    const sizeKb = (file.size / 1024).toFixed(0);
    const size = sizeKb > 1024 ? `${(sizeKb/1024).toFixed(1)} MB` : `${sizeKb} KB`;
    const type = file.type.includes('pdf') ? 'pdf' : 'img';
    onUpload({ name: file.name, size, time, by:'AAK', type });
    e.target.value = '';
  };
  if (compact) {
    return (
      <div style={{ margin:'0 16px 12px' }}>
        <div onClick={() => inputRef.current.click()}
          style={{ border:'2px dashed #333', borderRadius:8, padding:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}>
          <span style={{ fontSize:18 }}>➕</span>
          <span style={{ fontSize:12, color:'#555' }}>Add another document</span>
        </div>
        <input ref={inputRef} type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display:'none' }} />
      </div>
    );
  }
  return (
    <div style={{ margin:'14px 16px' }}>
      <div onClick={() => inputRef.current.click()}
        style={{ border:'2px dashed #383838', borderRadius:10, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, cursor:'pointer' }}>
        <div style={{ fontSize:40 }}>📎</div>
        <div style={{ fontSize:13, color:'#555', textAlign:'center', lineHeight:1.6 }}>
          Tap to upload document<br /><span style={{ fontSize:11, color:'#444' }}>Photo or PDF</span>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:6, padding:'8px 16px', fontSize:12, fontWeight:600, color:'#1a9bc4', cursor:'pointer' }}>📷 Camera</div>
          <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:6, padding:'8px 16px', fontSize:12, fontWeight:600, color:'#1a9bc4', cursor:'pointer' }}>📁 Files</div>
        </div>
      </div>
      <input ref={inputRef} type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display:'none' }} />
    </div>
  );
}

function StatusBadge({ docs, required }) {
  const ok = docs.length > 0;
  return (
    <div style={{ padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
      <div style={{ display:'flex', alignItems:'center', gap:7 }}>
        <div style={{ width:8, height:8, borderRadius:4, background: ok ? '#2d9e5f' : (required ? '#e8731a' : '#444') }} />
        <span style={{ fontSize:12, color: ok ? '#2d9e5f' : (required ? '#e8731a' : '#555'), fontWeight:600 }}>
          {ok ? `${docs.length} document${docs.length > 1 ? 's' : ''} uploaded` : 'No document uploaded'}
        </span>
      </div>
      {required && !ok && (
        <span style={{ fontSize:10, color:'#e8731a', fontWeight:700, background:'rgba(255,149,0,0.1)', padding:'2px 8px', borderRadius:4 }}>REQUIRED</span>
      )}
    </div>
  );
}

function DocUpload({ setStatus }) {
  const [active, setActive] = usePersistedState('efb_docupload_active', 'fuel');
  const [docs,   setDocs]   = usePersistedState('efb_docupload_docs',   DEFAULT_DOCS);

  const addDoc = (section, doc) => {
    setDocs(prev => ({ ...prev, [section]: [...(prev[section] || []), doc] }));
  };

  const delDoc = (section, idx) => {
    setDocs(prev => ({ ...prev, [section]: prev[section].filter((_,i) => i !== idx) }));
  };

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
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0, overflowX:'auto' }}>
        {SECTIONS.map(s => (
          <div key={s.id} onClick={() => setActive(s.id)}
            style={{ padding:'9px 12px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, cursor:'pointer',
              color: active===s.id ? '#1a9bc4' : '#555',
              borderBottom: active===s.id ? '2px solid #1a9bc4' : '2px solid transparent',
              display:'flex', alignItems:'center', gap:4 }}>
            <span>{s.label}</span>
            {(docs[s.id]?.length > 0) && (
              <span style={{ background:'#2d9e5f', color:'#fff', borderRadius:8, padding:'1px 5px', fontSize:9, fontWeight:700 }}>
                {docs[s.id].length}
              </span>
            )}
            {s.required && !(docs[s.id]?.length > 0) && (
              <span style={{ background:'#e8731a', color:'#fff', borderRadius:8, padding:'1px 5px', fontSize:9, fontWeight:700 }}>!</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto' }}>
        <div style={{ background:'#1f1f1f', borderBottom:'1px solid #383838', padding:'10px 16px', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:18 }}>{activeSection?.icon}</span>
          <span style={{ fontSize:13, fontWeight:700, color:'#e8e8e8' }}>{activeSection?.label}</span>
        </div>

        <StatusBadge docs={activeDocs} required={activeSection?.required} />

        {active === 'fuel' && (
          <div style={{ margin:'8px 16px', borderRadius:8, overflow:'hidden', border:'1px solid rgba(26,155,196,0.15)' }}>
            <div style={{ background:'rgba(26,155,196,0.08)', color:'#1a9bc4', padding:'7px 12px', fontSize:10, fontWeight:700, letterSpacing:0.7, textTransform:'uppercase' }}>
              Fuel Data — From FUEL page
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
              <span style={{ fontSize:12.5, color:'#666' }}>Uplift entered</span>
              <span style={{ fontSize:13, fontWeight:600, color:'#555', fontFamily:'monospace' }}>— lb</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2a2a2a' }}>
              <span style={{ fontSize:12.5, color:'#666' }}>Density</span>
              <span style={{ fontSize:12.5, color:'#555', fontFamily:'monospace' }}>0.78 kg/L</span>
            </div>
          </div>
        )}

        {active === 'misc' && (
          <div style={{ margin:'8px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(26,155,196,0.06)', borderLeft:'3px solid #1a9bc4', fontSize:11, color:'#7bbdd4', lineHeight:1.6 }}>
            Upload any additional documents here — cargo manifests, EIC forms, permits, or any other relevant paperwork.
          </div>
        )}

        {activeDocs.length > 0 && (
          <div style={{ marginTop:8 }}>
            {activeDocs.map((doc, idx) => (
              <DocItem key={idx} doc={doc} onDelete={() => delDoc(active, idx)} />
            ))}
            <UploadArea onUpload={doc => addDoc(active, doc)} compact />
          </div>
        )}

        {activeDocs.length === 0 && (
          <UploadArea onUpload={doc => addDoc(active, doc)} />
        )}

        <Sep />

        <div style={{ padding:'10px 16px', fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase' }}>
          All Documents
        </div>
        {SECTIONS.map(s => (
          <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:14 }}>{s.icon}</span>
              <span style={{ fontSize:12, color:'#999' }}>{s.label}</span>
              {s.required && <span style={{ fontSize:9, color:'#e8731a', fontWeight:700 }}>REQ</span>}
            </div>
            <span style={{ fontSize:11, fontWeight:600, color: (docs[s.id]?.length > 0) ? '#2d9e5f' : (s.required ? '#e8731a' : '#444') }}>
              {(docs[s.id]?.length > 0) ? `${docs[s.id].length} ✓` : '—'}
            </span>
          </div>
        ))}
      </div>

      <SyncButton />
    </div>
  );
}

export default DocUpload;