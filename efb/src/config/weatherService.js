export async function fetchWeatherData(dep = 'LTAC', dest = 'LTBA', alt = 'LTFM') {
  const STATIONS = [dep, dest, alt].filter(Boolean);
  const ids = [...new Set(STATIONS)].join(',');
  const BASE = 'https://aviationweather.gov/api/data';

  const [metarRes, tafRes] = await Promise.all([
    fetch(`${BASE}/metar?ids=${ids}&format=raw&hours=2`),
    fetch(`${BASE}/taf?ids=${ids}&format=raw`),
  ]);

  const metarText = await metarRes.text();
  const tafText   = await tafRes.text();

  const metars = {};
  metarText.trim().split('\n').forEach(line => {
    const l = line.trim();
    if (!l) return;
    const icao = l.slice(0, 4);
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
    const first = l.split(' ')[0];
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