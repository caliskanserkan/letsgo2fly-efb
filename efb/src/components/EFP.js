import React, { useState } from 'react';
import { parseWeatherText, COLORS } from '../config/weatherRules';

function FLPlan() {
  return (
    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', background:'#111' }}>
      <div style={{ background:'#1f1f1f', borderBottom:'1px solid #383838', padding:'7px 14px', display:'flex', gap:7, flexShrink:0 }}>
        <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:5, padding:'4px 10px', fontSize:11, color:'#1a9bc4', cursor:'pointer' }}>✏ i-Pen</div>
        <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:5, padding:'4px 10px', fontSize:11, color:'#1a9bc4', cursor:'pointer' }}>↩ Undo</div>
        <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:5, padding:'4px 10px', fontSize:11, color:'#1a9bc4', cursor:'pointer' }}>↪ Redo</div>
        <div style={{ flex:1 }} />
        <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:5, padding:'4px 10px', fontSize:11, color:'#1a9bc4', cursor:'pointer' }}>⬆ Export</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
        <div style={{ margin:'10px 14px', border:'1px solid #333', padding:'14px 16px', background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:3 }}>
          <div>FMS IDENT=S3791{'  '}Log Nr.: 5359{'  '}Page 1{'       '}LTAC-LTBA{'  '}TCREC</div>
          <div style={{ border:'1px solid #555', padding:'5px 8px', margin:'5px 0' }}>
            FLT{'  '}TCREC{'  '}LTAC-LTBA{'  '}ESB-ISL{'    '}ETD:09:00 ETA:09:48 GLF4{'  '}Lbs<br/>
            REGN TCREC{'          '}CRUISE:M.80{'  '}11APR26{'   '}WX PROG 101200<br/>
            {'                                          '}WX VALID +36HRS
          </div>
          <br/>
          PIC :{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:120 }}>&nbsp;</span>{'  '}SIGN :{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:100 }}>&nbsp;</span><br/><br/>
          DISP: TOLGA UGURLUTEGIN{'    '}LICENSE NO: TR-D 08356{'  '}SIGN{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:80 }}>&nbsp;</span>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          DEPARTURE ATIS:{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:200 }}>&nbsp;</span><br/><br/>
          ATC CLRNC: SID:{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:40 }}>&nbsp;</span>{'  '}FL:{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:30 }}>&nbsp;</span>{'  '}SQ:{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:35 }}>&nbsp;</span>{'  '}OTH:{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:40 }}>&nbsp;</span><br/><br/>
          ARRIVAL ATIS:{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:210 }}>&nbsp;</span>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          RVSM CHECK{'  '}NO1 ALT{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:38 }}>&nbsp;</span>{'  '}STBY{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:38 }}>&nbsp;</span>{'  '}NO2 ALT{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:38 }}>&nbsp;</span>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'9.5px', lineHeight:1.7 }}>
            <tbody>
              <tr><td></td><td>FUEL</td><td>TIME</td><td>MAX DESIGN WTS</td><td>SPEEDS</td></tr>
              <tr><td>TRIP</td><td>2713</td><td>0:48</td><td>MDF 1980{'  '}MZFW 49000</td><td>V1{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:30 }}>&nbsp;</span></td></tr>
              <tr><td>CONT</td><td>250</td><td>0:05</td><td>MTOW 74600</td><td></td></tr>
              <tr><td>ALT</td><td>533</td><td>0:11</td><td>LTFM{'  '}MLWT 66000</td><td>VR{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:30 }}>&nbsp;</span></td></tr>
              <tr><td>FINAL RES</td><td>1447</td><td>0:30</td><td></td><td>V2{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:30 }}>&nbsp;</span></td></tr>
              <tr><td>MIN T/O</td><td>4943</td><td>1:34</td><td></td><td></td></tr>
              <tr><td>TAXI</td><td>400</td><td></td><td></td><td></td></tr>
              <tr><td>TOTAL FOB</td><td>13000</td><td>4:15</td><td>MAX FUEL 25120</td><td>VREF{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:30 }}>&nbsp;</span></td></tr>
            </tbody>
          </table>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          FUEL T/O{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:38 }}>&nbsp;</span>{'  '}BLON{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:32 }}>&nbsp;</span>{'  '}LDG{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:32 }}>&nbsp;</span><br/>
          LDG FUEL{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:38 }}>&nbsp;</span>{'        '}BLOFF{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:32 }}>&nbsp;</span>{'  '}T/O{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:32 }}>&nbsp;</span><br/>
          BURNOFF{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:38 }}>&nbsp;</span>{'  '}TIME{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:32 }}>&nbsp;</span>{'  '}TIME{'  '}<span style={{ display:'inline-block', borderBottom:'1px solid #333', minWidth:32 }}>&nbsp;</span>
        </div>
      </div>
    </div>
  );
}

function ATCPlan() {
  return (
    <div style={{ flex:1, overflowY:'auto', background:'#111', padding:'8px 0' }}>
      <div style={{ margin:'10px 14px', border:'1px solid #333', padding:'14px 16px', background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:3 }}>
        <b>SHORT ICAO ATC FLIGHT PLAN</b>
        <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
        (FPL-TCREC-IN<br/>
        -GLF4/M-SBDE2E3FGHIJ4J5RWXYZ/LB1D1<br/>
        -LTAC0900<br/>
        -N0473F280 UMRUN G8 TOKER<br/>
        -LTBA0048 LTFM<br/>
        -PBN/A1B1D1L1O1S2 COM/TCAS DAT/CPDLCX DOF/260411<br/>
        &nbsp;REG/TCREC EET/LTBB0021 SEL/FRBD OPR/REC HAVACILIK<br/>
        &nbsp;RMK/BUSINESS FLIGHT<br/>
        -E/0415 P/TBN R/VE S/M J/JL<br/>
        A/WHITE WITH L BLUE ST<br/>
        C/ON DUTY PIC)
      </div>
    </div>
  );
}

function ColoredWeather({ text }) {
  const tokens = parseWeatherText(text);
  return (
    <span>
      {tokens.map((t, i) => (
        <span key={i} style={{ color: t.color || '#888' }}>{t.text}</span>
      ))}
    </span>
  );
}

function WXR() {
  const [tab, setTab] = useState('dep');
  const tabs = [
    { id:'dep',  label:'Departure' },
    { id:'dest', label:'Destination' },
    { id:'alt',  label:'Alternate' },
  ];
  const data = {
    dep: {
      name: 'LTAC — ANKARA / ESENBOGA',
      metar: [
        '110450Z 02004KT 9999 SCT040 SCT180 00/M01 Q1016 NOSIG=',
        '110420Z 06004KT 010V070 9999 FEW040 SCT180 M01/M02 Q1015 NOSIG=',
      ],
      taf: [
        '110440Z 1106/1206 VRB02KT 9999 SCT040 SCT100',
        'TEMPO 1112/1116 35012KT -SHRA BKN030 BKN080',
        'PROB30 1202/1206 4000 BR BKN010=',
      ]
    },
    dest: {
      name: 'LTBA — ISTANBUL / ATATURK',
      metar: [
        '110450Z 07003KT CAVOK 08/05 Q1020=',
        '110420Z 00000KT CAVOK 07/05 Q1020=',
      ],
      taf: [
        '110440Z 1106/1206 VRB02KT CAVOK',
        'BECMG 1107/1110 SCT035 BKN080',
        'BECMG 1110/1113 06012KT=',
      ]
    },
    alt: {
      name: 'LTFM — ISTANBUL',
      metar: [
        '110450Z VRB02KT 9999 SCT025 BKN180 06/02 Q1020 NOSIG=',
      ],
      taf: [
        '110440Z 1106/1212 VRB02KT 9999 SCT028 BKN080',
        'BECMG 1106/1109 06012KT',
        'BECMG 1115/1118 12006KT CAVOK=',
      ]
    },
  };
  const d = data[tab];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:9, textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color: tab===t.id ? '#1a9bc4' : '#555', borderBottom: tab===t.id ? '2px solid #1a9bc4' : '2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', marginBottom:8 }}>{d.name}</div>

        {/* Renk rehberi */}
        <div style={{ display:'flex', gap:12, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { color: COLORS.green,  label: 'Normal' },
            { color: COLORS.yellow, label: 'Dikkat' },
            { color: COLORS.orange, label: 'Uyarı' },
            { color: COLORS.red,    label: 'Kritik' },
          ].map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:4, background: c.color }} />
              <span style={{ fontSize:10, color:'#555' }}>{c.label}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:5 }}>METAR</div>
        <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, marginBottom:10 }}>
          {d.metar.map((m, i) => (
            <div key={i}><ColoredWeather text={m} /></div>
          ))}
        </div>

        <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:5 }}>TAF</div>
        <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9 }}>
          {d.taf.map((l, i) => (
            <div key={i}><ColoredWeather text={l} /></div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NOTAM() {
  const [tab, setTab] = useState('dep');
  const tabs = [
    { id:'dep',  label:'Departure' },
    { id:'dest', label:'Destination' },
    { id:'alt',  label:'Alternate' },
    { id:'fir',  label:'FIR' },
  ];
  const notams = {
    dep: {
      ap: 'LTAC — Ankara Esenboga', count: 10,
      items: [
        { id:'J1545/26', cat:'twy · 2', color:'#ff9500', text:'TWYS H1, J1, L AND K CLSD. DUE TO MAINT.' },
        { id:'J1485/26', cat:'rwy · 7', color:'#ff9500', text:'RWY 03R/21L CLSD TO TFC DUE TO CONST WORKS.' },
        { id:'A1070/26', cat:'de-ice · 24', color:'#666', text:'ESENBOGA AD DE-ICING 3 AREA ON SIDE OF THR 21C.' },
      ]
    },
    dest: {
      ap: 'LTBA — Istanbul Ataturk', count: 14,
      items: [
        { id:'B1020/26', cat:'obst · 28', color:'#ff9500', text:'MOBILE CRANE PENETRATING INNER HORIZONTAL AREA OF RWY 05/23. PILOTS MUST BE CAUTIOUS.' },
        { id:'B0797/26', cat:'thr lgt · 42', color:'#666', text:'THR IDENTIFICATION LIGHTS RWY 23 U/S.' },
      ]
    },
    alt: { ap: 'LTFM — Istanbul', count: 0, items: [] },
    fir: {
      ap: 'LTAA / LTBB FIR', count: 2,
      items: [
        { id:'LTAA SIGMET 4', cat:'', color:'#e02020', text:'VALID 110435/110835 LTAA FIR FRQ TS OBS WI N3935 E04346 TOP FL300 MOV NE 15KT NC=' },
        { id:'LTAA SIGMET 3', cat:'', color:'#ff9500', text:'VALID 110500/110900 LTAA FIR SEV ICE FCST FL050/160 MOV SW 12KT WKN=' },
      ]
    },
  };
  const d = notams[tab];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:9, textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color: tab===t.id ? '#1a9bc4' : '#555', borderBottom: tab===t.id ? '2px solid #1a9bc4' : '2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        <div style={{ padding:'9px 14px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#1a9bc4' }}>{d.ap}</span>
          <span style={{ fontSize:10, color:'#555' }}>{d.count} NOTAMs</span>
        </div>
        {d.items.length === 0 && (
          <div style={{ padding:16, color:'#555', fontSize:12, textAlign:'center' }}>No critical NOTAMs</div>
        )}
        {d.items.map((n, i) => (
          <div key={i} style={{ padding:'9px 14px', borderBottom:'1px solid #383838' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:10, fontWeight:700, color: n.color }}>{n.id}</span>
              {n.cat && <span style={{ fontSize:10, color:'#555', background:'#2a2a2a', padding:'1px 6px', borderRadius:3 }}>{n.cat}</span>}
            </div>
<div style={{ fontFamily:'monospace', fontSize:10, lineHeight:1.55 }}>
  {(() => {
    const allKeywords = [
      { words: ['CLSD','CLOSED','U/S','UNSERVICEABLE','PROHIBITED','MUST BE','SHALL BE','MUST NOT','SHALL NOT'], color: '#e02020', bold: true },
      { words: ['INOP','LIMITED','RESTRICTED','SUSPEND','NOT AVBL'], color: '#e8731a', bold: false },
      { words: ['WIP','CONST','CONSTRUCTION','WORK IN PROGRESS','MAY BE'], color: '#f0c040', bold: false },
    ];
    const regex = new RegExp('\\b(' + allKeywords.flatMap(r => r.words).map(w => w.replace(/[/]/g,'\\/')).join('|') + ')\\b', 'gi');
    return n.text.split(regex).map((part, i) => {
      const upper = part.toUpperCase();
      const rule = allKeywords.find(r => r.words.includes(upper));
      return <span key={i} style={{ color: rule ? rule.color : '#777', fontWeight: rule && rule.bold ? 700 : 400 }}>{part}</span>;
    });
  })()}
</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WXRCharts() {
  const charts = ['Wind & Temp FL280/300/320', 'SigWx FL100-450', 'Vertical Cross Section'];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:20 }}>
      <div style={{ fontSize:36 }}>🗺</div>
      <div style={{ fontSize:13, color:'#555', textAlign:'center', lineHeight:1.6 }}>WXR Charts<br/><span style={{ fontSize:11, color:'#444' }}>Select a chart to view</span></div>
      <div style={{ display:'flex', flexDirection:'column', gap:8, width:'100%', maxWidth:280 }}>
        {charts.map((c, i) => (
          <div key={i} style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:7, padding:'11px 14px', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
            <span style={{ fontSize:12, color:'#999' }}>{c}</span>
            <span style={{ color:'#444' }}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EFP({ setStatus }) {
  const [activeTab, setActiveTab] = useState('fl-plan');
  const [seenTabs, setSeenTabs]   = useState(new Set());

  useEffect(() => {
    if (seenTabs.has(activeTab)) return;
    const timer = setTimeout(() => {
      setSeenTabs(prev => new Set([...prev, activeTab]));
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeTab]);

  useEffect(() => {
    if (!setStatus) return;
    if (seenTabs.size === ALL_TABS.length) setStatus('green');
    else if (seenTabs.size > 0)           setStatus('amber');
    else                                  setStatus('pending');
  }, [seenTabs]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      
      {/* Refresh bar */}
      <div style={{ background:'#1a2a1a', borderBottom:'1px solid rgba(45,158,95,0.3)', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontSize:11, color:'#555' }}>Last updated: 11 APR 2026 · 05:24 Z</span>
        <button onClick={() => alert('Refreshing...')} style={{ background:'#2d9e5f', border:'none', borderRadius:7, padding:'7px 18px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3 }}>
          ↻ Refresh Plan
        </button>
      </div>

      {/* Sub-tab bar */}
      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0, overflowX:'auto' }}>
  {[
    { id:'fl-plan',     label:'FL Plan' },
    { id:'atc-plan',    label:'ATC Flight Plan' },
    { id:'wxr',         label:'WXR' },
    { id:'notam',       label:'NOTAM' },
    { id:'wxr-charts',  label:'WXR Charts' },
  ].map(t => (
    <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding:'9px 14px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, cursor:'pointer', color: activeTab===t.id ? '#1a9bc4' : '#555', borderBottom: activeTab===t.id ? '2px solid #1a9bc4' : '2px solid transparent' }}>
      {t.label}
    </div>
  ))}
</div>

      {/* Content */}
      {activeTab === 'fl-plan'    && <FLPlan />}
      {activeTab === 'atc-plan'   && <ATCPlan />}
      {activeTab === 'wxr'        && <WXR />}
      {activeTab === 'notam'      && <NOTAM />}
      {activeTab === 'wxr-charts' && <WXRCharts />}
    </div>
  );
}
export default EFP;