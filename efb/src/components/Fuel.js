import React, { useEffect, useRef } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { logEvent } from '../supabaseClient';

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

function SectionTitle({ title, icon }) {
  return (
    <div style={{ padding:'16px 16px 8px', display:'flex', alignItems:'center', gap:8 }}>
      {icon && <span style={{ fontSize:16 }}>{icon}</span>}
      <span style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>{title}</span>
    </div>
  );
}

function EntryRow({ label, hint, value, onChange, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>{label}</div>
        {hint && <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="—"
          style={{ background:'#0f172a', border:'1.5px solid #38bdf8', borderRadius:10, padding:'9px 12px', fontSize:15, fontWeight:700, color:'#38bdf8', fontFamily:'monospace', outline:'none', textAlign:'right', width:110, WebkitAppearance:'none' }} />
        <span style={{ fontSize:12, color:'#475569', minWidth:30, textAlign:'left' }}>{unit}</span>
      </div>
    </div>
  );
}

function AutoRow({ label, hint, value, unit }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56, background:'rgba(74,222,128,0.03)' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, color:'#94a3b8' }}>{label}</div>
        {hint && <div style={{ fontSize:11, color:'#4ade80', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ background:'#0f172a', border:'1.5px solid #4ade80', borderRadius:10, padding:'9px 12px', fontSize:15, fontWeight:700, color: value ? '#4ade80' : '#334155', fontFamily:'monospace', textAlign:'right', width:110, minHeight:38, display:'flex', alignItems:'center', justifyContent:'flex-end' }}>
          {value || '—'}
        </div>
        <span style={{ fontSize:12, color:'#475569', minWidth:30 }}>{unit}</span>
      </div>
    </div>
  );
}

function InfoRow({ label, value, color, big }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:48 }}>
      <span style={{ fontSize:13, color:'#475569', flex:1 }}>{label}</span>
      <span style={{ fontSize: big ? 18 : 13, fontWeight: big ? 700 : 500, color: color || '#94a3b8', fontFamily:'monospace' }}>{value}</span>
    </div>
  );
}

function Fuel({ setStatus, activePlan }) {
  const [density,   setDensity]   = usePersistedState('efb_fuel_density',   '0.78');
  const [upliftLt,  setUpliftLt]  = usePersistedState('efb_fuel_upliftLt',  '');
  const [upliftLb,  setUpliftLb]  = usePersistedState('efb_fuel_upliftLb',  '');
  const [remaining, setRemaining] = usePersistedState('efb_fuel_remaining', '');
  const [totalFuel, setTotalFuel] = usePersistedState('efb_fuel_totalFuel', '');
  const loggedRef = useRef(false);

  const ofp = {
    trip: n(activePlan?.trip_fuel)      || 0,
    alt:  n(activePlan?.alternate_fuel) || 0,
    fin:  n(activePlan?.reserve_fuel)   || 0,
    cont: 0,
    taxi: 400,
  };
  ofp.minTO = ofp.trip + ofp.cont + ofp.alt + ofp.fin + ofp.taxi;

  const planFob = n(activePlan?.fob?.replace(/[^\d]/g,'')) || null;
  const altIcao = activePlan?.alternate || 'ALTN';

  const handleUpliftLt = (val) => {
    setUpliftLt(val);
    const lb = ltToLb(val, density);
    setUpliftLb(lb !== null ? lb.toString() : '');
    loggedRef.current = false;
  };

  const handleUpliftLb = (val) => {
    setUpliftLb(val);
    const lt = lbToLt(n(val), density);
    setUpliftLt(lt !== null ? lt.toString() : '');
    loggedRef.current = false;
  };

  const handleDensity = (val) => {
    setDensity(val);
    if (upliftLt) { const lb = ltToLb(upliftLt, val); setUpliftLb(lb !== null ? lb.toString() : ''); }
    else if (upliftLb) { const lt = lbToLt(n(upliftLb), val); setUpliftLt(lt !== null ? lt.toString() : ''); }
    loggedRef.current = false;
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

  const fuelOk = takeoff !== null && ofp.minTO > 0 && takeoff >= ofp.minTO;
  const fuelWarn = takeoff !== null && ofp.minTO > 0 && takeoff < ofp.minTO;

  useEffect(() => {
    if (!setStatus) return;
    const complete = finalTotal !== null && finalUplift !== null;
    if (complete) {
      setStatus('green');
      if (!loggedRef.current) {
        loggedRef.current = true;
        logEvent(activePlan?.id, 'FUEL_CHECKED', { uplift_lb:finalUplift, uplift_lt:upliftLt, total_lb:finalTotal, takeoff_lb:takeoff, density, min_to_lb:ofp.minTO, fob_ok:takeoff>=ofp.minTO });
      }
    } else if (upliftLt || upliftLb || remaining || totalFuel) {
      setStatus('amber');
    } else {
      setStatus('pending');
    }
  }, [upliftLt, upliftLb, remaining, totalFuel, finalTotal, finalUplift, setStatus]); // eslint-disable-line

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>

      {/* T/O Fuel Summary Card */}
      {takeoff !== null && (
        <div style={{ margin:'12px 12px 4px', background: fuelWarn ? 'rgba(239,68,68,0.08)' : fuelOk ? 'rgba(74,222,128,0.06)' : 'rgba(56,189,248,0.06)', border:`1.5px solid ${fuelWarn ? '#ef4444' : fuelOk ? '#4ade80' : '#38bdf8'}`, borderRadius:16, padding:'16px' }}>
          <div style={{ fontSize:11, color: fuelWarn ? '#ef4444' : fuelOk ? '#4ade80' : '#38bdf8', fontWeight:600, letterSpacing:'1px', marginBottom:6 }}>
            {fuelWarn ? '⚠️ FUEL WARNING' : fuelOk ? '✅ FUEL OK' : '⛽ TAKE-OFF FUEL'}
          </div>
          <div style={{ fontSize:28, fontWeight:700, color: fuelWarn ? '#ef4444' : fuelOk ? '#4ade80' : '#38bdf8', fontFamily:'monospace' }}>
            {fmt(takeoff)} <span style={{ fontSize:14, fontWeight:400 }}>lb</span>
          </div>
          {fuelWarn && <div style={{ fontSize:12, color:'#ef4444', marginTop:6 }}>Below minimum! Min: {fmt(ofp.minTO)} lb</div>}
          {fuelOk   && <div style={{ fontSize:12, color:'#4ade80', marginTop:6 }}>Extra: +{fmt(takeoff - ofp.minTO)} lb above minimum</div>}
        </div>
      )}

      {/* Uplift Section */}
      <SectionTitle title="Uplift" icon="⛽" />
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <EntryRow label="Density"    hint="kg/lt — adjust for temperature" value={density}  onChange={handleDensity}  unit="kg/lt" />
        <EntryRow label="Uplift"     hint="Litres (from fuel receipt)"     value={upliftLt} onChange={handleUpliftLt} unit="Lt" />
        <EntryRow label="Uplift"     hint="Pounds"                         value={upliftLb} onChange={handleUpliftLb} unit="lb" />
        {autoUplift !== null && <AutoRow label="Uplift (auto)" hint="Calculated from Total − Remaining" value={fmt(autoUplift)} unit="lb" />}
      </div>

      {/* Fuel Quantities */}
      <SectionTitle title="Fuel Quantities" icon="🔢" />
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <EntryRow label="Remaining"       hint="From previous flight"          value={remaining}  onChange={setRemaining}  unit="lb" />
        {autoRemaining !== null && <AutoRow label="Remaining (auto)" hint="Calculated from Total − Uplift" value={fmt(autoRemaining)} unit="lb" />}
        <EntryRow label="Total / Ramp"    hint="From aircraft fuel indicator"   value={totalFuel}  onChange={setTotalFuel}  unit="lb" />
        {autoTotal !== null && <AutoRow label="Total / Ramp (auto)" hint="Calculated from Uplift + Remaining" value={fmt(autoTotal)} unit="lb" />}
      </div>

      {/* OFP Planned Fuel */}
      <SectionTitle title="OFP — Planned Fuel" icon="📋" />
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="Trip"                      value={ofp.trip  ? `${fmt(ofp.trip)} lb`  : '— lb'} />
        <InfoRow label="Contingency"               value={ofp.cont  ? `${fmt(ofp.cont)} lb`  : '— lb'} />
        <InfoRow label={`Alternate (${altIcao})`}  value={ofp.alt   ? `${fmt(ofp.alt)} lb`   : '— lb'} />
        <InfoRow label="Final Reserve"             value={ofp.fin   ? `${fmt(ofp.fin)} lb`   : '— lb'} />
        <InfoRow label="Taxi"                      value={`${fmt(ofp.taxi)} lb`} />
        <InfoRow label="MIN T/O FUEL"              value={ofp.minTO ? `${fmt(ofp.minTO)} lb` : '— lb'} color="#f97316" big />
        {planFob && <InfoRow label="Total FOB (OFP)" value={`${fmt(planFob)} lb`} color="#38bdf8" />}
      </div>

    </div>
  );
}

export default Fuel;