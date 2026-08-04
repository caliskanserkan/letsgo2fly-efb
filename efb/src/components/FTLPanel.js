// FTLPanel.js — Admin panel FTL sekmesi (Faz 1)
// Görev-öncelikli atama sihirbazı · pilot görev geçmişi (denetçi raporu) · ruleset ayarları
// Tek kaynak: crew_duties + ftl_rulesets + ftl_pilot_baselines (RLS müşteri sınırı)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  toMin, fmtMin, spanMin, effectiveRules, overrideDirection,
  fitness, dutyWindow,
} from './FTLEngine';
import { normTime } from './inputFormat';

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

// tarih + yerel "HH:MM" → ISO (dispatcher'ın tarayıcı saat dilimi — Faz 1: TR operasyonu)
const localISO = (dateStr, hhmm) => {
  if (!dateStr || !hhmm) return null;
  const d = new Date(`${dateStr}T${hhmm.padStart(5, '0')}:00`);
  return isNaN(d) ? null : d.toISOString();
};
const addMin = (iso, min) => iso ? new Date(new Date(iso).getTime() + min * 60000).toISOString() : null;
// crypto.randomUUID Safari 15.4 oncesinde yok — yedegi RFC4122 v4 uretir.
const newUuid = () => {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const b = new Uint8Array(16);
  window.crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).toUpperCase() : '—';
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }).toUpperCase() : '—';

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

  if (!customerId) return <div style={{ padding:32, color:C.t3, fontSize:11, fontFamily:'var(--mono)' }}>NO CUSTOMER CONTEXT — select a company first.</div>;
  if (loading) return <div style={{ padding:32, textAlign:'center', color:C.t3, fontSize:11, fontFamily:'var(--mono)' }}>LOADING FTL DATA...</div>;
  if (!ruleset) return <div style={{ padding:32, color:C.red, fontSize:11, fontFamily:'var(--mono)' }}>NO FTL RULESET LINKED TO THIS CUSTOMER — run Faz 0 SQL / link customers.ftl_ruleset_id.</div>;

  return (
    <div style={{ flex:1, overflowY:'auto', minWidth:0 }}>
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, background:C.bg2 }}>
        <div style={tabS('assign')} onClick={() => setView('assign')}>Assign Duty</div>
        <div style={tabS('history')} onClick={() => setView('history')}>Duty History</div>
        <div style={tabS('edits')} onClick={() => setView('edits')}>Edit Report</div>
        <div style={tabS('ruleset')} onClick={() => setView('ruleset')}>Ruleset</div>
        <div style={{ flex:1 }} />
        <div style={{ alignSelf:'center', paddingRight:16, fontSize:9, color:C.t3, letterSpacing:1, fontFamily:'var(--mono)' }}>
          {ruleset.name} · ALL TIMES LOCAL
        </div>
      </div>
      <div style={{ padding:18 }}>
        {view === 'assign' && <>
          <DutyRoster {...{ toast, myProfile, pilots, duties, reload: load }} />
          <AssignDuty {...{ toast, myProfile, pilots, duties, baselines, ruleset, offTypes, homeBases, reload: load }} />
        </>}
        {view === 'history' && <DutyHistory {...{ pilots, duties, baselines, offTypes }} />}
        {view === 'edits' && <EditReport {...{ pilots, edits, duties }} />}
        {view === 'ruleset' && <RulesetSettings {...{ toast, myProfile, ruleset, offTypes, reload: load }} />}
      </div>
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
  return s.map(x => `${x.dep || '?'}-${x.dest || '?'}`).join(' · ');
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

function DutyRoster({ toast, myProfile, pilots, duties, reload }) {
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => plus(today, 14));
  const [pending, setPending] = useState(null);   // {mode:'cancel'|'delete', rows:[...]}

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
                return (
                  <tr key={g.key} style={{ opacity: allCancelled ? .45 : 1 }}>
                    <td style={S.td}>{fmtD(d.duty_date)}</td>
                    <td style={S.td}>{(d.duty_type || '').toUpperCase()}</td>
                    <td style={{ ...S.td, whiteSpace:'normal' }}>{routeOf(d)}</td>
                    <td style={S.td}>{fmtDT(d.report_time)}</td>
                    <td style={S.td}>{fmtDT(d.duty_end)}</td>
                    <td style={S.td}>
                      {g.rows.map(r => {
                        const role = (r.sectors || [])[0]?.role;
                        return <span key={r.id} style={{ marginRight:8 }}>
                          {nameOf(r.pilot_id)}{role ? <span style={{ color:C.t3 }}> ({role})</span> : null}
                        </span>;
                      })}
                    </td>
                    <td style={S.td}>{statusBadge(d.status)}{d.match_review && <span style={{ ...badge('amber'), marginLeft:6 }}>REVIEW</span>}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>
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
        <button style={S.btnS} onClick={() => window.print()}>PRINT / PDF</button>
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

  const timeOk = (t) => /^\d{2}:\d{2}$/.test(t || '');
  const win = useMemo(() => {
    if (dutyType !== 'flight') return null;
    const complete = legs.filter(l => timeOk(l.etd) && timeOk(l.eta));
    return complete.length === legs.length ? dutyWindow(complete, accommodation, ruleset) : null;
  }, [legs, accommodation, ruleset, dutyType]);

  const { rules } = useMemo(() => effectiveRules(ruleset), [ruleset]);
  const lim = rules.cumulative_limits || {};

  // her pilot için uygunluk
  const fitList = useMemo(() => {
    if (dutyType !== 'flight' || !win) return [];
    const reportISO = localISO(date, win.report);
    return pilots.filter(p => ['pilot', 'admin_pilot'].includes(p.role)).map(p => {
      const myDuties = duties.filter(d => d.pilot_id === p.id);
      const f = fitness({
        pilot: p, baseline: baselines[p.id] || null, duties: myDuties, ruleset,
        newDuty: { reportISO, sectors: legs, dutyMin: win.dutyMin },
        asOf: reportISO ? new Date(reportISO) : new Date(),
      });
      return { pilot: p, ...f };
    });
  }, [pilots, duties, baselines, ruleset, legs, win, date, dutyType]);

  const setLeg = (i, k, v) => setLegs(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l));

  const toggle = (pid) => setSelected(s => {
    const cur = s[pid];
    const next = { ...s };
    if (!cur) next[pid] = Object.values(s).includes('PF') ? 'PM' : 'PF';
    else if (cur === 'PF') next[pid] = 'PM';
    else delete next[pid];
    return next;
  });

  const save = async () => {
    const ids = Object.keys(selected);
    if (dutyType !== 'off' && !ids.length) { toast('Select at least one pilot.', 'error'); return; }
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
      const base = {
        assignment_id: assignmentId,
        customer_id: myProfile.customer_id, created_by: myProfile.id,
        ruleset_id: ruleset.id, ruleset_snapshot: { regulation: ruleset.regulation, company: ruleset.company },
        duty_date: date, report_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        status: isPast ? 'actual' : 'planned',
        ...(isPast ? { duty_finished: true } : {}),
      };
      if (dutyType === 'flight') {
        if (!win || legs.some(l => !l.dep || !l.dest || !l.etd || !l.eta)) { toast('Complete all sector fields.', 'error'); setSaving(false); return; }
        const reportISO = localISO(date, win.report);
        const lastEta = legs[legs.length - 1].eta;
        const crossesMidnight = toMin(lastEta) < toMin(win.report);
        const endISO = addMin(localISO(crossesMidnight ? nextDay(date) : date, lastEta), (effectiveRules(ruleset).company.postFlightDutyMin));
        ids.forEach(pid => {
          const home = homeBases[pid];
          const atBase = !home || legs[legs.length - 1].dest.toUpperCase() === home.toUpperCase();
          const minRest = Math.max(win.dutyMin || 0, atBase ? (rules.min_rest?.home_base_min ?? 720) : (rules.min_rest?.out_of_base_min ?? 600));
          rows.push({
            ...base, pilot_id: pid, duty_type: 'flight',
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
            split_duty: win.split.isSplit, break_minutes: win.breakMin,
            accommodation: win.split.isSplit ? accommodation : null,
            max_fdp_minutes: win.maxFdpMin, fdp_minutes: win.fdpMin, fdp_exceeded: !!win.fdpExceeded,
            min_rest_minutes: minRest, earliest_next_report: addMin(endISO, minRest),
            mandatory_report_due: win.fdpExceeded ? addMin(endISO, (effectiveRules(ruleset).company.mandatoryReportHours) * 60) : null,
          });
        });
      } else if (dutyType === 'ground') {
        const startISO = localISO(date, gnd.start);
        const endISO = localISO(toMin(gnd.end) < toMin(gnd.start) ? nextDay(date) : date, gnd.end);
        const dMin = (new Date(endISO) - new Date(startISO)) / 60000;
        ids.forEach(pid => {
          const minRest = Math.max(dMin, rules.min_rest?.home_base_min ?? 720);
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
      setSelected({}); reload();
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
              <option value="sim">SIM</option><option value="airport_standby">AIRPORT STANDBY</option>
            </select>
          </div>
          <div style={{ width:110 }}><span style={S.label}>Start (LT)</span><input style={S.input} value={gnd.start} onChange={e => setGnd(g => ({ ...g, start: normTime(e.target.value) }))} /></div>
          <div style={{ width:110 }}><span style={S.label}>End (LT)</span><input style={S.input} value={gnd.end} onChange={e => setGnd(g => ({ ...g, end: normTime(e.target.value) }))} /></div>
        </>)}
      </div>

      {dutyType === 'flight' && (<>
        <span style={S.label}>Sectors</span>
        {legs.map((l, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'30px 1fr 1fr 1fr 1fr 40px', gap:10, marginBottom:8, alignItems:'center' }}>
            <div style={{ fontSize:11, color:C.t3, textAlign:'center', fontFamily:'var(--mono)' }}>{i + 1}</div>
            <input style={S.input} placeholder="DEP" maxLength={4} value={l.dep} onChange={e => setLeg(i, 'dep', e.target.value.toUpperCase())} />
            <input style={S.input} placeholder="DEST" maxLength={4} value={l.dest} onChange={e => setLeg(i, 'dest', e.target.value.toUpperCase())} />
            <input style={S.input} placeholder="ETD LT (06:30)" value={l.etd} onChange={e => setLeg(i, 'etd', normTime(e.target.value))} />
            <input style={S.input} placeholder="ETA LT (07:45)" value={l.eta} onChange={e => setLeg(i, 'eta', normTime(e.target.value))} />
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
              ].map(([k, v]) => (
                <div key={k} style={{ background:C.bg3, padding:'10px 13px' }}>
                  <div style={{ fontSize:9, letterSpacing:1.5, color:C.t3, textTransform:'uppercase', marginBottom:5, fontFamily:'var(--mono)' }}>{k}</div>
                  <div style={{ fontSize:16, fontWeight:700, color: k === 'PLANNED FDP' && win.fdpExceeded ? C.red : C.accent, fontFamily:'var(--mono)' }}>{v ?? '—'}</div>
                </div>
              ))}
            </div>
            {win.fdpExceeded && <div style={{ ...S.note, borderLeftColor:C.red, color:C.red, marginTop:8 }}>PLANNED FDP EXCEEDS MAX FDP — assignment should not be planned this way.</div>}
          </div>
        )}

        <div style={{ marginTop:20 }}>
          <span style={S.label}>Crew — who can fly this duty?</span>
          <div style={{ overflowX:'auto' }}>
            <table style={S.table}>
              <thead><tr>{['', 'PILOT', 'FITNESS', 'REASON', `FLT 28D / ${fmtMin(lim.flt_28d_min)}`, `DUTY 7D / ${fmtMin(lim.duty_7d_min)}`, 'ROLE'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {fitList.map(({ pilot, legal, reasons, cum }) => {
                  const sel = selected[pilot.id];
                  return (
                    <tr key={pilot.id} onClick={() => legal && toggle(pilot.id)} style={{ cursor: legal ? 'pointer' : 'default', opacity: legal ? 1 : .65, background: sel ? `var(--accent-soft)` : 'transparent' }}>
                      <td style={S.td}>{sel ? '☑' : '☐'}</td>
                      <td style={{ ...S.td, color: legal ? C.accent : C.t3, fontWeight:700 }}>{pilot.code} — {pilot.full_name}</td>
                      <td style={S.td}><span style={badge(legal ? 'green' : 'red')}>{legal ? 'LEGAL' : 'NOT LEGAL'}</span></td>
                      <td style={{ ...S.td, color:C.red, fontSize:11, whiteSpace:'normal', maxWidth:280 }}>{reasons.join(' · ') || '—'}</td>
                      <td style={S.td}>{fmtMin(cum.flt28d)}</td>
                      <td style={S.td}>{fmtMin(cum.duty7d)}</td>
                      <td style={S.td}>{sel ? <span style={badge('blue')}>{sel}</span> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.note, marginTop:8 }}>Click row: 1st = PF, click again = PM, again = deselect. NOT LEGAL rows cannot be selected.</div>
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
function DutyHistory({ pilots, duties, baselines, offTypes }) {
  const flyable = pilots.filter(p => ['pilot', 'admin_pilot'].includes(p.role));
  const [pilotId, setPilotId] = useState('');
  useEffect(() => { if (!pilotId && flyable.length) setPilotId(flyable[0].id); }, [flyable, pilotId]);

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
        else { s.pfCount++; s.pfMin += m; }
      });
    });
    return s;
  }, [rows]);

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
        return d.sectors.map((l, i) => {
          const blkS = l.off_block || l.etd, blkE = l.on_block || l.eta;
          return `<tr class="${actual ? '' : 'pln'}">
            <td>${i === 0 ? esc(fmtD(d.duty_date)) : ''}</td><td>${i === 0 ? 'FLT' : ''}</td>
            <td>${esc(l.dep)}–${esc(l.dest)}</td><td>${esc(blkS)}–${esc(blkE)}</td>
            <td>${fmtMin(spanMin(blkS, blkE))}</td><td class="role">${esc(l.role || 'PF')}</td>
            <td>${i === 0 ? dutyT : ''}</td><td>${i === 0 ? st : ''}</td></tr>`;
        }).join('');
      }
      const kind = d.duty_type === 'off' ? `OFF · ${esc(d.off_subtype || '—')}` : `GND · ${esc((d.ground_kind || '—').toUpperCase())}`;
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
          <div><b>SECTORS AS PF</b>${summary.pfCount} · ${fmtMin(summary.pfMin)}</div>
          <div><b>SECTORS AS PM</b>${summary.pmCount} · ${fmtMin(summary.pmMin)}</div>
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
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{l.dep}–{l.dest}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{blkS}–{blkE}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{fmtMin(spanMin(blkS, blkE))}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{i === 0 ? `${fmtDT(d.report_time).slice(-5)}–${fmtDT(d.duty_end).slice(-5)}` : ''}</td>
                        <td style={{ ...S.td, ...dimC, borderBottom: last ? undefined : 'none' }}>{last ? fmtMin(d.report_time && d.duty_end ? (new Date(d.duty_end) - new Date(d.report_time)) / 60000 : null) : ''}</td>
                        <td style={{ ...S.td, color: isPln ? C.t3 : C.green, fontWeight:700, borderBottom: last ? undefined : 'none' }}>{last ? fmtMin(d.min_rest_minutes) : ''}</td>
                        <td style={{ ...S.td, color: isPln ? C.t3 : C.accent, fontWeight:700, borderBottom: last ? undefined : 'none' }}>{last ? fmtDT(d.earliest_next_report) : ''}</td>
                        <td style={{ ...S.td, borderBottom: last ? undefined : 'none' }}>{last ? <>{srcBadge(d)}{d.match_review && <span style={{ ...badge('red'), marginLeft:6 }}>MATCH REVIEW</span>}{d.fdp_exceeded && <span style={{ ...badge('red'), marginLeft:6 }}>FDP EXC</span>}</> : ''}</td>
                      </tr>
                    );
                  });
                }
                return (
                  <tr key={d.id} style={{ borderBottom:`2px solid ${C.border2}` }}>
                    <td style={{ ...S.td, ...dimC }}>{fmtD(d.duty_date)}</td>
                    <td style={S.td}><span style={badge(d.duty_type === 'off' ? 'dim' : 'amber')}>{d.duty_type === 'off' ? 'OFF' : 'GND'}</span></td>
                    <td style={{ ...S.td, color:C.t3 }}>{d.duty_type === 'off' ? (d.off_subtype || '—') : (d.ground_kind || '—').toUpperCase()}</td>
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
    ['cumulative_limits.flt_cal_year_min', 'MAX FLT — CAL YEAR', 'min'],
    ['cumulative_limits.flt_12mo_min', 'MAX FLT — 12 MONTHS', 'min'],
    ['recurrent_rest.min_hours', 'RECURRENT REST — MIN HOURS', 'count'],
    ['recurrent_rest.max_between_hours', 'RECURRENT REST — MAX BETWEEN (H)', 'count'],
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
          <thead><tr>{['CODE', 'LABEL', 'ASSIGNABLE', 'COUNTS AS RECURRENT REST'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
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
