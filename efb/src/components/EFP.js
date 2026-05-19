import React, { useState, useEffect, useMemo } from 'react';
import { parseWeatherText, COLORS } from '../config/weatherRules';
import { fetchWeatherData } from '../config/weatherService';
import { usePersistedState } from '../hooks/usePersistedState';

const ALL_TABS = ['fl-plan', 'atc-plan', 'wxr', 'notam', 'wxr-charts'];

// ─── FL Plan ──────────────────────────────────────────────────
function FLPlan({ activePlan, rawText }) {
  const p = activePlan || {};
  const r = rawText || '';

  const contFuel  = r.match(/CONT\s+(\d+)/)?.[1]              || '—';
  const minToFuel = r.match(/MIN T\/O FUEL\s+(\d+)/)?.[1]     || '—';
  const taxiFuel  = r.match(/TAXI\s+(\d+)/)?.[1]              || '400';
  const tripTime  = r.match(/TRIP\s+\d+\s+([\d:]+)/)?.[1]     || '—';
  const contTime  = r.match(/CONT\s+\d+\s+([\d:]+)/)?.[1]     || '—';
  const altTime   = r.match(/ALTERNATE\s+\d+\s+([\d:]+)/)?.[1]|| '—';
  const resTime   = r.match(/FINAL RESERVE\s+\d+\s+([\d:]+)/)?.[1] || '0:30';
  const minToTime = r.match(/MIN T\/O FUEL\s+\d+\s+([\d:]+)/)?.[1] || '—';
  const totalTime = r.match(/TOTAL FOB\s+\d+\s+([\d:]+)/)?.[1]     || '—';
  const mtow      = r.match(/MTOW\s+(\d+)/)?.[1]    || '74600';
  const mzfw      = r.match(/MZFW\s+(\d+)/)?.[1]    || '49000';
  const mlwt      = r.match(/MLWT\s+(\d+)/)?.[1]    || '66000';
  const maxFuel   = r.match(/MAX FUEL\s+(\d+)/)?.[1] || '—';
  const fob       = r.match(/TOTAL FOB\s+(\d+)/)?.[1] || p.fob?.replace(/[^\d]/g,'') || '—';

  const dep=p.dep||'—', dest=p.dest||'—', reg=p.reg||'—', ac=p.ac_type||'—';
  const logNr=p.log_nr||'—', callsign=p.callsign||reg.replace('-','');
  const std=p.std||'—', eta=p.eta||'—', date=p.date||'—', alt=p.alternate||'—';
  const cruise=p.cruise_fl||'—', trip=p.trip_fuel||'—', altF=p.alternate_fuel||'—', resF=p.reserve_fuel||'—';

  const Blank = ({ w = 80 }) => (
    <span style={{ display:'inline-block', borderBottom:'1px solid #666', minWidth:w }}>&nbsp;</span>
  );

  return (
    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', background:'#0f172a' }}>
      <div style={{ background:'#1e293b', borderBottom:'1px solid #334155', padding:'8px 14px', display:'flex', gap:8, flexShrink:0 }}>
        {['✏ i-Pen','↩ Undo','↪ Redo'].map(label => (
          <div key={label} style={{ background:'#0f172a', border:'1px solid #334155', borderRadius:8, padding:'5px 12px', fontSize:11, color:'#38bdf8', cursor:'pointer' }}>{label}</div>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ background:'rgba(56,189,248,0.1)', border:'1px solid rgba(56,189,248,0.2)', borderRadius:8, padding:'5px 12px', fontSize:11, color:'#38bdf8', cursor:'pointer' }}>⬆ Export</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'12px' }}>
        <div style={{ background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:10, padding:'14px 16px', border:'1px solid #334155' }}>
          <div>FMS IDENT={callsign}{'  '}Log Nr.: {logNr}{'  '}Page 1{'  '}{dep}-{dest}{'  '}{callsign}</div>
          <div style={{ border:'1px solid #555', padding:'5px 8px', margin:'5px 0' }}>
            FLT{'  '}{callsign}{'  '}{dep}-{dest}{'  '}ETD:{std} ETA:{eta} {ac}{'  '}Lbs<br/>
            REGN {callsign}{'  '}CRUISE:{cruise}{'  '}{date}{'  '}WX PROG<br/>
            {'                                    '}WX VALID +36HRS
          </div>
          <br/>
          PIC :{'  '}<Blank w={120}/>{'  '}SIGN :{'  '}<Blank w={100}/><br/><br/>
          DISP: <Blank w={160}/>{'  '}LICENSE NO: <Blank w={80}/>{'  '}SIGN{'  '}<Blank w={80}/>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }}/>
          DEPARTURE ATIS:{'  '}<Blank w={200}/><br/><br/>
          ATC CLRNC: SID:{'  '}<Blank w={40}/>{'  '}FL:{'  '}<Blank w={30}/>{'  '}SQ:{'  '}<Blank w={35}/>{'  '}OTH:{'  '}<Blank w={40}/><br/><br/>
          ARRIVAL ATIS:{'  '}<Blank w={210}/>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }}/>
          RVSM CHECK{'  '}NO1 ALT{'  '}<Blank w={38}/>{'  '}STBY{'  '}<Blank w={38}/>{'  '}NO2 ALT{'  '}<Blank w={38}/>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }}/>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'9.5px', lineHeight:1.7 }}>
            <tbody>
              <tr><td></td><td>FUEL</td><td>TIME</td><td>MAX DESIGN WTS</td><td>SPEEDS</td></tr>
              <tr><td>TRIP</td><td>{trip}</td><td>{tripTime}</td><td>MZFW {mzfw}</td><td>V1{'  '}<Blank w={30}/></td></tr>
              <tr><td>CONT</td><td>{contFuel}</td><td>{contTime}</td><td>MTOW {mtow}</td><td></td></tr>
              <tr><td>ALT</td><td>{altF}</td><td>{altTime}</td><td>{alt}{'  '}MLWT {mlwt}</td><td>VR{'  '}<Blank w={30}/></td></tr>
              <tr><td>FINAL RES</td><td>{resF}</td><td>{resTime}</td><td></td><td>V2{'  '}<Blank w={30}/></td></tr>
              <tr><td>MIN T/O</td><td>{minToFuel}</td><td>{minToTime}</td><td></td><td></td></tr>
              <tr><td>TAXI</td><td>{taxiFuel}</td><td></td><td></td><td></td></tr>
              <tr><td>TOTAL FOB</td><td>{fob}</td><td>{totalTime}</td><td>MAX FUEL {maxFuel}</td><td>VREF{'  '}<Blank w={30}/></td></tr>
            </tbody>
          </table>
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }}/>
          FUEL T/O{'  '}<Blank w={38}/>{'  '}BLON{'  '}<Blank w={32}/>{'  '}LDG{'  '}<Blank w={32}/><br/>
          LDG FUEL{'  '}<Blank w={38}/>{'        '}BLOFF{'  '}<Blank w={32}/>{'  '}T/O{'  '}<Blank w={32}/><br/>
          BURNOFF{'  '}<Blank w={38}/>{'  '}TIME{'  '}<Blank w={32}/>{'  '}TIME{'  '}<Blank w={32}/>
        </div>
      </div>
    </div>
  );
}

// ─── ATC Plan ─────────────────────────────────────────────────
function ATCPlan({ rawText, activePlan }) {
  const fplText = rawText?.match(/(\(FPL-[\s\S]*?C\/ON DUTY PIC\))/)?.[1] || null;
  return (
    <div style={{ flex:1, overflowY:'auto', background:'#0f172a', padding:'12px' }}>
      <div style={{ background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:10, padding:'14px 16px', border:'1px solid #334155' }}>
        <b>SHORT ICAO ATC FLIGHT PLAN</b>
        <div style={{ borderTop:'1px solid #888', margin:'6px 0' }}/>
        {fplText ? (
          <pre style={{ margin:0, fontFamily:'inherit', fontSize:'inherit', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{fplText}</pre>
        ) : (
          <div style={{ color:'#888' }}>No ATC flight plan found in PDF data.<br/>{activePlan?.dep && `DEP: ${activePlan.dep} → DEST: ${activePlan.dest}`}</div>
        )}
      </div>
    </div>
  );
}

// ─── WXR ──────────────────────────────────────────────────────
function ColoredWeather({ text }) {
  return (
    <span>
      {parseWeatherText(text).map((t, i) => (
        <span key={i} style={{ color: t.color || '#94a3b8' }}>{t.text}</span>
      ))}
    </span>
  );
}

function parseIcaoWxFromRaw(rawText, icao) {
  if (!rawText || !icao) return { metar:[], taf:[] };
  const wxIdx = rawText.search(/WX for (?:flight|Flight Group)/i);
  const wxEnd = rawText.search(/End of WX information/i);
  const block = wxIdx !== -1 ? rawText.slice(wxIdx, wxEnd !== -1 ? wxEnd + 30 : wxIdx + 20000) : rawText;
  const pat = new RegExp(
    `(?:(?:Departure|Destination|Alternate|Adequate)\\s+airport|Flight\\s+group\\s+apt)\\s+${icao}[^\\n]*\\n([\\s\\S]*?)` +
    `(?=(?:(?:Departure|Destination|Alternate|Adequate)\\s+airport|Flight\\s+group\\s+apt)\\s+[A-Z]{4}|WX messages|SIGMET|End of WX|Page\\s+\\d|$)`, 'i'
  );
  const sec = block.match(pat)?.[1] || '';
  const metars = [], tafs = []; let inTaf = false;
  for (const line of sec.split('\n')) {
    const l = line.trim();
    if (!l) { inTaf = false; continue; }
    if (/^(?:METAR|SPECI)\b/.test(l)) { metars.push(l); inTaf = false; }
    else if (/^TAF\b/.test(l)) { tafs.push(l); inTaf = true; }
    else if (inTaf && !/^(?:Departure|Destination|Alternate|Adequate|Flight|WX|End|Page|No\s)/i.test(l)) {
      if (tafs.length) tafs[tafs.length - 1] += ' ' + l;
    }
  }
  return { metar: metars, taf: tafs };
}

function WXR({ activePlan, rawText }) {
  const depIcao  = activePlan?.dep       || 'LTAC';
  const destIcao = activePlan?.dest      || 'LTBA';
  const altIcao  = activePlan?.alternate || 'LTFM';

  const planWx = useMemo(() => {
    if (!rawText) return null;
    const dep = parseIcaoWxFromRaw(rawText, depIcao);
    const dest = parseIcaoWxFromRaw(rawText, destIcao);
    const alt = parseIcaoWxFromRaw(rawText, altIcao);
    if (!dep.metar.length && !dest.metar.length && !alt.metar.length && !dep.taf.length && !dest.taf.length && !alt.taf.length) return null;
    const sigmetIdx = rawText.search(/SIGMET\(s\)\s+for/i);
    const sigmetEnd = rawText.search(/End of WX information/i);
    const sigmet = sigmetIdx !== -1 ? rawText.slice(sigmetIdx, sigmetEnd !== -1 ? sigmetEnd : sigmetIdx + 800).trim() : '';
    const ts = rawText.match(/WX search performed\s+([^\n]+)/i)?.[1]?.trim() || 'Plan briefing';
    return {
      dep:  { name:`${depIcao} — Departure`,    metar: dep.metar.length  ? dep.metar  : ['No METAR in plan'], taf: dep.taf.length  ? dep.taf  : ['No TAF in plan'] },
      dest: { name:`${destIcao} — Destination`, metar: dest.metar.length ? dest.metar : ['No METAR in plan'], taf: dest.taf.length ? dest.taf : ['No TAF in plan'] },
      alt:  { name:`${altIcao} — Alternate`,    metar: alt.metar.length  ? alt.metar  : ['No METAR in plan'], taf: alt.taf.length  ? alt.taf  : ['No TAF in plan'] },
      sigmet, ts,
    };
  }, [rawText, depIcao, destIcao, altIcao]);

  const [wxTab,   setWxTab]   = usePersistedState('efb_wxr_tab',     'dep');
  const [liveWx,  setLiveWx]  = usePersistedState('efb_wxr_live',    null);
  const [liveAt,  setLiveAt]  = usePersistedState('efb_wxr_live_at', '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  const mergedData = liveWx && planWx ? {
    dep:  { name:liveWx.dep.name,  metar:liveWx.dep.metar  || planWx.dep.metar,  taf:liveWx.dep.taf  || planWx.dep.taf  },
    dest: { name:liveWx.dest.name, metar:liveWx.dest.metar || planWx.dest.metar, taf:liveWx.dest.taf || planWx.dest.taf },
    alt:  { name:liveWx.alt.name,  metar:liveWx.alt.metar  || planWx.alt.metar,  taf:liveWx.alt.taf  || planWx.alt.taf  },
    sigmet: liveWx.sigmet || planWx?.sigmet,
  } : liveWx || planWx;

  const d = wxTab !== 'sigmet' ? (mergedData?.[wxTab] || mergedData?.dep) : null;
  const sigmet = mergedData?.sigmet || '';

  const doFetch = async () => {
    setLoading(true); setError(false);
    try {
      const { metars, tafs, updatedAt } = await fetchWeatherData(depIcao, destIcao, altIcao);
      setLiveWx({
        dep:  { name:`${depIcao} — Departure`,    metar:metars[depIcao]  || null, taf:tafs[depIcao]  || null },
        dest: { name:`${destIcao} — Destination`, metar:metars[destIcao] || null, taf:tafs[destIcao] || null },
        alt:  { name:`${altIcao} — Alternate`,    metar:metars[altIcao]  || null, taf:tafs[altIcao]  || null },
        sigmet: planWx?.sigmet || '',
      });
      setLiveAt(updatedAt);
    } catch { setError(true); }
    setLoading(false);
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Source banner */}
      <div style={{ background: liveWx ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)', borderBottom:`1px solid ${liveWx ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, padding:'2px 8px', borderRadius:20, background: error ? 'rgba(239,68,68,0.15)' : liveWx ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)', color: error ? '#ef4444' : liveWx ? '#4ade80' : '#fbbf24', border:`1px solid ${error ? 'rgba(239,68,68,0.3)' : liveWx ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}` }}>
              {error ? '⚠ FAILED' : liveWx ? '● LIVE' : '◎ PLAN BRIEFING'}
            </span>
            {liveWx && !error && <span style={{ fontSize:11, color:'#4ade80', fontFamily:'monospace' }}>{liveAt}</span>}
            {!liveWx && planWx && <span style={{ fontSize:11, color:'#fbbf24', fontFamily:'monospace' }}>{planWx.ts}</span>}
          </div>
          <div style={{ fontSize:10, color:'#475569', marginTop:3 }}>
            {liveWx ? 'Live METAR/TAF — verify against latest ATIS before use' : 'OFP briefing package — may not reflect current conditions'}
          </div>
        </div>
        <button onClick={doFetch} disabled={loading} style={{ background: loading ? '#1e293b' : '#4ade80', border:'none', borderRadius:10, padding:'8px 16px', fontSize:12, fontWeight:600, color: loading ? '#475569' : '#0f172a', cursor: loading ? 'default' : 'pointer', fontFamily:'inherit', flexShrink:0 }}>
          {loading ? '...' : '↻ Live WXR'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'1px solid #334155', flexShrink:0 }}>
        {[{id:'dep',label:'Departure'},{id:'dest',label:'Destination'},{id:'alt',label:'Alternate'},{id:'sigmet',label:'SIGMET'}].map(t => (
          <div key={t.id} onClick={() => setWxTab(t.id)}
            style={{ flex:1, padding:'10px 4px', textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color:wxTab===t.id?'#38bdf8':'#475569', borderBottom:wxTab===t.id?'2px solid #38bdf8':'2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 12px' }}>
        {!mergedData && <div style={{ color:'#475569', fontSize:13, textAlign:'center', marginTop:24, padding:20 }}>No WX data — press Live WXR or activate a plan with WX</div>}

        {wxTab === 'sigmet' && (
          <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #334155', fontSize:11, fontWeight:600, color:'#ef4444' }}>⚠️ SIGMET</div>
            <div style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, color: sigmet ? '#fbbf24' : '#475569' }}>
              {sigmet || 'No SIGMET in plan data'}
            </div>
          </div>
        )}

        {wxTab !== 'sigmet' && d && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'#38bdf8', marginBottom:12 }}>{d.name}</div>
            <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
              {[{color:COLORS.green,label:'Normal'},{color:COLORS.yellow,label:'Caution'},{color:COLORS.orange,label:'Warning'},{color:COLORS.red,label:'Critical'}].map((c,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:8, height:8, borderRadius:4, background:c.color }}/>
                  <span style={{ fontSize:10, color:'#475569' }}>{c.label}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden', marginBottom:10 }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid #334155', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1px' }}>METAR</div>
              <div style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:11, lineHeight:1.9 }}>
                {(d.metar||[]).map((m,i) => <div key={i}><ColoredWeather text={m}/></div>)}
              </div>
            </div>
            <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid #334155', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1px' }}>TAF</div>
              <div style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:11, lineHeight:1.9 }}>
                {(d.taf||[]).map((l,i) => <div key={i}><ColoredWeather text={l}/></div>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── NOTAM ────────────────────────────────────────────────────
function parseNotams(rawText, icao) {
  if (!rawText || !icao) return [];
  const startIdx = rawText.indexOf('|#1|');
  if (startIdx === -1) return [];
  const endIdx = rawText.search(/End of NOTAM information/i);
  const section = rawText.slice(startIdx, endIdx !== -1 ? endIdx : startIdx + 80000);
  const blocks = section.split(/\|#\d+\|[^\n]*/);
  const items = [];
  for (const block of blocks) {
    const t = block.trim();
    if (t.length < 20) continue;
    if (!new RegExp(`\\bA\\)\\s*${icao}\\b`).test(t)) continue;
    const idMatch = t.match(/([A-Z]\d+\/\d+\s+NOTAM[RNC]?)/);
    const id = idMatch?.[1]?.trim() || t.slice(0,15) || 'NOTAM';
    const type = t.match(/\[([^\]]+)\]/)?.[1] || '';
    let eStart = t.indexOf('\nE)'); if (eStart === -1) eStart = t.indexOf(' E)'); if (eStart === -1) continue;
    const afterE = t.slice(eStart + 3);
    const fIdx = afterE.search(/\n[A-GQ]\)\s/);
    const text = (fIdx !== -1 ? afterE.slice(0, fIdx) : afterE).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 5) continue;
    const u = text.toUpperCase();
    const color = /\bCLSD\b|\bCLOSED\b|\bU\/S\b|\bPROHIBITED\b/.test(u) ? '#ef4444' :
                  /\bINOP\b|\bLIMITED\b|\bRESTRICTED\b/.test(u)           ? '#f97316' :
                  /\bWIP\b|\bCONST\b/.test(u)                              ? '#fbbf24' : '#94a3b8';
    items.push({ id, type, text, color });
  }
  return items;
}

function NOTAM({ activePlan, rawText }) {
  const [tab, setTab] = usePersistedState('efb_notam_tab', 'dep');
  const depIcao=activePlan?.dep||'—', destIcao=activePlan?.dest||'—', altIcao=activePlan?.alternate||'—';
  const tabs = [{id:'dep',label:'Departure',icao:depIcao},{id:'dest',label:'Destination',icao:destIcao},{id:'alt',label:'Alternate',icao:altIcao}];
  const items = useMemo(() => parseNotams(rawText, tabs.find(t=>t.id===tab)?.icao), // eslint-disable-line
  [rawText, tab, depIcao, destIcao, altIcao]); // eslint-disable-line
  const apName = {dep:`${depIcao} — Departure`,dest:`${destIcao} — Destination`,alt:`${altIcao} — Alternate`}[tab];
  const keywords = [
    {words:['CLSD','CLOSED','U/S','UNSERVICEABLE','PROHIBITED'],color:'#ef4444',bold:true},
    {words:['INOP','LIMITED','RESTRICTED','SUSPEND'],color:'#f97316',bold:false},
    {words:['WIP','CONST','CONSTRUCTION'],color:'#fbbf24',bold:false},
  ];
  const kwRe = new RegExp('\\b('+keywords.flatMap(r=>r.words).map(w=>w.replace(/\//g,'\\/')).join('|')+')\\b','gi');
  const highlight = (text) => text.split(kwRe).map((part,i) => {
    const rule = keywords.find(r=>r.words.includes(part.toUpperCase()));
    return <span key={i} style={{color:rule?rule.color:'#94a3b8',fontWeight:rule?.bold?700:400}}>{part}</span>;
  });

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'1px solid #334155', flexShrink:0 }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, padding:'10px 4px', textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color:tab===t.id?'#38bdf8':'#475569', borderBottom:tab===t.id?'2px solid #38bdf8':'2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        <div style={{ padding:'10px 14px', borderBottom:'1px solid #1e293b', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'#38bdf8' }}>{apName}</span>
          <span style={{ fontSize:11, color:'#475569' }}>{items.length} NOTAMs</span>
        </div>
        {items.length === 0 && (
          <div style={{ padding:24, color:'#475569', fontSize:13, textAlign:'center' }}>
            {rawText ? 'No NOTAMs found for this airport' : 'No plan data loaded'}
          </div>
        )}
        {items.map((n,i) => (
          <div key={i} style={{ padding:'12px 14px', borderBottom:'1px solid #1e293b' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6, gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:n.color, fontFamily:'monospace' }}>{n.id}</span>
              {n.type && <span style={{ fontSize:9, color:'#475569', fontStyle:'italic', flexShrink:0 }}>{n.type}</span>}
            </div>
            <div style={{ fontFamily:'monospace', fontSize:11, lineHeight:1.7 }}>{highlight(n.text)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WXR Charts ───────────────────────────────────────────────
function WXRCharts({ rawText }) {
  const [sel, setSel] = usePersistedState('efb_wxrchart_sel', null);
  const charts = useMemo(() => {
    if (!rawText) return [];
    const result = [];
    const windRe = /WIND\/TEMPERATURE\s*\n\s*(FL\s*\d+)\s*\n\s*PROGNOSTIC CHART\s*\n\s*([A-Z]+ - [A-Z]+)\s*\n\s*VALID\s+([^\n]+)/g;
    let m;
    while ((m = windRe.exec(rawText)) !== null) result.push({ type:'wind', label:`Wind/Temp ${m[1].trim()}`, fl:m[1].trim(), route:m[2].trim(), valid:m[3].trim() });
    const vcsM = rawText.match(/VERTICAL CROSS SECTION ALONG THE ROUTE ([^\n]+)/);
    if (vcsM) result.push({ type:'vcs', label:'Vertical Cross Section', route:vcsM[1].trim() });
    const swM = rawText.match(/SIGNIFICANT WEATHER\s*\nFIXED TIME PROGNOSTIC CHART\s*\nROUTE ([^\n]+)\s*\n([^\n]+)\s*\nVALID\s+([^\n]+)/);
    if (swM) {
      const cb=rawText.match(/CB CLOUD AREAS\s*([\s\S]*?)ICING AREAS/)?.[1]?.trim()||'';
      const icing=rawText.match(/ICING AREAS\s*([\s\S]*?)TURBULENCE AREAS/)?.[1]?.trim()||'';
      const turb=rawText.match(/TURBULENCE AREAS\s*([\s\S]*?)VOLCANIC/)?.[1]?.trim()||'';
      result.push({ type:'sigwx', label:`SigWx ${swM[2].trim()}`, route:swM[1].trim(), level:swM[2].trim(), valid:swM[3].trim(), cb, icing, turb });
    }
    return result;
  }, [rawText]);

  const active = charts.find(c => c.label === sel) || null;
  if (!rawText || charts.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:24, background:'#0f172a' }}>
        <div style={{ fontSize:40 }}>🗺️</div>
        <div style={{ fontSize:13, color:'#475569', textAlign:'center' }}>No chart data in plan</div>
      </div>
    );
  }

  const block = (color, label, content) => content ? (
    <div style={{ marginBottom:12 }}>
      <div style={{ fontSize:10, color, fontWeight:600, letterSpacing:'1px', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ background:'#0f172a', borderLeft:`3px solid ${color}`, borderRadius:8, padding:'10px 12px', fontFamily:'monospace', fontSize:11, lineHeight:1.7, whiteSpace:'pre-wrap', color:`${color}cc` }}>{content}</div>
    </div>
  ) : null;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0f172a' }}>
      <div style={{ flexShrink:0, borderBottom:'1px solid #334155' }}>
        {charts.map((c,i) => (
          <div key={i} onClick={() => setSel(c.label === sel ? null : c.label)}
            style={{ padding:'12px 14px', borderBottom:'1px solid #1e293b', cursor:'pointer', background:c.label===sel?'rgba(56,189,248,0.06)':'transparent', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:c.label===sel?'#38bdf8':'#94a3b8' }}>{c.label}</div>
              {c.valid && <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>Valid: {c.valid}</div>}
              {c.route && <div style={{ fontSize:10, color:'#334155', marginTop:1 }}>{c.route}</div>}
            </div>
            <span style={{ color:c.label===sel?'#38bdf8':'#334155', fontSize:18 }}>{c.label===sel?'▼':'›'}</span>
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'14px 12px' }}>
        {!active && <div style={{ color:'#475569', fontSize:13, textAlign:'center', marginTop:24 }}>Select a chart above</div>}
        {active?.type === 'wind' && (
          <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid #334155' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#38bdf8' }}>{active.label} · {active.route}</div>
              <div style={{ fontSize:11, color:'#475569', marginTop:4 }}>Valid: {active.valid}</div>
            </div>
            <div style={{ padding:'12px 14px', fontSize:12, color:'#475569', lineHeight:1.6 }}>Wind/Temperature grid data is in the plan PDF. See NavLog for per-waypoint wind components.</div>
          </div>
        )}
        {active?.type === 'vcs' && (
          <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', padding:'14px' }}>
            <div style={{ fontSize:12, fontWeight:600, color:'#38bdf8', marginBottom:8 }}>Vertical Cross Section · {active.route}</div>
            <div style={{ fontSize:12, color:'#475569', lineHeight:1.6 }}>Wind, temperature, tropopause, icing and turbulence forecast by waypoint.</div>
          </div>
        )}
        {active?.type === 'sigwx' && (
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'#38bdf8', marginBottom:4 }}>SigWx · {active.level}</div>
            <div style={{ fontSize:11, color:'#475569', marginBottom:14 }}>Valid: {active.valid}</div>
            {block('#ef4444','CB Cloud Areas',active.cb)}
            {block('#f97316','Icing Areas',active.icing)}
            {block('#fbbf24','Turbulence Areas',active.turb)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EFP Main ─────────────────────────────────────────────────
function EFP({ setStatus, activePlan, rawText = '' }) {
  const [activeTab, setActiveTab] = usePersistedState('efb_efp_activeTab', 'fl-plan');
  const [seenTabs,  setSeenTabs]  = usePersistedState('efb_efp_seenTabs',  []);

  useEffect(() => {
    if (seenTabs.includes(activeTab)) return;
    const t = setTimeout(() => setSeenTabs(prev => [...prev, activeTab]), 1000);
    return () => clearTimeout(t);
  }, [activeTab]); // eslint-disable-line

  useEffect(() => {
    if (!setStatus) return;
    if (seenTabs.length === ALL_TABS.length) setStatus('green');
    else if (seenTabs.length > 0)           setStatus('amber');
    else                                    setStatus('pending');
  }, [seenTabs]); // eslint-disable-line

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0f172a' }}>
      {/* Plan banner */}
      <div style={{ background:'rgba(74,222,128,0.06)', borderBottom:'1px solid rgba(74,222,128,0.2)', padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontSize:12, color:'#475569' }}>
          {activePlan ? `${activePlan.dep} → ${activePlan.dest}` : 'No active plan'}
          {rawText ? <span style={{ color:'#334155', marginLeft:8 }}>{rawText.length.toLocaleString()} chars</span> : null}
        </span>
        <button onClick={() => window.location.reload()} style={{ background:'rgba(74,222,128,0.1)', border:'1px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'6px 14px', fontSize:11, fontWeight:600, color:'#4ade80', cursor:'pointer', fontFamily:'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'1px solid #334155', flexShrink:0, overflowX:'auto' }}>
        {[{id:'fl-plan',label:'FL Plan'},{id:'atc-plan',label:'ATC Plan'},{id:'wxr',label:'WXR'},{id:'notam',label:'NOTAM'},{id:'wxr-charts',label:'Charts'}].map(t => (
          <div key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:'10px 14px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, cursor:'pointer', color:activeTab===t.id?'#38bdf8':'#475569', borderBottom:activeTab===t.id?'2px solid #38bdf8':'2px solid transparent' }}>
            {t.label}
            {seenTabs.includes(t.id) && <span style={{ marginLeft:4, width:5, height:5, borderRadius:'50%', background:'#4ade80', display:'inline-block', verticalAlign:'middle' }} />}
          </div>
        ))}
      </div>

      {activeTab === 'fl-plan'    && <FLPlan    activePlan={activePlan} rawText={rawText}/>}
      {activeTab === 'atc-plan'   && <ATCPlan   activePlan={activePlan} rawText={rawText}/>}
      {activeTab === 'wxr'        && <WXR       activePlan={activePlan} rawText={rawText}/>}
      {activeTab === 'notam'      && <NOTAM     activePlan={activePlan} rawText={rawText}/>}
      {activeTab === 'wxr-charts' && <WXRCharts rawText={rawText}/>}
    </div>
  );
}

export default EFP;