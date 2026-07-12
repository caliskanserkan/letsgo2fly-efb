import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

// ─── CZIB (Conflict Zone Information Bulletin) kontrolu ──────────────────────
//
// Plan aktive edildiginde (internet varken) czib-check Edge Function cagrilir.
// Sonuc czib_snapshots'a yazilir -> internet yokken oradan okunur.
//
// UC DURUM:
//   CONFLICT     (kirmizi) : Rota/meydan aktif bir EASA CZIB ile eslesti
//   NO_CONFLICT  (yesil)   : Eslesme yok VE tum girdiler okunabildi
//   INCONCLUSIVE (sari)    : Kontrol TAM yapilamadi -> ASLA yesil gosterilmez
//
// YESIL MESAJ "TEMIZ" DEMEZ. "Eslesme gozlenmedi" der, kac CZIB'e karsi
// kontrol edildigini ve verinin tarihini gosterir, EASA yayinindan teyit ister.
// Pilot son karari verir; bu arac bir tavsiye katmanidir, yetki degil.

const FN_URL = 'https://ojvqdsqodpxkvpxvwgrm.supabase.co/functions/v1/czib-check';

const C = {
  red:    { bg:'rgba(239,68,68,0.08)',  bd:'rgba(239,68,68,0.35)',  fg:'#f87171' },
  green:  { bg:'rgba(34,197,94,0.06)',  bd:'rgba(34,197,94,0.22)',  fg:'#4ade80' },
  amber:  { bg:'rgba(245,158,11,0.08)', bd:'rgba(245,158,11,0.30)', fg:'#fbbf24' },
  slate:  { bg:'rgba(100,116,139,0.06)',bd:'rgba(100,116,139,0.20)',fg:'#94a3b8' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', timeZone:'UTC',
  }) + 'Z';
}

export default function CzibCheck({ activePlan }) {
  const [state, setState]   = useState('idle'); // idle | loading | done | error
  const [res, setRes]       = useState(null);
  const [cached, setCached] = useState(false);
  const [open, setOpen]     = useState(false);

  useEffect(() => {
    if (!activePlan?.id) return;
    let dead = false;

    (async () => {
      setState('loading'); setRes(null); setCached(false);

      // 1) Canli kontrol (internet varsa)
      try {
        const { data:{ session } } = await supabase.auth.getSession();
        if (!session) throw new Error('no session');

        const r = await fetch(FN_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ plan_id: activePlan.id }),
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'check failed');

        if (!dead) { setRes(j); setCached(false); setState('done'); }
        return;
      } catch (_) { /* internet yok / hata -> snapshot'a dus */ }

      // 2) Offline: son snapshot
      try {
        const { data, error } = await supabase
          .from('czib_snapshots')
          .select('status, conflicts, route_firs, active_count, checked_at, czib_fetched_at')
          .eq('plan_id', activePlan.id)
          .maybeSingle();

        if (error || !data) throw new Error('no snapshot');
        if (!dead) {
          setRes({ ...data, warnings: [] });
          setCached(true);
          setState('done');
        }
      } catch (_) {
        if (!dead) setState('error');
      }
    })();

    return () => { dead = true; };
  }, [activePlan?.id]);

  if (!activePlan?.id) return null;

  // ── Yukleniyor ──
  if (state === 'loading') {
    return (
      <Box c={C.slate}>
        <Head icon="⏳" title="CZIB CHECK — checking…" c={C.slate} />
      </Box>
    );
  }

  // ── Hic sonuc yok (internet yok + snapshot yok) ──
  if (state === 'error' || !res) {
    return (
      <Box c={C.amber}>
        <Head icon="⚠️" title="CZIB CHECK UNAVAILABLE" c={C.amber} />
        <p style={sub}>
          No connection and no stored check for this flight.
          Conflict zones could not be verified — consult EASA CZIB publication before departure.
        </p>
        <Link />
      </Box>
    );
  }

  const conflicts = Array.isArray(res.conflicts) ? res.conflicts : [];
  const warnings  = Array.isArray(res.warnings)  ? res.warnings  : [];
  const isConflict     = res.status === 'CONFLICT';
  const isInconclusive = res.status === 'INCONCLUSIVE';

  // ── KIRMIZI: cakisma ──
  if (isConflict) {
    return (
      <Box c={C.red}>
        <Head icon="🔴" title="CZIB CONFLICT — ROUTE AFFECTED" c={C.red} />
        {conflicts.map((z) => (
          <div key={z.czib_no} style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(239,68,68,0.18)' }}>
            <div style={{ fontSize:13, color:'#f1f5f9', fontWeight:600 }}>{z.subject}</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
              {z.czib_no} · valid until {z.valid_until || '—'}
            </div>

            {z.matched_firs?.length > 0 && (
              <Tag label="Route enters" items={z.matched_firs} />
            )}
            {z.matched_airports?.length > 0 && (
              <Tag label="Airport" items={z.matched_airports.map(a => `${a.icao} (${a.country})`)} />
            )}

            {z.affected_airspace && (
              <div style={{ fontSize:11, color:'#cbd5e1', marginTop:8, lineHeight:1.5 }}>
                <b style={{ color:'#94a3b8' }}>Affected airspace: </b>{z.affected_airspace}
              </div>
            )}
            {z.recommendation && (
              <div style={{ fontSize:11, color:'#cbd5e1', marginTop:6, lineHeight:1.5, whiteSpace:'pre-line' }}>
                <b style={{ color:'#94a3b8' }}>EASA recommendation: </b>{z.recommendation.trim()}
              </div>
            )}
          </div>
        ))}
        <Foot res={res} cached={cached} />
        <Link />
      </Box>
    );
  }

  // ── SARI: kontrol tam yapilamadi (ASLA yesil degil) ──
  if (isInconclusive || warnings.length > 0) {
    return (
      <Box c={C.amber}>
        <Head icon="🟡" title="CZIB CHECK INCONCLUSIVE" c={C.amber} />
        <p style={sub}>
          The check could not be completed for all inputs. This is <b>not</b> a clearance.
        </p>
        <ul style={{ margin:'6px 0 0', paddingLeft:18, fontSize:11, color:'#cbd5e1', lineHeight:1.6 }}>
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
        <Foot res={res} cached={cached} />
        <Link />
      </Box>
    );
  }

  // ── YESIL: eslesme gozlenmedi (temiz DEMEZ) ──
  return (
    <Box c={C.green}>
      <button onClick={() => setOpen(!open)} style={{ all:'unset', cursor:'pointer', width:'100%' }}>
        <Head icon="🟢" title="CZIB — NO CONFLICT OBSERVED" c={C.green} chev={open ? '▾' : '▸'} />
      </button>
      <p style={sub}>
        Checked against {res.active_count ?? '—'} active EASA CZIB
        {res.route_firs?.length > 0 && <> · route FIRs: <b>{res.route_firs.join(', ')}</b></>}
        . Confirm against the EASA publication before departure.
      </p>
      {open && <Foot res={res} cached={cached} />}
      {open && <Link />}
    </Box>
  );
}

// ─── Parcalar ────────────────────────────────────────────────────────────────
const sub = { margin:'6px 0 0', fontSize:11, color:'#94a3b8', lineHeight:1.6 };

function Box({ c, children }) {
  return (
    <div style={{
      margin:'0 12px 16px', padding:'12px 14px', borderRadius:12,
      background:c.bg, border:`1px solid ${c.bd}`,
    }}>{children}</div>
  );
}

function Head({ icon, title, c, chev }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <span style={{ fontSize:13 }}>{icon}</span>
      <span style={{ fontSize:12, color:c.fg, fontWeight:700, letterSpacing:'0.5px', flex:1 }}>{title}</span>
      {chev && <span style={{ fontSize:11, color:c.fg }}>{chev}</span>}
    </div>
  );
}

function Tag({ label, items }) {
  return (
    <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:11, color:'#94a3b8' }}>{label}:</span>
      {items.map((t) => (
        <span key={t} style={{
          fontSize:11, fontFamily:'monospace', fontWeight:700, color:'#fca5a5',
          background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)',
          borderRadius:5, padding:'2px 7px',
        }}>{t}</span>
      ))}
    </div>
  );
}

function Foot({ res, cached }) {
  return (
    <div style={{ marginTop:10, paddingTop:8, borderTop:'1px solid rgba(148,163,184,0.15)', fontSize:10, color:'#64748b', lineHeight:1.6 }}>
      {cached && <div style={{ color:'#fbbf24', marginBottom:2 }}>⚠︎ Offline — showing last stored check</div>}
      <div>Checked: {fmtDate(res.checked_at)}</div>
      <div>EASA data: {fmtDate(res.czib_fetched_at)}</div>
    </div>
  );
}

function Link() {
  return (
    <a
      href="https://www.easa.europa.eu/en/domains/air-operations/czibs"
      target="_blank" rel="noopener noreferrer"
      style={{ display:'inline-block', marginTop:8, fontSize:11, color:'#38bdf8', textDecoration:'none' }}
    >
      Open EASA CZIB publication ↗
    </a>
  );
}
