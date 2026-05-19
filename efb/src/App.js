import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import RassView from './components/RassView';
import { supabase, logEvent } from './supabaseClient';
import * as pdfjsLib from 'pdfjs-dist';
import AdminPanel from './components/AdminPanel';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

// ─── Global Font Size ─────────────────────────────────────────────────────────
const FONT_KEY  = 'efb_font_size';
const FONT_DEF  = 13;

function applyFont(size) {
  const scale = size / FONT_DEF;
  document.documentElement.style.zoom = scale.toString();
  localStorage.setItem(FONT_KEY, size);
}

function OfflineBanner({ offlineSince }) {
  if (!offlineSince) return null;
  const mins = Math.floor((Date.now() - offlineSince) / 60000);
  return (
    <div style={{ background:'rgba(232,115,26,0.15)', borderBottom:'2px solid #e8731a', padding:'7px 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0, zIndex:50 }}>
      <span style={{ fontSize:16 }}>⚠️</span>
      <div style={{ flex:1 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#e8731a' }}>OFFLINE MODE</span>
        <span style={{ fontSize:11, color:'#a86020', marginLeft:10 }}>
          No network connection — EFB operating on cached data
          {mins > 0 && ` · ${mins} min ago`}
        </span>
      </div>
      <span style={{ fontSize:10, color:'#a86020', fontWeight:700 }}>AMC 20-25 §7.4</span>
    </div>
  );
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────
const LS = {
  PLAN:    'efb_activePlan',
  PAGE:    'efb_activePage',
  FLIGHT:  'efb_flightData',
  STATUS:  'efb_pageStatus',
  DIVERT:  'efb_divertData',
  RAWTEXT: 'efb_rawText',
};

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function lsClear() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('efb_'))
    .forEach(k => localStorage.removeItem(k));
}

// ─── Default state values ─────────────────────────────────────────────────────
const DEFAULT_FLIGHT_DATA = {
  offBlock: '', takeoffTime: '', takeoffFuel: '',
  landingTime: '', onBlock: '', remainingFuel: '',
};

const DEFAULT_PAGE_STATUS = {
  'flt-crew': 'pending', 'mandatory': 'pending', 'efp': 'pending',
  'fuel': 'pending', 'accept': 'pending', 'takeoff': 'pending',
  'navlog': 'pending', 'landing': 'pending', 'endflt': 'pending',
  'docupload': 'pending',
};

const DEFAULT_DIVERT_DATA = {
  active: false, icao: '', rwy: '', len: '', reason: '',
};

// ─── Parsers ──────────────────────────────────────────────────────────────────
function parseDispatchNo(text) {
  const match = text.match(/\[#(DISP\d+)#\]/);
  return match ? match[1] : null;
}

function parseAllSectors(text) {
  const sectors = [];

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

  const ofpBlocks = [...text.matchAll(
    /FMS IDENT=\S+\s+Log Nr\.?:?\s*\d+\s+Page\s+1\s+([A-Z]{4}-[A-Z]{4})\s+([A-Z0-9]+)([\s\S]*?)(?=FMS IDENT=|$)/g
  )];

  const blockMap = {};
  for (const b of ofpBlocks) {
    blockMap[b[1]] = b[3];
  }

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
    const routeKey = `${sector.dep}-${sector.dest}`;
    const block = blockMap[routeKey] || '';

    sector.trip_fuel      = block.match(/\bTRIP\s+([\d]+)/)?.[1] || '';
    sector.alternate_fuel = block.match(/\bALTERNATE\s+([\d]+)/)?.[1] || '';
    sector.reserve_fuel   = block.match(/\bFINAL RESERVE\s+([\d]+)/)?.[1] || '';
    sector.total_fob      = block.match(/\bTOTAL FOB\s+([\d]+)/)?.[1] || '';
    sector.fob            = sector.total_fob ? `${parseInt(sector.total_fob).toLocaleString()} lb` : '';
    sector.tow            = block.match(/\bTOW\s+([\d]+)\s*Lbs/i)?.[1] || '';
    sector.zfw            = block.match(/\bZFW\s+([\d]+)\s*Lbs/i)?.[1] || '';
    sector.route          = block.match(/ROUTE:\s*([^\n]+)/)?.[1]?.trim() || '';

    const alt1 = block.match(/1\s*ST\s+ALT\s+([A-Z]{4})/)?.[1];
    const alt2 = text.match(new RegExp(`-${sector.dest}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    const alt3 = text.match(new RegExp(`${sector.dep}\\s*\\d{4}\\s+([A-Z]{4})`))?.[1];
    sector.alternate = alt1 || alt2 || alt3 || '';

    const flMatch = block.match(/CRUISE:[^\d]*(\d{3})/);
    sector.cruise_fl = flMatch ? `FL${flMatch[1]}` : '';

    const logMatch = text.match(new RegExp(`Log Nr\\.?:?\\s*(\\d+)\\s+Page\\s+1\\s+${sector.dep}-${sector.dest}`));
    sector.log_nr = logMatch?.[1] || '';

    sector.ac_type  = sector.ac_type  || globalAcType;
    sector.reg      = sector.reg      || globalReg;
    sector.date     = sector.date     || globalDate;
    sector.operator = sector.operator || globalOperator;
    sector.callsign = sector.callsign || globalCallsign;

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

  const [step, setStep] = useState("credentials");
  const [otp, setOtp] = useState("");

  const handleLogin = async () => {
    setLoading(true); setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (authError) { setError("Invalid email or password."); setLoading(false); return; }
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (otpError) { setError("Could not send OTP."); setLoading(false); return; }
    setStep("otp"); setLoading(false);
  };

  const handleOtp = async () => {
    setLoading(true); setError("");
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
    if (verifyError) { setError("Invalid or expired code."); setLoading(false); return; }
    onLogin(); setLoading(false);
  };
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', background:'#0f172a' }}>
      <div style={{ textAlign:'center', marginBottom:36 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#38bdf8', letterSpacing:3, textTransform:'uppercase', marginBottom:6 }}>GO2 Aviation</div>
        <div style={{ fontSize:32, fontWeight:700, color:'#f1f5f9' }}>eFB</div>
        <div style={{ fontSize:12, color:'#475569', marginTop:4 }}>Electronic Flight Bag</div>
      </div>
      <div style={{ width:320, background:'#1e293b', border:'1px solid #334155', borderRadius:14, overflow:'hidden' }}>
        <div style={{ background:'#1e293b', borderBottom:'1px solid #334155', padding:'12px 18px', fontSize:10, color:'#475569', fontWeight:700, letterSpacing:1, textTransform:'uppercase' }}>
          {step === 'credentials' ? 'Pilot Login' : '🔐 Verification Code'}
        </div>

        {step === 'credentials' && (
          <>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <label style={{ display:'block', fontSize:10, color:'#475569', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="pilot@company.com"
                style={{ width:'100%', background:'#0f172a', border:'1px solid #334155', borderRadius:6, padding:'9px 11px', fontSize:14, color:'#f1f5f9', fontFamily:'inherit', outline:'none' }} />
            </div>
            <div style={{ padding:'12px 18px' }}>
              <label style={{ display:'block', fontSize:10, color:'#475569', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Password</label>
              <input type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()}
                style={{ width:'100%', background:'#0f172a', border:'1px solid #334155', borderRadius:6, padding:'9px 11px', fontSize:14, color:'#f1f5f9', fontFamily:'inherit', outline:'none' }} />
            </div>
            {error && <div style={{ margin:'0 18px', padding:'8px 10px', borderRadius:5, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020' }}>{error}</div>}
            <button onClick={handleLogin} disabled={loading}
              style={{ width:'calc(100% - 36px)', margin:'14px 18px', background:loading?'#333':'#38bdf8', border:'none', borderRadius:8, padding:12, fontSize:14, fontWeight:700, color:'#fff', cursor:loading?'default':'pointer', fontFamily:'inherit' }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <div style={{ padding:'16px 18px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
              <div style={{ fontSize:12, color:'#94a3b8', marginBottom:14, lineHeight:1.6 }}>
                A 6-digit code has been sent to<br/>
                <span style={{ color:'#38bdf8', fontWeight:600 }}>{email}</span>
              </div>
              <label style={{ display:'block', fontSize:10, color:'#475569', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5 }}>Verification Code</label>
              <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                onKeyDown={e => e.key === 'Enter' && handleOtp()}
                placeholder="000000" maxLength={6}
                style={{ width:'100%', background:'#0f172a', border:'1.5px solid #38bdf8', borderRadius:8, padding:'12px', fontSize:24, fontWeight:700, color:'#38bdf8', fontFamily:'monospace', outline:'none', textAlign:'center', letterSpacing:8 }} />
            </div>
            {error && <div style={{ margin:'0 18px', padding:'8px 10px', borderRadius:5, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020' }}>{error}</div>}
            <button onClick={handleOtp} disabled={loading || otp.length !== 6}
              style={{ width:'calc(100% - 36px)', margin:'14px 18px', background:loading||otp.length!==6?'#1e293b':'#4ade80', border:otp.length===6?'none':'1px solid #334155', borderRadius:8, padding:12, fontSize:14, fontWeight:700, color:otp.length===6?'#0f172a':'#475569', cursor:otp.length===6?'pointer':'not-allowed', fontFamily:'inherit' }}>
              {loading ? 'Verifying...' : 'Verify & Sign In'}
            </button>
            <div style={{ padding:'0 18px 14px', textAlign:'center' }}>
              <span onClick={() => { setStep('credentials'); setOtp(''); setError(''); }} style={{ fontSize:11, color:'#475569', cursor:'pointer', textDecoration:'underline' }}>
                ← Back
              </span>
            </div>
          </>
        )}
      </div>
      <div style={{ marginTop:20, fontSize:10, color:'#333' }}>GO2 Aviation · For internal use only</div>
    </div>
  );
}
