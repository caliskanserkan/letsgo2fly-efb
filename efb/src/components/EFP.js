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
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#0f172a" }}>
      <div style={{ padding:"8px 14px", borderBottom:"1px solid #1e293b", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
        <div style={{ flex:1, fontSize:10, color: error ? "#ef4444" : isLive ? "#4ade80" : "#fbbf24" }}>
          {error ? "REFRESH FAILED" : isLive ? "LIVE " + liveAt : "PLAN BRIEFING " + (wxHeader && wxHeader.timestamp || "")}
          <span style={{ color:"#334155", marginLeft:8 }}>{wxAirports.length} airports</span>
        </div>
        <button onClick={doFetch} disabled={loading || !wxAirports.length}
          style={{ background: loading ? "#1e293b" : "#4ade80", border:"none", borderRadius:8, padding:"6px 16px", fontSize:12, fontWeight:700, color: loading ? "#475569" : "#0f172a", cursor: loading ? "default" : "pointer", fontFamily:"inherit" }}>
          {loading ? "..." : "Refresh"}
        </button>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>
        {wxAirports.map(function(apt) {
          var icao = apt.icao; var type = apt.type;
          var wx = getWx(icao);
          var tc = typeColor(type);
          return (
            <div key={icao} style={{ marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#f1f5f9", fontFamily:"monospace", marginBottom:6, paddingBottom:4, borderBottom:"1px solid #1e293b" }}>
                <span style={{ color: tc, marginRight:6 }}>{type.charAt(0)+type.slice(1).toLowerCase()} airport</span>
                <span>{icao}</span>
                {isLive && liveWxMap[icao] && <span style={{ fontSize:9, color:"#4ade80", marginLeft:8 }}>LIVE</span>}
              </div>
              <div style={{ fontFamily:"monospace", fontSize:12, lineHeight:2 }}>
                {wx.metar.length === 0 && wx.taf.length === 0
                  ? <div style={{ color:"#334155", fontStyle:"italic" }}>No WX data</div>
                  : <div>{wx.metar.map(function(m,i){return <div key={i}><ColoredWeather text={m} /></div>})}{wx.taf.map(function(t,i){return <div key={i}><ColoredWeather text={t} /></div>})}</div>
                }
              </div>
            </div>
          );
        })}
        {sigmet ? (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#ef4444", fontFamily:"monospace", marginBottom:6, paddingBottom:4, borderBottom:"1px solid #1e293b" }}>SIGMET / FIR</div>
            <div style={{ fontFamily:"monospace", fontSize:12, lineHeight:1.9, color: sigmet.includes("No SIGMETs") ? "#334155" : "#fbbf24", whiteSpace:"pre-wrap" }}>{sigmet}</div>
          </div>
        ) : null}
        {!rawText && <div style={{ color:"#334155", fontSize:13, textAlign:"center", marginTop:40 }}>No plan data</div>}
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