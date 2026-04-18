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

function SpeedRow({ label, value, onChange, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838' }}>
      <span style={{ fontSize:14, fontWeight:700, color:'#e8e8e8' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input style={{ ...iStyle, width:80, textAlign:'center' }} value={value} onChange={e => onChange(e.target.value)} placeholder="—" />
        <span style={{ fontSize:11, color:'#555', width:20 }}>{unit}</span>
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
          {photo ? '✓ Photo' : '📷 ATIS Photo'}
        </button>
      </div>
      <input style={{ ...iStyle, width:'100%' }} value={value} onChange={e => onChange(e.target.value)} placeholder="Enter ATIS information..." />
    </div>
  );
}

function RvsmRow({ label, value, onChange, elev }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 12px', borderBottom:'1px solid rgba(45,158,95,0.1)' }}>
      <span style={{ fontSize:11.5, color:'#777' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
        <input style={{ background:'#1a1a1a', border:'1.5px solid rgba(45,158,95,0.5)', borderRadius:5, padding:'5px 8px', fontSize:13, fontWeight:700, color:'#2d9e5f', fontFamily:'monospace', outline:'none', textAlign:'center', width:80 }}
          value={value} onChange={e => onChange(e.target.value)} placeholder="——" />
        <span style={{ fontSize:10, color:'#555' }}>ft</span>
      </div>
    </div>
  );
}

function TakeoffData({ setStatus, activePlan }) {
  const dep = activePlan?.dep || 'LTAC';

  const [icao, setIcao]         = useState(dep);
  const [runways, setRunways]   = useState([]);
  const [selRwy, setSelRwy]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [noData, setNoData]     = useState(false);

  const [manualRwy, setManualRwy] = useState('');
  const [manualLen, setManualLen] = useState('');

  const [depAtis, setDepAtis]   = useState('');
  const [depPhoto, setDepPhoto] = useState(false);

  const [sid, setSid]   = useState('');
  const [fl, setFl]     = useState('');
  const [sq, setSq]     = useState('');
  const [oth, setOth]   = useState('');
  const [dclPhoto, setDclPhoto] = useState(false);

  const [v1, setV1]     = useState('');
  const [vr, setVr]     = useState('');
  const [v2, setV2]     = useState('');
  const [vse, setVse]   = useState('');
  const [trim, setTrim] = useState('');
  const [reqRw, setReqRw] = useState('');

  const [rvsm1, setRvsm1]     = useState('');
  const [rvsmSby, setRvsmSby] = useState('');
  const [rvsm2, setRvsm2]     = useState('');

  // Update ICAO when activePlan changes
  useEffect(() => {
    if (activePlan?.dep) setIcao(activePlan.dep);
  }, [activePlan?.dep]);

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
          const len = parseInt(cols[3]);
          const id1 = cols[8]  ? cols[8].replace(/"/g,'').trim()  : '';
          const id2 = cols[14] ? cols[14].replace(/"/g,'').trim() : '';
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

  const runwayOk = !!(selRwy || manualRwy);
  const speedsOk = !!(v1 && vr && v2);
  const atisOk   = !!depAtis;

  useEffect(() => {
    if (!setStatus) return;
    if (runwayOk && speedsOk && atisOk) setStatus('green');
    else if (runwayOk || speedsOk || atisOk) setStatus('amber');
    else setStatus('pending');
  }, [runwayOk, speedsOk, atisOk, setStatus]);

  const selectedRwy = runways.find(r => r.id === selRwy);
  const activeLenFt = selectedRwy ? selectedRwy.length
                    : (manualLen ? parseInt(manualLen.replace(/[^0-9]/g,'')) : null);
  const reqRwNum    = reqRw ? parseInt(reqRw.replace(/[^0-9]/g,'')) : null;
  const stopMargin  = activeLenFt && reqRwNum ? activeLenFt - reqRwNum : null;
  const marginColor = getStopMarginColor(stopMargin);

  // OFP weights from activePlan
  const tow  = activePlan?.tow ? `${parseInt(activePlan.tow).toLocaleString()} lb` : '—';
  const zfw  = activePlan?.zfw ? `${parseInt(activePlan.zfw).toLocaleString()} lb` : '—';

  return (
    <div>
      <Title t="ATIS" />
      <AtisRow label="Departure ATIS" value={depAtis} onChange={setDepAtis} photo={depPhoto} onPhoto={() => setDepPhoto(!depPhoto)} />

      <Sep />

      <Title t="Departure Aerodrome & Runway" />
      <div style={{ background:'#2e2e2e', borderBottom:'1px solid #383838', padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600, width:80 }}>ICAO</span>
        <input value={icao} onChange={e => setIcao(e.target.value.toUpperCase())} maxLength={4} placeholder="LTAC"
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
          <div style={{ margin:'0 0 8px', padding:'8px 10px', borderRadius:5, background:'rgba(255,149,0,0.08)', borderLeft:'3px solid #ff9500', fontSize:11, color:'#c4882a' }}>
            ⚠ No runway data available. Enter manually.
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input value={manualRwy} onChange={e => setManualRwy(e.target.value.toUpperCase())} placeholder="RWY"
              style={{ ...iStyle, width:90, textAlign:'center' }} />
            <input value={manualLen} onChange={e => setManualLen(e.target.value)} placeholder="Length (ft)"
              style={{ ...iStyle, flex:1, textAlign:'center' }} />
          </div>
        </div>
      )}

      <Sep />

      <Title t="OFP — Weight & Performance" />
      <AutoRow label="TOW"  value={tow} />
      <AutoRow label="ZFW"  value={zfw} />
      <AutoRow label="MZFW" value="49,000 lb" />
      <AutoRow label="MTOW" value="74,600 lb" />
      <AutoRow label="MLWT" value="66,000 lb" />

      <Sep />

      <Title t="Performance Speeds — Pilot Entry" />
      <SpeedRow label="V1"   value={v1}   onChange={setV1}   unit="kt" />
      <SpeedRow label="VR"   value={vr}   onChange={setVr}   unit="kt" />
      <SpeedRow label="V2"   value={v2}   onChange={setV2}   unit="kt" />
      <SpeedRow label="VSE"  value={vse}  onChange={setVse}  unit="kt" />
      <SpeedRow label="Trim" value={trim} onChange={setTrim} unit="°"  />

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838' }}>
        <span style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>Req RWY Length</span>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input style={{ ...iStyle, width:90, textAlign:'center' }} value={reqRw} onChange={e => setReqRw(e.target.value)} placeholder="——" />
          <span style={{ fontSize:11, color:'#555', width:16 }}>ft</span>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
        <span style={{ fontSize:12.5, color:'#666' }}>
          Stop Margin {selectedRwy ? `(RWY ${selectedRwy.id})` : manualRwy ? `(RWY ${manualRwy})` : ''}
        </span>
        <span style={{ fontSize:15, fontWeight:700, color: marginColor, fontFamily:'monospace' }}>
          {stopMargin !== null ? `${stopMargin.toLocaleString()} ft` : '—'}
        </span>
      </div>

      <Sep />

      <div style={{ margin:'10px 16px', border:'1px solid #383838', borderRadius:8, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', borderBottom:'1px solid #383838', padding:'8px 12px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontSize:10, color:'#777', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase' }}>ATC CLR / DCL</span>
          <button onClick={() => setDclPhoto(!dclPhoto)}
            style={{ background: dclPhoto ? 'rgba(45,158,95,0.15)' : '#2a2a2a', border:`1px solid ${dclPhoto ? '#2d9e5f' : '#444'}`, borderRadius:6, padding:'4px 10px', fontSize:10, fontWeight:700, color: dclPhoto ? '#2d9e5f' : '#777', cursor:'pointer', fontFamily:'inherit' }}>
            {dclPhoto ? '✓ Uploaded' : '📷 DCL Upload'}
          </button>
        </div>
        <div style={{ padding:'10px 12px', background:'#2a2a2a', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {[
            { label:'SID', value:sid, onChange:setSid },
            { label:'FL',  value:fl,  onChange:setFl  },
            { label:'SQ',  value:sq,  onChange:setSq  },
            { label:'OTH', value:oth, onChange:setOth },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>{f.label}</div>
              <input style={{ ...iStyle, width:'100%', textAlign:'left', fontSize:13 }} value={f.value} onChange={e => f.onChange(e.target.value)} placeholder="——" />
            </div>
          ))}
        </div>
      </div>

      <Sep />

      <div style={{ margin:'10px 16px', background:'rgba(45,158,95,0.06)', border:'1px solid rgba(45,158,95,0.2)', borderRadius:8, overflow:'hidden' }}>
        <div style={{ background:'rgba(45,158,95,0.15)', color:'#2d9e5f', padding:'7px 12px', fontSize:10, fontWeight:700, letterSpacing:0.7, textTransform:'uppercase', borderBottom:'1px solid rgba(45,158,95,0.2)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>RVSM — Ground Altimeter Check</span>
          <span style={{ fontSize:9, color:'#555' }}>{dep} ELEV</span>
        </div>
        <RvsmRow label="PRI 1 (ALT)"  value={rvsm1}   onChange={setRvsm1} />
        <RvsmRow label="SBY ALT"      value={rvsmSby} onChange={setRvsmSby} />
        <RvsmRow label="PRI 2 (ALT)"  value={rvsm2}   onChange={setRvsm2} />
      </div>

      <SyncButton />
    </div>
  );
}

export default TakeoffData;