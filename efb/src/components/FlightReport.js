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

export default function FlightReport({ plan, onClose }) {
  const [logs,     setLogs]     = useState([]);
  const [wx,       setWx]       = useState([]);
  const [homeBase, setHomeBase] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!plan?.id) return;
    Promise.all([
      fetch(`${SB_URL}/rest/v1/flight_logs?plan_id=eq.${plan.id}&select=action,details,created_at&order=created_at.asc`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/wx_snapshots?plan_id=eq.${plan.id}&select=icao,type,raw_text,fetched_at&order=fetched_at.desc`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()),
      fetch(`${SB_URL}/rest/v1/home_bases?reg=eq.${plan.reg}&select=icao&limit=1`,
        { headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`} }).then(r=>r.json()).catch(()=>[]),
    ]).then(([logsData, wxData, hbData]) => {
      setLogs(logsData || []);
      const wxMap = {};
      (wxData || []).forEach(r => { const k=`${r.icao}_${r.type}`; if(!wxMap[k]) wxMap[k]=r; });
      setWx(Object.values(wxMap));
      setHomeBase(hbData?.[0]?.icao || null);
      setLoading(false);
    });
  }, [plan?.id]); // eslint-disable-line

  const getLog = useCallback((action) => {
    const found = logs.filter(l => l.action === action);
    return found.length ? found[found.length-1].details : null;
  }, [logs]);

  // Crew — CREW_ASSIGNED log'undan
  const crewLog    = getLog('CREW_ASSIGNED');
  const pfName     = crewLog?.pf_name || plan.pf_pilot || '—';
  const pmName     = crewLog?.pm_name || plan.pm_pilot || '—';
  const preflightBy = pfName; // PF preflight yapar

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

  // Duty
  const isHome     = homeBase && (plan?.dep===homeBase || plan?.dest===homeBase);
  const dutyOffset = isHome ? 75 : 60;
  const restMin    = isHome ? 720 : 600;
  const dutyStart  = offBlock!=='—' ? fromMins((toMins(offBlock)||0)-dutyOffset) : '—';
  const dutyEnd    = onBlock!=='—'  ? fromMins((toMins(onBlock)||0)+30)          : '—';
  const fdp        = (dutyStart!=='—'&&dutyEnd!=='—') ? diffMins(dutyStart,dutyEnd) : null;
  const earliestDuty = offBlock!=='—' ? fromMins((toMins(offBlock)||0)+restMin) : '—';

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

  // PDF — jsPDF via CDN
  const handlePDF = async () => {
    if (!window.jspdf) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      document.head.appendChild(script);
      await new Promise(res => { script.onload = res; });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W = 210, mg = 14;
    let y = 14;
    const LINE = 5.5;

    const hdr = (txt) => {
      doc.setFillColor(248,250,252); doc.rect(mg, y, W-mg*2, 7, 'F');
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
      doc.text(txt, mg+2, y+5); y += 8;
    };
    const row = (cols, bolds=[]) => {
      const cw = (W-mg*2)/cols.length;
      cols.forEach((c,i) => {
        doc.setFontSize(7); doc.setFont('helvetica', bolds.includes(i)?'bold':'normal');
        doc.setTextColor(bolds.includes(i)?30:100, bolds.includes(i)?41:116, bolds.includes(i)?59:139);
        doc.text(String(c.label||''), mg+i*cw+1, y+3);
        doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
        doc.text(String(c.val||'—'), mg+i*cw+1, y+8);
      });
      doc.setDrawColor(226,232,240); doc.line(mg, y+LINE*2, W-mg, y+LINE*2);
      y += LINE*2+1;
    };
    const chk = (x, yy, on) => {
      doc.setDrawColor(on?30:180, on?41:180, on?59:180); doc.setLineWidth(on?0.5:0.3);
      doc.rect(x, yy, 4, 4);
      if(on){ doc.setDrawColor(30,41,59); doc.line(x+0.8,yy+2,x+1.8,yy+3.2); doc.line(x+1.8,yy+3.2,x+3.5,yy+0.8); }
    };

    // Title
    doc.setFontSize(14); doc.setFont('helvetica','bold'); doc.setTextColor(30,41,59);
    doc.text('GO2 eFB — Flight Report', mg, y); y+=6;
    doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(100,116,139);
    doc.text(`${plan.reg||''} · ${plan.dep||''}–${plan.dest||''} · ${plan.date||''}`, mg, y); y+=8;

    // Aircraft & Crew
    hdr('AIRCRAFT & CREW');
    row([{label:'Registration',val:plan.reg},{label:'Type',val:plan.ac_type},{label:'Date',val:plan.date}]);
    row([{label:'PIC (PF)',val:pfName},{label:'SIC (PM)',val:pmName},{label:'Pre-flight by',val:preflightBy}]);

    // Flight Data
    hdr('FLIGHT DATA');
    row([{label:'DEP',val:plan.dep},{label:'DEST',val:plan.dest},{label:'ALT',val:plan.alternate||'—'},{label:'Pax',val:plan.pax||'—'}]);
    row([{label:'Off Block',val:offBlock+' UTC'},{label:'T/O',val:toTime+' UTC'},{label:'Landing',val:landTime+' UTC'},{label:'On Block',val:onBlock+' UTC'}]);
    row([{label:'Block Time',val:blockTime!==null?fromMins(blockTime):'—'},{label:'Flight Time',val:flightTime!==null?fromMins(flightTime):'—'},{label:'STD',val:plan.std||'—'},{label:'STA',val:plan.eta||'—'}]);

    // Fuel
    hdr('FUEL');
    row([{label:'FOB Plan',val:plan.fob||'—'},{label:'T/O Fuel',val:toFuel!=='—'?parseInt(toFuel).toLocaleString()+' lb':'—'},{label:'Remaining',val:remFuel!=='—'?parseInt(remFuel).toLocaleString()+' lb':'—'},{label:'Trip Burn',val:tripBurn?tripBurn.toLocaleString()+' lb':'—'},{label:'vs OFP',val:burnDiff!==null?(burnDiff>0?'+':'')+burnDiff.toLocaleString()+' lb':'—'}]);

    // WX
    if(Object.keys(wxByIcao).length) {
      hdr(`WX — ${Object.keys(wxByIcao).join(' / ')}`);
      Object.entries(wxByIcao).forEach(([icao,data]) => {
        ['METAR','TAF'].forEach(type => {
          if(!data[type]) return;
          doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(100,116,139);
          doc.text(`${icao} ${type}`, mg, y+3); y+=4;
          doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(30,41,59);
          const lines = doc.splitTextToSize(data[type], W-mg*2-2);
          doc.setFillColor(248,250,252); doc.rect(mg,y,W-mg*2,lines.length*4+2,'F');
          doc.text(lines, mg+1, y+3.5); y += lines.length*4+4;
        });
      });
    }

    // Documents
    hdr('DOCUMENTS ATTACHED');
    const docs = [{key:'ofp',label:'OFP'},{key:'wx',label:'WX Package'},{key:'fuel',label:'Fuel Receipt'},{key:'notam',label:'NOTAM'},{key:'risk',label:'Risk Assessment'},{key:'efp',label:'EFP'}];
    const dcw = (W-mg*2)/3;
    docs.forEach((d,i) => {
      const col=i%3, rowN=Math.floor(i/3);
      const x=mg+col*dcw, yy=y+rowN*8;
      chk(x, yy+1, hasDocs[d.key]);
      doc.setFontSize(9); doc.setFont('helvetica', hasDocs[d.key]?'bold':'normal');
      doc.setTextColor(hasDocs[d.key]?30:160, hasDocs[d.key]?41:160, hasDocs[d.key]?59:160);
      doc.text(d.label, x+6, yy+4.5);
    });
    y += Math.ceil(docs.length/3)*8+4;

    // Duty
    hdr(`CREW DUTY & REST — ${isHome?`Home base (${homeBase}) −01:15`:'Away base −01:00'}`);
    row([{label:'Duty start',val:dutyStart+' UTC'},{label:'Duty end',val:dutyEnd+' UTC'},{label:'FDP',val:fdp!==null?fromMins(fdp):'—'}]);
    row([{label:'Min rest required',val:isHome?'12:00 hrs':'10:00 hrs'},{label:'Earliest next duty',val:earliestDuty+' UTC'},{label:'Base type',val:isHome?`Home (${homeBase})`:'Away'}]);

    // Footer
    y += 4;
    doc.setDrawColor(226,232,240); doc.line(mg,y,W-mg,y); y+=4;
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(148,163,184);
    doc.text(`GO2 eFB · Archive copy · CAMO data not included · ${new Date().toUTCString()}`, mg, y);

    // Save
    const fname = `FlightReport_${plan.reg||'REG'}_${plan.dep||'DEP'}-${plan.dest||'DEST'}_${(plan.date||'').replace(/\s/g,'')}.pdf`;
    doc.save(fname);
  };

  const S = {
    overlay:{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',zIndex:200,overflowY:'auto'},
    wrap:{maxWidth:720,margin:'0 auto',padding:'20px 16px 40px',fontFamily:'monospace'},
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
            <button onClick={handlePDF} style={{background:'#38bdf8',border:'none',borderRadius:6,padding:'8px 16px',fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer'}}>⬇ Download PDF</button>
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
            <div style={S.cell(false,true)}><div style={S.lbl}>Pre-flight by</div><div style={S.val}>{preflightBy}</div></div>
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

        {/* Duty */}
        <div style={S.card}>
          <div style={S.hdr}>CREW DUTY & REST — {isHome?`Home base (${homeBase}) −01:15`:'Away base −01:00'}</div>
          <div style={S.grid('1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Duty start</div><div style={S.val}>{dutyStart} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{isHome?'off block −01:15':'off block −01:00'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Duty end</div><div style={S.val}>{dutyEnd} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>on block +00:30</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>FDP</div><div style={S.val}>{fdp!==null?fromMins(fdp):'—'}</div></div>
          </div>
          <div style={{...S.grid('1fr 1fr'),borderTop:'1px solid #e2e8f0',background:'#f8fafc'}}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Min rest required</div><div style={S.val}>{isHome?'12:00 hrs':'10:00 hrs'}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>off block → next off block</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Earliest next duty</div><div style={{fontSize:14,fontWeight:700,color:'#1e293b'}}>{earliestDuty} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>off block {offBlock} + {isHome?'12:00':'10:00'}</div></div>
          </div>
        </div>

        <div style={{fontSize:10,color:'#94a3b8',textAlign:'center',marginTop:8}}>
          Report generated by GO2 eFB · Archive copy · CAMO data not included · {new Date().toUTCString()}
        </div>
      </div>
    </div>
  );
}
