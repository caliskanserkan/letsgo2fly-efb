import React, { useState, useEffect } from 'react';

const FONT_KEY  = 'efb_font_size';
const FONT_MIN  = 12;
const FONT_MAX  = 24;
const FONT_DEF  = 15;
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
        style={{ width:28, height:28, background:'#1e293b', border:'1px solid #334155', borderRadius:5, color:'#94a3b8', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, fontFamily:'inherit' }}>−</button>
      <span style={{ fontSize:11, color:'#475569', minWidth:22, textAlign:'center', fontFamily:'monospace' }}>{size}</span>
      <button onClick={() => change(+FONT_STEP)}
        style={{ width:28, height:28, background:'#1e293b', border:'1px solid #334155', borderRadius:5, color:'#94a3b8', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, fontFamily:'inherit' }}>+</button>
    </div>
  );
}

// ─── Module definitions ───────────────────────────────────────
const MODULES = [
  { id:'flt-crew',  num:'1',  label:'Flight & Crew',   icon:'👥', group:'pre',  color:'blue'  },
  { id:'mandatory', num:'2',  label:'Mandatory',        icon:'✅', group:'pre',  color:'blue'  },
  { id:'efp',       num:'3',  label:'eFP',              icon:'📋', group:'pre',  color:'blue'  },
  { id:'fuel',      num:'4',  label:'Fuel',             icon:'⛽', group:'pre',  color:'blue'  },
  { id:'rass',      num:'5',  label:'RASS',             icon:'🗺',  group:'pre',  color:'blue'  },
  { id:'accept',    num:'6',  label:'Accept & Sign',    icon:'✍️', group:'pre',  color:'red'   },
  { id:'takeoff',   num:'7',  label:'T/O Data',         icon:'🛫', group:'in',   color:'blue'  },
  { id:'navlog',    num:'8',  label:'Nav Log',          icon:'🛣',  group:'in',   color:'blue'  },
  { id:'landing',   num:'9',  label:'Lnd Data',         icon:'🛬', group:'in',   color:'blue'  },
  { id:'endflt',    num:'10', label:'End Flt',          icon:'🏁', group:'post', color:'green' },
  { id:'docupload', num:'11', label:'Doc Upload',       icon:'📤', group:'post', color:'blue'  },
];

const COLOR_MAP = {
  blue:  { border:'#38bdf8', text:'#38bdf8', bg:'rgba(56,189,248,0.12)', activeBorder:'2px solid #38bdf8' },
  red:   { border:'#ef4444', text:'#ef4444', bg:'rgba(239,68,68,0.1)',   activeBorder:'2px solid #ef4444' },
  green: { border:'#4ade80', text:'#4ade80', bg:'rgba(74,222,128,0.1)', activeBorder:'2px solid #4ade80' },
};

const GROUPS = [
  { key:'pre',  label:'Pre-flight' },
  { key:'in',   label:'In-flight'  },
  { key:'post', label:'Post-flight'},
];

// ─── EFB Failure Modal ────────────────────────────────────────
function EfbFailureModal({ onClose }) {
  const steps = [
    { phase:'IMMEDIATE ACTION', color:'#ef4444', items:[
      'Notify PIC — declare EFB unserviceable',
      'Switch to annotated local PDF copy of OFP if available on device',
      'If possible, request hardcopy OFP from operations/dispatch',
      'Do NOT continue using partially failed or suspect EFB data',
      'Cross-check all critical data (fuel, performance) against backup source',
    ]},
    { phase:'IN FLIGHT — CONTINGENCY', color:'#f97316', items:[
      'Use aircraft certified navigation systems (FMS/RNAV) — not EFB GPS',
      'Request latest WXR/ATIS from ATC if EFB weather data unavailable',
      'Use published paper charts or ATC clearance for approach procedures',
      'Annotate paper backup with any changes made during flight',
      'Inform dispatch/operations of EFB failure and contingency in use',
      'Document all deviations from planned OFP on paper backup',
    ]},
    { phase:'POST-FLIGHT — RECONCILIATION', color:'#38bdf8', items:[
      'Compare paper backup annotations against EFB/system records',
      'Enter any discrepancies into official system (reconciliation)',
      'Log EFB failure event in discrepancy/event log',
      'Report failure to EFB administrator per AMC 20-25 §7.12',
      'Do not clear event log — retain for audit trail',
    ]},
    { phase:'ON GROUND — BEFORE NEXT DISPATCH', color:'#fbbf24', items:[
      'Do not dispatch with failed EFB unless MEL permits and paper backup is on board',
      'Contact GO2 operations for replacement device if required',
      'Ensure EFB failure is recorded in tech log with time and description',
      'EFB administrator to investigate and document root cause',
    ]},
    { phase:'BACKUP SOURCES', color:'#4ade80', items:[
      'OFP: Local annotated PDF → hardcopy from dispatch',
      'WXR: ACARS / ATC / ATIS / VOLMET',
      'NOTAM: Paper NOTAMs from pre-flight dispatch package',
      'Charts: Published Jeppesen / ICAO paper charts',
      'Performance: Paper AFM, QRH, or published performance tables',
    ]},
  ];
  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div style={{ background:'#0f172a', border:'2px solid #ef4444', borderRadius:12, width:'min(460px,92vw)', maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div style={{ background:'rgba(239,68,68,0.1)', padding:'14px 16px', borderBottom:'1px solid #ef4444', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:22 }}>🚨</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#ef4444' }}>EFB FAILURE PROCEDURE</div>
              <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>AMC 20-25 §7.12 — Contingency & Backup</div>
            </div>
          </div>
          <span onClick={onClose} style={{ color:'#475569', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</span>
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
                    <span style={{ fontSize:12, color:'#94a3b8', lineHeight:1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ padding:'10px 12px', borderRadius:6, background:'rgba(56,189,248,0.08)', borderLeft:'3px solid #38bdf8', fontSize:11, color:'#7dd3fc', lineHeight:1.7 }}>
            Per EASA AMC 20-25, operators must maintain backup means whenever EFB is used as primary information source.
          </div>
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #1e293b', flexShrink:0 }}>
          <button onClick={onClose} style={{ width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:11, fontSize:13, fontWeight:700, color:'#f1f5f9', cursor:'pointer', fontFamily:'inherit' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── About Modal ──────────────────────────────────────────────
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
      <div style={{ background:'#0f172a', border:'1px solid #334155', borderRadius:12, width:'min(360px,92vw)', overflow:'hidden' }}>
        <div style={{ background:'#1e293b', borderBottom:'1px solid #334155', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#38bdf8' }}>GO2 eFB</div>
            <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>Configuration — AMC 20-25 §7.11</div>
          </div>
          <span onClick={onClose} style={{ color:'#475569', cursor:'pointer', fontSize:20 }}>×</span>
        </div>
        <div>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 16px', borderBottom:'1px solid #1e293b' }}>
              <span style={{ fontSize:11, color:'#475569' }}>{label}</span>
              <span style={{ fontSize:11, color: value?.startsWith('✓') ? '#4ade80' : value?.startsWith('⚠') ? '#fbbf24' : '#f1f5f9', fontWeight:600, fontFamily:'monospace' }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ padding:'12px 16px', borderTop:'1px solid #1e293b' }}>
          <button onClick={onClose} style={{ width:'100%', background:'#1e293b', border:'1px solid #334155', borderRadius:8, padding:10, fontSize:13, color:'#f1f5f9', cursor:'pointer', fontFamily:'inherit' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, flightInfo, pageStatus, onEfbFailure, onAbout, open, onClose }) {
  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:98 }} />
      )}
      <div style={{
        width: 160,
        background: '#1e293b',
        borderRight: '1px solid #334155',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden',
        position: window.innerWidth < 900 ? 'fixed' : 'relative',
        top: window.innerWidth < 900 ? 44 : 'auto',
        left: 0,
        bottom: 0,
        zIndex: 99,
        transform: window.innerWidth < 900 && !open ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.25s ease',
      }}>
        {/* Header */}
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #334155', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#38bdf8', letterSpacing:1 }}>GO2 eFB</span>
          <span style={{ fontSize:9, color:'#334155' }}>{flightInfo || ''}</span>
        </div>

        {/* Module list */}
        <div style={{ flex:1, overflowY:'auto', padding:'8px 6px' }}
          className="efb-sidebar-scroll">
          <style>{`
            .efb-sidebar-scroll::-webkit-scrollbar { width: 3px; }
            .efb-sidebar-scroll::-webkit-scrollbar-track { background: #0f172a; }
            .efb-sidebar-scroll::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
            .efb-sidebar-scroll::-webkit-scrollbar-thumb:hover { background: #38bdf8; }
          `}</style>

          {GROUPS.map(group => (
            <div key={group.key}>
              <div style={{ fontSize:8, color:'#475569', letterSpacing:'1.5px', padding:'4px 4px 3px', textTransform:'uppercase' }}>
                {group.label}
              </div>
              {MODULES.filter(m => m.group === group.key).map(item => {
                const isActive = activePage === item.id;
                const status   = pageStatus?.[item.id];
                const isGreen  = status === 'green';
                const isAmber  = status === 'amber';
                const c        = COLOR_MAP[item.color];

                return (
                  <div key={item.id}
                    onClick={() => { onNavigate(item.id); onClose(); }}
                    style={{
                      border: isActive ? c.activeBorder : `1.5px solid ${c.border}`,
                      background: isActive ? c.bg : 'transparent',
                      borderRadius: 8,
                      padding: '7px 10px',
                      marginBottom: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      opacity: isActive ? 1 : 0.45,
                      transition: 'opacity 0.15s',
                    }}>
                    <span style={{ fontSize:16, flexShrink:0 }}>{item.icon}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:10, color: c.text, fontWeight: isActive ? 600 : 400, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {item.label}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                        <div style={{ width:5, height:5, borderRadius:'50%', background: isGreen ? '#4ade80' : isAmber ? '#fbbf24' : '#334155' }} />
                        {isGreen && <span style={{ fontSize:8, color:'#4ade80' }}>Done</span>}
                        {isAmber && <span style={{ fontSize:8, color:'#fbbf24' }}>Pending</span>}
                        {isActive && !isGreen && !isAmber && <span style={{ fontSize:8, color: c.text, opacity:0.7 }}>Active</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Free Note */}
          <div style={{ height:1, background:'#1e293b', margin:'6px 4px' }} />
          <div
            onClick={() => { onNavigate('freenote'); onClose(); }}
            style={{
              border: activePage === 'freenote' ? '2px solid #38bdf8' : '1.5px solid #38bdf8',
              background: activePage === 'freenote' ? 'rgba(56,189,248,0.12)' : 'transparent',
              borderRadius: 8,
              padding: '7px 10px',
              marginBottom: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              opacity: activePage === 'freenote' ? 1 : 0.45,
            }}>
            <span style={{ fontSize:16 }}>✏️</span>
            <div style={{ fontSize:10, color:'#38bdf8', fontWeight: activePage === 'freenote' ? 600 : 400 }}>Free Note</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'8px 8px', borderTop:'1px solid #334155', background:'#0f172a' }}>
          <div style={{ fontSize:8, color:'#334155', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:3 }}>ATC Route</div>
          <div style={{ fontSize:8, color:'#475569', lineHeight:1.55, fontFamily:'monospace', marginBottom:8 }}>LTAC UMRUN G8 TOKER LTBA</div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={onEfbFailure}
              style={{ flex:1, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:6, padding:'6px 4px', fontSize:9, fontWeight:700, color:'#ef4444', cursor:'pointer', fontFamily:'inherit' }}>
              🚨 EFB FAIL
            </button>
            <button onClick={onAbout}
              style={{ width:32, background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:6, fontSize:14, color:'#38bdf8', cursor:'pointer' }}>
              ⓘ
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Layout ───────────────────────────────────────────────────
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

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [activePage, isMobile]);

  const activeModule = MODULES.find(m => m.id === activePage);
  const moduleColor  = activeModule ? COLOR_MAP[activeModule.color] : COLOR_MAP.blue;

  const pageTitle = activePage === 'freenote'
    ? 'Free Note'
    : activeModule?.label || activePage.replace(/-/g, ' ');

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#0f172a' }}>
      {/* Top bar */}
      <div style={{ background:'#1e293b', borderBottom:'1px solid #334155', padding:'0 12px', height:44, display:'flex', alignItems:'center', gap:10, flexShrink:0, zIndex:100 }}>
        {isMobile && (
          <button onClick={() => setSidebarOpen(o => !o)}
            style={{ width:34, height:34, background:'transparent', border:'1px solid #334155', borderRadius:6, color:'#94a3b8', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            {sidebarOpen ? '✕' : '☰'}
          </button>
        )}
        <span style={{ fontSize:14, color:'#38bdf8', cursor:'pointer', flexShrink:0 }} onClick={() => onNavigate('dashboard')}>
          ← Plans
        </span>
        <span style={{ flex:1, textAlign:'center', fontSize:12, fontWeight:500, color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
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
        <div style={{ flex:1, background:'#0f172a', display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          {/* Page header */}
          <div style={{
            background: `${moduleColor.border}15`,
            borderBottom: `2px solid ${moduleColor.border}`,
            padding:'10px 16px',
            fontSize:11, fontWeight:600,
            color: moduleColor.text,
            letterSpacing:'1.5px', textTransform:'uppercase', flexShrink:0,
            display:'flex', alignItems:'center', gap:8,
          }}>
            {activeModule?.icon && <span style={{ fontSize:14 }}>{activeModule.icon}</span>}
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