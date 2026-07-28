// ThemeToggle.js — gün/gece tema anahtarı (iOS'taki temaya paralel)
// Tema kökteki data-theme attribute'u ile uygulanır; efb_theme'de saklanır.
import React, { useState } from 'react';

const THEME_KEY = 'efb_theme';

export function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark';
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark');

  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      style={{
        width: 34, height: 30, background: 'transparent',
        border: '1px solid var(--border)', borderRadius: 6,
        color: 'var(--t2)', fontSize: 14, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'inherit', flexShrink: 0,
      }}>
      {theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
