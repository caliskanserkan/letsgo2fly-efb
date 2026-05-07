import React, { useState } from 'react';

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
};

const menuItems = [
  { id: 'flt-crew',  num: '1',  label: 'Flight & Crew'        },
  { id: 'mandatory', num: '2',  label: 'Mandatory / Preflight' },
  { id: 'efp',       num: '3',  label: 'eFP'                   },
  { id: 'fuel',      num: '4',  label: 'FUEL'                  },
  { id: 'accept',    num: '5',  label: 'Accept & Sign'         },
  { id: 'takeoff',   num: '6',  label: 'T/O Data'              },
  { id: 'navlog',    num: '7',  label: 'NAV LOG'               },
  { id: 'landing',   num: '8',  label: 'LND Data'              },
  { id: 'endflt',    num: '9',  label: 'END FLT'               },
  { id: 'docupload', num: '10', label: 'DOC UPLOAD'            },
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
      <div style={{ background:'#1a1a1a', border:'2px solid #e02020', borderRadius:12, width:460, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {/* Header */}
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

        {/* Content */}
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
            Per EASA AMC 20-25, operators must maintain backup means whenever EFB is used as primary information source. Post-flight reconciliation and event logging are mandatory for audit trail compliance.
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 16px', borderTop:'1px solid #383838', flexShrink:0 }}>
          <button onClick={onClose}
            style={{ width:'100%', background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:11, fontSize:13, fontWeight:700, color:'#e8e8e8', cursor:'pointer', fontFamily:'inherit' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SIDEBAR ───────────────────────────────────────────────────
function Sidebar({ activePage, onNavigate, flightInfo, pageStatus, onEfbFailure }) {
  return (
    <div style={{
      width: 240, background: '#252525',
      borderRight: '1px solid #383838',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px 8px',
        borderBottom: '1px solid #383838',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1a9bc4', letterSpacing: 1 }}>GO2 eFB</span>
        <span style={{ fontSize: 10, color: '#555' }}>{flightInfo || 'LTAC → LTBA'}</span>
      </div>

      {/* Menu */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {menuItems.map(item => {
          const isActive   = activePage === item.id;
          const status     = pageStatus && pageStatus[item.id];
          const isGreen    = status === 'green';
          const isAmber    = status === 'amber';
          const phase      = PHASE[item.id] || { color: '#666', type: 'tile' };
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

          const numColor = isActive
            ? isTile ? 'rgba(255,255,255,0.7)' : phaseColor
            : '#555';

          const dotSize  = isGreen || isAmber ? 8 : 6;
          const dotColor = isGreen ? '#2d9e5f' : isAmber ? '#ff9500' : '#383838';

          return (
            <div key={item.id} onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 14px', gap: 10,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                background: bg,
                borderLeft,
                transition: 'background 0.15s',
              }}>
              <span style={{ fontSize: 10, color: numColor, width: 16, textAlign: 'center', fontWeight: 700 }}>
                {item.num}
              </span>
              <span style={{ fontSize: 12.5, color: textColor, fontWeight: isActive || isGreen ? 600 : 400, flex: 1 }}>
                {item.label}
              </span>
              <span style={{
                width: dotSize, height: dotSize,
                borderRadius: dotSize / 2,
                flexShrink: 0,
                background: dotColor,
                boxShadow: isGreen ? '0 0 5px rgba(45,158,95,0.6)'
                          : isAmber ? '0 0 5px rgba(255,149,0,0.5)'
                          : 'none',
              }} />
            </div>
          );
        })}

        {/* Free Note */}
        <div style={{ height: 1, background: '#333', margin: '8px 14px' }} />
        <div onClick={() => onNavigate('freenote')}
          style={{
            display: 'flex', alignItems: 'center',
            padding: '11px 14px', gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            cursor: 'pointer',
            background: activePage === 'freenote' ? '#666666' : 'transparent',
            borderLeft: activePage === 'freenote' ? '2px solid #666666' : '2px solid transparent',
          }}>
          <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>✏</span>
          <span style={{ fontSize: 12.5, color: activePage === 'freenote' ? '#fff' : '#666', fontWeight: activePage === 'freenote' ? 600 : 400, flex: 1 }}>
            Free Note
          </span>
        </div>
      </div>

      {/* ATC Route */}
      <div style={{ padding: '8px 14px', borderTop: '1px solid #383838', background: '#1e1e1e' }}>
        <div style={{ fontSize: 9, color: '#444', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
          ATC Route
        </div>
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.55, fontFamily: 'monospace', marginBottom: 8 }}>
          LTAC UMRUN G8 TOKER LTBA
        </div>

        {/* EFB FAILURE butonu — her zaman erişilebilir */}
        <button onClick={onEfbFailure}
          style={{ width:'100%', background:'rgba(224,32,32,0.1)', border:'1px solid rgba(224,32,32,0.4)', borderRadius:6, padding:'7px 10px', fontSize:11, fontWeight:700, color:'#e02020', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          🚨 EFB FAILURE
        </button>
      </div>
    </div>
  );
}

// ── LAYOUT ────────────────────────────────────────────────────
function Layout({ activePage, onNavigate, title, children, flightInfo, pageStatus }) {
  const [showEfbFailure, setShowEfbFailure] = useState(false);
  const phase = PHASE[activePage] || { color: '#666', type: 'tile' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#1e1e1e' }}>
      {/* Top bar */}
      <div style={{
        background: '#1a1a1a', borderBottom: '1px solid #383838',
        padding: '0 16px', height: 44,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
      }}>
        <span style={{ fontSize: 14, color: '#1a9bc4', cursor: 'pointer' }} onClick={() => onNavigate('dashboard')}>
          ‹ Plans
        </span>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>
          {title || 'GO2TCREC · LTAC-LTBA · 11 APR 09:00 Z'}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
          flightInfo={flightInfo}
          pageStatus={pageStatus}
          onEfbFailure={() => setShowEfbFailure(true)}
        />
        <div style={{ flex: 1, background: '#242424', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Page header */}
          <div style={{
            background: phase.type === 'tile' ? `${phase.color}22` : 'transparent',
            borderBottom: `2px solid ${phase.color}`,
            borderLeft: phase.type === 'border' ? `4px solid ${phase.color}` : 'none',
            padding: '10px 16px',
            fontSize: 12, fontWeight: 700,
            color: phase.color,
            letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0
          }}>
            {activePage === 'freenote' ? 'FREE NOTE' : activePage.replace(/-/g, ' ').toUpperCase()}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {children}
          </div>
        </div>
      </div>

      {/* EFB Failure Modal */}
      {showEfbFailure && <EfbFailureModal onClose={() => setShowEfbFailure(false)} />}
    </div>
  );
}

export default Layout;