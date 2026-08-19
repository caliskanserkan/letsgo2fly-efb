// NotificationBell.test.js — CAN RENDER TESTI
//
// Serkan'in 19 Agu spesifikasyonu burada EKRAN SEVIYESINDE kilitlenir:
//   · "3 egitim var, 50 gun / 43 gun / 5 gun -> can KIRMIZI olmasi lazim"
//   · "tiklayinca egitimler ayri ayri kendi renk kodlarinda gorunur"
//   · "en yuksek oncelik rengi belirler"
//   · "kopma olursa ring bell uzerine cross line olsun (not avail)"
//
// Motor testi (TrainingRules.test.js) bu kurallarin HESABINI dogruluyor; bu
// dosya EKRANA dogru basildigini dogruluyor. Ikisi ayri sorulardir — 19 Agu'da
// hesap dogruydu ama ekran hic acilmiyordu.
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { addDays, todayLocal, STATE_COLOR } from './TrainingRules';
import { __veri } from '../supabaseClient';
import NotificationBell from './NotificationBell';

jest.mock('../supabaseClient', () => {
  const veri = { __hata: false };
  const zincir = (tablo) => {
    const o = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in']) o[m] = () => o;
    o.then = (res, rej) => Promise.resolve(
      veri.__hata
        ? { data: null, error: { message: 'RLS DENIED' } }
        : { data: veri[tablo] || [], error: null }
    ).then(res, rej);
    return o;
  };
  return { supabase: { from: zincir }, __veri: veri };
});

const bugun = todayLocal();
const kayit = (id, kod, gun) => ({
  id, pilot_id: 'p1', training_code: kod,
  completed_date: addDays(bugun, -300),
  expires_at: addDays(bugun, gun),
  created_at: '2026-08-01T00:00:00Z',
});

beforeEach(() => {
  __veri.__hata = false;
  __veri.profiles = [{ id: 'p1', code: 'SCL', full_name: 'SERKAN CALISKAN' }];
  __veri.training_catalog = [
    { code: 'SEC', name: 'Aviation security' },
    { code: 'DG',  name: 'Dangerous goods' },
    { code: 'OPC', name: 'Operator proficiency check' },
  ];
  // SERKAN'IN ORNEGI: 50 gun · 43 gun · 5 gun
  __veri.pilot_trainings = [kayit('a', 'SEC', 50), kayit('b', 'DG', 43), kayit('c', 'OPC', 5)];
});

describe('Can CIZILIYOR mu ve dogru rengi mi yakiyor', () => {
  test('50g + 43g + 5g -> sayac 3, can KIRMIZI (en yuksek oncelik)', async () => {
    render(<NotificationBell />);
    const btn = await screen.findByTitle(/3 training alert/i);
    expect(within(btn).getByText('3')).toBeInTheDocument();
    // "En yuksek oncelik rengi belirler": iki NOTICE + bir CRITICAL -> CRITICAL.
    // Renk STATE_COLOR'dan turer; can kendi renk karari VERMEZ.
    expect(btn).toHaveAttribute('data-durum', 'CRITICAL');
    expect(STATE_COLOR.CRITICAL).toBe('var(--red)');
  });

  test('hepsi 60-30 araligindaysa can SARI kalir — kirmizi uydurulmaz', async () => {
    __veri.pilot_trainings = [kayit('a', 'SEC', 50), kayit('b', 'DG', 43)];
    render(<NotificationBell />);
    const btn = await screen.findByTitle(/2 training alert/i);
    expect(btn).toHaveAttribute('data-durum', 'NOTICE');
    expect(STATE_COLOR.NOTICE).toBe('var(--yellow)');
  });

  test('tiklayinca her egitim KENDI renginde, en acil en ustte', async () => {
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button'));

    expect(screen.getByText(/OPC will expire within 5 days/)).toBeInTheDocument();
    expect(screen.getByText(/DG will expire within 43 days/)).toBeInTheDocument();
    expect(screen.getByText(/SEC will expire within 50 days/)).toBeInTheDocument();

    // ONCELIK SIRASI: 5 gun (kirmizi) once, sonra 43, sonra 50.
    const satirlar = screen.getAllByText(/will expire within/).map(e => e.textContent);
    expect(satirlar[0]).toMatch(/5 days/);
    expect(satirlar[1]).toMatch(/43 days/);
    expect(satirlar[2]).toMatch(/50 days/);

    // HER EGITIM KENDI KADEMESINDE: 5 gun kirmizi, 43 ve 50 sari.
    expect(screen.getAllByTestId('training-alert').map(e => e.getAttribute('data-durum')))
      .toEqual(['CRITICAL', 'NOTICE', 'NOTICE']);
  });

  test('suresi gecmis kalemin USTUNDE EXPIRED rozeti', async () => {
    __veri.pilot_trainings = [kayit('d', 'OPC', -12)];
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button'));
    expect(screen.getByText('EXPIRED')).toBeInTheDocument();
    expect(screen.getByText(/OPC EXPIRED 12 days ago/)).toBeInTheDocument();
  });

  test('60 gunun ustundekiler cana DUSMEZ', async () => {
    __veri.pilot_trainings = [kayit('e', 'OPC', 120)];
    render(<NotificationBell />);
    fireEvent.click(await screen.findByRole('button'));
    expect(await screen.findByText(/NO TRAINING EXPIRING WITHIN 60 DAYS/)).toBeInTheDocument();
  });
});

describe('OKUNAMADI — "uyari yok" YAZMAZ (Serkan: cross line / not avail)', () => {
  test('sorgu duserse can NOT AVAILABLE der, sayac gizlenir', async () => {
    __veri.__hata = true;
    render(<NotificationBell />);
    const btn = await screen.findByTitle(/not available/i);

    // 🔴 ASIL KUSUR BUYDU: hata yutuluyor, liste bosaliyor ve ekranda
    //    "NO TRAINING EXPIRING WITHIN 60 DAYS" yaziyordu — yani "bakamadim"
    //    yerine "bakacak bir sey yok".
    fireEvent.click(btn);
    expect(screen.getByText(/NOT AVAILABLE — COULD NOT READ/)).toBeInTheDocument();
    expect(screen.queryByText(/NO TRAINING EXPIRING/)).not.toBeInTheDocument();

    // Sayac da gizlenir: "0" da bir iddiadir, bilmedigimizi sayiya dokmeyiz.
    expect(within(btn).queryByText(/^\d+$/)).toBeNull();
    expect(btn).toHaveAttribute('data-durum', 'NOT_AVAILABLE');
  });
});
