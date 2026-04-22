export async function fetchWeatherData(dep = 'LTAC', dest = 'LTBA', alt = 'LTFM') {
  const STATIONS = [...new Set([dep, dest, alt].filter(Boolean))];
  const ids = STATIONS.join(',');
  const BASE = '/api/wxr';

  const [metarRes, tafRes] = await Promise.all([
    fetch(`${BASE}?ids=${ids}&type=metar`),
    fetch(`${BASE}?ids=${ids}&type=taf`),
  ]);

  const metarText = await metarRes.text();
  const tafText   = await tafRes.text();

  const metars = {};
  metarText.trim().split('\n').forEach(line => {
    const l = line.trim();
    if (!l) return;
    const parts = l.split(' ');
    const icao = parts[0] === 'METAR' || parts[0] === 'SPECI' ? parts[1] : parts[0];
    if (STATIONS.includes(icao)) {
      if (!metars[icao]) metars[icao] = [];
      metars[icao].push(l);
    }
  });

  const tafs = {};
  let currentIcao = null;
  tafText.trim().split('\n').forEach(line => {
    const l = line.trim();
    if (!l) return;
const parts2 = l.split(' ');
const first = (parts2[0] === 'TAF' || parts2[0] === 'TAF') ? parts2[1] : parts2[0];
if (STATIONS.includes(first)) {
      currentIcao = first;
      tafs[currentIcao] = [l];
    } else if (currentIcao) {
      tafs[currentIcao].push(l);
    }
  });

  const now = new Date();
  const updatedAt = `${now.getUTCDate().toString().padStart(2,'0')} `
    + `${now.toUTCString().split(' ')[2]} `
    + `${now.getUTCFullYear()} · `
    + `${now.getUTCHours().toString().padStart(2,'0')}:`
    + `${now.getUTCMinutes().toString().padStart(2,'0')} Z`;

  return { metars, tafs, updatedAt };
}
