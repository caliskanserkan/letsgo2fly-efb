import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';

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
  const [homeBase,    setHomeBase]    = useState(null);
  const [pfHomeBase,  setPfHomeBase]  = useState(null);
  const [pmHomeBase,  setPmHomeBase]  = useState(null);
  const [navlogRows,  setNavlogRows]  = useState([]);
  const [fltReport,   setFltReport]   = useState(null);
  const [signedUrls,  setSignedUrls]  = useState({});
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    if (!plan?.id) return;
    Promise.all([
      supabase.from('flight_logs').select('action,details,created_at').eq('plan_id', plan.id).order('created_at',{ascending:true}).then(({data})=>data||[]),
      supabase.from('home_bases').select('icao').eq('reg', plan.reg).limit(1).then(({data})=>data||[]),
      supabase.from('navlog_entries').select('*').eq('plan_id', plan.id).order('seq',{ascending:true}).then(({data})=>data||[]),
      supabase.from('flt_report').select('*').eq('plan_id', plan.id).limit(1).then(({data})=>data||[]),
    ]).then(([logsData, hbData, navData, fltReportData]) => {
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
      setHomeBase(hbData?.[0]?.icao || null);
      setNavlogRows(navData || []);
      setLoading(false);
    });
  }, [plan?.id]); // eslint-disable-line

  const getLog = useCallback((action) => {
    const found = logs.filter(l => l.action === action);
    return found.length ? found[found.length-1].details : null;
  }, [logs]);

  // VERI KAYNAGI: flt_report birincil, flight_logs fallback (eski web ucuslari)
  const FR = fltReport;

  // efb-documents bucket PRIVATE -> signed URL (belgeler + imzalar)
  useEffect(() => {
    if (!FR) return;
    const paths = [];
    (Array.isArray(FR.documents) ? FR.documents : []).forEach(d => { if (d && d.file_path) paths.push(d.file_path); });
    if (FR.mandatory && FR.mandatory.signature_url) paths.push(FR.mandatory.signature_url);
    if (FR.accept && FR.accept.signature_url) paths.push(FR.accept.signature_url);
    if (!paths.length) return;
    supabase.storage.from('efb-documents').createSignedUrls(paths, 3600)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(r => { if (r && r.path && r.signedUrl) map[r.path] = r.signedUrl; });
        setSignedUrls(map);
      })
      .catch(() => {});
  }, [FR]);

  const numLb = (v) => {
    if (v === null || v === undefined || v === '' || v === '\u2014') return null;
    const n = parseInt(String(v).replace(/,/g,''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const pick = (a, b) => (a !== null && a !== undefined && a !== '') ? a : (b || '\u2014');
  const crewLog = getLog('CREW_ASSIGNED');
  const pfName  = pick(FR?.pf_name, crewLog?.pf_name || plan.pf_pilot);
  const pmName  = pick(FR?.pm_name, crewLog?.pm_name || plan.pm_pilot);
  const sigName = (id) => {
    if (!id) return '—';
    if (id === FR?.crew?.pf?.id) return FR.crew.pf.name || id;
    if (id === FR?.crew?.pm?.id) return FR.crew.pm.name || id;
    return id;
  };
  const pfHB    = FR?.crew?.pf?.home_base || pfHomeBase;
  const pmHB    = FR?.crew?.pm?.home_base || pmHomeBase;
  const depIcao      = FR?.dep_icao  || plan.dep;
  const destIcao     = FR?.dest_icao || plan.dest;
  const isDivert     = !!FR?.is_divert;
  const divertReason = FR?.divert_reason || null;
  const offBlock = pick(FR?.off_block,    getLog('OFF_BLOCKS')?.time);
  const toTime   = pick(FR?.takeoff_time, getLog('TAKEOFF')?.time);
  const landTime = pick(FR?.landing_time, getLog('LANDING')?.time);
  const onBlock  = pick(FR?.on_block,     getLog('ON_BLOCKS')?.time);
  const toFuelN  = numLb(FR?.takeoff_fuel)   ?? numLb(getLog('TAKEOFF')?.fuel_lb);
  const remFuelN = numLb(FR?.remaining_fuel) ?? numLb(getLog('FUEL_REMAINING')?.fuel_lb);
  const toFuel   = toFuelN  !== null ? toFuelN  : '\u2014';
  const remFuel  = remFuelN !== null ? remFuelN : '\u2014';
  const blockTime  = (FR?.block_minutes    ?? null) !== null ? FR.block_minutes    : diffMins(offBlock, onBlock);
  const flightTime = (FR?.airborne_minutes ?? null) !== null ? FR.airborne_minutes : diffMins(toTime, landTime);
  const tripBurn   = (toFuelN !== null && remFuelN !== null) ? toFuelN - remFuelN : null;
  const planBurn   = numLb(FR?.fuel?.plan_trip) ?? numLb(plan?.trip_fuel);
  const burnDiff   = (tripBurn !== null && planBurn !== null) ? planBurn - tripBurn : null;

  // EASA FTL — pilot bazlı hesaplama
  const sectorCount = 1;
  const dutyEnd = onBlock !== '—' ? fromMins((toMins(onBlock)||0) + 30) : '—';

  const calcFTL = (pilotHomeBase) => {
    const isHome = (icao) => pilotHomeBase && (
      icao === pilotHomeBase ||
      (pilotHomeBase === 'LTAC' && icao === 'ESB') ||
      (pilotHomeBase === 'ESB'  && icao === 'LTAC')
    );
    const depHome  = isHome(depIcao);
    const destHome = isHome(destIcao);
    const reportOffset = 60; // EASA: her ucus icin STD - 01:00
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

  const pfFTL = calcFTL(pfHB);
  const pmFTL = calcFTL(pmHB);

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



  // ---- SAVE PDF: rapor + belgeler (orijinal PDF sayfalari) tek dosyada ----
  const [pdfBusy, setPdfBusy] = useState(false);

  const savePdf = async (mode = 'download') => {
    setPdfBusy(true);
    const node = document.getElementById('flt-report-content');
    const hidden = [];
    try {
      // 1) Yazdirmaya girmeyecek ogeleri gecici gizle (toolbar + gomulu iframe onizleme)
      node.querySelectorAll('.no-print, iframe').forEach(el => {
        hidden.push([el, el.style.display]);
        el.style.display = 'none';
      });

      // 2) Imzalar signed URL (cross-origin) -> html2canvas CORS icin base64'e cevir
      const imgs = Array.from(node.querySelectorAll('img'));
      const restore = [];
      await Promise.all(imgs.map(async (img) => {
        if (img.src.startsWith('data:')) return;
        try {
          const blob = await (await fetch(img.src)).blob();
          const b64 = await new Promise(res => {
            const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob);
          });
          restore.push([img, img.src]);
          img.src = b64;
        } catch { /* imza gelmezse bos birak */ }
      }));

      // 3) Rapor DOM -> canvas -> A4 sayfalara bol
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      restore.forEach(([img, src]) => { img.src = src; });

      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgW = pw - 12;
      const imgH = (canvas.height * imgW) / canvas.width;
      let rest = imgH, pos = 6;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 6, pos, imgW, imgH);
      rest -= (ph - 12);
      while (rest > 0) {
        pos = rest - imgH + 6;
        pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 6, pos, imgW, imgH);
        rest -= (ph - 12);
      }

      // 4) Rapor PDF + belge PDF'lerini birlestir (belgeler ORIJINAL boyutunda, tam)
      const merged = await PDFDocument.load(pdf.output('arraybuffer'));
      const docs = (Array.isArray(FR?.documents) ? FR.documents : [])
        .filter(d => (d.mime_type || '').includes('pdf') && signedUrls[d.file_path]);
      for (const d of docs) {
        try {
          const bytes = await (await fetch(signedUrls[d.file_path])).arrayBuffer();
          const src = await PDFDocument.load(bytes);
          const pages = await merged.copyPages(src, src.getPageIndices());
          pages.forEach(pg => merged.addPage(pg));
        } catch { /* belge acilmazsa atla */ }
      }

      const bytes = await merged.save();
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      if (mode === 'print') {
        const w = window.open(url, '_blank');
        if (!w) alert('Popup engellendi - tarayici ayarlarindan izin verin');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `GO2_FltReport_${plan.reg}_${depIcao}-${destIcao}_${(plan.date||'').replace(/\s/g,'')}.pdf`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (e) {
      alert('PDF olusturulamadi: ' + (e?.message || e));
    } finally {
      hidden.forEach(([el, d]) => { el.style.display = d; });
      setPdfBusy(false);
    }
  };

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
            <button onClick={()=>savePdf('print')} disabled={pdfBusy}  style={{background:'rgba(255,255,255,0.1)',border:'1px solid #475569',borderRadius:6,padding:'8px 16px',fontSize:12,color:'#fff',cursor:'pointer'}}>🖨 Print</button>
            <button onClick={savePdf} disabled={pdfBusy} style={{background:pdfBusy?'#334155':'#1e40af',border:'1px solid #1e40af',borderRadius:6,padding:'8px 16px',fontSize:12,color:'#fff',cursor:pdfBusy?'wait':'pointer'}}>{pdfBusy?'… PDF':'⬇ Save PDF'}</button>
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
          // Divert noktasindan SONRAKI planli WPT'ler uculmadi (dest + alt dahil)
          const divertIdx = navlogData.findIndex(r => r.type === 'divert-arpt');
          const rows = navlogData.map((row, idx) => {
            const notFlown = divertIdx >= 0 && idx > divertIdx;
            const isDiv    = row.type === 'divert-arpt';
            const isPlt    = row.custom === true && !isDiv;
            return {
              wpt: row.wpt,
              type: row.type?.toUpperCase(),
              eta: (row.eta && row.eta !== '—') ? row.eta : '—',
              ata: row.ata || '—',
              fuel: row.fuel_actual ? parseInt(row.fuel_actual).toLocaleString()+' lb' : '—',
              rvsm: row.rvsm || '—',
              notFlown, isDiv, isPlt,
              bg: notFlown ? '#f8fafc'
                : isDiv    ? '#fef2f2'
                : isPlt    ? '#faf5ff'
                : row.type==='dep'  ? '#fef9ec'
                : row.type==='dest' ? '#f0fdf4' : '#fff',
              color: isDiv ? '#dc2626'
                : isPlt    ? '#7c3aed'
                : row.type==='dep'  ? '#b45309'
                : row.type==='dest' ? '#166534' : '#1e40af',
            };
          });
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
                      <tr key={i} style={{background:row.bg,opacity:row.notFlown?0.4:1}}>
                        <td style={{padding:'6px 10px',fontWeight:700,color:row.color,borderBottom:'1px solid #f1f5f9',textDecoration:row.notFlown?'line-through':'none'}}>
                          {row.wpt}
                          {row.isDiv && <span style={{marginLeft:6,fontSize:8,fontWeight:700,color:'#dc2626',border:'1px solid #dc2626',borderRadius:3,padding:'1px 3px'}}>DIVERT</span>}
                          {row.isPlt && <span style={{marginLeft:6,fontSize:8,fontWeight:700,color:'#7c3aed',border:'1px solid #7c3aed',borderRadius:3,padding:'1px 3px'}}>+PLT</span>}
                        </td>
                        <td style={{padding:'6px 10px',color:'#94a3b8',fontSize:9,borderBottom:'1px solid #f1f5f9'}}>{row.notFlown?'NOT FLOWN':row.type}</td>
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

        {/* T/O & LANDING */}
        {(FR?.takeoff || FR?.landing) && (
          <div style={S.card}>
            <div style={S.hdr}>T/O &amp; LANDING DATA</div>
            {FR?.takeoff && (<>
              <div style={{background:'#f8fafc',padding:'4px 14px',borderTop:'1px solid #e2e8f0'}}><span style={{fontSize:9,fontWeight:700,color:'#b45309'}}>TAKEOFF — {FR.takeoff.icao||depIcao}</span></div>
              <div style={S.grid('1fr 1fr 1fr 1fr 1fr')}>
                <div style={S.cell(true,false)}><div style={S.lbl}>RWY</div><div style={S.val}>{FR.takeoff.rwy||'\u2014'}</div></div>
                <div style={S.cell(true,false)}><div style={S.lbl}>V1</div><div style={S.val}>{FR.takeoff.v1||'\u2014'}</div></div>
                <div style={S.cell(true,false)}><div style={S.lbl}>VR</div><div style={S.val}>{FR.takeoff.vr||'\u2014'}</div></div>
                <div style={S.cell(true,false)}><div style={S.lbl}>V2</div><div style={S.val}>{FR.takeoff.v2||'\u2014'}</div></div>
                <div style={S.cell(false,false)}><div style={S.lbl}>TRIM</div><div style={S.val}>{FR.takeoff.trim||'\u2014'}</div></div>
                <div style={S.cell(true,true)}><div style={S.lbl}>SID</div><div style={S.val}>{FR.takeoff.sid||'\u2014'}</div></div>
                <div style={S.cell(true,true)}><div style={S.lbl}>REQ RW</div><div style={S.val}>{FR.takeoff.req_rw||'\u2014'}</div></div>
                <div style={S.cell(true,true)}><div style={S.lbl}>RWY LEN</div><div style={S.val}>{FR.takeoff.rwy_len||'\u2014'}</div></div>
                <div style={S.cell(true,true)}><div style={S.lbl}>ATIS</div><div style={S.val}>{FR.takeoff.atis||'\u2014'}</div></div>
                <div style={S.cell(false,true)}><div style={S.lbl}>RVSM (P1/SBY/P2)</div><div style={{...S.val,fontSize:10}}>{[FR.takeoff.rvsm?.pri1,FR.takeoff.rvsm?.sby,FR.takeoff.rvsm?.pri2].map(x=>x||'\u2014').join(' / ')}</div></div>
              </div>
            </>)}
            {FR?.landing && (<>
              <div style={{background:'#f8fafc',padding:'4px 14px',borderTop:'2px solid #e2e8f0'}}><span style={{fontSize:9,fontWeight:700,color:'#166534'}}>LANDING — {FR.landing.icao||destIcao}</span>{FR.landing.is_divert&&<span style={{fontSize:9,color:'#ef4444',marginLeft:8,fontWeight:700}}>DIVERT</span>}</div>
              <div style={S.grid('1fr 1fr 1fr 1fr 1fr')}>
                <div style={S.cell(true,false)}><div style={S.lbl}>RWY</div><div style={S.val}>{FR.landing.rwy||'\u2014'}</div></div>
                <div style={S.cell(true,false)}><div style={S.lbl}>VREF</div><div style={S.val}>{FR.landing.vref||'\u2014'}</div></div>
                <div style={S.cell(true,false)}><div style={S.lbl}>QNH</div><div style={S.val}>{FR.landing.qnh||'\u2014'}</div></div>
                <div style={S.cell(true,false)}><div style={S.lbl}>REQ LND</div><div style={S.val}>{FR.landing.req_lnd||'\u2014'}</div></div>
                <div style={S.cell(false,false)}><div style={S.lbl}>ACTUAL LW</div><div style={S.val}>{FR.landing.actual_lw||'\u2014'}</div></div>
                <div style={S.cell(true,true)}><div style={S.lbl}>RWY COND</div><div style={S.val}>{FR.landing.rwy_cond||'\u2014'}</div></div>
                <div style={S.cell(true,true)}><div style={S.lbl}>RWY LEN</div><div style={S.val}>{FR.landing.rwy_len||'\u2014'}</div></div>
                <div style={S.cell(false,true)}><div style={S.lbl}>ATIS</div><div style={S.val}>{FR.landing.arr_atis||FR.landing.atis||'\u2014'}</div></div>
              </div>
            </>)}
          </div>
        )}

        {/* SIGNATURES */}
        {(FR?.mandatory || FR?.accept) && (
          <div style={S.card}>
            <div style={S.hdr}>SIGNATURES</div>
            <div style={S.grid('1fr 1fr')}>
              <div style={S.cell(true,false)}>
                <div style={S.lbl}>Mandatory Check — {sigName(FR?.mandatory?.signed_by)}</div>
                {FR?.mandatory?.signature_url
                  ? <img src={signedUrls[FR.mandatory.signature_url]} alt="mandatory signature" style={{height:44,marginTop:4,background:'#fff'}} />
                  : <div style={S.val}>Not signed</div>}
                <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{FR?.mandatory?.signed_at ? new Date(FR.mandatory.signed_at).toUTCString() : ''}</div>
              </div>
              <div style={S.cell(false,false)}>
                <div style={S.lbl}>Plan Accepted (PIC) — {FR?.accept?.pic_id ? sigName(FR.accept.pic_id) : pfName}</div>
                {FR?.accept?.signature_url
                  ? <img src={signedUrls[FR.accept.signature_url]} alt="accept signature" style={{height:44,marginTop:4,background:'#fff'}} />
                  : <div style={S.val}>{FR?.accept?.accepted ? 'Accepted' : 'Not signed'}</div>}
                <div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{FR?.accept?.signed_at ? new Date(FR.accept.signed_at).toUTCString() : ''}</div>
              </div>
            </div>
          </div>
        )}

        {/* DOCUMENTS */}
        {Array.isArray(FR?.documents) && FR.documents.length>0 && (
          <div style={S.card}>
            <div style={S.hdr}>DOCUMENTS ({FR.documents.length})</div>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,fontFamily:'monospace'}}>
              <thead><tr style={{background:'#f1f5f9'}}>
                {['SECTION','FILE','SIZE','UPLOADED'].map(h=>(<th key={h} style={{padding:'6px 10px',textAlign:'left',fontSize:9,color:'#64748b',fontWeight:700,borderBottom:'1px solid #e2e8f0'}}>{h}</th>))}
              </tr></thead>
              <tbody>
                {FR.documents.map((d,i)=>(
                  <tr key={d.id||i}>
                    <td style={{padding:'6px 10px',fontWeight:700,color:'#1e40af',fontSize:10,borderBottom:'1px solid #f1f5f9'}}>{(d.section||'\u2014').toUpperCase()}</td>
                    <td style={{padding:'6px 10px',color:'#1e293b',borderBottom:'1px solid #f1f5f9'}}>
                      <a href={signedUrls[d.file_path]} target="_blank" rel="noopener noreferrer" style={{color:'#1e40af'}}>{d.file_name}</a>
                    </td>
                    <td style={{padding:'6px 10px',color:'#64748b',fontSize:10,borderBottom:'1px solid #f1f5f9'}}>{d.file_size?Math.round(d.file_size/1024)+' KB':'\u2014'}</td>
                    <td style={{padding:'6px 10px',color:'#94a3b8',fontSize:10,borderBottom:'1px solid #f1f5f9'}}>{d.uploaded_at?new Date(d.uploaded_at).toISOString().slice(0,16).replace('T',' '):'\u2014'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {FR.documents.filter(d=>(d.mime_type||'').includes('pdf')).map((d,i)=>(
              <div key={'emb'+i} style={{borderTop:'1px solid #e2e8f0'}}>
                <div style={{padding:'6px 14px',background:'#f8fafc',fontSize:9,fontWeight:700,color:'#64748b'}}>{(d.section||'').toUpperCase()} — {d.file_name}</div>
                <iframe
                  title={d.file_name}
                  src={signedUrls[d.file_path]}
                  style={{width:'100%',height:900,border:'none',display:'block',background:'#fff'}}
                />
              </div>
            ))}
          </div>
        )}

        {/* AIRCRAFT / ENGINE HOURS */}
        {FR?.ac_hours && (
          <div style={S.card}>
            <div style={S.hdr}>AIRCRAFT &amp; ENGINE HOURS (after this flight)</div>
            <div style={S.grid('1fr 1fr 1fr 1fr')}>
              <div style={S.cell(true,false)}><div style={S.lbl}>Airframe</div><div style={S.val}>{FR.ac_hours.airframe||'\u2014'}</div></div>
              <div style={S.cell(true,false)}><div style={S.lbl}>Engine 1</div><div style={S.val}>{FR.ac_hours.eng1||'\u2014'}</div></div>
              <div style={S.cell(true,false)}><div style={S.lbl}>Engine 2</div><div style={S.val}>{FR.ac_hours.eng2||'\u2014'}</div></div>
              <div style={S.cell(false,false)}><div style={S.lbl}>Cycles</div><div style={S.val}>{FR.ac_hours.cycles ?? '\u2014'}</div></div>
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
          <div style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc',padding:'4px 14px'}}><span style={{fontSize:9,fontWeight:700,color:'#1e40af'}}>PF — {pfName}</span>{pfHB?<span style={{fontSize:9,color:'#94a3b8',marginLeft:8}}>Home: {pfHB}</span>:<span style={{fontSize:9,color:'#ef4444',marginLeft:8}}>No home base set</span>}</div>
          <div style={S.grid('1fr 1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Report Time</div><div style={S.val}>{pfFTL.reportTime} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>STD − 01:00</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>FDP</div><div style={{...S.val,color:pfFTL.fdpOk===null?'#1e293b':pfFTL.fdpOk?'#16a34a':'#ef4444'}}>{pfFTL.fdpMins!==null?fromMins(pfFTL.fdpMins):'—'}{pfFTL.fdpOk===false&&<span style={{fontSize:9,marginLeft:4,color:'#ef4444'}}>⚠</span>}{pfFTL.fdpOk===true&&<span style={{fontSize:9,marginLeft:4,color:'#16a34a'}}>✓</span>}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>Max: {pfFTL.maxFdpMins!==null?fromMins(pfFTL.maxFdpMins):'—'}</div></div>
            <div style={S.cell(true,false)}><div style={S.lbl}>Min Rest</div><div style={S.val}>{fromMins(pfFTL.minRestMins)}</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>{pfFTL.destHome?'Home 12:00':'Away 10:00'}</div></div>
            <div style={S.cell(false,false)}><div style={S.lbl}>Earliest Next Duty</div><div style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>{pfFTL.earliestNext} UTC</div></div>
          </div>
          {/* PM */}
          <div style={{borderTop:'2px solid #e2e8f0',background:'#f8fafc',padding:'4px 14px'}}><span style={{fontSize:9,fontWeight:700,color:'#0f766e'}}>PM — {pmName}</span>{pmHB?<span style={{fontSize:9,color:'#94a3b8',marginLeft:8}}>Home: {pmHB}</span>:<span style={{fontSize:9,color:'#ef4444',marginLeft:8}}>No home base set</span>}</div>
          <div style={S.grid('1fr 1fr 1fr 1fr')}>
            <div style={S.cell(true,false)}><div style={S.lbl}>Report Time</div><div style={S.val}>{pmFTL.reportTime} UTC</div><div style={{fontSize:9,color:'#94a3b8',marginTop:2}}>STD − 01:00</div></div>
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