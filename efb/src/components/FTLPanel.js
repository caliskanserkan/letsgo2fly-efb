// FTLPanel.js — Admin panel FTL sekmesi (Faz 1)
// Görev-öncelikli atama sihirbazı · pilot görev geçmişi (denetçi raporu) · ruleset ayarları
// Tek kaynak: crew_duties + ftl_rulesets + ftl_pilot_baselines (RLS müşteri sınırı)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  toMin, fmtMin, spanMin, effectiveRules, overrideDirection,
  fitness, dutyWindow, tzOffsetMin, daysOffSummary,
  standbyBefore, standbyEffect, standbyLimits, standbyRef,
  skpkLimits, skpkRef, previousDuty, acclimatisation, bandReportHHMM,
} from './FTLEngine';
import { normTime, up } from './inputFormat';

const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)', border2:'var(--border2)',
  accent:'var(--accent)', accentDim:'var(--accent-soft)',
  green:'var(--green)', red:'var(--red)', blue:'var(--accent)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)',
};
const S = {
  label:{ fontSize:10, color:C.t2, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', fontFamily:'var(--mono)', display:'block', marginBottom:6 },
  input:{ background:'var(--input-bg)', border:`1px solid ${C.border}`, borderRadius:6, color:'var(--t1)', padding:'9px 11px', fontSize:13, fontFamily:'var(--mono)', width:'100%', boxSizing:'border-box', outline:'none' },
  table:{ width:'100%', borderCollapse:'collapse' },
  th:{ padding:'9px 12px', textAlign:'left', fontSize:10, color:'var(--t1)', fontWeight:700, letterSpacing:1, textTransform:'uppercase', borderBottom:`1px solid ${C.border}`, background:C.bg3, whiteSpace:'nowrap', fontFamily:'var(--mono)' },
  td:{ padding:'9px 12px', borderBottom:`1px solid ${C.border}`, color:'var(--t1)', fontSize:12.5, fontWeight:600, verticalAlign:'middle', whiteSpace:'nowrap', fontFamily:'var(--mono)', fontVariantNumeric:'tabular-nums' },
  btnP:{ background:C.accent, color:'#fff', border:'none', borderRadius:6, padding:'10px 22px', fontSize:12, fontFamily:'var(--mono)', fontWeight:700, letterSpacing:1.5, cursor:'pointer', textTransform:'uppercase' },
  btnS:{ background:'none', color:'var(--t2)', border:`1px solid ${C.border2}`, borderRadius:6, padding:'8px 16px', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', letterSpacing:1 },
  panel:{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', marginBottom:22 },
  panelH:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 16px', borderBottom:`1px solid ${C.border}`, background:C.bg3 },
  panelT:{ fontSize:11, fontWeight:700, letterSpacing:2, color:C.accent, textTransform:'uppercase', fontFamily:'var(--mono)' },
  note:{ fontSize:10, color:C.t3, letterSpacing:.5, lineHeight:1.7, padding:'9px 12px', background:C.bg3, borderLeft:`2px solid ${C.border2}`, fontFamily:'var(--mono)' },
};
const badge = (kind) => {
  const map = {
    green:{ c:C.green, bg:'var(--green-soft)', bd:'var(--green-soft)' }, red:{ c:C.red, bg:'var(--red-soft)', bd:'var(--red-soft)' },
    blue:{ c:C.blue, bg:'var(--accent-soft)', bd:'var(--accent-soft)' }, amber:{ c:C.accent, bg:'var(--amber-soft)', bd:C.accentDim },
    dim:{ c:C.t3, bg:'var(--bg3)', bd:C.border2 },
  }[kind] || {};
  return { display:'inline-block', padding:'2px 8px', fontSize:9, letterSpacing:1, fontWeight:700, border:`1px solid ${map.bd}`, color:map.c, background:map.bg, fontFamily:'var(--mono)' };
};

// ── TÜM SAATLER UTC (6 Ağu 2026, Serkan ilkesi) ─────────────────────
// "Bizim prensibe göre bütün zamanlar UTC olmalı; lokal time işleri için
//  kendi hesaplamasını yapabilir."
// Girilen ve gösterilen HER saat UTC'dir — EFB'nin geri kalanıyla (iOS, uçuş
// raporu, arşiv) aynı. YEREL saat yalnız REGÜLASYONUN İSTEDİĞİ yerde, İÇERİDE
// türetilir: Tablo 1 bandı (Md.22/2) ekibin İNTİBAK ETTİĞİ meydanın yerel
// saatiyle okunur, boş gün pencereleri (Md.4/ü) ana üssün yerel gecesiyle.
// İkisi de meydan tz'sinden hesaplanır, kullanıcıdan istenmez.
//
// Bu, eski "girilen saat kalkış meydanının yerelidir" kurgusunu bitirir ve
// onunla birlikte iki hata kaynağını da: dispatcher'ın TARAYICI dilimi ve
// "meydan tz yok → admin dilimi kullanıldı" yaması. Artık tz eksikse saat
// kaymaz; yalnız BANT çözülemez ve pilot NOT LEGAL olur (sessiz tahmin yok).
const utcISO = (dateStr, hhmm) => {
  if (!dateStr || !hhmm) return null;
  const d = new Date(`${dateStr}T${String(hhmm).padStart(5, '0')}:00Z`);
  return isNaN(d) ? null : d.toISOString();
};
const addMin = (iso, min) => iso ? new Date(new Date(iso).getTime() + min * 60000).toISOString() : null;

// ── MEYDAN DİLİMİ NEDEN HÂLÂ LAZIM (saatler UTC olmasına rağmen) ────
// Tarihçe: 4 Ağu'da saatler ADMIN MAKİNESİNİN diliminde mutlaklaştırılıyordu;
// dönüş meydanı farklı dilimdeyse duty_end ve earliest_next_report mutlak
// zamanda kayıyor, dinlenme penceresi yanlış çıkıyordu. Buna karşı saatler
// meydan dilimleriyle mutlaklaştırıldı (`zonedISO`).
// 6 Ağu'da Serkan ilkeyi netleştirdi: **bütün zamanlar UTC**. Böylece
// mutlaklaştırma DÜZ hale geldi ve `zonedISO` ile "tz yoksa admin dilimi"
// yaması tamamen gereksizleşti — kayma kaynağı kökten kalktı.
// Meydan dilimi yine de gerekli, ama artık YALNIZ regülasyonun yerel saat
// istediği yerlerde: Tablo 1 bandı (Md.22/2, intibak edilen meydanın yereli),
// boş gün pencereleri (Md.4/ü, ana üssün yerel gecesi) ve uzun menzil
// tespiti (Md.4/ee). Bunlar hesaplanır, kullanıcıdan istenmez.
const fetchTzMap = async (icaos) => {
  const clean = [...new Set(icaos.filter(Boolean).map(x => x.toUpperCase()))];
  if (!clean.length) return {};
  const { data } = await supabase.from('airports').select('icao,tz').in('icao', clean);
  const m = {};
  (data || []).forEach(r => { if (r.tz) m[r.icao] = r.tz; });
  return m;
};
// crypto.randomUUID Safari 15.4 oncesinde yok — yedegi RFC4122 v4 uretir.
const newUuid = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const b = new Uint8Array(16);
  window.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
// Gösterim de UTC — tarayıcının dilimi kayda da ekrana da karışmaz.
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone:'UTC', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).toUpperCase() : '—';
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB', { timeZone:'UTC', day:'2-digit', month:'short' }).toUpperCase() : '—';

export default function FTLPanel({ toast, myProfile }) {
  const [view, setView] = useState('assign'); // assign | history | ruleset
  const [pilots, setPilots] = useState([]);
  const [duties, setDuties] = useState([]);
  const [baselines, setBaselines] = useState([]); // en güncel satır / pilot
  const [ruleset, setRuleset] = useState(null);
  const [offTypes, setOffTypes] = useState([]);
  const [edits, setEdits] = useState([]);
  const [homeBases, setHomeBases] = useState({});
  const [loading, setLoading] = useState(true);

  const customerId = myProfile?.customer_id;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: d }, { data: b }, { data: cust }, { data: ot }, { data: hb }, { data: ed }] = await Promise.all([
      supabase.from('profiles').select('id,code,full_name,role').order('full_name'),
      supabase.from('crew_duties').select('*').order('report_time', { ascending: true }),
      supabase.from('ftl_pilot_baselines').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id,ftl_ruleset_id').eq('id', customerId).single(),
      supabase.from('ftl_off_types').select('*').eq('active', true).order('code'),
      supabase.from('home_bases').select('pilot_id,icao'),
      supabase.from('ftl_duty_edits').select('*').order('created_at', { ascending: false }),
    ]);
    setPilots(p || []); setDuties(d || []); setOffTypes(ot || []); setEdits(ed || []);
    setHomeBases(Object.fromEntries((hb || []).map(h => [h.pilot_id, h.icao])));
    // pilot başına en güncel baseline
    const seen = {};
    (b || []).forEach(r => { if (!seen[r.pilot_id]) seen[r.pilot_id] = r; });
    setBaselines(seen);
    if (cust?.ftl_ruleset_id) {
      const { data: rs } = await supabase.from('ftl_rulesets').select('*').eq('id', cust.ftl_ruleset_id).single();
      setRuleset(rs || null);
    }
    setLoading(false);
  }, [customerId]);
  useEffect(() => { if (customerId) load(); }, [load, customerId]);

  const tabS = (t) => ({ flex:'none', padding:'10px 24px', textAlign:'center', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:view===t?C.accent:C.t3, borderBottom:view===t?`2px solid ${C.accent}`:'2px solid transparent', background:view===t?`var(--accent-soft)`:'transparent' });

  // SKPK'nin 28 gunluk SHGM suresi (Md.12/1/c/2) SESSIZCE gecmemeli: gecikmis
  // sayi SEKMENIN USTUNDE durur, ilgili sekme acilmasa bile gorunur.
  const skpkOverdue = useMemo(() => {
    const now = Date.now();
    const seen = new Set();
    return (duties || []).filter(d => {
      if (d.status === 'cancelled' || !d.skpk_authority_due || d.skpk_authority_reported_at) return false;
      const k = d.assignment_id || d.id;
      if (seen.has(k)) return false;                       // olay basina 1 kez
      seen.add(k);
      return new Date(d.skpk_authority_due).getTime() < now;
    }).length;
  }, [duties]);

  if (!customerId) return <div style={{ padding:32, color:C.t3, fontSize:11, fontFamily:'var(--mono)' }}>NO CUSTOMER CONTEXT — select a company first.</div>;
  if (loading) return <div style={{ padding:32, textAlign:'center', color:C.t3, fontSize:11, fontFamily:'var(--mono)' }}>LOADING FTL DATA...</div>;
  if (!ruleset) return <div style={{ padding:32, color:C.red, fontSize:11, fontFamily:'var(--mono)' }}>NO FTL RULESET LINKED TO THIS CUSTOMER — run Faz 0 SQL / link customers.ftl_ruleset_id.</div>;

  return (
    <div style={{ flex:1, overflowY:'auto', minWidth:0 }}>
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, background:C.bg2 }}>
        <div style={tabS('assign')} onClick={() => setView('assign')}>Assign Duty</div>
        <div style={tabS('history')} onClick={() => setView('history')}>Duty History</div>
        <div style={tabS('skpk')} onClick={() => setView('skpk')}>
          SKPK{skpkOverdue > 0 && <span style={{ ...badge('red'), marginLeft:6 }}>{skpkOverdue}</span>}
        </div>
        <div style={tabS('edits')} onClick={() => setView('edits')}>Edit Report</div>
        <div style={tabS('ruleset')} onClick={() => setView('ruleset')}>Ruleset</div>
        <div style={{ flex:1 }} />
        <div style={{ alignSelf:'center', paddingRight:16, fontSize:9, color:C.t3, letterSpacing:1, fontFamily:'var(--mono)' }}>
          {ruleset.name} · ALL TIMES UTC
        </div>
      </div>
      <div style={{ padding:18 }}>
        {view === 'assign' && <>
          <DutyRoster {...{ toast, myProfile, pilots, duties, baselines, homeBases, offTypes, reload: load }} />
          <AssignDuty {...{ toast, myProfile, pilots, duties, baselines, ruleset, offTypes, homeBases, reload: load }} />
        </>}
        {view === 'history' && <DutyHistory {...{ pilots, duties, baselines, offTypes, ruleset, homeBases }} />}
        {view === 'skpk' && <SkpkTracker {...{ toast, myProfile, pilots, duties, reload: load }} />}
        {view === 'edits' && <EditReport {...{ pilots, edits, duties }} />}
        {view === 'ruleset' && <RulesetSettings {...{ toast, myProfile, ruleset, offTypes, reload: load }} />}
      </div>
    </div>
  );
}

// ═══ 0z) SKPK TAKIPCISI — SHT-FTL/HG Md.12(1)(c) ═════════════════
// Md.12(1)(c)(1): her SKPK'da isleticiye rapor sunulur (istisnasiz).
// Md.12(1)(c)(2): gerceklesen uzatma/kisaltma 1 SAATI ASARSA, kaptan raporunun
//   kopyasi ISLETICININ KENDI YORUMLARIYLA BIRLIKTE, olaydan itibaren en gec
//   28 GUN icinde Genel Mudurluge gonderilir.
//
// Bu ekranin varlik sebebi: 28 gunluk sure sessizce gecer. Kolona yazilmis ama
// kimsenin bakmadigi bir tarih, denetimde "takip edilmiyor" demektir — kayit
// tutmak yetmez, SURENIN DOLDUGUNU SOYLEYEN bir yer olmali. (Ilke 1'in uyum
// hali: sessiz gecme yok.)
function SkpkTracker({ toast, myProfile, pilots, duties, reload }) {
  const [pending, setPending] = useState(null);   // {rows, label}
  const nameOf = (pid) => { const x = pilots.find(p => p.id === pid); return x ? (x.code || x.full_name) : '—'; };

  // Bir SKPK = bir UCUS = bir komutan karari. Satirlar pilot bazli oldugu icin
  // atama kimligine gore gruplanir; Genel Mudurluge giden de TEK pakettir.
  const groups = useMemo(() => {
    const rows = (duties || []).filter(d =>
      d.status !== 'cancelled' &&
      ((d.skpk_fdp_extension_min || 0) > 0 || (d.skpk_rest_reduction_min || 0) > 0));
    const map = new Map();
    rows.forEach(d => {
      const key = d.assignment_id || d.id;
      if (!map.has(key)) map.set(key, { key, head: d, rows: [] });
      map.get(key).rows.push(d);
    });
    return [...map.values()].sort((a, b) =>
      String(b.head.duty_date).localeCompare(String(a.head.duty_date)));
  }, [duties]);

  const today = new Date();
  const statusOf = (d) => {
    if (!d.skpk_authority_due) return { kind:'operator', label:'OPERATOR ONLY (≤01:00)', tone:'dim' };
    if (d.skpk_authority_reported_at) return { kind:'sent', label:`SENT ${fmtD(d.skpk_authority_reported_at)}`, tone:'green' };
    const days = Math.floor((new Date(d.skpk_authority_due) - today) / 86400000);
    if (days < 0) return { kind:'overdue', label:`OVERDUE BY ${-days} DAY(S)`, tone:'red', days };
    return { kind:'due', label:`DUE IN ${days} DAY(S)`, tone: days <= 7 ? 'amber' : 'dim', days };
  };

  const overdue = groups.filter(g => statusOf(g.head).kind === 'overdue').length;
  const soon = groups.filter(g => { const s = statusOf(g.head); return s.kind === 'due' && s.days <= 7; }).length;

  const markSent = async (reason) => {
    const rows = pending.rows;
    const stamp = new Date().toISOString();
    // IZ ONCE (silme/iptal/edit ile ayni ilke)
    const { error: eErr } = await supabase.from('ftl_duty_edits').insert(rows.map(r => ({
      duty_id: r.id, customer_id: r.customer_id, pilot_id: r.pilot_id,
      assignment_id: r.assignment_id || null, edit_type: 'EDIT', field_name: 'skpk_authority_report',
      old_value: r.skpk_authority_reported_at ? `sent ${r.skpk_authority_reported_at}` : 'not sent',
      new_value: `sent to DGCA ${stamp} (due ${r.skpk_authority_due})`,
      reason: reason.trim(), edited_by: myProfile?.id ?? null })));
    if (eErr) { toast(`Audit write failed: ${eErr.message}`, 'error'); return; }
    for (const r of rows) {
      const { error } = await supabase.from('crew_duties')
        .update({ skpk_authority_reported_at: stamp, skpk_operator_comment: reason.trim() })
        .eq('id', r.id);
      if (error) { toast(`Update failed: ${error.message}`, 'error'); return; }
    }
    toast('Marked as reported to the DGCA (logged).', 'success');
    setPending(null); reload();
  };

  // SHGM PAKETI: Md.12(1)(c)(2) "kaptan raporunun bir kopyasi ISLETICININ KENDI
  // YORUMLARI ILE BIRLIKTE" — ikisi tek belgede basilir, gonderilecek olan bu.
  const printPacket = (g) => {
    const esc = (x) => String(x ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const d = g.head;
    const sectors = (d.sectors || []).map(s =>
      `${esc(s.dep)}–${esc(s.dest)} ${esc(s.off_block || s.etd)}–${esc(s.on_block || s.eta)}`).join(' · ') || '—';
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>SKPK — ${esc(fmtD(d.duty_date))}</title><style>
      body{font-family:-apple-system,'Helvetica Neue',sans-serif;color:#0f172a;margin:28px;font-size:12px}
      h1{font-size:15px;letter-spacing:2px;margin:0 0 2px}
      .sub{font-size:10px;color:#64748b;margin-bottom:16px}
      .box{border:1px solid #cbd5e1;border-radius:6px;padding:12px 14px;margin-bottom:12px}
      .box h2{font-size:10px;letter-spacing:1.5px;margin:0 0 8px;color:#475569}
      .kv{display:flex;gap:28px;flex-wrap:wrap}.kv div{font-size:11px}
      .kv b{display:block;font-size:9px;color:#64748b;letter-spacing:1px;margin-bottom:2px}
      pre{white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:11px;margin:0}
      .warn{color:#b91c1c;font-weight:700}
      @media print{body{margin:10mm}}
    </style></head><body>
      <h1>COMMANDER'S DISCRETION REPORT — SKPK</h1>
      <div class="sub">SHT-FTL/HG Md.12(1)(c)(2) — commander's report with the operator's comments, to the DGCA within 28 days of the event</div>
      <div class="box"><h2>FLIGHT</h2><div class="kv">
        <div><b>DATE</b>${esc(fmtD(d.duty_date))}</div>
        <div><b>SECTORS</b>${sectors}</div>
        <div><b>CREW</b>${g.rows.map(r => esc(nameOf(r.pilot_id))).join(', ')}</div>
        <div><b>DUTY</b>${esc(fmtDT(d.report_time))} → ${esc(fmtDT(d.duty_end))}</div>
      </div></div>
      <div class="box"><h2>DISCRETION APPLIED</h2><div class="kv">
        <div><b>FDP EXTENSION</b>${fmtMin(d.skpk_fdp_extension_min || 0)}</div>
        <div><b>REST REDUCTION</b>${fmtMin(d.skpk_rest_reduction_min || 0)}</div>
        <div><b>MAX FDP AFTER</b>${fmtMin(d.max_fdp_minutes)}</div>
        <div><b>NEXT REST (incl. 2× compensation)</b>${fmtMin(d.min_rest_minutes)}</div>
        <div><b>REPORTED TO OPERATOR</b>${esc(fmtDT(d.skpk_reported_at))}</div>
        <div><b>DGCA DUE</b>${esc(fmtD(d.skpk_authority_due))}</div>
      </div></div>
      <div class="box"><h2>COMMANDER'S REPORT</h2><pre>${esc(d.skpk_reason || '—')}</pre></div>
      <div class="box"><h2>OPERATOR'S COMMENTS</h2><pre>${d.skpk_operator_comment ? esc(d.skpk_operator_comment) : '<span class="warn">NOT RECORDED YET — required by Md.12(1)(c)(2)</span>'}</pre></div>
    </body></html>`);
    w.document.close();
  };

  return (
    <div style={S.panel}>
      <div style={S.panelH}>
        <span style={S.panelT}>SKPK — COMMANDER'S DISCRETION (Md.12)</span>
        <span style={{ fontSize:10, fontFamily:'var(--mono)', color:C.t3 }}>
          {groups.length} EVENT(S){overdue ? ` · ${overdue} OVERDUE` : ''}{soon ? ` · ${soon} DUE ≤7D` : ''}
        </span>
      </div>
      {(overdue > 0 || soon > 0) && (
        <div style={{ ...S.note, borderLeftColor: overdue ? C.red : C.accent,
                      color: overdue ? C.red : C.t2, margin:0, borderRadius:0 }}>
          {overdue > 0 && <>{overdue} SKPK EVENT(S) PAST THE 28-DAY DGCA DEADLINE (Md.12/1/c/2). </>}
          {soon > 0 && <>{soon} DUE WITHIN 7 DAYS. </>}
          The commander's report plus the operator's comments must reach the DGCA — print the packet, send it, then mark it here.
        </div>
      )}
      <div style={{ overflowX:'auto' }}>
        <table style={S.table}>
          <thead><tr>{['DATE', 'SECTORS', 'CREW', 'FDP EXT', 'REST RED', 'OPERATOR REPORT', 'DGCA STATUS', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {groups.map(g => {
              const d = g.head; const st = statusOf(d);
              return (
                <tr key={g.key}>
                  <td style={S.td}>{fmtD(d.duty_date)}</td>
                  <td style={{ ...S.td, whiteSpace:'normal' }}>{routeOf(d)}</td>
                  <td style={S.td}>{g.rows.map(r => nameOf(r.pilot_id)).join(', ')}</td>
                  <td style={{ ...S.td, color: d.skpk_fdp_extension_min ? C.accent : C.t3, fontWeight:700 }}>
                    {d.skpk_fdp_extension_min ? `+${fmtMin(d.skpk_fdp_extension_min)}` : '—'}</td>
                  <td style={{ ...S.td, color: d.skpk_rest_reduction_min ? C.accent : C.t3, fontWeight:700 }}>
                    {d.skpk_rest_reduction_min ? `−${fmtMin(d.skpk_rest_reduction_min)}` : '—'}</td>
                  <td style={{ ...S.td, color:C.t3 }} title={d.skpk_reason || ''}>{fmtDT(d.skpk_reported_at)}</td>
                  <td style={S.td}><span style={badge(st.tone)}>{st.label}</span></td>
                  <td style={{ ...S.td, textAlign:'right' }}>
                    <button style={{ ...S.btnS, padding:'5px 10px', marginRight:6 }} onClick={() => printPacket(g)}>PACKET</button>
                    {d.skpk_authority_due && !d.skpk_authority_reported_at && (
                      <button style={{ ...S.btnS, padding:'5px 10px' }}
                              onClick={() => setPending({ rows: g.rows, label: `${fmtD(d.duty_date)} ${routeOf(d)}` })}>
                        MARK SENT
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!groups.length && (
              <tr><td style={{ ...S.td, color:C.t3 }} colSpan={8}>No commander's discretion recorded. SKPK is entered on a flown duty via ROSTER → EDIT.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pending && (
        <ReasonModal
          title={`MARK REPORTED TO DGCA — ${pending.label}`}
          warn={'This records that the commander\'s report AND the operator\'s comments were sent to the DGCA (Md.12/1/c/2). What you type here is stored as the OPERATOR\'S COMMENTS and printed on the packet — write the operator\'s assessment, not just "sent".'}
          confirmLabel="MARK SENT"
          onCancel={() => setPending(null)}
          onConfirm={markSent} />
      )}
    </div>
  );
}

// ═══ 0) DUTY ROSTER — TARIH ARALIGI + IPTAL / SILME ═══════════════
// Saha talebi (3 Agu, Serkan): "Assign duty tarafinda ekleme var cikarma yok,
// tarih araligi secilmiyor. Iki tarih penceresi olmali, araligi gormeliyiz, ayni
// anda hem gorev ekleyip hem silebilmeliyiz."
//
// IKI SILME YOLU, IKISI DE GEREKCE ZORUNLU:
//   CANCEL  → status='cancelled'. Gorev listeden duser, KAYITTAN DUSMEZ.
//             Gerceklesmis gorevlerde tek yol budur.
//   DELETE  → satir gercekten silinir. YALNIZ gerceklesmemis gorevde mumkun
//             (planned + duty_finished degil + hic plan bagi yok). Bu sart
//             veritabaninda da dayatiliyor (crew_duties_del politikasi) —
//             arayuz sadece imkansiz olani teklif etmesin diye ayni kontrolu
//             yapiyor. Silmeden ONCE ftl_duty_edits'e mezar tasi yazilir.
const canHardDelete = (d) =>
  d.status === 'planned' && !d.duty_finished &&
  (!d.plan_ids || d.plan_ids.length === 0);

const routeOf = (d) => {
  if (d.duty_type !== 'flight') return (d.ground_kind || d.off_subtype || d.duty_type || '').toUpperCase();
  const s = d.sectors || [];
  if (!s.length) return '—';
  // DIVERT gorunur (4 Agu): arsiv sektore actual_dest yazar — planlanan
  // varistan farkliysa "DEP-DEST>ACT DVT" olarak basilir.
  return s.map(x => {
    const act = x.actual_dest && x.actual_dest !== x.dest ? `>${x.actual_dest} DVT` : '';
    return `${x.dep || '?'}-${x.dest || '?'}${act}`;
  }).join(' · ');
};

function ReasonModal({ title, warn, confirmLabel, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.55)', display:'flex',
                  alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, width:520, maxWidth:'92vw' }}>
        <div style={S.panelH}><span style={S.panelT}>{title}</span></div>
        <div style={{ padding:16 }}>
          {warn && <div style={{ ...S.note, borderLeftColor:C.red, color:C.red, marginBottom:12 }}>{warn}</div>}
          <span style={S.label}>Reason / report *</span>
          <textarea style={{ ...S.input, minHeight:80, resize:'vertical' }} value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Mandatory: why is this being changed?" />
          <div style={{ ...S.note, marginTop:8 }}>
            Gerekce denetim izine yazilir ve silinemez. Bos birakilamaz.
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
            <button style={S.btnS} onClick={onCancel} disabled={busy}>CANCEL</button>
            <button style={{ ...S.btnP, opacity: reason.trim() && !busy ? 1 : .45 }}
                    disabled={!reason.trim() || busy}
                    onClick={async () => { setBusy(true); await onConfirm(reason.trim()); setBusy(false); }}>
              {busy ? 'SAVING...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DutyRoster({ toast, myProfile, pilots, duties, baselines, homeBases, offTypes, reload }) {
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => plus(today, 14));
  const [pending, setPending] = useState(null);   // {mode:'cancel'|'delete', rows:[...]}
  const [editing, setEditing] = useState(null);   // roster grubu — EditDutyModal

  const nameOf = (pid) => {
    const p = pilots.find(x => x.id === pid);
    return p ? (p.code || p.full_name || '—') : '—';
  };

  // Aralik + assignment_id'ye gore gruplama. assignment_id yoksa (eski satir)
  // satirin kendi id'si grup sayilir — gruplamasiz da calisir.
  const groups = useMemo(() => {
    const rows = (duties || []).filter(d => d.duty_date >= from && d.duty_date <= to);
    const map = new Map();
    rows.forEach(d => {
      const k = d.assignment_id || `solo-${d.id}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(d);
    });
    return [...map.entries()]
      .map(([k, rs]) => ({ key:k, rows:rs, head:rs[0] }))
      .sort((a, b) => (a.head.duty_date || '').localeCompare(b.head.duty_date || '')
                   || String(a.head.report_time).localeCompare(String(b.head.report_time)));
  }, [duties, from, to]);

  const statusBadge = (s) => {
    const kind = s === 'actual' ? 'green' : s === 'cancelled' ? 'dim' : s === 'open' ? 'amber' : 'blue';
    return <span style={badge(kind)}>{(s || '').toUpperCase()}</span>;
  };

  const apply = async (reason) => {
    const { mode, rows } = pending;
    try {
      // 1) DENETIM IZI ONCE yazilir — silme basarili olursa satir gider ama iz kalir.
      const edits = rows.map(d => ({
        duty_id: d.id, customer_id: d.customer_id, pilot_id: d.pilot_id,
        assignment_id: d.assignment_id || null,
        edit_type: mode === 'delete' ? 'DELETE' : 'CANCEL',
        field_name: 'status', old_value: d.status,
        new_value: mode === 'delete' ? '(deleted)' : 'cancelled',
        reason, edited_by: myProfile?.id ?? null,
      }));
      const { error: eErr } = await supabase.from('ftl_duty_edits').insert(edits);
      if (eErr) { toast(`Audit write failed: ${eErr.message}`, 'error'); return; }

      const ids = rows.map(d => d.id);
      if (mode === 'delete') {
        const { error } = await supabase.from('crew_duties').delete().in('id', ids);
        if (error) {
          // Iz ONCE yazildi (silinip iz kalmamasindansa iz kalip silinmemesi
          // yegdir). Silme reddedildiyse o iz artik YANLIS bir sey soyluyor;
          // ftl_duty_edits bilerek degistirilemez oldugu icin duzeltme satiri
          // yazilir — denetim izi kendini duzeltir, ustunu cizmez.
          await supabase.from('ftl_duty_edits').insert(rows.map(d => ({
            duty_id: d.id, customer_id: d.customer_id, pilot_id: d.pilot_id,
            assignment_id: d.assignment_id || null, edit_type: 'EDIT',
            field_name: 'status', old_value: '(delete logged)',
            new_value: '(DELETE REFUSED — row still exists)',
            reason: `Delete refused by policy: ${error.message}`,
            edited_by: myProfile?.id ?? null,
          })));
          toast(`Delete refused: ${error.message}`, 'error');
          return;
        }
        toast(`${ids.length} duty row(s) deleted.`, 'success');
      } else {
        const { error } = await supabase.from('crew_duties').update({ status:'cancelled' }).in('id', ids);
        if (error) { toast(`Cancel failed: ${error.message}`, 'error'); return; }
        toast(`${ids.length} duty row(s) cancelled.`, 'success');
      }
      setPending(null);
      reload();
    } catch (e) { toast(String(e), 'error'); }
  };

  return (
    <div style={S.panel}>
      <div style={S.panelH}>
        <span style={S.panelT}>Roster — date range</span>
        <span style={{ fontSize:9, color:C.t3, letterSpacing:1, fontFamily:'var(--mono)' }}>
          {groups.length} ASSIGNMENT(S)
        </span>
      </div>

      <div style={{ display:'flex', gap:14, alignItems:'flex-end', padding:'14px 16px', flexWrap:'wrap' }}>
        <div style={{ width:170 }}><span style={S.label}>From</span>
          <input type="date" style={S.input} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div style={{ width:170 }}><span style={S.label}>To</span>
          <input type="date" style={S.input} value={to} onChange={e => setTo(e.target.value)} /></div>
        <button style={S.btnS} onClick={() => { setFrom(today); setTo(plus(today, 14)); }}>2 WEEKS</button>
        <button style={S.btnS} onClick={() => { setFrom(today); setTo(plus(today, 30)); }}>1 MONTH</button>
      </div>

      {!groups.length ? (
        <div style={{ ...S.note, margin:'0 16px 16px' }}>NO DUTIES IN THIS RANGE.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>Date</th><th style={S.th}>Type</th><th style={S.th}>Route / Kind</th>
              <th style={S.th}>Report</th><th style={S.th}>Duty end</th><th style={S.th}>Crew</th>
              <th style={S.th}>Status</th><th style={S.th}></th>
            </tr></thead>
            <tbody>
              {groups.map(g => {
                const d = g.head;
                const allDeletable = g.rows.every(canHardDelete);
                const allCancelled = g.rows.every(r => r.status === 'cancelled');
                // COK GUNLU GOREV TEK SATIR (4 Agu, Serkan): OFF 10-15 gune,
                // ucus 2 gune yayilabilir — her gun icin ayni kodu tekrarlamak
                // yerine baslangic–bitis araligi + TEKIL ekip listesi basilir.
                // Veri modeli degismedi (FTL hesaplari gunluk satirlarla dogru).
                const dates = g.rows.map(r => r.duty_date).filter(Boolean).sort();
                const d0 = dates[0], d1 = dates[dates.length - 1];
                const crewUniq = []; const seenPid = new Set();
                g.rows.forEach(r => { if (!seenPid.has(r.pilot_id)) { seenPid.add(r.pilot_id); crewUniq.push(r); } });
                return (
                  <tr key={g.key} style={{ opacity: allCancelled ? .45 : 1 }}>
                    <td style={S.td}>{d0 === d1 ? fmtD(d0) : `${fmtD(d0)} — ${fmtD(d1)}`}</td>
                    <td style={S.td}>
                      {(d.duty_type || '').toUpperCase()}
                      {d.operation_type && d.operation_type !== 'air_taxi' && (
                        <span style={{ ...badge('blue'), marginLeft:6 }}>
                          {d.operation_type === 'general_aviation' ? 'GA'
                            : d.operation_type === 'training' ? 'TRN'
                            : d.operation_type === 'aerial_work' ? 'AW' : d.operation_type}
                        </span>
                      )}
                      {(d.ground_kind === 'airport_standby' || d.ground_kind === 'other_standby') && (
                        <span style={{ ...badge('amber'), marginLeft:6 }}>
                          STANDBY {d.ground_kind === 'airport_standby' ? 'Md.17/1' : 'Md.17/2'}
                        </span>
                      )}
                    </td>
                    <td style={{ ...S.td, whiteSpace:'normal' }}>{routeOf(d)}</td>
                    <td style={S.td}>{fmtDT(d.report_time)}</td>
                    <td style={S.td}>{fmtDT(d.duty_end)}</td>
                    <td style={S.td}>
                      {crewUniq.map(r => {
                        const role = (r.sectors || [])[0]?.role;
                        return <span key={r.id} style={{ marginRight:8 }}>
                          {nameOf(r.pilot_id)}{role ? <span style={{ color:C.t3 }}> ({role})</span> : null}
                          {/* NOBET KISALTMASI PILOT BAZLIDIR (Md.17) — gorev satirinda
                              degil ekip uyesinin yaninda gosterilir; ayni ucusta bir
                              pilotun tavani kisa, digerininki tam olabilir. */}
                          {r.standby_reduction_min > 0 && (
                            <span style={{ ...badge('amber'), marginLeft:4 }} title={r.standby_ref || 'SHT-FTL/HG Md.17'}>
                              SB −{fmtMin(r.standby_reduction_min)}
                            </span>
                          )}
                          {/* İNTİBAK yalnız KALKIŞ MEYDANINDAN FARKLIYSA gösterilir:
                              aynıysa bilgi taşımaz, gürültü olur (alan 8 dersi). */}
                          {r.acclimatised_to &&
                           String(r.acclimatised_to).toUpperCase() !== String((r.sectors || [])[0]?.dep || '').toUpperCase() && (
                            <span style={{ ...badge('amber'), marginLeft:4 }} title="SHT-FTL/HG Md.22(1) — Table 1 band read in this aerodrome's local time">
                              ACCL {r.acclimatised_to}
                            </span>
                          )}
                        </span>;
                      })}
                      {d.check_ride && (
                        <span style={{ ...badge('amber'), marginLeft:4 }}>
                          CHECK RIDE{d.external_examiner ? ` · TRE/TRI: ${d.external_examiner}` : ''}
                        </span>
                      )}
                    </td>
                    <td style={S.td}>{statusBadge(d.status)}{d.match_review && <span style={{ ...badge('amber'), marginLeft:6 }}>REVIEW</span>}
                      {/* SKPK gorunur olmali: kaydin azami UGS/dinlenmesi komutan
                          kararıyla degistirilmis demektir. SHGM suresi gecmisse
                          KIRMIZI — takipcinin uyarisi burada da tekrarlanir. */}
                      {((d.skpk_fdp_extension_min || 0) > 0 || (d.skpk_rest_reduction_min || 0) > 0) && (
                        <span style={{ ...badge(d.skpk_authority_due && !d.skpk_authority_reported_at
                                                 && new Date(d.skpk_authority_due) < new Date() ? 'red' : 'amber'), marginLeft:6 }}
                              title={d.skpk_ref || 'SHT-FTL/HG Md.12'}>
                          SKPK{d.skpk_fdp_extension_min ? ` +${fmtMin(d.skpk_fdp_extension_min)}` : ''}{d.skpk_rest_reduction_min ? ` −${fmtMin(d.skpk_rest_reduction_min)}` : ''}
                        </span>
                      )}
                    </td>
                    <td style={{ ...S.td, textAlign:'right' }}>
                      {!allCancelled && d.duty_type === 'flight' && (
                        <button style={{ ...S.btnS, padding:'5px 10px', marginRight:6 }}
                                onClick={() => setEditing(g)}>EDIT</button>
                      )}
                      {!allCancelled && (
                        <button style={{ ...S.btnS, padding:'5px 10px', marginRight:6 }}
                                onClick={() => setPending({ mode:'cancel', rows:g.rows })}>CANCEL</button>
                      )}
                      {allDeletable && (
                        <button style={{ ...S.btnS, padding:'5px 10px', color:C.red, borderColor:C.red }}
                                onClick={() => setPending({ mode:'delete', rows:g.rows })}>DELETE</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...S.note, margin:'0 16px 16px' }}>
        CANCEL gorevi listeden duser ama kayitta birakir — gerceklesmis gorevlerde tek yol budur.
        DELETE yalnizca hic gerceklesmemis gorevde cikar (planned · uçusa baglanmamis); bu sart
        veritabaninda da dayatilir. Her ikisi de gerekce ister ve denetim izine yazilir.
      </div>

      {pending && (
        <ReasonModal
          title={pending.mode === 'delete' ? 'DELETE DUTY' : 'CANCEL DUTY'}
          confirmLabel={pending.mode === 'delete' ? 'DELETE & LOG' : 'CANCEL DUTY & LOG'}
          warn={pending.mode === 'delete'
            ? `${pending.rows.length} satir KALICI silinecek. Gorev hic gerceklesmedigi icin buna izin var; gerekce denetim izinde kalir.`
            : null}
          onCancel={() => setPending(null)}
          onConfirm={apply}
        />
      )}
      {editing && (
        <EditDutyModal
          group={editing} pilots={pilots} duties={duties} myProfile={myProfile}
          toast={toast}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

// ═══ 0a) EDIT DUTY (4 Agu, Serkan: "bazen sadece plan saatleri veya dest
// degisiyor veya crew") — YALNIZ ucus gorevleri.
// Kurallar (3 Agu):
//  - Saat/pilot her zaman duzeltilebilir, GEREKCE ZORUNLU (DB'de CHECK var).
//  - ACTUAL ucusta blok/plan saatleri KILITLI — tek kaynak arsiv. Yalniz crew
//    duzeltilebilir (yanlis kayit duzeltmesi).
//  - Pencere kaydin KENDI ruleset_snapshot'i ile yeniden hesaplanir — bugunku
//    ruleset'le DEGIL (gorev yazildigi gunun kuralina tabidir).
//  - Zincir etkisi: yeni earliest_next_report'tan ONCE rapor saatli sonraki
//    gorev varsa OTOMATIK DUZELTILMEZ, amber uyari verilir.
//  - TZ: saatler meydan dilimleriyle mutlaklastirilir (dinlenme atlanmaz).
function EditDutyModal({ group, pilots, duties, myProfile, toast, onClose, onSaved }) {
  const head = group.head;
  const isActual = head.status === 'actual' || head.duty_finished;
  const [legs, setLegs] = useState(() => (head.sectors || []).map(x => ({
    dep: x.dep || '', dest: x.dest || '', etd: x.etd || '', eta: x.eta || '' })));
  const [date, setDate] = useState(head.duty_date);
  const [crew, setCrew] = useState(() => group.rows.map(r => ({
    rowId: r.id, oldPilot: r.pilot_id, pilot: r.pilot_id,
    role: (r.sectors || [])[0]?.role || 'PF' })));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  // ── SKPK (Md.12) — SKPK bir PLANLAMA araci degil, OLMUS BITMIS bir olayin
  // kaydidir ("gorev baslangici SONRASINDA baslayan ongorulemeyen haller").
  // Bu yuzden yalniz planned OLMAYAN gorevlerde acilir.
  const skpkAllowed = head.status !== 'planned';
  const [skpkExt, setSkpkExt] = useState(() => fmtMin(head.skpk_fdp_extension_min || 0) === '—' ? '' : (head.skpk_fdp_extension_min ? fmtMin(head.skpk_fdp_extension_min) : ''));
  const [skpkRed, setSkpkRed] = useState(() => head.skpk_rest_reduction_min ? fmtMin(head.skpk_rest_reduction_min) : '');
  const [skpkReason, setSkpkReason] = useState(head.skpk_reason || '');

  const snapshotRuleset = head.ruleset_snapshot || null;
  const timeOk = (t) => /^\d{2}:\d{2}$/.test(t || '');
  // Faaliyet tipi gorevin KENDI kaydindan gelir (Md.9) — snapshot ile birlikte
  // gorevin yazildigi andaki kural evreni korunur. Opsiyonlar TEK KAYNAK:
  // ortak pencere ve pilot-bazli (nobet kisaltmali) pencere ayni sette kurulur.
  const winOpts = useMemo(() => ({
    threePilot: crew.some(c => c.role === 'CRZ CPT'),
    operationType: head.operation_type || 'air_taxi',
    trainingKind: head.training_kind,
    sameDayTheory: !!head.same_day_theory,
    singlePilot: crew.length === 1,
  }), [crew, head.operation_type, head.training_kind, head.same_day_theory]);
  // BANT SAATİ İÇİN MEYDAN DİLİMİ (Md.22/2): saatler UTC girildiği için Tablo 1
  // doğrudan UTC ile okunamaz. Görev İNTİBAK ETTİĞİ meydanı kaydında taşıyor
  // (`acclimatised_to`); yoksa kalkış meydanı kullanılır.
  const [bandTz, setBandTz] = useState(null);
  const bandIcao = (head.acclimatised_to || legs[0]?.dep || '').toUpperCase();
  useEffect(() => {
    if (!bandIcao || bandIcao.length !== 4) { setBandTz(null); return; }
    let dead = false;
    (async () => { const m = await fetchTzMap([bandIcao]); if (!dead) setBandTz(m[bandIcao] || null); })();
    return () => { dead = true; };
  }, [bandIcao]);

  const win = useMemo(() => {
    if (isActual || !snapshotRuleset) return null;
    const complete = legs.filter(l => timeOk(l.etd) && timeOk(l.eta));
    if (complete.length !== legs.length || !legs.length) return null;
    const w0 = dutyWindow(legs, head.accommodation || 'hotel', snapshotRuleset, winOpts);
    if (!w0 || !bandTz) return w0;                  // dilim yoksa bant UYDURULMAZ
    const ref = utcISO(date, legs[0]?.etd) || new Date().toISOString();
    const band = bandReportHHMM(w0.report, 0, tzOffsetMin(bandTz, new Date(ref).getTime()));
    return band ? dutyWindow(legs, head.accommodation || 'hotel', snapshotRuleset,
                             { ...winOpts, bandReport: band, acclimatisedTo: bandIcao }) : w0;
  }, [legs, snapshotRuleset, isActual, head.accommodation, winOpts, bandTz, bandIcao, date]);

  /** Bir pilotun bu gorev icin NOBET durumu (Md.17) — gorevin KENDI snapshot'iyla.
   *  EDIT'te iki yoldan gerekir: (1) saat/sektor degisti, (2) PILOT DEGISTI.
   *  (2) ozellikle onemli: nobette beklemis bir pilot yerine gecirildiginde
   *  azami UGS sessizce eski degerde kalirsa gorev yasadisi hale gelir. */
  const standbyFor = (pilotId, dutyDate, reportISO) => {
    if (!snapshotRuleset || !win) return { pWin: win, sb: null, sbDuty: null };
    const { rules } = effectiveRules(snapshotRuleset);
    const sbDuty = standbyBefore(duties, pilotId, dutyDate, reportISO);
    const sbEffect = sbDuty
      ? standbyEffect(sbDuty, rules, { fdpExtended: !!(win.split.isSplit || win.augmented) }) : null;
    const pWin = sbEffect?.fdpReductionMin
      ? dutyWindow(legs, head.accommodation || 'hotel', snapshotRuleset,
                   { ...winOpts, standbyReductionMin: sbEffect.fdpReductionMin })
      : win;
    return { pWin, sb: sbEffect ? standbyLimits(sbEffect, pWin.fdpMin) : null, sbDuty };
  };

  // ── SKPK (Md.12) — pilot bazli ────────────────────────────────────
  // TABAN DEGERLER HER ZAMAN GERI ALINARAK bulunur: kayittaki max_fdp ve
  // min_rest onceki bir SKPK'nin etkisini ZATEN icerebilir. Uzerine tekrar
  // eklersek ayni SKPK iki kez uygulanir (duzenleme her acildiginda buyur).
  // Bu yuzden: taban = kayitli deger EKSI kayitli SKPK etkisi. Idempotent.
  const skpkFor = (row) => {
    if (!snapshotRuleset || !skpkAllowed) return null;
    const { rules } = effectiveRules(snapshotRuleset);
    const baseMaxFdp = row.max_fdp_minutes != null
      ? row.max_fdp_minutes - (row.skpk_fdp_extension_min || 0) : null;
    const baseEarnedRest = row.min_rest_minutes != null
      ? row.min_rest_minutes - 2 * (row.skpk_rest_reduction_min || 0) : null;
    // Gerceklesen UGS: rapor → son ON BLOCK. Md.12(1)(c)(2) "GERCEKLESTIRILEN
    // UGS'nin artirilmasi" der — plan degil, OLAN.
    // DIKKAT — SAAT DILIMI: report_time timestamptz (mutlak), on_block ise
    // YEREL "HH:MM" dizgesi. Ikisini dogrudan karsilastirmak +03'te 3 saatlik
    // hata verir. Rapor once gorevin KENDI diliminde (report_tz = kalkis
    // meydani) yerellestirilir. report_tz yoksa TAHMIN URETMEYIZ (Ilke 1):
    // oneri gosterilmez, kaptanin beyani esas alinir.
    const lastOn = (row.sectors || []).slice(-1)[0]?.on_block;
    const repLocalHHMM = (row.report_time && row.report_tz)
      ? fmtMin(((new Date(row.report_time).getTime() / 60000)
                + tzOffsetMin(row.report_tz, new Date(row.report_time).getTime())) % 1440)
      : null;
    const actualFdpMin = (repLocalHHMM && lastOn)
      ? spanMin(repLocalHHMM, lastOn) : (row.fdp_minutes ?? null);
    const prev = previousDuty(duties, row.pilot_id, row.report_time, row.id);
    const skpk = skpkLimits(
      { fdpExtensionMin: toMin(skpkExt) || 0, restReductionMin: toMin(skpkRed) || 0 },
      rules,
      { augmented: !!(win?.augmented || (row.sectors || []).some(s => s.role === 'CRZ CPT')),
        baseMaxFdpMin: baseMaxFdp, fdpMin: actualFdpMin,
        earnedRestMin: baseEarnedRest,
        prevMinRestMin: prev?.min_rest_minutes ?? null,
        prevHadSkpkExtension: (prev?.skpk_fdp_extension_min || 0) > 0,
        dutyEndISO: row.duty_end });
    return { skpk, prev, baseMaxFdp, baseEarnedRest, actualFdpMin };
  };

  const nameOf = (pid) => { const x = pilots.find(p => p.id === pid); return x ? (x.code || x.full_name) : '—'; };
  const setLeg = (i, k, v) => setLegs(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const usedIds = crew.map(c => c.pilot);
  const options = (cur) => pilots.filter(p => ['pilot','admin_pilot'].includes(p.role))
    .filter(p => p.id === cur || !usedIds.includes(p.id));

  const save = async () => {
    if (!reason.trim()) { toast('Reason is mandatory.', 'error'); return; }
    setSaving(true);
    try {
      const edits = [];
      const updates = [];
      let tzWarn = null, chainWarn = [];

      // — SAATLER / SEKTORLER (yalniz planned) —
      let reportISO = head.report_time, endISO = head.duty_end;
      const sectorsChanged = !isActual &&
        JSON.stringify(legs) !== JSON.stringify((head.sectors || []).map(x => ({ dep:x.dep||'', dest:x.dest||'', etd:x.etd||'', eta:x.eta||'' })));
      const dateChanged = !isActual && date !== head.duty_date;
      if ((sectorsChanged || dateChanged)) {
        if (!win) { toast('Complete all sector fields.', 'error'); setSaving(false); return; }
        if (legs.some(l => !l.dep || !l.dest)) { toast('DEP/DEST required.', 'error'); setSaving(false); return; }
        // SAATLER UTC (Serkan ilkesi): mutlaklastirma duz. Meydan tz'si yalniz
        // uzun menzil tespiti ve Tablo 1 bandi icin.
        const tzMap = await fetchTzMap([legs[0].dep, legs[legs.length-1].dest]);
        const depTz = tzMap[legs[0].dep.toUpperCase()] || null;
        const destTz = tzMap[legs[legs.length-1].dest.toUpperCase()] || null;
        reportISO = utcISO(date, win.report);
        const lastEta = legs[legs.length - 1].eta;
        const crossesMidnight = toMin(lastEta) < toMin(win.report);
        const endDate = crossesMidnight ? nextDay(date) : date;
        const post = (snapshotRuleset?.company?.postFlightDutyMin ?? 30);
        endISO = addMin(utcISO(endDate, lastEta), post);
        if (depTz && destTz) {
          const diff = Math.abs(tzOffsetMin(destTz, new Date(endISO).getTime()) - tzOffsetMin(depTz, new Date(reportISO).getTime()));
          if (diff >= 240) tzWarn = `TZ CROSSING ${Math.round(diff/60)}H — verify additional rest per EASA ORO.FTL.235.`;
        }
      }

      // Regulasyon TAVANLARI (nobet Md.17 / SKPK Md.12) — delinirse yazma YOK.
      const blocked = [];
      for (const c of crew) {
        const row = group.rows.find(r => r.id === c.rowId);
        const upd = {};
        const crewChanged = c.pilot !== c.oldPilot;
        if (crewChanged) {
          upd.pilot_id = c.pilot;
          edits.push({ duty_id: row.id, customer_id: row.customer_id, pilot_id: c.oldPilot,
            assignment_id: row.assignment_id || null, edit_type: 'EDIT', field_name: 'crew',
            old_value: nameOf(c.oldPilot), new_value: nameOf(c.pilot),
            reason: reason.trim(), edited_by: myProfile?.id ?? null });
        }
        // NOBET (Md.17) — pilot bazli. Saat/sektor DEGISMESE BILE pilot degistiyse
        // yeniden cozulur: yeni pilotun nobeti varsa azami UGS onun icin kisadir.
        const { pWin, sb, sbDuty } = (!isActual && win && (sectorsChanged || dateChanged || crewChanged))
          ? standbyFor(c.pilot, date, reportISO)
          : { pWin: win, sb: null, sbDuty: null };
        if (sb && !sb.ok) blocked.push(`${nameOf(c.pilot)} — STANDBY: ${sb.reasons.join('; ')}`);
        if (!isActual && crewChanged && !sectorsChanged && !dateChanged && win) {
          // Yalniz ekip degisti: saatler ayni kalir, NOBET TURETILEN alanlar yenilenir.
          const oldRed = row.standby_reduction_min || 0;
          const newRed = sb?.fdpReductionMin || 0;
          if (newRed !== oldRed || (row.standby_duty_id || null) !== (sbDuty?.id || null)) {
            upd.max_fdp_minutes = pWin.maxFdpMin;
            upd.fdp_exceeded = !!pWin.fdpExceeded;
            upd.standby_reduction_min = newRed || null;
            upd.standby_duty_id = sbDuty?.id || null;
            upd.standby_ref = sb ? standbyRef(sbDuty, sb) : null;
            edits.push({ duty_id: row.id, customer_id: row.customer_id, pilot_id: c.pilot,
              assignment_id: row.assignment_id || null, edit_type: 'EDIT', field_name: 'standby/max_fdp',
              old_value: `MAX ${fmtMin(row.max_fdp_minutes)} · standby −${fmtMin(oldRed)}`,
              new_value: `MAX ${fmtMin(pWin.maxFdpMin)} · standby −${fmtMin(newRed)}${sb ? ` (${sb.reference})` : ''}`,
              reason: reason.trim(), edited_by: myProfile?.id ?? null });
          }
        }
        if (sectorsChanged || dateChanged) {
          upd.duty_date = date;
          upd.sectors = legs.map((l, i) => ({ ...(row.sectors?.[i] || {}), seq: i + 1,
            dep: l.dep.toUpperCase(), dest: l.dest.toUpperCase(), etd: l.etd, eta: l.eta,
            role: c.role }));
          upd.report_time = reportISO; upd.duty_end = endISO;
          upd.max_fdp_minutes = pWin.maxFdpMin; upd.fdp_minutes = pWin.fdpMin;
          upd.fdp_exceeded = !!pWin.fdpExceeded;
          upd.standby_reduction_min = sb?.fdpReductionMin || null;
          upd.standby_duty_id = sbDuty?.id || null;
          upd.standby_ref = sb ? standbyRef(sbDuty, sb) : null;
          const newDutyMin = pWin.dutyMin || 0;
          upd.min_rest_minutes = Math.max(newDutyMin, row.min_rest_minutes || 0);
          upd.earliest_next_report = addMin(endISO, upd.min_rest_minutes);
          edits.push({ duty_id: row.id, customer_id: row.customer_id, pilot_id: c.pilot,
            assignment_id: row.assignment_id || null, edit_type: 'EDIT', field_name: 'sectors/times',
            old_value: `${String(head.report_time).slice(0,16)} → ${String(head.duty_end).slice(0,16)} · ${(head.sectors||[]).map(x=>`${x.dep}-${x.dest}`).join(' ')}`,
            new_value: `${String(reportISO).slice(0,16)} → ${String(endISO).slice(0,16)} · ${legs.map(x=>`${x.dep}-${x.dest}`).join(' ')}`,
            reason: reason.trim(), edited_by: myProfile?.id ?? null });
          // ZINCIR UYARISI: bu pilotun sonraki gorevi yeni dinlenme penceresini deliyor mu?
          const nxt = (duties || []).filter(x => x.pilot_id === c.pilot && x.id !== row.id &&
            x.status !== 'cancelled' && x.report_time && x.report_time > endISO)
            .sort((a, b) => String(a.report_time).localeCompare(String(b.report_time)))[0];
          if (nxt && upd.earliest_next_report && nxt.report_time < upd.earliest_next_report) {
            chainWarn.push(`${nameOf(c.pilot)}: next duty ${fmtDT(nxt.report_time)} < earliest ${fmtDT(upd.earliest_next_report)}`);
          }
        }

        // ── SKPK (Md.12) ────────────────────────────────────────────
        // Komutanın kararı TÜM EKİBİ bağlar (tek uçuş, tek karar) — bu yüzden
        // gruptaki her satıra aynı uzatma/kısaltma işlenir; ama TABAN ve
        // "hak edilen dinlenme" pilot bazlıdır, o yüzden hesap satır satır.
        const extIn = toMin(skpkExt) || 0, redIn = toMin(skpkRed) || 0;
        const skpkChanged = skpkAllowed && (
          extIn !== (row.skpk_fdp_extension_min || 0) ||
          redIn !== (row.skpk_rest_reduction_min || 0) ||
          (skpkReason || '').trim() !== (row.skpk_reason || ''));
        if (skpkChanged) {
          // Md.12(1)(c)(1): SKPK varsa işleticiye rapor İSTİSNASIZ sunulur —
          // gerekçesiz SKPK kaydı yasaktır (boş gerekçe yasağıyla aynı ilke).
          if ((extIn > 0 || redIn > 0) && !skpkReason.trim()) {
            toast('COMMANDER\'S REPORT is mandatory for any SKPK (SHT-FTL/HG Md.12/1/c/1).', 'error');
            setSaving(false); return;
          }
          const s = skpkFor(row);
          if (s && !s.skpk.ok) blocked.push(`${nameOf(c.pilot)} — SKPK: ${s.skpk.reasons.join('; ')}`);
          const baseMax = upd.max_fdp_minutes != null ? upd.max_fdp_minutes : s?.baseMaxFdp;
          const baseRest = upd.min_rest_minutes != null && (sectorsChanged || dateChanged)
            ? upd.min_rest_minutes : s?.baseEarnedRest;
          const newMax = baseMax != null ? baseMax + extIn : null;
          const newRest = baseRest != null ? baseRest + (redIn * 2) : null;
          const endForRest = upd.duty_end || row.duty_end;
          if (newMax != null) upd.max_fdp_minutes = newMax;
          if (s?.skpk.fdpStillExceeded != null) upd.fdp_exceeded = !!s.skpk.fdpStillExceeded;
          if (newRest != null) {
            upd.min_rest_minutes = newRest;
            upd.earliest_next_report = addMin(endForRest, newRest);
          }
          upd.skpk_fdp_extension_min = extIn || null;
          upd.skpk_rest_reduction_min = redIn || null;
          upd.skpk_reason = skpkReason.trim() || null;
          // İşleticiye rapor damgası: ilk kez kaydedildiğinde atılır, sonraki
          // düzeltmelerde KORUNUR (raporun ne zaman sunulduğu geriye kaymaz).
          upd.skpk_reported_at = (extIn > 0 || redIn > 0)
            ? (row.skpk_reported_at || new Date().toISOString()) : null;
          upd.skpk_authority_due = s?.skpk.authorityDueISO || null;
          if (!s?.skpk.authorityReportRequired) upd.skpk_authority_reported_at = null;
          upd.skpk_ref = s ? skpkRef(s.skpk) : null;
          edits.push({ duty_id: row.id, customer_id: row.customer_id, pilot_id: c.pilot,
            assignment_id: row.assignment_id || null, edit_type: 'EDIT', field_name: 'skpk',
            old_value: `FDP +${fmtMin(row.skpk_fdp_extension_min || 0)} · REST −${fmtMin(row.skpk_rest_reduction_min || 0)}`,
            new_value: `FDP +${fmtMin(extIn)} · REST −${fmtMin(redIn)}${s?.skpk.authorityReportRequired ? ' · DGCA REPORT DUE' : ''} — ${skpkReason.trim() || '(cleared)'}`,
            reason: reason.trim(), edited_by: myProfile?.id ?? null });
          // Telafi zinciri: artan dinlenme sonraki görevi deliyor mu?
          const nx = (duties || []).filter(x => x.pilot_id === c.pilot && x.id !== row.id &&
            x.status !== 'cancelled' && x.report_time && x.report_time > endForRest)
            .sort((a, b) => String(a.report_time).localeCompare(String(b.report_time)))[0];
          if (nx && upd.earliest_next_report && nx.report_time < upd.earliest_next_report) {
            chainWarn.push(`${nameOf(c.pilot)}: SKPK compensation pushes rest to ${fmtDT(upd.earliest_next_report)}, next duty starts ${fmtDT(nx.report_time)}`);
          }
        }
        if (Object.keys(upd).length) updates.push({ id: row.id, upd });
      }

      // REGULASYON KAPISI (Md.17 nobet / Md.12 SKPK): tavan deliniyorsa YAZILMAZ.
      // Iz de yazilmaz — degisiklik hic olmadi, reddedildi.
      if (blocked.length) {
        toast(`REGULATORY LIMIT — ${blocked.join(' | ')}`, 'error'); setSaving(false); return;
      }
      if (!edits.length) { toast('No changes.', 'error'); setSaving(false); return; }
      // IZ ONCE yazilir (silme/iptalle ayni ilke).
      const { error: eErr } = await supabase.from('ftl_duty_edits').insert(edits);
      if (eErr) { toast(`Audit write failed: ${eErr.message}`, 'error'); setSaving(false); return; }
      for (const u of updates) {
        const { error } = await supabase.from('crew_duties').update(u.upd).eq('id', u.id);
        if (error) { toast(`Update failed: ${error.message}`, 'error'); setSaving(false); return; }
      }
      toast(`Duty updated (${edits.length} change(s) logged).`, 'success');
      if (tzWarn) toast(tzWarn, 'error');
      chainWarn.forEach(w => toast(`CHAIN: ${w} — NOT auto-fixed, review.`, 'error'));
      onSaved();
    } catch (e) { toast(String(e.message || e), 'error'); }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:200,
                  display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--bg2)', border:`1px solid ${C.border2}`, width:'100%', maxWidth:680,
                    maxHeight:'90vh', overflowY:'auto', padding:20 }}>
        <div style={{ ...S.panelT, marginBottom:4 }}>EDIT DUTY — {fmtD(head.duty_date)}</div>
        <div style={{ ...S.note, marginBottom:14 }}>
          {isActual
            ? 'ACTUAL duty: times are LOCKED (single source = archived flight). Crew can be corrected with a reason.'
            : 'Window is recomputed with the duty\'s OWN ruleset snapshot. Times use airport timezones.'}
        </div>

        {!isActual && (<>
          <span style={S.label}>Date</span>
          <input type="date" style={{ ...S.input, width:170, marginBottom:10 }} value={date} onChange={e => setDate(e.target.value)} />
          <span style={S.label}>Sectors</span>
          {legs.map((l, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'26px 1fr 1fr 1fr 1fr 38px', gap:8, marginBottom:6, alignItems:'center' }}>
              <div style={{ fontSize:11, color:C.t3, textAlign:'center', fontFamily:'var(--mono)' }}>{i + 1}</div>
              <input style={S.input} maxLength={4} value={l.dep} onChange={e => setLeg(i, 'dep', e.target.value.toUpperCase())} />
              <input style={S.input} maxLength={4} value={l.dest} onChange={e => setLeg(i, 'dest', e.target.value.toUpperCase())} />
              <input style={S.input} value={l.etd} onChange={e => setLeg(i, 'etd', normTime(e.target.value))} />
              <input style={S.input} value={l.eta} onChange={e => setLeg(i, 'eta', normTime(e.target.value))} />
              {/* SEKTOR SIL (4 Agu, Serkan: "ucusun birini alabilmem lazim") —
                  en az 1 bacak kalir; pencere yeni listeden yeniden hesaplanir. */}
              <button style={{ ...S.btnS, padding:'8px 10px', color:C.red }}
                      onClick={() => setLegs(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}>✕</button>
            </div>
          ))}
          <button style={{ ...S.btnS, borderStyle:'dashed', color:C.t3, marginBottom:6 }}
                  onClick={() => setLegs(ls => [...ls, { dep: ls[ls.length-1]?.dest || '', dest:'', etd:'', eta:'' }])}>+ ADD SECTOR</button>
          {win && (
            <div style={{ ...S.note, borderLeftColor: win.fdpExceeded ? C.red : C.accent, margin:'8px 0' }}>
              REPORT {win.report} · FDP {fmtMin(win.fdpMin)} / MAX {fmtMin(win.maxFdpMin)}
              {win.augmented ? ' · 3-PILOT (EASA CS FTL.1.205(c))' : ''}
              {win.fdpExceeded ? ' · EXCEEDED' : ''}
            </div>
          )}
          {/* NOBET (Md.17) — pilot bazli oldugu icin yukaridaki tek satir yetmez.
              Kaydetmeden ONCE hangi pilotun tavaninin nereye dustugu gorunur. */}
          {win && (() => {
            const est = utcISO(date, win.report);
            const rows = crew.map(c => ({ c, ...standbyFor(c.pilot, date, est) })).filter(r => r.sb);
            if (!rows.length) return null;
            return rows.map(({ c, pWin, sb }) => (
              <div key={c.rowId} style={{ ...S.note, margin:'0 0 8px',
                     borderLeftColor: sb.ok ? C.accent : C.red, color: sb.ok ? C.t2 : C.red }}>
                {nameOf(c.pilot)} — {sb.kind === 'airport_standby' ? 'AIRPORT' : 'OTHER'} STANDBY {fmtMin(sb.standbyMin)} ({sb.reference})
                {sb.fdpReductionMin > 0 ? ` · MAX FDP −${fmtMin(sb.fdpReductionMin)} → ${fmtMin(pWin.maxFdpMin)}` : ' · NO FDP REDUCTION'}
                {sb.reasons.length ? ` · ${sb.reasons.join('; ')}` : ''}
              </div>
            ));
          })()}
        </>)}

        <span style={S.label}>Crew</span>
        {crew.map((c, i) => (
          <div key={c.rowId} style={{ display:'grid', gridTemplateColumns:'90px 1fr', gap:8, marginBottom:6, alignItems:'center' }}>
            <div style={{ fontSize:11, color:C.t3, fontFamily:'var(--mono)' }}>{c.role}</div>
            <select style={S.input} value={c.pilot}
                    onChange={e => setCrew(cs => cs.map((x, j) => j === i ? { ...x, pilot: e.target.value } : x))}>
              {options(c.pilot).map(pp => <option key={pp.id} value={pp.id}>{pp.code} — {pp.full_name}</option>)}
            </select>
          </div>
        ))}

        {/* ── SKPK — SORUMLU KAPTAN PILOT KARARI (SHT-FTL/HG Md.12) ──────
              Yalniz GERCEKLESMIS gorevde: Md.12(1) "gorev baslangici SONRASINDA
              baslayan ongorulemeyen haller" der — SKPK planlama araci degildir.
              Girilen degerler kaydin azami UGS'sini ve dinlenmesini DEGISTIRIR;
              bu yuzden ayri bir bolum, gizli bir yan etki degil. ── */}
        {skpkAllowed && (
          <div style={{ border:`1px dashed ${C.border2}`, padding:'12px 14px', margin:'14px 0' }}>
            <div style={{ ...S.panelT, marginBottom:6 }}>COMMANDER'S DISCRETION — SKPK (Md.12)</div>
            <div style={{ ...S.note, marginBottom:10 }}>
              Record what the commander actually did AFTER duty start because of unforeseen circumstances.
              Leave blank if none. Any entry changes this duty's MAX FDP and rest, is reported to the
              operator (Md.12/1/c/1), and — if it exceeds 01:00 — must reach the DGCA within 28 days (Md.12/1/c/2).
            </div>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:10 }}>
              <div style={{ width:150 }}><span style={S.label}>FDP extension</span>
                <input style={S.input} placeholder="HH:MM" value={skpkExt}
                       onChange={e => setSkpkExt(normTime(e.target.value))} /></div>
              <div style={{ width:150 }}><span style={S.label}>Rest reduction</span>
                <input style={S.input} placeholder="HH:MM" value={skpkRed}
                       onChange={e => setSkpkRed(normTime(e.target.value))} /></div>
            </div>
            {/* PILOT BAZLI SONUC — taban ve hak edilen dinlenme pilota gore degisir */}
            {group.rows.map(row => {
              const s = skpkFor(row);
              if (!s) return null;
              const k = s.skpk;
              const showSuggest = !skpkExt && s.actualFdpMin != null && s.baseMaxFdp != null
                                  && s.actualFdpMin > s.baseMaxFdp;
              return (
                <div key={row.id} style={{ ...S.note, marginBottom:8,
                       borderLeftColor: k.ok ? C.accent : C.red, color: k.ok ? C.t2 : C.red }}>
                  <b>{nameOf(row.pilot_id)}</b>
                  {' · '}MAX FDP {fmtMin(s.baseMaxFdp)}{k.extensionMin > 0 ? ` → ${fmtMin(k.maxFdpWithSkpkMin)}` : ''}
                  {s.actualFdpMin != null && <> · ACTUAL FDP {fmtMin(s.actualFdpMin)}{k.fdpStillExceeded ? ' — STILL EXCEEDED' : ''}</>}
                  {k.reductionMin > 0 && <>
                    {' · '}EARNED REST BEFORE {fmtMin(s.prev?.min_rest_minutes)} − {fmtMin(k.reductionMin)} = {fmtMin(k.restAfterReductionMin)} (floor {fmtMin(k.restFloorMin)})
                    {' · '}NEXT REST {fmtMin(s.baseEarnedRest)} → {fmtMin(k.minRestWithCompensationMin)} (2× Md.12/2)
                  </>}
                  {k.applied && <> · {k.authorityReportRequired
                    ? `DGCA REPORT DUE ${fmtD(k.authorityDueISO)}`
                    : 'OPERATOR REPORT ONLY (≤01:00)'}</>}
                  {k.reasons.length ? <> · {k.reasons.join('; ')}</> : null}
                  {showSuggest && (
                    <div style={{ marginTop:6 }}>
                      {/* ILKE 1: hesaplanan degeri KENDIMIZ yazmayiz — oneririz,
                          insan onaylar. Uydurma yok, sessiz yazma da yok. */}
                      <button style={{ ...S.btnS, padding:'4px 10px' }}
                              onClick={() => setSkpkExt(fmtMin(s.actualFdpMin - s.baseMaxFdp))}>
                        USE {fmtMin(s.actualFdpMin - s.baseMaxFdp)} (actual {fmtMin(s.actualFdpMin)} − max {fmtMin(s.baseMaxFdp)})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <span style={S.label}>Commander's report (mandatory when SKPK is used — Md.12/1/c/1)</span>
            <textarea style={{ ...S.input, minHeight:60, resize:'vertical' }} value={skpkReason}
                      onChange={e => setSkpkReason(e.target.value)}
                      placeholder="Unforeseen circumstances and what the commander decided…" />
            {head.skpk_reported_at && (
              <div style={{ ...S.note, marginTop:8 }}>
                REPORTED TO OPERATOR {fmtDT(head.skpk_reported_at)}
                {head.skpk_authority_due && <> · DGCA DUE {fmtD(head.skpk_authority_due)}
                  {head.skpk_authority_reported_at
                    ? ` · SENT ${fmtD(head.skpk_authority_reported_at)}`
                    : ' · NOT SENT YET'}</>}
              </div>
            )}
          </div>
        )}

        <span style={S.label}>Reason (mandatory — audit trail)</span>
        <textarea style={{ ...S.input, minHeight:70, resize:'vertical' }} value={reason} onChange={e => setReason(e.target.value)} />

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:14 }}>
          <button style={S.btnS} onClick={onClose}>CANCEL</button>
          <button style={{ ...S.btnP, opacity: reason.trim() && !saving ? 1 : .45 }} disabled={!reason.trim() || saving}
                  onClick={save}>SAVE & LOG</button>
        </div>
      </div>
    </div>
  );
}

// ═══ 0b) FTL EDIT REPORT — DENETIM IZI (ftl_duty_edits) ═══════════
// Serkan: "crew modulde yapilan edit ve delete islemlerinin log kayitlarini
// goremiyorum — FTL edit report olsun."
// Gorulmeyen denetim izi yarim denetim izidir. Ozellikle SILINEN gorevlerde
// bu kayit TEK kanittir: satir artik yok, geriye yalniz mezar tasi kaliyor.
// Tablo bilerek degistirilemez ve silinemez (UPDATE/DELETE policy YOK).
function EditReport({ pilots, edits, duties }) {
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const [pilotId, setPilotId] = useState('');
  const [from, setFrom] = useState(() => plus(today, -30));
  const [to, setTo] = useState(today);

  const pilotName = (id) => {
    const p = pilots.find(x => x.id === id);
    return p ? `${p.code || '—'} — ${p.full_name || ''}`.trim() : '—';
  };
  const dutyOf = (id) => (duties || []).find(d => d.id === id);

  const rows = useMemo(() => (edits || []).filter(e => {
    const day = String(e.created_at || '').slice(0, 10);
    if (day < from || day > to) return false;
    if (pilotId && e.pilot_id !== pilotId) return false;
    return true;
  }), [edits, from, to, pilotId]);

  const kindBadge = (t) => {
    const k = t === 'DELETE' ? 'red' : t === 'CANCEL' ? 'amber'
            : t === 'CREW_CHANGE' ? 'blue' : t === 'AUTO_CREATED' ? 'dim' : 'blue';
    return <span style={badge(k)}>{t}</span>;
  };

  // AYRI PENCEREYE BAS — window.print() dogrudan cagrilirsa admin panelinin
  // TAMAMI (sol menu, sekmeler, filtreler) kagida gider. DutyHistory zaten
  // boyle yapiyor; ayni desen.
  const printReport = () => {
    const esc = (x) => String(x ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const body = rows.map(e => {
      const d = dutyOf(e.duty_id);
      const duty = d ? `${fmtD(d.duty_date)} ${routeOf(d)}` : 'DELETED';
      return `<tr class="${e.edit_type === 'DELETE' ? 'del' : ''}">
        <td>${esc(fmtDT(e.created_at))}</td>
        <td>${esc(pilotName(e.pilot_id))}</td>
        <td>${esc(duty)}</td>
        <td class="k">${esc(e.edit_type)}</td>
        <td>${esc(e.field_name)}</td>
        <td><s class="old">${esc(e.old_value)}</s> &rarr; <b class="new">${esc(e.new_value)}</b></td>
        <td class="rsn">${esc(e.reason)}</td></tr>`;
    }).join('');
    const who = pilotId ? pilotName(pilotId) : 'ALL PILOTS';
    const w = window.open('', '_blank', 'width=1000,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>FTL Edit Report</title><style>
      body{font-family:-apple-system,'Helvetica Neue',sans-serif;color:#0f172a;background:#fff;margin:28px;font-size:12px}
      h1{font-size:15px;letter-spacing:2px;margin:0 0 2px}
      .sub{font-size:10px;color:#64748b;margin-bottom:14px}
      .meta{display:flex;gap:28px;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:14px;background:#f8fafc}
      .meta div{font-size:11px}.meta b{display:block;font-size:9px;color:#64748b;letter-spacing:1px;margin-bottom:2px}
      table{width:100%;border-collapse:collapse;font-family:ui-monospace,Menlo,monospace;font-size:10.5px}
      th{background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:6px 8px;text-align:left;font-size:9px;letter-spacing:1px;color:#475569}
      td{padding:5px 8px;border-bottom:1px solid #eef2f7;vertical-align:top}
      td.k{font-weight:800;letter-spacing:1px}
      tr.del td.k{color:#b91c1c}
      .old{color:#b91c1c}.new{color:#15803d}
      .rsn{white-space:normal;font-family:-apple-system,sans-serif}
      .note{font-size:9px;color:#64748b;margin-top:10px;border-top:1px solid #e2e8f0;padding-top:8px}
      @media print{body{margin:10mm}}
    </style></head><body>
      <h1>FTL EDIT REPORT — DUTY AUDIT TRAIL</h1>
      <div class="sub">GO2 Aviation &middot; Generated ${new Date().toLocaleString('en-GB')} &middot; ftl_duty_edits</div>
      <div class="meta">
        <div><b>PILOT</b>${esc(who)}</div>
        <div><b>PERIOD</b>${esc(from)} &rarr; ${esc(to)}</div>
        <div><b>ENTRIES</b>${rows.length}</div>
      </div>
      <table><thead><tr><th>WHEN</th><th>PILOT</th><th>DUTY</th><th>ACTION</th>
        <th>FIELD</th><th>OLD &rarr; NEW</th><th>REASON</th></tr></thead>
      <tbody>${body || '<tr><td colspan="7">No edits recorded in selected period.</td></tr>'}</tbody></table>
      <div class="note">These records cannot be modified or deleted (no UPDATE/DELETE policy).
        A reason is mandatory and enforced at database level. Where DUTY reads DELETED the duty row
        no longer exists — this entry is the only remaining record of it. All times local.</div>
    <script>window.onload=function(){window.print();}</${'script'}></body></html>`);
    w.document.close();
  };

  return (
    <div style={S.panel}>
      <div style={S.panelH}>
        <span style={S.panelT}>FTL edit report — audit trail</span>
        <span style={{ fontSize:9, color:C.t3, letterSpacing:1, fontFamily:'var(--mono)' }}>
          ftl_duty_edits · immutable · no delete
        </span>
      </div>

      <div style={{ display:'flex', gap:14, alignItems:'flex-end', padding:'14px 16px', flexWrap:'wrap' }}>
        <div style={{ width:260 }}><span style={S.label}>Pilot</span>
          <select style={S.input} value={pilotId} onChange={e => setPilotId(e.target.value)}>
            <option value="">ALL PILOTS</option>
            {pilots.filter(p => ['pilot','admin_pilot'].includes(p.role))
                   .map(p => <option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>)}
          </select></div>
        <div style={{ width:170 }}><span style={S.label}>From</span>
          <input type="date" style={S.input} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div style={{ width:170 }}><span style={S.label}>To</span>
          <input type="date" style={S.input} value={to} onChange={e => setTo(e.target.value)} /></div>
        <div style={{ flex:1 }} />
        <button style={S.btnS} onClick={printReport}>PRINT / PDF</button>
      </div>

      {!rows.length ? (
        <div style={{ ...S.note, margin:'0 16px 16px' }}>NO EDITS RECORDED IN THIS RANGE.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={S.table}>
            <thead><tr>
              <th style={S.th}>When</th><th style={S.th}>Pilot</th><th style={S.th}>Duty</th>
              <th style={S.th}>Action</th><th style={S.th}>Field</th>
              <th style={S.th}>Old → New</th><th style={S.th}>Reason</th>
            </tr></thead>
            <tbody>
              {rows.map(e => {
                const d = dutyOf(e.duty_id);
                return (
                  <tr key={e.id}>
                    <td style={S.td}>{fmtDT(e.created_at)}</td>
                    <td style={S.td}>{pilotName(e.pilot_id)}</td>
                    <td style={S.td}>
                      {d ? `${fmtD(d.duty_date)} ${routeOf(d)}`
                         : <span style={{ color:C.t3 }}>— deleted —</span>}
                    </td>
                    <td style={S.td}>{kindBadge(e.edit_type)}</td>
                    <td style={S.td}>{e.field_name || '—'}</td>
                    <td style={{ ...S.td, whiteSpace:'normal' }}>
                      <span style={{ color:C.red, textDecoration:'line-through' }}>{e.old_value || '—'}</span>
                      <span style={{ color:C.t3 }}> → </span>
                      <span style={{ color:C.green, fontWeight:700 }}>{e.new_value || '—'}</span>
                    </td>
                    <td style={{ ...S.td, whiteSpace:'normal', fontWeight:400 }}>{e.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...S.note, margin:'12px 16px 16px' }}>
        Bu kayitlar degistirilemez ve silinemez. Gerekce zorunludur — bos gerekce
        veritabani seviyesinde reddedilir. "Duty" sutununda <b>— deleted —</b> yaziyorsa
        gorev satiri artik yoktur; o gorevden geriye YALNIZ bu kayit kalmistir.
      </div>
    </div>
  );
}

// ═══ 1) ASSIGN DUTY ═══════════════════════════════════════════════
function AssignDuty({ toast, myProfile, pilots, duties, baselines, ruleset, offTypes, homeBases, reload }) {
  const [dutyType, setDutyType] = useState('flight');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [legs, setLegs] = useState([{ dep:'', dest:'', etd:'', eta:'' }]);
  const [accommodation, setAccommodation] = useState('hotel');
  const [selected, setSelected] = useState({}); // pilotId -> 'PF'|'PM'|'CREW'
  const [gnd, setGnd] = useState({ kind:'office', start:'09:00', end:'17:00' });
  const [off, setOff] = useState({ subtype:'OFF', endDate:'' });
  const [saving, setSaving] = useState(false);
  // 3 PILOTLU OPS / CHECK RIDE (4 Agu, Serkan). extraMode:
  //   null → kapali · 'pick' → secim acik · 'crz' → CRZ CPT modu (listeden
  //   3. pilot secilir, EASA CS FTL.1.205(c) augmented FDP devreye girer) ·
  //   'checkride' → dis TRE/TRI adi elle girilir + CHECK RIDE isareti.
  // Pairing (PF/PM) mantigina DOKUNMAZ. Check ride augmented FDP GETIRMEZ
  // (jump seat denetcisi dinlenme rotasyonu saglamaz).
  const [extraMode, setExtraMode] = useState(null);
  const [examiner, setExaminer] = useState('');
  // FAALIYET TIPI (SHT-FTL/HG Md.9): hangi faaliyeti icra ediyorsak O bolumun
  // limitleri gecerlidir. air_taxi/aerial_work → Md.22 Tablo 1,
  // general_aviation → Md.25 (duz), training → Md.27 (UGS 12h + ucus siniri).
  const [opType, setOpType] = useState('air_taxi');
  const [trainingKind, setTrainingKind] = useState('instructor_examiner');
  const [sameDayTheory, setSameDayTheory] = useState(false);

  const timeOk = (t) => /^\d{2}:\d{2}$/.test(t || '');
  // UZUN MENZIL TESPITI (SHT-FTL/HG Md.4(ee)): kalkis-varis dilim farki >=4h.
  // Meydan tz'leri async cekilir; gelene kadar longRange=false, gelince pencere
  // canli yeniden hesaplanir (Md.22(3) 14:00 tavani motor icinde uygulanir).
  // Ana us dilimleri: YEREL GECE (Md.4(ff)) ekip uyesinin ana ussunun yerel
  // saatiyle olculur — dispatcher'in tarayici dilimiyle degil.
  const [hbTz, setHbTz] = useState({});
  useEffect(() => {
    const icaos = [...new Set(Object.values(homeBases || {}).filter(Boolean))];
    if (!icaos.length) { setHbTz({}); return; }
    let dead = false;
    (async () => {
      const m = await fetchTzMap(icaos);
      if (dead) return;
      const out = {};
      Object.entries(homeBases || {}).forEach(([pid, icao]) => {
        if (icao && m[icao.toUpperCase()]) out[pid] = m[icao.toUpperCase()];
      });
      setHbTz(out);
    })();
    return () => { dead = true; };
  }, [homeBases]);

  // FAALIYET TIPI PLANDAN (6 Agu 2026, Serkan): ucusun niteligi ATC FPL'inde
  // zaten yazili (RMK/BUSINESS FLIGHT → hava taksi, RMK/PRIVATE FLIGHT → GH).
  // Ayni tarih+DEP+DEST'te plan varsa tip ONDAN gelir; elle secim yine mumkun
  // ama kaynak kayda gecer — hangi limitin NEDEN uygulandigi belgelenir.
  const [planOp, setPlanOp] = useState(null);   // {type, source, planId}
  const [opManual, setOpManual] = useState(false);
  useEffect(() => {
    if (dutyType !== 'flight') { setPlanOp(null); return; }
    const dep = legs[0]?.dep, dest = legs[legs.length - 1]?.dest;
    if (!dep || dep.length !== 4 || !dest || dest.length !== 4 || !date) { setPlanOp(null); return; }
    let dead = false;
    (async () => {
      const { data } = await supabase.from('plans')
        .select('id,dep,dest,date,operation_type,operation_type_source,fpl_remark')
        .eq('dep', dep.toUpperCase()).eq('dest', dest.toUpperCase())
        .not('operation_type', 'is', null).limit(20);
      if (dead) return;
      // plans.date "05 AUG 2026" bicimindedir; gorev tarihi ISO. Gun/ay/yil esle.
      const target = new Date(date + 'T12:00:00Z');
      const hit = (data || []).find(p => {
        const d = new Date(String(p.date || '').replace(/(\d{1,2}) (\w{3}) (\d{4})/, '$2 $1, $3'));
        return !isNaN(d) && d.getUTCFullYear() === target.getUTCFullYear()
          && d.getUTCMonth() === target.getUTCMonth() && d.getUTCDate() === target.getUTCDate();
      }) || (data || [])[0];
      setPlanOp(hit ? { type: hit.operation_type, source: hit.operation_type_source, planId: hit.id } : null);
    })();
    return () => { dead = true; };
  }, [dutyType, legs, date]);
  useEffect(() => {
    if (planOp?.type && !opManual) setOpType(planOp.type);
  }, [planOp, opManual]);

  // ── İNTİBAK (Md.22/1) — PİLOT BAZLI ────────────────────────────────
  // Zincir görev geçmişinden çözülür: pilotun bu görevden ÖNCEKİ görevi, onun
  // intibak referansı (acclimatised_to, yoksa kalkış meydanı), aradaki dinlenme
  // ve ana üssü. Sonuç Tablo 1'in hangi bantla okunacağını belirler.
  // Nöbet gibi PİLOT BAZLIDIR: aynı uçuşa atanan iki pilot farklı yerlerden
  // gelmiş olabilir, biri intibaklı diğeri değil.
  const [acclTz, setAcclTz] = useState({});   // icao -> IANA tz (ihtiyaç duyulanlar)
  useEffect(() => {
    if (dutyType !== 'flight') return;
    const dep = legs[0]?.dep;
    const refs = new Set();
    if (dep && dep.length === 4) refs.add(dep.toUpperCase());
    Object.values(homeBases || {}).forEach(h => h && refs.add(String(h).toUpperCase()));
    (duties || []).forEach(d => {
      if (d.acclimatised_to) refs.add(String(d.acclimatised_to).toUpperCase());
      const s0 = (d.sectors || [])[0];
      if (s0?.dep) refs.add(String(s0.dep).toUpperCase());
      const sl = (d.sectors || []).slice(-1)[0];
      if (sl?.actual_dest) refs.add(String(sl.actual_dest).toUpperCase());
      if (sl?.dest) refs.add(String(sl.dest).toUpperCase());
    });
    if (!refs.size) return;
    let dead = false;
    (async () => {
      const m = await fetchTzMap([...refs]);
      if (!dead) setAcclTz(m);
    })();
    return () => { dead = true; };
  }, [dutyType, legs, duties, homeBases]);

  const [tzDiffH, setTzDiffH] = useState(null);
  useEffect(() => {
    if (dutyType !== 'flight') { setTzDiffH(null); return; }
    const dep = legs[0]?.dep, dest = legs[legs.length - 1]?.dest;
    if (!dep || dep.length !== 4 || !dest || dest.length !== 4) { setTzDiffH(null); return; }
    let dead = false;
    (async () => {
      const m = await fetchTzMap([dep, dest]);
      if (dead) return;
      const a = m[dep.toUpperCase()], b = m[dest.toUpperCase()];
      if (!a || !b) { setTzDiffH(null); return; }
      const now = Date.now();
      setTzDiffH(Math.abs(tzOffsetMin(a, now) - tzOffsetMin(b, now)) / 60);
    })();
    return () => { dead = true; };
  }, [dutyType, legs]);
  // PENCERE OPSIYONLARI TEK KAYNAK: ortak (nobetsiz) pencere ile her pilotun
  // KENDI (nobet kisaltmali) penceresi ayni opsiyonlarla kurulur — ikisi zamanla
  // ayrismasin diye tek yerde duruyor.
  // KALKIŞ MEYDANININ UTC OFSETİ — ortak pencerenin bandı için.
  // Saatler UTC girildiği için Tablo 1'i doğrudan UTC ile okumak YANLIŞ olur
  // (Md.22/2 "görev başlangıç saati YEREL" der). Ortak pencere, ekibin çoğunun
  // hâli olan "kalkış meydanına intibaklı" varsayımıyla bandı çözer; pilot
  // bazlı GERÇEK bant aşağıda intibak zinciriyle yeniden hesaplanır.
  const depOffsetMin = useMemo(() => {
    const tz = acclTz[String(legs[0]?.dep || '').toUpperCase()];
    if (!tz) return null;
    const ref = utcISO(date, legs[0]?.etd) || new Date().toISOString();
    return tzOffsetMin(tz, new Date(ref).getTime());
  }, [acclTz, legs, date]);

  const winOpts = useMemo(() => ({
    operationType: opType,
    trainingKind, sameDayTheory,
    threePilot: extraMode === 'crz',
    singlePilot: Object.keys(selected).length === 1,
    longRange: tzDiffH != null && tzDiffH >= 4,
  }), [opType, trainingKind, sameDayTheory, extraMode, selected, tzDiffH]);

  const win = useMemo(() => {
    if (dutyType !== 'flight') return null;
    const complete = legs.filter(l => timeOk(l.etd) && timeOk(l.eta));
    if (complete.length !== legs.length) return null;
    const w0 = dutyWindow(complete, accommodation, ruleset, winOpts);
    if (!w0 || depOffsetMin == null) return w0;   // tz yoksa bant çözülmez (uydurma yok)
    const band = bandReportHHMM(w0.report, 0, depOffsetMin);
    return band ? dutyWindow(complete, accommodation, ruleset, { ...winOpts, bandReport: band }) : w0;
  }, [legs, accommodation, ruleset, dutyType, winOpts, depOffsetMin]);

  const { rules } = useMemo(() => effectiveRules(ruleset), [ruleset]);
  const lim = rules.cumulative_limits || {};

  // GND formunda YAZILMAKTA OLAN nobetin etkisi (canli onizleme).
  const gndEffect = useMemo(() => {
    if (dutyType !== 'ground') return null;
    if (gnd.kind !== 'airport_standby' && gnd.kind !== 'other_standby') return null;
    if (!timeOk(gnd.start) || !timeOk(gnd.end)) return null;
    const startISO = utcISO(date, gnd.start);
    const endISO = utcISO(toMin(gnd.end) < toMin(gnd.start) ? nextDay(date) : date, gnd.end);
    if (!startISO || !endISO) return null;
    return standbyEffect(
      { duty_type:'ground', ground_kind: gnd.kind, report_time: startISO, duty_end: endISO }, rules);
  }, [dutyType, gnd, date, rules]);

  // her pilot için uygunluk
  const fitList = useMemo(() => {
    if (dutyType !== 'flight' || !win) return [];
    const reportISO = utcISO(date, win.report);
    return pilots.filter(p => ['pilot', 'admin_pilot'].includes(p.role)).map(p => {
      const myDuties = duties.filter(d => d.pilot_id === p.id);
      const f = fitness({
        pilot: p, baseline: baselines[p.id] || null, duties: myDuties, ruleset,
        newDuty: { reportISO, sectors: legs, dutyMin: win.dutyMin, dutyDate: date },
        asOf: reportISO ? new Date(reportISO) : new Date(),
      });
      // Md.5 — bu pilotun ATAMA AYINDAKI bos gun durumu (yerel gece dogrulamali)
      const [yy, mm] = String(date).split('-').map(Number);
      const off = daysOffSummary(myDuties, rules, { year: yy, month: mm, tz: hbTz[p.id] || null, offTypes });

      // ── NOBET (SHT-FTL/HG Md.17) — PILOT BAZLI ───────────────────────
      // Nobet her pilotun KENDI gecmisidir: ayni ucusa atanan iki pilottan biri
      // sabahtan beri nobette beklemis, digeri evinde olmus olabilir. Bu yuzden
      // azami UGS ORTAK DEGIL, pilot basina hesaplanir — ortak pencere yalnizca
      // "nobetsiz taban"dir. Kisaltilmis pencere ayni motordan gecer.
      const sbDuty = standbyBefore(myDuties, p.id, date, reportISO);
      const sbEffect = sbDuty
        ? standbyEffect(sbDuty, rules, { fdpExtended: !!(win.split.isSplit || win.augmented) })
        : null;

      // ── İNTİBAK (Md.22/1) — Tablo 1'in bandını bu belirler ─────────
      const depIcao = String(legs[0]?.dep || '').toUpperCase();
      const nowMs = reportISO ? new Date(reportISO).getTime() : Date.now();
      const offOf = (icao) => {
        const tz = acclTz[String(icao || '').toUpperCase()];
        return tz ? tzOffsetMin(tz, nowMs) : null;
      };
      const prevD = previousDuty(myDuties, p.id, reportISO);
      // Önceki görevin intibak referansı: kayıtlıysa o, değilse VARDIĞI meydan
      // (ekip oraya uçtu, dinlenmesi orada başladı).
      const prevLast = (prevD?.sectors || []).slice(-1)[0];
      const prevRefIcao = prevD
        ? (prevD.acclimatised_to || prevLast?.actual_dest || prevLast?.dest || null) : null;
      const accl = acclimatisation(
        prevD ? { refIcao: prevRefIcao, refOffsetMin: offOf(prevRefIcao), dutyEndISO: prevD.duty_end } : null,
        { depIcao, depOffsetMin: offOf(depIcao), reportISO, homeBaseIcao: homeBases?.[p.id] || null },
        rules);
      // BANT SAATİ (Md.22/2): `win.report` artık UTC (Serkan ilkesi). Tablo 1
      // ise YEREL saat ister — ekibin İNTİBAK ETTİĞİ meydanın yerel saati.
      // Kayma bu yüzden UTC→intibak meydanı (0 → accl.offsetMin); eskiden
      // kalkış meydanının yereliydi ve iki kez dilim uygulanırdı.
      // İNTİBAK ÇÖZÜLEMEZSE bant hesaplanmaz → pilot NOT LEGAL (aşağıda).
      const bandRep = !accl.unavailable
        ? bandReportHHMM(win.report, 0, accl.offsetMin) : null;

      const pOpts = { ...winOpts,
        ...(bandRep ? { bandReport: bandRep } : {}),
        ...(accl.icao ? { acclimatisedTo: accl.icao } : {}) };
      const pWin = (sbEffect?.fdpReductionMin || bandRep)
        ? dutyWindow(legs, accommodation, ruleset,
            { ...pOpts, ...(sbEffect?.fdpReductionMin ? { standbyReductionMin: sbEffect.fdpReductionMin } : {}) })
        : win;
      const sb = sbEffect ? standbyLimits(sbEffect, pWin.fdpMin) : null;

      const reasons = [...f.reasons];
      if (sb) reasons.push(...sb.reasons);
      // UGS asimi NOBET yuzunden dogduysa PILOT BAZLIDIR -> uygunluk gerekcesi
      // olmali; aksi halde ortak pencere yesil gorunurken nobetli pilot sessizce
      // yasadisi atanir. (Nobetsiz asim zaten ortak pencerede kirmizi notta.)
      if (sb && pWin.fdpExceeded && !win.fdpExceeded) {
        reasons.push(`FDP ${fmtMin(pWin.fdpMin)} > MAX ${fmtMin(pWin.maxFdpMin)} AFTER STANDBY REDUCTION ${fmtMin(sb.fdpReductionMin)} (${sb.reference})`);
      }
      // İntibak ÇÖZÜLEMEDİYSE sessizce kalkış saatiyle devam etmeyiz: hangi
      // bandın okunduğu belirsizken azami UGS doğrulanmış sayılamaz (İlke 1).
      if (accl.unavailable) {
        reasons.push(`ACCLIMATISATION NOT DETERMINED (Md.22/1) — ${accl.reason}`);
      }
      return { pilot: p, ...f, reasons, legal: reasons.length === 0, off, sb, sbDuty,
               accl, win: pWin };
    });
  }, [pilots, duties, baselines, ruleset, legs, win, winOpts, accommodation, date, dutyType, rules, hbTz, offTypes, acclTz, homeBases]);

  const setLeg = (i, k, v) => setLegs(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));

  const toggle = (pid) => setSelected(s => {
    const cur = s[pid];
    const next = { ...s };
    const vals = Object.values(s);
    if (!cur) {
      if (!vals.includes('PF')) next[pid] = 'PF';
      else if (!vals.includes('PM')) next[pid] = 'PM';
      // CRZ CPT yalniz ADD COCKPIT CREW -> CRZ CPT modunda ve tek kisi.
      else if (extraMode === 'crz' && !vals.includes('CRZ CPT')) next[pid] = 'CRZ CPT';
      else return s;
    }
    else if (cur === 'PF') next[pid] = 'PM';
    else delete next[pid];
    return next;
  });

  const save = async () => {
    const ids = Object.keys(selected);
    if (dutyType !== 'off' && !ids.length) { toast('Select at least one pilot.', 'error'); return; }
    if (dutyType === 'flight' && extraMode === 'crz' && !Object.values(selected).includes('CRZ CPT')) {
      toast('CRZ CPT mode is on — pick the 3rd pilot from the list (3rd click).', 'error'); return;
    }
    if (dutyType === 'flight' && extraMode === 'checkride' && !examiner.trim()) {
      toast('Enter TRE/TRI name for the check ride.', 'error'); return;
    }
    setSaving(true);
    try {
      const rows = [];
      // GECMISE GIRILEN GOREV 'planned' OLAMAZ (3 Agu, Serkan): genel havacilikta
      // planlama safhasi atlanabiliyor, ucus once yapilip kayda sonra giriliyor.
      // Gecmis tarihli bir gorev "planlanmis" degil OLMUS BITMIS ucustur.
      //   gecmis  -> actual  (gorev kapali; girilen saatler gercek kabul edilir,
      //                       rest ve earliest_next_report onlardan hesaplanir)
      //   bugun/ileri -> planned
      // NOT: bu, girilen saatlerin GERCEK off/on block oldugu varsayimina dayanir.
      // Ucus uygulamada arsivlenmisse dogrusu arsivden gelir; archive-flight'in
      // duzeltme yolu bu gorevi bulup uzerine yazar (sektordeki plan_id ile).
      const isPast = date < new Date().toISOString().slice(0, 10);
      // AYNI ATAMADAN DOGAN TUM PILOT SATIRLARI AYNI assignment_id'yi TASIR.
      // Bu olmadan "ucusu iptal et" tek islem degil N ayri islem olur; biri
      // duserse PF'in gorevi iptal, PM'inki ayakta kalir ve kimse fark etmez.
      // (Goc eski satirlari doldurdu; yeni satirlari YAZAN BURASI.)
      const assignmentId = newUuid();
      // CHECK RIDE: dis TRE/TRI profiles'ta yoktur — FTL kumulatifi TUTULMAZ
      // (bizim AOC pilotu degil); adi+bayragi atamaya yazilir, roster/rapor
      // gosterir. (4 Agu, Serkan)
      const base = {
        assignment_id: assignmentId,
        ...(dutyType === 'flight' && extraMode === 'checkride'
          ? { check_ride: true, external_examiner: examiner.trim().toUpperCase() } : {}),
        customer_id: myProfile.customer_id, created_by: myProfile.id,
        ruleset_id: ruleset.id, ruleset_snapshot: { regulation: ruleset.regulation, company: ruleset.company },
        // Saatler UTC yazilir. `report_tz` artik "saatin dilimi" DEGIL, kalkis
        // meydaninin dilimidir — bandi/intibaki geriye donuk cozebilmek icin
        // saklanir (rapor da bunu kullaniyor). Ucusta asagida depTz ile ezilir.
        duty_date: date, report_tz: 'UTC',
        status: isPast ? 'actual' : 'planned',
        ...(isPast ? { duty_finished: true } : {}),
      };
      if (dutyType === 'flight') {
        if (!win || legs.some(l => !l.dep || !l.dest || !l.etd || !l.eta)) { toast('Complete all sector fields.', 'error'); setSaving(false); return; }
        // SAATLER UTC (6 Agu, Serkan ilkesi): girilen ETD/ETA zaten UTC oldugu
        // icin mutlaklastirma DUZDUR — meydan dilimine ihtiyac YOK ve "tz yok →
        // admin dilimi" yamasi da gereksizlesti. Meydan tz'si artik yalniz
        // REGULASYONUN istedigi yerde kullaniliyor: Tablo 1 bandi (intibak) ve
        // uzun menzil tespiti.
        const tzMap = await fetchTzMap([legs[0].dep, legs[legs.length - 1].dest]);
        const depTz = tzMap[legs[0].dep.toUpperCase()] || null;
        const destTz = tzMap[legs[legs.length - 1].dest.toUpperCase()] || null;
        const reportISO = utcISO(date, win.report);
        const lastEta = legs[legs.length - 1].eta;
        const crossesMidnight = toMin(lastEta) < toMin(win.report);
        const endISO = addMin(utcISO(crossesMidnight ? nextDay(date) : date, lastEta), (effectiveRules(ruleset).company.postFlightDutyMin));
        if (depTz && destTz && reportISO && endISO) {
          const tzDiff = Math.abs(tzOffsetMin(destTz, new Date(endISO).getTime()) - tzOffsetMin(depTz, new Date(reportISO).getTime()));
          if (tzDiff >= 240) toast(`TZ CROSSING ${Math.round(tzDiff / 60)}H — long-range rules per SHT-FTL/HG Md.22(3)/16(3): FDP cap 14:00, arrival rest max(duty,14:00), 48h/2 local nights on return.`, 'error');
        }
        // NOBET KAPISI (Md.17): secili bir pilotun nobet ihlali varsa kayit
        // ENGELLENIR. Liste NOT LEGAL satirin secilmesini zaten onluyor ama
        // secimden SONRA saat/sektor degistirilirse ihlal sonradan dogabilir —
        // o durumda sessizce yasadisi gorev yazilmasin.
        const sbBlocked = ids
          .map(pid => fitList.find(f => f.pilot.id === pid))
          .filter(f => f?.sb && !f.sb.ok);
        if (sbBlocked.length) {
          toast(`STANDBY LIMIT — ${sbBlocked.map(f => `${f.pilot.code}: ${f.sb.reasons.join('; ')}`).join(' | ')}`, 'error');
          setSaving(false); return;
        }
        ids.forEach(pid => {
          const home = homeBases[pid];
          const atBase = !home || legs[legs.length - 1].dest.toUpperCase() === home.toUpperCase();
          // PILOT BAZLI PENCERE (nobet kisaltmasi uygulanmis olabilir); nobeti
          // olmayan pilotta ortak pencerenin AYNISIDIR.
          const fp = fitList.find(f => f.pilot.id === pid);
          const pWin = fp?.win || win;
          const sb = fp?.sb || null;
          const minRest = Math.max(pWin.dutyMin || 0, atBase ? (rules.min_rest?.home_base_min ?? 720) : (rules.min_rest?.out_of_base_min ?? 600));
          rows.push({
            ...base, pilot_id: pid, duty_type: 'flight',
            operation_type: opType,
            operation_type_source: planOp
              ? (opManual && planOp.type !== opType
                  ? `manual override (flight plan: ${planOp.type} — ${planOp.source})`
                  : planOp.source)
              : 'manual selection (no matching flight plan)',
            ...(opType === 'training' ? { training_kind: trainingKind, same_day_theory: sameDayTheory } : {}),
            report_tz: depTz || base.report_tz,
            report_time: reportISO, duty_end: endISO,
            // GECMIS TARIHTE ELLE GIRILEN SAAT = GERCEK SAAT (Serkan, 3 Agu):
            // "elle giris varsa sistemde bir hata/kirilma veya son dakika
            //  degisiklik olmustur; elle girilen deger saat-dk takibinde GERCEK
            //  degerdir, gecmise donuk plan degil olmus bitmis istir."
            // Bu yuzden gecmiste off_block/on_block da yazilir.
            // AMA `plan_id` YAZILMAZ — ayrimi o tasiyor: plan_id'si olan sektor
            // ARSIVDEN olculmustur, olmayan ELLE yazilmistir. archive-flight
            // elle yazilmis sektorun uzerine hala yazabilir; "gerceklesen ucus
            // atanmis gorevin ustune HER ZAMAN yazar" kurali boylece korunur.
            sectors: legs.map((l, i) => ({
              seq: i + 1, dep: l.dep.toUpperCase(), dest: l.dest.toUpperCase(),
              etd: l.etd, eta: l.eta, role: selected[pid],
              ...(isPast ? { off_block: l.etd, on_block: l.eta, entered_manually: true } : {}),
            })),
            split_duty: pWin.split.isSplit, break_minutes: pWin.breakMin,
            accommodation: pWin.split.isSplit ? accommodation : null,
            max_fdp_minutes: pWin.maxFdpMin, fdp_minutes: pWin.fdpMin, fdp_exceeded: !!pWin.fdpExceeded,
            // NOBET IZI (Md.17): hem KISALTMA MIKTARI, hem KAYNAK GOREV, hem de
            // insan-okur OZET yazilir. Ozet donar (ruleset_snapshot mantigi) ki
            // nobet satiri sonradan duzeltilse/silinse bile "bu UGS neden kisaydi"
            // sorusunun cevabi kaydin ICINDE kalsin.
            standby_reduction_min: sb?.fdpReductionMin || null,
            standby_duty_id: fp?.sbDuty?.id || null,
            standby_ref: sb ? standbyRef(fp.sbDuty, sb) : null,
            // İNTİBAK (Md.22/1): Tablo 1 hangi meydanın saatiyle okundu.
            // Zincirin sonraki halkası bu değeri referans alır.
            acclimatised_to: fp?.accl?.icao || null,
            min_rest_minutes: minRest, earliest_next_report: addMin(endISO, minRest),
            mandatory_report_due: pWin.fdpExceeded ? addMin(endISO, (effectiveRules(ruleset).company.mandatoryReportHours) * 60) : null,
          });
        });
      } else if (dutyType === 'ground') {
        const startISO = utcISO(date, gnd.start);
        const endISO = utcISO(toMin(gnd.end) < toMin(gnd.start) ? nextDay(date) : date, gnd.end);
        const dMin = (new Date(endISO) - new Date(startISO)) / 60000;
        // Md.17(2)(b) — HAVAALANI HARICI NOBET AZAMI 16 SAAT. Bu nobetin KENDI
        // ihlalidir (gorev atansa da atanmasa da gecersiz) -> kayit ENGELLENIR.
        // Havaalani nobetinin kendi azami suresi YOKTUR; onun siniri gorevle
        // BIRLESIK tavandir (Md.17/1/c) ve ucus atanirken kontrol edilir.
        if (gnd.kind === 'other_standby') {
          const maxMin = rules.standby?.other?.max_min ?? 960;
          if (dMin > maxMin) {
            toast(`OTHER STANDBY ${fmtMin(dMin)} EXCEEDS THE ${fmtMin(maxMin)} MAXIMUM (SHT-FTL/HG Md.17/2/b) — shorten it.`, 'error');
            setSaving(false); return;
          }
        }
        const gEffect = standbyEffect(
          { duty_type:'ground', ground_kind: gnd.kind, report_time: startISO, duty_end: endISO }, rules);
        ids.forEach(pid => {
          // DINLENME TABANI: genel kural "dinlenme >= onceki gorev suresi, asgari
          // ana usde 12h". HAVAALANI HARICI NOBETTE bu YANLIS olur: surenin yalniz
          // %25'i gorev sayilir (Md.17/2/g) ve gorev verilmezse ozel hukum asgari
          // 8 saat der (Md.17/2/e) — ozel hukum genel kurali ezer. 16 saat bekleyen
          // pilota 16 saat dinlenme dayatmak regulasyonun demedigi bir kisittir.
          const minRest = gnd.kind === 'other_standby'
            ? Math.max(gEffect?.dutyCreditMin || 0, gEffect?.restIfNoDutyMin ?? 480)
            : Math.max(dMin, rules.min_rest?.home_base_min ?? 720);
          rows.push({
            ...base, pilot_id: pid, duty_type: 'ground', ground_kind: gnd.kind,
            report_time: startISO, duty_end: endISO, fdp_minutes: null,
            min_rest_minutes: minRest, earliest_next_report: addMin(endISO, minRest),
          });
        });
      } else { // off
        if (!ids.length) { toast('Select pilot(s) for OFF.', 'error'); setSaving(false); return; }
        const end = off.endDate || date;
        for (let d = date; d <= end; d = nextDay(d)) {
          ids.forEach(pid => rows.push({ ...base, pilot_id: pid, duty_type: 'off', off_subtype: off.subtype, duty_date: d, status: 'actual' }));
          if (d === end) break;
        }
      }
      const { error } = await supabase.from('crew_duties').insert(rows);
      if (error) throw error;
      toast(`${rows.length} duty row(s) created.`, 'success');
      setSelected({}); setExtraMode(null); setExaminer(''); setSameDayTheory(false); reload();
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };

  const seg = (t, label) => (
    <div onClick={() => setDutyType(t)} style={{ padding:'9px 22px', fontSize:11, fontWeight:700, letterSpacing:1.5, cursor:'pointer', fontFamily:'var(--mono)', background: dutyType === t ? C.accent : 'transparent', color: dutyType === t ? 'var(--bg)' : C.t3 }}>{label}</div>
  );

  return (
    <div>
      <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:18, alignItems:'flex-end' }}>
        <div><span style={S.label}>Duty Type</span>
          <div style={{ display:'flex', border:`1px solid ${C.border2}`, width:'fit-content' }}>{seg('flight', 'FLT')}{seg('ground', 'GND')}{seg('off', 'OFF')}</div>
        </div>
        {dutyType === 'flight' && (<>
          <div><span style={S.label}>Operation (SHT-FTL/HG Md.9)</span>
            <select style={{ ...S.input, width:210 }} value={opType}
                    onChange={e => { setOpType(e.target.value); setOpManual(true); }}>
              <option value="air_taxi">AIR TAXI — Md.22</option>
              <option value="aerial_work">AERIAL WORK — Md.26</option>
              <option value="general_aviation">GENERAL AVIATION — Md.25</option>
              <option value="training">TRAINING — Md.27</option>
            </select>
            {planOp && (
              <div style={{ fontSize:9, color: opManual && planOp.type !== opType ? (C.amber || 'var(--amber)') : C.t3,
                            fontFamily:'var(--mono)', marginTop:3, maxWidth:230, lineHeight:1.5 }}>
                {opManual && planOp.type !== opType
                  ? `MANUAL OVERRIDE — flight plan says ${planOp.type} (${planOp.source})`
                  : `FROM FLIGHT PLAN — ${planOp.source}`}
              </div>
            )}
          </div>
          {opType === 'training' && (<>
            <div><span style={S.label}>Training kind</span>
              <select style={{ ...S.input, width:230 }} value={trainingKind} onChange={e => setTrainingKind(e.target.value)}>
                {Object.entries(effectiveRules(ruleset).rules.fdp_limits?.training?.kinds || {})
                  .map(([k, v]) => <option key={k} value={k}>{v.label} — {fmtMin(v.flight_time_min)}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:8 }}>
              <input type="checkbox" checked={sameDayTheory} onChange={e => setSameDayTheory(e.target.checked)} id="sdt" />
              <label htmlFor="sdt" style={{ fontSize:11, color:C.t2, fontFamily:'var(--mono)' }}>
                SAME-DAY THEORY (Md.27/ç — halves flight limit)
              </label>
            </div>
          </>)}
        </>)}
        <div style={{ width:170 }}><span style={S.label}>{dutyType === 'off' ? 'Start Date' : 'Date'}</span>
          <input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} />
        </div>
        {dutyType === 'off' && (<>
          <div style={{ width:170 }}><span style={S.label}>End Date (incl.)</span>
            <input type="date" style={S.input} value={off.endDate} onChange={e => setOff(o => ({ ...o, endDate: e.target.value }))} />
          </div>
          <div style={{ width:200 }}><span style={S.label}>Type</span>
            <select style={S.input} value={off.subtype} onChange={e => setOff(o => ({ ...o, subtype: e.target.value }))}>
              {offTypes.map(t => <option key={t.id} value={t.code}>{t.code} — {t.label}</option>)}
            </select>
          </div>
        </>)}
        {dutyType === 'ground' && (<>
          <div style={{ width:200 }}><span style={S.label}>Kind</span>
            <select style={S.input} value={gnd.kind} onChange={e => setGnd(g => ({ ...g, kind: e.target.value }))}>
              <option value="office">OFFICE</option><option value="training">TRAINING</option>
              <option value="sim">SIM</option><option value="theoretical">THEORETICAL TRAINING (Md.27/c)</option>
                <option value="airport_standby">AIRPORT STANDBY (Md.17/1)</option>
                <option value="other_standby">OTHER STANDBY (Md.17/2)</option>
            </select>
          </div>
          <div style={{ width:110 }}><span style={S.label}>Start (UTC)</span><input style={S.input} value={gnd.start} onChange={e => setGnd(g => ({ ...g, start: normTime(e.target.value) }))} /></div>
          <div style={{ width:110 }}><span style={S.label}>End (UTC)</span><input style={S.input} value={gnd.end} onChange={e => setGnd(g => ({ ...g, end: normTime(e.target.value) }))} /></div>
        </>)}
      </div>

      {/* ── NOBETIN SONUCU ONCEDEN GORUNSUN (Md.17) ──────────────────────
            Nobet kaydi tek basina zararsiz gorunur ama AYNI GUN atanacak ucusun
            azami UGS'sini kisaltir. Dispatcher bunu ucusa gelince degil, nobeti
            YAZARKEN gormeli — yoksa "neden bu pilot NOT LEGAL" sorusu sonra
            cikar ve kaynagi gorunmez olur. ── */}
      {dutyType === 'ground' && gndEffect && (
        <div style={{ ...S.note, borderLeftColor: gndEffect.maxExceeded ? C.red : C.accent,
                      color: gndEffect.maxExceeded ? C.red : C.t2, marginBottom:14 }}>
          {gndEffect.kind === 'airport_standby' ? (<>
            AIRPORT STANDBY {fmtMin(gndEffect.standbyMin)} ({gndEffect.reference}) — COUNTS AS DUTY IN FULL.
            {' '}A FLIGHT DUTY ASSIGNED THE SAME DAY HAS ITS MAX FDP REDUCED BY {fmtMin(gndEffect.fdpReductionMin)}
            {' '}(TIME BEYOND {fmtMin(gndEffect.reductionThresholdMin)}); STANDBY + FDP COMBINED MAY NOT EXCEED {fmtMin(gndEffect.combinedCapMin)}.
          </>) : (<>
            OTHER STANDBY {fmtMin(gndEffect.standbyMin)} ({gndEffect.reference}) — {fmtMin(gndEffect.dutyCreditMin)} COUNTS AS DUTY (25%).
            {' '}MAX FDP REDUCTION IF A FLIGHT FOLLOWS: {fmtMin(gndEffect.fdpReductionMin)} (TIME BEYOND {fmtMin(gndEffect.reductionThresholdMin)}).
            {' '}IF NO DUTY IS ASSIGNED, {fmtMin(gndEffect.restIfNoDutyMin)} REST FOLLOWS.
            {gndEffect.maxExceeded && <> {' '}⚠ EXCEEDS THE {fmtMin(gndEffect.maxStandbyMin)} MAXIMUM — CANNOT BE SAVED.</>}
          </>)}
        </div>
      )}

      {dutyType === 'flight' && (<>
        <span style={S.label}>Sectors</span>
        {legs.map((l, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'30px 1fr 1fr 1fr 1fr 40px', gap:10, marginBottom:8, alignItems:'center' }}>
            <div style={{ fontSize:11, color:C.t3, textAlign:'center', fontFamily:'var(--mono)' }}>{i + 1}</div>
            <input style={S.input} placeholder="DEP" maxLength={4} value={l.dep} onChange={e => setLeg(i, 'dep', e.target.value.toUpperCase())} />
            <input style={S.input} placeholder="DEST" maxLength={4} value={l.dest} onChange={e => setLeg(i, 'dest', e.target.value.toUpperCase())} />
            <input style={S.input} placeholder="ETD UTC (06:30)" value={l.etd} onChange={e => setLeg(i, 'etd', normTime(e.target.value))} />
            <input style={S.input} placeholder="ETA UTC (07:45)" value={l.eta} onChange={e => setLeg(i, 'eta', normTime(e.target.value))} />
            <button style={{ ...S.btnS, padding:'8px 10px', color:C.red }} onClick={() => setLegs(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}>✕</button>
          </div>
        ))}
        <button style={{ ...S.btnS, borderStyle:'dashed', color:C.t3 }} onClick={() => setLegs(ls => [...ls, { dep: ls[ls.length-1]?.dest || '', dest:'', etd:'', eta:'' }])}>+ ADD SECTOR</button>

        {win && (
          <div style={{ marginTop:16 }}>
            {win.split.isSplit && (
              <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:12 }}>
                <span style={{ ...S.note, borderLeftColor:C.accent, color:C.t2, flex:1 }}>
                  SPLIT DUTY — break {fmtMin(win.breakMin)} ≥ threshold. Rest where?
                </span>
                <select style={{ ...S.input, width:180 }} value={accommodation} onChange={e => setAccommodation(e.target.value)}>
                  <option value="hotel">HOTEL (extends FDP)</option>
                  <option value="aircraft">ON AIRCRAFT (no ext.)</option>
                </select>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:1, background:C.border, border:`1px solid ${C.border}` }}>
              {[
                ['REPORT (AUTO)', win.report], ['MAX FDP', fmtMin(win.maxFdpMin)],
                ['PLANNED FDP', fmtMin(win.fdpMin)], ['LATEST FDP END', win.latestFdpEnd],
                ['DUTY END (PLN)', win.dutyEnd],
                // Md.27: egitimde gunluk UCUS SURESI ayri bir limittir
                ...(win.flightLimitMin != null
                  ? [['FLIGHT TIME', `${fmtMin(win.flightMin)} / ${fmtMin(win.flightLimitMin)}`]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ background:C.bg3, padding:'10px 13px' }}>
                  <div style={{ fontSize:9, letterSpacing:1.5, color:C.t3, textTransform:'uppercase', marginBottom:5, fontFamily:'var(--mono)' }}>{k}</div>
                  <div style={{ fontSize:16, fontWeight:700, color: k === 'PLANNED FDP' && win.fdpExceeded ? C.red : C.accent, fontFamily:'var(--mono)' }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>
            {win.longRangeCapped && <div style={{ ...S.note, borderLeftColor:C.amber || 'var(--amber)', marginTop:8 }}>LONG-RANGE DUTY (TZ CROSSING ≥4H) — MAX FDP CAPPED AT {fmtMin(win.maxFdpMin)} (SHT-FTL/HG Md.22(3)); arrival rest = max(duty, 14:00) and 48h/2 local nights on return (Md.16(3)).</div>}
            {win.flightLimitExceeded && <div style={{ ...S.note, borderLeftColor:C.red, color:C.red, marginTop:8 }}>TRAINING FLIGHT TIME {fmtMin(win.flightMin)} EXCEEDS THE DAILY LIMIT {fmtMin(win.flightLimitMin)} (SHT-FTL/HG Md.27){sameDayTheory ? ' — halved because theoretical training is planned the same day (Md.27/ç)' : ''}.</div>}
            {win.fdpExceeded && <div style={{ ...S.note, borderLeftColor:C.red, color:C.red, marginTop:8 }}>PLANNED FDP EXCEEDS MAX FDP — assignment should not be planned this way.</div>}
            {/* NOBET UYARISI: yukaridaki MAX FDP kutusu NOBETSIZ tabandir. Nobette
                beklemis pilotun tavani daha DUSUKTUR ve pilot basina degisir —
                kutu tek sayi gosterdigi icin bu ACIKCA soylenmeli, yoksa yanlis
                sayiya bakilir. Pilot bazli gercek tavan asagidaki tabloda. */}
            {fitList.some(f => f.sb?.fdpReductionMin > 0) && (
              <div style={{ ...S.note, borderLeftColor:C.accent, color:C.t2, marginTop:8 }}>
                MAX FDP ABOVE IS THE BASELINE WITHOUT STANDBY. {fitList.filter(f => f.sb?.fdpReductionMin > 0)
                  .map(f => `${f.pilot.code}: −${fmtMin(f.sb.fdpReductionMin)} → ${fmtMin(f.win.maxFdpMin)}`).join(' · ')}
                {' '}(SHT-FTL/HG Md.17). PER-PILOT VALUES ARE IN THE CREW TABLE AND ARE WHAT GETS SAVED.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:20 }}>
          <span style={S.label}>Crew — who can fly this duty?</span>
          <div style={{ overflowX:'auto' }}>
            <table style={S.table}>
              <thead><tr>{['', 'PILOT', 'FITNESS', 'REASON', 'ACCLIM (Md.22/1)', 'STANDBY (Md.17)', `FLT 28D / ${fmtMin(lim.flt_28d_min)}`, `DUTY 7D / ${fmtMin(lim.duty_7d_min)}`, 'DAYS OFF (MON)', 'ROLE'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {fitList.map(({ pilot, legal, reasons, cum, off, sb, accl, win: pWin }) => {
                  const sel = selected[pilot.id];
                  return (
                    <tr key={pilot.id} onClick={() => legal && toggle(pilot.id)} style={{ cursor: legal ? 'pointer' : 'default', opacity: legal ? 1 : .65, background: sel ? `var(--accent-soft)` : 'transparent' }}>
                      <td style={S.td}>{sel ? '☑' : '☐'}</td>
                      <td style={{ ...S.td, color: legal ? C.accent : C.t3, fontWeight:700 }}>{pilot.code} — {pilot.full_name}</td>
                      <td style={S.td}><span style={badge(legal ? 'green' : 'red')}>{legal ? 'LEGAL' : 'NOT LEGAL'}</span></td>
                      <td style={{ ...S.td, color:C.red, fontSize:11, whiteSpace:'normal', maxWidth:280 }}>{reasons.join(' · ') || '—'}</td>
                      {/* İNTİBAK: hangi meydanın saatiyle Tablo 1 okundu.
                          Kalkış meydanından FARKLIYSA amber — o zaman rapor
                          saati ile bandın okunduğu saat ayrışıyor demektir. */}
                      <td style={S.td} title={accl?.reason || ''}>
                        {!accl ? <span style={{ color:C.t3 }}>—</span>
                          : accl.unavailable
                            ? <span style={badge('red')}>UNKNOWN</span>
                            : (<span style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                                <span style={badge(accl.icao === String(legs[0]?.dep || '').toUpperCase() ? 'dim' : 'amber')}>
                                  {accl.icao}
                                </span>
                                {pWin?.bandReport && pWin.bandReport !== pWin.report && (
                                  <span style={{ color:C.accent, fontSize:11 }}>BAND {pWin.bandReport}</span>
                                )}
                              </span>)}
                      </td>
                      {/* NOBET: hem SURESI hem SONUCU (kisaltilmis azami UGS) gorunur —
                          "kisaldi" demek yetmez, dispatcher YENI TAVANI gormeli. */}
                      <td style={S.td} title={sb ? `${sb.reference} · standby ${fmtMin(sb.standbyMin)} · duty credit ${fmtMin(sb.dutyCreditMin)}${sb.combinedMin != null ? ` · combined ${fmtMin(sb.combinedMin)}/${fmtMin(sb.combinedCapMin)}` : ''}` : ''}>
                        {!sb ? <span style={{ color:C.t3 }}>—</span> : (
                          <span style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                            <span style={badge(sb.ok ? (sb.fdpReductionMin ? 'amber' : 'dim') : 'red')}>
                              {sb.kind === 'airport_standby' ? 'APT' : 'OTHER'} {fmtMin(sb.standbyMin)}
                            </span>
                            {sb.fdpReductionMin > 0 && (
                              <span style={{ color:C.accent, fontSize:11 }}>
                                −{fmtMin(sb.fdpReductionMin)} → MAX {fmtMin(pWin?.maxFdpMin)}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td style={S.td}>{fmtMin(cum.flt28d)}</td>
                      <td style={S.td}>{fmtMin(cum.duty7d)}</td>
                      <td style={S.td} title={off?.invalid?.length
                        ? `Not counted (2 local nights not free — Md.4/ü): ${off.invalid.join(', ')}` : ''}>
                        <span style={{ color: off?.ok === false ? C.amber || 'var(--amber)' : C.t2, fontWeight:700 }}>
                          {off ? `${off.count}/${off.required ?? '—'}` : '—'}
                        </span>
                        {off?.invalid?.length ? <span style={{ ...badge('amber'), marginLeft:6 }}>{off.invalid.length} ✕</span> : null}
                      </td>
                      <td style={S.td}>{sel ? <span style={badge('blue')}>{sel}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.note, marginTop:8 }}>Click row: 1st = PF, click again = PM, again = deselect. NOT LEGAL rows cannot be selected.</div>

          {/* ── ADD COCKPIT CREW (4 Agu, Serkan): 3 pilotlu ops / check ride.
                Pairing (PF/PM) mantigi DEGISMEZ. ── */}
          {Object.values(selected).includes('PF') && Object.values(selected).includes('PM') && (
            <div style={{ marginTop:12, padding:'12px 14px', border:`1px dashed ${C.border2}` }}>
              {!extraMode && (
                <button style={S.btnS} onClick={() => setExtraMode('pick')}>+ ADD COCKPIT CREW</button>
              )}
              {extraMode === 'pick' && (
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <button style={S.btnS} onClick={() => setExtraMode('crz')}>CRZ CPT</button>
                  <button style={S.btnS} onClick={() => setExtraMode('checkride')}>CHECK RIDE</button>
                  <button style={{ ...S.btnS, color:C.t3 }} onClick={() => setExtraMode(null)}>✕</button>
                </div>
              )}
              {extraMode === 'crz' && (() => {
                const crzId = Object.keys(selected).find(k => selected[k] === 'CRZ CPT');
                const crzP = pilots.find(pp => pp.id === crzId);
                return (
                  <div>
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:6 }}>
                      <span style={{ ...badge('blue') }}>3-PILOT OPS — CRZ CPT</span>
                      {crzP
                        ? <b style={{ fontSize:12, fontFamily:'var(--mono)' }}>{crzP.code} — {crzP.full_name}</b>
                        : <span style={{ fontSize:11, color:C.t3 }}>Pick the 3rd pilot from the list above (3rd click = CRZ CPT).</span>}
                      <button style={{ ...S.btnS, color:C.t3, marginLeft:'auto' }}
                              onClick={() => { setSelected(sl => { const n = { ...sl }; Object.keys(n).forEach(k => { if (n[k] === 'CRZ CPT') delete n[k]; }); return n; }); setExtraMode(null); }}>REMOVE</button>
                    </div>
                    <div style={{ ...S.note, borderLeftColor:C.accent }}>
                      AUGMENTED CREW ACTIVE — MAX FDP {win ? fmtMin(win.maxFdpMin) : '—'} (SHT-FTL/HG Md.11:
                      table value +2:00 with one additional pilot; in-flight rest 90 min each / 2h for landing crew,
                      reclining seat required; FDP limited to 3 sectors; split-duty NOT combinable — Md.15(d)).
                      Duty &amp; rest limits apply to all three crew.
                    </div>
                    {win?.augmentedSectorLimitExceeded && (
                      <div style={{ ...S.note, borderLeftColor:C.red, color:C.red, marginTop:6 }}>
                        AUGMENTED FDP IS LIMITED TO 3 SECTORS (SHT-FTL/HG Md.11(2)) — reduce sectors or remove CRZ CPT.
                      </div>
                    )}
                  </div>
                );
              })()}
              {extraMode === 'checkride' && (
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ ...badge('amber') }}>CHECK RIDE ✓</span>
                  <span style={{ fontSize:11, color:C.t3, fontFamily:'var(--mono)' }}>TRE/TRI</span>
                  <input style={{ ...S.input, width:260 }} placeholder="NAME SURNAME"
                         value={examiner} onChange={e => setExaminer(up(e.target.value))} />
                  <span style={{ fontSize:10, color:C.t3 }}>External examiner — recorded on the assignment; no FTL tracking (not company crew). Standard 2-pilot FDP applies.</span>
                  <button style={{ ...S.btnS, color:C.t3 }} onClick={() => { setExtraMode(null); setExaminer(''); }}>✕</button>
                </div>
              )}
            </div>
          )}
        </div>
      </>)}

      {dutyType !== 'flight' && (
        <div style={{ marginTop:6 }}>
          <span style={S.label}>Pilots</span>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {pilots.filter(p => ['pilot', 'admin_pilot'].includes(p.role)).map(p => {
              const sel = !!selected[p.id];
              return (
                <div key={p.id} onClick={() => setSelected(s => { const n = { ...s }; if (n[p.id]) delete n[p.id]; else n[p.id] = 'CREW'; return n; })}
                  style={{ padding:'8px 14px', border:`1px solid ${sel ? C.accent : C.border2}`, color: sel ? C.accent : C.t2, cursor:'pointer', fontSize:12, fontFamily:'var(--mono)', background: sel ? `var(--accent-soft)` : 'transparent' }}>
                  {sel ? '☑' : '☐'} {p.code} — {p.full_name}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop:22, display:'flex', gap:10 }}>
        <button style={S.btnP} disabled={saving} onClick={save}>{saving ? 'SAVING...' : 'ASSIGN DUTY'}</button>
      </div>
    </div>
  );
}

const nextDay = (dateStr) => {
  const d = new Date(`${dateStr}T12:00:00`); d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// ═══ 2) DUTY HISTORY ══════════════════════════════════════════════
function DutyHistory({ pilots, duties, baselines, offTypes, ruleset, homeBases }) {
  const flyable = pilots.filter(p => ['pilot', 'admin_pilot'].includes(p.role));
  const [pilotId, setPilotId] = useState('');
  useEffect(() => { if (!pilotId && flyable.length) setPilotId(flyable[0].id); }, [flyable, pilotId]);

  // Secili pilotun ana us dilimi (yerel gece hesabi icin)
  const [hbIcaoTz, setHbIcaoTz] = useState(null);
  useEffect(() => {
    const icao = (homeBases || {})[pilotId];
    if (!icao) { setHbIcaoTz(null); return; }
    let dead = false;
    (async () => {
      const m = await fetchTzMap([icao]);
      if (!dead) setHbIcaoTz(m[icao.toUpperCase()] || null);
    })();
    return () => { dead = true; };
  }, [homeBases, pilotId]);

  // Tarih aralığı — varsayılan: içinde bulunulan ay
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));

  const rows = useMemo(() => duties
    .filter(d => d.pilot_id === pilotId)
    .filter(d => (!from || (d.duty_date || '') >= from) && (!to || (d.duty_date || '') <= to))
    .sort((a, b) => new Date(a.report_time || a.duty_date) - new Date(b.report_time || b.duty_date)),
  [duties, pilotId, from, to]);
  const baseline = baselines[pilotId];
  const pilot = pilots.find(p => p.id === pilotId);

  // Kümülatif özet — PLN (planned) satırlar toplamlara girmez
  const summary = useMemo(() => {
    const s = { pfCount:0, pfMin:0, pmCount:0, pmMin:0, fltDays:0, gndDays:0, offDays:0, dutyMin:0 };
    rows.forEach(d => {
      const actual = d.status !== 'planned';
      if (d.duty_type === 'off') { s.offDays++; return; }
      if (!actual) return;
      if (d.duty_type === 'flight') s.fltDays++;
      if (d.duty_type === 'ground') s.gndDays++;
      if (d.report_time && d.duty_end) s.dutyMin += (new Date(d.duty_end) - new Date(d.report_time)) / 60000;
      if (d.duty_type === 'flight') (d.sectors || []).forEach(l => {
        const m = spanMin(l.off_block || l.etd, l.on_block || l.eta) || 0;
        if ((l.role || 'PF') === 'PM') { s.pmCount++; s.pmMin += m; }
        else if (l.role === 'CRZ CPT') { s.crzCount = (s.crzCount || 0) + 1; s.crzMin = (s.crzMin || 0) + m; }
        else { s.pfCount++; s.pfMin += m; }
      });
    });
    // Md.5 — bos gunler: aralikta KAC TANESI gecerli (2 yerel gece sarti) ve
    // takvim yili toplami 96'ya gore nerede. Yerel gece ana us diliminde olculur.
    const myDuties = (duties || []).filter(d => d.pilot_id === pilotId);
    const tz = hbIcaoTz;
    const rulesNow = effectiveRules(ruleset).rules;
    const yearNum = Number(String(to).slice(0, 4));
    const yr = daysOffSummary(myDuties, rulesNow, { year: yearNum, tz, offTypes });
    s.offValidInRange = yr.valid.filter(d => d >= from && d <= to).length;
    s.offRecordedInRange = yr.offDates.filter(d => d >= from && d <= to).length;
    s.offYear = yr.count; s.offYearRequired = yr.required;
    return s;
  }, [rows, duties, pilotId, hbIcaoTz, ruleset, offTypes, from, to]);

  const srcBadge = (d) => d.status === 'planned' ? <span style={badge('dim')}>PLN</span>
    : d.status === 'open' ? <span style={badge('amber')}>OPEN</span>
    : <span style={badge('green')}>ACT</span>;

  // Yazdırma: tüm sayfa yerine SADECE rapor içeriği — beyaz kâğıt formatında
  // ayrı pencerede kümülatif uçuş/görev süresi raporu üretir.
  const printReport = () => {
    if (!pilot) return;
    const esc = (x) => String(x ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const dRows = rows.map(d => {
      const actual = d.status !== 'planned';
      const st = d.status === 'planned' ? 'PLN' : d.status === 'open' ? 'OPEN' : 'ACT';
      const dutyT = d.report_time && d.duty_end ? fmtMin((new Date(d.duty_end) - new Date(d.report_time)) / 60000) : '—';
      if (d.duty_type === 'flight' && (d.sectors || []).length) {
        const secRows = d.sectors.map((l, i) => {
          const blkS = l.off_block || l.etd, blkE = l.on_block || l.eta;
          return `<tr class="${actual ? '' : 'pln'}">
            <td>${i === 0 ? esc(fmtD(d.duty_date)) : ''}</td><td>${i === 0 ? 'FLT' : ''}</td>
            <td>${esc(l.dep)}–${esc(l.dest)}${l.actual_dest && l.actual_dest !== l.dest ? '&gt;' + esc(l.actual_dest) + ' DVT' : ''}</td><td>${esc(blkS)}–${esc(blkE)}</td>
            <td>${fmtMin(spanMin(blkS, blkE))}</td><td class="role">${esc(l.role || 'PF')}</td>
            <td>${i === 0 ? dutyT : ''}</td><td>${i === 0 ? st : ''}</td></tr>`;
        }).join('');
        // NOBET DAYANAGI RAPORDA (Md.17): azami UGS kisaltilmissa denetci
        // "neden kisa" sorusunu raporun kendisinden cevaplayabilmeli — baska
        // ekrana bakmak zorunda kalmamali. standby_ref kayitta DONMUS ozettir.
        const sbRow = d.standby_reduction_min > 0
          ? `<tr class="${actual ? '' : 'pln'}"><td></td><td></td><td colspan="6" class="sb">STANDBY (SHT-FTL/HG Md.17) — MAX FDP ${fmtMin(d.max_fdp_minutes)} AFTER −${fmtMin(d.standby_reduction_min)} · ${esc(d.standby_ref || '')}</td></tr>`
          : '';
        // SKPK RAPORDA (Md.12): komutan karariyla degistirilmis bir UGS/dinlenme
        // denetimin ilk bakacagi seydir — kaptan raporunun ozeti ve SHGM
        // yukumlulugunun durumu raporun kendisinde durur.
        // İNTİBAK RAPORDA (Md.22/1): azami UGS'nin HANGİ MEYDANIN saatiyle
        // okunduğu, kalkış meydanından farklıysa denetim için kritiktir.
        const acclRow = (d.acclimatised_to &&
          String(d.acclimatised_to).toUpperCase() !== String((d.sectors || [])[0]?.dep || '').toUpperCase())
          ? `<tr class="${actual ? '' : 'pln'}"><td></td><td></td><td colspan="6" class="sb">ACCLIMATISED TO ${esc(d.acclimatised_to)} (SHT-FTL/HG Md.22/1) — Table 1 band read in that aerodrome's local time, not ${esc((d.sectors || [])[0]?.dep || '?')}</td></tr>`
          : '';
        const skpkRow = ((d.skpk_fdp_extension_min || 0) > 0 || (d.skpk_rest_reduction_min || 0) > 0)
          ? `<tr class="${actual ? '' : 'pln'}"><td></td><td></td><td colspan="6" class="sb">COMMANDER'S DISCRETION (SHT-FTL/HG Md.12) — FDP +${fmtMin(d.skpk_fdp_extension_min || 0)} · REST −${fmtMin(d.skpk_rest_reduction_min || 0)} · MAX FDP ${fmtMin(d.max_fdp_minutes)} · NEXT REST ${fmtMin(d.min_rest_minutes)}`
            + (d.skpk_authority_due
                ? ` · DGCA DUE ${esc(fmtD(d.skpk_authority_due))} ${d.skpk_authority_reported_at ? `— SENT ${esc(fmtD(d.skpk_authority_reported_at))}` : '— <b>NOT SENT</b>'}`
                : ' · operator report only')
            + `${d.skpk_reason ? ` · ${esc(d.skpk_reason)}` : ''}</td></tr>`
          : '';
        return secRows + acclRow + sbRow + skpkRow;
      }
      const kind = d.duty_type === 'off' ? `OFF · ${esc(d.off_subtype || '—')}`
        : `GND · ${esc((d.ground_kind || '—').toUpperCase())}${d.ground_kind === 'airport_standby' ? ' (Md.17/1)' : d.ground_kind === 'other_standby' ? ' (Md.17/2)' : ''}`;
      return `<tr class="${actual ? '' : 'pln'}"><td>${esc(fmtD(d.duty_date))}</td><td>${d.duty_type === 'off' ? 'OFF' : 'GND'}</td>
        <td colspan="4">${kind}</td><td>${d.duty_type === 'off' ? '—' : dutyT}</td><td>${st}</td></tr>`;
    }).join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>FTL Report — ${esc(pilot.code)}</title><style>
      body{font-family:-apple-system,'Helvetica Neue',sans-serif;color:#0f172a;background:#fff;margin:28px;font-size:12px}
      h1{font-size:15px;letter-spacing:2px;margin:0 0 2px}
      .sub{font-size:10px;color:#64748b;margin-bottom:14px}
      .meta{display:flex;gap:28px;border:1px solid #e2e8f0;border-radius:6px;padding:10px 14px;margin-bottom:14px;background:#f8fafc}
      .meta div{font-size:11px}.meta b{display:block;font-size:9px;color:#64748b;letter-spacing:1px;margin-bottom:2px}
      table{width:100%;border-collapse:collapse;font-family:ui-monospace,Menlo,monospace;font-size:10.5px}
      th{background:#f1f5f9;border-bottom:1px solid #cbd5e1;padding:6px 8px;text-align:left;font-size:9px;letter-spacing:1px;color:#475569}
      td{padding:5px 8px;border-bottom:1px solid #eef2f7}
      tr.pln td{color:#94a3b8;font-style:italic}
      td.role{font-weight:700}
      td.sb{font-size:9.5px;color:#92400e;background:#fffbeb}
      .baseline{font-size:10px;color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:6px;padding:7px 10px;margin-bottom:10px}
      .sum{margin-top:16px;border:2px solid #0f172a;border-radius:8px;padding:12px 16px}
      .sum h2{font-size:11px;letter-spacing:2px;margin:0 0 8px}
      .sumgrid{display:flex;gap:32px;flex-wrap:wrap}
      .sumgrid div{font-size:11px}.sumgrid b{display:block;font-size:9px;color:#64748b;letter-spacing:1px;margin-bottom:2px}
      .big{font-size:16px;font-weight:800}
      .note{font-size:9px;color:#94a3b8;margin-top:8px}
      @media print{body{margin:10mm}}
    </style></head><body>
      <h1>CREW DUTY &amp; FLIGHT TIME REPORT</h1>
      <div class="sub">GO2 Aviation · Generated ${new Date().toLocaleString('en-GB')} · crew_duties</div>
      <div class="meta">
        <div><b>PILOT</b>${esc(pilot.full_name)} (${esc(pilot.code)})</div>
        <div><b>PERIOD</b>${esc(from)} → ${esc(to)}</div>
        <div><b>DUTIES</b>${rows.length}</div>
      </div>
      ${baseline ? `<div class="baseline">BASELINE (carried over, ${esc(fmtD(baseline.effective_date))}): FLT 28d ${fmtMin(baseline.flt_28d_min)} · FLT 12mo ${fmtMin(baseline.flt_12mo_min)} · DUTY 28d ${fmtMin(baseline.duty_28d_min)}</div>` : ''}
      <table><thead><tr><th>DATE</th><th>TYPE</th><th>SECTOR</th><th>BLOCKS</th><th>FLT TIME</th><th>ROLE</th><th>DUTY TIME</th><th>SRC</th></tr></thead>
      <tbody>${dRows || '<tr><td colspan="8">No duties in selected period.</td></tr>'}</tbody></table>
      <div class="sum"><h2>PERIOD TOTALS — ${esc(pilot.code)}</h2>
        <div class="sumgrid">
          <div><b>DAYS OFF IN RANGE (Md.5)</b>${summary.offValidInRange} valid / ${summary.offRecordedInRange} recorded</div>
          <div><b>DAYS OFF — CAL YEAR</b>${summary.offYear} / ${summary.offYearRequired ?? '—'}</div>
          <div><b>SECTORS AS PF</b>${summary.pfCount} · ${fmtMin(summary.pfMin)}</div>
          <div><b>SECTORS AS PM</b>${summary.pmCount} · ${fmtMin(summary.pmMin)}</div>
          ${summary.crzCount ? `<div><b>SECTORS AS CRZ CPT</b>${summary.crzCount} · ${fmtMin(summary.crzMin)}</div>` : ''}
          <div><b>TOTAL FLIGHT TIME</b><span class="big">${fmtMin(summary.pfMin + summary.pmMin)}</span></div>
          <div><b>TOTAL DUTY TIME</b>${fmtMin(summary.dutyMin)}</div>
          <div><b>FLT / GND / OFF DAYS</b>${summary.fltDays} / ${summary.gndDays} / ${summary.offDays}</div>
        </div>
        <div class="note">Planned (PLN) duties are listed in italics and excluded from totals. All times local.</div>
      </div>
    <script>window.onload=function(){window.print();}</${'script'}></body></html>`);
    w.document.close();
  };

  return (
    <div>
      <div style={{ display:'flex', gap:14, alignItems:'flex-end', marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ width:280 }}>
          <span style={S.label}>Pilot</span>
          <select style={S.input} value={pilotId} onChange={e => setPilotId(e.target.value)}>
            {flyable.map(p => <option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>)}
          </select>
        </div>
        <div style={{ width:160 }}>
          <span style={S.label}>From</span>
          <input type="date" style={S.input} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div style={{ width:160 }}>
          <span style={S.label}>To</span>
          <input type="date" style={S.input} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div style={{ flex:1 }} />
        <button style={S.btnS} onClick={printReport}>🖨 PRINT / PDF</button>
      </div>

      <div style={{ ...S.panel }}>
        <div style={S.panelH}>
          <span style={S.panelT}>Duty History — {pilot ? `${pilot.full_name} (${pilot.code})` : ''}</span>
          <span style={{ fontSize:9, color:C.t3, letterSpacing:1, fontFamily:'var(--mono)' }}>crew_duties · per pilot · no delete</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ ...S.table, minWidth:980 }}>
            <thead><tr>{['DATE', 'TYPE', 'SECTOR', 'BLOCKS', 'FLT TIME', 'DUTY', 'DUTY TIME', 'MIN REST', 'NEXT DUTY START', 'SRC'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {baseline && (
                <tr style={{ borderBottom:`2px solid ${C.border2}` }}>
                  <td style={{ ...S.td, color:C.t3 }}>{fmtD(baseline.effective_date)}</td>
                  <td style={S.td}><span style={badge('dim')}>BASE</span></td>
                  <td style={{ ...S.td, color:C.t3 }} colSpan={7}>
                    BASELINE — carried over: FLT 28d {fmtMin(baseline.flt_28d_min)} · FLT 12mo {fmtMin(baseline.flt_12mo_min)} · DUTY 28d {fmtMin(baseline.duty_28d_min)} · last recurrent rest {fmtD(baseline.last_recurrent_rest_end)}
                  </td>
                  <td style={S.td}><span style={badge('green')}>ACT</span></td>
                </tr>
              )}
              {rows.map(d => {
                const legs = d.sectors || [];
                const isPln = d.status === 'planned';
                const dimC = { color: isPln ? C.t3 : 'var(--t1)' };
                if (d.duty_type === 'flight' && legs.length) {
                  return legs.map((l, i) => {
                    const last = i === legs.length - 1;
                    const blkS = l.off_block || l.etd, blkE = l.on_block || l.eta;
                    return (
                      <tr key={`${d.id}_${i}`} style={last ? { borderBottom:`2px solid ${C.border2}` } : {}}>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{i === 0 ? fmtD(d.duty_date) : ''}</td>
                        <td style={{ ...S.td, borderBottom: last ? undefined : 'none' }}>{i === 0 ? <span style={badge('blue')}>FLT</span> : ''}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{l.dep}–{l.dest}{l.actual_dest && l.actual_dest !== l.dest ? `>${l.actual_dest} DVT` : ''}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{blkS}–{blkE}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{fmtMin(spanMin(blkS, blkE))}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{i === 0 ? `${fmtDT(d.report_time).slice(-5)}–${fmtDT(d.duty_end).slice(-5)}` : ''}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{last ? fmtMin(d.report_time && d.duty_end ? (new Date(d.duty_end) - new Date(d.report_time)) / 60000 : null) : ''}</td>
                        <td style={{ ...S.td, color: isPln ? C.t3 : C.green, fontWeight:700, borderBottom: last ? undefined : 'none' }}>{last ? fmtMin(d.min_rest_minutes) : ''}</td>
                        <td style={{ ...S.td, color: isPln ? C.t3 : C.accent, fontWeight:700, borderBottom: last ? undefined : 'none' }}>{last ? fmtDT(d.earliest_next_report) : ''}</td>
                        <td style={{ ...S.td, borderBottom: last ? undefined : 'none' }}>{last ? <>{srcBadge(d)}{d.match_review && <span style={{ ...badge('red'), marginLeft:6 }}>MATCH REVIEW</span>}{d.fdp_exceeded && <span style={{ ...badge('red'), marginLeft:6 }}>FDP EXC</span>}{d.standby_reduction_min > 0 && <span style={{ ...badge('amber'), marginLeft:6 }} title={d.standby_ref || 'SHT-FTL/HG Md.17'}>SB −{fmtMin(d.standby_reduction_min)}</span>}{((d.skpk_fdp_extension_min || 0) > 0 || (d.skpk_rest_reduction_min || 0) > 0) && <span style={{ ...badge('amber'), marginLeft:6 }} title={d.skpk_ref || 'SHT-FTL/HG Md.12'}>SKPK</span>}{d.acclimatised_to && String(d.acclimatised_to).toUpperCase() !== String(legs[0]?.dep || '').toUpperCase() && <span style={{ ...badge('amber'), marginLeft:6 }} title="SHT-FTL/HG Md.22(1)">ACCL {d.acclimatised_to}</span>}</> : ''}</td>
                      </tr>
                    );
                  });
                }
                return (
                  <tr key={d.id} style={{ borderBottom:`2px solid ${C.border2}` }}>
                    <td style={{ ...S.td, ...dimC }}>{fmtD(d.duty_date)}</td>
                    <td style={S.td}><span style={badge(d.duty_type === 'off' ? 'dim' : 'amber')}>{d.duty_type === 'off' ? 'OFF' : 'GND'}</span></td>
                    <td style={{ ...S.td, color:C.t3 }}>
                      {d.duty_type === 'off' ? (d.off_subtype || '—') : (d.ground_kind || '—').toUpperCase()}
                      {(d.ground_kind === 'airport_standby' || d.ground_kind === 'other_standby') && (
                        <span style={{ ...badge('amber'), marginLeft:6 }}>
                          {d.ground_kind === 'airport_standby' ? 'Md.17/1' : 'Md.17/2'}
                        </span>
                      )}
                    </td>
                    <td style={{ ...S.td, color:C.t3 }}>—</td><td style={{ ...S.td, color:C.t3 }}>—</td>
                    <td style={{ ...S.td, ...dimC }}>{d.report_time ? `${fmtDT(d.report_time).slice(-5)}–${fmtDT(d.duty_end).slice(-5)}` : '—'}</td>
                    <td style={{ ...S.td, ...dimC }}>{d.report_time && d.duty_end ? fmtMin((new Date(d.duty_end) - new Date(d.report_time)) / 60000) : '—'}</td>
                    <td style={{ ...S.td, color:C.green, fontWeight:700 }}>{d.duty_type === 'off' ? '—' : fmtMin(d.min_rest_minutes)}</td>
                    <td style={{ ...S.td, color:C.accent, fontWeight:700 }}>{d.duty_type === 'off' ? '—' : fmtDT(d.earliest_next_report)}</td>
                    <td style={S.td}>{srcBadge(d)}</td>
                  </tr>
                );
              })}
              {!rows.length && !baseline && (
                <tr><td style={{ ...S.td, color:C.t3 }} colSpan={10}>No duties recorded for this pilot yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Dönem özeti — PLN hariç kümülatif toplamlar */}
        <div style={{ display:'flex', gap:28, flexWrap:'wrap', padding:'11px 14px', borderTop:`2px solid ${C.border2}`, background:C.bg3, fontFamily:'var(--mono)' }}>
          {[
            ['SECTORS AS PF', `${summary.pfCount} · ${fmtMin(summary.pfMin)}`, false],
            ...(summary.crzCount ? [['SECTORS AS CRZ CPT', `${summary.crzCount} · ${fmtMin(summary.crzMin)}`, false]] : []),
            ['DAYS OFF IN RANGE (Md.5)', `${summary.offValidInRange} valid / ${summary.offRecordedInRange} recorded`, false],
            ['DAYS OFF — CAL YEAR', `${summary.offYear} / ${summary.offYearRequired ?? '—'}`, false],
            ['SECTORS AS PM', `${summary.pmCount} · ${fmtMin(summary.pmMin)}`, false],
            ['TOTAL FLT TIME', fmtMin(summary.pfMin + summary.pmMin), true],
            ['TOTAL DUTY TIME', fmtMin(summary.dutyMin), false],
            ['FLT / GND / OFF DAYS', `${summary.fltDays} / ${summary.gndDays} / ${summary.offDays}`, false],
          ].map(([l, v, big]) => (
            <div key={l}>
              <div style={{ fontSize:8.5, color:C.t3, fontWeight:700, letterSpacing:1.2, marginBottom:2 }}>{l}</div>
              <div style={{ fontSize:big ? 15 : 12, fontWeight:700, color:big ? C.accent : 'var(--t1)' }}>{v}</div>
            </div>
          ))}
          <div style={{ alignSelf:'flex-end', marginLeft:'auto', fontSize:8.5, color:C.t3 }}>PLN excluded from totals</div>
        </div>
        <div style={{ display:'flex', gap:20, flexWrap:'wrap', padding:'9px 14px', borderTop:`1px solid ${C.border}`, fontSize:9.5, color:C.t3, alignItems:'center', fontFamily:'var(--mono)' }}>
          <span><span style={badge('green')}>ACT</span> actual — auto-filled at archive</span>
          <span><span style={badge('dim')}>PLN</span> planned — not yet flown</span>
          <span><span style={badge('amber')}>OPEN</span> duty not finished at archive</span>
          <span><span style={badge('red')}>MATCH REVIEW</span> actual match ambiguous</span>
        </div>
      </div>
    </div>
  );
}

// ═══ 3) RULESET SETTINGS ══════════════════════════════════════════
function RulesetSettings({ toast, myProfile, ruleset, offTypes, reload }) {
  const { rules, ignored } = useMemo(() => effectiveRules(ruleset), [ruleset]);
  const reg = ruleset.regulation || {};
  const comp = ruleset.company || {};
  const overrides = comp.overrides || {};
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

  // düzenlenebilir parametreler: [path, label, format(min|count|hours)]
  const PARAMS = [
    ['min_rest.home_base_min', 'MIN REST — HOME BASE', 'min'],
    ['min_rest.out_of_base_min', 'MIN REST — OUT OF BASE', 'min'],
    ['cumulative_limits.duty_7d_min', 'MAX DUTY — 7 DAYS', 'min'],
    ['cumulative_limits.duty_14d_min', 'MAX DUTY — 14 DAYS', 'min'],
    ['cumulative_limits.duty_28d_min', 'MAX DUTY — 28 DAYS', 'min'],
    ['cumulative_limits.duty_cal_year_min', 'MAX DUTY — CAL YEAR', 'min'],
    ['cumulative_limits.flt_28d_min', 'MAX FLT — 28 DAYS', 'min'],
    ['cumulative_limits.flt_12mo_min', 'MAX FLT — 12 MONTHS', 'min'],
    // SHT-FTL/HG Md.5 — bos gunler (eski EASA 'recurrent rest' yerine).
    // Md.13'te TAKVIM YILI UCUS limiti YOKTUR; o satir bilerek listede degil.
    ['days_off.single_day_off_after_consecutive_days', 'DAY OFF AFTER — CONSECUTIVE DAYS', 'count'],
    ['days_off.per_calendar_month_local_days', 'MIN OFF — LOCAL DAYS / MONTH', 'count'],
    ['days_off.per_calendar_year_local_days', 'MIN OFF — LOCAL DAYS / YEAR', 'count'],
    ['days_off.notice_hours', 'DAYS OFF — NOTICE (H)', 'count'],
  ];
  const getPath = (obj, path) => path.split('.').reduce((n, k) => n?.[k], obj);

  const COMPANY = [
    ['pre_flight_report_minutes', 'PRE-FLIGHT REPORT (ETD−) MIN'],
    ['post_flight_duty_minutes', 'POST-FLIGHT DUTY (ON BLK+) MIN'],
    ['mandatory_report_hours', 'FDP EXCEED REPORT (H)'],
    ['min_off_days_per_month', 'MIN OFF DAYS / MONTH'],
  ];

  const save = async () => {
    setSaving(true);
    try {
      const newOverrides = { ...overrides };
      const newCompany = { ...comp };
      const changes = [];
      Object.entries(edits).forEach(([key, valRaw]) => {
        if (valRaw === '' || valRaw == null) return;
        const val = key.includes(':company:') ? Number(valRaw) : (String(valRaw).includes(':') ? toMin(valRaw) : Number(valRaw));
        if (key.startsWith(':company:')) {
          const field = key.slice(9);
          changes.push({ field: `company.${field}`, old_value: newCompany[field] ?? null, new_value: val });
          newCompany[field] = val;
        } else {
          const regVal = getPath(reg, key);
          const dir = overrideDirection(key);
          if (dir === 'decrease_only' && val > regVal) { throw new Error(`${key}: above regulation — blocked.`); }
          if (dir === 'increase_only' && val < regVal) { throw new Error(`${key}: below regulation — blocked.`); }
          changes.push({ field: `overrides.${key}`, old_value: newOverrides[key] ?? null, new_value: val });
          if (val === regVal) delete newOverrides[key]; else newOverrides[key] = val;
        }
      });
      if (!changes.length) { toast('Nothing to save.', 'error'); setSaving(false); return; }
      newCompany.overrides = newOverrides;
      const { error } = await supabase.from('ftl_rulesets').update({ company: newCompany }).eq('id', ruleset.id);
      if (error) throw error;
      const { error: e2 } = await supabase.from('ftl_ruleset_changes').insert(
        changes.map(c => ({ ruleset_id: ruleset.id, changed_by: myProfile.id, field: c.field, old_value: c.old_value, new_value: c.new_value }))
      );
      if (e2) throw e2;
      toast(`${changes.length} change(s) saved — audit logged.`, 'success');
      setEdits({}); reload();
    } catch (e) { toast(e.message, 'error'); }
    setSaving(false);
  };

  const toggleRest = async (t) => {
    const { error } = await supabase.from('ftl_off_types').update({ counts_as_recurrent_rest: !t.counts_as_recurrent_rest }).eq('id', t.id);
    if (error) { toast(error.message, 'error'); return; }
    await supabase.from('ftl_ruleset_changes').insert([{ ruleset_id: ruleset.id, changed_by: myProfile.id, field: `off_type.${t.code}.counts_as_recurrent_rest`, old_value: t.counts_as_recurrent_rest, new_value: !t.counts_as_recurrent_rest }]);
    toast(`${t.code} updated.`, 'success'); reload();
  };

  const fmt = (v, f) => f === 'min' ? fmtMin(v) : String(v ?? '—');

  return (
    <div>
      <div style={{ ...S.note, borderLeftColor:C.accent, color:C.t2, marginBottom:16 }}>
        <b>{ruleset.name}</b> · engine: {ruleset.engine_type} — regulation values are LOCKED. Company may only TIGHTEN
        (min rest/OFF ↑ only · max limits ↓ only). Every change → <b>ftl_ruleset_changes</b> (who · when · old → new, no delete). Applies FORWARD only.
      </div>
      {ignored.length > 0 && (
        <div style={{ ...S.note, borderLeftColor:C.red, color:C.red, marginBottom:16 }}>
          IGNORED OVERRIDES (outside regulation): {ignored.map(i => `${i.path}=${i.val} (${i.reason})`).join(' · ')}
        </div>
      )}

      <div style={{ overflowX:'auto', marginBottom:20 }}>
        <table style={{ ...S.table, minWidth:760 }}>
          <thead><tr>{['PARAMETER', 'REGULATION (LOCKED)', 'COMPANY VALUE', 'DIRECTION', 'STATUS'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {PARAMS.map(([path, label, f]) => {
              const regVal = getPath(reg, path);
              const effVal = getPath(rules, path);
              const dir = overrideDirection(path);
              const stricter = effVal !== regVal;
              return (
                <tr key={path}>
                  <td style={S.td}>{label}</td>
                  <td style={{ ...S.td, color:C.t3 }}>{fmt(regVal, f)}</td>
                  <td style={S.td}>
                    <input style={{ ...S.input, width:100, color: stricter ? C.green : 'var(--t1)' }}
                      placeholder={fmt(effVal, f)}
                      value={edits[path] ?? ''}
                      onChange={e => setEdits(s => ({ ...s, [path]: e.target.value }))} />
                  </td>
                  <td style={{ ...S.td, color:C.t3, fontSize:11 }}>{dir === 'increase_only' ? 'increase only ▲' : dir === 'decrease_only' ? 'decrease only ▼' : 'free'}</td>
                  <td style={S.td}>{stricter ? <span style={badge('green')}>STRICTER</span> : <span style={badge('dim')}>= REG</span>}</td>
                </tr>
              );
            })}
            {COMPANY.map(([field, label]) => (
              <tr key={field}>
                <td style={S.td}>{label}</td>
                <td style={{ ...S.td, color:C.t3, fontSize:10 }}>— company rule</td>
                <td style={S.td}>
                  <input style={{ ...S.input, width:100 }} placeholder={String(comp[field] ?? '—')}
                    value={edits[`:company:${field}`] ?? ''}
                    onChange={e => setEdits(s => ({ ...s, [`:company:${field}`]: e.target.value }))} />
                </td>
                <td style={{ ...S.td, color:C.t3, fontSize:11 }}>company-defined</td>
                <td style={S.td}><span style={badge('amber')}>COMPANY</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ ...S.note, marginBottom:20 }}>
        Time values HH:MM (e.g. 11:00) or minutes; hour/count fields plain numbers. Leave blank = unchanged.
        Setting a value equal to regulation removes the override.
      </div>
      <button style={S.btnP} disabled={saving} onClick={save}>{saving ? 'SAVING...' : 'SAVE CHANGES'}</button>

      <div style={{ ...S.panel, marginTop:26 }}>
        <div style={S.panelH}>
          <span style={S.panelT}>OFF / Absence Types</span>
          <span style={{ fontSize:9, color:C.t3, letterSpacing:1, fontFamily:'var(--mono)' }}>no delete — deactivate only · toggle = audit logged</span>
        </div>
        <table style={S.table}>
          <thead><tr>{['CODE', 'LABEL', 'ASSIGNABLE', 'COUNTS AS DAY OFF (Md.5)'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {offTypes.map(t => (
              <tr key={t.id}>
                <td style={S.td}><span style={badge(t.counts_as_recurrent_rest ? 'dim' : 'red')}>{t.code}</span></td>
                <td style={S.td}>{t.label}</td>
                <td style={{ ...S.td, color:C.t3 }}>NO</td>
                <td style={{ ...S.td, cursor:'pointer', color: t.counts_as_recurrent_rest ? C.green : C.t3, fontWeight:700 }}
                  onClick={() => toggleRest(t)}>{t.counts_as_recurrent_rest ? 'YES' : 'NO'} ⇄</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
