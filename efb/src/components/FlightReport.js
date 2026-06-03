import React, { useEffect, useState, useCallback } from 'react';

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
  const [navlogRows,  setNavlogRows]  = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!plan?.id) return;
    Promise.all([
      fetch(`${SB_URL}/rest/v1/flight_logs?plan_id=eq.${plan.id}&select=action,details,created_at&order=created_at.asc`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/wx_snapshots?plan_id=eq.${plan.id}&select=icao,type,raw_text,fetched_at&order=fetched_at.desc`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/home_bases?reg=eq.${plan.reg}&select=icao&limit=1`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()).catch(()=>[]),
      fetch(`${SB_URL}/rest/v1/navlog_entries?plan_id=eq.${plan.id}&select=*&order=seq.asc`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()).catch(()=>[]),
    ]).then(([logsData, wxData, hbData, navData]) => {
      setLogs(logsData || []);
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
  const burnDiff   = (tripBurn&&planBurn) ? tripBurn-planBurn : null;

  // EASA FTL
  const isHomeBase = (icao) => homeBase && (icao === homeBase || (homeBase === 'LTAC' && icao === 'ESB') || (homeBase === 'ESB' && icao === 'LTAC'));
  const depIsHome  = isHomeBase(plan?.dep);
  const destIsHome = isHomeBase(plan?.dest);

  // Reporting time: DEP=home → ETD-01:15, else ETD-01:00
  const reportOffset = depIsHome ? 75 : 60;
  const reportTime   = plan?.std && plan.std !== '—' ? fromMins((toMins(plan.std)||0) - reportOffset) : '—';

  // Duty end = On Block + 00:30
  const dutyEnd    = onBlock !== '—' ? fromMins((toMins(onBlock)||0) + 30) : '—';

  // FDP = Duty end - Report time
  const fdpMins    = (reportTime !== '—' && dutyEnd !== '—') ? diffMins(reportTime, dutyEnd) : null;

  // Sektör sayısı (navlog'dan dep+dest hariç wpt sayısı yaklaşımı — varsayılan 1)
  const sectorCount = 1;

  // Max FDP
  const reportMins = reportTime !== '—' ? toMins(reportTime) : null;
  const maxFdpMins = reportMins !== null ? getMaxFDP(reportMins, sectorCount) : null;
  const fdpOk      = (fdpMins !== null && maxFdpMins !== null) ? fdpMins <= maxFdpMins : null;

  // Min rest: DEST=home → max(FDP,12h), away → max(FDP,10h)
  const minRestBase = destIsHome ? 720 : 600;
  const minRestMins = fdpMins !== null ? Math.max(fdpMins, minRestBase) : minRestBase;

  // Earliest next duty = On Block + 00:30 + min rest
  const earliestNextDuty = onBlock !== '—'
    ? fromMins((toMins(onBlock)||0) + 30 + minRestMins)
    : '—';

  // Docs
  const docActions = logs.map(l=>l.action);
  const hasDocs = {
    ofp:  docActions.some(a=>['PLAN_DOWNLOADED','OFP_VIEWED'].includes(a)),
    wx:   wx.length > 0,
    fuel: docActions.includes('FUEL_RECEIPT'),
    notam:docActions.includes('NOTAM_VIEWED'),
    risk: docActions.includes('RISK_ACCEPTED'),
    efp:  docActions.includes('EFP_SIGNED'),
  };

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
    <div style={S.overlay}>
      <div style={S.wrap}>
        {/* Toolbar */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:8}}>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:'#fff'}}>GO2 eFB — Flight Report</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{plan.reg} · {plan.dep}–{plan.dest} · {plan.date}</div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>window.print()} style={{background:'rgba(255,255,255,0.1)',border:'1px solid #475569',borderRadius:6,padding:'8px 16px',fontSize:12,color:'#fff',cursor:'pointer'}}>🖨 Print</button>
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
            <div style={S.cell(false,false)}><div style={S.lbl}>Pax</div><div style={S.val}>{plan.pax||'—'}</div></div>
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
            <div style={S.cell(false,false)}><div style={S.lbl}>vs OFP Plan</div><div style={{...S.val,color:burnDiff===null?'#1e293b':burnDiff>0?'#ef4444':'#16a34a'}}>{burnDiff!==null?(burnDiff>0?'+':'')+burnDiff.toLocaleString()+' lb':'—'}</div></div>
          </div>
        </div>

        {/* NAV LOG */}
        {navlogRows.length > 0 && (
          <div style={S.card}>
            <div style={S.hdr}>NAV LOG — Actual vs Plan</div>
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:10,fontFamily:'monospace'}}>
                <thead>
                  <tr style={{background:'#f1f5f9'}}>
                    {['WPT','TYPE','ETA','ATA','±TIME','FUEL PLAN','FUEL ACT','±FUEL','RVSM'].map(h=>(
                      <th key={h} style={{padding:'4px 8px',textAlign:'left',fontSize:9,color:'#64748b',fontWeight:700,borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {navlogRows.map((row, i) => {
                    const timeDiff = (row.eta && row.ata) ? diffMins(row.eta, row.ata) : null;
                    const fuelDiff = (row.fuel_plan && row.fuel_actual) ? row.fuel_actual - row.fuel_plan : null;
                    const isDep  = row.wpt_type === 'dep';
                    const isDest = row.wpt_type === 'dest';
                    const rowBg  = isDep ? '#fef9ec' : isDest ? '#f0fdf4' : i%2===0 ? '#fff' : '#f8fafc';
                    return (
                      <tr key={row.id} style={{background:rowBg}}>
                        <td style={{padding:'5px 8px',fontWeight:700,color: isDep?'#b45309': isDest?'#166534':'#1e40af',borderBottom:'1px solid #f1f5f9'}}>{row.wpt_name}</td>
                        <td style={{padding:'5px 8px',color:'#94a3b8',fontSize:9,borderBottom:'1px solid #f1f5f9'}}>{row.wpt_type?.toUpperCase()}</td>
                        <td style={{padding:'5px 8px',color:'#64748b',borderBottom:'1px solid #f1f5f9'}}>{row.eta||'—'}</td>
                        <td style={{padding:'5px 8px',fontWeight:row.ata?700:400,color:row.ata?'#1e293b':'#94a3b8',borderBottom:'1px solid #f1f5f9'}}>{row.ata||'—'}</td>
                        <td style={{padding:'5px 8px',fontWeight:700,color: timeDiff===null?'#94a3b8': Math.abs(timeDiff)<=2?'#16a34a': timeDiff>0?'#ef4444':'#16a34a',borderBottom:'1px solid #f1f5f9'}}>
                          {timeDiff!==null ? fmtDiff(timeDiff) : '—'}
                        </td>
                        <td style={{padding:'5px 8px',color:'#64748b',borderBottom:'1px solid #f1f5f9'}}>{row.fuel_plan ? row.fuel_plan.toLocaleString() : '—'}</td>
                        <td style={{padding:'5px 8px',fontWeight:row.fuel_actual?700:400,color:row.fuel_actual?'#1e293b':'#94a3b8',borderBottom:'1px solid #f1f5f9'}}>{row.fuel_actual ? row.fuel_actual.toLocaleString() : '—'}</td>
                        <td style={{padding:'5px 8px',fontWeight:700,color: fuelDiff===null?'#94a3b8': Math.abs(fuelDiff)<50?'#16a34a': fuelDiff>0?'#16a34a':'#ef4444',borderBottom:'1px solid #f1f5f9'}}>
                          {fuelDiff!==null ? (fuelDiff>=0?'+':'')+fuelDiff.toLocaleString() : '—'}
                        </td>
                        <td style={{padding:'5px 8px',color:'#64748b',fontSize:9,borderBottom:'1px solid #f1f5f9'}}>{row.rvsm||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

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

        {/* Documents */}
        <div style={S.card}>
          <div style={S.hdr}>DOCUMENTS ATTACHED</div>
          <div style={S.grid('1fr 1fr 1fr')}>
            {[{key:'ofp',label:'OFP'},{key:'wx',label:'WX Package'},{key:'fuel',label:'Fuel Receipt'},{key:'notam',label:'NOTAM'},{key:'risk',label:'Risk Assessment'},{key:'efp',label:'EFP'}].map((doc,i)=>(
              <div key={doc.key} style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:10,borderRight:i%3!==2?'1px solid #e2e8f0':'none',borderTop:i>=3?'1px solid #e2e8f0':'none'}}>
                <div style={S.chk(hasDocs[doc.key])}>
                  {hasDocs[doc.key]&&<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l3 3L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{fontSize:11,fontWeight:hasDocs[doc.key]?700:400,color:hasDocs[doc.key]?'#1e293b':'#94a3b8'}}>{doc.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* EASA FTL */}
        <div style={S.card}>
          <div style={S.hdr}>EASA FTL — ORO.FTL (CREW DUTY & REST)</div>
          <div style={S.grid('1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}>
              <div style={S.lbl}>Report Time</div>
              <div style={S.val}>{reportTime} UTC</div>
              <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{depIsHome?`Home (${homeBase}) STD −01:15`:'Away STD −01:00'}</div>
            </div>
            <div style={S.cell(true,false)}>
              <div style={S.lbl}>Duty End</div>
              <div style={S.val}>{dutyEnd} UTC</div>
              <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>On Block +00:30</div>
            </div>
            <div style={S.cell(false,false)}>
              <div style={S.lbl}>FDP</div>
              <div style={{...S.val, color: fdpOk===null?'#1e293b': fdpOk?'#16a34a':'#ef4444'}}>
                {fdpMins!==null?fromMins(fdpMins):'—'}
                {fdpOk===false && <span style={{fontSize:9,marginLeft:6,color:'#ef4444'}}>⚠ EXCEEDED</span>}
                {fdpOk===true  && <span style={{fontSize:9,marginLeft:6,color:'#16a34a'}}>✓ OK</span>}
              </div>
            </div>
          </div>
          <div style={{...S.grid('1fr 1fr 1fr'),borderTop:'1px solid #e2e8f0'}}>
            <div style={S.cell(true,false)}>
              <div style={S.lbl}>Max FDP ({sectorCount} sector)</div>
              <div style={S.val}>{maxFdpMins!==null?fromMins(maxFdpMins):'—'}</div>
              <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>EASA ORO.FTL tablo</div>
            </div>
            <div style={S.cell(true,false)}>
              <div style={S.lbl}>Min Rest Required</div>
              <div style={S.val}>{fromMins(minRestMins)}</div>
              <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>
                {destIsHome ? `Home (${homeBase}) max(FDP, 12:00)` : 'Away max(FDP, 10:00)'}
              </div>
            </div>
            <div style={S.cell(false,false)}>
              <div style={S.lbl}>Earliest Next Duty</div>
              <div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>{earliestNextDuty} UTC</div>
              <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>Duty end + {fromMins(minRestMins)} rest</div>
            </div>
          </div>
          <div style={{background:'#f8fafc',borderTop:'1px solid #e2e8f0',padding:'6px 14px'}}>
            <div style={{fontSize:9,color:'#94a3b8'}}>
              WOCL 02:00–05:59 · Cumulative: 60h/7d · 190h/28d · Flight Time: 100h/28d · 900h/year
            </div>
          </div>
        </div>

        <div style={{fontSize:10,color:'#94a3b8',textAlign:'center',marginTop:8}}>
          Report generated by GO2 eFB · Archive copy · CAMO data not included · {new Date().toUTCString()}
        </div>
      </div>
    </div>
  );
}