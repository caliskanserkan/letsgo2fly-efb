// App.test.js — UYGULAMA ACILIS (SMOKE) TESTI
//
// Bu dosya once CRA'nin kutudan cikan ornegiydi ("renders learn react link")
// ve boyle bir link olmadigi icin AYLARDIR KIRMIZIYDI — kimse fark etmemisti.
// Kirik bir test, test olmamasindan kotudur: paket ciktisinda surekli "1 failed"
// yazar, goz alisir ve GERCEK bir kirilma da ayni satirin icinde kaybolur.
//
// Yerine gercek soruyu soruyoruz: oturum yokken uygulama GIRIS EKRANINI
// cizebiliyor mu? Bir hook sirasi bozulursa, bir import kirilirsa burada patlar.
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Harita bileseni testte devre disi: leaflet/react-leaflet saf ESM'dir ve CRA'nin
// jest ayari node_modules'u cevirmez. Giris ekrani testinin haritaya ihtiyaci yok.
jest.mock('./components/EnrouteMap', () => ({ __esModule: true, default: () => null }));

// 🔑 onAuthStateChange geri cagirmasi ANINDA donmeli — App.js'teki 10 Agu notu:
//    supabase-js v2'de bu geri cagirma auth kilidinin icinde kosar.
jest.mock('./supabaseClient', () => {
  const zincir = () => {
    const o = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'single']) o[m] = () => o;
    o.then = (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej);
    return o;
  };
  return {
    supabase: {
      from: zincir,
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () => Promise.resolve({ error: null }),
        signOut: () => Promise.resolve({}),
        getUser: () => Promise.resolve({ data: { user: null } }),
      },
    },
    logEvent: () => Promise.resolve(),
  };
});

test('oturum yokken GIRIS EKRANI cizilir', async () => {
  render(<App />);
  expect(await screen.findByPlaceholderText('pilot@company.com')).toBeInTheDocument();
});
