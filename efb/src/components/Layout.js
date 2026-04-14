import React from 'react';

const menuItems = [
  { id: 'flt-crew',  num: '1',  label: 'Flight & Crew',        dot: 'green'  },
  { id: 'mandatory', num: '2',  label: 'Mandatory / Preflight', dot: 'green'  },
  { id: 'efp',       num: '3',  label: 'eFP',                   dot: 'gray'   },
  { id: 'fuel',      num: '4',  label: 'FUEL',                  dot: 'orange' },
  { id: 'accept',    num: '5',  label: 'Accept & Sign',         dot: 'green'  },
  { id: 'takeoff',   num: '6',  label: 'T/O Data',              dot: 'gray'   },
  { id: 'navlog',    num: '7',  label: 'NAV LOG',               dot: 'accent' },
  { id: 'landing',   num: '8',  label: 'LND Data',              dot: 'gray'   },
  { id: 'endflt',    num: '9',  label: 'END FLT',               dot: 'red'    },
  { id: 'docupload', num: '10', label: 'DOC UPLOAD',            dot: 'gray'   },
];

const dotColors = {
  green:  '#2d9e5f',
  orange: '#e8731a',
  red:    '#e02020',
  accent: '#1a9bc4',
  gray:   '#444444',
};

function Sidebar({ activePage, onNavigate, flightInfo }) {
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
          const isActive = activePage === item.id;
          return (
            <div
              key={item.id}
              onClick={() => onNavigate(item.id)}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '11px 14px', gap: 10,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                background: isActive ? 'rgba(26,155,196,0.12)' : 'transparent',
                borderLeft: isActive ? '2px solid #1a9bc4' : '2px solid transparent',
              }}
            >
              <span style={{
                fontSize: 10, color: isActive ? '#1a9bc4' : '#555',
                width: 16, textAlign: 'center', fontWeight: 700
              }}>
                {item.num}
              </span>
              <span style={{
                fontSize: 12.5,
                color: isActive ? '#1a9bc4' : '#999',
                fontWeight: isActive ? 600 : 400,
                flex: 1
              }}>
                {item.label}
              </span>
              <span style={{
                width: 6, height: 6, borderRadius: 3,
                background: dotColors[item.dot] || '#444',
                flexShrink: 0
              }} />
            </div>
          );
        })}
      </div>

      {/* ATC Route */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid #383838',
        background: '#1e1e1e'
      }}>
        <div style={{ fontSize: 9, color: '#444', fontWeight: 700,
          letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
          ATC Route
        </div>
        <div style={{ fontSize: 9, color: '#555', lineHeight: 1.55, fontFamily: 'monospace' }}>
          LTAC UMRUN G8 TOKER LTBA
        </div>
      </div>
    </div>
  );
}

function Layout({ activePage, onNavigate, title, children, flightInfo }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#1e1e1e' }}>
      {/* Top bar */}
      <div style={{
        background: '#1a1a1a', borderBottom: '1px solid #383838',
        padding: '0 16px', height: 44,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
      }}>
        <span style={{ fontSize: 14, color: '#1a9bc4', cursor: 'pointer' }}
          onClick={() => onNavigate('dashboard')}>
          ‹ Plans
        </span>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 13,
          fontWeight: 600, color: '#e8e8e8' }}>
          {title || 'GO2TCREC · LTAC-LTBA · 11 APR 09:00 Z'}
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
          flightInfo={flightInfo}
        />
        {/* Right panel */}
        <div style={{ flex: 1, background: '#242424',
          display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Panel header */}
          <div style={{
            background: '#1f1f1f', borderBottom: '1px solid #383838',
            padding: '10px 16px', fontSize: 12, fontWeight: 600,
            color: '#999', letterSpacing: 0.5, textTransform: 'uppercase',
            flexShrink: 0
          }}>
            {activePage.replace(/-/g, ' ').toUpperCase()}
          </div>
          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Layout;