import React, { useEffect } from 'react';
import SyncButton from './SyncButton';
import { supabase, logEvent } from '../supabaseClient';
import { usePersistedState } from '../hooks/usePersistedState';
import { AdminEditsHistory } from './AdminPanel';

function toMins(t) {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h*60+m;
}
function fromMins(m) {
  if (m===null||m<0) return '—';
  return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
}
function toIsoDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const dmy = dateStr.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const pps = dateStr.match(/^(\d{2})\s*([A-Z]{3})\s*(\d{2,4})$/i);
  if (pps) {
    const months={JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12'};
    const mon=months[pps[2].toUpperCase()], yr=pps[3].length===2?`20${pps[3]}`:pps[3];
    if (mon) return `${yr}-${mon}-${pps[1]}`;
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? new Date().toISOString().split('T')[0] : parsed.toISOString().split('T')[0];
}
function makeTimestamp(hhmm, isoDate) {
  if (!hhmm||!isoDate) return null;
  const ts = new Date(`${isoDate}T${hhmm}:00.000Z`);
  return isNaN(ts.getTime()) ? null : ts.toISOString();
}
function parseDestCoords(rawText) {
  if (!rawText) return {lat:null,lon:null};
  const m = rawText.match(/^DEST\s+\S+\s+.*?N(\d+):(\d+\.?\d*)\s+E(\d+):(\d+\.?\d*)/m);
  if (!m) return {lat:null,lon:null};
  return { lat:parseFloat(m[1])+parseFloat(m[2])/60, lon:parseFloat(m[3])+parseFloat(m[4])/60 };
}

function SectionTitle({ title, icon }) {
  return (
    <div style={{ padding:'16px 16px 8px', display:'flex', alignItems:'center', gap:8 }}>
      {icon && <span style={{ fontSize:16 }}>{icon}</span>}
      <span style={{ fontSize:11, color:'#38bdf8', fontWeight:600, letterSpacing:'1.5px', textTransform:'uppercase' }}>{title}</span>
    </div>
  );
}

function InfoRow({ label, value, valueColor, big, warning }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:48 }}>
      <div style={{ flex:1 }}>
        <span style={{ fontSize:13, color:'#475569' }}>{label}</span>
        {warning && <div style={{ fontSize:10, color:'#ef4444', marginTop:2, fontWeight:600 }}>⚠ {warning}</div>}
      </div>
      <span style={{ fontSize:big?18:13, fontWeight:big?700:500, color:valueColor||'#94a3b8', fontFamily:'monospace' }}>{value}</span>
    </div>
  );
}

function TimeRow({ label, value, auto }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:50 }}>
      <div>
        <div style={{ fontSize:13, color:auto?'#475569':'#f1f5f9', fontWeight:auto?400:500 }}>{label}</div>
        {auto && <div style={{ fontSize:10, color:'#334155', marginTop:1 }}>From Nav Log</div>}
      </div>
      <span style={{ fontSize:15, fontWeight:700, color:auto?(value?'#38bdf8':'#334155'):'#94a3b8', fontFamily:'monospace' }}>
        {value||'—'}
      </span>
    </div>
  );
}

function InputRow({ label, hint, value, onChange, unit, suffix }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom:'1px solid #1e293b', minHeight:56 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:500 }}>{label}</div>
        {hint && <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>{hint}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder="—"
          style={{ background:'#0f172a', border:'1.5px solid #38bdf8', borderRadius:10, padding:'9px 12px', fontSize:14, fontWeight:700, color:'#38bdf8', fontFamily:'monospace', outline:'none', textAlign:'right', width:100, WebkitAppearance:'none' }}/>
        {unit   && <span style={{ fontSize:12, color:'#475569', minWidth:24 }}>{unit}</span>}
        {suffix && <span style={{ fontSize:12, color:'#4ade80', fontWeight:600 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function ArchiveConfirmModal({ onConfirm, onCancel }) {
  const [step, setStep] = React.useState(1);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
      <div style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:16, width:'min(320px,100%)', overflow:'hidden' }}>
        {step === 1 && (
          <>
            <div style={{ background:'rgba(56,189,248,0.08)', padding:'18px 20px', borderBottom:'1px solid #334155' }}>
              <div style={{ fontSize:11, color:'#38bdf8', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:6 }}>⇄ Sync Check</div>
              <div style={{ fontSize:15, color:'#f1f5f9', fontWeight:600 }}>Did you sync the flight data?</div>
              <div style={{ fontSize:12, color:'#475569', marginTop:6, lineHeight:1.5 }}>Make sure all data is synced before archiving.</div>
            </div>
            <div style={{ padding:'16px 20px', display:'flex', gap:10 }}>
              <button onClick={onCancel} style={{ flex:1, background:'#0f172a', border:'1px solid #334155', borderRadius:10, padding:'12px 0', fontSize:13, fontWeight:700, color:'#475569', cursor:'pointer', fontFamily:'inherit' }}>NO</button>
              <button onClick={() => setStep(2)} style={{ flex:2, background:'#38bdf8', border:'none', borderRadius:10, padding:'12px 0', fontSize:13, fontWeight:700, color:'#0f172a', cursor:'pointer', fontFamily:'inherit' }}>YES — SYNCED ✓</button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <div style={{ background:'rgba(74,222,128,0.08)', padding:'18px 20px', borderBottom:'1px solid #334155' }}>
              <div style={{ fontSize:11, color:'#4ade80', fontWeight:700, letterSpacing:'1.5px', textTransform:'uppercase', marginBottom:6 }}>📁 Archive Flight</div>
              <div style={{ fontSize:15, color:'#f1f5f9', fontWeight:600 }}>Save and archive this flight?</div>
              <div style={{ fontSize:12, color:'#475569', marginTop:6, lineHeight:1.5 }}>This will finalize the flight record. Cannot be undone.</div>
            </div>
            <div style={{ padding:'16px 20px', display:'flex', gap:10 }}>
              <button onClick={onCancel} style={{ flex:1, background:'#0f172a', border:'1px solid #334155', borderRadius:10, padding:'12px 0', fontSize:13, fontWeight:700, color:'#475569', cursor:'pointer', fontFamily:'inherit' }}>NO</button>
              <button onClick={onConfirm} style={{ flex:2, background:'#4ade80', border:'none', borderRadius:10, padding:'12px 0', fontSize:13, fontWeight:700, color:'#0f172a', cursor:'pointer', fontFamily:'inherit' }}>YES — SAVE ✓</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EndFlight({ flightData, divertData, setStatus, activePlan, rawText }) {
  const planKey = activePlan?.id || 'default';

  const [pax,              setPax]              = usePersistedState(`efb_endflt_pax_${planKey}`,      '');
  const [cycles,           setCycles]           = usePersistedState(`efb_endflt_cycles_${planKey}`,   '1');
  const [archived,         setArchived]         = usePersistedState(`efb_endflt_archived_${planKey}`, false);
  const [archiving,        setArchiving]        = React.useState(false);
  const [archivedFlightId, setArchivedFlightId] = React.useState(null);
  const [showConfirm,      setShowConfirm]      = React.useState(false);

  const [tkofSelRwy,    ] = usePersistedState('efb_tkof_selRwy',    null);
  const [tkofManualRwy, ] = usePersistedState('efb_tkof_manualRwy', '');
  const [tkofDepAtis,   ] = usePersistedState('efb_tkof_depAtis',   '');
  const [tkofSid,       ] = usePersistedState('efb_tkof_sid',       '');
  const [tkofFl,        ] = usePersistedState('efb_tkof_fl',        '');
  const [tkofSq,        ] = usePersistedState('efb_tkof_sq',        '');
  const [lndSelRwy,     ] = usePersistedState('efb_lnd_selRwy',     null);
  const [lndManualRwy,  ] = usePersistedState('efb_lnd_manualRwy',  '');
  const [lndArrAtis,    ] = usePersistedState('efb_lnd_arrAtis',    '');
  const [lndActualLw,   ] = usePersistedState('efb_lnd_actualLw',   '');
  const [lndVref,       ] = usePersistedState('efb_lnd_vref',       '');
  const [lndReqLnd,     ] = usePersistedState('efb_lnd_reqLnd',     '');

  const depRwy = tkofSelRwy || tkofManualRwy || null;
  const arrRwy = lndSelRwy  || lndManualRwy  || null;
  const { offBlock, takeoffTime, landingTime, onBlock, takeoffFuel, remainingFuel } = flightData;
  const divert = divertData.active;
  const dep=activePlan?.dep||'—', dest=activePlan?.dest||'—', date=activePlan?.date||'', reg=activePlan?.reg||'—', acType=activePlan?.ac_type||'—';

  function n(v) { if(!v)return null; const p=parseInt(v.toString().replace(/,/g,'')); return isNaN(p)?null:p; }

  const finalRes   = n(activePlan?.reserve_fuel) || 1447;
  const flightMins = toMins(landingTime)!==null&&toMins(takeoffTime)!==null ? toMins(landingTime)-toMins(takeoffTime) : null;
  const blockMins  = toMins(onBlock)!==null&&toMins(offBlock)!==null ? toMins(onBlock)-toMins(offBlock) : null;
  const toFuelNum  = takeoffFuel   ? parseInt(takeoffFuel.replace(/,/g,''))   : null;
  const remFuelNum = remainingFuel ? parseInt(remainingFuel.replace(/,/g,'')) : null;
  const burnoff    = toFuelNum&&remFuelNum ? toFuelNum-remFuelNum : null;
  const remColor   = remFuelNum===null?'#94a3b8':remFuelNum<finalRes?'#ef4444':'#4ade80';
  const destIcao   = divert&&divertData.icao ? divertData.icao : dest;
  const timesOk    = !!(landingTime&&onBlock&&takeoffTime&&offBlock);
  const fuelOk     = !!remainingFuel;

  useEffect(() => {
    if (!archived||!activePlan?.id||archivedFlightId) return;
    (async () => {
      const {data} = await supabase.from('archived_flights').select('id').eq('plan_id',activePlan.id).single();
      if (data) setArchivedFlightId(data.id);
    })();
  }, [archived,activePlan?.id,archivedFlightId]);

  useEffect(() => {
    if (!setStatus) return;
    if (archived)                      setStatus('green');
    else if (timesOk&&fuelOk&&pax)     setStatus('green');
    else if (timesOk||fuelOk)          setStatus('amber');
    else                               setStatus('pending');
  }, [timesOk,fuelOk,pax,archived,setStatus]);

  const handleArchive = async () => {
    if (!activePlan?.id) return;
    setArchiving(true); setShowConfirm(false);
    try {
      await supabase.from('plans').update({status:'archived',archived_at:new Date().toISOString()}).eq('id',activePlan.id);
      const {lat:destLat,lon:destLon}=parseDestCoords(rawText);
      const isoDate=toIsoDate(date);
      const {data:afData,error:archiveError}=await supabase.from('archived_flights').insert({
        plan_id:activePlan.id, pic_id:activePlan.pf_pilot, sic_id:activePlan.pm_pilot, pf_id:activePlan.pf_pilot,
        departure_icao:dep, destination_icao:destIcao,
        off_blocks:makeTimestamp(offBlock,isoDate), on_blocks:makeTimestamp(onBlock,isoDate),
        takeoff_time:makeTimestamp(takeoffTime,isoDate), landing_time:makeTimestamp(landingTime,isoDate),
        block_minutes:blockMins, airborne_minutes:flightMins, landing_count:parseInt(cycles)||1,
        dest_lat:destLat, dest_lon:destLon, is_night_landing:false,
        takeoff_fuel:toFuelNum||null, remaining_fuel:remFuelNum||null, pax:pax?parseInt(pax):null,
        archived_at:new Date().toISOString(),
        dep_rwy:depRwy||null, sid:tkofSid||null, dep_atis:tkofDepAtis||null,
        arr_rwy:arrRwy||null, arr_atis:lndArrAtis||null,
        actual_lw:lndActualLw?parseInt(lndActualLw.replace(/,/g,'')):null,
        vref:lndVref?parseInt(lndVref):null, req_landing_dist:lndReqLnd?parseInt(lndReqLnd.replace(/[^0-9]/g,'')):null,
      }).select('id').single();
      if (archiveError) throw archiveError;
      if (afData?.id) setArchivedFlightId(afData.id);
      logEvent(activePlan.id,'FLIGHT_ARCHIVED',{dep,dest:destIcao,block_minutes:blockMins,airborne_minutes:flightMins,landing_count:parseInt(cycles)||1,dep_rwy:depRwy,arr_rwy:arrRwy,sid:tkofSid});
      setArchived(true);
    } catch(e) { console.error('Archive error:',e); }
    setArchiving(false);
  };

  return (
    <div style={{ background:'#0f172a', minHeight:'100%', paddingBottom:24 }}>

      {/* Divert banner */}
      {divert && (
        <div style={{ background:'rgba(249,115,22,0.08)', borderBottom:'1px solid rgba(249,115,22,0.2)', padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>⚠️</span>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:'#f97316' }}>DIVERT ACTIVE — {divertData.icao||'—'}</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>RWY {divertData.rwy||'—'}</div>
          </div>
        </div>
      )}

      {/* Flight Summary */}
      <SectionTitle title="Flight Summary" icon="✈️" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="Route"    value={`${dep} → ${dest}`}   valueColor="#38bdf8" />
        <InfoRow label="Date"     value={date}                  valueColor="#f1f5f9" />
        <InfoRow label="Aircraft" value={`${reg} / ${acType}`} valueColor="#f1f5f9" />
      </div>

      {/* Block & Flight Times */}
      <SectionTitle title="Block & Flight Times" icon="🕐" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <TimeRow label="Off Block"    value={offBlock}    auto />
        <TimeRow label="T/O Time"     value={takeoffTime} auto />
        <TimeRow label="Landing Time" value={landingTime} auto />
        <TimeRow label="On Block"     value={onBlock}     auto />
      </div>

      {/* Calculated */}
      <SectionTitle title="Calculated" icon="🧮" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="Flight Time"  value={fromMins(flightMins)} valueColor={flightMins?'#f1f5f9':'#334155'} big />
        <InfoRow label="Block Time"   value={fromMins(blockMins)}  valueColor={blockMins?'#f1f5f9':'#334155'}  big />
        <InfoRow label="Landings"     value={cycles||'1'}          valueColor="#f1f5f9" />
        <InfoRow label="Destination"  value={destIcao}             valueColor={divert?'#f97316':'#38bdf8'} />
      </div>

      {/* Fuel */}
      <SectionTitle title="Fuel Summary" icon="⛽" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="T/O Fuel"    value={toFuelNum?toFuelNum.toLocaleString()+' lb':'—'} />
        <InfoRow label="Remaining"   value={remFuelNum?remFuelNum.toLocaleString()+' lb':'—'} valueColor={remColor}
          warning={remFuelNum!==null&&remFuelNum<finalRes?`Below final reserve (${finalRes.toLocaleString()} lb)`:null} />
        <InfoRow label="Fuel Used"   value={burnoff?burnoff.toLocaleString()+' lb':'—'} valueColor={burnoff?'#f1f5f9':'#334155'} big />
      </div>

      {/* T/O Summary */}
      <SectionTitle title="T/O Data Summary" icon="🛫" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="DEP RWY"  value={depRwy||'—'}     valueColor={depRwy?'#f1f5f9':'#334155'} />
        <InfoRow label="SID"      value={tkofSid||'—'}    valueColor={tkofSid?'#f1f5f9':'#334155'} />
        <InfoRow label="FL"       value={tkofFl||'—'}     valueColor={tkofFl?'#f1f5f9':'#334155'} />
        <InfoRow label="SQ"       value={tkofSq||'—'}     valueColor={tkofSq?'#f1f5f9':'#334155'} />
        <InfoRow label="DEP ATIS" value={tkofDepAtis||'—'} valueColor={tkofDepAtis?'#f1f5f9':'#334155'} />
      </div>

      {/* LND Summary */}
      <SectionTitle title="LND Data Summary" icon="🛬" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InfoRow label="ARR RWY"   value={arrRwy||'—'}      valueColor={arrRwy?'#f1f5f9':'#334155'} />
        <InfoRow label="ARR ATIS"  value={lndArrAtis||'—'}  valueColor={lndArrAtis?'#f1f5f9':'#334155'} />
        <InfoRow label="Actual LW" value={lndActualLw?parseInt(lndActualLw.replace(/,/g,'')).toLocaleString()+' lb':'—'} valueColor={lndActualLw?'#f1f5f9':'#334155'} />
        <InfoRow label="Vref"      value={lndVref?lndVref+' kt':'—'} valueColor={lndVref?'#f1f5f9':'#334155'} />
      </div>

      {/* Tech Data */}
      <SectionTitle title="Tech Data" icon="🔧" />
      <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid #334155', overflow:'hidden' }}>
        <InputRow label="PAX"    value={pax}    onChange={setPax}    unit="pax" />
        <InputRow label="Cycles" hint="+1 auto" value={cycles} onChange={setCycles} suffix="cycle(s)" />
      </div>

      {/* Divert reason */}
      {divert && (
        <>
          <SectionTitle title="Divert Reason" icon="⚠️" />
          <div style={{ margin:'0 12px 16px', background:'#1e293b', borderRadius:14, border:'1px solid rgba(249,115,22,0.3)', overflow:'hidden' }}>
            <div style={{ padding:'12px 14px' }}>
              <textarea value={divertData.reason||''} onChange={()=>{}} placeholder="Enter reason for divert..." rows={4}
                style={{ width:'100%', background:'#0f172a', border:'1.5px solid rgba(249,115,22,0.4)', borderRadius:10, padding:'12px', fontSize:13, color:'#f1f5f9', fontFamily:'inherit', outline:'none', resize:'vertical', lineHeight:1.6, boxSizing:'border-box' }}/>
            </div>
          </div>
        </>
      )}

      {/* Archive button */}
      <div style={{ margin:'0 12px 8px' }}>
        {!archived ? (
          <>
            <button onClick={() => { if(timesOk) setShowConfirm(true); }} disabled={archiving||!timesOk}
              style={{ width:'100%', background:timesOk?'rgba(74,222,128,0.08)':'#1e293b', border:`1.5px solid ${timesOk?'#4ade80':'#334155'}`, borderRadius:14, padding:16, fontSize:15, fontWeight:700, color:timesOk?'#4ade80':'#334155', cursor:timesOk?'pointer':'not-allowed', fontFamily:'inherit', transition:'all 0.2s' }}>
              {archiving ? '⏳ Archiving...' : '📁 Archive Flight'}
            </button>
            {!timesOk && <div style={{ fontSize:11, color:'#475569', textAlign:'center', marginTop:8 }}>Complete flight times in Nav Log to archive</div>}
          </>
        ) : (
          <div>
            <div style={{ padding:'14px 16px', borderRadius:14, background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.2)', display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
              <span style={{ fontSize:24 }}>✅</span>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:'#4ade80' }}>Flight Archived</div>
                <div style={{ fontSize:11, color:'#475569', marginTop:3 }}>Plan moved to archive — read only</div>
              </div>
            </div>
            {archivedFlightId && (
              <div style={{ borderRadius:12, overflow:'hidden', border:'1px solid #334155' }}>
                <AdminEditsHistory archivedFlightId={archivedFlightId} readOnly={true}/>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ margin:'0 12px' }}><SyncButton /></div>

      {showConfirm && <ArchiveConfirmModal onConfirm={handleArchive} onCancel={() => setShowConfirm(false)} />}
    </div>
  );
}

export default EndFlight;