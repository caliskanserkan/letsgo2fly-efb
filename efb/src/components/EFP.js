import React, { useState, useEffect, useMemo } from 'react';
import { parseWeatherText, COLORS } from '../config/weatherRules';
import { fetchWeatherData } from '../config/weatherService';
import { usePersistedState } from '../hooks/usePersistedState';

const ALL_TABS = ['fl-plan', 'atc-plan', 'wxr', 'notam', 'wxr-charts'];

// ─── FL Plan ──────────────────────────────────────────────────────────────────
function FLPlan({ activePlan, rawText }) {
  const p = activePlan || {};
  const r = rawText || '';

  const contFuel  = r.match(/CONT\s+(\d+)/)?.[1]              || '—';
  const minToFuel = r.match(/MIN T\/O FUEL\s+(\d+)/)?.[1]     || '—';
  const taxiFuel  = r.match(/TAXI\s+(\d+)/)?.[1]              || '400';
  const tripTime  = r.match(/TRIP\s+\d+\s+([\d:]+)/)?.[1]          || '—';
  const contTime  = r.match(/CONT\s+\d+\s+([\d:]+)/)?.[1]          || '—';
  const altTime   = r.match(/ALTERNATE\s+\d+\s+([\d:]+)/)?.[1]     || '—';
  const resTime   = r.match(/FINAL RESERVE\s+\d+\s+([\d:]+)/)?.[1] || '0:30';
  const minToTime = r.match(/MIN T\/O FUEL\s+\d+\s+([\d:]+)/)?.[1] || '—';
  const totalTime = r.match(/TOTAL FOB\s+\d+\s+([\d:]+)/)?.[1]     || '—';
  const mtow      = r.match(/MTOW\s+(\d+)/)?.[1]    || '74600';
  const mzfw      = r.match(/MZFW\s+(\d+)/)?.[1]    || '49000';
  const mlwt      = r.match(/MLWT\s+(\d+)/)?.[1]    || '66000';
  const maxFuel   = r.match(/MAX FUEL\s+(\d+)/)?.[1] || '—';
  const fob       = r.match(/TOTAL FOB\s+(\d+)/)?.[1] || p.fob?.replace(/[^\d]/g,'') || '—';

  const dep      = p.dep        || '—';
  const dest     = p.dest       || '—';
  const reg      = p.reg        || '—';
  const ac       = p.ac_type    || '—';
  const logNr    = p.log_nr     || '—';
  const callsign = p.callsign   || reg.replace('-','');
  const std      = p.std        || '—';
  const eta      = p.eta        || '—';
  const date     = p.date       || '—';
  const alt      = p.alternate  || '—';
  const cruise   = p.cruise_fl  || '—';
  const trip     = p.trip_fuel      || '—';
  const altF     = p.alternate_fuel || '—';
  const resF     = p.reserve_fuel   || '—';

  const Blank = ({ w = 80 }) => (
    <span style={{ display:'inline-block', borderBottom:'1px solid #aaa', minWidth:w }}>&nbsp;</span>
  );

  return (
    <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column', background:'#111' }}>
      <div style={{ background:'#1f1f1f', borderBottom:'1px solid #383838', padding:'7px 14px', display:'flex', gap:7, flexShrink:0 }}>
        {['✏ i-Pen','↩ Undo','↪ Redo'].map(label => (
          <div key={label} style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:5, padding:'4px 10px', fontSize:11, color:'#1a9bc4', cursor:'pointer' }}>{label}</div>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:5, padding:'4px 10px', fontSize:11, color:'#1a9bc4', cursor:'pointer' }}>⬆ Export</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
        <div style={{ margin:'10px 14px', border:'1px solid #333', padding:'14px 16px', background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:3 }}>
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

// ─── ATC Plan ─────────────────────────────────────────────────────────────────
function ATCPlan({ rawText, activePlan }) {
  const fplText = rawText?.match(/(\(FPL-[\s\S]*?C\/ON DUTY PIC\))/)?.[1] || null;
  return (
    <div style={{ flex:1, overflowY:'auto', background:'#111', padding:'8px 0' }}>
      <div style={{ margin:'10px 14px', border:'1px solid #333', padding:'14px 16px', background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:3 }}>
        <b>SHORT ICAO ATC FLIGHT PLAN</b>
        <div style={{ borderTop:'1px solid #888', margin:'6px 0' }}/>
        {fplText ? (
          <pre style={{ margin:0, fontFamily:'inherit', fontSize:'inherit', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{fplText}</pre>
        ) : (
          <div style={{ color:'#888' }}>
            No ATC flight plan found in PDF data.<br/>
            {activePlan?.dep && `DEP: ${activePlan.dep} → DEST: ${activePlan.dest}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WXR ──────────────────────────────────────────────────────────────────────
function ColoredWeather({ text }) {
  return (
    <span>
      {parseWeatherText(text).map((t, i) => (
        <span key={i} style={{ color: t.color || '#888' }}>{t.text}</span>
      ))}
    </span>
  );
}

function parseIcaoWxFromRaw(rawText, icao) {
  if (!rawText || !icao) return { metar:[], taf:[] };

  // WX bölümünü belirle
  const wxIdx = rawText.search(/WX for (?:flight|Flight Group)/i);
  const wxEnd = rawText.search(/End of WX information/i);
  const block = wxIdx !== -1
    ? rawText.slice(wxIdx, wxEnd !== -1 ? wxEnd + 30 : wxIdx + 20000)
    : rawText;

  // Bu ICAO'nun bölümünü bul
  // Tek uçuş: "Departure airport LTAC..." / Flight group: "Flight group apt LTAC..."
  const pat = new RegExp(
    `(?:(?:Departure|Destination|Alternate|Adequate)\\s+airport|Flight\\s+group\\s+apt)\\s+${icao}[^\\n]*\\n([\\s\\S]*?)` +
    `(?=(?:(?:Departure|Destination|Alternate|Adequate)\\s+airport|Flight\\s+group\\s+apt)\\s+[A-Z]{4}|WX messages|SIGMET|End of WX|Page\\s+\\d|$)`,
    'i'
  );
  const sec = block.match(pat)?.[1] || '';

  const metars = [], tafs = [];
  let inTaf = false;

  for (const line of sec.split('\n')) {
    const l = line.trim();
    if (!l) { inTaf = false; continue; }
    if (/^(?:METAR|SPECI)\b/.test(l)) { metars.push(l); inTaf = false; }
    else if (/^TAF\b/.test(l))         { tafs.push(l);   inTaf = true;  }
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

  // Plan WX — rawText'ten doğrudan parse
  const planWx = useMemo(() => {
    if (!rawText) return null;
    const dep  = parseIcaoWxFromRaw(rawText, depIcao);
    const dest = parseIcaoWxFromRaw(rawText, destIcao);
    const alt  = parseIcaoWxFromRaw(rawText, altIcao);
    if (!dep.metar.length && !dest.metar.length && !alt.metar.length &&
        !dep.taf.length   && !dest.taf.length   && !alt.taf.length) return null;

    const sigmetIdx = rawText.search(/SIGMET\(s\)\s+for/i);
    const sigmetEnd = rawText.search(/End of WX information/i);
    const sigmet = sigmetIdx !== -1
      ? rawText.slice(sigmetIdx, sigmetEnd !== -1 ? sigmetEnd : sigmetIdx + 800).trim()
      : '';

    const ts = rawText.match(/WX search performed\s+([^\n]+)/i)?.[1]?.trim() || 'Plan briefing';

    return {
      dep:  { name:`${depIcao} — Departure`,    metar: dep.metar.length  ? dep.metar  : ['No METAR in plan'], taf: dep.taf.length  ? dep.taf  : ['No TAF in plan'] },
      dest: { name:`${destIcao} — Destination`, metar: dest.metar.length ? dest.metar : ['No METAR in plan'], taf: dest.taf.length ? dest.taf : ['No TAF in plan'] },
      alt:  { name:`${altIcao} — Alternate`,    metar: alt.metar.length  ? alt.metar  : ['No METAR in plan'], taf: alt.taf.length  ? alt.taf  : ['No TAF in plan'] },
      sigmet, ts,
    };
  }, [rawText, depIcao, destIcao, altIcao]);

  const [wxTab,   setWxTab]   = usePersistedState('efb_wxr_tab', 'dep');
  const [liveWx,  setLiveWx]  = usePersistedState('efb_wxr_live', null);
  const [liveAt,  setLiveAt]  = usePersistedState('efb_wxr_live_at', '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(false);

  const data    = liveWx || planWx;
  const source  = liveWx ? `Live · ${liveAt}` : planWx ? `Plan · ${planWx.ts}` : rawText ? 'No WX in plan' : 'Loading...';

  // Live ve plan datasını birleştir: live null ise plan datasını kullan
  const mergedData = liveWx && planWx ? {
    dep:  { name: liveWx.dep.name,  metar: liveWx.dep.metar  || planWx.dep.metar,  taf: liveWx.dep.taf  || planWx.dep.taf  },
    dest: { name: liveWx.dest.name, metar: liveWx.dest.metar || planWx.dest.metar, taf: liveWx.dest.taf || planWx.dest.taf },
    alt:  { name: liveWx.alt.name,  metar: liveWx.alt.metar  || planWx.alt.metar,  taf: liveWx.alt.taf  || planWx.alt.taf  },
    sigmet: liveWx.sigmet || planWx.sigmet,
  } : data;
  const d       = wxTab !== 'sigmet' ? (mergedData?.[wxTab] || mergedData?.dep) : null;
  const sigmet  = mergedData?.sigmet || '';

  const doFetch = async () => {
    setLoading(true); setError(false);
    try {
      const { metars, tafs, updatedAt } = await fetchWeatherData(depIcao, destIcao, altIcao);
      setLiveWx({
        dep:  { name:`${depIcao} — Departure`,    metar: metars[depIcao]  || null, taf: tafs[depIcao]  || null },
        dest: { name:`${destIcao} — Destination`, metar: metars[destIcao] || null, taf: tafs[destIcao] || null },
        alt:  { name:`${altIcao} — Alternate`,    metar: metars[altIcao]  || null, taf: tafs[altIcao]  || null },
        sigmet: planWx?.sigmet || '',
      });
      setLiveAt(updatedAt);
    } catch { setError(true); }
    setLoading(false);
  };

  const tabs = [
    { id:'dep',    label:'Departure'   },
    { id:'dest',   label:'Destination' },
    { id:'alt',    label:'Alternate'   },
    { id:'sigmet', label:'SIGMET'      },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ background:'#1a2a1a', borderBottom:'1px solid rgba(45,158,95,0.3)', padding:'7px 14px', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <span style={{ fontSize:10, color: error ? '#e02020' : '#2d9e5f', flex:1 }}>
          {error ? '⚠ Live fetch failed — showing plan data' : source || `${depIcao} · ${destIcao} · ${altIcao}`}
        </span>
        <button onClick={doFetch} disabled={loading}
          style={{ background: loading ? '#333' : '#2d9e5f', border:'none', borderRadius:6, padding:'5px 14px', fontSize:11, fontWeight:700, color: loading ? '#555' : '#fff', cursor: loading ? 'default' : 'pointer', fontFamily:'inherit' }}>
          {loading ? '…' : '↻ Live WXR'}
        </button>
      </div>

      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setWxTab(t.id)}
            style={{ flex:1, padding:9, textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color: wxTab===t.id ? '#1a9bc4' : '#555', borderBottom: wxTab===t.id ? '2px solid #1a9bc4' : '2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        {!mergedData && <div style={{ color:'#555', fontSize:12, textAlign:'center', marginTop:20 }}>No WX data — press Live WXR or activate a plan with WX</div>}

        {wxTab === 'sigmet' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#e02020', marginBottom:8 }}>SIGMET</div>
            <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, color: sigmet ? '#e8c070' : '#555' }}>
              {sigmet || 'No SIGMET in plan data'}
            </div>
          </div>
        )}

        {wxTab !== 'sigmet' && d && (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', marginBottom:8 }}>{d.name}</div>
            <div style={{ display:'flex', gap:12, marginBottom:10, flexWrap:'wrap' }}>
              {[{ color:COLORS.green, label:'Normal' },{ color:COLORS.yellow, label:'Caution' },{ color:COLORS.orange, label:'Warning' },{ color:COLORS.red, label:'Critical' }].map((c,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:8, height:8, borderRadius:4, background:c.color }}/>
                  <span style={{ fontSize:10, color:'#555' }}>{c.label}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:5 }}>METAR</div>
            <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, marginBottom:10 }}>
              {(d.metar||[]).map((m,i) => <div key={i}><ColoredWeather text={m}/></div>)}
            </div>
            <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:5 }}>TAF</div>
            <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9 }}>
              {(d.taf||[]).map((l,i) => <div key={i}><ColoredWeather text={l}/></div>)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── NOTAM ────────────────────────────────────────────────────────────────────
function parseNotams(rawText, icao) {
  if (!rawText || !icao) return [];

  // "|#1|" ile başlayan ilk NOTAM bloğunu bul
  const startIdx = rawText.indexOf('|#1|');
  if (startIdx === -1) return [];

  // "End of NOTAM information" ile bitir
  const endIdx = rawText.search(/End of NOTAM information/i);
  const section = rawText.slice(startIdx, endIdx !== -1 ? endIdx : startIdx + 80000);

  // Tüm NOTAM bloklarını |#N| ile ayır
  const blocks = section.split(/\|#\d+\|[^\n]*/);

  const items = [];
  for (const block of blocks) {
    const t = block.trim();
    if (t.length < 20) continue;

    // A) field'ında bu ICAO var mı?
    if (!new RegExp(`\\bA\\)\\s*${icao}\\b`).test(t)) continue;

    // NOTAM ID
    const idMatch = t.match(/([A-Z]\d+\/\d+\s+NOTAM[RNC]?)/);
    const id   = idMatch?.[1]?.trim() || t.slice(0, 15) || 'NOTAM';
    const type = t.match(/\[([^\]]+)\]/)?.[1] || '';

    // E) field — \nE) veya sadece E)
    let eStart = t.indexOf('\nE)');
    if (eStart === -1) eStart = t.indexOf(' E)');
    if (eStart === -1) continue;
    const afterE = t.slice(eStart + 3);
    const fIdx   = afterE.search(/\n[A-GQ]\)\s/);
    const text   = (fIdx !== -1 ? afterE.slice(0, fIdx) : afterE).replace(/\s+/g, ' ').trim();
    if (!text || text.length < 5) continue;

    const u = text.toUpperCase();
    const color =
      /\bCLSD\b|\bCLOSED\b|\bU\/S\b|\bUNSERVICEABLE\b|\bPROHIBITED\b/.test(u) ? '#e02020' :
      /\bINOP\b|\bLIMITED\b|\bRESTRICTED\b|\bSUSPEND\b/.test(u)                 ? '#e8731a' :
      /\bWIP\b|\bCONST\b/.test(u)                                                 ? '#f0c040' : '#666';
    items.push({ id, type, text, color });
  }
  return items;
}

function NOTAM({ activePlan, rawText }) {
  const [tab, setTab] = usePersistedState('efb_notam_tab', 'dep');

  const depIcao  = activePlan?.dep       || '—';
  const destIcao = activePlan?.dest      || '—';
  const altIcao  = activePlan?.alternate || '—';

  const tabs = [
    { id:'dep',  label:'Departure',   icao:depIcao  },
    { id:'dest', label:'Destination', icao:destIcao },
    { id:'alt',  label:'Alternate',   icao:altIcao  },
  ];

  const items = useMemo(() => parseNotams(rawText, tabs.find(t=>t.id===tab)?.icao), // eslint-disable-line
  [rawText, tab, depIcao, destIcao, altIcao]); // eslint-disable-line

  const apName = { dep:`${depIcao} — Departure`, dest:`${destIcao} — Destination`, alt:`${altIcao} — Alternate` }[tab];

  const keywords = [
    { words:['CLSD','CLOSED','U/S','UNSERVICEABLE','PROHIBITED'], color:'#e02020', bold:true  },
    { words:['INOP','LIMITED','RESTRICTED','SUSPEND'],             color:'#e8731a', bold:false },
    { words:['WIP','CONST','CONSTRUCTION'],                        color:'#f0c040', bold:false },
  ];
  const kwRe = new RegExp('\\b(' + keywords.flatMap(r=>r.words).map(w=>w.replace(/\//g,'\\/')).join('|') + ')\\b','gi');

  const highlight = (text) =>
    text.split(kwRe).map((part,i) => {
      const rule = keywords.find(r=>r.words.includes(part.toUpperCase()));
      return <span key={i} style={{ color:rule?rule.color:'#888', fontWeight:rule?.bold?700:400 }}>{part}</span>;
    });

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, padding:9, textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color:tab===t.id?'#1a9bc4':'#555', borderBottom:tab===t.id?'2px solid #1a9bc4':'2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto' }}>
        <div style={{ padding:'9px 14px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#1a9bc4' }}>{apName}</span>
          <span style={{ fontSize:10, color:'#555' }}>{items.length} NOTAMs</span>
        </div>
        {items.length === 0 && (
          <div style={{ padding:16, color:'#555', fontSize:12, textAlign:'center' }}>
            {rawText ? 'No NOTAMs found for this airport' : 'No plan data loaded'}
          </div>
        )}
        {items.map((n,i) => (
          <div key={i} style={{ padding:'9px 14px', borderBottom:'1px solid #383838' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4, gap:8 }}>
              <span style={{ fontSize:10, fontWeight:700, color:n.color }}>{n.id}</span>
              {n.type && <span style={{ fontSize:9, color:'#555', fontStyle:'italic', flexShrink:0 }}>{n.type}</span>}
            </div>
            <div style={{ fontFamily:'monospace', fontSize:10, lineHeight:1.6 }}>
              {highlight(n.text)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WXR Charts ───────────────────────────────────────────────────────────────
function WXRCharts({ rawText }) {
  const [sel, setSel] = usePersistedState('efb_wxrchart_sel', null);

  const charts = useMemo(() => {
    if (!rawText) return [];
    const result = [];
    console.log('[CHARTS] rawText length:', rawText.length);
    console.log('[CHARTS] hasWindTemp:', rawText.includes('WIND/TEMPERATURE'));
    console.log('[CHARTS] hasVCS:', rawText.includes('VERTICAL CROSS SECTION'));
    console.log('[CHARTS] hasSigWx:', rawText.includes('SIGNIFICANT WEATHER'));

    // Wind/Temp charts
    const windRe = /WIND\/TEMPERATURE\s*\n\s*(FL\s*\d+)\s*\n\s*PROGNOSTIC CHART\s*\n\s*([A-Z]+ - [A-Z]+)\s*\n\s*VALID\s+([^\n]+)/g;
    let m;
    while ((m = windRe.exec(rawText)) !== null) {
      result.push({ type:'wind', label:`Wind/Temp ${m[1].trim()}`, fl:m[1].trim(), route:m[2].trim(), valid:m[3].trim() });
    }

    // Vertical Cross Section
    const vcsM = rawText.match(/VERTICAL CROSS SECTION ALONG THE ROUTE ([^\n]+)/);
    if (vcsM) result.push({ type:'vcs', label:'Vertical Cross Section', route:vcsM[1].trim() });

    // SigWx
    const swM = rawText.match(/SIGNIFICANT WEATHER\s*\nFIXED TIME PROGNOSTIC CHART\s*\nROUTE ([^\n]+)\s*\n([^\n]+)\s*\nVALID\s+([^\n]+)/);
    if (swM) {
      const cb    = rawText.match(/CB CLOUD AREAS\s*([\s\S]*?)ICING AREAS/)?.[1]?.trim()       || '';
      const icing = rawText.match(/ICING AREAS\s*([\s\S]*?)TURBULENCE AREAS/)?.[1]?.trim()      || '';
      const turb  = rawText.match(/TURBULENCE AREAS\s*([\s\S]*?)VOLCANIC/)?.[1]?.trim()         || '';
      result.push({ type:'sigwx', label:`SigWx ${swM[2].trim()}`, route:swM[1].trim(), level:swM[2].trim(), valid:swM[3].trim(), cb, icing, turb });
    }

    return result;
  }, [rawText]);

  const active = charts.find(c => c.label === sel) || null;

  if (!rawText || charts.length === 0) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:20 }}>
        <div style={{ fontSize:36 }}>🗺</div>
        <div style={{ fontSize:13, color:'#555', textAlign:'center' }}>No chart data in plan</div>
      </div>
    );
  }

  const block = (color, label, content) => content ? (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:9, color, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>{label}</div>
      <div style={{ background:'rgba(0,0,0,0.2)', borderLeft:`3px solid ${color}`, borderRadius:4, padding:'6px 10px', fontFamily:'monospace', fontSize:10, lineHeight:1.7, whiteSpace:'pre-wrap', color: color+'cc' }}>{content}</div>
    </div>
  ) : null;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ flexShrink:0, borderBottom:'1px solid #383838' }}>
        {charts.map((c,i) => (
          <div key={i} onClick={() => setSel(c.label === sel ? null : c.label)}
            style={{ padding:'10px 14px', borderBottom:'1px solid #2a2a2a', cursor:'pointer', background: c.label===sel ? 'rgba(26,155,196,0.08)' : '#1e1e1e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color: c.label===sel ? '#1a9bc4' : '#999' }}>{c.label}</div>
              {c.valid  && <div style={{ fontSize:10, color:'#555', marginTop:2 }}>Valid: {c.valid}</div>}
              {c.route  && <div style={{ fontSize:10, color:'#444', marginTop:1 }}>{c.route}</div>}
            </div>
            <span style={{ color: c.label===sel ? '#1a9bc4' : '#444', fontSize:16 }}>{c.label===sel ? '▼' : '›'}</span>
          </div>
        ))}
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
        {!active && <div style={{ color:'#555', fontSize:12, textAlign:'center', marginTop:20 }}>Select a chart above</div>}
        {active?.type === 'wind' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', marginBottom:6 }}>{active.label} · {active.route}</div>
            <div style={{ fontSize:10, color:'#555', marginBottom:10 }}>Valid: {active.valid}</div>
            <div style={{ padding:'8px 10px', background:'rgba(26,155,196,0.06)', borderRadius:6, fontSize:10, color:'#888', lineHeight:1.6 }}>
              Wind/Temperature grid data is in the plan PDF. See NavLog for per-waypoint wind components (H=headwind, T=tailwind).
            </div>
          </div>
        )}
        {active?.type === 'vcs' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', marginBottom:6 }}>Vertical Cross Section · {active.route}</div>
            <div style={{ padding:'8px 10px', background:'rgba(26,155,196,0.06)', borderRadius:6, fontSize:10, color:'#888', lineHeight:1.6 }}>
              Wind, temperature, tropopause, icing and turbulence forecast by waypoint. See NavLog for per-waypoint data.
            </div>
          </div>
        )}
        {active?.type === 'sigwx' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', marginBottom:4 }}>SigWx · {active.level}</div>
            <div style={{ fontSize:10, color:'#555', marginBottom:10 }}>Valid: {active.valid}</div>
            {block('#e02020', 'CB Cloud Areas',   active.cb)}
            {block('#e8731a', 'Icing Areas',      active.icing)}
            {block('#f0c040', 'Turbulence Areas', active.turb)}
            <div style={{ padding:'8px 10px', background:'rgba(255,255,255,0.03)', borderRadius:6, fontSize:10, color:'#555', lineHeight:1.6, marginTop:6 }}>
              ℹ Visual SigWx chart is in the original PDF (last pages).
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EFP Main ─────────────────────────────────────────────────────────────────
function EFP({ setStatus, activePlan, rawText = '' }) {
  const [activeTab, setActiveTab] = usePersistedState('efb_efp_activeTab', 'fl-plan');
  const [seenTabs,  setSeenTabs]  = usePersistedState('efb_efp_seenTabs',  []);

  // seenTabs güncelle
  useEffect(() => {
    if (seenTabs.includes(activeTab)) return;
    const t = setTimeout(() => setSeenTabs(prev => [...prev, activeTab]), 1000);
    return () => clearTimeout(t);
  }, [activeTab]); // eslint-disable-line

  // Status güncelle
  useEffect(() => {
    if (!setStatus) return;
    if (seenTabs.length === ALL_TABS.length) setStatus('green');
    else if (seenTabs.length > 0)           setStatus('amber');
    else                                     setStatus('pending');
  }, [seenTabs]); // eslint-disable-line

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ background:'#1a2a1a', borderBottom:'1px solid rgba(45,158,95,0.3)', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontSize:11, color:'#555' }}>
          {activePlan ? `Plan: ${activePlan.dep} → ${activePlan.dest}` : 'No active plan'}
          {rawText ? ` · ${rawText.length.toLocaleString()} chars` : ' · Loading...'}
        </span>
        <button onClick={() => window.location.reload()}
          style={{ background:'#2d9e5f', border:'none', borderRadius:7, padding:'7px 18px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
          ↻ Refresh Plan
        </button>
      </div>

      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0, overflowX:'auto' }}>
        {[
          { id:'fl-plan',    label:'FL Plan'         },
          { id:'atc-plan',   label:'ATC Flight Plan'  },
          { id:'wxr',        label:'WXR'              },
          { id:'notam',      label:'NOTAM'            },
          { id:'wxr-charts', label:'WXR Charts'       },
        ].map(t => (
          <div key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:'9px 14px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, cursor:'pointer', color:activeTab===t.id?'#1a9bc4':'#555', borderBottom:activeTab===t.id?'2px solid #1a9bc4':'2px solid transparent' }}>
            {t.label}
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