import React, { useState, useEffect, useRef } from 'react';
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
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist';
import AdminPanel from './components/AdminPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

function parseDispatchNo(text) {
  const match = text.match(/\[#(DISP\d+)#\]/);
  return match ? match[1] : null;
}

// ─── Multi-sector parser ──────────────────────────────────────────────────────
function parseAllSectors(text) {
  const sectors = [];

  // 1. Kapak tablosundan sektörleri bul
  const tableRows = [...text.matchAll(
    /TC-([A-Z]{3})\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+([A-Z]{4})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+([A-Z]{4})\s+(\d{2}:\d{2})\s+\d{2}:\d{2}\s+(\d{2}:\d{2})\s+(\d+)/g
  )];

  for (const row of tableRows) {
    sectors.push({
      reg:  `TC-${row[1]}`,
      date: row[2],
      dep:  row[3],
      std:  row[4],
      dest: row[6],
      eta:  row[7],
      ete:  row[8],
      pax:  row[9],
    });
  }

  // 2. Kapak tablosu bulunamazsa ATC FPL'den çek
  if (sectors.length === 0) {
    const fplMatches = [...text.matchAll(
      /\(FPL-([A-Z0-9]+)-[A-Z]{2}[\s\S]*?-([A-Z]{4})(\d{4})[\s\S]*?-([A-Z]{4})(\d{4})/g
    )];
    for (const m of fplMatches) {
      const stdRaw = m[3];
      const eteRaw = m[5];
      const regRaw = text.match(/REG\/([A-Z0-9]{4,6})/)?.[1] || '';
      const reg = regRaw ? `TC-${regRaw.slice(2)}` : '';
      sectors.push({
        callsign: m[1],
        dep:  m[2],
        std:  `${stdRaw.slice(0,2)}:${stdRaw.slice(2)}`,
        dest: m[4],
        ete:  `${eteRaw.slice(0,2)}:${eteRaw.slice(2)}`,
        reg, date: '', pax: '', eta: '',
      });
    }
  }

  // 3. OFP bloklarını parse et
  // Her sektörün başlangıcı: "FMS IDENT=S9470 Log Nr.: 1853 Page   1        LTAC-LTAS   TCREC"
  // Capture groups: [1]=dep-dest ("LTAC-LTAS"), [2]=callsign, [3]=block content
  const ofpBlocks = [...text.matchAll(
    /FMS IDENT=\S+\s+Log Nr\.?:?\s*\d+\s+Page\s+1\s+([A-Z]{4}-[A-Z]{4})\s+([A-Z0-9]+)([\s\S]*?)(?=FMS IDENT=|$)/g
  )];

  // dep-dest → block content map
  const blockMap = {};
  for (const b of ofpBlocks) {
    blockMap[b[1]] = b[3]; // e.g. "LTAC-LTAS" → block content
  }

  // Genel bilgiler
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const dof = text.match(/DOF\/(\d{2})(\d{2})(\d{2})/);
  const globalDate     = dof ? `${dof[1]} ${months[parseInt(dof[2])-1]} 20${dof[3]}` : '';
  const globalOperator = text.match(/OPR\/([A-Z][A-Z\s]+?)(?:\s+RMK|\s+SEL|\s+PBN|\n)/)?.[1]?.trim() || '';
  const globalAcType   = text.match(/GLF4|GLF5|GIV|GIV-SP|GV|CL60|CL35|GL5T|GL6T|GLEX|C550|C560|C680|F900|FA7X|FA8X/)?.[0] || '';
  const globalReg = (() => {
    const raw = text.match(/REG\/([A-Z0-9]{4,6})/)?.[1] || text.match(/REGISTRATION:\s*TC-([A-Z]{3})/)?.[1] || '';
    if (!raw) return '';
    if (raw.startsWith('TC')) return raw;
    return `TC-${raw.slice(2)}`;
  })();
  const globalCallsign = text.match(/\(FPL-([A-Z0-9]+)-/)?.[1] || '';

  sectors.forEach((sector) => {
    // Sektöre ait OFP bloğunu dep-dest ile bul
    const routeKey = `${sector.dep}-${sector.dest}`;
    const block = blockMap[routeKey] || '';

    // Fuel — sektöre özgü block'tan parse et
    sector.trip_fuel      = block.match(/\bTRIP\s+([\d]+)/)?.[1] || '';
    sector.alternate_fuel = block.match(/\bALTERNATE\s+([\d]+)/)?.[1] || '';
    sector.reserve_fuel   = block.match(/\bFINAL RESERVE\s+([\d]+)/)?.[1] || '';
    sector.total_fob      = block.match(/\bTOTAL FOB\s+([\d]+)/)?.[1] || '';
    sector.fob            = sector.total_fob ? `${parseInt(sector.total_fob).toLocaleString()} lb` : '';

    // Weights
    sector.tow = block.match(/\bTOW\s+([\d]+)\s*Lbs/i)?.[1] || '';
    sector.zfw = block.match(/\bZFW\s+([\d]+)\s*Lbs/i)?.[1] || '';

    // Route
    sector.route = block.match(/ROUTE:\s*([^\n]+)/)?.[1]?.trim() || '';

    // Alternate
    const alt1 = block.match(/1\s*ST\s+ALT\s+([A-Z]{4})/)?.[1];
    const alt2 = text.match(new RegExp(`-${sector.dest}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    const alt3 = text.match(new RegExp(`${sector.dep}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    sector.alternate = alt1 || alt2 || alt3 || '';

    // Cruise FL
    const flMatch = block.match(/CRUISE:[^\d]*(\d{3})/);
    sector.cruise_fl = flMatch ? `FL${flMatch[1]}` : '';

    // Log Nr
    const logMatch = text.match(new RegExp(`Log Nr\\.?:?\\s*(\\d+)\\s+Page\\s+1\\s+${sector.dep}-${sector.dest}`));
    sector.log_nr = logMatch?.[1] || '';

    // Global alanlar
    sector.ac_type  = sector.ac_type  || globalAcType;
    sector.reg      = sector.reg      || globalReg;
    sector.date     = sector.date     || globalDate;
    sector.operator = sector.operator || globalOperator;
    sector.callsign = sector.callsign || globalCallsign;

    // ETA hesapla (yoksa)
    if (!sector.eta && sector.std && sector.ete) {
      const [sh, sm] = sector.std.split(':').map(Number);
      const [eh, em] = sector.ete.split(':').map(Number);
      const total = sh * 60 + sm + eh * 60 + em;
      sector.eta = `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
    }
  });

  return sectors;
}

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    let pageText = '';
    for (const item of content.items) {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) {
        pageText += '\n';
      }
      pageText += item.str;
      if (item.hasEOL) pageText += '\n';
      else pageText += ' ';
      lastY = item.transform[5];
    }
    text += pageText + '\n';
  }
  return text;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (authError) setError('Invalid email or password.');
    else onLogin();
    setLoading(false);
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
          <label style={{ display:'block', fontSize:10, color:'var(--t3)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="pilot@company.com"
            style={{ width:'100%', background:'#333', border:'1px solid var(--border)', borderRadius:6, padding:'9px 11px', fontSize:14, color:'var(--t1)', fontFamily:'inherit', outline:'none' }} />
        </div>
        <div style={{ padding:'12px 18px' }}>
          <label style={{ display:'block', fontSize:10, color:'var(--t3)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Password</label>
          <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{ width:'100%', background:'#333', border:'1px solid var(--border)', borderRadius:6, padding:'9px 11px', fontSize:14, color:'var(--t1)', fontFamily:'inherit', outline:'none' }} />
        </div>
        {error && <div style={{ margin:'0 18px', padding:'8px 10px', borderRadius:5, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020' }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading}
          style={{ width:'calc(100% - 36px)', margin:'14px 18px', background: loading ? '#333' : 'var(--accent)', border:'none', borderRadius:7, padding:12, fontSize:14, fontWeight:700, color:'#fff', cursor: loading ? 'default' : 'pointer', fontFamily:'inherit' }}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </div>
      <div style={{ marginTop:20, fontSize:10, color:'#333' }}>GO2 Aviation · For internal use only</div>
    </div>
  );
}

// ─── PlanCard ─────────────────────────────────────────────────────────────────
function PlanCard({ plan, active, archived, onOpen, onDelete, onDeactivate }) {
  return (
    <div style={{ background: archived ? '#1e1e1e' : active ? 'rgba(26,155,196,0.05)' : 'var(--bg3)', border:`1px solid ${archived ? '#2a2a2a' : active ? 'var(--accent)' : 'var(--border)'}`, borderRadius:10, overflow:'hidden', marginBottom:8, opacity: archived ? 0.85 : 1 }}>
      <div style={{ padding:'12px 14px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--border)' }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'var(--t1)', fontFamily:'monospace', letterSpacing:1 }}>
            {plan.dep} <span style={{ color: archived ? '#555' : 'var(--accent)' }}>→</span> {plan.dest}
          </div>
          <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{plan.date} · STD {plan.std} Z · {plan.ac} / {plan.reg}</div>
        </div>
        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, letterSpacing:0.5,
          background: archived ? 'rgba(100,100,100,0.15)' : active ? 'rgba(26,155,196,0.15)' : 'rgba(45,158,95,0.15)',
          color: archived ? '#666' : active ? 'var(--accent)' : 'var(--green)' }}>
          {archived ? 'ARCHIVED' : active ? 'IN PROGRESS' : 'AVAILABLE'}
        </span>
      </div>
      <div style={{ padding:'9px 14px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ fontSize:11, color:'var(--t3)' }}>ETD <b style={{ color:'var(--t2)', marginLeft:3 }}>{plan.std}</b></div>
        <div style={{ fontSize:11, color:'var(--t3)' }}>ETA <b style={{ color:'var(--t2)', marginLeft:3 }}>{plan.eta}</b></div>
        <div style={{ fontSize:11, color:'var(--t3)' }}>FOB <b style={{ color:'var(--t2)', marginLeft:3 }}>{plan.fob}</b></div>
        {!active && !archived && onDelete && (
          <button onClick={onDelete} style={{ background:'transparent', border:'1px solid #e02020', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, color:'#e02020', cursor:'pointer', fontFamily:'inherit' }}>
            ✕ Delete
          </button>
        )}
        {active && onDeactivate && (
          <button onClick={onDeactivate} style={{ background:'transparent', border:'1px solid #ff9500', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, color:'#ff9500', cursor:'pointer', fontFamily:'inherit' }}>
            ↩ Deactivate
          </button>
        )}
        {!archived && (
          <button onClick={onOpen} style={{ marginLeft:'auto', background: active ? 'rgba(26,155,196,0.12)' : 'var(--accent)', border: active ? '1px solid var(--accent)' : 'none', borderRadius:6, padding:'5px 13px', fontSize:11, fontWeight:700, color: active ? 'var(--accent)' : '#fff', cursor:'pointer', fontFamily:'inherit' }}>
            {active ? 'Open →' : '+ Activate'}
          </button>
        )}
        {archived && <span style={{ marginLeft:'auto', fontSize:10, color:'#444', fontWeight:700 }}>🔒 Read Only</span>}
        {plan.archived_at && archived && (
          <div style={{ fontSize:10, color:'#555', width:'100%', marginTop:4 }}>
            Archived: {new Date(plan.archived_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────
function UploadPlanModal({ onClose, onUploaded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const inputRef              = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true); setError(''); setSuccess('');
    try {
      const pdfText = await extractPdfText(file);
      const sectors = parseAllSectors(pdfText);

      if (sectors.length === 0) throw new Error('No flight sectors found in PDF.');

      const results = [];

      for (let i = 0; i < sectors.length; i++) {
        const sector = sectors[i];

        const baseDispatch = parseDispatchNo(pdfText)
          || parseDispatchNo(file.name)
          || `${sector.reg || 'MANUAL'}-${(sector.date || '').replace(/\s/g, '')}`;
        const dispatchNo = sectors.length > 1 ? `${baseDispatch}-S${i + 1}` : baseDispatch;

        const { data: existing } = await supabase.from('plans').select('id')
          .eq('dep',  sector.dep)
          .eq('dest', sector.dest)
          .eq('std',  sector.std)
          .eq('date', sector.date)
          .maybeSingle();

        if (!existing) {
          const { data: plan, error: insertError } = await supabase.from('plans').insert({
            dispatch_no:    dispatchNo,
            subject:        file.name,
            dep:            sector.dep,
            dest:           sector.dest,
            date:           sector.date,
            std:            sector.std,
            eta:            sector.eta,
            ete:            sector.ete,
            fob:            sector.fob,
            ac_type:        sector.ac_type,
            reg:            sector.reg,
            route:          sector.route,
            operator:       sector.operator,
            callsign:       sector.callsign,
            alternate:      sector.alternate,
            trip_fuel:      sector.trip_fuel,
            alternate_fuel: sector.alternate_fuel,
            reserve_fuel:   sector.reserve_fuel,
            tow:            sector.tow,
            zfw:            sector.zfw,
            pax:            sector.pax,
            cruise_fl:      sector.cruise_fl,
            log_nr:         sector.log_nr,
            status:         'available',
          }).select().single();

          if (insertError) throw insertError;

          await supabase.from('plan_versions').insert({
            plan_id:     plan.id,
            dispatch_no: dispatchNo,
            version_no:  1,
            raw_text:    pdfText,
          });

          if (sector.ac_type) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('customer_id')
              .eq('aircraft_type', sector.ac_type)
              .not('customer_id', 'is', null)
              .limit(1);
            if (profiles?.[0]?.customer_id) {
              await supabase.from('plans').update({ customer_id: profiles[0].customer_id }).eq('id', plan.id);
            }
          }

          results.push(`${sector.dep} → ${sector.dest}`);
        } else {
          const { count } = await supabase.from('plan_versions').select('*', { count: 'exact' }).eq('plan_id', existing.id);
          await supabase.from('plan_versions').insert({
            plan_id:     existing.id,
            dispatch_no: dispatchNo,
            version_no:  (count || 0) + 1,
            raw_text:    pdfText,
          });
          results.push(`${sector.dep} → ${sector.dest} (updated v${(count || 0) + 1})`);
        }
      }

      setSuccess(`${results.length} sector(s): ${results.join(', ')}`);
      onUploaded();
    } catch (err) { setError('Upload failed: ' + err.message); }
    setLoading(false);
  };

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:340, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#1a9bc4' }}>Upload Flight Plan (PDF)</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:'20px 16px' }}>
          {!success && (
            <div onClick={() => inputRef.current.click()} style={{ border:'2px dashed #383838', borderRadius:10, padding:'32px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:12, cursor:'pointer' }}>
              <div style={{ fontSize:36 }}>📄</div>
              <div style={{ fontSize:13, color:'#555', textAlign:'center' }}>Tap to select PDF<br /><span style={{ fontSize:11, color:'#444' }}>Flight Briefing Package</span></div>
            </div>
          )}
          <input ref={inputRef} type="file" accept=".pdf" onChange={handleFile} style={{ display:'none' }} />
          {loading && <div style={{ marginTop:12, padding:'10px 12px', borderRadius:6, background:'rgba(26,155,196,0.08)', borderLeft:'3px solid #1a9bc4', fontSize:11, color:'#7bbdd4' }}>⏳ Reading PDF...</div>}
          {error   && <div style={{ marginTop:12, padding:'10px 12px', borderRadius:6, background:'rgba(224,32,32,0.08)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020' }}>⚠ {error}</div>}
          {success && <div style={{ marginTop:12, padding:'10px 12px', borderRadius:6, background:'rgba(45,158,95,0.08)', borderLeft:'3px solid #2d9e5f', fontSize:11, color:'#6db890' }}>✓ {success}</div>}
        </div>
        <div style={{ padding:'0 16px 16px' }}>
          <button onClick={onClose} style={{ width:'100%', background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#666', cursor:'pointer', fontFamily:'inherit' }}>
            {success ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onOpen, user, onLogout, onAdmin, onActivate }) {
  const [tab, setTab]                       = useState('active');
  const [availablePlans, setAvailablePlans] = useState([]);
  const [activePlans, setActivePlans]       = useState([]);
  const [archivedPlans, setArchivedPlans]   = useState([]);
  const [showUpload, setShowUpload]         = useState(false);
  const [loading, setLoading]               = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const [avail, active, archived] = await Promise.all([
      supabase.from('plans').select('*').eq('status', 'available').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('plans').select('*').eq('status', 'archived').gte('archived_at', fifteenDaysAgo).order('archived_at', { ascending: false }),
    ]);
    setAvailablePlans(avail.data || []);
    setActivePlans(active.data || []);
    setArchivedPlans(archived.data || []);
    setLoading(false);
  };

  const deletePlan = async (planId) => {
    await supabase.from('plan_versions').delete().eq('plan_id', planId);
    await supabase.from('plans').delete().eq('id', planId);
    loadPlans();
  };

  const activatePlan = async (planId) => {
    await supabase.from('plans').update({ status: 'available' }).eq('status', 'active');
    const { data: plan } = await supabase.from('plans')
      .update({ status: 'active' })
      .eq('id', planId)
      .select()
      .single();

    if (plan) {
      // raw_text'den bu sektörün yakıtlarını parse et
      const { data: version } = await supabase
        .from('plan_versions')
        .select('raw_text')
        .eq('plan_id', planId)
        .order('version_no', { ascending: false })
        .limit(1)
        .single();

      if (version?.raw_text) {
        const raw = version.raw_text;
        const routeKey = `${plan.dep}-${plan.dest}`;
        // Bu sektöre ait OFP bloğunu bul
        const blockMatch = raw.match(
          new RegExp(`FMS IDENT=\\S+\\s+Log Nr\\.?:?\\s*\\d+\\s+Page\\s+1\\s+${routeKey}\\s+[A-Z0-9]+([\\s\\S]*?)(?=FMS IDENT=|$)`)
        );
        const block = blockMatch?.[1] || '';
        // Yakıtları parse et ve plana ekle
        plan.trip_fuel      = block.match(/\bTRIP\s+([\d]+)/)?.[1]      || plan.trip_fuel      || '';
        plan.alternate_fuel = block.match(/\bALTERNATE\s+([\d]+)/)?.[1] || plan.alternate_fuel || '';
        plan.reserve_fuel   = block.match(/\bFINAL RESERVE\s+([\d]+)/)?.[1] || plan.reserve_fuel || '';
        plan.total_fob      = block.match(/\bTOTAL FOB\s+([\d]+)/)?.[1] || '';
        plan.fob            = plan.total_fob ? `${parseInt(plan.total_fob).toLocaleString()} lb` : plan.fob || '';
        plan.tow            = block.match(/\bTOW\s+([\d]+)\s*Lbs/i)?.[1] || plan.tow || '';
        plan.zfw            = block.match(/\bZFW\s+([\d]+)\s*Lbs/i)?.[1] || plan.zfw || '';
      }
      onActivate(plan);
    }
    loadPlans();
    setTab('active');
  };

  const deactivatePlan = async (planId) => {
    await supabase.from('plans').update({ status: 'available' }).eq('id', planId);
    onActivate(null);
    loadPlans();
    setTab('available');
  };

  const planCard = (p) => ({
    dep: p.dep || '—', dest: p.dest || '—', date: p.date || '—',
    std: p.std || '—', eta: p.eta || '—',
    ac:  p.ac_type || p.ac || 'GLF4',
    reg: p.reg || 'TC-REC', fob: p.fob || '—',
    archived_at: p.archived_at,
  });

  useEffect(() => { loadPlans(); }, []);

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ background:'#1a1a1a', borderBottom:'1px solid var(--border)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--accent)', letterSpacing:1 }}>GO2 eFB</span>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:11, color:'var(--t3)' }}>{user?.email || ''}</span>
          <button onClick={onAdmin} style={{ background:'transparent', border:'1px solid #1a9bc4', borderRadius:5, padding:'3px 8px', fontSize:10, color:'#1a9bc4', cursor:'pointer', fontFamily:'inherit' }}>Admin</button>
          <button onClick={onLogout} style={{ background:'transparent', border:'1px solid #383838', borderRadius:5, padding:'3px 8px', fontSize:10, color:'#ffffff', cursor:'pointer', fontFamily:'inherit' }}>Logout</button>
        </div>
      </div>

      <div style={{ display:'flex', background:'#1e1e1e', borderBottom:'1px solid var(--border)' }}>
        {[
          { id:'available', label:'Available' },
          { id:'active',    label:'Active'    },
          { id:'archive',   label:'Archive'   },
        ].map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:11, textAlign:'center', fontSize:12, fontWeight:600, cursor:'pointer', color: tab===t.id ? 'var(--accent)' : 'var(--t3)', borderBottom: tab===t.id ? '2px solid var(--accent)' : '2px solid transparent' }}>
            {t.label}
            {t.id === 'active' && activePlans.length > 0 && (
              <span style={{ marginLeft:6, background:'#1a9bc4', color:'#fff', borderRadius:8, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{activePlans.length}</span>
            )}
            {t.id === 'archive' && archivedPlans.length > 0 && (
              <span style={{ marginLeft:6, background:'#555', color:'#fff', borderRadius:8, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{archivedPlans.length}</span>
            )}
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:10 }}>
        {tab === 'available' && (
          <>
            <button onClick={() => setShowUpload(true)} style={{ width:'100%', background:'rgba(26,155,196,0.08)', border:'1px dashed #1a9bc4', borderRadius:8, padding:'11px 14px', fontSize:12, fontWeight:700, color:'#1a9bc4', cursor:'pointer', fontFamily:'inherit', marginBottom:10, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              📄 Upload Flight Plan PDF
            </button>
            {loading && <div style={{ textAlign:'center', color:'#555', fontSize:12, padding:20 }}>Loading plans...</div>}
            {!loading && availablePlans.length === 0 && (
              <div style={{ textAlign:'center', color:'#444', fontSize:12, padding:20 }}>No available plans.<br />Upload a PDF to get started.</div>
            )}
            {availablePlans.map((p, i) => (
              <PlanCard key={i} plan={planCard(p)} active={false} archived={false}
                onOpen={() => activatePlan(p.id)}
                onDelete={() => deletePlan(p.id)}
              />
            ))}
          </>
        )}
        {tab === 'active' && (
          <>
            {loading && <div style={{ textAlign:'center', color:'#555', fontSize:12, padding:20 }}>Loading...</div>}
            {!loading && activePlans.length === 0 && (
              <div style={{ textAlign:'center', color:'#444', fontSize:12, padding:20 }}>No active plans.<br />Activate a plan from Available Plans.</div>
            )}
            {activePlans.map((p, i) => (
              <PlanCard key={i} plan={planCard(p)} active={true} archived={false}
                onOpen={onOpen}
                onDeactivate={() => deactivatePlan(p.id)}
              />
            ))}
          </>
        )}
        {tab === 'archive' && (
          <>
            <div style={{ padding:'8px 4px 10px', fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase' }}>Last 15 days · Read Only</div>
            {loading && <div style={{ textAlign:'center', color:'#555', fontSize:12, padding:20 }}>Loading...</div>}
            {!loading && archivedPlans.length === 0 && (
              <div style={{ textAlign:'center', color:'#444', fontSize:12, padding:20 }}>No archived flights in the last 15 days.</div>
            )}
            {archivedPlans.map((p, i) => (
              <PlanCard key={i} plan={planCard(p)} active={false} archived={true} />
            ))}
          </>
        )}
      </div>

      {showUpload && <UploadPlanModal onClose={() => setShowUpload(false)} onUploaded={loadPlans} />}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  const [page, setPage]             = useState('loading');
  const [user, setUser]             = useState(null);
  const [activePage, setActivePage] = useState('flt-crew');
  const [activePlan, setActivePlan] = useState(null);
  const [flightData, setFlightData] = useState({ offBlock:'', takeoffTime:'', takeoffFuel:'', landingTime:'', onBlock:'', remainingFuel:'' });
  const updateFlight  = (key, value) => setFlightData(prev => ({ ...prev, [key]: value }));
  const [pageStatus, setPageStatus] = useState({ 'flt-crew':'pending','mandatory':'pending','efp':'pending','fuel':'pending','accept':'pending','takeoff':'pending','navlog':'pending','landing':'pending','endflt':'pending','docupload':'pending' });
  const setStatus     = (pageId, status) => setPageStatus(prev => ({ ...prev, [pageId]: status }));
  const [divertData, setDivertData] = useState({ active:false, icao:'', rwy:'', len:'', reason:'' });
  const updateDivert  = (key, value) => setDivertData(prev => ({ ...prev, [key]: value }));
  const [showAdminAuth, setShowAdminAuth] = useState(false);
  const [adminPin, setAdminPin]           = useState('');
  const [adminPinError, setAdminPinError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setUser(session.user); setPage('dashboard'); }
      else setPage('login');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) { setUser(session.user); setPage('dashboard'); }
      else { setUser(null); setPage('login'); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const handleAdminAuth = async () => {
    const { data } = await supabase.from('system_settings').select('admin_password').single();
    if (data?.admin_password === adminPin) {
      setShowAdminAuth(false);
      setAdminPin('');
      setAdminPinError('');
      setPage('admin');
    } else {
      setAdminPinError('Incorrect password.');
    }
  };

  const navigate = (target) => {
    if (target === 'dashboard') setPage('dashboard');
    else { setPage('operational'); setActivePage(target); }
  };

  const layoutTitle = activePlan
    ? `${activePlan.reg || 'GO2'} · ${activePlan.dep || '—'}-${activePlan.dest || '—'} · ${activePlan.date || ''} ${activePlan.std || ''} Z`
    : 'GO2 eFB';

  if (page === 'loading') return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ fontSize:13, color:'#555' }}>Loading...</div>
    </div>
  );

  if (page === 'login') return <Login onLogin={() => setPage('dashboard')} />;
  if (page === 'admin') return <AdminPanel onBack={() => setPage('dashboard')} />;

  if (showAdminAuth) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'var(--bg)' }}>
      <div style={{ width:300, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', borderBottom:'1px solid var(--border)', padding:'10px 18px', fontSize:10, color:'#e8a020', fontWeight:700, letterSpacing:2 }}>ADMIN ACCESS</div>
        <div style={{ padding:'20px 18px' }}>
          <label style={{ display:'block', fontSize:10, color:'#ffffff', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Admin Password</label>
          <input type="password" value={adminPin} onChange={e => { setAdminPin(e.target.value); setAdminPinError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdminAuth()} placeholder="Enter password"
            style={{ width:'100%', background:'#333', border:'1px solid var(--border)', borderRadius:6, padding:'9px 11px', fontSize:14, color:'var(--t1)', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
          {adminPinError && (
            <div style={{ marginTop:8, padding:'7px 10px', borderRadius:5, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020' }}>{adminPinError}</div>
          )}
        </div>
        <div style={{ padding:'0 18px 18px', display:'flex', gap:8 }}>
          <button onClick={() => { setShowAdminAuth(false); setAdminPin(''); setAdminPinError(''); }}
            style={{ flex:1, background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#ffffff', cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
          <button onClick={handleAdminAuth}
            style={{ flex:1, background:'#e8a020', border:'none', borderRadius:7, padding:10, fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:'inherit' }}>Enter</button>
        </div>
      </div>
    </div>
  );

  if (page === 'dashboard') return (
    <Dashboard
      onOpen={() => navigate('flt-crew')}
      user={user}
      onLogout={handleLogout}
      onAdmin={() => { setAdminPin(''); setAdminPinError(''); setShowAdminAuth(true); }}
      onActivate={setActivePlan}
    />
  );

  return (
    <Layout activePage={activePage} onNavigate={navigate} title={layoutTitle} pageStatus={pageStatus}>
      {activePage === 'flt-crew'  && <FlightCrew  setStatus={(s) => setStatus('flt-crew', s)}  activePlan={activePlan} />}
      {activePage === 'mandatory' && <Mandatory   setStatus={(s) => setStatus('mandatory', s)} activePlan={activePlan} />}
      {activePage === 'efp'       && <EFP         setStatus={(s) => setStatus('efp', s)}        activePlan={activePlan} />}
      {activePage === 'fuel'      && <Fuel        setStatus={(s) => setStatus('fuel', s)}       activePlan={activePlan} />}
      {activePage === 'accept'    && <AcceptSign  pageStatus={pageStatus} setStatus={(s) => setStatus('accept', s)} activePlan={activePlan} />}
      {activePage === 'takeoff'   && <TakeoffData setStatus={(s) => setStatus('takeoff', s)}    activePlan={activePlan} />}
      {activePage === 'navlog'    && <NavLog      flightData={flightData} updateFlight={updateFlight} setStatus={(s) => setStatus('navlog', s)} activePlan={activePlan} />}
      {activePage === 'landing'   && <LandingData flightData={flightData} divertData={divertData} updateDivert={updateDivert} setStatus={(s) => setStatus('landing', s)} activePlan={activePlan} />}
      {activePage === 'endflt'    && <EndFlight   flightData={flightData} divertData={divertData} setStatus={(s) => setStatus('endflt', s)} activePlan={activePlan} />}
      {activePage === 'docupload' && <DocUpload   setStatus={(s) => setStatus('docupload', s)}  activePlan={activePlan} />}
      {activePage === 'freenote'  && <FreeNote />}
      {!['flt-crew','mandatory','efp','fuel','accept','takeoff','navlog','landing','endflt','docupload','freenote'].includes(activePage) && (
        <div style={{ padding:24, color:'var(--t3)', fontSize:13 }}>Page under construction...</div>
      )}
    </Layout>
  );
}

export default App;