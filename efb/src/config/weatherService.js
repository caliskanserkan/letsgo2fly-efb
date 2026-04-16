const STATIONS = ['LTAC', 'LTBA', 'LTFM'];
const BASE = 'https://aviationweather.gov/api/data';

export async function fetchWeatherData() {
  const ids = STATIONS.join(',');

  const [metarRes, tafRes] = await Promise.all([
    fetch(`${BASE}/metar?ids=${ids}&format=raw&hours=2`),
    fetch(`${BASE}/taf?ids=${ids}&format=raw`),
  ]);

  const metarText = await metarRes.text();
  const tafText   = await tafRes.text();

  // METAR'ları parse et — her satır bir istasyon
  const metars = {};
  metarText.trim().split('\n').forEach(line => {
    const line2 = line.trim();
    if (!line2) return;
    const icao = line2.slice(0, 4);
    if (STATIONS.includes(icao)) {
      if (!metars[icao]) metars[icao] = [];
      metars[icao].push(line2);
    }
  });

  // TAF'ları parse et
  const tafs = {};
  let currentIcao = null;
  tafText.trim().split('\n').forEach(line => {
    const line2 = line.trim();
    if (!line2) return;
    const firstWord = line2.split(' ')[0];
    if (STATIONS.includes(firstWord)) {
      currentIcao = firstWord;
      tafs[currentIcao] = [line2];
    } else if (currentIcao) {
      tafs[currentIcao].push(line2);
    }
  });

  // Güncelleme zamanı
  const now = new Date();
  const updatedAt = `${now.getUTCDate().toString().padStart(2,'0')} `
    + `${now.toUTCString().split(' ')[2]} `
    + `${now.getUTCFullYear()} · `
    + `${now.getUTCHours().toString().padStart(2,'0')}:`
    + `${now.getUTCMinutes().toString().padStart(2,'0')} Z`;

  return { metars, tafs, updatedAt };
}