import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { parseWeatherText, COLORS } from '../config/weatherRules';
import { fetchWeatherData } from '../config/weatherService';

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const ALL_TABS = ['fl-plan', 'atc-plan', 'wxr', 'notam', 'wxr-charts'];

// ─── FL Plan ──────────────────────────────────────────────────────────────────
function FLPlan({ activePlan, rawText }) {
  const p = activePlan || {};

  // Parse CONT fuel from raw_text
  const contFuel = rawText?.match(/CONT\s+(\d+)/)?.[1] || '—';
  const minToFuel = rawText?.match(/MIN T\/O FUEL\s+(\d+)/)?.[1] || '—';
  const taxiFuel  = rawText?.match(/TAXI\s+(\d+)/)?.[1] || '400';

  // Parse times from raw_text
  const tripTime  = rawText?.match(/TRIP\s+\d+\s+([\d:]+)/)?.[1] || '—';
  const contTime  = rawText?.match(/CONT\s+\d+\s+([\d:]+)/)?.[1] || '—';
  const altTime   = rawText?.match(/ALTERNATE\s+\d+\s+([\d:]+)/)?.[1] || '—';
  const resTime   = rawText?.match(/FINAL RESERVE\s+\d+\s+([\d:]+)/)?.[1] || '0:30';
  const minToTime = rawText?.match(/MIN T\/O FUEL\s+\d+\s+([\d:]+)/)?.[1] || '—';
  const totalTime = rawText?.match(/TOTAL FOB\s+\d+\s+([\d:]+)/)?.[1] || '—';

  // Parse weights from raw_text
  const mtow = rawText?.match(/MTOW\s+([\d]+)/)?.[1] || '74600';
  const mzfw = rawText?.match(/MZFW\s+([\d]+)/)?.[1] || '49000';
  const mlwt = rawText?.match(/MLWT\s+([\d]+)/)?.[1] || '66000';
  const maxFuel = rawText?.match(/MAX FUEL\s+([\d]+)/)?.[1] || '—';

  const dep   = p.dep  || '—';
  const dest  = p.dest || '—';
  const reg   = p.reg  || '—';
  const ac    = p.ac_type || '—';
  const logNr = p.log_nr  || '—';
  const callsign = p.callsign || reg.replace('-','');
  const std   = p.std  || '—';
  const eta   = p.eta  || '—';
  const date  = p.date || '—';
  const alt   = p.alternate || '—';
  const cruise = p.cruise_fl || '—';

  const trip  = p.trip_fuel      || '—';
  const altF  = p.alternate_fuel || '—';
  const resF  = p.reserve_fuel   || '—';
  const fob   = rawText?.match(/TOTAL FOB\s+(\d+)/)?.[1] || (p.fob?.replace(/[^\d]/g,'') || '—');

  const Blank = ({ w = 80 }) => (
    <span style={{ display:'inline-block', borderBottom:'1px solid #aaa', minWidth:w }}>&nbsp;</span>
  );

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

          <div>FMS IDENT={callsign}{'  '}Log Nr.: {logNr}{'  '}Page 1{'  '}{dep}-{dest}{'  '}{callsign}</div>

          <div style={{ border:'1px solid #555', padding:'5px 8px', margin:'5px 0' }}>
            FLT{'  '}{callsign}{'  '}{dep}-{dest}{'  '}ETD:{std} ETA:{eta} {ac}{'  '}Lbs<br/>
            REGN {callsign}{'  '}CRUISE:{cruise}{'  '}{date}{'  '}WX PROG<br/>
            {'                                    '}WX VALID +36HRS
          </div>

          <br/>
          PIC :{'  '}<Blank w={120} />{'  '}SIGN :{'  '}<Blank w={100} /><br/><br/>
          DISP: <Blank w={160} />{'  '}LICENSE NO: <Blank w={80} />{'  '}SIGN{'  '}<Blank w={80} />
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          DEPARTURE ATIS:{'  '}<Blank w={200} /><br/><br/>
          ATC CLRNC: SID:{'  '}<Blank w={40} />{'  '}FL:{'  '}<Blank w={30} />{'  '}SQ:{'  '}<Blank w={35} />{'  '}OTH:{'  '}<Blank w={40} /><br/><br/>
          ARRIVAL ATIS:{'  '}<Blank w={210} />
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          RVSM CHECK{'  '}NO1 ALT{'  '}<Blank w={38} />{'  '}STBY{'  '}<Blank w={38} />{'  '}NO2 ALT{'  '}<Blank w={38} />
          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />

          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'9.5px', lineHeight:1.7 }}>
            <tbody>
              <tr><td></td><td>FUEL</td><td>TIME</td><td>MAX DESIGN WTS</td><td>SPEEDS</td></tr>
              <tr><td>TRIP</td><td>{trip}</td><td>{tripTime}</td><td>MZFW {mzfw}</td><td>V1{'  '}<Blank w={30} /></td></tr>
              <tr><td>CONT</td><td>{contFuel}</td><td>{contTime}</td><td>MTOW {mtow}</td><td></td></tr>
              <tr><td>ALT</td><td>{altF}</td><td>{altTime}</td><td>{alt}{'  '}MLWT {mlwt}</td><td>VR{'  '}<Blank w={30} /></td></tr>
              <tr><td>FINAL RES</td><td>{resF}</td><td>{resTime}</td><td></td><td>V2{'  '}<Blank w={30} /></td></tr>
              <tr><td>MIN T/O</td><td>{minToFuel}</td><td>{minToTime}</td><td></td><td></td></tr>
              <tr><td>TAXI</td><td>{taxiFuel}</td><td></td><td></td><td></td></tr>
              <tr><td>TOTAL FOB</td><td>{fob}</td><td>{totalTime}</td><td>MAX FUEL {maxFuel}</td><td>VREF{'  '}<Blank w={30} /></td></tr>
            </tbody>
          </table>

          <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
          FUEL T/O{'  '}<Blank w={38} />{'  '}BLON{'  '}<Blank w={32} />{'  '}LDG{'  '}<Blank w={32} /><br/>
          LDG FUEL{'  '}<Blank w={38} />{'        '}BLOFF{'  '}<Blank w={32} />{'  '}T/O{'  '}<Blank w={32} /><br/>
          BURNOFF{'  '}<Blank w={38} />{'  '}TIME{'  '}<Blank w={32} />{'  '}TIME{'  '}<Blank w={32} />
        </div>
      </div>
    </div>
  );
}

// ─── ATC Plan ─────────────────────────────────────────────────────────────────
function ATCPlan({ rawText, activePlan }) {
  // Extract FPL block from raw_text
  const fplMatch = rawText?.match(/(\(FPL-[\s\S]*?C\/ON DUTY PIC\))/);
  const fplText  = fplMatch?.[1] || null;

  return (
    <div style={{ flex:1, overflowY:'auto', background:'#111', padding:'8px 0' }}>
      <div style={{ margin:'10px 14px', border:'1px solid #333', padding:'14px 16px', background:'#f5f5f0', fontFamily:'Courier New, monospace', fontSize:10, lineHeight:1.65, color:'#111', borderRadius:3 }}>
        <b>SHORT ICAO ATC FLIGHT PLAN</b>
        <div style={{ borderTop:'1px solid #888', margin:'6px 0' }} />
        {fplText ? (
          <pre style={{ margin:0, fontFamily:'inherit', fontSize:'inherit', whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
            {fplText}
          </pre>
        ) : (
          <div style={{ color:'#888' }}>
            No ATC flight plan found in PDF data.<br />
            {activePlan?.dep && `DEP: ${activePlan.dep} → DEST: ${activePlan.dest}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WXR ──────────────────────────────────────────────────────────────────────
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

function WXR({ activePlan }) {
  const depIcao  = activePlan?.dep       || 'LTAC';
  const destIcao = activePlan?.dest      || 'LTBA';
  const altIcao  = activePlan?.alternate || 'LTFM';

  const defaultWxr = {
    dep:  { name:`${depIcao} — Departure`,   metar:['No data — press Refresh WXR'], taf:['No data — press Refresh WXR'] },
    dest: { name:`${destIcao} — Destination`,metar:['No data — press Refresh WXR'], taf:['No data — press Refresh WXR'] },
    alt:  { name:`${altIcao} — Alternate`,   metar:['No data — press Refresh WXR'], taf:['No data — press Refresh WXR'] },
  };

  const [tab, setTab]         = useState('dep');
  const [wxData, setWxData]   = useState(defaultWxr);
  const [updatedAt, setUpdatedAt] = useState('—');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(false);

  // Reset when plan changes
useEffect(() => {
    setWxData({
      dep:  { name:`${depIcao} — Departure`,   metar:['Press Refresh WXR to load'], taf:['Press Refresh WXR to load'] },
      dest: { name:`${destIcao} — Destination`,metar:['Press Refresh WXR to load'], taf:['Press Refresh WXR to load'] },
      alt:  { name:`${altIcao} — Alternate`,   metar:['Press Refresh WXR to load'], taf:['Press Refresh WXR to load'] },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlan?.id]);

  const doFetch = async () => {
    setLoading(true);
    setError(false);
    try {
      const { metars, tafs, updatedAt: ua } = await fetchWeatherData(depIcao, destIcao, altIcao);
      setWxData({
        dep:  { name:`${depIcao} — Departure`,   metar: metars[depIcao]  || ['No METAR available'], taf: tafs[depIcao]  || ['No TAF available'] },
        dest: { name:`${destIcao} — Destination`,metar: metars[destIcao] || ['No METAR available'], taf: tafs[destIcao] || ['No TAF available'] },
        alt:  { name:`${altIcao} — Alternate`,   metar: metars[altIcao]  || ['No METAR available'], taf: tafs[altIcao]  || ['No TAF available'] },
      });
      setUpdatedAt(ua);
    } catch {
      setError(true);
    }
    setLoading(false);
  };

  const tabs = [
    { id:'dep',  label:'Departure'   },
    { id:'dest', label:'Destination' },
    { id:'alt',  label:'Alternate'   },
  ];
  const d = wxData[tab];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ background:'#1a2a1a', borderBottom:'1px solid rgba(45,158,95,0.3)', padding:'7px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontSize:10, color: error ? '#e02020' : '#555' }}>
          {error ? '⚠ Connection error — showing cached data' : updatedAt !== '—' ? `Updated: ${updatedAt}` : `${depIcao} · ${destIcao} · ${altIcao}`}
        </span>
        <button onClick={doFetch} disabled={loading}
          style={{ background: loading ? '#333' : '#2d9e5f', border:'none', borderRadius:6, padding:'5px 14px', fontSize:11, fontWeight:700, color: loading ? '#555' : '#fff', cursor: loading ? 'default' : 'pointer', fontFamily:'inherit' }}>
          {loading ? '…' : '↻ Refresh WXR'}
        </button>
      </div>

      <div style={{ display:'flex', background:'#1a1a1a', borderBottom:'1px solid #383838', flexShrink:0 }}>
        {tabs.map(t => (
          <div key={t.id} onClick={() => setTab(t.id)} style={{ flex:1, padding:9, textAlign:'center', fontSize:11, fontWeight:600, cursor:'pointer', color: tab===t.id ? '#1a9bc4' : '#555', borderBottom: tab===t.id ? '2px solid #1a9bc4' : '2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#1a9bc4', marginBottom:8 }}>{d.name}</div>
        <div style={{ display:'flex', gap:12, marginBottom:10, flexWrap:'wrap' }}>
          {[
            { color: COLORS.green,  label:'Normal'   },
            { color: COLORS.yellow, label:'Caution'  },
            { color: COLORS.orange, label:'Warning'  },
            { color: COLORS.red,    label:'Critical' },
          ].map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:4, background: c.color }} />
              <span style={{ fontSize:10, color:'#555' }}>{c.label}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:5 }}>METAR</div>
        <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9, marginBottom:10 }}>
          {d.metar.map((m, i) => <div key={i}><ColoredWeather text={m} /></div>)}
        </div>
        <div style={{ fontSize:9, color:'#555', fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', marginBottom:5 }}>TAF</div>
        <div style={{ background:'#1e1e1e', borderRadius:5, padding:'9px 11px', fontFamily:'monospace', fontSize:11, lineHeight:1.9 }}>
          {d.taf.map((l, i) => <div key={i}><ColoredWeather text={l} /></div>)}
        </div>
      </div>
    </div>
  );
}

// ─── NOTAM ────────────────────────────────────────────────────────────────────
function NOTAM({ activePlan, rawText }) {
  const [tab, setTab] = useState('dep');

  const depIcao  = activePlan?.dep       || '—';
  const destIcao = activePlan?.dest      || '—';
  const altIcao  = activePlan?.alternate || '—';

  // Extract NOTAM section from raw_text
  const extractNotams = (icao) => {
    if (!rawText) return [];
    // Look for NOTAM blocks for this airport
    const pattern = new RegExp(
      `Flight group apt ${icao}[\\s\\S]*?(?=Flight group apt [A-Z]{4}|End of NOTAM|$)`,
      'i'
    );
    const section = rawText.match(pattern)?.[0] || '';
    if (!section) return [];

    // Extract individual NOTAMs
    const items = [];
    const notamBlocks = section.matchAll(/\|#\d+\|[-]+[^\n]*\n([\s\S]*?)(?=\|#\d+\||$)/g);
    for (const block of notamBlocks) {
      const text = block[1]?.trim();
      if (!text) continue;
      const idMatch = text.match(/^([A-Z]\d+\/\d+)/);
      const id = idMatch?.[1] || 'NOTAM';
      const color = text.includes('CLSD') || text.includes('OUT OF SERVICE') ? '#e02020'
                  : text.includes('WIP') || text.includes('MAINT') ? '#ff9500' : '#666';
      items.push({ id, text: text.slice(0, 200), color });
    }
    return items;
  };

  const tabs = [
    { id:'dep',  label:'Departure',   icao: depIcao  },
    { id:'dest', label:'Destination', icao: destIcao },
    { id:'alt',  label:'Alternate',   icao: altIcao  },
    { id:'fir',  label:'FIR'                         },
  ];

  const notamData = {
    dep:  { ap:`${depIcao} — Departure`,   items: extractNotams(depIcao)  },
    dest: { ap:`${destIcao} — Destination`,items: extractNotams(destIcao) },
    alt:  { ap:`${altIcao} — Alternate`,   items: extractNotams(altIcao)  },
    fir:  { ap:'FIR NOTAMs',               items: []                      },
  };

  const d = notamData[tab];

  const allKeywords = [
    { words:['CLSD','CLOSED','U/S','UNSERVICEABLE','PROHIBITED','MUST BE','SHALL BE','MUST NOT','SHALL NOT'], color:'#e02020', bold:true  },
    { words:['INOP','LIMITED','RESTRICTED','SUSPEND','NOT AVBL'],                                             color:'#e8731a', bold:false },
    { words:['WIP','CONST','CONSTRUCTION','WORK IN PROGRESS','MAY BE'],                                      color:'#f0c040', bold:false },
  ];
  const kwRegex = new RegExp('\\b(' + allKeywords.flatMap(r => r.words).map(w => w.replace(/[/]/g,'\\/')).join('|') + ')\\b', 'gi');

  const highlightText = (text) =>
    text.split(kwRegex).map((part, i) => {
      const upper = part.toUpperCase();
      const rule  = allKeywords.find(r => r.words.includes(upper));
      return <span key={i} style={{ color: rule ? rule.color : '#777', fontWeight: rule?.bold ? 700 : 400 }}>{part}</span>;
    });

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
          <span style={{ fontSize:10, color:'#555' }}>{d.items.length} NOTAMs</span>
        </div>
        {d.items.length === 0 && (
          <div style={{ padding:16, color:'#555', fontSize:12, textAlign:'center' }}>
            {rawText ? 'No NOTAMs found for this airport' : 'No plan data loaded'}
          </div>
        )}
        {d.items.map((n, i) => (
          <div key={i} style={{ padding:'9px 14px', borderBottom:'1px solid #383838' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
              <span style={{ fontSize:10, fontWeight:700, color: n.color }}>{n.id}</span>
            </div>
            <div style={{ fontFamily:'monospace', fontSize:10, lineHeight:1.55 }}>
              {highlightText(n.text)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WXR Charts ───────────────────────────────────────────────────────────────
function WXRCharts() {
  const charts = ['Wind & Temp FL280/300/320', 'SigWx FL100-450', 'Vertical Cross Section'];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:20 }}>
      <div style={{ fontSize:36 }}>🗺</div>
      <div style={{ fontSize:13, color:'#555', textAlign:'center', lineHeight:1.6 }}>WXR Charts<br /><span style={{ fontSize:11, color:'#444' }}>Select a chart to view</span></div>
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

// ─── EFP Main ─────────────────────────────────────────────────────────────────
function EFP({ setStatus, activePlan }) {
  const [activeTab, setActiveTab] = useState('fl-plan');
  const [seenTabs, setSeenTabs]   = useState(new Set());
  const [rawText, setRawText]     = useState('');
  const [planUpdatedAt, setPlanUpdatedAt] = useState('—');

  // Fetch raw_text from plan_versions when activePlan changes
  useEffect(() => {
    if (!activePlan?.id) return;
    const fetchRaw = async () => {
      const { data } = await supabase
        .from('plan_versions')
        .select('raw_text, created_at')
        .eq('plan_id', activePlan.id)
        .order('version_no', { ascending: false })
        .limit(1)
        .single();
      if (data) {
        setRawText(data.raw_text || '');
        const d = new Date(data.created_at);
        setPlanUpdatedAt(d.toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'UTC' }) + ' Z');
      }
    };
    fetchRaw();
  }, [activePlan?.id]);

  useEffect(() => {
    if (seenTabs.has(activeTab)) return;
    const timer = setTimeout(() => {
      setSeenTabs(prev => new Set([...prev, activeTab]));
    }, 1000);
    return () => clearTimeout(timer);
  }, [activeTab, seenTabs]);

  useEffect(() => {
    if (!setStatus) return;
    if (seenTabs.size === ALL_TABS.length) setStatus('green');
    else if (seenTabs.size > 0)           setStatus('amber');
    else                                  setStatus('pending');
  }, [seenTabs, setStatus]);

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      <div style={{ background:'#1a2a1a', borderBottom:'1px solid rgba(45,158,95,0.3)', padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontSize:11, color:'#555' }}>
          {activePlan ? `Plan: ${activePlan.dep} → ${activePlan.dest} · Updated: ${planUpdatedAt}` : 'No active plan'}
        </span>
        <button onClick={() => window.location.reload()} style={{ background:'#2d9e5f', border:'none', borderRadius:7, padding:'7px 18px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', letterSpacing:0.3 }}>
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
          <div key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding:'9px 14px', whiteSpace:'nowrap', fontSize:11, fontWeight:600, cursor:'pointer', color: activeTab===t.id ? '#1a9bc4' : '#555', borderBottom: activeTab===t.id ? '2px solid #1a9bc4' : '2px solid transparent' }}>
            {t.label}
          </div>
        ))}
      </div>

      {activeTab === 'fl-plan'    && <FLPlan    activePlan={activePlan} rawText={rawText} />}
      {activeTab === 'atc-plan'   && <ATCPlan   activePlan={activePlan} rawText={rawText} />}
      {activeTab === 'wxr'        && <WXR       activePlan={activePlan} />}
      {activeTab === 'notam'      && <NOTAM     activePlan={activePlan} rawText={rawText} />}
      {activeTab === 'wxr-charts' && <WXRCharts />}
    </div>
  );
}

export default EFP;