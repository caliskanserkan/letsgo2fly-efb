// OPS CALCULATOR — teklif/maliyet aracı (admin panel sekmesi)
//
// Hesabın tamamı OpsCalcEngine.js'te (saf, test edilebilir). Bu dosya yalnızca
// ekran ve ağ: koordinat ve rüzgâr çekimi + form.
//
// NEDEN AĞ SERBEST: offline-first kuralı KOKPİT içindir (pilot internet
// beklemez, İlke 4). Bu araç admin panelinde, masada, çevrimiçi kullanılır.
//
// KAYNAKLAR
//   ICAO -> koordinat : `airports` TABLOSU (lat/lon orada zaten var)
//   Seyir rüzgârı     : api.open-meteo.com, 200 hPa (~FL390, FL400 referansımız)
//
// 🔴 NEDEN KOORDİNAT TABLODAN, WEB'DEN DEĞİL (12 Agu, sahada bulundu):
// Önce aviationweather.gov denendi — curl ile çalışıyor ama TARAYICIDAN
// ÇALIŞMIYOR: `Access-Control-Allow-Origin` başlığı göndermiyor, tarayıcı
// isteği bloke ediyor ("Failed to fetch"). curl CORS uygulamaz, tarayıcı
// uygular; o yüzden komut satırında geçen bir servis panelde patlayabiliyor.
// Open-Meteo `allow-origin: *` gönderiyor, o yüzden rüzgâr web'den geliyor.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { up } from './inputFormat';
import {
  greatCircleNM, initialBearing, intermediatePoint, windComponentKt,
  computeLeg, computeTrip, hhmm, KMH_PER_KT, AC_GLF4,
} from './OpsCalcEngine';

const WIND_SAMPLES = 5;      // büyük daire üzerinde örneklenecek nokta sayısı

// ── ağ ───────────────────────────────────────────────────────────────────────

async function fetchCoords(icaos) {
  const ids = icaos.filter(Boolean).map(s => s.toUpperCase());
  const { data, error } = await supabase
    .from('airports').select('icao,name,lat,lon').in('icao', ids);
  if (error) throw new Error(`Airport lookup failed: ${error.message}`);
  const out = {};
  (data || []).forEach(a => {
    // Koordinatı olmayan satırı SESSİZCE kabul etme — bulunamadı say, çağıran
    // ismini vererek söylesin (İlke 1: eksik veriyle hesap yapma).
    if (a.lat != null && a.lon != null) {
      out[a.icao.toUpperCase()] = { lat: +a.lat, lon: +a.lon, name: a.name || '' };
    }
  });
  return out;
}

/**
 * Rotanın seyir seviyesindeki ORTALAMA rüzgâr bileşeni (kt).
 * +kuyruk / -kafa. Büyük daire üzerinde WIND_SAMPLES nokta örneklenir,
 * her noktada yerel rota açısına göre bileşen alınır, ortalanır.
 * Hata olursa null döner — çağıran "sakin hava" der, SESSİZ KALMAZ.
 */
async function fetchWindComponent(a, b, whenISO) {
  try {
    const pts = [];
    for (let i = 1; i <= WIND_SAMPLES; i++) {
      const f = i / (WIND_SAMPLES + 1);
      const p = intermediatePoint(a.lat, a.lon, b.lat, b.lon, f);
      // yerel rota açısı: o noktadan varışa doğru
      pts.push({ ...p, course: initialBearing(p.lat, p.lon, b.lat, b.lon) });
    }
    const lat = pts.map(p => p.lat.toFixed(3)).join(',');
    const lon = pts.map(p => p.lon.toFixed(3)).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&hourly=wind_speed_200hPa,wind_direction_200hPa&forecast_days=7&timezone=UTC`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const locs = Array.isArray(data) ? data : [data];

    const target = new Date(whenISO);
    let sum = 0, n = 0;
    locs.forEach((loc, i) => {
      const h = loc.hourly; if (!h) return;
      // hedef saate en yakın dilim
      let best = -1, bestDiff = Infinity;
      h.time.forEach((t, k) => {
        const diff = Math.abs(new Date(t + 'Z') - target);
        if (diff < bestDiff) { bestDiff = diff; best = k; }
      });
      if (best < 0) return;
      const spdKt = h.wind_speed_200hPa[best] / KMH_PER_KT;   // API km/h verir
      const dir = h.wind_direction_200hPa[best];
      if (spdKt == null || dir == null) return;
      sum += windComponentKt(dir, spdKt, pts[i].course);
      n++;
    });
    return n ? sum / n : null;
  } catch {
    return null;
  }
}

// ── ekran ────────────────────────────────────────────────────────────────────

const card = { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 };
const lbl  = { fontSize: 10, fontWeight: 600, letterSpacing: 1, color: 'var(--muted, #8b93a7)', display: 'block', marginBottom: 4 };
const inp  = { width: '100%', padding: '8px 10px', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'inherit', fontFamily: 'var(--mono)', fontSize: 13, boxSizing: 'border-box' };
const grid = (c) => ({ display: 'grid', gridTemplateColumns: `repeat(${c}, minmax(0,1fr))`, gap: 10 });
const h2   = { fontSize: 11, fontWeight: 700, letterSpacing: 1.5, marginBottom: 10, color: 'var(--accent)' };

export default function OpsCalculator({ toast, customerId = null, readOnly = false }) {
  const [fleet, setFleet]   = useState([]);
  const [acId, setAcId]     = useState('');
  const [dep, setDep]       = useState('');
  const [dest, setDest]     = useState('');
  const [outAt, setOutAt]   = useState('');   // datetime-local, UTC kabul edilir
  const [retAt, setRetAt]   = useState('');
  const [crew, setCrew]     = useState(2);

  // "Any conflict on the route?" — her bacak icin ayri (Serkan, 12 Agu)
  const [tankering, setTankering] = useState(false);
  const [outConflict, setOutConflict] = useState(false);
  const [retConflict, setRetConflict] = useState(false);
  const [outExtra, setOutExtra] = useState('');
  const [retExtra, setRetExtra] = useState('');

  const [c, setC] = useState({ fuelDep:'', fuelDest:'', hotel:'', perDiem:'', catering:'', hDep:'', hDest:'', doc:'' });
  const [res, setRes]   = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState('');

  const setCost = (k, v) => setC(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      let q = supabase.from('aircraft').select('*').eq('active', true).order('registration');
      if (customerId) q = q.eq('customer_id', customerId);
      const { data } = await q;
      setFleet(data || []);
      if (data?.length === 1) setAcId(String(data[0].id));
    })();
  }, [customerId]);

  const ac = fleet.find(a => String(a.id) === acId);

  /** Uçağın performans katsayıları — girilmemişse hesap YAPILMAZ, söylenir. */
  const acParams = ac && ac.ops_cruise_tas && ac.ops_cruise_ff ? {
    label: ac.registration,
    cruiseTAS: ac.ops_cruise_tas, cruiseFF: ac.ops_cruise_ff,
    climbMin: AC_GLF4.climbMin, descMin: AC_GLF4.descMin,   // 25/25 STANDART (sirket usulu, ucaga bagli degil)
    climbNM: ac.ops_climb_nm ?? 0, climbFuel: ac.ops_climb_fuel ?? 0,
    descNM: ac.ops_desc_nm ?? 0,  descFuel: ac.ops_desc_fuel ?? 0,
    groundFuel: ac.ops_ground_fuel ?? 0, groundMin: ac.ops_ground_min ?? 0,
  } : null;

  const calculate = useCallback(async () => {
    setErr(''); setRes(null);
    if (!acParams) { setErr('Select an aircraft with performance data entered.'); return; }
    if (dep.length !== 4 || dest.length !== 4) { setErr('Enter 4-letter ICAO codes.'); return; }
    if (!outAt || !retAt) { setErr('Enter outbound and return date + time.'); return; }
    if (new Date(retAt) <= new Date(outAt)) { setErr('Return must be after outbound.'); return; }

    setBusy(true);
    try {
      const coords = await fetchCoords([dep, dest]);
      const A = coords[dep], B = coords[dest];
      const missing = [!A && dep, !B && dest].filter(Boolean);
      if (missing.length) {
        throw new Error(`No coordinates for ${missing.join(' and ')} — add the airport first.`);
      }

      const gc = greatCircleNM(A.lat, A.lon, B.lat, B.lon);
      const outX = outConflict ? (+outExtra || 0) : 0;
      const retX = retConflict ? (+retExtra || 0) : 0;

      // Rüzgâr, uçuşun ORTA anındaki tahminden alınır. Süre rüzgâra bağlı
      // olduğu için önce sakin havayla kabaca hesaplanıp bir kez düzeltilir.
      const rough = (extra) => computeLeg({ distanceNM: gc, extraNM: extra, ac: acParams }).flightH;
      const outMid = new Date(new Date(outAt).getTime() + rough(outX) / 2 * 3600000).toISOString();
      const retMid = new Date(new Date(retAt).getTime() + rough(retX) / 2 * 3600000).toISOString();

      const [wOut, wRet] = await Promise.all([
        fetchWindComponent(A, B, outMid),
        fetchWindComponent(B, A, retMid),
      ]);

      const outLeg = computeLeg({ distanceNM: gc, extraNM: outX, windCompKt: wOut ?? 0, ac: acParams });
      const retLeg = computeLeg({ distanceNM: gc, extraNM: retX, windCompKt: wRet ?? 0, ac: acParams });

      const outArrive = new Date(new Date(outAt).getTime() + outLeg.flightMin * 60000).toISOString();
      const trip = computeTrip({
        outLeg, retLeg,
        outDepartUTC: new Date(outAt).toISOString(),
        outArriveUTC: outArrive,
        retDepartUTC: new Date(retAt).toISOString(),
        crewCount: +crew || 2,
        tankering,
        fuelPriceDepPerTonne: +c.fuelDep || 0,
        fuelPriceDestPerTonne: +c.fuelDest || 0,
        hotelNightly: +c.hotel || 0,
        perDiemDaily: +c.perDiem || 0,
        catering: +c.catering || 0,
        handlingDep: +c.hDep || 0,
        handlingDest: +c.hDest || 0,
        docHourly: +c.doc || (ac.ops_doc_hourly ?? 0),
      });

      setRes({ A, B, gc, outLeg, retLeg, trip, windKnown: { out: wOut != null, ret: wRet != null } });
    } catch (e) {
      setErr(e.message || 'Calculation failed.');
    }
    setBusy(false);
  }, [acParams, ac, dep, dest, outAt, retAt, crew, c, tankering, outConflict, retConflict, outExtra, retExtra]);

  const money = (n) => `$${(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>OPS CALCULATOR</div>
      <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 14 }}>
        ESTIMATE ONLY — great circle distance, standard climb/descent profile, forecast winds.
      </div>

      {/* ── ROTA ── */}
      <div style={card}>
        <div style={h2}>ROUTE &amp; SCHEDULE</div>
        <div style={grid(5)}>
          <div>
            <label style={lbl}>AIRCRAFT</label>
            <select style={inp} value={acId} onChange={e => setAcId(e.target.value)} disabled={readOnly}>
              <option value="">— select —</option>
              {fleet.map(a => <option key={a.id} value={a.id}>{a.registration} {a.ac_type ? `(${a.ac_type})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>DEPARTURE</label>
            <input style={inp} value={dep} maxLength={4} placeholder="LTAC"
                   onChange={e => setDep(up(e.target.value))} disabled={readOnly} />
          </div>
          <div>
            <label style={lbl}>DESTINATION</label>
            <input style={inp} value={dest} maxLength={4} placeholder="EGLF"
                   onChange={e => setDest(up(e.target.value))} disabled={readOnly} />
          </div>
          <div>
            <label style={lbl}>OUTBOUND (UTC)</label>
            <input style={inp} type="datetime-local" value={outAt} onChange={e => setOutAt(e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <label style={lbl}>RETURN (UTC)</label>
            <input style={inp} type="datetime-local" value={retAt} onChange={e => setRetAt(e.target.value)} disabled={readOnly} />
          </div>
        </div>

        {ac && !acParams && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--amber)' }}>
            {ac.registration}: performance data not entered — set cruise TAS and fuel flow on the Aircrafts tab.
          </div>
        )}

        {/* ── CONFLICT ── her bacak icin ayri sorulur */}
        <div style={{ ...grid(2), marginTop: 12 }}>
          {[['OUTBOUND', outConflict, setOutConflict, outExtra, setOutExtra],
            ['RETURN',   retConflict, setRetConflict, retExtra, setRetExtra]].map(([t, on, setOn, ex, setEx]) => (
            <div key={t} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <label style={lbl}>ANY CONFLICT ON THE ROUTE? — {t}</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {[['NO', false], ['YES', true]].map(([txt, v]) => (
                  <button key={txt} disabled={readOnly} onClick={() => setOn(v)}
                    style={{ padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                             border: `1px solid ${on === v ? 'var(--accent)' : 'var(--border)'}`,
                             background: on === v ? 'var(--accent-soft)' : 'transparent', color: 'inherit' }}>{txt}</button>
                ))}
                {on && (
                  <input style={{ ...inp, width: 130 }} value={ex} placeholder="extra NM"
                         onChange={e => setEx(e.target.value.replace(/\D/g, ''))} disabled={readOnly} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── MALIYET GIRDILERI ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ ...h2, marginBottom: 0 }}>COSTS (USD)</div>
          {/* TANKERING: DEP'te yakit alip DEST'te ikmal yapmadan donus.
              Acikken gidis-donus yakitinin TAMAMI tek meydanin fiyatindan. */}
          <button onClick={() => setTankering(v => !v)} disabled={readOnly}
            style={{ padding: '5px 14px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
                     border: `1px solid ${tankering ? 'var(--amber)' : 'var(--border)'}`,
                     background: tankering ? 'var(--amber-soft)' : 'transparent', color: 'inherit' }}>
            TANKERING {tankering ? 'ON' : 'OFF'}
          </button>
        </div>
        {tankering && (
          <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 10 }}>
            All round-trip fuel uplifted at {dep || 'DEP'} — no refuelling at {dest || 'DEST'}.
          </div>
        )}
        <div style={grid(4)}>
          {[...(tankering
              ? [['fuelDep', `FUEL ${dep || 'DEP'} / TONNE — ALL UPLIFT`]]
              : [['fuelDep', `FUEL ${dep || 'DEP'} / TONNE`], ['fuelDest', `FUEL ${dest || 'DEST'} / TONNE`]]),
            ['hDep', `HANDLING ${dep || 'DEP'}`], ['hDest', `HANDLING ${dest || 'DEST'}`],
            ['catering', 'CATERING'], ['hotel', 'HOTEL / NIGHT / PERSON'],
            ['perDiem', 'PER DIEM / DAY / PERSON'], ['doc', `DOC / HOUR${ac?.ops_doc_hourly ? ` (${ac.ops_doc_hourly})` : ''}`]].map(([k, l]) => (
            <div key={k}>
              <label style={lbl}>{l}</label>
              <input style={inp} value={c[k]} onChange={e => setCost(k, e.target.value.replace(/[^\d.]/g, ''))} disabled={readOnly} />
            </div>
          ))}
          <div>
            <label style={lbl}>CREW</label>
            <input style={inp} value={crew} onChange={e => setCrew(e.target.value.replace(/\D/g, ''))} disabled={readOnly} />
          </div>
        </div>
      </div>

      <button onClick={calculate} disabled={busy || readOnly}
        style={{ padding: '10px 28px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)',
                 color: 'inherit', fontWeight: 700, letterSpacing: 1, cursor: busy ? 'wait' : 'pointer', fontSize: 12 }}>
        {busy ? 'CALCULATING…' : 'CALCULATE'}
      </button>
      {err && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 12 }}>{err}</div>}

      {/* ── SONUC ── */}
      {res && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={h2}>RESULT</div>
          <div style={{ fontSize: 11, marginBottom: 10, fontFamily: 'var(--mono)' }}>
            {dep} {res.A.name && `(${res.A.name})`} → {dest} {res.B.name && `(${res.B.name})`}
            {'  ·  '}GREAT CIRCLE <b>{Math.round(res.gc)} NM</b>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--mono)' }}>
            <thead>
              <tr style={{ color: 'var(--muted,#8b93a7)', fontSize: 10, letterSpacing: 1 }}>
                {['', 'ROUTE NM', 'WIND', 'GS', 'FLT TIME', 'FUEL'].map(t =>
                  <th key={t} style={{ textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid var(--border)' }}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {[['OUTBOUND', res.outLeg, res.windKnown.out], ['RETURN', res.retLeg, res.windKnown.ret]].map(([t, L, wk]) => (
                <tr key={t}>
                  <td style={{ padding: '6px', fontWeight: 700 }}>{t}</td>
                  <td style={{ padding: '6px' }}>
                    {Math.round(L.routeNM)}{L.extraNM > 0 && <span style={{ color: 'var(--amber)' }}> (+{L.extraNM})</span>}
                  </td>
                  <td style={{ padding: '6px', color: wk ? (L.windCompKt < 0 ? 'var(--red)' : 'var(--green)') : 'var(--amber)' }}>
                    {wk ? `${L.windCompKt > 0 ? '+' : ''}${Math.round(L.windCompKt)} kt` : 'no data'}
                  </td>
                  <td style={{ padding: '6px' }}>{Math.round(L.groundSpeedKt)} kt</td>
                  <td style={{ padding: '6px', fontWeight: 700 }}>{hhmm(L.flightMin)}</td>
                  <td style={{ padding: '6px' }}>{Math.round(L.fuelLb).toLocaleString()} lb · {L.fuelTonnes.toFixed(2)} t</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(!res.windKnown.out || !res.windKnown.ret) && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)' }}>
              Wind data unavailable for one or both legs — calculated in still air. Round-trip time is understated.
            </div>
          )}

          <div style={{ ...grid(4), marginTop: 14 }}>
            {[[res.trip.tankering ? 'FUEL (TANKERING)' : 'FUEL', res.trip.fuelCost], ['HANDLING', res.trip.handling], ['CATERING', res.trip.catering],
              ['HOTEL', res.trip.hotelCost], ['PER DIEM', res.trip.perDiemCost], ['DOC', res.trip.docCost]].map(([t, v]) => (
              <div key={t}>
                <label style={lbl}>{t}</label>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{money(v)}</div>
              </div>
            ))}
            <div>
              <label style={lbl}>GROUND / PER DIEM</label>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                {res.trip.groundHours.toFixed(1)} h · {res.trip.nights} nt · {res.trip.perDiemDays} d
              </div>
            </div>
            <div>
              <label style={lbl}>TOTAL FLIGHT / DOC</label>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
                {hhmm(res.trip.totalFlightH * 60)} · {hhmm(res.trip.totalDocH * 60)}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 30, alignItems: 'baseline' }}>
            <div>
              <label style={lbl}>TOTAL</label>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>{money(res.trip.total)}</div>
            </div>
            <div>
              <label style={lbl}>PER FLIGHT HOUR</label>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 16 }}>{money(res.trip.costPerFlightHour)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
