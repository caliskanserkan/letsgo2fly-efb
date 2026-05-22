import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const OPENAIP_KEY = '66ac62cad2142cb2ace71952b74e7722';

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
  if (type === 'DEPARTURE')   return { color:'#fbbf24', r:10 };
  if (type === 'DESTINATION') return { color:'#4ade80', r:10 };
  if (type === 'ALTERNATE')   return { color:'#fb923c', r:8  };
  return                             { color:'#a78bfa', r:7  };
}

export default function EnrouteMap({ waypoints = [], wxAirports = [], gpsPos, liveWxMap = {} }) {

  const [aptCoords, setAptCoords] = useState({});
  const [missingApts, setMissingApts] = useState([]);

  const SUPABASE_URL = 'https://ojvqdsqodpxkvpxvwgrm.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f';

  useEffect(() => {
    if (!wxAirports.length) return;
    const missing = wxAirports.filter(apt => {
      const inWpts = waypoints.find(w => w.name === apt.icao && w.coord);
      return !inWpts && !aptCoords[apt.icao];
    });
    if (!missing.length) return;
    const icaos = missing.map(a => a.icao).join(',');
    fetch(`${SUPABASE_URL}/rest/v1/airports?icao=in.(${icaos})&select=icao,lat,lon,name`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    .then(r => r.json())
    .then(rows => {
      const found = new Set(rows.map(r => r.icao));
      const notFound = missing.filter(a => !found.has(a.icao));
      if (notFound.length) setMissingApts(notFound.map(a => a.icao));
      const coords = {};
      rows.forEach(r => { coords[r.icao] = { lat: r.lat, lon: r.lon, name: r.name }; });
      setAptCoords(prev => ({ ...prev, ...coords }));
    })
    .catch(() => {});
  }, [wxAirports, waypoints]); // eslint-disable-line

  const wptCoords = waypoints.filter(w => w.coord);
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

        {/* Route line */}
        {routeCoords.length >= 2 && (
          <Polyline positions={routeCoords}
            pathOptions={{ color:'#38bdf8', weight:2, opacity:0.7, dashArray:'6 4' }} />
        )}

        {/* Enroute WPTs — blue */}
        {wptCoords.filter(w => w.type === 'wpt').map(w => (
          <CircleMarker key={w.uid}
            center={[w.coord.lat, w.coord.lon]}
            radius={5}
            pathOptions={{ color:'#1e40af', fillColor:'#3b82f6', fillOpacity:1, weight:1.5 }}>
            <Tooltip permanent direction="top" offset={[0,-7]}>
              <span style={{
                fontFamily:'monospace', fontSize:10, fontWeight:700,
                color:'#fff', background:'rgba(30,64,175,0.92)',
                padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap',
                boxShadow:'none', border:'none'
              }}>{w.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* DEP */}
        {wptCoords.filter(w => w.type === 'dep').map(w => (
          <CircleMarker key={w.uid}
            center={[w.coord.lat, w.coord.lon]}
            radius={10}
            pathOptions={{ color:'#92400e', fillColor:'#fbbf24', fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}>
              <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#fbbf24',whiteSpace:'nowrap'}}>
                {w.name} DEP
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* DEST */}
        {wptCoords.filter(w => w.type === 'dest').map(w => (
          <CircleMarker key={w.uid}
            center={[w.coord.lat, w.coord.lon]}
            radius={10}
            pathOptions={{ color:'#166534', fillColor:'#4ade80', fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}>
              <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#4ade80',whiteSpace:'nowrap'}}>
                {w.name} DEST
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* WX Airports — coord from waypoints OR from OpenAIP cache */}
        {wxAirports.map(apt => {
          // Try waypoints first, then OpenAIP cache
          const wpt = waypoints.find(w => w.name === apt.icao && w.coord);
          const coord = wpt?.coord || aptCoords[apt.icao];
          if (!coord) return null;
          const s = aptStyle(apt.type);
          const hasLive = !!liveWxMap[apt.icao];
          return (
            <CircleMarker key={apt.icao}
              center={[coord.lat, coord.lon]}
              radius={s.r}
              pathOptions={{ color:s.color, fillColor:s.color, fillOpacity:hasLive?0.9:0.5, weight:2 }}>
              <Tooltip permanent direction="top" offset={[0,-s.r-2]}>
                <span style={{
                  fontFamily:'monospace', fontSize:10, fontWeight:700,
                  color:s.color, whiteSpace:'nowrap',
                  textShadow:'0 0 3px rgba(0,0,0,0.8)'
                }}>
                  {apt.icao}{hasLive?' ●':''}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}

        {/* Aircraft */}
        {gpsPos && (
          <>
            <CircleMarker center={[gpsPos.lat, gpsPos.lon]} radius={14}
              pathOptions={{ color:'#4ade80', fillColor:'#4ade80', fillOpacity:0.15, weight:2 }} />
            <CircleMarker center={[gpsPos.lat, gpsPos.lon]} radius={5}
              pathOptions={{ color:'#4ade80', fillColor:'#4ade80', fillOpacity:1, weight:2 }}>
              <Tooltip permanent direction="top" offset={[0,-16]}>
                <span style={{fontFamily:'monospace',fontSize:10,fontWeight:700,color:'#4ade80'}}>
                  ✈ {gpsPos.lat.toFixed(3)}N {gpsPos.lon.toFixed(3)}E
                </span>
              </Tooltip>
            </CircleMarker>
            <FlyTo pos={gpsPos} />
          </>
        )}
      </MapContainer>

      {/* Legend */}
      <div style={{
        position:'absolute', bottom:16, left:8, zIndex:1000,
        background:'rgba(15,23,42,0.92)', borderRadius:8, padding:'6px 10px',
        border:'1px solid #1e293b', fontSize:10, fontFamily:'monospace'
      }}>
        {[
          { color:'#fbbf24', label:'DEP' },
          { color:'#4ade80', label:'DEST' },
          { color:'#fb923c', label:'ALT' },
          { color:'#a78bfa', label:'ADEQ' },
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

      {!gpsPos && (
        <div style={{
          position:'absolute', top:8, left:'50%', transform:'translateX(-50%)', zIndex:1000,
          background:'rgba(15,23,42,0.85)', borderRadius:6, padding:'3px 10px',
          border:'1px solid #334155', fontSize:9, color:'#475569', fontFamily:'monospace'
        }}>GPS signal not available</div>
      )}
    </div>
  );
}