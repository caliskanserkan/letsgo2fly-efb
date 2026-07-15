// FTLPanel.js — Admin panel FTL sekmesi (Faz 1)
// Görev-öncelikli atama sihirbazı · pilot görev geçmişi (denetçi raporu) · ruleset ayarları
// Tek kaynak: crew_duties + ftl_rulesets + ftl_pilot_baselines (RLS müşteri sınırı)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import {
  toMin, fmtMin, spanMin, effectiveRules, overrideDirection,
  fitness, cumulatives, dutyWindow,
} from './FTLEngine';

const C = {
  bg:'#0a0c10', bg2:'#0d1117', bg3:'#111620', border:'#1e2530', border2:'#2a3040',
  accent:'#e8a020', accentDim:'#4a3010',
  green:'#40d080', red:'#f06060', blue:'#4a9bc4',
  t1:'#ffffff', t2:'#b8c0cc', t3:'#6b7585',
};
const S = {
  label:{ fontSize:10, color:C.t2, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', fontFamily:"'Courier New',monospace", display:'block', marginBottom:6 },
  input:{ background:'#080c12', border:`1px solid ${C.border}`, color:'#fff', padding:'9px 11px', fontSize:13, fontFamily:"'Courier New',monospace", width:'100%', boxSizing:'border-box', outline:'none' },
  table:{ width:'100%', borderCollapse:'collapse' },
  th:{ padding:'9px 12px', textAlign:'left', fontSize:10, color:'#fff', fontWeight:700, letterSpacing:1, textTransform:'uppercase', borderBottom:`1px solid ${C.border}`, background:C.bg3, whiteSpace:'nowrap', fontFamily:"'Courier New',monospace" },
  td:{ padding:'9px 12px', borderBottom:`1px solid ${C.border}`, color:'#fff', fontSize:12.5, fontWeight:600, verticalAlign:'middle', whiteSpace:'nowrap', fontFamily:"'Courier New',monospace", fontVariantNumeric:'tabular-nums' },
  btnP:{ background:C.accent, color:'#0a0c10', border:'none', padding:'10px 22px', fontSize:12, fontFamily:"'Courier New',monospace", fontWeight:700, letterSpacing:1.5, cursor:'pointer', textTransform:'uppercase' },
  btnS:{ background:'none', color:'#fff', border:`1px solid ${C.border2}`, padding:'8px 16px', fontSize:11, fontFamily:"'Courier New',monospace", cursor:'pointer', letterSpacing:1 },
  panel:{ background:C.bg2, border:`1px solid ${C.border}`, marginBottom:22 },
  panelH:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 16px', borderBottom:`1px solid ${C.border}`, background:C.bg3 },
  panelT:{ fontSize:11, fontWeight:700, letterSpacing:2, color:C.accent, textTransform:'uppercase', fontFamily:"'Courier New',monospace" },
  note:{ fontSize:10, color:C.t3, letterSpacing:.5, lineHeight:1.7, padding:'9px 12px', background:C.bg3, borderLeft:`2px solid ${C.border2}`, fontFamily:"'Courier New',monospace" },
};
const badge = (kind) => {
  const map = {
    green:{ c:C.green, bg:'#0a1a10', bd:'#1a4030' }, red:{ c:C.red, bg:'#1a0808', bd:'#602020' },
    blue:{ c:C.blue, bg:'#0a1a2a', bd:'#1a3a5a' }, amber:{ c:C.accent, bg:'rgba(232,160,32,.08)', bd:C.accentDim },
    dim:{ c:C.t3, bg:'#12151c', bd:C.border2 },
  }[kind] || {};
  return { display:'inline-block', padding:'2px 8px', fontSize:9, letterSpacing:1, fontWeight:700, border:`1px solid ${map.bd}`, color:map.c, background:map.bg, fontFamily:"'Courier New',monospace" };
};

// saat girişi otomatik format: "0645" → "06:45" (yazarken). Yalnız SAAT hücreleri —
// süre alanları (388:10 gibi 24h üstü) bu formatı KULLANMAZ.
const normTime = (v) => {
  const d = String(v).replace(/[^\d]/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  let hh = d.slice(0, 2), mm = d.slice(2);
  if (Number(hh) > 23) hh = '23';
  if (mm.length === 2 && Number(mm) > 59) mm = '59';
  return `${hh}:${mm}`;
};

// tarih + yerel "HH:MM" → ISO (dispatcher'ın tarayıcı saat dilimi — Faz 1: TR operasyonu)
const localISO = (dateStr, hhmm) => {
  if (!dateStr || !hhmm) return null;
  const d = new Date(`${dateStr}T${hhmm.padStart(5, '0')}:00`);
  return isNaN(d) ? null : d.toISOString();
};
const addMin = (iso, min) => iso ? new Date(new Date(iso).getTime() + min * 60000).toISOString() : null;
const fmtDT = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).toUpperCase() : '—';
const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }).toUpperCase() : '—';

export default function FTLPanel({ toast, myProfile }) {
  const [view, setView] = useState('assign'); // assign | history | ruleset
  const [pilots, setPilots] = useState([]);
  const [duties, setDuties] = useState([]);
  const [baselines, setBaselines] = useState([]); // en güncel satır / pilot
  const [ruleset, setRuleset] = useState(null);
  const [offTypes, setOffTypes] = useState([]);
  const [homeBases, setHomeBases] = useState({});
  const [loading, setLoading] = useState(true);

  const customerId = myProfile?.customer_id;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: d }, { data: b }, { data: cust }, { data: ot }, { data: hb }] = await Promise.all([
      supabase.from('profiles').select('id,code,full_name,role').order('full_name'),
      supabase.from('crew_duties').select('*').order('report_time', { ascending: true }),
      supabase.from('ftl_pilot_baselines').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('id,ftl_ruleset_id').eq('id', customerId).single(),
      supabase.from('ftl_off_types').select('*').eq('active', true).order('code'),
      supabase.from('home_bases').select('pilot_id,icao'),
    ]);
    setPilots(p || []); setDuties(d || []); setOffTypes(ot || []);
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

  const tabS = (t) => ({ flex:'none', padding:'10px 24px', textAlign:'center', cursor:'pointer', fontFamily:"'Courier New',monospace", fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', color:view===t?C.accent:C.t3, borderBottom:view===t?`2px solid ${C.accent}`:'2px solid transparent', background:view===t?`${C.accent}08`:'transparent' });

  if (!customerId) return <div style={{ padding:32, color:C.t3, fontSize:11, fontFamily:"'Courier New',monospace" }}>NO CUSTOMER CONTEXT — select a company first.</div>;
  if (loading) return <div style={{ padding:32, textAlign:'center', color:C.t3, fontSize:11, fontFamily:"'Courier New',monospace" }}>LOADING FTL DATA...</div>;
  if (!ruleset) return <div style={{ padding:32, color:C.red, fontSize:11, fontFamily:"'Courier New',monospace" }}>NO FTL RULESET LINKED TO THIS CUSTOMER — run Faz 0 SQL / link customers.ftl_ruleset_id.</div>;

  return (
    <div style={{ flex:1, overflowY:'auto', minWidth:0 }}>
      <div style={{ display:'flex', borderBottom:`1px solid ${C.border}`, background:C.bg2 }}>
        <div style={tabS('assign')} onClick={() => setView('assign')}>Assign Duty</div>
        <div style={tabS('history')} onClick={() => setView('history')}>Duty History</div>
        <div style={tabS('ruleset')} onClick={() => setView('ruleset')}>Ruleset</div>
        <div style={{ flex:1 }} />
        <div style={{ alignSelf:'center', paddingRight:16, fontSize:9, color:C.t3, letterSpacing:1, fontFamily:"'Courier New',monospace" }}>
          {ruleset.name} · ALL TIMES LOCAL
        </div>
      </div>
      <div style={{ padding:18 }}>
        {view === 'assign' && <AssignDuty {...{ toast, myProfile, pilots, duties, baselines, ruleset, offTypes, homeBases, reload: load }} />}
        {view === 'history' && <DutyHistory {...{ pilots, duties, baselines, offTypes }} />}
        {view === 'ruleset' && <RulesetSettings {...{ toast, myProfile, ruleset, offTypes, reload: load }} />}
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
      const base = {
        customer_id: myProfile.customer_id, created_by: myProfile.id,
        ruleset_id: ruleset.id, ruleset_snapshot: { regulation: ruleset.regulation, company: ruleset.company },
        duty_date: date, report_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        status: 'planned',
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
            sectors: legs.map((l, i) => ({ seq: i + 1, dep: l.dep.toUpperCase(), dest: l.dest.toUpperCase(), etd: l.etd, eta: l.eta, role: selected[pid] })),
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
    <div onClick={() => setDutyType(t)} style={{ padding:'9px 22px', fontSize:11, fontWeight:700, letterSpacing:1.5, cursor:'pointer', fontFamily:"'Courier New',monospace", background: dutyType === t ? C.accent : 'transparent', color: dutyType === t ? '#0a0c10' : C.t3 }}>{label}</div>
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
            <div style={{ fontSize:11, color:C.t3, textAlign:'center', fontFamily:"'Courier New',monospace" }}>{i + 1}</div>
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
                  <div style={{ fontSize:9, letterSpacing:1.5, color:C.t3, textTransform:'uppercase', marginBottom:5, fontFamily:"'Courier New',monospace" }}>{k}</div>
                  <div style={{ fontSize:16, fontWeight:700, color: k === 'PLANNED FDP' && win.fdpExceeded ? C.red : C.accent, fontFamily:"'Courier New',monospace" }}>{v ?? '—'}</div>
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
                    <tr key={pilot.id} onClick={() => legal && toggle(pilot.id)} style={{ cursor: legal ? 'pointer' : 'default', opacity: legal ? 1 : .65, background: sel ? `${C.accent}08` : 'transparent' }}>
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
                  style={{ padding:'8px 14px', border:`1px solid ${sel ? C.accent : C.border2}`, color: sel ? C.accent : C.t2, cursor:'pointer', fontSize:12, fontFamily:"'Courier New',monospace", background: sel ? `${C.accent}08` : 'transparent' }}>
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
  const rows = useMemo(() => duties
    .filter(d => d.pilot_id === pilotId)
    .sort((a, b) => new Date(a.report_time || a.duty_date) - new Date(b.report_time || b.duty_date)),
  [duties, pilotId]);
  const baseline = baselines[pilotId];
  const pilot = pilots.find(p => p.id === pilotId);

  const srcBadge = (d) => d.status === 'planned' ? <span style={badge('dim')}>PLN</span>
    : d.status === 'open' ? <span style={badge('amber')}>OPEN</span>
    : <span style={badge('green')}>ACT</span>;

  return (
    <div>
      <div style={{ display:'flex', gap:14, alignItems:'flex-end', marginBottom:16 }}>
        <div style={{ width:300 }}>
          <span style={S.label}>Pilot</span>
          <select style={S.input} value={pilotId} onChange={e => setPilotId(e.target.value)}>
            {flyable.map(p => <option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>)}
          </select>
        </div>
        <div style={{ flex:1 }} />
        <button style={S.btnS} onClick={() => window.print()}>🖨 PRINT / PDF</button>
      </div>

      <div style={{ ...S.panel }}>
        <div style={S.panelH}>
          <span style={S.panelT}>Duty History — {pilot ? `${pilot.full_name} (${pilot.code})` : ''}</span>
          <span style={{ fontSize:9, color:C.t3, letterSpacing:1, fontFamily:"'Courier New',monospace" }}>crew_duties · per pilot · no delete</span>
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
                const dimC = { color: isPln ? C.t3 : '#fff' };
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
        <div style={{ display:'flex', gap:20, flexWrap:'wrap', padding:'9px 14px', borderTop:`1px solid ${C.border}`, fontSize:9.5, color:C.t3, alignItems:'center', fontFamily:"'Courier New',monospace" }}>
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
                    <input style={{ ...S.input, width:100, color: stricter ? C.green : '#fff' }}
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
          <span style={{ fontSize:9, color:C.t3, letterSpacing:1, fontFamily:"'Courier New',monospace" }}>no delete — deactivate only · toggle = audit logged</span>
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
