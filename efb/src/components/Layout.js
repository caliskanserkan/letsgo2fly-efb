import React, { useState, useEffect } from 'react';

// ─── Font size CSS variable helper ───────────────────────────────────────────
const FONT_KEY  = 'efb_font_size';
const FONT_MIN  = 10;
const FONT_MAX  = 22;
const FONT_DEF  = 13;
const FONT_STEP = 1;

function applyFont(size) {
  const scale = size / FONT_DEF;
  document.documentElement.style.zoom = scale.toString();
  localStorage.setItem(FONT_KEY, size);
}

function FontControls() {
  const [size, setSize] = useState(() => parseInt(localStorage.getItem(FONT_KEY) || FONT_DEF));
  const change = (delta) => {
    const next = Math.min(FONT_MAX, Math.max(FONT_MIN, size + delta));
    setSize(next);
    applyFont(next);
  };
  return (
    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
      <button onClick={() => change(-FONT_STEP)}
        style={{ width:28, height:28, background:'#2a2a2a', border:'1px solid #444', borderRadius:5, color:'#aaa', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, fontFamily:'inherit' }}>−</button>
      <span style={{ fontSize:11, color:'#555', minWidth:22, textAlign:'center', fontFamily:'monospace' }}>{size}</span>
      <button onClick={() => change(+FONT_STEP)}
        style={{ width:28, height:28, background:'#2a2a2a', border:'1px solid #444', borderRadius:5, color:'#aaa', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, fontFamily:'inherit' }}>+</button>
    </div>
  );
}

// ── PHASE COLOR SYSTEM ────────────────────────────────────────
const PHASE = {
  'flt-crew':  { color: '#8B6F4E', type: 'tile'   },
  'mandatory': { color: '#8B6F4E', type: 'tile'   },
  'efp':       { color: '#8B6F4E', type: 'tile'   },
  'fuel':      { color: '#8B6F4E', type: 'tile'   },
  'accept':    { color: '#8B1A1A', type: 'border' },
  'takeoff':   { color: '#1a7fc4', type: 'tile'   },
  'navlog':    { color: '#1a7fc4', type: 'tile'   },
  'landing':   { color: '#1a7fc4', type: 'tile'   },
  'endflt':    { color: '#2d9e5f', type: 'border' },
  'docupload': { color: '#666666', type: 'tile'   },
  'freenote':  { color: '#666666', type: 'tile'   },
  'rass':      { color: '#1a6b9c', type: 'tile'   },
};

const menuItems = [
  { id: 'flt-crew',  num: '1',  label: 'Flight & Crew'        },
  { id: 'mandatory', num: '2',  label: 'Mandatory / Preflight' },
  { id: 'efp',       num: '3',  label: 'eFP'                   },
  { id: 'fuel',      num: '4',  label: 'FUEL'                  },
  { id: 'rass',      num: '5',  label: 'RASS'                  },
  { id: 'accept',    num: '6',  label: 'Accept & Sign'         },
  { id: 'takeoff',   num: '7',  label: 'T/O Data'              },
  { id: 'navlog',    num: '8',  label: 'NAV LOG'               },
  { id: 'landing',   num: '9',  label: 'LND Data'              },
  { id: 'endflt',    num: '10', label: 'END FLT'               },
  { id: 'docupload', num: '11', label: 'DOC UPLOAD'            },
];

// ── EFB FAILURE BACKUP PROCEDURE MODAL ───────────────────────
function EfbFailureModal({ onClose }) {
  const steps = [
    { phase: 'IMMEDIATE ACTION', color: '#e02020', items: [
      'Notify PIC — declare EFB unserviceable',
      'Switch to annotated local PDF copy of OFP if available on device',
      'If possible, request hardcopy OFP from operations/dispatch',
      'Do NOT continue using partially failed or suspect EFB data',
      'Cross-check all critical data (fuel, performance) against backup source',
    ]},
    { phase: 'IN FLIGHT — CONTINGENCY', color: '#e8731a', items: [
      'Use aircraft certified navigation systems (FMS/RNAV) — not EFB GPS',
      'Request latest WXR/ATIS from ATC if EFB weather data unavailable',
      'Use published paper charts or ATC clearance for approach procedures',
      'Annotate paper backup with any changes made during flight',
      'Inform dispatch/operations of EFB failure and contingency in use',
      'Document all deviations from planned OFP on paper backup',
    ]},
    { phase: 'POST-FLIGHT — RECONCILIATION', color: '#1a9bc4', items: [
      'Compare paper backup annotations against EFB/system records',
      'Enter any discrepancies into official system (reconciliation)',
      'Log EFB failure event in discrepancy/event log',
      'Report failure to EFB administrator per AMC 20-25 §7.12',
      'Do not clear event log — retain for audit trail',
    ]},
    { phase: 'ON GROUND — BEFORE NEXT DISPATCH', color: '#ff9500', items: [
      'Do not dispatch with failed EFB unless MEL permits and paper backup is on board',
      'Contact GO2 operations for replacement device if required',
      'Ensure EFB failure is recorded in tech log with time and description',
      'EFB administrator to investigate and document root cause',
    ]},
    { phase: 'BACKUP SOURCES', color: '#2d9e5f', items: [
      'OFP: Local annotated PDF → hardcopy from dispatch',
      'WXR: ACARS / ATC / ATIS / VOLMET',
      'NOTAM: Paper NOTAMs from pre-flight dispatch package',
      'Charts: Published Jeppesen / ICAO paper charts',
      'Performance: Paper AFM, QRH, or published performance tables',
    ]},
  ];

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div style={{ background:'#1a1a1a', border:'2px solid #e02020', borderRadius:12, width:'min(460px, 92vw)', maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ background:'rgba(224,32,32,0.15)', padding:'14px 16px', borderBottom:'1px solid #e02020', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>🚨</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#e02020' }}>EFB FAILURE PROCEDURE</div>
              <div style={{ fontSize:10, color:'#888', marginTop:2 }}>AMC 20-25 §7.12 — Contingency & Backup</div>
            </div>
          </div>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</span>
        </div>
        <div style={{ overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:12 }}>
          {steps.map(({ phase, color, items }) => (
            <div key={phase} style={{ border:`1px solid ${color}40`, borderRadius:8, overflow:'hidden' }}>
              <div style={{ background:`${color}18`, padding:'7px 12px', borderBottom:`1px solid ${color}30` }}>
                <span style={{ fontSize:11, fontWeight:700, color, letterSpacing:1 }}>{phase}</span>
              </div>
              <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:7 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ color, fontSize:12, flexShrink:0, marginTop:1 }}>▸</span>
                    <span style={{ fontSize:12, color:'#ccc', lineHeight:1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ padding:'10px 12px', borderRadius:6, background:'rgba(26,155,196,0.08)', borderLeft:'3px solid #1a9bc4', fontSize:11, color:'#7bbdd4', lineHeight:1.7 }}>
            Per EASA AMC 20-25, operators must maintain backup means whenever EFB is used as primary information source.
          </div>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #383838', flexShrink:0 }}>
          <button onClick={onClose} style={{ width:'100%', background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:11, fontSize:13, fontWeight:700, color:'#e8e8e8', cursor:'pointer', fontFamily:'inherit' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ABOUT EFB MODAL ───────────────────────────────────────────
function AboutEfbModal({ onClose }) {
  const [info, setInfo] = React.useState(null);
  React.useEffect(() => {
    const fetch = async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const sb = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);
        const { data } = await sb.from('system_settings').select('*').single();
        setInfo(data);
      } catch { setInfo(null); }
    };
    fetch();
  }, []);
  const rows = [
    ['Application',       'GO2 eFB'],
    ['Version',           info?.app_version  || '2.0.0'],
    ['Build',             info?.app_build    || '2026.05'],
    ['EFB Administrator', info?.efb_admin    || 'GO2 Aviation'],
    ['Approved By',       info?.approved_by  || 'GO2 Aviation Safety Dept'],
    ['Last Config Check', info?.last_config_check ? new Date(info.last_config_check).toLocaleDateString('en-GB') : '—'],
    ['Regulation',        'EASA AMC 20-25A'],
    ['EFB Type',          'Portable — Type B'],
    ['Platform',          /iPad/.test(navigator.userAgent) ? 'iPad' : 'Browser'],
    ['Connectivity',      navigator.onLine ? '✓ Online' : '⚠ Offline'],
  ];
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div style={{ background:'#1a1a1a', border:'1px solid #383838', borderRadius:12, width:'min(360px, 92vw)', overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', borderBottom:'1px solid #383838', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#1a9bc4' }}>GO2 eFB</div>
            <div style={{ fontSize:10, color:'#555', marginTop:2 }}>Configuration — AMC 20-25 §7.11</div>
          </div>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20 }}>×</span>
        </div>
        <div>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #2a2a2a' }}>
              <span style={{ fontSize:11, color:'#666' }}>{label}</span>
              <span style={{ fontSize:11, color: value?.startsWith('✓') ? '#2d9e5f' : value?.startsWith('⚠') ? '#e8731a' : '#e8e8e8', fontWeight:600, fontFamily:'monospace' }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #383838' }}>
          <button onClick={onClose} style={{ width:'100%', background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:10, fontSize:13, color:'#e8e8e8', cursor:'pointer', fontFamily:'inherit' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, flightInfo, pageStatus, onEfbFailure, onAbout, open, onClose }) {
  return (
    <>
      {/* Overlay — sadece mobil/tablet açıkken */}
      {open && (
        <div
          onClick={onClose}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:98 }}
        />
      )}

      {/* Sidebar panel */}
      <div style={{
        width: 240,
        background: '#252525',
        borderRight: '1px solid #383838',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        // Mobil/tablet: absolute overlay, desktop: normal flow
        position: window.innerWidth < 900 ? 'fixed' : 'relative',
        top: window.innerWidth < 900 ? 44 : 'auto',  // top bar yüksekliği
        left: 0,
        bottom: 0,
        zIndex: 99,
        transform: window.innerWidth < 900 && !open ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.25s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'10px 14px 8px', borderBottom:'1px solid #383838', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', letterSpacing:1 }}>GO2 eFB</span>
          <span style={{ fontSize:10, color:'#555' }}>{flightInfo || ''}</span>
        </div>

        {/* Menu */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {menuItems.map(item => {
            const isActive   = activePage === item.id;
            const status     = pageStatus && pageStatus[item.id];
            const isGreen    = status === 'green';
            const isAmber    = status === 'amber';
            const phase      = PHASE[item.id] || { color:'#666', type:'tile' };
            const isTile     = phase.type === 'tile';
            const phaseColor = phase.color;

            const bg = isActive
              ? isTile ? phaseColor : `${phaseColor}15`
              : isGreen ? `${phaseColor}18`
              : isAmber ? `${phaseColor}12`
              : 'transparent';

            const borderLeft = isActive
              ? isTile ? `2px solid ${phaseColor}` : `3px solid ${phaseColor}`
              : isGreen ? '2px solid #2d9e5f'
              : isAmber ? '2px solid #ff9500'
              : '2px solid transparent';

            const textColor = isActive
              ? isTile ? '#fff' : phaseColor
              : isGreen ? '#4a9e72'
              : isAmber ? '#c47a2a'
              : '#777';

            const dotSize  = isGreen || isAmber ? 8 : 6;
            const dotColor = isGreen ? '#2d9e5f' : isAmber ? '#ff9500' : '#383838';

            return (
              <div key={item.id}
                onClick={() => { onNavigate(item.id); onClose(); }}
                style={{ display:'flex', alignItems:'center', padding:'13px 14px', gap:10, borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer', background:bg, borderLeft, transition:'background 0.15s' }}>
                <span style={{ fontSize:10, color: isActive ? 'rgba(255,255,255,0.7)' : '#555', width:16, textAlign:'center', fontWeight:700 }}>
                  {item.num}
                </span>
                <span style={{ fontSize:13, color:textColor, fontWeight: isActive || isGreen ? 600 : 400, flex:1 }}>
                  {item.label}
                </span>
                <span style={{ width:dotSize, height:dotSize, borderRadius:dotSize/2, flexShrink:0, background:dotColor, boxShadow: isGreen ? '0 0 5px rgba(45,158,95,0.6)' : isAmber ? '0 0 5px rgba(255,149,0,0.5)' : 'none' }} />
              </div>
            );
          })}

          {/* Free Note */}
          <div style={{ height:1, background:'#333', margin:'8px 14px' }} />
          <div
            onClick={() => { onNavigate('freenote'); onClose(); }}
            style={{ display:'flex', alignItems:'center', padding:'13px 14px', gap:10, borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer', background: activePage === 'freenote' ? '#666666' : 'transparent', borderLeft: activePage === 'freenote' ? '2px solid #666666' : '2px solid transparent' }}>
            <span style={{ fontSize:13, width:16, textAlign:'center' }}>✏</span>
            <span style={{ fontSize:13, color: activePage === 'freenote' ? '#fff' : '#666', fontWeight: activePage === 'freenote' ? 600 : 400, flex:1 }}>Free Note</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'8px 14px', borderTop:'1px solid #383838', background:'#1e1e1e' }}>
          <div style={{ fontSize:9, color:'#444', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:4 }}>ATC Route</div>
          <div style={{ fontSize:9, color:'#555', lineHeight:1.55, fontFamily:'monospace', marginBottom:8 }}>LTAC UMRUN G8 TOKER LTBA</div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={onEfbFailure} style={{ flex:1, background:'rgba(224,32,32,0.1)', border:'1px solid rgba(224,32,32,0.4)', borderRadius:6, padding:'7px 6px', fontSize:11, fontWeight:700, color:'#e02020', cursor:'pointer', fontFamily:'inherit' }}>
              🚨 EFB FAILURE
            </button>
            <button onClick={onAbout} style={{ width:36, background:'rgba(26,155,196,0.1)', border:'1px solid rgba(26,155,196,0.3)', borderRadius:6, fontSize:14, color:'#1a9bc4', cursor:'pointer' }}>
              ⓘ
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── LAYOUT ────────────────────────────────────────────────────
function Layout({ activePage, onNavigate, title, children, flightInfo, pageStatus }) {
  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [showEfbFailure, setShowEfbFailure] = useState(false);
  const [showAbout,      setShowAbout]      = useState(false);
  const [isMobile,       setIsMobile]       = useState(window.innerWidth < 900);

  useEffect(() => {
    const handle = () => {
      setIsMobile(window.innerWidth < 900);
      if (window.innerWidth >= 900) setSidebarOpen(false);
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  // Sayfa değişince sidebar kapat
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [activePage, isMobile]);

  const phase = PHASE[activePage] || { color:'#666', type:'tile' };

  const pageTitle = activePage === 'freenote'
    ? 'FREE NOTE'
    : activePage === 'rass'
    ? 'RASS — RISK ASSESSMENT'
    : activePage.replace(/-/g, ' ').toUpperCase();

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#1e1e1e' }}>
      {/* Top bar */}
      <div style={{ background:'#1a1a1a', borderBottom:'1px solid #383838', padding:'0 12px', height:44, display:'flex', alignItems:'center', gap:10, flexShrink:0, zIndex:100, position:'relative' }}>

        {/* Hamburger — sadece mobil/tablet */}
        {isMobile && (
          <button
            onClick={() => setSidebarOpen(o => !o)}
            style={{ width:36, height:36, background:'transparent', border:'1px solid #383838', borderRadius:6, color:'#aaa', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {sidebarOpen ? '✕' : '☰'}
          </button>
        )}

        {/* Back */}
        <span style={{ fontSize:14, color:'#1a9bc4', cursor:'pointer', flexShrink:0 }} onClick={() => onNavigate('dashboard')}>
          ‹ Plans
        </span>

        {/* Title */}
        <span style={{ flex:1, textAlign:'center', fontSize:12, fontWeight:600, color:'#e8e8e8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {title || 'GO2 eFB'}
        </span>

        <FontControls />
      </div>

      {/* Body */}
      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative' }}>
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
          flightInfo={flightInfo}
          pageStatus={pageStatus}
          onEfbFailure={() => setShowEfbFailure(true)}
          onAbout={() => setShowAbout(true)}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Content */}
        <div style={{ flex:1, background:'#242424', display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          {/* Page header */}
          <div style={{
            background: phase.type === 'tile' ? `${phase.color}22` : 'transparent',
            borderBottom: `2px solid ${phase.color}`,
            borderLeft: phase.type === 'border' ? `4px solid ${phase.color}` : 'none',
            padding:'10px 14px',
            fontSize:12, fontWeight:700,
            color: phase.color,
            letterSpacing:0.5, textTransform:'uppercase', flexShrink:0,
            display:'flex', alignItems:'center', gap:10,
          }}>
            {/* Aktif sayfa göstergesi — mobilde sidebar kapalıyken hangi sayfada olduğunu gösterir */}
            {isMobile && (
              <span style={{ fontSize:10, color: phase.color, opacity:0.7 }}>
                {menuItems.find(m => m.id === activePage)?.num || ''}
              </span>
            )}
            {pageTitle}
          </div>

          <div style={{ flex:1, overflowY:'auto' }}>
            {children}
          </div>
        </div>
      </div>

      {showEfbFailure && <EfbFailureModal onClose={() => setShowEfbFailure(false)} />}
      {showAbout      && <AboutEfbModal   onClose={() => setShowAbout(false)} />}
    </div>
  );
}

export default Layout;