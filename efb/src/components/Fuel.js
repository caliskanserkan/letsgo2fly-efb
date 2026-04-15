import React, { useState } from 'react';

const iStyle = {
  background: '#1a1a1a', border: '1.5px solid #1a9bc4', borderRadius: 7,
  padding: '8px 12px', fontSize: 15, fontWeight: 700, color: '#1a9bc4',
  textAlign: 'right', fontFamily: 'monospace', outline: 'none', width: 110,
};


function Row({ label, hint, value, onChange, display, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', minHeight:52 }}>
      <div>
        <div style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>{label}</div>
        {hint && <div style={{ fontSize:10, color: display ? '#1a9bc4' : '#555', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input
          style={{ ...iStyle, color: value ? '#1a9bc4' : '#444', borderColor: display && !value ? '#1a9bc4' : '#1a9bc4' }}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={display || '—'}
        />
        <span style={{ fontSize:11, color:'#555', minWidth:24 }}>{unit}</span>
      </div>
    </div>
  );
}

function Info({ label, value, color, big }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'#2a2a2a', borderBottom:'1px solid #383838' }}>
      <span style={{ fontSize:12.5, color:'#666' }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, fontWeight: big ? 700 : 400, color: color || '#999', fontFamily:'monospace' }}>{value}</span>
    </div>
  );
}

function Sep() {
  return <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />;
}

function Title({ t }) {
  return <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>{t}</div>;
}

const n = v => v ? parseInt(v.toString().replace(/,/g,'')) : null;
const fmt = v => v !== null ? v.toLocaleString() : null;

function Fuel() {
  const [upliftLt, setUpliftLt]   = useState('');
  const [density, setDensity]     = useState('0.78');
  const [remaining, setRemaining] = useState('');
  const [ramp, setRamp]           = useState('');

  const ofp = { trip:2713, cont:250, alt:533, fin:1447, minTO:4943, taxi:400, disc:7657, max:25120 };

  // Parse inputs
  const upliftLb   = upliftLt && density ? Math.round(parseFloat(upliftLt) * parseFloat(density) * 2.20462) : null;
  const remainingN = n(remaining);
  const rampN      = n(ramp);

  // Cross-talk: which two are filled → calculate third
  const has = { u: upliftLb !== null, r: remainingN !== null, p: rampN !== null };

  const autoRamp      = has.u && has.r && !has.p  ? upliftLb + remainingN : null;
  const autoRemaining = has.u && has.p && !has.r  ? rampN - upliftLb      : null;
  const autoUplift    = has.r && has.p && !has.u  ? rampN - remainingN    : null;

  const finalRamp = has.p ? rampN : autoRamp;
  const takeoff   = finalRamp ? finalRamp - ofp.taxi : null;

  return (
    <div>
      <Title t="Uplift" />
      <Row label="Uplift quantity" hint="From fuel receipt" value={upliftLt} onChange={v => { setUpliftLt(v); setRamp(''); }} unit="Lt" />
      <Row label="Density" hint="Default 0.78" value={density} onChange={setDensity} unit="kg/L" />
      <Row label="Uplift" hint={autoUplift ? "Auto calculated" : "Auto calculated"} display={fmt(upliftLb || autoUplift)} unit="lb" />

      <Sep />

      <Title t="Fuel Quantities" />
      <Row label="Remaining (last flight)" hint={autoRemaining ? "Auto calculated" : "From previous flight"} value={remaining} onChange={v => { setRemaining(v); setRamp(''); }} display={!has.r ? fmt(autoRemaining) : null} unit="lb" />
      <Row label="Ramp fuel" hint={autoRamp ? "Auto calculated" : "From aircraft indicator"} value={ramp} onChange={v => setRamp(v)} display={!has.p ? fmt(autoRamp) : null} unit="lb" />

      <Sep />

      <Title t="OFP — Planned Fuel" />
      <Info label="Trip"              value={`${ofp.trip.toLocaleString()} lb`} />
      <Info label="Contingency"       value={`${ofp.cont.toLocaleString()} lb`} />
      <Info label="Alternate (LTFM)"  value={`${ofp.alt.toLocaleString()} lb`} />
      <Info label="Final Reserve"     value={`${ofp.fin.toLocaleString()} lb`} />
      <Info label="Taxi"              value={`${ofp.taxi.toLocaleString()} lb`} />
      <Info label="Discretionary"     value={`${ofp.disc.toLocaleString()} lb`} />
      <Info label="MIN T/O FUEL"      value={`${ofp.minTO.toLocaleString()} lb`} color="#e8731a" />
      <Info label="Max Fuel (Tank)"   value={`${ofp.max.toLocaleString()} lb`} />

      <Sep />

      <Title t="Calculated" />
      <Info label="Take-off Fuel (Ramp - Taxi)" value={takeoff ? `${takeoff.toLocaleString()} lb` : '— lb'} color={takeoff ? '#1a9bc4' : '#444'} big />

      {takeoff !== null && takeoff < ofp.minTO && (
        <div style={{ margin:'10px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020', fontWeight:700 }}>
          WARNING: T/O fuel below minimum! Min: {ofp.minTO.toLocaleString()} lb
        </div>
      )}
      {takeoff !== null && takeoff >= ofp.minTO && (
        <div style={{ margin:'10px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(45,158,95,0.08)', borderLeft:'3px solid #2d9e5f', fontSize:11, color:'#6db890' }}>
          T/O fuel OK · Extra: {(takeoff - ofp.minTO).toLocaleString()} lb
        </div>
      )}
    </div>
  );
}

export default Fuel;