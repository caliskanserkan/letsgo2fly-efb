import React, { useState, useEffect } from 'react';

const LB_PER_KG = 2.20462;

function ltToLb(lt, density) {
  if (!lt || !density) return null;
  return Math.round(parseFloat(lt) * parseFloat(density) * LB_PER_KG);
}

function lbToLt(lb, density) {
  if (!lb || !density) return null;
  return Math.round(parseFloat(lb) / LB_PER_KG / parseFloat(density));
}

function n(v) {
  if (!v && v !== 0) return null;
  const parsed = parseInt(v.toString().replace(/,/g,''));
  return isNaN(parsed) ? null : parsed;
}

function fmt(v) {
  if (v === null || v === undefined) return '';
  return v.toLocaleString();
}

function Sep() {
  return <div style={{ height:12, background:'#1e1e1e', borderTop:'1px solid #383838', borderBottom:'1px solid #383838' }} />;
}

function Title({ t }) {
  return <div style={{ fontSize:10, color:'#555', fontWeight:700, letterSpacing:0.9, padding:'12px 16px 5px', textTransform:'uppercase' }}>{t}</div>;
}

function EntryRow({ label, hint, value, onChange, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#2e2e2e', borderBottom:'1px solid #383838', minHeight:52 }}>
      <div>
        <div style={{ fontSize:12.5, color:'#e8e8e8', fontWeight:600 }}>{label}</div>
        {hint && <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="—"
          style={{ background:'#1a1a1a', border:'1.5px solid #1a9bc4', borderRadius:6, padding:'7px 10px', fontSize:14, fontWeight:700, color:'#1a9bc4', fontFamily:'monospace', outline:'none', textAlign:'right', width:100 }} />
        <span style={{ fontSize:11, color:'#555', minWidth:28 }}>{unit}</span>
      </div>
    </div>
  );
}

function AutoRow({ label, hint, value, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background:'#252525', borderBottom:'1px solid #383838', minHeight:52 }}>
      <div>
        <div style={{ fontSize:12.5, color:'#888', fontWeight:400 }}>{label}</div>
        {hint && <div style={{ fontSize:10, color:'#2d9e5f', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <div style={{ background:'#1e1e1e', border:'1.5px solid #2d9e5f', borderRadius:6, padding:'7px 10px', fontSize:14, fontWeight:700, color: value ? '#2d9e5f' : '#444', fontFamily:'monospace', textAlign:'right', width:100, minHeight:34, display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
          {value || '—'}
        </div>
        <span style={{ fontSize:11, color:'#555', minWidth:28 }}>{unit}</span>
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

function Fuel({ setStatus, activePlan }) {
  const [density, setDensity]     = useState('0.78');
  const [upliftLt, setUpliftLt]   = useState('');
  const [upliftLb, setUpliftLb]   = useState('');
  const [remaining, setRemaining] = useState('');
  const [totalFuel, setTotalFuel] = useState('');

  // OFP fuel values from activePlan
  const ofp = {
    trip:  n(activePlan?.trip_fuel)      || 0,
    alt:   n(activePlan?.alternate_fuel) || 0,
    fin:   n(activePlan?.reserve_fuel)   || 0,
    cont:  0,   // parsed from raw_text in EFP, not stored separately
    taxi:  400, // standard
    disc:  0,
    minTO: 0,
    max:   0,
  };

  // Calculate minTO = trip + cont + alt + fin + taxi
  ofp.minTO = ofp.trip + ofp.cont + ofp.alt + ofp.fin + ofp.taxi;

  // FOB from activePlan
  const planFob = n(activePlan?.fob?.replace(/[^\d]/g,'')) || null;

  // Alternate ICAO
  const altIcao = activePlan?.alternate || 'ALTN';

  const handleUpliftLt = (val) => {
    setUpliftLt(val);
    const lb = ltToLb(val, density);
    setUpliftLb(lb !== null ? lb.toString() : '');
  };

  const handleUpliftLb = (val) => {
    setUpliftLb(val);
    const lt = lbToLt(n(val), density);
    setUpliftLt(lt !== null ? lt.toString() : '');
  };

  const handleDensity = (val) => {
    setDensity(val);
    if (upliftLt) {
      const lb = ltToLb(upliftLt, val);
      setUpliftLb(lb !== null ? lb.toString() : '');
    } else if (upliftLb) {
      const lt = lbToLt(n(upliftLb), val);
      setUpliftLt(lt !== null ? lt.toString() : '');
    }
  };

  const upliftN    = n(upliftLb);
  const remainingN = n(remaining);
  const totalN     = n(totalFuel);

  const autoTotal     = upliftN !== null && remainingN !== null && totalN === null ? upliftN + remainingN : null;
  const autoRemaining = upliftN !== null && totalN !== null && remainingN === null ? totalN - upliftN : null;
  const autoUplift    = remainingN !== null && totalN !== null && upliftN === null ? totalN - remainingN : null;

  const finalTotal  = totalN !== null ? totalN : autoTotal;
  const finalUplift = upliftN !== null ? upliftN : autoUplift;
  const takeoff     = finalTotal !== null ? finalTotal - ofp.taxi : null;

  useEffect(() => {
    if (!setStatus) return;
    const fuelOk = finalTotal !== null && finalUplift !== null;
    if (fuelOk) setStatus('green');
    else if (upliftLt || upliftLb || remaining || totalFuel) setStatus('amber');
    else setStatus('pending');
  }, [upliftLt, upliftLb, remaining, totalFuel, finalTotal, finalUplift, setStatus]);

  return (
    <div>
      <Title t="Uplift" />
      <EntryRow label="Density" hint="kg/lt — adjust for temperature" value={density} onChange={handleDensity} unit="kg/lt" />
      <EntryRow label="Uplift" hint="Litres (from fuel receipt)" value={upliftLt} onChange={handleUpliftLt} unit="Lt" />
      <EntryRow label="Uplift" hint="Pounds" value={upliftLb} onChange={handleUpliftLb} unit="lb" />
      {autoUplift !== null && <AutoRow label="Uplift" hint="Auto calculated" value={fmt(autoUplift)} unit="lb" />}

      <Sep />

      <Title t="Fuel Quantities" />
      <EntryRow label="Remaining (last flight)" hint="From previous flight" value={remaining} onChange={setRemaining} unit="lb" />
      {autoRemaining !== null && <AutoRow label="Remaining" hint="Auto calculated" value={fmt(autoRemaining)} unit="lb" />}
      <EntryRow label="Total / Ramp Fuel" hint="From aircraft indicator" value={totalFuel} onChange={setTotalFuel} unit="lb" />
      {autoTotal !== null && <AutoRow label="Total / Ramp Fuel" hint="Auto calculated (Uplift + Remaining)" value={fmt(autoTotal)} unit="lb" />}

      <Sep />

      <Title t="Calculated" />
      <Info label="Take-off Fuel (Ramp - Taxi)" value={takeoff !== null ? `${fmt(takeoff)} lb` : '--- lb'} color={takeoff !== null ? '#1a9bc4' : '#444'} big />

      {takeoff !== null && ofp.minTO > 0 && takeoff < ofp.minTO && (
        <div style={{ margin:'10px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(224,32,32,0.1)', borderLeft:'3px solid #e02020', fontSize:11, color:'#e02020', fontWeight:700 }}>
          WARNING: T/O fuel below minimum! Min: {fmt(ofp.minTO)} lb
        </div>
      )}
      {takeoff !== null && ofp.minTO > 0 && takeoff >= ofp.minTO && (
        <div style={{ margin:'10px 16px', padding:'10px 12px', borderRadius:6, background:'rgba(45,158,95,0.08)', borderLeft:'3px solid #2d9e5f', fontSize:11, color:'#6db890' }}>
          T/O fuel OK — Extra: {fmt(takeoff - ofp.minTO)} lb
        </div>
      )}

      <Sep />

      <Title t="OFP - Planned Fuel" />
      <Info label="Trip"                         value={ofp.trip  ? `${fmt(ofp.trip)} lb`  : '— lb'} />
      <Info label="Contingency"                  value={ofp.cont  ? `${fmt(ofp.cont)} lb`  : '— lb'} />
      <Info label={`Alternate (${altIcao})`}     value={ofp.alt   ? `${fmt(ofp.alt)} lb`   : '— lb'} />
      <Info label="Final Reserve"                value={ofp.fin   ? `${fmt(ofp.fin)} lb`   : '— lb'} />
      <Info label="Taxi"                         value={`${fmt(ofp.taxi)} lb`} />
      <Info label="MIN T/O FUEL"                 value={ofp.minTO ? `${fmt(ofp.minTO)} lb` : '— lb'} color="#e8731a" />
      {planFob && <Info label="Total FOB (OFP)"  value={`${fmt(planFob)} lb`} color="#1a9bc4" />}
    </div>
  );
}

export default Fuel;