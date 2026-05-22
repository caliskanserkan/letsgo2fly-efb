import React, { useEffect, useRef } from 'react';
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

export default function EnrouteMap({ waypoints = [], gpsPos, directTo = null }) {
  const wptCoords   = waypoints.filter(w => w.coord);
  const routeCoords = wptCoords.map(w => [w.coord.lat, w.coord.lon]);

  const center = (() => {
    if (gpsPos) return [gpsPos.lat, gpsPos.lon];
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
    if (span > 20) return 4; if (span > 10) return 5; if (span > 5) return 6; return 7;
  })();

  // Direct To çizgisi için koordinatları bul
  const dtFrom = directTo ? waypoints.find(w => w.uid === directTo.from) : null;
  const dtTo   = directTo ? waypoints.find(w => w.uid === directTo.to)   : null;
  const dtCoords = (dtFrom?.coord && dtTo?.coord)
    ? [[dtFrom.coord.lat, dtFrom.coord.lon], [dtTo.coord.lat, dtTo.coord.lon]]
    : null;

  return (
    <div style={{ flex:1, position:"relative", overflow:"hidden", minHeight:500 }}>
      <MapContainer center={center} zoom={zoom}
        style={{ width:"100%", height:"100%", background:"#e8f0f7" }}
        zoomControl attributionControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <TileLayer url={`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${OPENAIP_KEY}`} opacity={1.0} />
        {routeCoords.length >= 2 && <Polyline positions={routeCoords} pathOptions={{ color:"#38bdf8", weight:2, opacity:0.7, dashArray:"6 4" }} />}
        {dtCoords && <Polyline positions={dtCoords} pathOptions={{ color:"#f97316", weight:3, opacity:0.95, dashArray:"10 6" }} />}
        {dtCoords && dtFrom?.coord && (
          <CircleMarker center={[dtFrom.coord.lat, dtFrom.coord.lon]} radius={8}
            pathOptions={{ color:"#f97316", fillColor:"#f97316", fillOpacity:0.3, weight:2 }}>
            <Tooltip permanent direction="bottom" offset={[0,8]}>
              <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color:"#f97316" }}>DIR FROM</span>
            </Tooltip>
          </CircleMarker>
        )}
        {dtCoords && dtTo?.coord && (
          <CircleMarker center={[dtTo.coord.lat, dtTo.coord.lon]} radius={10}
            pathOptions={{ color:"#f97316", fillColor:"#f97316", fillOpacity:0.9, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}>
              <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#fff", background:"#f97316", padding:"1px 6px", borderRadius:3 }}>✈ DIRECT {dtTo.name}</span>
            </Tooltip>
          </CircleMarker>
        )}
        {wptCoords.filter(w => w.type === "wpt").map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={5} pathOptions={{ color:"#1e40af", fillColor:"#3b82f6", fillOpacity:1, weight:1.5 }}>
            <Tooltip permanent direction="top" offset={[0,-7]}><span style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color:"#fff", background:"rgba(30,64,175,0.92)", padding:"1px 5px", borderRadius:3, whiteSpace:"nowrap" }}>{w.name}</span></Tooltip>
          </CircleMarker>
        ))}
        {wptCoords.filter(w => w.type === "dep").map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={10} pathOptions={{ color:"#92400e", fillColor:"#fbbf24", fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}><span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#fbbf24", whiteSpace:"nowrap" }}>{w.name} DEP</span></Tooltip>
          </CircleMarker>
        ))}
        {wptCoords.filter(w => w.type === "dest").map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={10} pathOptions={{ color:"#166534", fillColor:"#4ade80", fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}><span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#4ade80", whiteSpace:"nowrap" }}>{w.name} DEST</span></Tooltip>
          </CircleMarker>
        ))}
        {gpsPos && (<>
          <CircleMarker center={[gpsPos.lat, gpsPos.lon]} radius={16} pathOptions={{ color:"#4ade80", fillColor:"#4ade80", fillOpacity:0.12, weight:2 }} />
          <CircleMarker center={[gpsPos.lat, gpsPos.lon]} radius={6} pathOptions={{ color:"#4ade80", fillColor:"#4ade80", fillOpacity:1, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-18]}><span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#4ade80" }}>✈ {gpsPos.lat.toFixed(4)}N {gpsPos.lon.toFixed(4)}E <span style={{ fontSize:9, color:"#86efac", marginLeft:6 }}>±{Math.round(gpsPos.acc)}m</span></span></Tooltip>
          </CircleMarker>
          <FlyTo pos={gpsPos} />
        </>)}
      </MapContainer>
      <div style={{ position:"absolute", bottom:16, left:8, zIndex:1000, background:"rgba(15,23,42,0.92)", borderRadius:8, padding:"6px 10px", border:"1px solid #1e293b", fontSize:10, fontFamily:"monospace" }}>
        {[{color:"#fbbf24",label:"DEP"},{color:"#4ade80",label:"DEST"},{color:"#3b82f6",label:"WPT"},{color:"#38bdf8",label:"ROUTE"},{color:"#4ade80",label:"✈ ACFT"},{color:"#f97316",label:"DIRECT"}].map(({color,label})=>(
          <div key={label} style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:color }} />
            <span style={{ color:"#94a3b8" }}>{label}</span>
          </div>
        ))}
      </div>
      {!gpsPos && (
        <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:1000, background:"rgba(15,23,42,0.95)", borderRadius:8, padding:"12px 24px", border:"2px solid #ef4444", fontSize:13, fontWeight:700, color:"#ef4444", fontFamily:"monospace", letterSpacing:1, textAlign:"center" }}>
          ⚠ NO GPS SIGNAL AVAIL
        </div>
      )}
    </div>
  );
}