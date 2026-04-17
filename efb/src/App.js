import React, { useState, useRef } from 'react';
import './App.css';
import Layout from './components/Layout';
import FlightCrew from './components/FlightCrew';
import Mandatory from './components/Mandatory';
import EFP from './components/EFP';
import Fuel from './components/Fuel';
import AcceptSign from './components/AcceptSign';
import TakeoffData from './components/TakeoffData';
import NavLog from './components/NavLog';
import LandingData from './components/LandingData';
import EndFlight from './components/EndFlight';
import DocUpload from './components/DocUpload';
import FreeNote from './components/FreeNote';

function Login({ onLogin }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState(false);

  const handleLogin = () => {
    if (user === 'go2admin' && pass === 'go2efb2026') {
      setError(false);
      onLogin();
    } else {
      setError(true);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ textAlign:'center', marginBottom:36 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:3, textTransform:'uppercase', marginBottom:6 }}>GO2 Aviation</div>
        <div style={{ fontSize:32, fontWeight:700, color:'var(--t1)' }}>eFB</div>
        <div style={{ fontSize:12, color:'var(--t3)', marginTop:4 }}>Electronic Flight Bag</div>
      </div>
      <div style={{ width:300, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', borderBottom:'1px solid var(--border)', padding:'10px 18px', fontSize:10, color:'var(--t3)', fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>Pilot Login</div>
        <div style={{ padding:'12px 18px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
          <label style={{ display:'block', fontSize:10, color:'var(--t3)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Username</label>
          <input value={user} onChange={e => setUser(e.target.value)} style={{ width:'100%', background:'#333', border:'1px solid var(--border)', borderRadius:6, padding:'9px 11px', fontSize:14, color:'var(--t1)', fontFamily:'inherit', outline:'none' }} />
        </div>
        <div style={{ padding:'12px 18px' }}>
          <label style={{ display:'block', fontSize:10, color:'var(--t3)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Password</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={{ width:'100%', background:'#333', border:'1px solid var(--border)', borderRadius:6, padding:'9px 11px', fontSize:14, color:'var(--t1)', fontFamily:'inherit', outline:'none' }} />
        </div>
        {error && (
          <div style={{ margin:'0 18px', padding:'8px 10px', borderRadius:5, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020' }}>
            Invalid username or password.
          </div>
        )}
        <button onClick={handleLogin} style={{ width:'calc(100% - 36px)', margin:'14px 18px', background:'var(--accent)', border:'none', borderRadius:7, padding:12, fontSize:14, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Sign In</button>
      </div>
      <div style={{ marginTop:20, fontSize:10, color:'#333' }}>GO2 Aviation · For internal use only</div>
    </div>
  );
}

function parseFlightPlanText(text) {
  // Dispatch no: [#DISPxxxxxx#]
  const dispatchNo = text.match(/\[#(DISP\d+)#\]/)?.[1] || '';

  // Dep / Dest — örnek: LTAC-LTBA veya DEP: LTAC
  const routeMatch = text.match(/([A-Z]{4})[- ]([A-Z]{4})/);
  const dep  = routeMatch?.[1] || '';
  const dest = routeMatch?.[2] || '';

  // Tarih
  const date = text.match(/(\d{2}\s+[A-Z]{3}\s+\d{4})/)?.[1] ||
               text.match(/(\d{2}[A-Z]{3}\d{2})/)?.[1] || '';

  // STD / ETD
  const std = text.match(/(?:STD|ETD)[:\s]+([\d:]+)/)?.[1] || '';

  // ETA
  const eta = text.match(/ETA[:\s]+([\d:]+)/)?.[1] || '';

  // FOB / Total fuel
  const fob = text.match(/(?:FOB|TOTAL FOB)[:\s]+([\d,]+)/)?.[1] || '';

  // AC type
  const ac = text.match(/\b(GLF4|GLF5|C56X|B738|A320|C172)\b/)?.[1] || 'GLF4';

  // Reg
  const reg = text.match(/\b(TC-[A-Z]{3})\b/)?.[1] || '';

  return { dispatchNo, dep, dest, date, std, eta, fob, ac, reg };
}

function UploadPlanModal({ onClose, onAdd }) {
  const inputRef = useRef(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError]     = useState('');
  const [preview, setPreview] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setParsing(true);
    setError('');
    setPreview(null);

    try {
      // PDF'i text olarak oku (pdfjs-dist ile)
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      let text = '';

      if (pdfjsLib) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n';
        }
      } else {
        // pdfjs yüklenemezse dosya adından basic parse
        text = file.name;
      }

      const info = parseFlightPlanText(text);

      // Minimum bilgi kontrolü
      if (!info.dep && !info.dest) {
        // Dosya adından dene
        const nameInfo = parseFlightPlanText(file.name);
        Object.assign(info, nameInfo);
      }

      setPreview({ ...info, fileName: file.name, rawText: text });
    } catch (err) {
      setError('Could not parse PDF. Please check the file.');
    }

    setParsing(false);
  };

  const handleAdd = () => {
    if (!preview) return;
    onAdd({
      dep:          preview.dep  || '—',
      dest:         preview.dest || '—',
      date:         preview.date || '—',
      std:          preview.std  || '—',
      eta:          preview.eta  || '—',
      fob:          preview.fob  ? `${preview.fob} lb` : '—',
      ac:           preview.ac   || 'GLF4',
      reg:          preview.reg  || 'TC-REC',
      dispatchNo:   preview.dispatchNo || `MANUAL-${Date.now()}`,
      fileName:     preview.fileName,
    });
    onClose();
  };

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:360, overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#1f1f1f', padding:'12px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#1a9bc4' }}>Upload Flight Plan</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>

        <div style={{ padding:'16px' }}>
          {/* Upload area */}
          {!preview && (
            <div onClick={() => inputRef.current.click()}
              style={{ border:'2px dashed #383838', borderRadius:10, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:10, cursor:'pointer' }}>
              <div style={{ fontSize:36 }}>📄</div>
              <div style={{ fontSize:13, color:'#555', textAlign:'center' }}>
                Tap to upload OFP / Flight Plan PDF
              </div>
              <div style={{ fontSize:11, color:'#444' }}>PDF format</div>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFile} style={{ display:'none' }} />

          {parsing && (
            <div style={{ textAlign:'center', padding:20, color:'#555', fontSize:13 }}>
              Parsing PDF...
            </div>
          )}

          {error && (
            <div style={{ padding:'10px 12px', borderRadius:6, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020', marginTop:8 }}>
              {error}
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div style={{ background:'#1e1e1e', borderRadius:8, overflow:'hidden', border:'1px solid #383838' }}>
              <div style={{ background:'#1f1f1f', padding:'8px 12px', borderBottom:'1px solid #383838', fontSize:10, color:'#555', fontWeight:700, textTransform:'uppercase', letterSpacing:0.7 }}>
                Parsed Info — Review before adding
              </div>
              {[
                { label:'Dispatch No', value: preview.dispatchNo || '—' },
                { label:'Route',       value: `${preview.dep || '—'} → ${preview.dest || '—'}` },
                { label:'Date',        value: preview.date || '—' },
                { label:'STD',         value: preview.std  || '—' },
                { label:'ETA',         value: preview.eta  || '—' },
                { label:'FOB',         value: preview.fob  ? `${preview.fob} lb` : '—' },
                { label:'Aircraft',    value: `${preview.ac || '—'} / ${preview.reg || '—'}` },
              ].map((row, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'9px 12px', borderBottom:'1px solid #2a2a2a' }}>
                  <span style={{ fontSize:11, color:'#555' }}>{row.label}</span>
                  <span style={{ fontSize:11, color:'#e8e8e8', fontFamily:'monospace' }}>{row.value}</span>
                </div>
              ))}
              <div style={{ padding:'8px 12px' }}>
                <div style={{ fontSize:10, color:'#444', fontStyle:'italic' }}>
                  📎 {preview.fileName}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={{ padding:'0 16px 16px', display:'flex', gap:8 }}>
          <button onClick={onClose} style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>
            Cancel
          </button>
          {!preview ? (
            <button onClick={() => inputRef.current.click()} style={{ flex:2, background:'#1a9bc4', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
              Select PDF
            </button>
          ) : (
            <button onClick={handleAdd} style={{ flex:2, background:'#2d9e5f', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
              ✓ Add to Available Plans
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PlanCard({ plan, active, onOpen }) {
  return (
    <div style={{ background: active ? 'rgba(26,155,196,0.05)' : 'var(--bg3)', border:`1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius:10, overflow:'hidden', marginBottom:8 }}>
      <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--t1)', fontFamily:'monospace', letterSpacing:1 }}>
            {plan.dep} <span style={{ color:'var(--accent)' }}>→</span> {plan.dest}
          </div>
          <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{plan.date} · STD {plan.std} Z · {plan.ac} / {plan.reg}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, letterSpacing:0.5, background: active ? 'rgba(26,155,196,0.15)' : 'rgba(45,158,95,0.15)', color: active ? 'var(--accent)' : 'var(--green)' }}>
          {active ? 'IN PROGRESS' : 'AVAILABLE'}
        </span>
      </div>
      <div style={{ padding:'9px 14px', display:'flex', gap:16, alignItems:'center' }}>
        <div style={{ fontSize:11, color:'var(--t3)' }}>ETD <b style={{ color:'var(--t2)', marginLeft:3 }}>{plan.std}</b></div>
        <div style={{ fontSize:11, color:'var(--t3)' }}>ETA <b style={{ color:'var(--t2)', marginLeft:3 }}>{plan.eta}</b></div>
        <div style={{ fontSize:11, color:'var(--t3)' }}>FOB <b style={{ color:'var(--t2)', marginLeft:3 }}>{plan.fob}</b></div>
        {active && <div style={{ fontSize:11, color:'var(--t3)' }}>Step <b style={{ color:'var(--accent)', marginLeft:3 }}>{plan.step}/10</b></div>}
        <button onClick={onOpen} style={{ marginLeft:'auto', background: active ? 'rgba(26,155,196,0.12)' : 'var(--accent)', border: active ? '1px solid var(--accent)' : 'none', borderRadius:6, padding:'5px 13px', fontSize:11, fontWeight:700, color: active ? 'var(--accent)' : '#fff', cursor:'pointer', fontFamily:'inherit' }}>
          {active ? 'Open →' : '+ Activate'}
        </button>
      </div>
    </div>
  );
}

function Dashboard({ onOpen }) {
  const [tab, setTab]             = useState('active');
  const [showUpload, setShowUpload] = useState(false);
  const [available, setAvailable] = useState([
    { dep:'LTBA', dest:'LTFE', date:'11 APR 2026', std:'15:30', eta:'16:14', ac:'GLF4', reg:'TC-REC', fob:'9,800 lb' },
  ]);
  const active = [
    { dep:'LTAC', dest:'LTBA', date:'11 APR 2026', std:'09:00', eta:'09:48', ac:'GLF4', reg:'TC-REC', fob:'13,000 lb', step:4 },
  ];

  const handleAddPlan = (plan) => {
    setAvailable(prev => [...prev, plan]);
    setTab('available');
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'var(--bg)' }}>
      {/* Header */}
      <div style={{ background:'#1a1a1a', borderBottom:'1px solid var(--border)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)', letterSpacing:1 }}>GO2 eFB</span>
        <span style={{ fontSize:12, color:'var(--t3)' }}>Capt. <b style={{ color:'var(--t2)' }}>Ahmet Akpinar</b> · AAK</span>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#1e1e1e', borderBottom:'1px solid var(--border)' }}>
        {['available','active'].map(t => (
          <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:11, textAlign:'center', fontSize:12, fontWeight:600, cursor:'pointer', color: tab===t ? 'var(--accent)' : 'var(--t3)', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent' }}>
            {t === 'available' ? 'Available Plans' : 'Active Plans'}
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:10 }}>
        {tab === 'available' && (
          <>
            {/* Upload Plan button */}
            <button onClick={() => setShowUpload(true)}
              style={{ width:'100%', marginBottom:10, background:'rgba(26,155,196,0.08)', border:'1px dashed #1a9bc4', borderRadius:8, padding:'11px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', fontFamily:'inherit' }}>
              <span style={{ fontSize:16 }}>📎</span>
              <span style={{ fontSize:12, fontWeight:700, color:'#1a9bc4' }}>Upload Flight Plan PDF</span>
            </button>

            {available.length === 0 && (
              <div style={{ textAlign:'center', padding:40, color:'var(--t3)', fontSize:13 }}>
                No available plans.<br />
                <span style={{ fontSize:11, color:'#444' }}>Upload a PDF or wait for email sync.</span>
              </div>
            )}
            {available.map((p, i) => <PlanCard key={i} plan={p} active={false} onOpen={() => {}} />)}
          </>
        )}
        {tab === 'active' && active.map((p, i) => <PlanCard key={i} plan={p} active={true} onOpen={onOpen} />)}
      </div>

      {showUpload && (
        <UploadPlanModal
          onClose={() => setShowUpload(false)}
          onAdd={handleAddPlan}
        />
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState('login');
  const [activePage, setActivePage] = useState('flt-crew');

  const [flightData, setFlightData] = useState({
    offBlock: '',
    takeoffTime: '',
    takeoffFuel: '',
    landingTime: '',
    onBlock: '',
    remainingFuel: '',
  });

  const updateFlight = (key, value) => {
    setFlightData(prev => ({ ...prev, [key]: value }));
  };

  const [pageStatus, setPageStatus] = useState({
    'flt-crew':  'pending',
    'mandatory': 'pending',
    'efp':       'pending',
    'fuel':      'pending',
    'accept':    'pending',
    'takeoff':   'pending',
    'navlog':    'pending',
    'landing':   'pending',
    'endflt':    'pending',
    'docupload': 'pending',
  });

  const setStatus = (pageId, status) => {
    setPageStatus(prev => ({ ...prev, [pageId]: status }));
  };

  const [divertData, setDivertData] = useState({
    active: false,
    icao: '',
    rwy: '',
    len: '',
    reason: '',
  });

  const updateDivert = (key, value) => {
    setDivertData(prev => ({ ...prev, [key]: value }));
  };

  const navigate = (target) => {
    if (target === 'dashboard') {
      setPage('dashboard');
    } else {
      setPage('operational');
      setActivePage(target);
    }
  };

  if (page === 'login') return <Login onLogin={() => setPage('dashboard')} />;
  if (page === 'dashboard') return <Dashboard onOpen={() => navigate('flt-crew')} />;

  return (
    <Layout activePage={activePage} onNavigate={navigate} title="GO2TCREC · LTAC-LTBA · 11 APR 09:00 Z" pageStatus={pageStatus}>
      {activePage === 'flt-crew'  && <FlightCrew  setStatus={(s) => setStatus('flt-crew', s)} />}
      {activePage === 'mandatory' && <Mandatory   setStatus={(s) => setStatus('mandatory', s)} />}
      {activePage === 'efp'       && <EFP         setStatus={(s) => setStatus('efp', s)} />}
      {activePage === 'fuel'      && <Fuel        setStatus={(s) => setStatus('fuel', s)} />}
      {activePage === 'accept'    && <AcceptSign  pageStatus={pageStatus} setStatus={(s) => setStatus('accept', s)} />}
      {activePage === 'takeoff'   && <TakeoffData setStatus={(s) => setStatus('takeoff', s)} />}
      {activePage === 'navlog'    && <NavLog      flightData={flightData} updateFlight={updateFlight} setStatus={(s) => setStatus('navlog', s)} />}
      {activePage === 'landing'   && <LandingData flightData={flightData} divertData={divertData} updateDivert={updateDivert} setStatus={(s) => setStatus('landing', s)} />}
      {activePage === 'endflt'    && <EndFlight   flightData={flightData} divertData={divertData} setStatus={(s) => setStatus('endflt', s)} />}
      {activePage === 'docupload' && <DocUpload   setStatus={(s) => setStatus('docupload', s)} />}
      {activePage === 'freenote'  && <FreeNote />}
      {activePage !== 'flt-crew' && activePage !== 'mandatory' && activePage !== 'efp' && activePage !== 'fuel' && activePage !== 'accept' && activePage !== 'takeoff' && activePage !== 'navlog' && activePage !== 'landing' && activePage !== 'endflt' && activePage !== 'docupload' && activePage !== 'freenote' && (
        <div style={{ padding:24, color:'var(--t3)', fontSize:13 }}>Page under construction...</div>
      )}
    </Layout>
  );
}

export default App;