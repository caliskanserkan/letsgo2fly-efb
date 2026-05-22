const SUPABASE_URL = 'https://ojvqdsqodpxkvpxvwgrm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n8r8MghL2wRlNWKiuzhd-Q_riIrHf1f';

async function saveWxSnapshot(planId, metars, tafs) {
  const rows = [];
  Object.entries(metars).forEach(([icao, lines]) => {
    rows.push({ plan_id: planId, icao, type: 'METAR', raw_text: lines.join('\n') });
  });
  Object.entries(tafs).forEach(([icao, lines]) => {
    rows.push({ plan_id: planId, icao, type: 'TAF', raw_text: lines.join('\n') });
  });
  if (!rows.length) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/wx_snapshots`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(rows)
    });
    console.log('[WX] snapshot saved for plan:', planId, 'rows:', rows.length);
  } catch(e) {
    console.warn('[WX] snapshot save failed:', e);
  }
}

export async function fetchWeatherData(dep = 'LTAC', dest = 'LTBA', alt = 'LTFM', planId = null) {
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

  // Her refresh'te en taze WX'i kaydet
  if (planId) saveWxSnapshot(planId, metars, tafs);

  return { metars, tafs, updatedAt };
}
