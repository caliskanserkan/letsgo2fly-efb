import React, { useEffect, useRef } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { supabase, logEvent } from '../supabaseClient';

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

function isolateActiveLeg(full, fmsIdent) {
  if (!full) return '';
  if (!fmsIdent) return full;
  const marker = `FMS IDENT=${fmsIdent}`;
  const startIdx = full.indexOf(marker);
  if (startIdx === -1) return full;
  const afterStart = full.slice(startIdx);
  const nextIdx = afterStart.slice(marker.length).indexOf('FMS IDENT=');
  if (nextIdx === -1) return afterStart;
  return afterStart.slice(0, marker.length + nextIdx);
}

function parseOfpFuel(block, label) {
  if (!block) return 0;
  const re = new RegExp(`${label}\\s+(\\d+)`);
  const m = block.match(re);
  return m ? parseInt(m[1]) : 0;
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

function Fuel({ setStatus, activePlan, rawText = '' }) {
  const [density,  setDensity]  = usePersistedState('efb_fuel_density',  '0.80');
  const [fob,      setFob]      = usePersistedState('efb_fuel_fob',      '');
  const [upliftLt, setUpliftLt] = usePersistedState('efb_fuel_upliftLt', '');
  const [upliftLb, setUpliftLb] = usePersistedState('efb_fuel_upliftLb', '');
  const loggedRef = useRef(false);
  const lastEdited = useRef('');

  const legBlock = isolateActiveLeg(rawText, activePlan?.fms_ident);

  const ofp = {
    trip:  parseOfpFuel(legBlock, 'TRIP'),
    cont:  parseOfpFuel(legBlock, 'CONT'),
    alt:   parseOfpFuel(legBlock, 'ALTERNATE'),
    fin:   parseOfpFuel(legBlock, 'FINAL RESERVE'),
    add:   parseOfpFuel(legBlock, 'ADDITIONAL FUEL'),
    extra: parseOfpFuel(legBlock, 'EXTRA'),
    disc:  parseOfpFuel(legBlock, 'DISCRETIONARY'),
    taxi:  parseOfpFuel(legBlock, 'TAXI'),
    minTO: parseOfpFuel(legBlock, 'MIN T/O FUEL'),
    totalFob: parseOfpFuel(legBlock, 'TOTAL FOB'),
  };
  if (!ofp.minTO) ofp.minTO = ofp.trip + ofp.cont + ofp.alt + ofp.fin + ofp.taxi;

  const altIcao = activePlan?.alternate || 'ALTN';

  const handleUpliftLt = (val) => {
    setUpliftLt(val);
    if (lastEdited.current === 'lb') { lastEdited.current = ''; return; }
    lastEdited.current = 'lt';
    const lb = ltToLb(val, density);
    setUpliftLb(lb !== null ? lb.toString() : '');
    lastEdited.current = '';
    loggedRef.current = false;
  };
  const handleUpliftLb = (val) => {
    setUpliftLb(val);
    if (lastEdited.current === 'lt') { lastEdited.current = ''; return; }
    lastEdited.current = 'lb';
    const lt = lbToLt(n(val), density);
    setUpliftLt(lt !== null ? lt.toString() : '');
    lastEdited.current = '';
    loggedRef.current = false;
  };
  const handleDensity = (val) => {
    setDensity(val);
    if (upliftLt) { const lb = ltToLb(upliftLt, val); setUpliftLb(lb !== null ? lb.toString() : ''); }
    loggedRef.current = false;
  };

  const fobN      = n(fob);
  const upliftN   = n(upliftLb);
  const remaining = (fobN !== null && upliftN !== null) ? Math.max(0, fobN - upliftN) : (fobN !== null ? fobN : null);
  const hasUplift = upliftN !== null && upliftN > 0;

  const takeoff = fobN !== null ? Math.max(0, fobN - ofp.taxi) : null;
  const fuelOk   = takeoff !== null && ofp.minTO > 0 && takeoff >= ofp.minTO;
  const fuelWarn = takeoff !== null && ofp.minTO > 0 && takeoff < ofp.minTO;

  useEffect(() => {
    if (!activePlan?.id) return;
    const t = setTimeout(async () => {
      try {
        await supabase.from('plans').update({
          actual_fob:   fob || null,
          uplift_lt:    upliftLt || null,
          uplift_lb:    upliftLb || null,
          fuel_density: density || null,
        }).eq('id', activePlan.id);
      } catch (e) { /* offline */ }
    }, 800);
    return () => clearTimeout(t);
  }, [fob, upliftLt, upliftLb, density, activePlan?.id]);

  useEffect(() => {
    if (!setStatus) return;
    if (fobN !== null) {
      setStatus('green');
      if (!loggedRef.current) {
        loggedRef.current = true;
        logEvent(activePlan?.id, 'FUEL_CHECKED', { fob_lb:fobN, uplift_lb:upliftN, takeoff_lb:takeoff, density, min_to_lb:ofp.minTO, fob_ok:fuelOk });
      }
    } else if (upliftLt || upliftLb) {
      setStatus('warning');
    } else {
      setStatus('warning');
    }
  }, [fob, upliftLt, upliftLb, fobN, setStatus]); // eslint-disable-line

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>
      {takeoff !== null && (
        <div style={{ margin:'12px 12px 4px', background: fuelWarn ? 'rgba(239,68,68,0.08)' : 'rgba(74,222,128,0.06)', border:`1.5px solid ${fuelWarn ? '#ef4444' : '#4ade80'}`, borderRadius:16, padding:'16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontSize:11, color: fuelWarn ? '#ef4444' : '#4ade80', fontWeight:600, letterSpacing:'1px' }}>TAKE-OFF FUEL CHECK</div>
            <div style={{ fontSize:12, fontWeight:700, color: fuelWarn ? '#ef4444' : '#4ade80', background:(fuelWarn ? '#ef4444' : '#4ade80')+'26', padding:'3px 10px', borderRadius:6 }}>
              {fuelWarn ? 'BELOW MINIMUM' : 'OK'}
            </div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            <div><div style={{ fontSize:9, color:'#475569' }}>T/O FUEL (FOB-TAXI)</div><div style={{ fontSize:17, fontWeight:700, color:'#4ade80', fontFamily:'monospace' }}>{fmt(takeoff)} lb</div></div>
            <div><div style={{ fontSize:9, color:'#475569' }}>MIN T/O FUEL</div><div style={{ fontSize:17, fontWeight:700, color:'#f97316', fontFamily:'monospace' }}>{fmt(ofp.minTO)} lb</div></div>
            <div><div style={{ fontSize:9, color:'#475569' }}>MARGIN</div><div style={{ fontSize:17, fontWeight:700, color: fuelWarn ? '#ef4444' : '#4ade80', fontFamily:'monospace' }}>{fmt(takeoff - ofp.minTO)} lb</div></div>
          </div>
        </div>
      )}

      <SectionTitle title="Uplift" icon="⛽" />
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <EntryRow label="Density" hint="kg/lt — adjust for temperature" value={density}  onChange={handleDensity}  unit="kg/lt" />
        <EntryRow label="Uplift"  hint="Litres (from fuel receipt)"     value={upliftLt} onChange={handleUpliftLt} unit="Lt" />
        <EntryRow label="Uplift"  hint="Pounds"                         value={upliftLb} onChange={handleUpliftLb} unit="lb" />
      </div>

      <SectionTitle title="Fuel Quantities" icon="🔢" />
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <EntryRow label="Fuel On Board (FOB)" hint="From aircraft fuel indicator" value={fob} onChange={setFob} unit="lb" />
        <AutoRow label="Remaining" hint={hasUplift ? 'FOB − Uplift' : 'No uplift — Remaining = FOB'} value={remaining !== null ? fmt(remaining) : ''} unit="lb" />
      </div>

      <SectionTitle title="OFP — Planned Fuel" icon="📋" />
      <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="Trip"                     value={ofp.trip  ? `${fmt(ofp.trip)} lb`  : '— lb'} />
        {ofp.cont  > 0 && <InfoRow label="Contingency"              value={`${fmt(ofp.cont)} lb`} />}
        <InfoRow label={`Alternate (${altIcao})`} value={ofp.alt   ? `${fmt(ofp.alt)} lb`   : '— lb'} />
        <InfoRow label="Final Reserve"            value={ofp.fin   ? `${fmt(ofp.fin)} lb`   : '— lb'} />
        {ofp.add   > 0 && <InfoRow label="Additional"               value={`${fmt(ofp.add)} lb`} />}
        {ofp.extra > 0 && <InfoRow label="Extra"                    value={`${fmt(ofp.extra)} lb`} />}
        <InfoRow label="MIN T/O FUEL" value={ofp.minTO ? `${fmt(ofp.minTO)} lb` : '— lb'} color="#f97316" big />
        {ofp.taxi  > 0 && <InfoRow label="Taxi"                     value={`${fmt(ofp.taxi)} lb`} />}
        {ofp.disc  > 0 && <InfoRow label="Discretionary"            value={`${fmt(ofp.disc)} lb`} />}
        {ofp.totalFob > 0 && <InfoRow label="Total FOB (OFP)" value={`${fmt(ofp.totalFob)} lb`} color="#38bdf8" big />}
      </div>

      {hasUplift && (
        <>
          <SectionTitle title="Fuel Receipt" icon="📸" />
          <div style={{ margin:'0 12px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', padding:'16px' }}>
            <div style={{ fontSize:11, color:'#f59e0b', fontWeight:600, marginBottom:10 }}>REQUIRED (uplift entered)</div>
            <button disabled style={{ background:'rgba(56,189,248,0.06)', border:'1px dashed #38bdf8', borderRadius:10, padding:'12px 18px', fontSize:13, color:'#38bdf8', fontFamily:'inherit', cursor:'not-allowed', opacity:0.7 }}>📷 ADD PHOTO (iOS)</button>
            <div style={{ fontSize:10, color:'#475569', marginTop:8 }}>Receipt photo captured on iPad EFB.</div>
          </div>
        </>
      )}
    </div>
  );
}

export default Fuel;
