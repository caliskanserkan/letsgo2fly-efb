import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const OPENAIP_KEY = '66ac62cad2142cb2ace71952b74e7722';
const SUPABASE_URL = 'https://ojvqdsqodpxkvpxvwgrm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f';

function FlyTo({ pos }) {
  const map = useMap();
  const lastPos = useRef(null);
  useEffect(() => {
    if (!pos) return;
    if (!lastPos.current) map.setView([pos.lat, pos.lon], map.getZoom());
    lastPos.current = pos;
  }, [pos, map]);
  return null;
}

function aptStyle(type) {
  if (type === 'DEPARTURE')   return { color:'#fbbf24', fill:'#fbbf24', r:11 };
  if (type === 'DESTINATION') return { color:'#4ade80', fill:'#4ade80', r:11 };
  if (type === 'ALTERNATE')   return { color:'#fb923c', fill:'#fb923c', r:9  };
  return                             { color:'#c084fc', fill:'#a855f7', r:8  };
}

async function fetchFromOpenAIP(icao) {
  try {
    const res = await fetch(
      `https://api.core.openaip.net/api/airports?page=1&limit=5&icaoCode=${icao}`,
      { headers: { 'x-openaip-api-key': OPENAIP_KEY } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.items?.[0];
    if (!item) return null;
    const [lon, lat] = item.geometry?.coordinates || [];
    if (lat == null || lon == null) return null;
    return { lat, lon, name: item.name || icao };
  } catch { return null; }
}

export default function EnrouteMap({ waypoints = [], wxAirports = [], gpsPos, liveWxMap = {} }) {
  const [aptCoords, setAptCoords] = useState({});
  const fetchedRef = useRef(new Set());

  useEffect(() => {
    if (!wxAirports.length) return;
    const toFetch = wxAirports.filter(apt => {
      const inWpts = waypoints.find(w => w.name === apt.icao && w.coord);
      return !inWpts && !aptCoords[apt.icao] && !fetchedRef.current.has(apt.icao);
    });
    if (!toFetch.length) return;
    toFetch.forEach(a => fetchedRef.current.add(a.icao));
    const icaos = toFetch.map(a => a.icao);
    console.log('[ERM] fetching coords for:', icaos);
    fetch(
      `${SUPABASE_URL}/rest/v1/airports?icao=in.(${icaos.join(',')})&select=icao,lat,lon,name`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    .then(r => r.json())
    .then(async rows => {
      const found = {};
      (rows || []).forEach(r => {
        if (r.icao && r.lat != null && r.lon != null)
          found[r.icao] = { lat: parseFloat(r.lat), lon: parseFloat(r.lon), name: r.name || r.icao };
      });
      console.log('[ERM] Supabase found:', Object.keys(found));
      const stillMissing = icaos.filter(ic => !found[ic]);
      if (stillMissing.length) {
        console.log('[ERM] OpenAIP fallback for:', stillMissing);
        const results = await Promise.allSettled(stillMissing.map(ic => fetchFromOpenAIP(ic)));
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) found[stillMissing[i]] = r.value;
        });
      }
      setAptCoords(prev => ({ ...prev, ...found }));
    })
    .catch(e => console.warn('[ERM] Supabase error:', e));
  }, [wxAirports, waypoints]); // eslint-disable-line

  const wptCoords   = waypoints.filter(w => w.coord);
  const routeCoords = wptCoords.map(w => [w.coord.lat, w.coord.lon]);

  const center = (() => {
    if (routeCoords.length > 0) {
      const lats = routeCoords.map(c => c[0]);
      const lons = routeCoords.map(c => c[1]);
      return [(Math.min(...lats)+Math.max(...lats))/2, (Math.min(...lons)+Math.max(...lons))/2];
    }
    return [39.0, 35.0];
  })();

  const zoom = (() => {
    if (routeCoords.length < 2) return 6;
    const lats = routeCoords.map(c => c[0]);
    const lons = routeCoords.map(c => c[1]);
    const span = Math.max(Math.max(...lats)-Math.min(...lats), Math.max(...lons)-Math.min(...lons));
    if (span > 20) return 4;
    if (span > 10) return 5;
    if (span > 5)  return 6;
    return 7;
  })();

  const wxToShow = wxAirports.map(apt => {
    const wpt   = waypoints.find(w => w.name === apt.icao && w.coord);
    const coord = wpt?.coord || aptCoords[apt.icao];
    return { ...apt, coord };
  }).filter(a => a.coord);

  console.log('[ERM] wxToShow:', wxToShow.length, '/', wxAirports.length);

  return (
    <div style={{ flex:1, position:'relative', overflow:'hidden', minHeight:500 }}>
      <MapContainer center={center} zoom={zoom}
        style={{ width:'100%', height:'100%', background:'#0f172a' }}
        zoomControl attributionControl={false}>

        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <TileLayer
          url={`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${OPENAIP_KEY}`}
          opacity={0.85}
        />

        {routeCoords.length >= 2 && (
          <Polyline positions={routeCoords}
            pathOptions={{ color:'#38bdf8', weight:2, opacity:0.7, dashArray:'6 4' }} />
        )}

        {wxToShow.map(apt => {
          const s = aptStyle(apt.type);
          const hasLive = !!liveWxMap[apt.icao];
          return (
            <CircleMarker key={`wx_${apt.icao}`}
              center={[apt.coord.lat, apt.coord.lon]}
              radius={s.r}
              pathOptions={{ color:s.color, fillColor:s.fill, fillOpacity:hasLive?0.95:0.55, weight:2 }}>
              <Tooltip permanent direction="top" offset={[0,-(s.r+3)]}>
                <span style={{ fontFamily:'monospace', fontSize:10, fontWeight:700, color:s.color, whiteSpace:'nowrap', textShadow:'0 0 4px rgba(0,0,0,0.9)' }}>
                  {apt.icao}<span style={{ fontSize:8, opacity:0.7, marginLeft:3 }}>{apt.type?.slice(0,3)}</span>
                  {hasLive && <span style={{ color:'#4ade80', marginLeft:3 }}>●</span>}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {wptCoords.filter(w => w.type === 'wpt').map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={5}
            pathOptions={{ color:'#1e40af', fillColor:'#3b82f6', fillOpacity:1, weight:1.5 }}>
            <Tooltip permanent direction="top" offset={[0,-7]}>
              <span style={{ fontFamily:'monospace', fontSize:10, fontWeight:700, color:'#fff', background:'rgba(30,64,175,0.92)', padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap' }}>{w.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {wptCoords.filter(w => w.type === 'dep').map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={10}
            pathOptions={{ color:'#92400e', fillColor:'#fbbf24', fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}>
              <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'#fbbf24', whiteSpace:'nowrap' }}>{w.name} DEP</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {wptCoords.filter(w => w.type === 'dest').map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={10}
            pathOptions={{ color:'#166534', fillColor:'#4ade80', fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}>
              <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'#4ade80', whiteSpace:'nowrap' }}>{w.name} DEST</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {gpsPos && (
          <>
            <CircleMarker center={[gpsPos.lat, gpsPos.lon]} radius={14}
              pathOptions={{ color:'#4ade80', fillColor:'#4ade80', fillOpacity:0.15, weight:2 }} />
            <CircleMarker center={[gpsPos.lat, gpsPos.lon]} radius={5}
              pathOptions={{ color:'#4ade80', fillColor:'#4ade80', fillOpacity:1, weight:2 }}>
              <Tooltip permanent direction="top" offset={[0,-16]}>
                <span style={{ fontFamily:'monospace', fontSize:10, fontWeight:700, color:'#4ade80' }}>
                  ✈ {gpsPos.lat.toFixed(3)}N {gpsPos.lon.toFixed(3)}E
                </span>
              </Tooltip>
            </CircleMarker>
            <FlyTo pos={gpsPos} />
          </>
        )}
      </MapContainer>

      <div style={{ position:'absolute', bottom:16, left:8, zIndex:1000, background:'rgba(15,23,42,0.92)', borderRadius:8, padding:'6px 10px', border:'1px solid #1e293b', fontSize:10, fontFamily:'monospace' }}>
        {[
          { color:'#fbbf24', label:'DEP' },
          { color:'#4ade80', label:'DEST' },
          { color:'#fb923c', label:'ALT' },
          { color:'#c084fc', label:'WX ADEQ' },
          { color:'#3b82f6', label:'WPT' },
          { color:'#38bdf8', label:'ROUTE' },
          { color:'#4ade80', label:'✈ ACFT' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:color }} />
            <span style={{ color:'#94a3b8' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{ position:'absolute', top:8, right:8, zIndex:1000, background:'rgba(15,23,42,0.85)', borderRadius:6, padding:'3px 10px', border:'1px solid #334155', fontSize:9, color:'#c084fc', fontFamily:'monospace' }}>
        WX: {wxToShow.length}/{wxAirports.length} airports
      </div>

      {!gpsPos && (
        <div style={{ position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:1000, background:'rgba(15,23,42,0.85)', borderRadius:6, padding:'3px 10px', border:'1px solid #334155', fontSize:9, color:'#475569', fontFamily:'monospace' }}>
          GPS signal not available
        </div>
      )}
    </div>
  );
}
