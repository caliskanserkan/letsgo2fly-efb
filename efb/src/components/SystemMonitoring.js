import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// ============================================================
// SYSTEM MONITORING & EVENT LOG — super admin (15 Agu 2026, Serkan)
//
// "Bir izleme kodu yazsan, bir ucusta bastan sona islediğimiz plani sisteme
//  arsivledigimizde operasyon sirasinda yapilan butun isleri — ekran dondurme,
//  modul gecme, veri girme, dokuman ekleme vs. — butun adimlari tarayip log
//  kayitlarina bakip hata raporu uretebilir misin? Hatta bunu super admin
//  panelde system monitoring and event log gibi bir sey yapabilir miyiz?
//  Cunku ben her ucusta bir problem buluyorum."
//
// VERI KAYNAGI YENI DEGIL: `flight_logs` zaten her adimi yaziyor (modul girisi,
// alan degisikligi eski->yeni, dokuman ekleme, GPS yazimi, reddedilen yazim,
// arsiv kapisi redleri, DIRECT TO / DIVERT). Bu ekran o kayitlari TEK bir zaman
// cizelgesinde diziyor ve pilotun PROBLEM RAPORU'nu ayni cizelgeye cakiyor.
//
// ── ESIK UYDURULMAZ ────────────────────────────────────────────────────────
// Serkan'in kural listesi onaylandi, ama "3+ kez", "N kez" gibi sayilar
// EŞIK OLARAK yazilmadi. Tarama SAYIYI OLDUGU GIBI basar ("ayni hucre 5 kez
// degisti"), karari okuyan insan verir. Yalniz kesin olanlar BAYRAK olur:
// hic GPS fix'i yok · hep MISSED · reddedilmis yazim var · kod hatasi var.
// ============================================================

const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)', accent:'var(--accent)',
  red:'var(--red)', green:'var(--green)', amber:'var(--amber, #f59e0b)',
};

const S = {
  th:{ textAlign:'left', padding:'7px 10px', fontSize:9, color:C.t3, fontWeight:700,
       letterSpacing:0.6, textTransform:'uppercase', borderBottom:`1px solid ${C.border}` },
  td:{ padding:'7px 10px', fontSize:11, color:C.t2, borderBottom:`1px solid ${C.border}`,
       fontFamily:'var(--mono)' },
  label:{ fontSize:9, color:C.t3, fontWeight:700, letterSpacing:1, textTransform:'uppercase' },
  note:{ fontSize:11, color:C.t2, background:C.bg3, borderLeft:`3px solid ${C.accent}`,
         padding:'8px 10px', borderRadius:4 },
};

const fmtT = (iso) => iso
  ? new Date(iso).toLocaleString('en-GB', { timeZone:'UTC', day:'2-digit', month:'short',
      hour:'2-digit', minute:'2-digit', second:'2-digit' }).toUpperCase() + 'Z'
  : '—';

// Olay ailesi -> renk. Ayni modulun olaylari cizelgede ayni tonda gorunur.
const familyOf = (action = '') => {
  const a = String(action).toUpperCase();
  if (a.startsWith('NAVLOG') || a.startsWith('DIRECT_TO') || a.startsWith('DIVERT')) return 'NAVLOG';
  if (a.startsWith('PROBLEM')) return 'PROBLEM';
  if (a.startsWith('APP_ERROR')) return 'ERROR';
  if (a.startsWith('SYNC')) return 'SYNC';
  if (a.startsWith('ARCHIVE') || a.startsWith('PREARCHIVE')) return 'ARCHIVE';
  if (a.startsWith('DOC') || a.startsWith('PHOTO')) return 'DOCS';
  if (a.startsWith('FIELD') || a.startsWith('ROUTE')) return 'ENTRY';
  return 'OTHER';
};
const familyColor = (f) => ({
  NAVLOG:'#38bdf8', PROBLEM:'#f59e0b', ERROR:'#ef4444', SYNC:'#a78bfa',
  ARCHIVE:'#22c55e', DOCS:'#eab308', ENTRY:'#94a3b8', OTHER:'#64748b',
}[f]);

// ── TARAMA: OLAYLARDAN BULGU ÜRET ─────────────────────────────────────────
// Serkan'in onayladigi liste (1-10). Sayi gerektiren maddeler SAYIYI basar,
// esik koymaz; kesin olanlar bayrak kaldirir.
export function scanFlight(logs, reports) {
  const f = [];
  const count = (pred) => logs.filter(pred).length;
  const has = (pred) => logs.some(pred);

  // 3 · GPS yazimi reddedildi (DISAGREE / cross-track / kalite)
  const rejected = logs.filter(l => l.action === 'NAVLOG_ATA_AUTO_REJECTED');
  if (rejected.length) {
    f.push({ level:'flag', rule:3, title:`GPS time refused ${rejected.length}×`,
             detail: rejected.map(r => r.details?.reason || r.details?.wpt).filter(Boolean).join(' · '),
             at: rejected[0].created_at });
  }

  // 8 · Otomatik ATA hic yazamadi (hep MISSED)
  const wrote = count(l => l.action === 'NAVLOG_ATA_AUTO');
  const missed = logs.filter(l => l.action === 'NAVLOG_ATA_AUTO_MISSED');
  if (missed.length && wrote === 0) {
    f.push({ level:'flag', rule:8, title:`Auto ATA never wrote — ${missed.length} point(s) missed`,
             detail:'GPS was on but not one crossing was observed.', at: missed[0].created_at });
  } else if (missed.length) {
    f.push({ level:'fact', rule:8, title:`${missed.length} waypoint(s) missed by GPS`,
             detail: missed.map(m => m.details?.wpt).filter(Boolean).join(', '), at: missed[0].created_at });
  }

  // 6 · Ucus boyunca hic GPS fix'i akmadi (AUTO acildi ama tek yazim/kacirma yok)
  const autoOn = has(l => l.action === 'NAVLOG_ATA_AUTO_ENABLED' || l.action === 'NAVLOG_AUTO_ON');
  if (autoOn && wrote === 0 && missed.length === 0) {
    f.push({ level:'flag', rule:6, title:'AUTO ATA was on but produced nothing',
             detail:'No automatic write and no missed point — the position feed may never have run.' });
  }

  // 9 · Kod calismadi / uyumsuzluk loglandi
  const errs = logs.filter(l => familyOf(l.action) === 'ERROR');
  if (errs.length) {
    f.push({ level:'flag', rule:9, title:`${errs.length} application error(s) logged`,
             detail: errs.slice(0, 3).map(e => e.details?.what || e.action).join(' · '),
             at: errs[0].created_at });
  }

  // 4 · Arsiv kapisi reddetti — SAYI basilir, esik YOK
  const gate = count(l => String(l.action).toUpperCase().includes('ARCHIVE_BLOCKED')
                       || String(l.action).toUpperCase().includes('PREARCHIVE_REFUSED'));
  if (gate) f.push({ level:'fact', rule:4, title:`Archive gate refused ${gate}×`,
                     detail:'How many refusals is normal is a judgement call — the count is shown, not judged.' });

  // 2 · Ayni hucre tekrar tekrar degisti — SAYI basilir, esik YOK
  const byField = {};
  logs.filter(l => String(l.action).startsWith('FIELD')).forEach(l => {
    const k = `${l.details?.wpt || l.details?.module || ''}·${l.details?.field || ''}`;
    byField[k] = (byField[k] || 0) + 1;
  });
  Object.entries(byField).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .forEach(([k, n]) => f.push({ level:'fact', rule:2, title:`${k} changed ${n}×`,
                                  detail:'Repeated edits — hesitation, a correction, or a bug.' }));

  // 5 · Sync sonrasi deger degisti
  const sync = logs.filter(l => String(l.action).startsWith('SYNC_APPLIED'));
  if (sync.length) f.push({ level:'fact', rule:5, title:`${sync.length} sync apply event(s)`,
                            detail:'Values arriving from the other tablet — compare with entries around them.',
                            at: sync[0].created_at });

  // 1 · Modul acildi, hic giris yapilmadan cikildi
  const opened = logs.filter(l => String(l.action).endsWith('_OPENED') || l.action === 'MODULE_OPENED');
  const touchedModules = new Set(logs.filter(l => String(l.action).startsWith('FIELD'))
                                     .map(l => l.details?.module).filter(Boolean));
  const silent = [...new Set(opened.map(l => l.details?.module).filter(Boolean))]
    .filter(m => !touchedModules.has(m));
  if (silent.length) f.push({ level:'fact', rule:1, title:`Opened without any entry: ${silent.join(', ')}`,
                              detail:'Normal for read-only modules; suspicious for the ones that must be filled.' });

  // 10 · Pilot rapor etti — her zaman en ustte
  (reports || []).forEach(r => f.push({
    level:'report', rule:10, title:`Pilot report — ${(r.module || '').toUpperCase()}`,
    detail: r.note || '(no note)', at: r.occurred_at, reportId: r.id,
  }));

  const rank = { report:0, flag:1, fact:2 };
  return f.sort((a, b) => (rank[a.level] - rank[b.level]));
}

export default function SystemMonitoring({ customer }) {
  const [reports, setReports] = useState([]);
  const [sel, setSel] = useState(null);          // secili problem raporu
  const [logs, setLogs] = useState([]);
  const [shotUrl, setShotUrl] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const loadReports = useCallback(async () => {
    if (!customer?.id) return;
    let q = supabase.from('problem_reports').select('*')
      .eq('customer_id', customer.id).order('occurred_at', { ascending:false }).limit(200);
    if (onlyOpen) q = q.eq('status', 'open');
    const { data } = await q;
    setReports(data || []);
  }, [customer?.id, onlyOpen]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Secilen raporun UCUSUNUN tum olaylari + ekran goruntusu.
  useEffect(() => {
    let dead = false;
    (async () => {
      setLogs([]); setShotUrl(null);
      if (!sel) return;
      setBusy(true);
      if (sel.plan_id) {
        const { data } = await supabase.from('flight_logs').select('*')
          .eq('plan_id', sel.plan_id).order('created_at', { ascending:true });
        if (!dead) setLogs(data || []);
      }
      if (sel.screenshot_path) {
        const { data } = await supabase.storage.from('efb-documents')
          .createSignedUrl(sel.screenshot_path, 3600);
        if (!dead) setShotUrl(data?.signedUrl || null);
      }
      if (!dead) setBusy(false);
    })();
    return () => { dead = true; };
  }, [sel]);

  const findings = useMemo(
    () => (sel ? scanFlight(logs, reports.filter(r => r.plan_id === sel.plan_id)) : []),
    [logs, reports, sel]);

  const shownLogs = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return f ? logs.filter(l => JSON.stringify(l).toUpperCase().includes(f)) : logs;
  }, [logs, filter]);

  // Raporun ANI: cizelgede o saniyeye en yakin satir vurgulanir.
  const reportMs = sel ? new Date(sel.occurred_at).getTime() : 0;
  const nearReport = (iso) => sel && Math.abs(new Date(iso).getTime() - reportMs) <= 60_000;

  const setStatus = async (status) => {
    if (!sel) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    await supabase.from('problem_reports')
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: u?.user?.id ?? null })
      .eq('id', sel.id);
    setSel({ ...sel, status });
    await loadReports();
    setBusy(false);
  };

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', minWidth:0 }}>
      {/* SOL: rapor listesi */}
      <div style={{ width:290, borderRight:`1px solid ${C.border}`, display:'flex',
                    flexDirection:'column', flexShrink:0, background:C.bg2 }}>
        <div style={{ padding:'10px 12px', borderBottom:`1px solid ${C.border}`,
                      display:'flex', alignItems:'center', gap:8 }}>
          <span style={S.label}>Problem reports</span>
          <label style={{ marginLeft:'auto', fontSize:10, color:C.t3, cursor:'pointer' }}>
            <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />{' '}OPEN ONLY
          </label>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {!reports.length && (
            <div style={{ padding:16, fontSize:11, color:C.t3 }}>
              No reports{onlyOpen ? ' open' : ''} for this company.
            </div>
          )}
          {reports.map(r => {
            const on = sel?.id === r.id;
            return (
              <div key={r.id} onClick={() => setSel(r)}
                   style={{ padding:'10px 12px', cursor:'pointer', borderBottom:`1px solid ${C.border}`,
                            background: on ? C.bg3 : 'transparent',
                            borderLeft:`3px solid ${on ? C.accent : 'transparent'}` }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.t1 }}>
                  {(r.module || '—').toUpperCase()}
                  {r.screenshot_path && <span style={{ marginLeft:6, fontSize:9, color:C.accent }}>◱ SHOT</span>}
                  {r.status !== 'open' && <span style={{ marginLeft:6, fontSize:9, color:C.green }}>✓</span>}
                </div>
                <div style={{ fontSize:9, color:C.t3, fontFamily:'var(--mono)', marginTop:2 }}>{fmtT(r.occurred_at)}</div>
                <div style={{ fontSize:10, color:C.t2, marginTop:4,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.note || '(no note)'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SAG: rapor + bulgular + zaman cizelgesi */}
      <div style={{ flex:1, overflowY:'auto', padding:16, minWidth:0 }}>
        {!sel && (
          <div style={{ fontSize:12, color:C.t3 }}>
            Pick a report on the left. Its flight's full event timeline loads with it, and the
            moment the pilot flagged is highlighted.
          </div>
        )}

        {sel && (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.t1 }}>
                {(sel.module || '—').toUpperCase()} · {fmtT(sel.occurred_at)}
              </span>
              <span style={{ fontSize:10, color:C.t3, fontFamily:'var(--mono)' }}>
                {sel.app_version} ({sel.app_build}) · iOS {sel.ios_version} · {sel.device}
              </span>
              <span style={{ marginLeft:'auto', display:'flex', gap:6 }}>
                {sel.status === 'open'
                  ? <button disabled={busy} onClick={() => setStatus('closed')}
                            style={{ ...S.label, cursor:'pointer', background:'none',
                                     border:`1px solid ${C.green}`, color:C.green,
                                     borderRadius:5, padding:'5px 10px' }}>MARK REVIEWED</button>
                  : <button disabled={busy} onClick={() => setStatus('open')}
                            style={{ ...S.label, cursor:'pointer', background:'none',
                                     border:`1px solid ${C.border}`, color:C.t3,
                                     borderRadius:5, padding:'5px 10px' }}>REOPEN</button>}
              </span>
            </div>

            <div style={{ ...S.note, marginTop:10 }}>{sel.note || '(no note written)'}</div>

            {/* SNAPSHOT — o anin makine tarafi */}
            <div style={{ marginTop:14 }}>
              <div style={S.label}>Snapshot at that moment</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 18px', marginTop:6 }}>
                {Object.entries(sel.snapshot || {}).map(([k, v]) => (
                  <span key={k} style={{ fontSize:10, fontFamily:'var(--mono)', color:C.t2 }}>
                    <span style={{ color:C.t3 }}>{k}=</span>{String(v)}
                  </span>
                ))}
              </div>
            </div>

            {shotUrl && (
              <div style={{ marginTop:14 }}>
                <div style={S.label}>Screenshot</div>
                <a href={shotUrl} target="_blank" rel="noreferrer">
                  <img src={shotUrl} alt="screenshot"
                       style={{ marginTop:6, maxWidth:'100%', maxHeight:420, borderRadius:8,
                                border:`1px solid ${C.border}` }} />
                </a>
              </div>
            )}

            {/* BULGULAR */}
            <div style={{ marginTop:18 }}>
              <div style={S.label}>Findings from this flight's log</div>
              {!findings.length && (
                <div style={{ fontSize:11, color:C.t3, marginTop:6 }}>
                  {sel.plan_id ? 'Nothing stood out in the events.' : 'No flight plan attached to this report.'}
                </div>
              )}
              {findings.map((f, i) => (
                <div key={i} style={{ marginTop:6, padding:'8px 10px', borderRadius:6,
                                      background:C.bg3,
                                      borderLeft:`3px solid ${f.level === 'flag' ? C.red
                                                  : f.level === 'report' ? C.amber : C.border}` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:C.t1 }}>
                    <span style={{ color:C.t3, fontFamily:'var(--mono)', marginRight:6 }}>#{f.rule}</span>
                    {f.title}
                  </div>
                  {f.detail && <div style={{ fontSize:10, color:C.t2, marginTop:2 }}>{f.detail}</div>}
                </div>
              ))}
            </div>

            {/* ZAMAN CIZELGESI */}
            <div style={{ marginTop:18 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={S.label}>Event timeline — {logs.length} events</span>
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="filter…"
                       style={{ marginLeft:'auto', background:C.bg3, border:`1px solid ${C.border}`,
                                borderRadius:5, padding:'4px 8px', fontSize:11, color:C.t1 }} />
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', marginTop:6 }}>
                <thead><tr>
                  <th style={S.th}>Time</th><th style={S.th}>Action</th><th style={S.th}>Details</th>
                </tr></thead>
                <tbody>
                  {shownLogs.map(l => {
                    const fam = familyOf(l.action);
                    const hit = nearReport(l.created_at);
                    return (
                      <tr key={l.id} style={{ background: hit ? 'rgba(245,158,11,0.12)' : 'transparent' }}>
                        <td style={{ ...S.td, whiteSpace:'nowrap', color: hit ? C.amber : C.t3 }}>
                          {fmtT(l.created_at)}
                        </td>
                        <td style={{ ...S.td, whiteSpace:'nowrap' }}>
                          <span style={{ display:'inline-block', width:6, height:6, borderRadius:3,
                                         background: familyColor(fam), marginRight:6 }} />
                          {l.action}
                        </td>
                        <td style={{ ...S.td, color:C.t2 }}>
                          {Object.entries(l.details || {}).map(([k, v]) => `${k}=${v}`).join(' · ')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!logs.length && sel.plan_id && !busy && (
                <div style={{ fontSize:11, color:C.t3, marginTop:8 }}>No events logged for this flight.</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
