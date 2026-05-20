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
        let path = `active/${activePlan.id}.pdf`;
        const { data, error } = await supabase.storage.from('ofp-pdfs').createSignedUrl(path, 3600);
        if (error || !data?.signedUrl) {
          path = `archived/${activePlan.id}.pdf`;
          const { data: data2 } = await supabase.storage.from('ofp-pdfs').createSignedUrl(path, 3600);
          if (data2?.signedUrl) setPdfUrl(data2.signedUrl);
        } else {
          setPdfUrl(data.signedUrl);
        }
      } catch (e) { console.warn('PDF fetch:', e); }
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
        <iframe src={pdfUrl} style={{ flex:1, border:'none', background:'#fff' }} title="OFP PDF" />
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

// ─────────────────────────────────────────────────────────────
// CORE: Extract all WX page blocks from rawText
// Finds sections marked "WX Page N of M" (bottom-right of each WX page)
// Returns the combined text of all WX pages
// ─────────────────────────────────────────────────────────────
function extractWxPageBlocks(rawText) {
  if (!rawText) return '';

  // "WX Page 1 of 5" pattern — appears at the bottom right of each WX page
  const wxPagePattern = /WX\s+Page\s+(\d+)\s+of\s+(\d+)/gi;

  // Find all positions of WX Page markers
  const markers = [];
  let m;
  while ((m = wxPagePattern.exec(rawText)) !== null) {
    markers.push({ index: m.index, page: parseInt(m[1]), total: parseInt(m[2]) });
  }

  if (markers.length === 0) {
    // Fallback: try "WX for flight" header
    const fallbackIdx = rawText.search(/WX for (?:flight|Flight Group)/i);
    if (fallbackIdx !== -1) {
      const endIdx = rawText.search(/End of WX information/i);
      return rawText.slice(fallbackIdx, endIdx !== -1 ? endIdx + 50 : fallbackIdx + 50000);
    }
    // Last resort: return full text
    return rawText;
  }

  // Collect text between markers (each WX page content)
  // We take from a bit before each marker back to the previous marker
  let combined = '';
  for (let i = 0; i < markers.length; i++) {
    const start = i === 0 ? Math.max(0, markers[0].index - 15000) : markers[i - 1].index;
    const end   = markers[i].index + 30; // include the marker itself
    combined   += rawText.slice(start, end) + '\n';
  }

  console.log(`[WXR] Found ${markers.length} WX pages (of ${markers[0]?.total}), extracted ${combined.length} chars`);
  return combined;
}

// ─────────────────────────────────────────────────────────────
// Parse ALL airports from WX pages
// Matches: Departure / Destination / Alternate / Adequate /
//          En-route alternate / ERA / ETOPS / Flight group apt
// ─────────────────────────────────────────────────────────────
function parseAllWxAirports(rawText) {
  if (!rawText) return [];

  const wxBlock = extractWxPageBlocks(rawText);

  // Tam satırı yakala — örn: "Adequate airport LTBR - YEI - BURSA/YENİŞEHİR VAR E6 RWY 07L..."
  const re = /(?:(?:Departure|Destination|Alternate|Adequate|En[\s-]?route\s+alternate|ERA|ETOPS\s+\w+)\s+airport|Flight\s+group\s+apt)\s+([A-Z]{4})([^\n]*)/gi;

  const airports = [];
  const seen     = new Set();
  let m;

  while ((m = re.exec(wxBlock)) !== null) {
    const icao   = m[1].toUpperCase();
    const rest   = (m[2] || '').trim();
    const raw    = m[0].toLowerCase();
    let   type   = 'ADEQUATE';
    if      (/departure/.test(raw))               type = 'DEPARTURE';
    else if (/destination/.test(raw))             type = 'DESTINATION';
    else if (/alternate|era|en.?route/.test(raw)) type = 'ALTERNATE';
    else if (/etops/.test(raw))                   type = 'ETOPS';
    else if (/flight\s+group/.test(raw))          type = 'FLT GRP';

    if (!seen.has(icao)) {
      seen.add(icao);
      airports.push({ icao, type, header: rest ? `${icao} ${rest}` : icao });
    }
  }

  console.log('[WXR] parseAllWxAirports →', airports.map(a => `${a.icao}(${a.type})`));
  return airports;
}

// ─────────────────────────────────────────────────────────────
// Parse METAR/TAF for a specific ICAO from WX pages
// ─────────────────────────────────────────────────────────────
function parseIcaoWxFromRaw(rawText, icao) {
  if (!rawText || !icao) return { metar: [], taf: [] };

  const wxBlock = extractWxPageBlocks(rawText);

  // Find the airport section
  const pat = new RegExp(
    `(?:(?:Departure|Destination|Alternate|Adequate|En[\\s-]?route\\s+alternate|ERA|ETOPS\\s+\\w+)\\s+airport|Flight\\s+group\\s+apt)\\s+${icao}[^\\n]*\\n([\\s\\S]*?)` +
    `(?=(?:(?:Departure|Destination|Alternate|Adequate|En[\\s-]?route\\s+alternate|ERA|ETOPS\\s+\\w+)\\s+airport|Flight\\s+group\\s+apt)\\s+[A-Z]{4}|WX\\s+Page|WX messages|SIGMET|End of WX|$)`,
    'i'
  );

  const sec    = wxBlock.match(pat)?.[1] || '';
  const metars = [];
  const tafs   = [];
  let   inTaf  = false;

  for (const line of sec.split('\n')) {
    const l = line.trim();
    if (!l) { inTaf = false; continue; }
    if (/^(?:METAR|SPECI)\b/.test(l))      { metars.push(l); inTaf = false; }
    else if (/^TAF\b/.test(l))             { tafs.push(l);   inTaf = true;  }
    else if (inTaf && !/^(?:Departure|Destination|Alternate|Adequate|En[\s-]?route|ERA|ETOPS|Flight|WX|End|Page|No\s)/i.test(l)) {
      if (tafs.length) tafs[tafs.length - 1] += ' ' + l;
    }
  }

  return { metar: metars, taf: tafs };
}

// Parse WX header info
function parseWxHeader(rawText) {
  if (!rawText) return null;
  const m  = rawText.match(/WX for flight\s+([^\n(]+)/i);
  const ts = rawText.match(/WX search performed\s+([^\n]+)/i)?.[1]?.trim();
  // Also grab WX Page count
  const pg = rawText.match(/WX\s+Page\s+\d+\s+of\s+(\d+)/i);
  return { title: m?.[1]?.trim() || '', timestamp: ts || '', totalPages: pg?.[1] || null };
}

// Parse SIGMET
function parseSigmet(rawText) {
  if (!rawText) return '';
  const si = rawText.search(/SIGMET\(s\)\s+for|No SIGMETs found/i);
  const se = rawText.search(/End of WX information/i);
  return si !== -1 ? rawText.slice(si, se !== -1 ? se : si + 1000).trim() : '';
}

// ─────────────────────────────────────────────────────────────
// CORS proxy chain — tries each proxy in order
// ─────────────────────────────────────────────────────────────
async function fetchWithCorsChain(url) {
  const proxies = [
    // corsproxy.io — two url formats
    (u) => `https://corsproxy.io/?${u}`,
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
  ];
  for (const makeProxy of proxies) {
    const proxyUrl = makeProxy(url);
    try {
      const res = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!res.ok) { console.warn('[WXR]', proxyUrl, res.status); continue; }
      const text = await res.text();
      if (text && text.trim().length > 10) {
        console.log('[WXR] proxy OK:', proxyUrl.split('?')[0]);
        return text;
      }
    } catch (err) {
      console.warn('[WXR] proxy failed:', proxyUrl.split('?')[0], err.message);
    }
  }
  throw new Error('All CORS proxies failed — check network');
}

async function fetchLiveWx(icaoList) {
  if (!icaoList || icaoList.length === 0) return {};
  const ids     = icaoList.join(',');
  const results = {};

  // METAR
  try {
    const mResp = await fetch(`https://corsproxy.io/?https://aviationweather.gov/api/data/metar?ids=${ids}&format=raw&hours=3&taf=false`);
    const mText = await mResp.text();
    mText.trim().split('\n').filter(Boolean).forEach(line => {
      const l    = line.trim();
      const icao = l.split(' ')[0];
      if (icao && /^[A-Z]{4}$/.test(icao)) {
        if (!results[icao]) results[icao] = { metar: [], taf: [] };
        results[icao].metar.push(l);
      }
    });
    console.log('[WXR] METAR fetched for:', Object.keys(results));
  } catch (e) { console.error('[WXR] METAR fetch failed:', e.message); }

  // TAF
  try {
    const tResp = await fetch(`https://corsproxy.io/?https://aviationweather.gov/api/data/taf?ids=${ids}&format=raw`);
    const tText = await tResp.text();
    let cur = null;
    tText.trim().split('\n').filter(Boolean).forEach(line => {
      const l = line.trim();
      if (/^TAF\b/.test(l)) {
        const parts = l.split(/\s+/);
        const icao  = (parts[1] === 'AMD' || parts[1] === 'COR') ? parts[2] : parts[1];
        if (icao && /^[A-Z]{4}$/.test(icao)) {
          cur = icao;
          if (!results[icao]) results[icao] = { metar: [], taf: [] };
          results[icao].taf.push(l);
        }
      } else if (cur && l && results[cur]) {
        results[cur].taf[results[cur].taf.length - 1] += ' ' + l;
      }
    });
    console.log('[WXR] TAF fetched for:', Object.keys(results).filter(k => results[k].taf.length > 0));
  } catch (e) { console.error('[WXR] TAF fetch failed:', e.message); }

  return results;
}

// ─── WXR View ─────────────────────────────────────────────────
function WXRView({ activePlan, rawText }) {
  const wxAirports = useMemo(() => {
    const fromWx = parseAllWxAirports(rawText);
    if (fromWx.length > 0) return fromWx;
    const fallback = [];
    const addApt = (icaoRaw, type) => {
      const icao = icaoRaw?.split('/')[0]?.trim().toUpperCase();
      if (icao && /^[A-Z]{4}$/.test(icao)) fallback.push({ icao, type, name: '' });
    };
    addApt(activePlan?.dep,       'DEPARTURE');
    addApt(activePlan?.dest,      'DESTINATION');
    addApt(activePlan?.alternate, 'ALTERNATE');
    return fallback;
  }, [rawText, activePlan?.dep, activePlan?.dest, activePlan?.alternate]);

  const wxHeader = useMemo(() => parseWxHeader(rawText), [rawText]);
  const sigmet   = useMemo(() => parseSigmet(rawText),   [rawText]);

  const planWxMap = useMemo(() => {
    const map = {};
    wxAirports.forEach(({ icao }) => { map[icao] = parseIcaoWxFromRaw(rawText, icao); });
    return map;
  }, [rawText, wxAirports]);

  const [liveWxMap, setLiveWxMap] = usePersistedState('efb_wxr_live_map_v2', {});
  const [liveAt,    setLiveAt]    = usePersistedState('efb_wxr_live_at_v2',   '');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [selIcao,   setSelIcao]   = useState(null);
  const [wxTab,     setWxTab]     = useState('metar');

  useEffect(() => {
    if (wxAirports.length > 0 && !selIcao) setSelIcao(wxAirports[0].icao);
  }, [wxAirports, selIcao]);

  const doFetch = async () => {
    if (!wxAirports.length) return;
    setLoading(true); setError('');
    try {
      const live = await fetchLiveWx(wxAirports.map(a => a.icao));
      if (Object.keys(live).length === 0) throw new Error('No data returned from NOAA');
      setLiveWxMap(live);
      setLiveAt(new Date().toUTCString().slice(17, 25) + ' UTC');
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const getWx = (icao) => {
    const live = liveWxMap[icao];
    const plan = planWxMap[icao] || { metar: [], taf: [] };
    return { metar: live?.metar?.length ? live.metar : plan.metar, taf: live?.taf?.length ? live.taf : plan.taf };
  };

  const isLive = Object.keys(liveWxMap).length > 0;
  const selApt = wxAirports.find(a => a.icao === selIcao) || (selIcao === '__sigmet__' ? { icao:'__sigmet__', type:'' } : null);
  const selWx  = selIcao && selIcao !== '__sigmet__' ? getWx(selIcao) : { metar: [], taf: [] };

  const typeColor = (type) => {
    if (type === 'DEPARTURE')   return '#fbbf24';  // amber/sarı
    if (type === 'DESTINATION') return '#4ade80';  // yeşil
    if (type === 'ALTERNATE')   return '#fb923c';  // turuncu/amber
    return '#a78bfa';                              // mor — diğer hepsi
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0f172a' }}>

      {/* Top bar */}
      <div style={{ background:'#0f172a', borderBottom:'1px solid #1e293b', padding:'8px 14px', flexShrink:0, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ flex:1 }}>
          {wxHeader?.title && (
            <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', fontFamily:'monospace' }}>
              WX · <span style={{ color:'#38bdf8' }}>{wxHeader.title}</span>
              {wxHeader.totalPages && <span style={{ color:'#334155', marginLeft:6 }}>{wxHeader.totalPages} pages</span>}
            </div>
          )}
          {error && <div style={{ fontSize:10, color:'#ef4444', marginTop:2 }}>⚠ {error}</div>}
          {!error && (
            <div style={{ fontSize:10, color: isLive ? '#4ade80' : '#fbbf24', marginTop:2 }}>
              {isLive ? `● Live NOAA · ${liveAt}` : `◎ Plan briefing${wxHeader?.timestamp ? ' · ' + wxHeader.timestamp : ''}`}
            </div>
          )}
        </div>
        <button onClick={doFetch} disabled={loading || !wxAirports.length}
          style={{ background: loading ? '#1e293b' : '#4ade80', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, color: loading ? '#475569' : '#0f172a', cursor: loading ? 'default' : 'pointer', fontFamily:'inherit', flexShrink:0 }}>
          {loading ? '...' : '↻ Refresh'}
        </button>
      </div>

      {/* Body: scrollable list — her meydan alt alta */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        {wxAirports.map((apt) => {
          const { icao, type } = apt;
          const tc  = typeColor(type);
          const wx  = getWx(icao);
          return (
            <div key={icao} style={{ marginBottom:28 }}>
              {/* Meydan başlık — renkli tam satır */}
              <div style={{ marginBottom:8, paddingBottom:6, borderBottom:`1px solid ${tc}30` }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                  <span style={{ fontSize:9, fontWeight:700, color: tc, textTransform:'uppercase', letterSpacing:1, background:`${tc}18`, padding:'2px 8px', borderRadius:4 }}>{type}</span>
                  {isLive && liveWxMap[icao] && <span style={{ fontSize:9, color:'#4ade80', marginLeft:'auto' }}>● LIVE</span>}
                  {isLive && !liveWxMap[icao] && <span style={{ fontSize:9, color:'#fbbf24', marginLeft:'auto' }}>◎ PLAN</span>}
                </div>
                <div style={{ fontSize:13, fontWeight:700, color: tc, fontFamily:'monospace', lineHeight:1.5 }}>{apt.header || icao}</div>
              </div>
              {/* METAR */}
              {wx.metar.length > 0 && (
                <div style={{ fontFamily:'monospace', fontSize:12, lineHeight:1.9, marginBottom:6 }}>
                  {wx.metar.map((m, i) => <div key={i}><ColoredWeather text={m} /></div>)}
                </div>
              )}
              {/* TAF */}
              {wx.taf.length > 0 && (
                <div style={{ fontFamily:'monospace', fontSize:12, lineHeight:1.9, color:'#94a3b8', borderLeft:'2px solid #334155', paddingLeft:8 }}>
                  {wx.taf.map((t, i) => <div key={i}><ColoredWeather text={t} /></div>)}
                </div>
              )}
              {wx.metar.length === 0 && wx.taf.length === 0 && (
                <div style={{ fontSize:11, color:'#334155', fontStyle:'italic' }}>No WX data</div>
              )}
            </div>
          );
        })}
        {sigmet && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#ef4444', fontFamily:'monospace', marginBottom:6, paddingBottom:4, borderBottom:'1px solid #1e293b' }}>⚠ SIGMET / FIR</div>
            <div style={{ fontFamily:'monospace', fontSize:12, lineHeight:1.9, color: sigmet.includes('No SIGMETs') ? '#334155' : '#fbbf24', whiteSpace:'pre-wrap' }}>{sigmet}</div>
          </div>
        )}
        {wxAirports.length === 0 && !rawText && (
          <div style={{ color:'#334155', fontSize:13, textAlign:'center', marginTop:40 }}>No plan data — activate a flight plan</div>
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
      <div style={{ display:'flex', background:'#1e293b', borderBottom:'1px solid #334155', flexShrink:0 }}>
        {[{ id:'ofp', label:'📋 OFP' }, { id:'wxr', label:'🌤 WXR' }].map(t => (
          <div key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding:'12px 24px', fontSize:13, fontWeight:600, cursor:'pointer', color: activeTab === t.id ? '#38bdf8' : '#475569', borderBottom: activeTab === t.id ? '2px solid #38bdf8' : '2px solid transparent', display:'flex', alignItems:'center', gap:6 }}>
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