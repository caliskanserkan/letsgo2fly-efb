import React, { useState, useEffect, useMemo } from 'react';
import { parseWeatherText } from '../config/weatherRules';
import { usePersistedState } from '../hooks/usePersistedState';
// import { supabase } from '../supabaseClient';

const ALL_TABS = ['ofp', 'wxr', 'notam'];

// ─── OFP PDF Viewer ──────────────────────────────────────────
function OFPView({ rawText, activePlan }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activePlan?.id) return;
    setLoading(true);
    const fetchPdf = async () => {
      try {
        const resp = await fetch(
          'https://ojvqdsqodpxkvpxvwgrm.supabase.co/functions/v1/pdf-proxy?plan_id=' + activePlan.id,
          { headers: { 'Authorization': 'Bearer sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f' } }
        );
        if (resp.ok) { const d = await resp.json(); if (d.url) setPdfUrl(d.url); }
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
        <iframe src={`${pdfUrl}#view=FitH`} style={{ flex:1, border:'none', background:'#fff' }} title="OFP PDF" />
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

  const rwyMap = {}; airports.forEach(a => { const m = a.header && a.header.match(/RWY\s+([\dLRC\s/]+)/); if (m) { rwyMap[a.icao] = m[1].trim().split(/\s+/).filter(r => /^\d{2}[LRC]?$/.test(r)); } }); try { localStorage.setItem('efb_airport_rwys', JSON.stringify(rwyMap)); } catch(e) {}
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

async function saveWxToSupabase(planId, results) {
  if (!planId || !Object.keys(results).length) return;
  const rows = [];
  Object.entries(results).forEach(([icao, data]) => {
    if (data.metar.length) rows.push({ plan_id: String(planId), icao, type: 'METAR', raw_text: data.metar.join('\n') });
    if (data.taf.length)   rows.push({ plan_id: String(planId), icao, type: 'TAF',   raw_text: data.taf.join('\n')   });
    if (data.header)       rows.push({ plan_id: String(planId), icao, type: 'AIRPORT_INFO', raw_text: data.header });
  });
  try {
    await fetch('https://ojvqdsqodpxkvpxvwgrm.supabase.co/rest/v1/wx_snapshots', {
      method: 'POST',
      headers: {
        'apikey': 'sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f',
        'Authorization': 'Bearer sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(rows)
    });
    console.log('[WXR] snapshot saved, rows:', rows.length);
  } catch(e) { console.warn('[WXR] snapshot save failed:', e); }
}

async function fetchLiveWx(icaoList, planId = null) {
  if (!icaoList || icaoList.length === 0) return {};
  const ids     = icaoList.join(',');
  const results = {};

  // METAR
  try {
    const mResp = await fetch(`https://ojvqdsqodpxkvpxvwgrm.supabase.co/functions/v1/wx-proxy?ids=${ids}&type=metar`, {
      headers: { 'Authorization': 'Bearer sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f' }
    });
    if (!mResp.ok) throw new Error(`METAR HTTP ${mResp.status}`);
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
    const tResp = await fetch(`https://ojvqdsqodpxkvpxvwgrm.supabase.co/functions/v1/wx-proxy?ids=${ids}&type=taf`, {
      headers: { 'Authorization': 'Bearer sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f' }
    });
    if (!tResp.ok) throw new Error(`TAF HTTP ${tResp.status}`);
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

  if (planId) saveWxToSupabase(planId, results);
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

  const doFetch = async () => {
    if (!wxAirports.length) return;
    setLoading(true); setError('');
    try {
      const headers = {}; wxAirports.forEach(a => { if (a.header) headers[a.icao] = a.header; }); const live = await fetchLiveWx(wxAirports.map(a => a.icao), activePlan?.id, headers);
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


// ─── NOTAM Helpers ────────────────────────────────────────────
// Renk kurallari (oncelik: kirmizi > turuncu > sari > yesil > mavi)
const NOTAM_RULES = [
  { color: '#ef4444', words: ['CLOSED','CLSD','U/S','UNSERVICEABLE','NOT AVBL','NOT AVAILABLE','PROHIBITED','WITHDRAWN'] },
  { color: '#fb923c', words: ['RESTRICTED','LIMITED','CAUTION','WORK IN PROGRESS','WIP','CONSTRUCTION','MAINTENANCE'] },
  { color: '#fbbf24', words: ['TEMPORARY','TEMPO','TRIGGER','AMENDED','REVISED','NEW TODAY'] },
  { color: '#4ade80', words: ['AVBL','AVAILABLE','SERVICEABLE','OPERATIONAL','IN SERVICE'] },
  { color: '#38bdf8', words: ['RUNWAY','TAXIWAY','APRON','THR','STAND',' RWY',' TWY',' ILS',' DME',' VOR',' NDB'] },
];

function colorizeNotam(text) {
  if (!text) return [{ text: '', color: null }];
  const matches = [];
  NOTAM_RULES.forEach(rule => {
    rule.words.forEach(w => {
      const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let m;
      while ((m = re.exec(text)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, color: rule.color });
      }
    });
  });
  if (matches.length === 0) return [{ text, color: null }];
  matches.sort((a, b) => a.start - b.start || a.end - b.end);
  const parts = [];
  let cursor = 0;
  matches.forEach(mt => {
    if (mt.start < cursor) return;
    if (mt.start > cursor) parts.push({ text: text.slice(cursor, mt.start), color: null });
    parts.push({ text: text.slice(mt.start, mt.end), color: mt.color, bold: true });
    cursor = mt.end;
  });
  if (cursor < text.length) parts.push({ text: text.slice(cursor), color: null });
  return parts;
}

function ColoredNotam({ text }) {
  return (
    <span>
      {colorizeNotam(text).map((t, i) => (
        <span key={i} style={{ color: t.color || '#cbd5e1', fontWeight: t.bold ? 700 : 400 }}>{t.text}</span>
      ))}
    </span>
  );
}

function parseNotamsByAirport(rawText) {
  if (!rawText) return [];
  const startIdx = rawText.search(/NOTAMs\s+for\s+(?:Flight\s+Group|flight)/i);
  if (startIdx === -1) return [];
  let block = rawText.slice(startIdx);
  // NOTAM bolumunun sonunu bul — chart/flight plan verisi sizmasin
  const endM = block.search(/End of NOTAM information|Short ICAO ATC Flight Plans|WIND\/TEMPERATURE|PROGNOSTIC CHART/i);
  if (endM !== -1) block = block.slice(0, endM);
  const aptRe = /(?:Flight\s+group\s+apt|(?:Departure|Destination|Alternate|Adequate)\s+airport(?:\(s\))?)\s+([A-Z]{4})\s*-\s*([^\n]*?)(?:\((?:I+,?)+\))?\s*\n([\s\S]*?)(?=(?:Flight\s+group\s+apt|(?:Departure|Destination|Alternate|Adequate)\s+airport(?:\(s\))?)\s+[A-Z]{4}\s*-|$)/gi;
  const airports = [];
  let m;
  while ((m = aptRe.exec(block)) !== null) {
    const icao = m[1].toUpperCase();
    const header = `${icao} - ${(m[2] || '').trim()}`;
    const body = m[3] || '';
    const notams = [];
    const nRe = /\|#\d+\|[-\s]*(?:\((?:I+,?)+\))?\s*([\s\S]*?)(?=\|#\d+\||$)/g;
    let nm;
    while ((nm = nRe.exec(body)) !== null) {
      const chunk = nm[1].trim();
      if (!chunk) continue;
      const idMatch = chunk.match(/^([A-Z]\d{3,4}\/\d{2})\s+(NOTAM[NRC])\s*(?:\[([^\]]+)\])?/);
      const notamNo = idMatch?.[1] || '';
      const tag = idMatch?.[3]?.trim() || '';
      const eMatch = chunk.match(/\bE\)\s*([\s\S]*?)(?=\n\s*[A-Z]\)\s|NOTAMs?\s+Page|End of NOTAM|Short ICAO|Total Pages|$)/);
      let eText = eMatch?.[1]?.trim().replace(/\s+/g, ' ') || '';
      // Guvenlik: cok uzun (>500 char) ise muhtemelen tasma — ilk cumleye kes
      if (eText.length > 500) eText = eText.slice(0, 500) + '…';
      const qMatch = chunk.match(/\bQ\)\s*([^\n]+)/);
      const qText = qMatch?.[1]?.trim() || '';
      const bMatch = chunk.match(/\bB\)\s*(\d{10})/);
      const cMatch = chunk.match(/\bC\)\s*(\d{10}|PERM)/);
      notams.push({ notamNo, tag, eText, qText, from: bMatch?.[1] || '', to: cMatch?.[1] || '' });
    }
    if (notams.length) airports.push({ icao, header, notams });
  }
  return airports;
}

function fmtNotamTime(s) {
  if (!s) return '';
  if (s === 'PERM') return 'PERM';
  if (s.length !== 10) return s;
  return `${s.slice(4,6)}/${s.slice(2,4)} ${s.slice(6,8)}:${s.slice(8,10)}Z`;
}

function NOTAMView({ rawText }) {
  const airports = useMemo(() => parseNotamsByAirport(rawText), [rawText]);
  const totalNotams = useMemo(() => airports.reduce((s, a) => s + a.notams.length, 0), [airports]);

  if (!rawText) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, padding:24, background:'#0f172a' }}>
        <span style={{ fontSize:40 }}>📢</span>
        <div style={{ fontSize:14, color:'#475569', textAlign:'center' }}>No plan data — activate a flight plan</div>
      </div>
    );
  }

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#0f172a' }}>
      <div style={{ background:'#0f172a', borderBottom:'1px solid #1e293b', padding:'8px 14px', flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#94a3b8', fontFamily:'monospace' }}>
          NOTAM · <span style={{ color:'#38bdf8' }}>{airports.length} airports</span>
          <span style={{ color:'#334155', marginLeft:6 }}>{totalNotams} notams</span>
        </div>
        <div style={{ fontSize:9, color:'#475569', marginTop:3, display:'flex', gap:10, flexWrap:'wrap' }}>
          <span style={{ color:'#ef4444' }}>● Closed/US</span>
          <span style={{ color:'#fb923c' }}>● Restricted</span>
          <span style={{ color:'#fbbf24' }}>● Temp/Trigger</span>
          <span style={{ color:'#4ade80' }}>● Available</span>
          <span style={{ color:'#38bdf8' }}>● Infra</span>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
        {airports.length === 0 && (
          <div style={{ color:'#334155', fontSize:13, textAlign:'center', marginTop:40 }}>No NOTAMs found in plan data</div>
        )}
        {airports.map((apt) => (
          <div key={apt.icao} style={{ marginBottom:28 }}>
            <div style={{ marginBottom:10, paddingBottom:6, borderBottom:'1px solid #38bdf830' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#38bdf8', fontFamily:'monospace', lineHeight:1.5 }}>{apt.header}</div>
              <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>{apt.notams.length} NOTAM</div>
            </div>
            {apt.notams.map((n, i) => (
              <div key={i} style={{ marginBottom:12, padding:'10px 12px', background:'#111827', border:'1px solid #1e293b', borderRadius:8 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'#38bdf8', fontFamily:'monospace' }}>{n.notamNo}</span>
                  {n.tag && <span style={{ fontSize:9, color:'#64748b', background:'#1e293b', padding:'2px 6px', borderRadius:4 }}>{n.tag}</span>}
                  {(n.from || n.to) && (
                    <span style={{ fontSize:9, color:'#475569', marginLeft:'auto', fontFamily:'monospace' }}>
                      {fmtNotamTime(n.from)} → {fmtNotamTime(n.to)}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily:'monospace', fontSize:12, lineHeight:1.7 }}>
                  <ColoredNotam text={n.eText || n.qText} />
                </div>
              </div>
            ))}
          </div>
        ))}
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
        {[{ id:'ofp', label:'📋 OFP' }, { id:'wxr', label:'🌤 WXR' }, { id:'notam', label:'📢 NOTAM' }].map(t => (
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
      {activeTab === 'notam' && <NOTAMView rawText={rawText} />}
    </div>
  );
}

export default EFP;