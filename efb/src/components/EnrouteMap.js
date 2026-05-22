import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const OPENAIP_KEY = '66ac62cad2142cb2ace71952b74e7722';


import { Marker, Tooltip as LTooltip } from 'react-leaflet';
import L from 'leaflet';

function calcBearing(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function AircraftMarker({ pos, waypoints }) {
  const ahead = waypoints.find(w => w.coord && ['wpt','dest'].includes(w.type) &&
    (w.coord.lat !== pos.lat || w.coord.lon !== pos.lon));
  const heading = ahead ? calcBearing(pos.lat, pos.lon, ahead.coord.lat, ahead.coord.lon) : 0;

  const icon = L.divIcon({
    className: '',
    html: `<div style="transform:rotate(${heading}deg);width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 2 L20 14 L30 16 L20 18 L18 26 L16 24 L14 26 L12 18 L2 16 L12 14 Z" fill="#4ade80" stroke="#166534" stroke-width="1.5"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <Marker position={[pos.lat, pos.lon]} icon={icon}>
      <LTooltip permanent direction="top" offset={[0,-20]}>
        <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#4ade80" }}>
          ✈ {pos.lat.toFixed(4)}N {pos.lon.toFixed(4)}E
          <span style={{ fontSize:9, color:"#86efac", marginLeft:6 }}>±{Math.round(pos.acc)}m</span>
        </span>
      </LTooltip>
    </Marker>
  );
}

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
  const routeCoords = waypoints.filter(w => w.coord && ['dep','wpt','dest'].includes(w.type)).map(w => [w.coord.lat, w.coord.lon]);

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
        style={{ width:"100%", height:"100%", background:"#f0f4f8" }}
        zoomControl attributionControl={false}>
        <TileLayer url="https://ojvqdsqodpxkvpxvwgrm.supabase.co/functions/v1/tile-proxy?z={z}&x={x}&y={y}" opacity={1.0} />
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
        {wptCoords.filter(w => w.type === "alt").map(w => (
          <CircleMarker key={w.uid} center={[w.coord.lat, w.coord.lon]} radius={9} pathOptions={{ color:"#7c3aed", fillColor:"#a855f7", fillOpacity:0.85, weight:2 }}>
            <Tooltip permanent direction="top" offset={[0,-12]}><span style={{ fontFamily:"monospace", fontSize:11, fontWeight:700, color:"#c084fc", whiteSpace:"nowrap" }}>{w.name} DEST ALT</span></Tooltip>
          </CircleMarker>
        ))}
        {gpsPos && (<>
          <AircraftMarker pos={gpsPos} waypoints={waypoints} />
          <FlyTo pos={gpsPos} />
        </>)}
      </MapContainer>
      <div style={{ position:"absolute", bottom:16, left:8, zIndex:1000, background:"rgba(15,23,42,0.92)", borderRadius:8, padding:"6px 10px", border:"1px solid #1e293b", fontSize:10, fontFamily:"monospace" }}>
        {[{color:"#fbbf24",label:"DEP"},{color:"#4ade80",label:"DEST"},{color:"#3b82f6",label:"WPT"},{color:"#38bdf8",label:"ROUTE"},{color:"#4ade80",label:"✈ ACFT"},{color:"#f97316",label:"DIRECT"},{color:"#a855f7",label:"DEST ALT"}].map(({color,label})=>(
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