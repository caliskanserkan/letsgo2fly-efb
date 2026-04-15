import React, { useState } from 'react';
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
  const [tab, setTab] = useState('active');
  const available = [
    { dep:'LTBA', dest:'LTFE', date:'11 APR 2026', std:'15:30', eta:'16:14', ac:'GLF4', reg:'TC-REC', fob:'9,800 lb' },
  ];
  const active = [
    { dep:'LTAC', dest:'LTBA', date:'11 APR 2026', std:'09:00', eta:'09:48', ac:'GLF4', reg:'TC-REC', fob:'13,000 lb', step:4 },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ background:'#1a1a1a', borderBottom:'1px solid var(--border)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)', letterSpacing:1 }}>GO2 eFB</span>
        <span style={{ fontSize:12, color:'var(--t3)' }}>Capt. <b style={{ color:'var(--t2)' }}>Ahmet Akpinar</b> · AAK</span>
      </div>
      <div style={{ display:'flex', background:'#1e1e1e', borderBottom:'1px solid var(--border)' }}>
        {['available','active'].map(t => (
          <div key={t} onClick={() => setTab(t)} style={{ flex:1, padding:11, textAlign:'center', fontSize:12, fontWeight:600, cursor:'pointer', color: tab===t ? 'var(--accent)' : 'var(--t3)', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent' }}>
            {t === 'available' ? 'Available Plans' : 'Active Plans'}
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:10 }}>
        {tab === 'available' && available.map((p,i) => <PlanCard key={i} plan={p} active={false} onOpen={() => {}} />)}
        {tab === 'active' && active.map((p,i) => <PlanCard key={i} plan={p} active={true} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

function PlaceholderPage() {
  return (
    <div style={{ padding:24, color:'var(--t3)', fontSize:13 }}>
      Page under construction...
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
    <Layout activePage={activePage} onNavigate={navigate} title="GO2TCREC · LTAC-LTBA · 11 APR 09:00 Z">
      {activePage === 'flt-crew'  && <FlightCrew />}
      {activePage === 'mandatory' && <Mandatory />}
      {activePage === 'efp'       && <EFP />}
      {activePage === 'fuel'      && <Fuel />}
      {activePage === 'accept'    && <AcceptSign />}
      {activePage === 'takeoff'   && <TakeoffData />}
      {activePage === 'navlog'    && <NavLog flightData={flightData} updateFlight={updateFlight} />}
      {activePage === 'landing' && <LandingData flightData={flightData} />}
      {activePage !== 'flt-crew' && activePage !== 'mandatory' && activePage !== 'efp' && activePage !== 'fuel' && activePage !== 'accept' && activePage !== 'takeoff' && activePage !== 'navlog' && activePage !== 'landing' && <PlaceholderPage />}
    </Layout>
  );
}

export default App;