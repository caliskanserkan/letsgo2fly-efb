import React from 'react';

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

function Sidebar({ activePage, onNavigate, flightInfo, pageStatus }) {
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
        <span style={{ fontSize: 11, fontWeight: 700, color: '#1a9bc4', letterSpacing: 1 }}>
          GO2 eFB
        </span>
        <span style={{ fontSize: 10, color: '#555' }}>
          {flightInfo || 'LTAC → LTBA'}
        </span>
      </div>

      {/* Menu */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {menuItems.map(item => {
          const isActive  = activePage === item.id;
          const status    = pageStatus && pageStatus[item.id];
          const isGreen   = status === 'green';
          const isAmber   = status === 'amber';

          // Metin rengi: active → teal, green → yeşil ton, amber → turuncu ton, diğer → gri
          const textColor = isActive ? '#1a9bc4'
                          : isGreen  ? '#4a9e72'
                          : isAmber  ? '#c47a2a'
                          : '#777';

          // Sol border: active → teal, green → yeşil, amber → turuncu, diğer → şeffaf
          const leftBorder = isActive ? '2px solid #1a9bc4'
                           : isGreen  ? '2px solid #2d9e5f'
                           : isAmber  ? '2px solid #ff9500'
                           : '2px solid transparent';

          // Arka plan: active → teal tint, green → çok hafif yeşil, amber → çok hafif turuncu
          const bg = isActive ? 'rgba(26,155,196,0.12)'
                   : isGreen  ? 'rgba(45,158,95,0.06)'
                   : isAmber  ? 'rgba(255,149,0,0.05)'
                   : 'transparent';

          // Dot boyutu: green/amber → 8px, pending → 6px
          const dotSize   = isGreen || isAmber ? 8 : 6;
          const dotColor  = isGreen ? '#2d9e5f' : isAmber ? '#ff9500' : '#383838';

          return (
            <div key={item.id} onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 14px', gap: 10,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                background: bg,
                borderLeft: leftBorder,
              }}>
              <span style={{ fontSize: 10, color: isActive ? '#1a9bc4' : '#555', width: 16, textAlign: 'center', fontWeight: 700 }}>
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

        {/* Free Note — separated */}
        <div style={{ height: 1, background: '#333', margin: '8px 14px' }} />
        <div onClick={() => onNavigate('freenote')}
          style={{
            display: 'flex', alignItems: 'center',
            padding: '11px 14px', gap: 10,
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            cursor: 'pointer',
            background: activePage === 'freenote' ? 'rgba(26,155,196,0.12)' : 'transparent',
            borderLeft: activePage === 'freenote' ? '2px solid #1a9bc4' : '2px solid transparent',
          }}>
          <span style={{ fontSize: 13, width: 16, textAlign: 'center' }}>✏</span>
          <span style={{ fontSize: 12.5, color: activePage === 'freenote' ? '#1a9bc4' : '#666', fontWeight: activePage === 'freenote' ? 600 : 400, flex: 1 }}>
            Free Note
          </span>
        </div>
      </div>

      {/* ATC Route */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid #383838', background: '#1e1e1e' }}>
        <div style={{ fontSize: 9, color: '#444', fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
          ATC Route
        </div>
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.55, fontFamily: 'monospace' }}>
          LTAC UMRUN G8 TOKER LTBA
        </div>
      </div>
    </div>
  );
}

function Layout({ activePage, onNavigate, title, children, flightInfo, pageStatus }) {
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
        <Sidebar activePage={activePage} onNavigate={onNavigate} flightInfo={flightInfo} pageStatus={pageStatus} />
        <div style={{ flex: 1, background: '#242424', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ background: '#1f1f1f', borderBottom: '1px solid #383838', padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#999', letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 0 }}>
            {activePage === 'freenote' ? 'FREE NOTE' : activePage.replace(/-/g, ' ').toUpperCase()}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Layout;