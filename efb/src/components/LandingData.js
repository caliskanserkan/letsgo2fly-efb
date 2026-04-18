import React, { useState, useEffect } from 'react';
import SyncButton from './SyncButton';

function getStopMarginColor(margin) {
  if (margin === null) return '#999';
  if (margin > 500)  return '#2d9e5f';
  if (margin > 300)  return '#f0c040';
  if (margin > 100)  return '#e8731a';
  return '#e02020';
}

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

function AutoRow({ label, value }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
      <span style={{ fontSize:12.5, color:'#666' }}>{label}</span>
      <span style={{ fontSize:12.5, color:'#999', fontFamily:'monospace' }}>{value}</span>
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
          {photo ? '✓ Photo' : '📷 ATIS Photo'}
        </button>
      </div>
      <input style={{ ...iStyle, width:'100%' }} value={value} onChange={e => onChange(e.target.value)} placeholder="Enter ATIS information..." />
    </div>
  );
}

function LandingData({ flightData, divertData, updateDivert, setStatus, activePlan }) {
  const [icao, setIcao]           = useState(activePlan?.dest || 'LTBA');
  const [runways, setRunways]     = useState([]);
  const [selRwy, setSelRwy]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [noData, setNoData]       = useState(false);
  const [manualRwy, setManualRwy] = useState('');
  const [manualLen, setManualLen] = useState('');
  const [arrAtis, setArrAtis]     = useState('');
  const [arrPhoto, setArrPhoto]   = useState(false);
  const [reqLnd, setReqLnd]       = useState('');

  const divert = divertData.active;

  // activePlan değişince ICAO'yu güncelle
  useEffect(() => {
    if (activePlan?.dest) setIcao(activePlan.dest);
  }, [activePlan?.dest]);

  const fetchRunways = async (code) => {
    setLoading(true);
    setNoData(false);
    setRunways([]);
    setSelRwy(null);
    try {
      const url = `https://corsproxy.io/?https://ourairports.com/airports/${code}/runways.csv`;
      const resp = await fetch(url);
      const text = await resp.text();
      const lines = text.trim().split('\n').slice(1);
      const parsed = [];
      lines.forEach(line => {
        const cols = line.split(',');
        if (cols.length > 4) {
          const len   = parseInt(cols[3]);
          const id1   = cols[8]  ? cols[8].replace(/"/g,'').trim()  : '';
          const id2   = cols[14] ? cols[14].replace(/"/g,'').trim() : '';
          const lenFt = Math.round(len * 3.28084);
          if (id1 && len) parsed.push({ id:id1, length:lenFt });
          if (id2 && len) parsed.push({ id:id2, length:lenFt });
        }
      });
      if (parsed.length > 0) { setRunways(parsed); setNoData(false); }
      else { setNoData(true); }
    } catch { setNoData(true); }
    setLoading(false);
  };

  useEffect(() => {
    if (icao.length === 4) fetchRunways(icao.toUpperCase());
  }, [icao]);

  const runwayOk = divert ? !!(divertData.icao && divertData.rwy) : !!(selRwy || manualRwy);
  const atisOk   = !!arrAtis;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!setStatus) return;
    if (runwayOk && atisOk) setStatus('green');
    else if (runwayOk || atisOk) setStatus('amber');
    else setStatus('pending');
  }, [runwayOk, atisOk, setStatus]);

  const selectedRwy = runways.find(r => r.id === selRwy);
  const divLenNum   = divertData.len ? parseInt(divertData.len.replace(/[^0-9]/g,'')) : null;
  const activeLenFt = divert && divLenNum ? divLenNum
                    : selectedRwy ? selectedRwy.length
                    : (manualLen ? parseInt(manualLen.replace(/[^0-9]/g,'')) : null);
  const reqLndNum   = reqLnd ? parseInt(reqLnd.replace(/[^0-9]/g,'')) : null;
  const stopMargin  = activeLenFt && reqLndNum ? activeLenFt - reqLndNum : null;
  const marginColor = getStopMarginColor(stopMargin);

  // OFP landing weights from activePlan
  const landingWeight = activePlan?.zfw
    ? `${parseInt(activePlan.zfw).toLocaleString()} lb`
    : '—';
  const maxLwt = activePlan?.ac_type?.startsWith('GLF') ? '66,000 lb' : '66,000 lb';

  return (
    <div>
      <Title t="ATIS" />
      <AtisRow label="Arrival ATIS" value={arrAtis} onChange={setArrAtis} photo={arrPhoto} onPhoto={() => setArrPhoto(!arrPhoto)} />

      <Sep />

      <div style={{ opacity: divert ? 0.3 : 1, pointerEvents: divert ? 'none' : 'auto' }}>
        <Title t="Landing Aerodrome & Runway" />
        <div style={{ background:'#2e2e2e', borderBottom:'1px solid #383838', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600, width:80 }}>ICAO</span>
          <input value={icao} onChange={e => setIcao(e.target.value.toUpperCase())} maxLength={4} placeholder="LTBA"
            style={{ ...iStyle, width:90, textAlign:'center', letterSpacing:2 }} />
          {loading && <span style={{ fontSize:10, color:'#555' }}>Loading...</span>}
        </div>

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
              ⚠ No runway data available. Enter manually.
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input value={manualRwy} onChange={e => setManualRwy(e.target.value.toUpperCase())} placeholder="RWY"
                style={{ ...iStyle, width:80, textAlign:'center' }} />
              <input value={manualLen} onChange={e => setManualLen(e.target.value)} placeholder="Length (ft)"
                style={{ ...iStyle, flex:1, textAlign:'center' }} />
            </div>
          </div>
        )}
      </div>

      <Sep />

      <Title t="OFP — Landing Weights" />
      <AutoRow label="Landing Weight" value={landingWeight} />
      <AutoRow label="Max LWT"        value={maxLwt} />
      <AutoRow label="Vref"           value="— kt" />

      <Sep />

      <Title t="Performance" />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838' }}>
        <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>Req Landing Distance</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input style={{ ...iStyle, width:90, textAlign:'center' }} value={reqLnd} onChange={e => setReqLnd(e.target.value)} placeholder="——" />
          <span style={{ fontSize:11, color:'#555', width:16 }}>ft</span>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
        <span style={{ fontSize:12.5, color:'#666' }}>
          Stop Margin {divert && divertData.rwy ? `(DIVERT RWY ${divertData.rwy})`
                     : selectedRwy ? `(RWY ${selectedRwy.id})`
                     : manualRwy ? `(RWY ${manualRwy})` : ''}
        </span>
        <span style={{ fontSize:15, fontWeight:700, color: marginColor, fontFamily:'monospace' }}>
          {stopMargin !== null ? `${stopMargin.toLocaleString()} ft` : '—'}
        </span>
      </div>

      <Sep />

      <div style={{ margin:'10px 16px', border:`1px solid ${divert ? 'rgba(255,149,0,0.3)' : '#333'}`, borderRadius:8, overflow:'hidden' }}>
        <div onClick={() => updateDivert('active', !divert)}
          style={{ background: divert ? 'rgba(255,149,0,0.1)' : '#1f1f1f', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', borderBottom: divert ? '1px solid rgba(255,149,0,0.2)' : 'none' }}>
          <span style={{ fontSize:12, fontWeight:700, color: divert ? '#e8731a' : '#555' }}>⚠ DIVERT</span>
          <div style={{ width:38, height:22, background: divert ? '#e8731a' : '#333', borderRadius:11, position:'relative', transition:'background 0.2s' }}>
            <div style={{ position:'absolute', width:18, height:18, background:'#fff', borderRadius:9, top:2, left: divert ? 18 : 2, transition:'left 0.2s' }} />
          </div>
        </div>

        {divert && (
          <div style={{ background:'#1e1e1e', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ fontSize:10, color:'#e8731a', fontWeight:700, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2 }}>
              Divert Aerodrome — Pilot Entry
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:'#555', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>ICAO</div>
                <input value={divertData.icao} onChange={e => updateDivert('icao', e.target.value.toUpperCase())} placeholder="ICAO" maxLength={4}
                  style={{ ...iAmber, width:'100%', textAlign:'center', letterSpacing:2 }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:'#555', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>Runway</div>
                <input value={divertData.rwy} onChange={e => updateDivert('rwy', e.target.value.toUpperCase())} placeholder="RWY"
                  style={{ ...iAmber, width:'100%', textAlign:'center' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:'#555', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>Length</div>
                <input value={divertData.len} onChange={e => updateDivert('len', e.target.value)} placeholder="ft"
                  style={{ ...iAmber, width:'100%', textAlign:'center' }} />
              </div>
            </div>
            <div style={{ padding:'8px 10px', borderRadius:5, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #e8731a', fontSize:11, color:'#c4882a' }}>
              ⚠ Divert activated — destination updates across all pages.
            </div>
          </div>
        )}
      </div>

      <SyncButton />
    </div>
  );
}

export default LandingData;