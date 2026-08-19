// RassView.test.js — RAAQ (FOP-FRM-02) RENDER TESTI
//
// Serkan'in 19 Agu kurallari EKRAN SEVIYESINDE kilitlenir:
//   · "Survey yapilmis veya yapilmamis olsun ... butun risk assessmentlarin
//      icinde 5 maddeyle beraber ustunde ki hucrede yazanlar da yer alacak"
//   · "bizim girdigimiz REMARKS lar en altta olmali"
//   · "5. madde eger meydan CAT C ise checked edilecek"
//   · "meydan kategorisi belirlensin ilk once, RAAQ Modul YESIL olamaz"
//   · "RAAQ modulde gorunur bir sekilde bu meydanin kategorisi saptanmamis
//      demesi lazim bize (ilgili meydanin formu uzerinde biryerde)"
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { __veri } from '../supabaseClient';
import RassView from './RassView';

jest.mock('../supabaseClient', () => {
  const veri = {};
  const zincir = (tablo) => {
    const o = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) o[m] = () => o;
    o.then = (res, rej) => Promise.resolve({ data: veri[tablo] || [], error: null }).then(res, rej);
    return o;
  };
  return { supabase: { from: zincir }, __veri: veri };
});

const PLAN = { id: 'p1', dep: 'LTAC', dest: 'EGLF', alternate: '', dispatch_no: 'D1', reg: 'TC-REC', date: '2026-08-20' };
const meydan = (icao, cat, pps) => ({
  icao, name: `${icao} AIRPORT`, category: cat, base_score: 12, risk_level: 'LOW',
  ad_elev_ft: 2653, max_s: null, max_l: null,
  section1: pps ? 'MIXED MILITARY AND CIVIL TRAFFIC.' : null, section2: null, section3: null,
  ra_assessed_by: pps ? 'S. EKINCI' : null, ra_assessment_date: pps ? '2026-05-02' : null,
});

beforeEach(() => {
  __veri.plans = [PLAN];
  __veri.airport_risks = [meydan('LTAC', 'B', true), meydan('EGLF', 'B', false)];
});

describe('FOP-FRM-02 iki blok — survey OLSA DA gorunur', () => {
  // 🔴 ESKI DAVRANIS: `hasPps ? <PPS/> : <RaaqBlock/>` — survey varsa ozel
  //    maddeler HIC gorunmuyordu. Serkan 19 Agu'da degistirdi.
  test('PPS brifingi olan meydanda da her iki blok basiliyor', async () => {
    render(<RassView />);
    expect(await screen.findAllByText(/FOLLOWING ITEMS WERE BRIEFED AND FAMILIARIZED/i)).toHaveLength(2);
    expect(screen.getAllByText(/SPECIAL ITEMS BRIEFED DUE TO AERODROME CATEGORY/i)).toHaveLength(2);
    // Blok 1'in yedi kalemi
    expect(screen.getAllByText('TERRAIN AND SAFE ALTITUDES')).toHaveLength(2);
    expect(screen.getAllByText('OPERATING MINIMA')).toHaveLength(2);
  });

  test('REMARKS en altta — PPS metni Special remarks kutusunda', async () => {
    render(<RassView />);
    expect(await screen.findAllByText(/SPECIAL REMARKS/i)).toHaveLength(2);
    expect(screen.getByText(/MIXED MILITARY AND CIVIL TRAFFIC/)).toBeInTheDocument();
    // Brifing yoksa kutu BOS BIRAKILMAZ
    expect(screen.getByText('NO PPS BRIEFING ON FILE')).toBeInTheDocument();
  });

  // Metinler mevzuat formundan birebir — 19 Agu'ya kadar iki sapma vardi.
  test('madde metinleri FORMDAKI HALIYLE', async () => {
    render(<RassView />);
    expect(await screen.findAllByText(/\(1\) NON-STANDARD APPROACH AIDS OR APPROACH PATTERNS/)).toHaveLength(2);
    expect(screen.getAllByText(/CONSIDERED TO POSE CERTAIN PROBLEMS/)).toHaveLength(2);
  });

  test('CAT A/B: bes madde de BASILIR, 5. kutu bos kalir', async () => {
    render(<RassView />);
    const maddeler = await screen.findAllByText(/^\(\d\) /);
    expect(maddeler).toHaveLength(10);          // 2 meydan x 5 madde
    expect(screen.getAllByText(/ITEM \(5\) APPLIES TO CAT C ONLY|WILL BE AUTO-CHECKED/).length).toBeGreaterThan(0);
  });
});

describe('KATEGORI YOKSA — modul yesil olamaz', () => {
  beforeEach(() => { __veri.airport_risks = [meydan('LTAC', null, true), meydan('EGLF', 'B', false)]; });

  test('kartin USTUNDE meydan koduyla bant cikar', async () => {
    render(<RassView />);
    expect(await screen.findByText(/LTAC — AERODROME CATEGORY NOT SET/)).toBeInTheDocument();
    expect(screen.getByText(/THIS MODULE CANNOT TURN GREEN/)).toBeInTheDocument();
    expect(screen.getByText('NOT SET')).toBeInTheDocument();       // CATEGORY satiri
  });

  test('onay KILITLI', async () => {
    render(<RassView />);
    const satirlar = await screen.findAllByTestId('raaq-review');
    expect(satirlar.map(e => e.getAttribute('data-locked'))).toEqual(['yes', 'no']);
    expect(within(satirlar[0]).getByText(/REVIEW LOCKED — AERODROME CATEGORY REQUIRED FIRST/)).toBeInTheDocument();
  });

  test('hicbir kutu tiklenmez ve uyari yazar', async () => {
    render(<RassView />);
    expect(await screen.findByText(/CATEGORY UNKNOWN — NO ITEM CAN BE CHECKED/)).toBeInTheDocument();
  });

  test('modul durumu YESIL olmaz', async () => {
    const durumlar = [];
    render(<RassView setStatus={(d) => durumlar.push(d)} />);
    await screen.findByText(/LTAC — AERODROME CATEGORY NOT SET/);
    expect(durumlar).not.toContain('green');
  });

  test('alt cubuk hangi meydanin eksik oldugunu SOYLER', async () => {
    render(<RassView />);
    expect(await screen.findByText(/CATEGORY NOT SET: LTAC — RAAQ CANNOT BE COMPLETED/)).toBeInTheDocument();
  });
});
