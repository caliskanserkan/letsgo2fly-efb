import React, { useState, useEffect, useMemo } from 'react';
import { parseWeatherText, COLORS } from '../config/weatherRules';
import { usePersistedState } from '../hooks/usePersistedState';
import { supabase } from '../supabaseClient';

const ALL_TABS = ['ofp', 'wxr'];

// ─── OFP PDF Viewer ──────────────────────────────────────────
function OFPView({ rawText, activePlan }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activePlan?.id) return;
    setLoading(true);
    const fetchPdf = async () => {
      try {
        // Try active first, then archived
        let path = `active/${activePlan.id}.pdf`;
        const { data, error } = await supabase.storage.from('ofp-pdfs').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) {
          path = `archived/${activePlan.id}.pdf`;
          const { data: data2 } = await supabase.storage.from('ofp-pdfs').createSignedUrl(path, 3600);
          if (data2?.signedUrl) setPdfUrl(data2.signedUrl);
        } else {
          setPdfUrl(data.signedUrl);
        }
      } catch(e) { console.warn('PDF fetch:', e); }
      setLoading(false);
    };
    fetchPdf();
  }, [activePlan?.id]);

  if (!activePlan?.id) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:24, background:'#0f172a' }}>
        <span style={{ fontSize:40 }}>📄</span>
        <div style={{ fontSize:14, color:'#475569', textAlign:'center' }}>No plan data loaded</div>
        <div style={{ fontSize:12, color:'#334155', textAlign:'center' }}>Activate a flight plan from Dashboard</div>
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0f172a' }}>
      <div style={{ background:'rgba(74,222,128,0.06)', borderBottom:'1px solid rgba(74,222,128,0.2)', padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <span style={{ fontSize:12, color:'#4ade80', fontWeight:500 }}>
          {activePlan ? `${activePlan.dep} → ${activePlan.dest} · ${activePlan.date || ''}` : 'Flight Plan'}
        </span>
        {loading && <span style={{ fontSize:11, color:'#475569' }}>Loading PDF...</span>}
      </div>

      {pdfUrl ? (
        <iframe
          src={pdfUrl}
          style={{ flex:1, border:'none', background:'#fff' }}
          title="OFP PDF"
        />
      ) : !loading ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:24 }}>
          <span style={{ fontSize:40 }}>📄</span>
          <div style={{ fontSize:14, color:'#475569', textAlign:'center' }}>PDF not available</div>
          <div style={{ fontSize:12, color:'#334155', textAlign:'center' }}>Re-upload the plan PDF to view it here</div>
        </div>
      ) : null}
    </div>
  );
}

// ─── WXR Helpers ─────────────────────────────────────────────
function ColoredWeather({ text }) {
  return (
    <span>
      {parseWeatherText(text).map((t, i) => (
        <span key={i} style={{ color: t.color || '#94a3b8' }}>{t.text}</span>
      ))}
    </span>
  );
}

// Parse WX data for a specific ICAO from rawText
function parseIcaoWxFromRaw(rawText, icao) {
  if (!rawText || !icao) return { metar:[], taf:[] };
  const wxIdx = rawText.search(/WX for (?:flight|Flight Group)/i);
  const wxEnd  = rawText.search(/End of WX information/i);
  const block  = wxIdx !== -1 ? rawText.slice(wxIdx, wxEnd !== -1 ? wxEnd + 30 : wxIdx + 20000) : rawText;
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

// Parse airport label (DEP/DEST/ALT/ADEQUATE) and ICAO from WX section
function parseAllWxAirports(rawText) {
  if (!rawText) return [];
  const wxIdx = rawText.search(/WX for (?:flight|Flight Group)/i);
  const wxEnd  = rawText.search(/End of WX information/i);
  if (wxIdx === -1) return [];
  const block = rawText.slice(wxIdx, wxEnd !== -1 ? wxEnd + 30 : wxIdx + 20000);

  const re = /(Departure|Destination|Alternate|Adequate)\s+airport\s+([A-Z]{4})\s*-?\s*([^\n]*)/gi;
  const airports = []; const seen = new Set();
  let m;
  while ((m = re.exec(block)) !== null) {
    const type = m[1].toUpperCase();
    const icao = m[2].toUpperCase();
    const name = m[3].trim().split(/\s{2,}/)[0] || '';
    if (!seen.has(icao)) {
      seen.add(icao);
      airports.push({ icao, type, name });
    }
  }
  return airports;
}

// Parse WX header info from rawText
function parseWxHeader(rawText) {
  if (!rawText) return null;
  const m = rawText.match(/WX for flight\s+([^\n(]+)/i);
  const ts = rawText.match(/WX search performed\s+([^\n]+)/i)?.[1]?.trim();
  return { title: m?.[1]?.trim() || '', timestamp: ts || '' };
}

// Fetch live METAR/TAF for a list of ICAOs from aviationweather.gov
async function fetchLiveWx(icaoList) {
  const ids = icaoList.join(',');
  const results = {};
  try {
    // METAR
    const mResp = await fetch(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=raw&hours=3&taf=false`);
    const mText = await mResp.text();
    mText.trim().split('\n').filter(Boolean).forEach(line => {
      const icao = line.split(' ')[0];
      if (icao && /^[A-Z]{4}$/.test(icao)) {
        if (!results[icao]) results[icao] = { metar:[], taf:[] };
        results[icao].metar.push(line.trim());
      }
    });
  } catch {}
  try {
    // TAF
    const tResp = await fetch(`https://aviationweather.gov/api/data/taf?ids=${ids}&format=raw`);
    const tText = await tResp.text();
    let cur = null;
    tText.trim().split('\n').filter(Boolean).forEach(line => {
      const l = line.trim();
      if (/^TAF\b/.test(l)) {
        const icao = l.split(/\s+/)[1];
        if (icao && /^[A-Z]{4}$/.test(icao)) {
          cur = icao;
          if (!results[icao]) results[icao] = { metar:[], taf:[] };
          results[icao].taf.push(l);
        }
      } else if (cur && l) {
        if (results[cur]) results[cur].taf[results[cur].taf.length - 1] += ' ' + l;
      }
    });
  } catch {}
  return results;
}

// ─── WXR View ─────────────────────────────────────────────────
function WXRView({ activePlan, rawText }) {

  // All airports from plan's WX section
  const wxAirports = useMemo(() => {
    const fromPdf = parseAllWxAirports(rawText);
    if (fromPdf.length > 0) return fromPdf;
    const fallback = [];
    const addApt = (icaoRaw, type) => {
      const icao = icaoRaw?.split("/")[0]?.trim().toUpperCase();
      if (icao && /^[A-Z]{4}$/.test(icao)) fallback.push({ icao, type, name:"" });
    };
    addApt(activePlan?.dep, "DEPARTURE");
    addApt(activePlan?.dest, "DESTINATION");
    addApt(activePlan?.alternate, "ALTERNATE");
    return fallback;
  }, [rawText, activePlan?.dep, activePlan?.dest, activePlan?.alternate]);
  const wxHeader   = useMemo(() => parseWxHeader(rawText), [rawText]);

  // Plan WX data
  const planWxMap = useMemo(() => {
    const map = {};
    wxAirports.forEach(({ icao }) => {
      map[icao] = parseIcaoWxFromRaw(rawText, icao);
    });
    return map;
  }, [rawText, wxAirports]);

  // SIGMET
  const sigmet = useMemo(() => {
    if (!rawText) return '';
    const si = rawText.search(/SIGMET\(s\)\s+for|No SIGMETs found/i);
    const se = rawText.search(/End of WX information/i);
    return si !== -1 ? rawText.slice(si, se !== -1 ? se : si + 1000).trim() : '';
  }, [rawText]);

  const [liveWxMap, setLiveWxMap] = usePersistedState('efb_wxr_live_map_v2', {});
  const [liveAt,    setLiveAt]    = usePersistedState('efb_wxr_live_at_v2',   '');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(false);
  const [selIcao,   setSelIcao]   = useState(null);
  const [wxTab,     setWxTab]     = useState('metar');

  useEffect(() => {
    if (wxAirports.length > 0 && !selIcao) setSelIcao(wxAirports[0].icao);
  }, [wxAirports, selIcao]);

  const doFetch = async () => {
    if (!wxAirports.length) return;
    setLoading(true); setError(false);
    try {
      const icaoList = wxAirports.map(a => a.icao);
      const live = await fetchLiveWx(icaoList);
      setLiveWxMap(live);
      setLiveAt(new Date().toUTCString().slice(17, 25) + ' UTC');
    } catch { setError(true); }
    setLoading(false);
  };

  const getWx = (icao) => {
    const live = liveWxMap[icao];
    const plan = planWxMap[icao] || { metar:[], taf:[] };
    return {
      metar: live?.metar?.length ? live.metar : plan.metar,
      taf:   live?.taf?.length   ? live.taf   : plan.taf,
    };
  };

  const isLive = Object.keys(liveWxMap).length > 0;
  const selApt = wxAirports.find(a => a.icao === selIcao);
  const selWx  = selIcao ? getWx(selIcao) : { metar:[], taf:[] };

  const typeColor = (type) => {
    if (type === 'DEPARTURE')   return '#4ade80';
    if (type === 'DESTINATION') return '#38bdf8';
    if (type === 'ALTERNATE')   return '#fbbf24';
    return '#475569';
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0f172a' }}>

      {/* Header */}
      <div style={{ background:isLive?'rgba(74,222,128,0.06)':'rgba(251,191,36,0.06)', borderBottom:`1px solid ${isLive?'rgba(74,222,128,0.2)':'rgba(251,191,36,0.2)'}`, padding:'10px 14px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1 }}>
            {wxHeader?.title && (
              <div style={{ fontSize:12, fontWeight:600, color:'#f1f5f9', fontFamily:'monospace', marginBottom:3 }}>
                WX for flight <span style={{ color:'#38bdf8' }}>{wxHeader.title}</span>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:10, fontWeight:700, letterSpacing:1, padding:'3px 10px', borderRadius:20, background:error?'rgba(239,68,68,0.15)':isLive?'rgba(74,222,128,0.15)':'rgba(251,191,36,0.15)', color:error?'#ef4444':isLive?'#4ade80':'#fbbf24', border:`1px solid ${error?'rgba(239,68,68,0.3)':isLive?'rgba(74,222,128,0.3)':'rgba(251,191,36,0.3)'}` }}>
                {error ? '⚠ FAILED' : isLive ? '● LIVE' : '◎ PLAN BRIEFING'}
              </span>
              <span style={{ fontSize:11, color:isLive?'#4ade80':'#fbbf24', fontFamily:'monospace' }}>
                {isLive ? liveAt : wxHeader?.timestamp || ''}
              </span>
            </div>
            <div style={{ fontSize:10, color:'#475569', marginTop:3 }}>
              {wxAirports.length} airports · {isLive ? 'Live METAR/TAF — verify against ATIS' : 'May not reflect current conditions · refresh for live data'}
            </div>
          </div>
          <button onClick={doFetch} disabled={loading || !wxAirports.length}
            style={{ background:loading?'#1e293b':'#4ade80', border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:600, color:loading?'#475569':'#0f172a', cursor:loading?'default':'pointer', fontFamily:'inherit', flexShrink:0, minWidth:90 }}>
            {loading ? '...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Airport list — scrollable */}
      <div style={{ borderBottom:'1px solid #334155', flexShrink:0, overflowX:'auto', background:'#1e293b', display:'flex' }}>
        {wxAirports.map(({ icao, type, name }) => {
          const tc = typeColor(type);
          const wx = getWx(icao);
          const hasData = wx.metar.length > 0 || wx.taf.length > 0;
          const sel = selIcao === icao;
          return (
            <div key={icao} onClick={() => setSelIcao(icao)}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`2px solid ${sel?tc:'transparent'}`, background:sel?`${tc}10`:'transparent', flexShrink:0, textAlign:'center', minWidth:76 }}>
              <div style={{ fontSize:13, fontWeight:700, color:sel?tc:'#94a3b8', fontFamily:'monospace' }}>{icao}</div>
              <div style={{ fontSize:9, color:sel?tc:'#334155', marginTop:2, letterSpacing:'0.5px', textTransform:'uppercase' }}>{type.slice(0,3)}</div>
              {!hasData && <div style={{ width:5, height:5, borderRadius:'50%', background:'#334155', margin:'3px auto 0' }} />}
              {hasData  && <div style={{ width:5, height:5, borderRadius:'50%', background:sel?tc:'#475569', margin:'3px auto 0' }} />}
            </div>
          );
        })}
        {wxAirports.length === 0 && (
          <div style={{ padding:'12px 16px', fontSize:12, color:'#475569', alignSelf:'center' }}>No WX airports found in plan</div>
        )}
        {/* SIGMET tab */}
        <div onClick={() => { setSelIcao('__sigmet__'); }}
          style={{ padding:'10px 14px', cursor:'pointer', borderBottom:`2px solid ${selIcao==='__sigmet__'?'#ef4444':'transparent'}`, background:selIcao==='__sigmet__'?'rgba(239,68,68,0.08)':'transparent', flexShrink:0, textAlign:'center', minWidth:76, marginLeft:'auto' }}>
          <div style={{ fontSize:12, fontWeight:700, color:selIcao==='__sigmet__'?'#ef4444':'#475569' }}>⚠</div>
          <div style={{ fontSize:9, color:selIcao==='__sigmet__'?'#ef4444':'#334155', marginTop:2 }}>SIGMET</div>
        </div>
      </div>

      {/* METAR / TAF tabs */}
      {selIcao && selIcao !== '__sigmet__' && (
        <div style={{ display:'flex', background:'#0f172a', borderBottom:'1px solid #1e293b', flexShrink:0, alignItems:'center' }}>
          {[{id:'metar',label:'METAR / SPECI'},{id:'taf',label:'TAF'}].map(t => (
            <div key={t.id} onClick={() => setWxTab(t.id)}
              style={{ padding:'9px 20px', fontSize:11, fontWeight:600, cursor:'pointer', color:wxTab===t.id?'#38bdf8':'#475569', borderBottom:wxTab===t.id?'2px solid #38bdf8':'2px solid transparent' }}>
              {t.label}
            </div>
          ))}
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap:6, padding:'6px 12px', alignItems:'center' }}>
            {[{color:COLORS.green,label:'Normal'},{color:COLORS.yellow,label:'Caution'},{color:COLORS.orange,label:'Warning'},{color:COLORS.red,label:'Critical'}].map((c,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:3 }}>
                <div style={{ width:6, height:6, borderRadius:3, background:c.color }}/>
                <span style={{ fontSize:9, color:'#334155' }}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'14px 12px' }}>

        {/* SIGMET */}
        {selIcao === '__sigmet__' && (
          <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', borderBottom:'1px solid #334155', fontSize:11, fontWeight:600, color:'#ef4444' }}>⚠️ SIGMET / FIR</div>
            <div style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:12, lineHeight:1.9, color:sigmet&&!sigmet.includes('No SIGMETs')?'#fbbf24':'#475569', whiteSpace:'pre-wrap' }}>
              {sigmet || 'No SIGMET data in plan'}
            </div>
          </div>
        )}

        {/* Airport WX */}
        {selIcao && selIcao !== '__sigmet__' && selApt && (
          <div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:13, fontWeight:700, color:typeColor(selApt.type), fontFamily:'monospace' }}>
                {selIcao}
              </div>
              <div style={{ fontSize:11, color:'#475569', marginTop:2 }}>
                <span style={{ color:typeColor(selApt.type), marginRight:8, fontWeight:600 }}>{selApt.type}</span>
                {selApt.name}
              </div>
              {isLive && <div style={{ fontSize:10, color:'#4ade80', marginTop:2 }}>● Live data</div>}
            </div>

            {wxTab === 'metar' && (
              <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden' }}>
                <div style={{ padding:'8px 14px', borderBottom:'1px solid #334155', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1px' }}>METAR / SPECI</div>
                <div style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:12, lineHeight:2 }}>
                  {selWx.metar.length > 0
                    ? selWx.metar.map((m,i) => <div key={i}><ColoredWeather text={m}/></div>)
                    : <span style={{ color:'#475569', fontStyle:'italic' }}>No METAR found</span>
                  }
                </div>
              </div>
            )}

            {wxTab === 'taf' && (
              <div style={{ background:'#1e293b', borderRadius:12, border:'1px solid #334155', overflow:'hidden' }}>
                <div style={{ padding:'8px 14px', borderBottom:'1px solid #334155', fontSize:10, color:'#38bdf8', fontWeight:600, letterSpacing:'1px' }}>TAF</div>
                <div style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:12, lineHeight:2 }}>
                  {selWx.taf.length > 0
                    ? selWx.taf.map((t,i) => <div key={i}><ColoredWeather text={t}/></div>)
                    : <span style={{ color:'#475569', fontStyle:'italic' }}>No TAF found</span>
                  }
                </div>
              </div>
            )}
          </div>
        )}

        {!rawText && (
          <div style={{ color:'#475569', fontSize:13, textAlign:'center', marginTop:24 }}>No plan data — activate a flight plan</div>
        )}
      </div>
    </div>
  );
}

// ─── EFP Main ─────────────────────────────────────────────────
function EFP({ setStatus, activePlan, rawText = '' }) {
  const [activeTab, setActiveTab] = usePersistedState('efb_efp_activeTab', 'ofp');
  const [seenTabs,  setSeenTabs]  = usePersistedState('efb_efp_seenTabs',  []);

  useEffect(() => {
    if (seenTabs.includes(activeTab)) return;
    const t = setTimeout(() => setSeenTabs(prev => [...prev, activeTab]), 1000);
    return () => clearTimeout(t);
  }, [activeTab]); // eslint-disable-line

  useEffect(() => {
    if (!setStatus) return;
    if (seenTabs.length >= ALL_TABS.length) setStatus('green');
    else if (seenTabs.length > 0)           setStatus('amber');
    else                                    setStatus('pending');
  }, [seenTabs]); // eslint-disable-line

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#0f172a' }}>
      {/* Tabs */}
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'1px solid #334155', flexShrink:0 }}>
        {[{id:'ofp',label:'📋 OFP'},{id:'wxr',label:'🌤 WXR'}].map(t => (
          <div key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:'12px 24px', fontSize:13, fontWeight:600, cursor:'pointer', color:activeTab===t.id?'#38bdf8':'#475569', borderBottom:activeTab===t.id?'2px solid #38bdf8':'2px solid transparent', display:'flex', alignItems:'center', gap:6 }}>
            {t.label}
            {seenTabs.includes(t.id) && <span style={{ width:5, height:5, borderRadius:'50%', background:'#4ade80', display:'inline-block' }} />}
          </div>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ padding:'8px 14px', display:'flex', alignItems:'center' }}>
          <span style={{ fontSize:11, color:'#334155', fontFamily:'monospace' }}>
            {activePlan ? `${activePlan.dep}→${activePlan.dest}` : 'No plan'}
          </span>
        </div>
      </div>

      {activeTab === 'ofp' && <OFPView activePlan={activePlan} rawText={rawText} />}
      {activeTab === 'wxr' && <WXRView activePlan={activePlan} rawText={rawText} />}
    </div>
  );
}

export default EFP;