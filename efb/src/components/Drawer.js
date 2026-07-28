// Drawer.js — sağdan İÇERİĞİN ÜSTÜNE kayan detay paneli.
// Eski DetailPanel'in aksine listeyi sıkıştırmaz; ESC / backdrop / ✕ ile kapanır.
import React, { useEffect } from 'react';

export default function Drawer({ title, subtitle, onClose, width = 640, footer, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" style={{ width: `min(${width}px, 100vw)` }} role="dialog" aria-modal="true">
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)', fontFamily: 'var(--mono)', letterSpacing: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {title}
            </div>
            {subtitle && (
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {subtitle}
              </div>
            )}
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--t2)', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ✕
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0, background: 'var(--bg3)' }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
