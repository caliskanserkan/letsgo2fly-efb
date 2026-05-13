import React, { useState, useEffect, useRef, useCallback } from 'react';
import SyncButton from './SyncButton';
import { usePersistedState } from '../hooks/usePersistedState';
import { logEvent } from '../supabaseClient';

// ─── RWY Condition landing factors (EASA/CS-25) ──────────────────────────────
const RWY_CONDITIONS = [
  { id:'DRY',           label:'DRY',                factor:1.00, color:'#2d9e5f' },
  { id:'WET',           label:'WET',                factor:1.15, color:'#f0c040' },
  { id:'SLIPPERY_WET',  label:'SLIPPERY WET',       factor:1.40, color:'#e8731a' },
  { id:'COMPACTED_SNOW',label:'COMPACTED SNOW',     factor:1.45, color:'#e8731a' },
  { id:'WET_ICE',       label:'WET ICE / SLUSH',    factor:1.67, color:'#e02020' },
];

function getStopMarginColor(margin) {
  if (margin === null) return '#999';
  if (margin > 500) return '#2d9e5f';
  if (margin > 300) return '#f0c040';
  if (margin > 100) return '#e8731a';
  return '#e02020';
}

// QNH hPa → inHg
const toInHg = (hpa) => hpa ? (parseFloat(hpa) * 0.02953).toFixed(2) : null;

const iStyle = {
  background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6,
  padding:'7px 10px', fontSize:14, fontWeight:700, color:'#1a9bc4',
  fontFamily:'monospace', outline:'none',
};
const iAmber = {
  background:'#1a1a1a', border:'1.5px solid #e8731a', borderRadius:6,
  padding:'7px 10px', fontSize:14, fontWeight:700, color:'#e8731a',
  fontFamily:'monospace', outline:'none',
};

function Sep() {
  return <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />;
}
function Title({ t }) {
  return <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>{t}</div>;
}
function AutoRow({ label, value, accent }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
      <span style={{ fontSize:12.5, color:'#666' }}>{label}</span>
      <span style={{ fontSize:12.5, color: accent || '#999', fontFamily:'monospace', fontWeight: accent ? 700 : 400 }}>{value}</span>
    </div>
  );
}
function EntryRow({ label, value, onChange, unit, placeholder }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', minHeight:52 }}>
      <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || '——'}
          style={{ ...iStyle, width:100, textAlign:'right' }} />
        {unit && <span style={{ fontSize:11, color:'#555', minWidth:28 }}>{unit}</span>}
      </div>
    </div>
  );
}
function AtisRow({ label, value, onChange, photo, onPhoto }) {
  return (
    <div style={{ background:'#2e2e2e', borderBottom:'1px solid #383838', padding:'10px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>{label}</span>
        <button onClick={onPhoto}
          style={{ background: photo ? 'rgba(45,158,95,0.15)' : '#2a2a2a', border:`1px solid ${photo ? '#2d9e5f' : '#444'}`, borderRadius:6, padding:'4px 10px', fontSize:10, fontWeight:700, color: photo ? '#2d9e5f' : '#777', cursor:'pointer', fontFamily:'inherit' }}>
          {photo ? 'Photo OK' : 'ATIS Photo'}
        </button>
      </div>
      <input style={{ ...iStyle, width:'100%' }} value={value} onChange={e => onChange(e.target.value)} placeholder="Enter ATIS information..." />
    </div>
  );
}

// ─── Night Detection Badge ────────────────────────────────────────────────────
function NightBadge({ status, loading }) {
  if (loading) return (
    <span style={{ fontSize:10, color:'#555', fontFamily:'monospace' }}>checking...</span>
  );
  if (!status) return null;
  const cfg = {
    NIGHT:    { color:'#1a9bc4', bg:'rgba(26,155,196,0.12)', border:'#1a9bc4', icon:'🌙' },
    DAY:      { color:'#2d9e5f', bg:'rgba(45,158,95,0.12)',  border:'#2d9e5f', icon:'☀️' },
    TWILIGHT: { color:'#f0c040', bg:'rgba(240,192,64,0.12)', border:'#f0c040', icon:'🌅' },
    UNKNOWN:  { color:'#555',    bg:'rgba(80,80,80,0.1)',    border:'#555',    icon:'?' },
  }[status] || { color:'#555', bg:'transparent', border:'#555', icon:'?' };
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:4, background:cfg.bg, border:`1px solid ${cfg.border}`, color:cfg.color, fontFamily:'monospace', letterSpacing:1 }}>
      {cfg.icon} {status}
    </span>
  );
}

function LandingData({ flightData, divertData, updateDivert, setStatus, activePlan }) {
  const [icao,      setIcao]      = usePersistedState('efb_lnd_icao',      activePlan?.dest || 'LTBA');
  const [selRwy,    setSelRwy]    = usePersistedState('efb_lnd_selRwy',    null);
  const [manualRwy, setManualRwy] = usePersistedState('efb_lnd_manualRwy', '');
  const [manualLen, setManualLen] = usePersistedState('efb_lnd_manualLen', '');
  const [arrAtis,   setArrAtis]   = usePersistedState('efb_lnd_arrAtis',   '');
  const [arrPhoto,  setArrPhoto]  = usePersistedState('efb_lnd_arrPhoto',  false);
  const [reqLnd,    setReqLnd]    = usePersistedState('efb_lnd_reqLnd',    '');
  const [actualLw,  setActualLw]  = usePersistedState('efb_lnd_actualLw',  '');
  const [vref,      setVref]      = usePersistedState('efb_lnd_vref',      '');

  // ── NEW: QNH + RWY Condition ──────────────────────────────────────────────
  const [qnh,      setQnh]      = usePersistedState('efb_lnd_qnh',      '');
  const [rwyCond,  setRwyCond]  = usePersistedState('efb_lnd_rwyCond',  'DRY');

  // ── NEW: Night detection ──────────────────────────────────────────────────
  const [nightStatus,  setNightStatus]  = useState(null);   // NIGHT | DAY | TWILIGHT
  const [nightLoading, setNightLoading] = useState(false);
  const [sunsetInfo,   setSunsetInfo]   = useState(null);   // { sunrise, sunset, civil_twilight_begin, civil_twilight_end }
  const [airportCoords, setAirportCoords] = useState(null); // { lat, lon }

  const [runways, setRunways] = useState([]);
  const [loading, setLoading] = useState(false);
  const [noData,  setNoData]  = useState(false);
  const divert = divertData.active;

  const atisTimer  = useRef(null);
  const qnhTimer   = useRef(null);
  const perfLogged = useRef(false);

  // Log: runway selected
  useEffect(() => {
    if (!selRwy || !activePlan?.id) return;
    logEvent(activePlan.id, 'LND_RWY_SELECTED', { rwy: selRwy });
  }, [selRwy]); // eslint-disable-line

  // Log: ARR ATIS (debounced 2s)
  useEffect(() => {
    if (!arrAtis || !activePlan?.id) return;
    clearTimeout(atisTimer.current);
    atisTimer.current = setTimeout(() => {
      logEvent(activePlan.id, 'LND_ATIS_ENTERED', {
        arr_atis: arrAtis,
        qnh:      qnh || null,
        rwy_cond: rwyCond,
      });
    }, 2000);
    return () => clearTimeout(atisTimer.current);
  }, [arrAtis, qnh, rwyCond]); // eslint-disable-line

  // Log: QNH (debounced 2s)
  useEffect(() => {
    if (!qnh || !activePlan?.id) return;
    clearTimeout(qnhTimer.current);
    qnhTimer.current = setTimeout(() => {
      logEvent(activePlan.id, 'LND_QNH_ENTERED', { qnh_hpa: qnh, qnh_inhg: toInHg(qnh) });
    }, 2000);
    return () => clearTimeout(qnhTimer.current);
  }, [qnh]); // eslint-disable-line

  // Log: perf data
  useEffect(() => {
    if (!actualLw && !vref) { perfLogged.current = false; return; }
    if (!activePlan?.id || perfLogged.current) return;
    perfLogged.current = true;
    logEvent(activePlan.id, 'LND_PERF_DATA', {
      actual_lw:    actualLw,
      vref:         vref,
      req_lnd_dist: reqLnd,
      rwy_cond:     rwyCond,
      qnh:          qnh || null,
      night:        nightStatus || null,
    });
  }, [actualLw, vref, reqLnd, rwyCond, qnh, nightStatus]); // eslint-disable-line

  useEffect(() => {
    if (activePlan?.dest) setIcao(activePlan.dest);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.dest]);

  // ── Fetch runways + extract airport coordinates ───────────────────────────
  const fetchRunways = useCallback(async (code) => {
    setLoading(true); setNoData(false); setRunways([]); setSelRwy(null); setAirportCoords(null);
    try {
      const url = `https://corsproxy.io/?https://ourairports.com/airports/${code}/runways.csv`;
      const resp = await fetch(url);
      const text = await resp.text();
      const lines = text.trim().split('\n').slice(1);
      const parsed = [];
      let latSum = 0, lonSum = 0, coordCount = 0;

      lines.forEach(line => {
        const cols = line.split(',');
        if (cols.length > 4) {
          const len  = parseInt(cols[3]);
          const id1  = cols[8]  ? cols[8].replace(/"/g,'').trim()  : '';
          const id2  = cols[14] ? cols[14].replace(/"/g,'').trim() : '';
          const lenFt = Math.round(len * 3.28084);

          // Extract coordinates from runway endpoints
          const lat1 = parseFloat(cols[9]);
          const lon1 = parseFloat(cols[10]);
          const lat2 = parseFloat(cols[15]);
          const lon2 = parseFloat(cols[16]);
          if (!isNaN(lat1) && !isNaN(lon1)) { latSum += lat1; lonSum += lon1; coordCount++; }
          if (!isNaN(lat2) && !isNaN(lon2)) { latSum += lat2; lonSum += lon2; coordCount++; }

          if (id1 && len) parsed.push({ id:id1, length:lenFt });
          if (id2 && len) parsed.push({ id:id2, length:lenFt });
        }
      });

      if (coordCount > 0) {
        setAirportCoords({ lat: latSum / coordCount, lon: lonSum / coordCount });
      }

      if (parsed.length > 0) { setRunways(parsed); setNoData(false); }
      else setNoData(true);
    } catch { setNoData(true); }
    setLoading(false);
  }, [setSelRwy]);

  useEffect(() => {
    if (icao.length === 4) fetchRunways(icao.toUpperCase());
  }, [icao, fetchRunways]);

  // ── Sunset/sunrise fetch ─────────────────────────────────────────────────
  useEffect(() => {
    if (!airportCoords) return;

    const fetchSunTimes = async () => {
      setNightLoading(true);
      try {
        // Uçuş tarihi — activePlan.date veya bugün
        const date = activePlan?.date
          ? (() => {
              // "12 MAY 2026" → "2026-05-12"
              const months = {JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
              const parts = activePlan.date.trim().split(/\s+/);
              if (parts.length === 3) {
                const d = parts[0].padStart(2,'0');
                const m = months[parts[1].toUpperCase()] || '01';
                const y = parts[2];
                return `${y}-${m}-${d}`;
              }
              return new Date().toISOString().slice(0,10);
            })()
          : new Date().toISOString().slice(0,10);

        const url = `https://api.sunrise-sunset.org/json?lat=${airportCoords.lat}&lng=${airportCoords.lon}&date=${date}&formatted=0`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (data.status === 'OK') {
          setSunsetInfo({
            sunrise:              new Date(data.results.sunrise),
            sunset:               new Date(data.results.sunset),
            civil_twilight_begin: new Date(data.results.civil_twilight_begin),
            civil_twilight_end:   new Date(data.results.civil_twilight_end),
          });
        }
      } catch { /* silent */ }
      setNightLoading(false);
    };

    fetchSunTimes();
  }, [airportCoords, activePlan?.date]);

  // ── Night status hesapla ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sunsetInfo) { setNightStatus(null); return; }

    // Iniş saati: önce gerçek iniş, yoksa ETA
    const landingTimeStr = flightData?.landingTime || activePlan?.eta;
    if (!landingTimeStr) { setNightStatus(null); return; }

    // HH:MM UTC → Date object (bugün veya uçuş tarihi)
    const [hStr, mStr] = landingTimeStr.replace(' Z','').replace('Z','').split(':');
    const h = parseInt(hStr), m = parseInt(mStr);
    if (isNaN(h) || isNaN(m)) { setNightStatus(null); return; }

    const landingDate = new Date(sunsetInfo.sunrise); // aynı günün tarihini al
    landingDate.setUTCHours(h, m, 0, 0);

    const { sunrise, sunset, civil_twilight_begin, civil_twilight_end } = sunsetInfo;

    if (landingDate < civil_twilight_begin || landingDate > civil_twilight_end) {
      setNightStatus('NIGHT');
    } else if (landingDate < sunrise || landingDate > sunset) {
      setNightStatus('TWILIGHT');
    } else {
      setNightStatus('DAY');
    }
  }, [sunsetInfo, flightData?.landingTime, activePlan?.eta]);

  // ── Calculations ──────────────────────────────────────────────────────────
  const runwayOk = divert ? !!(divertData.icao && divertData.rwy) : !!(selRwy || manualRwy);
  const atisOk   = !!arrAtis;
  const qnhOk    = !!qnh;

  useEffect(() => {
    if (!setStatus) return;
    if (runwayOk && atisOk && qnhOk) setStatus('green');
    else if (runwayOk || atisOk)     setStatus('amber');
    else                              setStatus('pending');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runwayOk, atisOk, qnhOk, setStatus]);

  const selectedRwy  = runways.find(r => r.id === selRwy);
  const divLenNum    = divertData.len ? parseInt(divertData.len.replace(/[^0-9]/g,'')) : null;
  const activeLenFt  = divert && divLenNum ? divLenNum
                     : selectedRwy ? selectedRwy.length
                     : (manualLen ? parseInt(manualLen.replace(/[^0-9]/g,'')) : null);

  const reqLndNum     = reqLnd ? parseInt(reqLnd.replace(/[^0-9]/g,'')) : null;
  const condObj       = RWY_CONDITIONS.find(c => c.id === rwyCond) || RWY_CONDITIONS[0];
  const reqLndAdjusted = reqLndNum ? Math.ceil(reqLndNum * condObj.factor) : null;
  const stopMargin    = activeLenFt && reqLndAdjusted ? activeLenFt - reqLndAdjusted : null;
  const marginColor   = getStopMarginColor(stopMargin);

  const planLw       = activePlan?.zfw ? `${parseInt(activePlan.zfw).toLocaleString()} lb` : '—';
  const actualLwNum  = actualLw ? parseInt(actualLw.replace(/[^0-9]/g,'')) : null;
  const lwExceeded   = actualLwNum && actualLwNum > 66000;

  const qnhInHg     = toInHg(qnh);
  const qnhLow      = qnh && parseFloat(qnh) < 950;
  const qnhHigh     = qnh && parseFloat(qnh) > 1050;

  return (
    <div>

      {/* ── ATIS ── */}
      <Title t="ATIS" />
      <AtisRow label="Arrival ATIS" value={arrAtis} onChange={setArrAtis} photo={arrPhoto} onPhoto={() => setArrPhoto(!arrPhoto)} />

      {/* ── QNH ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838' }}>
        <div>
          <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>QNH</span>
          {qnhInHg && <span style={{ fontSize:10, color:'#555', marginLeft:8 }}>{qnhInHg} inHg</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input
            value={qnh}
            onChange={e => setQnh(e.target.value)}
            placeholder="——"
            maxLength={4}
            style={{ ...iStyle, width:80, textAlign:'right',
              borderColor: qnhLow || qnhHigh ? '#e02020' : '#1a9bc4',
              color:       qnhLow || qnhHigh ? '#e02020' : '#1a9bc4',
            }}
          />
          <span style={{ fontSize:11, color:'#555', minWidth:28 }}>hPa</span>
        </div>
      </div>
      {qnhLow && (
        <div style={{ margin:'0 16px 4px', padding:'7px 10px', borderRadius:5, background:'rgba(224,32,32,0.08)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020', fontWeight:700 }}>
          LOW QNH ({qnh} hPa) — verify with ATC
        </div>
      )}

      {/* ── RWY Condition ── */}
      <div style={{ background:'#2a2a2a', borderBottom:'1px solid #383838', padding:'10px 16px' }}>
        <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase', marginBottom:8 }}>RWY Condition</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {RWY_CONDITIONS.map(c => (
            <button key={c.id} onClick={() => setRwyCond(c.id)}
              style={{
                background: rwyCond===c.id ? `${c.color}18` : '#2e2e2e',
                border: `1px solid ${rwyCond===c.id ? c.color : '#3a3a3a'}`,
                borderRadius:6, padding:'6px 10px', fontSize:11, fontWeight:600,
                color: rwyCond===c.id ? c.color : '#555',
                cursor:'pointer', fontFamily:'inherit',
              }}>
              {c.label}
            </button>
          ))}
        </div>
        {rwyCond !== 'DRY' && (
          <div style={{ marginTop:8, padding:'6px 10px', borderRadius:5, background:`${condObj.color}10`, borderLeft:`3px solid ${condObj.color}`, fontSize:11, color:condObj.color }}>
            Landing factor: ×{condObj.factor.toFixed(2)} — adjusted required distance will be shown below
          </div>
        )}
      </div>

      <Sep />

      {/* ── Landing Aerodrome & Runway ── */}
      <div style={{ opacity: divert ? 0.3 : 1, pointerEvents: divert ? 'none' : 'auto' }}>
        <Title t="Landing Aerodrome & Runway" />
        <div style={{ background:'#2e2e2e', borderBottom:'1px solid #383838', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600, width:80 }}>ICAO</span>
          <input value={icao} onChange={e => setIcao(e.target.value.toUpperCase())} maxLength={4} placeholder="LTBA"
            style={{ ...iStyle, width:90, textAlign:'center', letterSpacing:2 }} />
          {loading && <span style={{ fontSize:10, color:'#555' }}>Loading...</span>}

          {/* Night badge — sağda */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            {sunsetInfo && (
              <div style={{ fontSize:10, color:'#444', textAlign:'right', lineHeight:1.6 }}>
                <div>SR {sunsetInfo.sunrise.toISOString().slice(11,16)} Z</div>
                <div>SS {sunsetInfo.sunset.toISOString().slice(11,16)} Z</div>
              </div>
            )}
            <NightBadge status={nightStatus} loading={nightLoading} />
          </div>
        </div>

        {/* ETA / Landing time göster */}
        {(flightData?.landingTime || activePlan?.eta) && (
          <div style={{ padding:'7px 16px', background:'#222', borderBottom:'1px solid #383838', fontSize:10, color:'#555' }}>
            {flightData?.landingTime
              ? `Landing: ${flightData.landingTime} Z (actual)`
              : `ETA: ${activePlan.eta} Z (planned)`
            }
            {nightStatus && (
              <span style={{ marginLeft:10, color: nightStatus==='NIGHT'?'#1a9bc4': nightStatus==='TWILIGHT'?'#f0c040':'#2d9e5f' }}>
                → {nightStatus} landing
              </span>
            )}
          </div>
        )}

        {runways.length > 0 && (
          <div style={{ background:'#2a2a2a', borderBottom:'1px solid #383838', padding:'10px 16px' }}>
            <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase', marginBottom:8 }}>Select Runway</div>
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {runways.map(r => (
                <button key={r.id} onClick={() => setSelRwy(r.id)}
                  style={{ background: selRwy===r.id ? 'rgba(26,155,196,0.15)' : '#2e2e2e', border:`1px solid ${selRwy===r.id ? '#1a9bc4' : '#3a3a3a'}`, borderRadius:6, padding:'6px 12px', fontSize:12, fontWeight:600, color: selRwy===r.id ? '#1a9bc4' : '#555', cursor:'pointer', fontFamily:'inherit' }}>
                  {r.id} <span style={{ fontSize:10, color:'#555', marginLeft:3 }}>{r.length.toLocaleString()} ft</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {noData && (
          <div style={{ background:'#2a2a2a', borderBottom:'1px solid #383838', padding:'10px 16px' }}>
            <div style={{ marginBottom:8, padding:'8px 10px', borderRadius:5, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #ff9500', fontSize:11, color:'#c4882a' }}>
              No runway data available. Enter manually.
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input value={manualRwy} onChange={e => setManualRwy(e.target.value.toUpperCase())} placeholder="RWY" style={{ ...iStyle, width:80, textAlign:'center' }} />
              <input value={manualLen} onChange={e => setManualLen(e.target.value)} placeholder="Length (ft)" style={{ ...iStyle, flex:1, textAlign:'center' }} />
            </div>
          </div>
        )}
      </div>

      <Sep />

      {/* ── Landing Weights ── */}
      <Title t="OFP — Landing Weights" />
      <AutoRow label="Plan Landing Weight (ZFW)" value={planLw} />
      <AutoRow label="Max LWT"                   value="66,000 lb" />
      <EntryRow label="Actual Landing Weight" value={actualLw} onChange={setActualLw} unit="lb" placeholder="——" />
      {lwExceeded && (
        <div style={{ margin:'0 16px 4px', padding:'8px 12px', borderRadius:6, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020', fontWeight:700 }}>
          ACTUAL LW EXCEEDS MAX LWT (66,000 lb)
        </div>
      )}
      {actualLwNum && !lwExceeded && (
        <div style={{ margin:'0 16px 4px', padding:'8px 12px', borderRadius:6, background:'rgba(45,158,95,0.08)', borderLeft:'3px solid #2d9e5f', fontSize:11, color:'#2d9e5f' }}>
          LW OK — Margin: {(66000 - actualLwNum).toLocaleString()} lb below Max LWT
        </div>
      )}
      <EntryRow label="Vref" value={vref} onChange={setVref} unit="kt" placeholder="——" />

      <Sep />

      {/* ── Performance ── */}
      <Title t="Performance" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838' }}>
        <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>Req Landing Distance</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input style={{ ...iStyle, width:90, textAlign:'center' }} value={reqLnd} onChange={e => setReqLnd(e.target.value)} placeholder="——" />
          <span style={{ fontSize:11, color:'#555', width:16 }}>ft</span>
        </div>
      </div>

      {/* Adjusted distance (if condition not DRY) */}
      {reqLndNum && rwyCond !== 'DRY' && (
        <AutoRow
          label={`Adjusted (${condObj.label} ×${condObj.factor.toFixed(2)})`}
          value={`${reqLndAdjusted?.toLocaleString()} ft`}
          accent={condObj.color}
        />
      )}

      {/* Stop margin */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
        <span style={{ fontSize:12.5, color:'#666' }}>
          Stop Margin {divert && divertData.rwy ? `(DIVERT RWY ${divertData.rwy})` : selectedRwy ? `(RWY ${selectedRwy.id})` : manualRwy ? `(RWY ${manualRwy})` : ''}
          {rwyCond !== 'DRY' && <span style={{ fontSize:10, color:condObj.color, marginLeft:6 }}>[{condObj.label}]</span>}
        </span>
        <span style={{ fontSize:15, fontWeight:700, color: marginColor, fontFamily:'monospace' }}>
          {stopMargin !== null ? `${stopMargin.toLocaleString()} ft` : '—'}
        </span>
      </div>

      {/* Margin warnings */}
      {stopMargin !== null && stopMargin < 0 && (
        <div style={{ margin:'0 16px 4px', padding:'8px 12px', borderRadius:6, background:'rgba(224,32,32,0.12)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020', fontWeight:700 }}>
          ⚠ INSUFFICIENT RUNWAY — {Math.abs(stopMargin).toLocaleString()} ft SHORT
        </div>
      )}
      {stopMargin !== null && stopMargin >= 0 && stopMargin < 300 && (
        <div style={{ margin:'0 16px 4px', padding:'8px 12px', borderRadius:6, background:'rgba(232,115,26,0.1)', borderLeft:'3px solid #e8731a', fontSize:11, color:'#e8731a', fontWeight:600 }}>
          Low stop margin — exercise caution
        </div>
      )}

      <Sep />

      {/* ── DIVERT ── */}
      <div style={{ margin:'10px 16px', border:`1px solid ${divert ? 'rgba(255,149,0,0.3)' : '#333'}`, borderRadius:8, overflow:'hidden' }}>
        <div onClick={() => updateDivert('active', !divert)}
          style={{ background: divert ? 'rgba(255,149,0,0.1)' : '#1f1f1f', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', borderBottom: divert ? '1px solid rgba(255,149,0,0.2)' : 'none' }}>
          <span style={{ fontSize:12, fontWeight:700, color: divert ? '#e8731a' : '#555' }}>DIVERT</span>
          <div style={{ width:38, height:22, background: divert ? '#e8731a' : '#333', borderRadius:11, position:'relative', transition:'background 0.2s' }}>
            <div style={{ position:'absolute', width:18, height:18, background:'#fff', borderRadius:9, top:2, left: divert ? 18 : 2, transition:'left 0.2s' }} />
          </div>
        </div>
        {divert && (
          <div style={{ background:'#1e1e1e', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2 }}>Divert Aerodrome — Pilot Entry</div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { label:'ICAO',   val:divertData.icao, upd:(v)=>updateDivert('icao',v.toUpperCase()), max:4, ph:'ICAO', ls:2 },
                { label:'Runway', val:divertData.rwy,  upd:(v)=>updateDivert('rwy',v.toUpperCase()),  ph:'RWY' },
                { label:'Length', val:divertData.len,  upd:(v)=>updateDivert('len',v),                ph:'ft'  },
              ].map(f=>(
                <div key={f.label} style={{ flex:1 }}>
                  <div style={{ fontSize:9, color:'#555', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>{f.label}</div>
                  <input value={f.val} onChange={e=>f.upd(e.target.value)} placeholder={f.ph} maxLength={f.max}
                    style={{ ...iAmber, width:'100%', textAlign:'center', letterSpacing:f.ls||0 }}/>
                </div>
              ))}
            </div>
            <div style={{ padding:'8px 10px', borderRadius:5, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #e8731a', fontSize:11, color:'#c4882a' }}>
              Divert activated — destination updates across all pages.
            </div>
          </div>
        )}
      </div>

      <SyncButton />
    </div>
  );
}

export default LandingData;