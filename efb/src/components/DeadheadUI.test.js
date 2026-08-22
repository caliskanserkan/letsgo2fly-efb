// DeadheadUI.test.js — DH EKRANI GERCEKTEN CIZILIYOR MU? (22 Agu 2026)
//
// "BITTI" = lint temiz + testler gecti + BILESEN FIILEN RENDER OLDU.
// Saf kural testi deadhead.test.js'te (SHT Md.14); BU dosya ekrani surer.
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
    o.insert = (rows) => {
      o.__ins = Array.isArray(rows) ? rows : [rows];
      veri.__ins.push({ tablo, rows: o.__ins });
      return o;
    };
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
  jest.setSystemTime(new Date('2026-08-22T06:00:00.000Z'));
  __veri.__ins = [];
  __veri.profiles = [{ id: 'p1', code: 'AAK', full_name: 'A A KAPTAN', role: 'pilot' }];
  __veri.crew_duties = [];
  __veri.ftl_pilot_baselines = [{ id:'b1', pilot_id:'p1', effective_date:'2026-01-01',
    flt_28d_min:0, flt_12m_min:0, flt_cal_year_min:0,
    duty_7d_min:0, duty_28d_min:0, duty_cal_year_min:0, created_at:'2026-01-01T00:00:00Z' }];
  __veri.ftl_off_types = [];
  __veri.home_bases = [];
  __veri.ftl_duty_edits = [];
  __veri.airports = [{ icao:'LTAC', tz:'Europe/Istanbul' }, { icao:'LTBA', tz:'Europe/Istanbul' },
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

const gndDhSec = () => {
  fireEvent.click(screen.getByText('GND'));
  // DH secenegini TASIYAN listeyi bul (birden fazla acilir liste var).
  const secim = screen.getAllByRole('combobox')
    .find(s => within(s).queryByText(/DEADHEAD/));
  fireEvent.change(secim, { target: { value: 'dh' } });
};

describe('DH ekrani', () => {
  test('GND altinda DH secenegi VAR', async () => {
    await ac();
    fireEvent.click(screen.getByText('GND'));
    expect(screen.getByText(/DH — DEADHEAD \/ POSITIONING/)).toBeInTheDocument();
  });

  test('DH secilince sektor tablosu ve ucus numarasi alani cikar', async () => {
    await ac();
    gndDhSec();
    expect(screen.getByPlaceholderText('FLIGHT NO')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('DEP UTC')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ARR UTC')).toBeInTheDocument();
    expect(screen.getByText('+ ADD SECTOR')).toBeInTheDocument();
  });

  test('ADD SECTOR ikinci bacagi ekler (aktarmali DH)', async () => {
    await ac();
    gndDhSec();
    expect(screen.getAllByPlaceholderText('FLIGHT NO')).toHaveLength(1);
    fireEvent.click(screen.getByText('+ ADD SECTOR'));
    expect(screen.getAllByPlaceholderText('FLIGHT NO')).toHaveLength(2);
  });

  test('mevzuat gerekcesi EKRANDA yazili (Md.14/1/a ve b)', async () => {
    await ac();
    gndDhSec();
    expect(screen.getByText(/ALL time spent positioning is recorded as DUTY/)).toBeInTheDocument();
    expect(screen.getByText(/NOT a sector/)).toBeInTheDocument();
  });

  test('🔴 ADD FLT DUTY gorevi UCUSA cevirir ve DH bacaklari KALIR', async () => {
    await ac();
    gndDhSec();
    fireEvent.change(screen.getByPlaceholderText('DEP'), { target: { value: 'LTAC' } });
    fireEvent.change(screen.getByPlaceholderText('DEST'), { target: { value: 'LTBA' } });
    fireEvent.change(screen.getByPlaceholderText('DEP UTC'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByPlaceholderText('ARR UTC'), { target: { value: '09:30' } });

    fireEvent.click(screen.getByText('+ ADD FLT DUTY'));

    // ucus modundayiz: ucus sektor tablosu geldi
    expect(screen.getByPlaceholderText('ETD UTC (06:30)')).toBeInTheDocument();
    // DH oneki gorunur kaldi ve degerleri duruyor
    expect(screen.getByText(/Positioning before this flight/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('LTAC')).toBeInTheDocument();
    expect(screen.getByDisplayValue('08:00')).toBeInTheDocument();
    expect(screen.getByText('+ ADD DH SECTOR')).toBeInTheDocument();
  });
});
