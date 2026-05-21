import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from 'react-leaflet';
import { useMap } from 'react-leaflet';
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
  if (type === 'DEPARTURE')   return { color:'#fbbf24', fill:'#fbbf24', r:10 };
  if (type === 'DESTINATION') return { color:'#4ade80', fill:'#4ade80', r:10 };
  if (type === 'ALTERNATE')   return { color:'#fb923c', fill:'#fb923c', r:8  };
  return                             { color:'#a78bfa', fill:'#a78bfa', r:7  };
}

export default function EnrouteMap({ waypoints = [], wxAirports = [], gpsPos, liveWxMap = {} }) {

  const wptCoords = waypoints.filter(w => w.coord);
  const routeCoords = wptCoords.map(w => [w.coord.lat, w.coord.lon]);

  console.log('[ERM] total:', waypoints.length, 'with coord:', wptCoords.length);

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

        {/* Dark base */}
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        {/* OpenAIP */}
        <TileLayer
          url={`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${OPENAIP_KEY}`}
          opacity={0.85}
        />

        {/* Route line */}
        {routeCoords.length >= 2 && (
          <Polyline positions={routeCoords}
            pathOptions={{ color:'#38bdf8', weight:2, opacity:0.7, dashArray:'6 4' }} />
        )}

        {/* Enroute WPTs — blue circle + white label */}
        {wptCoords.filter(w => w.type === 'wpt').map(w => (
          <CircleMarker key={w.uid}
            center={[w.coord.lat, w.coord.lon]}
            radius={5}
            pathOptions={{ color:'#1e40af', fillColor:'#3b82f6', fillOpacity:1, weight:1.5 }}>
            <Tooltip permanent direction="top" offset={[0,-7]}
              className="efb-wpt-tooltip">
              <span style={{
                fontFamily:'monospace', fontSize:10, fontWeight:700,
                color:'#fff', background:'rgba(56,130,246,0.9)',
                padding:'1px 5px', borderRadius:3, whiteSpace:'nowrap'
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
              <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#fbbf24'}}>
                {w.name} · DEP
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
              <span style={{fontFamily:'monospace',fontSize:11,fontWeight:700,color:'#4ade80'}}>
                {w.name} · DEST
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* WX Airports (ALT, ADEQ etc) */}
        {wxAirports.map(apt => {
          const wpt = waypoints.find(w => w.name === apt.icao || w.uid === apt.icao);
          if (!wpt?.coord) return null;
          const s = aptStyle(apt.type);
          return (
            <CircleMarker key={apt.icao}
              center={[wpt.coord.lat, wpt.coord.lon]}
              radius={s.r}
              pathOptions={{ color:s.color, fillColor:s.fill, fillOpacity:0.85, weight:2 }}>
              <Tooltip permanent direction="top" offset={[0,-10]}>
                <span style={{fontFamily:'monospace',fontSize:10,fontWeight:700,color:s.color}}>
                  {apt.icao} · {apt.type.slice(0,3)}
                  {liveWxMap[apt.icao] && ' ●'}
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
              <Tooltip permanent direction="top" offset={[0,-12]}>
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
        }}>
          GPS signal not available
        </div>
      )}
    </div>
  );
}