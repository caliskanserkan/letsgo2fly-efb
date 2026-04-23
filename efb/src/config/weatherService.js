export async function fetchWeatherData(dep = 'LTAC', dest = 'LTBA', alt = 'LTFM') {
  const STATIONS = [...new Set([dep, dest, alt].filter(Boolean))];
  const ids = STATIONS.join(',');

  const [metarRes, tafRes] = await Promise.all([
    fetch(`/api/wxr?ids=${ids}&type=metar`),
    fetch(`/api/wxr?ids=${ids}&type=taf`),
  ]);

  const metarText = await metarRes.text();
  const tafText   = await tafRes.text();

  const metars = {};
  metarText.trim().split('\n').forEach(line => {
    const l = line.trim(); if (!l) return;
    const p = l.split(' ');
    const icao = (p[0]==='METAR'||p[0]==='SPECI') ? p[1] : p[0];
    if (STATIONS.includes(icao)) { if (!metars[icao]) metars[icao]=[]; metars[icao].push(l); }
  });

  const tafs = {}; let cur = null;
  tafText.trim().split('\n').forEach(line => {
    const l = line.trim(); if (!l) return;
    const p = l.split(' ');
    const first = (p[0]==='TAF'||p[0]==='TAF AMD') ? p[1] : p[0];
    if (STATIONS.includes(first)) { cur=first; tafs[cur]=[l]; }
    else if (cur) tafs[cur].push(l);
  });

  const now = new Date();
  const updatedAt = `${now.getUTCDate().toString().padStart(2,'0')} ${now.toUTCString().split(' ')[2]} ${now.getUTCFullYear()} · ${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')} Z`;
  return { metars, tafs, updatedAt };
}