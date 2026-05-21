import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const OPENAIP_KEY = '66ac62cad2142cb2ace71952b74e7722';

// ─── GPS tracker — updates map center ────────────────────────
function FlyTo({ pos }) {
  const map = useMap();
  const lastPos = useRef(null);
  useEffect(() => {
    if (!pos) return;
    if (!lastPos.current) {
      map.setView([pos.lat, pos.lon], map.getZoom());
    }
    lastPos.current = pos;
  }, [pos, map]);
  return null;
}

// ─── Airport type colors ──────────────────────────────────────
function aptColor(type) {
  if (type === 'DEPARTURE')   return '#fbbf24'; // amber
  if (type === 'DESTINATION') return '#4ade80'; // green
  if (type === 'ALTERNATE')   return '#fb923c'; // orange
  return '#a78bfa';                              // purple
}

// ─── EnrouteMap ──────────────────────────────────────────────
export default function EnrouteMap({ waypoints = [], wxAirports = [], gpsPos, liveWxMap = {} }) {

  // Route coordinates from waypoints that have coords
  const routeCoords = useMemo(() =>
    waypoints.filter(w => w.coord).map(w => [w.coord.lat, w.coord.lon]),
  [waypoints]);

  // Map center — first waypoint or default Turkey
  const center = useMemo(() => {
    if (routeCoords.length > 0) {
      const lats = routeCoords.map(c => c[0]);
      const lons = routeCoords.map(c => c[1]);
      return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2];
    }
    return [39.0, 35.0]; // Turkey center
  }, [routeCoords]);

  // Zoom to fit route
  const zoom = useMemo(() => {
    if (routeCoords.length < 2) return 6;
    const lats = routeCoords.map(c => c[0]);
    const lons = routeCoords.map(c => c[1]);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    const lonSpan = Math.max(...lons) - Math.min(...lons);
    const span = Math.max(latSpan, lonSpan);
    if (span > 20) return 4;
    if (span > 10) return 5;
    if (span > 5)  return 6;
    return 7;
  }, [routeCoords]);

  // WX airports with coords from waypoints
  const wxAptMarkers = useMemo(() => {
    return wxAirports.map(apt => {
      // Try to find coord from waypoints
      const wpt = waypoints.find(w => w.name === apt.icao || w.uid === apt.icao);
      if (!wpt?.coord) return null;
      const hasLive = !!liveWxMap[apt.icao];
      const hasPlanData = !hasLive;
      return { ...apt, lat: wpt.coord.lat, lon: wpt.coord.lon, hasLive, hasPlanData };
    }).filter(Boolean);
  }, [wxAirports, waypoints, liveWxMap]);



  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ width: '100%', height: '100%', background: '#0f172a' }}
        zoomControl={true}
        attributionControl={false}

      >
        {/* OpenStreetMap base */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap &copy; CARTO"
        />

        {/* OpenAIP aviation layer */}
        <TileLayer
          url={`https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=${OPENAIP_KEY}`}
          opacity={0.8}
          attribution="&copy; OpenAIP"
        />

        {/* Route polyline */}
        {routeCoords.length >= 2 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{ color: '#38bdf8', weight: 2, opacity: 0.8, dashArray: '6 4' }}
          />
        )}

        {/* Waypoint dots */}
        {waypoints.filter(w => w.coord && w.type === 'wpt').map(w => (
          <CircleMarker
            key={w.uid}
            center={[w.coord.lat, w.coord.lon]}
            radius={3}
            pathOptions={{ color: '#334155', fillColor: '#475569', fillOpacity: 1, weight: 1 }}
          >
            <Tooltip permanent={false} direction="top">
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{w.name}</span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* DEP / DEST markers from waypoints */}
        {waypoints.filter(w => w.coord && (w.type === 'dep' || w.type === 'dest')).map(w => (
          <CircleMarker
            key={w.uid}
            center={[w.coord.lat, w.coord.lon]}
            radius={8}
            pathOptions={{
              color: w.type === 'dep' ? '#fbbf24' : '#4ade80',
              fillColor: w.type === 'dep' ? '#fbbf24' : '#4ade80',
              fillOpacity: 0.9,
              weight: 2
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
                {w.name} · {w.type === 'dep' ? 'DEP' : 'DEST'}
              </span>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* WX Airport markers */}
        {wxAptMarkers.map(apt => (
          <CircleMarker
            key={apt.icao}
            center={[apt.lat, apt.lon]}
            radius={6}
            pathOptions={{
              color: aptColor(apt.type),
              fillColor: aptColor(apt.type),
              fillOpacity: apt.hasLive ? 0.9 : 0.5,
              weight: 2
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div style={{ fontFamily: 'monospace', fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: aptColor(apt.type) }}>{apt.icao}</div>
                <div style={{ fontSize: 10, color: '#666' }}>{apt.type}</div>
                {apt.hasLive && <div style={{ fontSize: 9, color: '#4ade80' }}>● LIVE WX</div>}
              </div>
            </Tooltip>
          </CircleMarker>
        ))}

        {/* Aircraft GPS position */}
        {gpsPos && (
          <CircleMarker
            center={[gpsPos.lat, gpsPos.lon]}
            radius={10}
            pathOptions={{ color: '#4ade80', fillColor: '#4ade80', fillOpacity: 1, weight: 2 }}
          >
            <Tooltip permanent direction="top" offset={[0, -12]}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#4ade80', fontWeight: 700 }}>
                ✈ {gpsPos.lat.toFixed(3)}N {gpsPos.lon.toFixed(3)}E
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {gpsPos && <FlyTo pos={gpsPos} />}
      </MapContainer>

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 24, left: 8, zIndex: 1000,
        background: 'rgba(15,23,42,0.9)', borderRadius: 8, padding: '6px 10px',
        border: '1px solid #1e293b', fontSize: 10, fontFamily: 'monospace'
      }}>
        {[
          { color: '#fbbf24', label: 'DEP' },
          { color: '#4ade80', label: 'DEST' },
          { color: '#fb923c', label: 'ALT' },
          { color: '#a78bfa', label: 'ADEQ' },
          { color: '#38bdf8', label: 'ROUTE' },
          { color: '#4ade80', label: '✈ ACFT' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span style={{ color: '#94a3b8' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* GPS status */}
      {!gpsPos && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
          background: 'rgba(15,23,42,0.85)', borderRadius: 6, padding: '4px 12px',
          border: '1px solid #334155', fontSize: 10, color: '#475569', fontFamily: 'monospace'
        }}>
          GPS signal not available
        </div>
      )}
    </div>
  );
}