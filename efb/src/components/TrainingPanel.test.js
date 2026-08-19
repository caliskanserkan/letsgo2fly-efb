// TrainingPanel.test.js — BILESEN RENDER TESTI
//
// 🔴 BU DOSYANIN VARLIK SEBEBI: 19 Agu 2026'da TRAINING sekmesi CANLIDA hic
//    acilmadi. Sebep bir React hook'unun erken return'un altina konmasiydi.
//    O sirada 62 test YESILDI ve `npm run build` "Compiled successfully" dedi —
//    cunku butun testler saf mantigi (TrainingRules) olcuyordu, EKRANI degil.
//    Serkan kusuru uretimde buldu.
//
// Bu test bileseni gercekten cizer. Hook sirasi bozulursa, bir alan tanimsiz
// kalirsa, liste bos gelirse BURADA patlar — canlida degil.
//
// Tarihler BUGUNE GORE uretilir; sabit tarih yazilsaydi test zamanla curur.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { addDays, todayLocal } from './TrainingRules';
import { __veri } from '../supabaseClient';
import TrainingPanel from './TrainingPanel';

// Supabase yerine zincirlenebilir sahte istemci: .select().eq().order()... hepsi
// kendini dondurur, await edilince { data, error } verir.
jest.mock('../supabaseClient', () => {
  const veri = { __hata: false };
  const zincir = (tablo) => {
    const o = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'insert', 'update', 'single']) {
      o[m] = () => o;
    }
    o.then = (res, rej) => Promise.resolve(
      veri.__hata
        ? { data: null, error: { message: 'RLS DENIED' } }
        : { data: veri[tablo] || [], error: null }
    ).then(res, rej);
    return o;
  };
  return { supabase: { from: zincir }, __veri: veri };
});

const PILOTLAR = [{ id: 'p1', code: 'AAK', full_name: 'A A KAPTAN', role: 'pilot' }];

// AAK'nin 19 Agu 2026'da uretimden cikan gercek durumu: ayni kayit iki kez
// girilmis, GERCEK EN YENI kontrol 'superseded' damgasiyla duruyor.
const bugun     = todayLocal();
const eskiBitis = addDays(bugun, 70);    // eski kaydin bitisi
const yeniBitis = addDays(bugun, 300);   // GERCEK en yeni kaydin bitisi

beforeEach(() => {
  __veri.__hata = false;
  __veri.training_catalog = [{
    id: 'c1', code: 'LC', name: 'Line check', anchor_rule: 'END_OF_MONTH',
    default_validity_months: 12, legal_reference: 'ORO.FC.230 (c)(1)',
    active: true, sort_order: 20, source: 'REGULATION',
  }];
  __veri.pilot_trainings = [
    { id: 't1', pilot_id: 'p1', training_code: 'LC', completed_date: addDays(bugun, -500),
      expires_at: eskiBitis, status: 'current',    created_at: '2026-08-18T10:00:00Z',
      applied_rule: 'END_OF_MONTH', validity_months: 12 },
    { id: 't2', pilot_id: 'p1', training_code: 'LC', completed_date: addDays(bugun, -500),
      expires_at: eskiBitis, status: 'superseded', created_at: '2026-08-17T10:00:00Z',
      applied_rule: 'END_OF_MONTH', validity_months: 12 },
    { id: 't3', pilot_id: 'p1', training_code: 'LC', completed_date: addDays(bugun, -100),
      expires_at: yeniBitis, status: 'superseded', created_at: '2026-08-17T11:00:00Z',
      applied_rule: 'END_OF_MONTH', validity_months: 12 },
  ];
  __veri.training_changes = [];
});

describe('TRAINING sekmesi CIZILIYOR mu', () => {
  // 19 Agu kusuru burada patlardi: hook sirasi bozuksa render coker.
  test('ekran aciliyor ve pilot satiri gorunuyor', async () => {
    render(<TrainingPanel pilots={PILOTLAR} customerId="c1" myProfile={{ id: 'u1' }} />);
    expect(await screen.findByText(/Training — validity/i)).toBeInTheDocument();
    expect(screen.getByText(/AAK — A A KAPTAN/)).toBeInTheDocument();
  });

  // Kronolojik kural EKRAN SEVIYESINDE de kilitli: motor dogru hesaplasa bile
  // panel yanlis satiri gosterirse burada yakalanir.
  test('EN SON TARIHLI kaydin bitisi gorunur, eski kayit gorunmez', async () => {
    render(<TrainingPanel pilots={PILOTLAR} customerId="c1" myProfile={{ id: 'u1' }} />);
    expect(await screen.findByText(yeniBitis)).toBeInTheDocument();
    expect(screen.queryByText(eskiBitis)).not.toBeInTheDocument();
  });

  test('katalog bos gelirse SESSIZ KALMAZ — goc uyarisi cikar', async () => {
    __veri.training_catalog = [];
    render(<TrainingPanel pilots={PILOTLAR} customerId="c1" myProfile={{ id: 'u1' }} />);
    expect(await screen.findByText(/NO TRAINING CATALOG/i)).toBeInTheDocument();
  });
});
