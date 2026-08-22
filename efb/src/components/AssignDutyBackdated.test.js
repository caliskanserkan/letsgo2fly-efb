// AssignDutyBackdated.test.js — POPUP GERCEKTEN CIZILIYOR MU?
//
// "BITTI" = lint temiz + testler gecti + BILESEN FIILEN RENDER OLDU (19 Agu).
// Saf kural testi backdatedDuty.test.js'te; BU dosya ekrani surer:
// gecmise gorev atanirken popup ACILIYOR mu, onaysiz kayit YAZILMIYOR mu,
// onaydan sonra satir 'actual' gidiyor ve denetim izi gerekceyle dusuyor mu.
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// Kural seti TEK KAYNAKTAN okunur (ruleset-hg/) — teste kopyalanmis bir kural
// seti zamanla asil kuraldan ayrisir ve test yalan soylemeye baslar.
const REG = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'ruleset-hg', 'ruleset_hg_regulation.json'), 'utf8'));

// SAHA VAKASI: 21 Agu aksami (21:57Z), ayni gun sabah 08:00Z baslayan iki
// bacakli gorev giriliyor. Gorev 13:00Z'de bitmis; +30 dk ile duty_end 13:30Z.
const SIMDI = new Date('2026-08-21T21:57:00.000Z');

const kur = () => {
  __veri.__ins = [];
  __veri.profiles = [
    { id: 'p1', code: 'AAK', full_name: 'A A KAPTAN', role: 'pilot' },
    { id: 'p2', code: 'BBP', full_name: 'B B PILOT', role: 'pilot' },
  ];
  __veri.crew_duties = [];
  // Devir satiri olmadan pilot NOT LEGAL kalir ("BASELINE NOT SET").
  __veri.ftl_pilot_baselines = ['p1', 'p2'].map((pid, i) => ({
    id: `b${i + 1}`, pilot_id: pid, effective_date: '2026-01-01',
    flt_28d_min: 0, flt_12m_min: 0, flt_cal_year_min: 0,
    duty_7d_min: 0, duty_28d_min: 0, duty_cal_year_min: 0,
    created_at: '2026-01-01T00:00:00Z',
  }));
  __veri.ftl_off_types = [];
  __veri.home_bases = [];
  __veri.ftl_duty_edits = [];
  // Meydan dilimi bilinmezse intibak COZULMEZ ve pilot NOT LEGAL olur —
  // Md.22/1 bandi uydurulmuyor (dogru davranis, testte de beslenmeli).
  __veri.airports = [
    { icao: 'LSGG', tz: 'Europe/Zurich' },
    { icao: 'LTAC', tz: 'Europe/Istanbul' },
  ];
  __veri.plans = [];
  __veri.customers = [{ id: 'c1', ftl_ruleset_id: 'rs1' }];
  __veri.ftl_rulesets = [{
    id: 'rs1', name: 'REC-TR (SHT-FTL/HG Rev00)', engine_type: 'SHT-FTL-HG',
    regulation: REG,
    company: { overrides: {}, pre_flight_report_minutes: 60,
               post_flight_duty_minutes: 30, mandatory_report_hours: 72 },
  }];
};

const ac = async () => {
  render(<FTLPanel toast={() => {}} myProfile={{ id: 'u1', customer_id: 'c1', role: 'admin' }} />);
  await screen.findByText('ASSIGN DUTY');
};

// Gecmiste kalan iki bacakli gorevi forma yazar ve pilotu secer.
const gecmisGoreviGir = async () => {
  const dep = screen.getAllByPlaceholderText('DEP');
  const dest = screen.getAllByPlaceholderText('DEST');
  const etd = screen.getAllByPlaceholderText('ETD UTC (06:30)');
  const eta = screen.getAllByPlaceholderText('ETA UTC (07:45)');
  fireEvent.change(dep[0], { target: { value: 'LSGG' } });
  fireEvent.change(dest[0], { target: { value: 'LTAC' } });
  fireEvent.change(etd[0], { target: { value: '08:00' } });
  fireEvent.change(eta[0], { target: { value: '13:00' } });
  // 22 Agu: faaliyet tipi artik BACAK BASINA ve zorunlu (Md.9) — hangi hukmun
  // uygulanacagi ondan cikiyor, bos birakilip varsayilan uydurulmuyor.
  sektorTipi(0, 'air_taxi');
  return pilotSec();
};

// Meydan dilimi ASENKRON cekiliyor (intibak Md.22/1); gelmeden once satir
// NOT LEGAL ve tiklanamaz. O yuzden LEGAL olmasi BEKLENIR.
// Bir sektorun faaliyet tipini sec.
const sektorTipi = (i, tip) => {
  const secim = screen.getAllByRole('combobox').filter(
    s => within(s).queryByText('— OPERATION —'));
  fireEvent.change(secim[i], { target: { value: tip } });
};

const pilotSec = async () => {
  const satir = screen.getByTestId('crew-AAK');
  await waitFor(() => expect(within(satir).getByText('LEGAL')).toBeInTheDocument());
  fireEvent.click(satir);
};

// jsdom'da window.crypto yok; newUuid() onu kullaniyor.
beforeAll(() => {
  Object.defineProperty(window, 'crypto', {
    value: { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = (i * 37) % 256; return b; } },
    configurable: true,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(SIMDI);
  kur();
});
afterEach(() => { jest.useRealTimers(); });

describe('GECMISE GOREV ATAMA — popup', () => {
  test('atama ekrani aciliyor (hook/render kazasi burada patlar)', async () => {
    await ac();
    expect(screen.getByText(/Crew — who can fly this duty\?/)).toBeInTheDocument();
  });

  test('🔴 SAHA VAKASI: bugun bitmis goreve POPUP cikar ve HICBIR SEY yazilmaz', async () => {
    await ac();
    await gecmisGoreviGir();
    fireEvent.click(screen.getByText('ASSIGN DUTY'));

    await screen.findByText('BACKDATED DUTY — ARE YOU SURE?');
    expect(screen.getByText(/A duty in the past is not planning/)).toBeInTheDocument();
    // Onay verilmeden tek satir bile gitmez.
    expect(__veri.__ins.filter(i => i.tablo === 'crew_duties')).toHaveLength(0);
  });

  test('CANCEL: popup kapanir, yine hicbir sey yazilmaz', async () => {
    await ac();
    await gecmisGoreviGir();
    fireEvent.click(screen.getByText('ASSIGN DUTY'));
    await screen.findByText('BACKDATED DUTY — ARE YOU SURE?');
    fireEvent.click(screen.getByText('CANCEL'));
    await waitFor(() =>
      expect(screen.queryByText('BACKDATED DUTY — ARE YOU SURE?')).not.toBeInTheDocument());
    expect(__veri.__ins.filter(i => i.tablo === 'crew_duties')).toHaveLength(0);
  });

  test('GEREKCESIZ onaylanamaz — buton kilitli', async () => {
    await ac();
    await gecmisGoreviGir();
    fireEvent.click(screen.getByText('ASSIGN DUTY'));
    await screen.findByText('BACKDATED DUTY — ARE YOU SURE?');
    expect(screen.getByText('RECORD AS ACTUAL')).toBeDisabled();
  });

  test('ONAY: satir ACTUAL gider, saatler gercek blok olur, iz gerekceyle duser', async () => {
    await ac();
    await gecmisGoreviGir();
    fireEvent.click(screen.getByText('ASSIGN DUTY'));
    await screen.findByText('BACKDATED DUTY — ARE YOU SURE?');

    fireEvent.change(screen.getByPlaceholderText(/Mandatory: why is this being changed\?/),
                     { target: { value: 'Flown today, entered after landing.' } });
    fireEvent.click(screen.getByText('RECORD AS ACTUAL'));

    await waitFor(() =>
      expect(__veri.__ins.filter(i => i.tablo === 'crew_duties')).toHaveLength(1));

    const duty = __veri.__ins.find(i => i.tablo === 'crew_duties').rows[0];
    expect(duty.status).toBe('actual');
    expect(duty.duty_finished).toBe(true);
    expect(duty.sectors[0]).toMatchObject({
      dep: 'LSGG', dest: 'LTAC', off_block: '08:00', on_block: '13:00', entered_manually: true,
    });

    const iz = __veri.__ins.find(i => i.tablo === 'ftl_duty_edits');
    expect(iz).toBeTruthy();
    expect(iz.rows[0].field_name).toBe('backdated_entry');
    expect(iz.rows[0].reason).toBe('Flown today, entered after landing.');
    expect(iz.rows[0].edited_by).toBe('u1');
  });

  test('GELECEKTEKI gorev popup ACMAZ — dogrudan planned yazilir', async () => {
    await ac();
    const etd = screen.getAllByPlaceholderText('ETD UTC (06:30)');
    const eta = screen.getAllByPlaceholderText('ETA UTC (07:45)');
    fireEvent.change(screen.getAllByPlaceholderText('DEP')[0], { target: { value: 'LSGG' } });
    fireEvent.change(screen.getAllByPlaceholderText('DEST')[0], { target: { value: 'LTAC' } });
    fireEvent.change(etd[0], { target: { value: '22:30' } });   // simdi 21:57 — ileride
    fireEvent.change(eta[0], { target: { value: '23:40' } });
    sektorTipi(0, 'air_taxi');
    await pilotSec();
    fireEvent.click(screen.getByText('ASSIGN DUTY'));

    await waitFor(() =>
      expect(__veri.__ins.filter(i => i.tablo === 'crew_duties')).toHaveLength(1));
    expect(screen.queryByText('BACKDATED DUTY — ARE YOU SURE?')).not.toBeInTheDocument();
    const duty = __veri.__ins.find(i => i.tablo === 'crew_duties').rows[0];
    expect(duty.status).toBe('planned');
    expect(duty.duty_finished).toBeUndefined();
    expect(__veri.__ins.find(i => i.tablo === 'ftl_duty_edits')).toBeUndefined();
  });
});
