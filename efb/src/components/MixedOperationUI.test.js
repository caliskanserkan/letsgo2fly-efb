// MixedOperationUI.test.js — KARISIK GOREV UYARISI EKRANDA MI? (22 Agu 2026)
//
// Serkan: *"en dar kapsamli belirler gorev suresi limitini, ve bu MUTLAKA
// UYARI OLARAK VERILMELI: mix bir gorev olarak planlandi, kapsam dar olana
// gore belirlenecek desin PLANLAMA YAPILIRKEN."*
// Saf kural testi mixedOperation.test.js'te; BU dosya ekrani surer.
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { __veri } from '../supabaseClient';
import FTLPanel from './FTLPanel';

jest.mock('../supabaseClient', () => {
  const veri = { __ins: [] };
  const zincir = (tablo) => {
    const o = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'in', 'update', 'not', 'gte', 'lte', 'delete']) o[m] = () => o;
    o.single = () => { o.__tek = true; return o; };
    o.insert = (rows) => { o.__ins = Array.isArray(rows) ? rows : [rows];
                           veri.__ins.push({ tablo, rows: o.__ins }); return o; };
    o.then = (res, rej) => {
      let data;
      if (o.__ins) data = o.__ins.map((r, i) => ({ ...r, id: `${tablo}-${i + 1}` }));
      else if (o.__tek) data = (veri[tablo] || [])[0] ?? null;
      else data = veri[tablo] || [];
      return Promise.resolve({ data, error: null }).then(res, rej);
    };
    return o;
  };
  return { supabase: { from: zincir }, __veri: veri };
});

const REG = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'ruleset-hg', 'ruleset_hg_regulation.json'), 'utf8'));

beforeAll(() => {
  Object.defineProperty(window, 'crypto', {
    value: { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = (i * 37) % 256; return b; } },
    configurable: true,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-08-22T05:00:00.000Z'));
  __veri.__ins = [];
  __veri.profiles = [{ id:'p1', code:'AAK', full_name:'A A KAPTAN', role:'pilot' }];
  __veri.crew_duties = [];
  __veri.ftl_pilot_baselines = [{ id:'b1', pilot_id:'p1', effective_date:'2026-01-01',
    flt_28d_min:0, flt_12m_min:0, flt_cal_year_min:0,
    duty_7d_min:0, duty_28d_min:0, duty_cal_year_min:0, created_at:'2026-01-01T00:00:00Z' }];
  __veri.ftl_off_types = [];
  __veri.home_bases = [];
  __veri.ftl_duty_edits = [];
  __veri.airports = [{ icao:'LTAC', tz:'Europe/Istanbul' }, { icao:'LTFE', tz:'Europe/Istanbul' },
                     { icao:'LFMN', tz:'Europe/Paris' }];
  __veri.plans = [];
  __veri.customers = [{ id:'c1', ftl_ruleset_id:'rs1' }];
  __veri.ftl_rulesets = [{ id:'rs1', name:'REC-TR', engine_type:'SHT-FTL-HG', regulation: REG,
    company: { overrides:{}, pre_flight_report_minutes:60, post_flight_duty_minutes:30,
               mandatory_report_hours:72 } }];
});
afterEach(() => { jest.useRealTimers(); });

const ac = async () => {
  render(<FTLPanel toast={() => {}} myProfile={{ id:'u1', customer_id:'c1', role:'admin' }} />);
  await screen.findByText('ASSIGN DUTY');
};

const tipSecicileri = () => screen.getAllByRole('combobox')
  .filter(s => within(s).queryByText('— OPERATION —'));

const bacakDoldur = (i, dep, dest, etd, eta, tip) => {
  fireEvent.change(screen.getAllByPlaceholderText('DEP')[i], { target: { value: dep } });
  fireEvent.change(screen.getAllByPlaceholderText('DEST')[i], { target: { value: dest } });
  fireEvent.change(screen.getAllByPlaceholderText('ETD UTC (06:30)')[i], { target: { value: etd } });
  fireEvent.change(screen.getAllByPlaceholderText('ETA UTC (07:45)')[i], { target: { value: eta } });
  fireEvent.change(tipSecicileri()[i], { target: { value: tip } });
};

describe('Bacak basina faaliyet tipi', () => {
  test('her sektor satirinda TIP secici var', async () => {
    await ac();
    expect(tipSecicileri()).toHaveLength(1);
    fireEvent.click(screen.getByText('+ ADD SECTOR'));
    expect(tipSecicileri()).toHaveLength(2);
  });

  test('gorev basi secici artik SECICI degil — yonetici tipi GOSTERIR', async () => {
    await ac();
    expect(screen.getByText(/PER SECTOR — SET IT ON EACH LEG BELOW/)).toBeInTheDocument();
  });
});

describe('🔴 KARISIK GOREV UYARISI — planlama sirasinda', () => {
  test('iki farkli tip secilince uyari CIKAR ve EN DAR tipi yazar', async () => {
    await ac();
    fireEvent.click(screen.getByText('+ ADD SECTOR'));
    bacakDoldur(0, 'LTAC', 'LTFE', '08:00', '09:05', 'air_taxi');
    bacakDoldur(1, 'LTFE', 'LFMN', '10:40', '13:35', 'general_aviation');

    const uyari = screen.getByTestId('mixed-op-warning');
    expect(uyari).toHaveTextContent('MIXED OPERATION DUTY');
    // Uyarinin KENDI metni: en kisitlayici tip ve ondan cikan azami UGS.
    // (13:30 ekip tablosunda da geciyor — ikisinin AYNI olmasi zaten dogru.)
    expect(uyari).toHaveTextContent(/MOST RESTRICTIVE/);
    expect(uyari).toHaveTextContent(/AIR TAXI/);
    expect(uyari).toHaveTextContent(/13:30/);
    expect(uyari).toHaveTextContent(/Md\.9/);
  });

  test('tek tipli gorevde uyari CIKMAZ', async () => {
    await ac();
    fireEvent.click(screen.getByText('+ ADD SECTOR'));
    bacakDoldur(0, 'LTAC', 'LTFE', '08:00', '09:05', 'air_taxi');
    bacakDoldur(1, 'LTFE', 'LFMN', '10:40', '13:35', 'air_taxi');
    expect(screen.queryByTestId('mixed-op-warning')).not.toBeInTheDocument();
  });
});
