import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../config/supabaseClient';

const SB_URL = 'https://ojvqdsqodpxkvpxvwgrm.supabase.co';
const SB_KEY = 'sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f';

function toMins(t) {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function fromMins(m) {
  if (m === null || m === undefined) return '—';
  const n = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
}
function diffMins(a, b) {
  const am = toMins(a), bm = toMins(b);
  if (am === null || bm === null) return null;
  let d = bm - am; if (d < 0) d += 1440; return d;
}
function fmtDiff(mins) {
  if (mins === null || mins === undefined) return '—';
  const sign = mins >= 0 ? '+' : '';
  return `${sign}${mins}'`;
}

// EASA ORO.FTL — Max FDP tablosu (1-2 sektör)
function getMaxFDP(reportTimeMins, sectorCount) {
  const s = Math.min(sectorCount, 6);
  // Sektör bazlı azaltma (sektör 1-2 baz, her ek sektörde 30dk azalma)
  const sectorPenalty = Math.max(0, (s - 2)) * 30;

  let baseMins;
  if (reportTimeMins >= toMins('06:00') && reportTimeMins <= toMins('13:29')) baseMins = 13*60;
  else if (reportTimeMins >= toMins('13:30') && reportTimeMins <= toMins('13:59')) baseMins = 12*60+45;
  else if (reportTimeMins >= toMins('14:00') && reportTimeMins <= toMins('14:29')) baseMins = 12*60+30;
  else if (reportTimeMins >= toMins('14:30') && reportTimeMins <= toMins('14:59')) baseMins = 12*60+15;
  else if (reportTimeMins >= toMins('15:00') && reportTimeMins <= toMins('15:29')) baseMins = 12*60;
  else if (reportTimeMins >= toMins('15:30') && reportTimeMins <= toMins('16:59')) {
    // Kademeli azalma: 15:30'da 12:00, 16:59'da 11:00
    const elapsed = reportTimeMins - toMins('15:30');
    baseMins = 12*60 - Math.round((elapsed / 89) * 60);
  }
  else if (reportTimeMins >= toMins('17:00') || reportTimeMins <= toMins('04:59')) {
    // WOCL — azaltılmış FDP
    baseMins = 11*60;
  }
  else baseMins = 12*60;

  return baseMins - sectorPenalty;
}

export default function FlightReport({ plan, onClose }) {
  const [logs,        setLogs]        = useState([]);
  const [wx,          setWx]          = useState([]);
  const [homeBase,    setHomeBase]    = useState(null);
  const [pfHomeBase,  setPfHomeBase]  = useState(null);
  const [pmHomeBase,  setPmHomeBase]  = useState(null);
  const [navlogRows,  setNavlogRows]  = useState([]);
  const [fltReport,   setFltReport]   = useState(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!plan?.id) return;
    Promise.all([
      supabase.from('flight_logs').select('action,details,created_at').eq('plan_id', plan.id).order('created_at',{ascending:true}).then(({data})=>data||[]),
      supabase.from('wx_snapshots').select('icao,type,raw_text,fetched_at').eq('plan_id', plan.id).order('fetched_at',{ascending:false}).then(({data})=>data||[]),
      supabase.from('home_bases').select('icao').eq('reg', plan.reg).limit(1).then(({data})=>data||[]),
      supabase.from('navlog_entries').select('*').eq('plan_id', plan.id).order('seq',{ascending:true}).then(({data})=>data||[]),
      supabase.from('flt_report').select('*').eq('plan_id', plan.id).limit(1).then(({data})=>data||[]),
    ]).then(([logsData, wxData, hbData, navData, fltReportData]) => {
      setFltReport(fltReportData?.[0] || null);
      setLogs(logsData || []);
      // PF ve PM pilot ID'lerini CREW_ASSIGNED log'undan al
      const crewLog = (logsData||[]).filter(l=>l.action==='CREW_ASSIGNED').slice(-1)[0];
      const pfId = crewLog?.details?.pf_id;
      const pmId = crewLog?.details?.pm_id;
      // PF ve PM home base'lerini çek
      const fetchHB = (id) => id
        ? supabase.from('home_bases').select('icao').eq('pilot_id', id).limit(1).then(({data})=>data||[]).catch(()=>[])
        : Promise.resolve([]);
      Promise.all([fetchHB(pfId), fetchHB(pmId)]).then(([pfHB, pmHB]) => {
        setPfHomeBase(pfHB?.[0]?.icao || null);
        setPmHomeBase(pmHB?.[0]?.icao || null);
      });
      const wxMap = {};
      (wxData || []).forEach(r => { const k=`${r.icao}_${r.type}`; if(!wxMap[k]) wxMap[k]=r; });
      setWx(Object.values(wxMap));
      setHomeBase(hbData?.[0]?.icao || null);
      setNavlogRows(navData || []);
      setLoading(false);
    });
  }, [plan?.id]); // eslint-disable-line

  const getLog = useCallback((action) => {
    const found = logs.filter(l => l.action === action);
    return found.length ? found[found.length-1].details : null;
  }, [logs]);

  // Crew
  const crewLog     = getLog('CREW_ASSIGNED');
  const pfName      = crewLog?.pf_name || plan.pf_pilot || '—';
  const pmName      = crewLog?.pm_name || plan.pm_pilot || '—';

  // Zamanlar
  const offBlock  = getLog('OFF_BLOCKS')?.time  || '—';
  const toTime    = getLog('TAKEOFF')?.time      || '—';
  const toFuel    = getLog('TAKEOFF')?.fuel_lb   || '—';
  const landTime  = getLog('LANDING')?.time      || '—';
  const onBlock   = getLog('ON_BLOCKS')?.time    || '—';
  const remFuel   = getLog('FUEL_REMAINING')?.fuel_lb || '—';

  const blockTime  = diffMins(offBlock, onBlock);
  const flightTime = diffMins(toTime, landTime);
  const tripBurn   = (toFuel!=='—'&&remFuel!=='—') ? parseInt(toFuel.replace(/,/g,''))-parseInt(remFuel.replace(/,/g,'')) : null;
  const planBurn   = plan?.trip_fuel ? parseInt(plan.trip_fuel) : null;
  const burnDiff   = (tripBurn&&planBurn) ? planBurn-tripBurn : null;

  // EASA FTL — pilot bazlı hesaplama
  const sectorCount = 1;
  const dutyEnd = onBlock !== '—' ? fromMins((toMins(onBlock)||0) + 30) : '—';

  const calcFTL = (pilotHomeBase) => {
    const isHome = (icao) => pilotHomeBase && (
      icao === pilotHomeBase ||
      (pilotHomeBase === 'LTAC' && icao === 'ESB') ||
      (pilotHomeBase === 'ESB'  && icao === 'LTAC')
    );
    const depHome  = isHome(plan?.dep);
    const destHome = isHome(plan?.dest);
    const reportOffset = depHome ? 75 : 60;
    const reportTime   = plan?.std && plan.std !== '—' ? fromMins((toMins(plan.std)||0) - reportOffset) : '—';
    const fdpMins      = (reportTime !== '—' && dutyEnd !== '—') ? diffMins(reportTime, dutyEnd) : null;
    const reportMins   = reportTime !== '—' ? toMins(reportTime) : null;
    const maxFdpMins   = reportMins !== null ? getMaxFDP(reportMins, sectorCount) : null;
    const fdpOk        = (fdpMins !== null && maxFdpMins !== null) ? fdpMins <= maxFdpMins : null;
    const minRestBase  = destHome ? 720 : 600;
    const minRestMins  = fdpMins !== null ? Math.max(fdpMins, minRestBase) : minRestBase;
    const earliestNext = onBlock !== '—' ? fromMins((toMins(onBlock)||0) + 30 + minRestMins) : '—';
    return { depHome, destHome, reportTime, reportOffset, fdpMins, maxFdpMins, fdpOk, minRestMins, earliestNext };
  };

  const pfFTL = calcFTL(pfHomeBase);
  const pmFTL = calcFTL(pmHomeBase);

  // Geriye dönük uyumluluk için (eski tek kişilik hesap — PF baz alınır)
  const isHomeBase = (icao) => pfFTL.depHome || pfFTL.destHome;
  const depIsHome  = pfFTL.depHome;
  const destIsHome = pfFTL.destHome;
  const reportTime = pfFTL.reportTime;
  const fdpMins    = pfFTL.fdpMins;
  const maxFdpMins = pfFTL.maxFdpMins;
  const fdpOk      = pfFTL.fdpOk;
  const minRestMins= pfFTL.minRestMins;
  const earliestNextDuty = pfFTL.earliestNext;


  // WX
  const wxByIcao = {};
  wx.forEach(r => { if(!wxByIcao[r.icao]) wxByIcao[r.icao]={}; wxByIcao[r.icao][r.type]=r.raw_text; });

  const S = {
    overlay:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',zIndex:200,overflowY:'auto'},
    wrap:{maxWidth:760,margin:'0 auto',padding:'20px 16px 40px',fontFamily:'monospace'},
    card:{background:'#fff',borderRadius:8,border:'1px solid #e2e8f0',marginBottom:10,overflow:'hidden'},
    hdr:{background:'#f8fafc',padding:'6px 14px',fontSize:10,fontWeight:700,color:'#64748b',letterSpacing:0.5,borderBottom:'1px solid #e2e8f0'},
    grid:(cols)=>({display:'grid',gridTemplateColumns:cols,gap:0}),
    cell:(br,bt)=>({padding:'8px 14px',borderRight:br?'1px solid #e2e8f0':'none',borderTop:bt?'1px solid #e2e8f0':'none'}),
    lbl:{fontSize:9,color:'#94a3b8',marginBottom:2},
    val:{fontSize:12,fontWeight:700,color:'#1e293b'},
    chk:(on)=>({width:18,height:18,border:on?'3px solid #1e293b':'2px solid #cbd5e1',borderRadius:3,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:on?'#1e293b':'transparent'}),
  };

  if(loading) return <div style={S.overlay}><div style={{...S.wrap,color:'#94a3b8',textAlign:'center',paddingTop:80}}>Loading report...</div></div>;

  return (
    <>
    <style dangerouslySetInnerHTML={{__html: "@media print { .no-print { display:none!important; } #flt-report-wrap { position:static!important; overflow:visible!important; height:auto!important; background:#fff!important; } #flt-report-wrap * { color:#000!important; } }"}} />
    <div style={S.overlay} id="flt-report-wrap">
      <div style={S.wrap} id="flt-report-content">
        {/* Toolbar */}
        <div className="no-print" style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>GO2 eFB — Flight Report</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{plan.reg} · {plan.dep}–{plan.dest} · {plan.date}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{ const html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:monospace;padding:16px;background:#fff;color:#000;font-size:11px;} table{width:100%;border-collapse:collapse;margin-bottom:12px;} th,td{padding:5px 8px;border:1px solid #ccc;font-size:10px;text-align:left;} th{background:#f1f5f9;font-weight:700;} h2{font-size:13px;margin:12px 0 4px;border-bottom:2px solid #1e3a5f;padding-bottom:4px;} .grid{display:grid;grid-template-columns:1fr 1fr 1fr;border:1px solid #e2e8f0;margin-bottom:12px;} .cell{padding:8px 10px;border:1px solid #e2e8f0;} .lbl{font-size:8px;color:#94a3b8;margin-bottom:2px;} .val{font-size:11px;font-weight:700;} @media print{body{padding:0;}}</style></head><body>'+document.getElementById('flt-report-content').innerHTML+'</body></html>'; const blob=new Blob([html],{type:'text/html'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.target='_blank'; a.rel='noopener'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),10000); }} style={{background:'rgba(255,255,255,0.1)',border:'1px solid #475569',borderRadius:6,padding:'8px 16px',fontSize:12,color:'#fff',cursor:'pointer'}}>🖨 Print</button>
            <button onClick={onClose} style={{background:'transparent',border:'1px solid #475569',borderRadius:6,padding:'8px 16px',fontSize:12,color:'#94a3b8',cursor:'pointer'}}>✕</button>
          </div>
        </div>

        {/* Aircraft & Crew */}
        <div style={S.card}>
          <div style={S.hdr}>AIRCRAFT & CREW</div>
          <div style={S.grid('1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Registration</div><div style={S.val}>{plan.reg}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Type</div><div style={S.val}>{plan.ac_type}</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Date</div><div style={S.val}>{plan.date}</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>PIC (PF)</div><div style={S.val}>{pfName}</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>SIC (PM)</div><div style={S.val}>{pmName}</div></div>
            <div style={S.cell(false,true)}><div style={S.lbl}>Pre-flight by</div><div style={S.val}>{pfName}</div></div>
          </div>
        </div>

        {/* Flight Data */}
        <div style={S.card}>
          <div style={S.hdr}>FLIGHT DATA</div>
          <div style={S.grid('1fr 1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>DEP</div><div style={S.val}>{plan.dep}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>DEST</div><div style={S.val}>{plan.dest}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>ALT</div><div style={S.val}>{plan.alternate||'—'}</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Pax</div><div style={S.val}>{fltReport?.pax ?? '—'}</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>Off Block</div><div style={S.val}>{offBlock} UTC</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>T/O</div><div style={S.val}>{toTime} UTC</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>Landing</div><div style={S.val}>{landTime} UTC</div></div>
            <div style={S.cell(false,true)}><div style={S.lbl}>On Block</div><div style={S.val}>{onBlock} UTC</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>Block Time</div><div style={S.val}>{blockTime!==null?fromMins(blockTime):'—'}</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>Flight Time</div><div style={S.val}>{flightTime!==null?fromMins(flightTime):'—'}</div></div>
            <div style={S.cell(true,true)}><div style={S.lbl}>STD</div><div style={S.val}>{plan.std||'—'}</div></div>
            <div style={S.cell(false,true)}><div style={S.lbl}>STA</div><div style={S.val}>{plan.eta||'—'}</div></div>
          </div>
        </div>

        {/* Fuel */}
        <div style={S.card}>
          <div style={S.hdr}>FUEL</div>
          <div style={S.grid('1fr 1fr 1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>FOB Plan</div><div style={S.val}>{plan.fob||'—'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>T/O Fuel</div><div style={S.val}>{toFuel!=='—'?parseInt(toFuel).toLocaleString()+' lb':'—'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Remaining</div><div style={S.val}>{remFuel!=='—'?parseInt(remFuel).toLocaleString()+' lb':'—'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Trip Burn</div><div style={S.val}>{tripBurn?tripBurn.toLocaleString()+' lb':'—'}</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>vs OFP Plan</div><div style={{...S.val,color:burnDiff===null?'#1e293b':burnDiff>0?'#16a34a':'#ef4444'}}>{burnDiff!==null?(burnDiff>0?'+':'')+burnDiff.toLocaleString()+' lb':'—'}</div></div>
          </div>
        </div>

        {/* NAV LOG — flt_report.navlog'dan */}
        {(()=>{
          const navlogData = fltReport?.navlog || [];
          const rows = navlogData.map(row => ({
            wpt: row.wpt,
            type: row.type?.toUpperCase(),
            eta: (row.eta && row.eta !== '—') ? row.eta : '—',
            ata: row.ata || '—',
            fuel: row.fuel_actual ? parseInt(row.fuel_actual).toLocaleString()+' lb' : '—',
            rvsm: row.rvsm || '—',
            bg: row.type==='dep'?'#fef9ec': row.type==='dest'?'#f0fdf4':'#fff',
            color: row.type==='dep'?'#b45309': row.type==='dest'?'#166534':'#1e40af',
          }));
          if(!rows.length) return null;
          return (
            <div style={S.card}>
              <div style={S.hdr}>NAV LOG — Actual Times & Fuel</div>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:'monospace'}}>
                  <thead>
                    <tr style={{background:'#f1f5f9'}}>
                      {['WPT','TYPE','ETA (UTC)','ATA (UTC)','FUEL','RVSM'].map(h=>(
                        <th key={h} style={{padding:'6px 10px',textAlign:'left',fontSize:9,color:'#64748b',fontWeight:700,borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row,i)=>(
                      <tr key={i} style={{background:row.bg}}>
                        <td style={{padding:'6px 10px',fontWeight:700,color:row.color,borderBottom:'1px solid #f1f5f9'}}>{row.wpt}</td>
                        <td style={{padding:'6px 10px',color:'#94a3b8',fontSize:9,borderBottom:'1px solid #f1f5f9'}}>{row.type}</td>
                        <td style={{padding:'6px 10px',color:'#94a3b8',borderBottom:'1px solid #f1f5f9'}}>{row.eta}</td>
                        <td style={{padding:'6px 10px',fontWeight:700,color:'#1e293b',borderBottom:'1px solid #f1f5f9'}}>{row.ata}</td>
                        <td style={{padding:'6px 10px',color:'#1e293b',borderBottom:'1px solid #f1f5f9'}}>{row.fuel}</td>
                        <td style={{padding:'6px 10px',color:'#64748b',fontSize:10,borderBottom:'1px solid #f1f5f9',fontFamily:'monospace'}}>{row.rvsm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* WX */}
        {Object.keys(wxByIcao).length>0&&(
          <div style={S.card}>
            <div style={S.hdr}>WX — {Object.keys(wxByIcao).join(' / ')}</div>
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:8}}>
              {Object.entries(wxByIcao).map(([icao,data])=>(
                <div key={icao}>
                  {data.METAR&&<><div style={{fontSize:10,color:'#64748b',fontWeight:700,marginBottom:3}}>{icao} METAR</div><div style={{fontSize:10,color:'#1e293b',background:'#f8fafc',padding:'6px 10px',borderRadius:4,border:'1px solid #e2e8f0',fontFamily:'monospace',lineHeight:1.6,marginBottom:6}}>{data.METAR}</div></>}
                  {data.TAF&&<><div style={{fontSize:10,color:'#64748b',fontWeight:700,marginBottom:3}}>{icao} TAF</div><div style={{fontSize:10,color:'#1e293b',background:'#f8fafc',padding:'6px 10px',borderRadius:4,border:'1px solid #e2e8f0',fontFamily:'monospace',lineHeight:1.6,marginBottom:6}}>{data.TAF}</div></>}
                </div>
              ))}
            </div>
          </div>
        )}

        

        {/* EASA FTL */}
        <div style={S.card}>
          <div style={S.hdr}>EASA FTL — ORO.FTL (CREW DUTY & REST)</div>
          {/* Ortak satır */}
          <div style={S.grid('1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Duty End (both crew)</div><div style={S.val}>{dutyEnd} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>On Block +00:30</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Sectors</div><div style={S.val}>{sectorCount}</div></div>
          </div>
          {/* PF */}
          <div style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc',padding:'4px 14px'}}><span style={{fontSize:9,fontWeight:700,color:'#1e40af'}}>PF — {pfName}</span>{pfHomeBase?<span style={{fontSize:9,color:'#94a3b8',marginLeft:8}}>Home: {pfHomeBase}</span>:<span style={{fontSize:9,color:'#ef4444',marginLeft:8}}>No home base set</span>}</div>
          <div style={S.grid('1fr 1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Report Time</div><div style={S.val}>{pfFTL.reportTime} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{pfFTL.depHome?'Home −01:15':'Away −01:00'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>FDP</div><div style={{...S.val,color:pfFTL.fdpOk===null?'#1e293b':pfFTL.fdpOk?'#16a34a':'#ef4444'}}>{pfFTL.fdpMins!==null?fromMins(pfFTL.fdpMins):'—'}{pfFTL.fdpOk===false&&<span style={{fontSize:9,marginLeft:4,color:'#ef4444'}}>⚠</span>}{pfFTL.fdpOk===true&&<span style={{fontSize:9,marginLeft:4,color:'#16a34a'}}>✓</span>}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>Max: {pfFTL.maxFdpMins!==null?fromMins(pfFTL.maxFdpMins):'—'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Min Rest</div><div style={S.val}>{fromMins(pfFTL.minRestMins)}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{pfFTL.destHome?'Home 12:00':'Away 10:00'}</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Earliest Next Duty</div><div style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>{pfFTL.earliestNext} UTC</div></div>
          </div>
          {/* PM */}
          <div style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc',padding:'4px 14px'}}><span style={{fontSize:9,fontWeight:700,color:'#0f766e'}}>PM — {pmName}</span>{pmHomeBase?<span style={{fontSize:9,color:'#94a3b8',marginLeft:8}}>Home: {pmHomeBase}</span>:<span style={{fontSize:9,color:'#ef4444',marginLeft:8}}>No home base set</span>}</div>
          <div style={S.grid('1fr 1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Report Time</div><div style={S.val}>{pmFTL.reportTime} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{pmFTL.depHome?'Home −01:15':'Away −01:00'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>FDP</div><div style={{...S.val,color:pmFTL.fdpOk===null?'#1e293b':pmFTL.fdpOk?'#16a34a':'#ef4444'}}>{pmFTL.fdpMins!==null?fromMins(pmFTL.fdpMins):'—'}{pmFTL.fdpOk===false&&<span style={{fontSize:9,marginLeft:4,color:'#ef4444'}}>⚠</span>}{pmFTL.fdpOk===true&&<span style={{fontSize:9,marginLeft:4,color:'#16a34a'}}>✓</span>}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>Max: {pmFTL.maxFdpMins!==null?fromMins(pmFTL.maxFdpMins):'—'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Min Rest</div><div style={S.val}>{fromMins(pmFTL.minRestMins)}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{pmFTL.destHome?'Home 12:00':'Away 10:00'}</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Earliest Next Duty</div><div style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>{pmFTL.earliestNext} UTC</div></div>
          </div>
          <div style={{borderTop:'1px solid #e2e8f0',background:'#f8fafc',padding:'6px 14px'}}>
            <div style={{fontSize:9,color:'#94a3b8'}}>WOCL 02:00–05:59 · Cumulative: 60h/7d · 190h/28d · Flight Time: 100h/28d · 900h/year</div>
          </div>
        </div>

        <div style={{fontSize:10,color:'#94a3b8',textAlign:'center',marginTop:8}}>
          Report generated by GO2 eFB · Archive copy · CAMO data not included · {new Date().toUTCString()}
        </div>
      </div>
    </div>
    </>
  );
}