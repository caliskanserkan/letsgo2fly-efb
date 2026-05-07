// AdminPanel.js — GO2 eFB Admin Panel v2
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// ─── Styles ───────────────────────────────────────────────────────────────────
const C = {
  bg:       '#0a0c10',
  bg2:      '#0d1117',
  bg3:      '#111620',
  border:   '#1e2530',
  border2:  '#2a3040',
  accent:   '#e8a020',
  accentDim:'#4a3010',
  t1:       '#ffffff',
  t2:       '#ffffff',
  t3:       '#ffffff',
  green:    '#2d7a4f',
  greenDim: '#0a1a10',
  red:      '#c04040',
  redDim:   '#1a0808',
  blue:     '#1a6b9c',
  blueDim:  '#0a1a2a',
};

const S = {
  sidebar: {
    width: 200,
    background: C.bg2,
    borderRight: `1px solid ${C.border}`,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  navItem: (active) => ({
    padding: '11px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
    background: active ? `${C.accent}10` : 'transparent',
    borderBottom: `1px solid ${C.border}`,
    transition: 'all 0.15s',
  }),
  navLabel: (active) => ({
    fontSize: 16,
    fontWeight: active ? 700 : 500,
    color: active ? C.accent : C.t1,
    letterSpacing: 0.5,
    fontFamily: "'Courier New', monospace",
    textTransform: 'uppercase',
  }),
  navIcon: { fontSize: 18, width: 20, textAlign: 'center' },
  card: {
    background: C.bg2,
    border: `1px solid ${C.border}`,
    borderRadius: 0,
    marginBottom: 1,
  },
  cardHeader: {
    padding: '10px 16px',
    borderBottom: `1px solid ${C.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 11,
    color: C.t3,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: "'Courier New', monospace",
  },
  value: {
    fontSize: 14,
    color: C.t1,
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 14,
    color: '#ffffff',
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderBottom: `1px solid ${C.border}`,
    fontFamily: "'Courier New', monospace",
    background: C.bg3,
  },
  td: {
    padding: '11px 14px',
    borderBottom: `1px solid ${C.border}`,
    color: '#ffffff',
    fontFamily: "'Courier New', monospace",
    fontSize: 15,
    fontWeight: 600,
    verticalAlign: 'middle',
  },
  badge: (color) => ({
    display: 'inline-block',
    padding: '3px 9px',
    fontSize: 13,
    letterSpacing: 1,
    fontWeight: 700,
    fontFamily: "'Courier New', monospace",
    background: color === 'green' ? C.greenDim : color === 'red' ? C.redDim : color === 'blue' ? C.blueDim : `${C.accent}10`,
    color: color === 'green' ? '#40d080' : color === 'red' ? '#f06060' : color === 'blue' ? '#4a9bc4' : C.accent,
    border: `1px solid ${color === 'green' ? '#1a4030' : color === 'red' ? '#602020' : color === 'blue' ? '#1a3a5a' : C.accentDim}`,
  }),
  input: {
    width: '100%',
    background: '#080c12',
    border: `1px solid ${C.border}`,
    color: '#ffffff',
    padding: '10px 12px',
    fontSize: 16,
    fontFamily: "'Courier New', monospace",
    outline: 'none',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    background: '#080c12',
    border: `1px solid ${C.border}`,
    color: '#ffffff',
    padding: '10px 12px',
    fontSize: 16,
    fontFamily: "'Courier New', monospace",
    outline: 'none',
    boxSizing: 'border-box',
    appearance: 'none',
  },
  btnPrimary: {
    background: C.accent,
    color: '#0a0c10',
    border: 'none',
    padding: '10px 22px',
    fontSize: 14,
    fontFamily: "'Courier New', monospace",
    fontWeight: 700,
    letterSpacing: 1.5,
    cursor: 'pointer',
    textTransform: 'uppercase',
  },
  btnSecondary: {
    background: 'none',
    color: '#ffffff',
    border: `1px solid ${C.border2}`,
    padding: '8px 16px',
    fontSize: 14,
    fontFamily: "'Courier New', monospace",
    cursor: 'pointer',
    letterSpacing: 1,
  },
  btnDanger: {
    background: 'none',
    color: C.red,
    border: `1px solid #3a1010`,
    padding: '7px 14px',
    fontSize: 14,
    fontFamily: "'Courier New', monospace",
    cursor: 'pointer',
    letterSpacing: 1,
  },
  formGroup: { marginBottom: 16 },
  formLabel: {
    display: 'block',
    fontSize: 14,
    color: '#ffffff',
    letterSpacing: 1,
    fontWeight: 700,
    textTransform: 'uppercase',
    fontFamily: "'Courier New', monospace",
    marginBottom: 7,
  },
  modal: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 200,
  },
  modalBox: {
    background: C.bg2,
    border: `1px solid ${C.border2}`,
    padding: 28,
    minWidth: 400,
    maxWidth: 560,
    width: '90%',
    maxHeight: '85vh',
    overflowY: 'auto',
  },
  toast: (type) => ({
    position: 'fixed', bottom: 24, right: 24,
    background: type === 'error' ? C.redDim : C.greenDim,
    border: `1px solid ${type === 'error' ? '#602020' : '#206040'}`,
    color: type === 'error' ? '#f06060' : '#40d080',
    padding: '10px 18px', fontSize: 11,
    fontFamily: "'Courier New', monospace",
    zIndex: 1000, letterSpacing: 1,
  }),
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  if (!msg) return null;
  return <div style={S.toast(type)}>{type === 'error' ? '⚠ ' : '✓ '}{msg}</div>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, width }) {
  return (
    <div style={S.modal} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modalBox, ...(width ? { minWidth: width } : {}) }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, paddingBottom:10, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11, color:C.accent, letterSpacing:3, fontWeight:700, fontFamily:"'Courier New', monospace", textTransform:'uppercase' }}>{title}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:C.t3, cursor:'pointer', fontSize:18, fontFamily:'inherit' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Detail Panel (sağ) ───────────────────────────────────────────────────────
function DetailPanel({ title, children, onClose }) {
  if (!children) return null;
  return (
    <div style={{ width: 320, background: C.bg2, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 2, fontFamily: "'Courier New', monospace", textTransform: 'uppercase' }}>{title}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value, accent }) {
  return (
    <div style={{ padding: '9px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14, color: '#ffffff', fontWeight: 700, letterSpacing: 1, fontFamily: "'Courier New', monospace", textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 15, color: accent ? C.accent : '#ffffff', fontFamily: "'Courier New', monospace", fontWeight: 700 }}>{value || '—'}</span>
    </div>
  );
}

// ─── 1. Active FLTs ───────────────────────────────────────────────────────────
function ActiveFlts({ toast }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase.from('plans').select('*').eq('status', 'active').order('created_at', { ascending: false });
      setPlans(data || []);
      setLoading(false);
    };
    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, []);

  const sel = plans.find(p => p.id === selected);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: '#40d080', boxShadow: '0 0 8px rgba(64,208,128,0.6)' }} />
          <span style={S.label}>Live — refreshes every 30s</span>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 11, letterSpacing: 2 }}>LOADING...</div>}
        {!loading && plans.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center', color: C.t3, fontSize: 11, letterSpacing: 2 }}>NO ACTIVE FLIGHTS</div>
        )}

        {plans.map(p => (
          <div key={p.id} onClick={() => setSelected(p.id === selected ? null : p.id)}
            style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: selected === p.id ? `${C.accent}08` : 'transparent', borderLeft: selected === p.id ? `3px solid ${C.accent}` : '3px solid transparent' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.accent, fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>
                {p.dep} → {p.dest}
              </span>
              <span style={S.badge('green')}>ACTIVE</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                ['REG', p.reg],
                ['TYPE', p.ac_type],
                ['STD', p.std],
                ['ETA', p.eta],
                ['DISP', p.dispatch_no],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={S.label}>{l}</div>
                  <div style={{ fontSize: 11, color: C.t2, fontFamily: "'Courier New', monospace" }}>{v || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {sel && (
        <DetailPanel title="FLT Logs & Times" onClose={() => setSelected(null)}>
          <DetailRow label="Flight" value={`${sel.dep} → ${sel.dest}`} accent />
          <DetailRow label="Registration" value={sel.reg} />
          <DetailRow label="Type" value={sel.ac_type} />
          <DetailRow label="Dispatch No" value={sel.dispatch_no} />
          <DetailRow label="STD" value={sel.std} />
          <DetailRow label="ETA" value={sel.eta} />
          <DetailRow label="Alternate" value={sel.alternate} />
          <DetailRow label="FOB" value={sel.fob} />
          <DetailRow label="Trip Fuel" value={sel.trip_fuel} />
          <DetailRow label="Reserve" value={sel.reserve_fuel} />
          <DetailRow label="PF Pilot" value={sel.pf_pilot} />
          <DetailRow label="PM Pilot" value={sel.pm_pilot} />
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ ...S.label, marginBottom: 8 }}>Active FLT Log Timestamps</div>
            <div style={{ fontSize: 10, color: C.t3, lineHeight: 2, fontFamily: "'Courier New', monospace" }}>
              Plan Released: —<br />
              Plan Downloaded: —<br />
              Plan Accepted: —<br />
              Alt. Check Ground: —<br />
              Fuel on Board: —<br />
              OFP Entries: —
            </div>
          </div>
        </DetailPanel>
      )}
    </div>
  );
}

// ─── 2. Archived FLTs ─────────────────────────────────────────────────────────
function ArchivedFlts({ toast }) {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState({ pilot: '', route: '', dateFrom: '', dateTo: '' });
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({ field: '', old: '', new: '', reason: '' });

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('archived_flights')
      .select('*, plans(dep, dest, date, reg, ac_type, dispatch_no, pf_pilot, pm_pilot)')
      .order('archived_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) console.error('ArchivedFlts fetch error:', error);
    setFlights(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = flights.filter(f => {
    const plan = f.plans || {};
    const pilotMatch = !filter.pilot || (plan.pf_pilot || '').includes(filter.pilot) || (plan.pm_pilot || '').includes(filter.pilot);
    const routeMatch = !filter.route || `${plan.dep}${plan.dest}`.toLowerCase().includes(filter.route.toLowerCase());
    return pilotMatch && routeMatch;
  });

  const sel = flights.find(f => f.id === selected);

  const handleEdit = async () => {
    if (!editForm.reason || !editForm.new) { toast('Reason and new value required.', 'error'); return; }
    const { error } = await supabase.from('admin_edits').insert({
      archived_flight_id: editModal.id,
      plan_id: editModal.plan_id,
      field_name: editForm.field,
      old_value: String(editForm.old),
      new_value: editForm.new,
      reason: editForm.reason,
    });
    if (error) { toast(error.message, 'error'); return; }
    toast('Edit saved and logged.', 'success');
    setEditModal(null);
    setEditForm({ field: '', old: '', new: '', reason: '' });
    fetch();
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Filters */}
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { ph: 'Pilot...', key: 'pilot' },
            { ph: 'Route / ICAO...', key: 'route' },
          ].map(({ ph, key }) => (
            <input key={key} placeholder={ph} value={filter[key]}
              onChange={e => setFilter(prev => ({ ...prev, [key]: e.target.value }))}
              style={{ ...S.input, width: 160 }} />
          ))}
          <span style={{ ...S.label, alignSelf: 'center', marginLeft: 'auto' }}>{filtered.length} RECORDS · LAST 5 YEARS</span>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 11, letterSpacing: 2 }}>LOADING...</div>}

        <table style={S.table}>
          <thead>
            <tr>
              {['ARCHIVED','ROUTE','REG','BLOCK','FLIGHT','LANDINGS','PF'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => {
              const plan = f.plans || {};
              return (
                <tr key={f.id} onClick={() => setSelected(f.id === selected ? null : f.id)}
                  style={{ cursor: 'pointer', background: selected === f.id ? `${C.accent}08` : 'transparent' }}>
                  <td style={S.td}>{f.archived_at ? new Date(f.archived_at).toLocaleString('en-GB') : '—'}</td>
                  <td style={{ ...S.td, color: C.accent, fontWeight: 700 }}>{plan.dep || '—'} → {plan.dest || '—'}</td>
                  <td style={S.td}>{plan.reg || '—'}</td>
                  <td style={S.td}>{f.block_minutes ? `${Math.floor(f.block_minutes/60)}:${String(f.block_minutes%60).padStart(2,'0')}` : '—'}</td>
                  <td style={S.td}>{f.airborne_minutes ? `${Math.floor(f.airborne_minutes/60)}:${String(f.airborne_minutes%60).padStart(2,'0')}` : '—'}</td>
                  <td style={S.td}>{f.landing_count || '—'}</td>
                  <td style={S.td}>{f.pf_id ? f.pf_id.slice(0,8) + '...' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel && (
        <DetailPanel title="Archive Detail" onClose={() => setSelected(null)}>
          <DetailRow label="Route" value={`${sel.plans?.dep} → ${sel.plans?.dest}`} accent />
          <DetailRow label="Registration" value={sel.plans?.reg} />
          <DetailRow label="Archived" value={sel.archived_at ? new Date(sel.archived_at).toLocaleString('en-GB') : '—'} />
          <DetailRow label="Block Time" value={sel.block_minutes ? `${Math.floor(sel.block_minutes/60)}:${String(sel.block_minutes%60).padStart(2,'0')}` : '—'} />
          <DetailRow label="Flight Time" value={sel.airborne_minutes ? `${Math.floor(sel.airborne_minutes/60)}:${String(sel.airborne_minutes%60).padStart(2,'0')}` : '—'} />
          <DetailRow label="Landings" value={sel.landing_count} />
          <DetailRow label="Night Landing" value={sel.is_night_landing ? 'YES' : 'NO'} />
          <DetailRow label="Dest Lat" value={sel.dest_lat} />
          <DetailRow label="Dest Lon" value={sel.dest_lon} />
          <div style={{ padding: '12px 16px' }}>
            <button style={S.btnPrimary} onClick={() => {
              setEditModal(sel);
              setEditForm({ field: 'block_minutes', old: sel.block_minutes, new: '', reason: '' });
            }}>
              ✎ EDIT WITH REPORT
            </button>
          </div>
        </DetailPanel>
      )}

      {editModal && (
        <Modal title="EDIT ARCHIVED FLIGHT — REPORT REQUIRED" onClose={() => setEditModal(null)}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 16, lineHeight: 1.8, fontFamily: "'Courier New', monospace" }}>
            ⚠ All edits are logged and notification will be sent to designated personnel.
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>Field to Edit</label>
            <select style={S.select} value={editForm.field} onChange={e => setEditForm(p => ({ ...p, field: e.target.value }))}>
              <option value="block_minutes">Block Minutes</option>
              <option value="airborne_minutes">Airborne Minutes</option>
              <option value="landing_count">Landing Count</option>
              <option value="is_night_landing">Night Landing</option>
              <option value="pf_id">PF Pilot</option>
            </select>
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>Current Value</label>
            <input style={S.input} value={editForm.old} readOnly />
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>New Value *</label>
            <input style={S.input} value={editForm.new} onChange={e => setEditForm(p => ({ ...p, new: e.target.value }))} placeholder="Enter corrected value" />
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>Reason / Report *</label>
            <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={editForm.reason}
              onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
              placeholder="Mandatory: explain why this edit is required..." />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={S.btnSecondary} onClick={() => setEditModal(null)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleEdit}>SAVE & LOG EDIT</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 3. Aircrafts ─────────────────────────────────────────────────────────────
function Aircrafts({ toast }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ registration: '', manufacturer: '', model: '', ac_type: '', landing_cat: 'CAT1' });

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('aircraft').select('*').order('registration');
    setList(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleAdd = async () => {
    if (!form.registration || !form.ac_type) { toast('Registration and type required.', 'error'); return; }
    const { error } = await supabase.from('aircraft').insert(form);
    if (error) { toast(error.message, 'error'); return; }
    toast('Aircraft added.', 'success');
    setShowAdd(false);
    setForm({ registration: '', manufacturer: '', model: '', ac_type: '', landing_cat: 'CAT1' });
    fetch();
  };

  const sel = list.find(a => a.id === selected);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={S.label}>{list.length} AIRCRAFT REGISTERED</span>
          <button style={S.btnPrimary} onClick={() => setShowAdd(true)}>+ ADD AIRCRAFT</button>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 11 }}>LOADING...</div>}

        <table style={S.table}>
          <thead>
            <tr>
              {['REGISTRATION','MANUFACTURER','MODEL','TYPE','CAT','HOURS','CYCLES','STATUS'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(a => (
              <tr key={a.id} onClick={() => setSelected(a.id === selected ? null : a.id)}
                style={{ cursor: 'pointer', background: selected === a.id ? `${C.accent}08` : 'transparent' }}>
                <td style={{ ...S.td, color: C.accent, fontWeight: 700 }}>{a.registration}</td>
                <td style={S.td}>{a.manufacturer || '—'}</td>
                <td style={S.td}>{a.model || '—'}</td>
                <td style={S.td}>{a.ac_type || '—'}</td>
                <td style={S.td}><span style={S.badge('blue')}>{a.landing_cat}</span></td>
                <td style={S.td}>{a.total_hours || 0}</td>
                <td style={S.td}>{a.total_cycles || 0}</td>
                <td style={S.td}><span style={S.badge(a.active ? 'green' : 'red')}>{a.active ? 'ACTIVE' : 'INACTIVE'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <DetailPanel title="Aircraft Detail" onClose={() => setSelected(null)}>
          <DetailRow label="Registration" value={sel.registration} accent />
          <DetailRow label="Manufacturer" value={sel.manufacturer} />
          <DetailRow label="Model" value={sel.model} />
          <DetailRow label="Type" value={sel.ac_type} />
          <DetailRow label="Landing Cat" value={sel.landing_cat} />
          <DetailRow label="Total Hours" value={sel.total_hours} />
          <DetailRow label="Total Cycles" value={sel.total_cycles} />
          <DetailRow label="Status" value={sel.active ? 'Active' : 'Inactive'} />
        </DetailPanel>
      )}

      {showAdd && (
        <Modal title="ADD AIRCRAFT" onClose={() => setShowAdd(false)}>
          {[
            { key: 'registration', label: 'REGISTRATION *', ph: 'TC-REC' },
            { key: 'manufacturer',  label: 'MANUFACTURER',   ph: 'Gulfstream' },
            { key: 'model',         label: 'MODEL',          ph: 'G450' },
            { key: 'ac_type',       label: 'ICAO TYPE *',    ph: 'GLF4' },
          ].map(({ key, label, ph }) => (
            <div key={key} style={S.formGroup}>
              <label style={S.formLabel}>{label}</label>
              <input style={S.input} placeholder={ph} value={form[key]}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div style={S.formGroup}>
            <label style={S.formLabel}>LANDING CATEGORY</label>
            <select style={S.select} value={form.landing_cat} onChange={e => setForm(p => ({ ...p, landing_cat: e.target.value }))}>
              <option value="CAT1">CAT I</option>
              <option value="CAT2">CAT II</option>
              <option value="CAT3">CAT III</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={S.btnSecondary} onClick={() => setShowAdd(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAdd}>SAVE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 4. Crews ─────────────────────────────────────────────────────────────────
function Crews({ toast }) {
  const [pilots,   setPilots]   = useState([]);
  const [quals,    setQuals]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState(null);
  const [showQual, setShowQual] = useState(false);
  const [showEfb,  setShowEfb]  = useState(false);
  const [qualForm, setQualForm] = useState({ ac_type: '', seat: 'CPT', hand: 'BOTH', landing_cat: 'CAT1', valid_from: '', valid_until: '' });
  const [efbForm,  setEfbForm]  = useState({ efb_training_date: '', efb_training_valid_until: '', efb_training_type: 'Initial', efb_trained_by: '' });

  const fetch = useCallback(async () => {
    setLoading(true);
    const [{ data: p }, { data: q }] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('crew_qualifications').select('*'),
    ]);
    setPilots(p || []);
    setQuals(q || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const sel      = pilots.find(p => p.id === selected);
  const selQuals = quals.filter(q => q.pilot_id === selected);
  // EFB training kaydı — pilot_id'ye göre herhangi bir qual kaydında varsa göster
  const efbRecord = selQuals.find(q => q.efb_training_date);

  const handleAddQual = async () => {
    if (!qualForm.ac_type) { toast('Aircraft type required.', 'error'); return; }
    const { error } = await supabase.from('crew_qualifications').upsert({ pilot_id: selected, ...qualForm });
    if (error) { toast(error.message, 'error'); return; }
    toast('Qualification saved.', 'success');
    setShowQual(false);
    fetch();
  };

  const handleSaveEfb = async () => {
    if (!efbForm.efb_training_date) { toast('Training date required.', 'error'); return; }
    // Mevcut bir qual kaydına ekle, yoksa yeni kayıt oluştur
    const existing = selQuals[0];
    if (existing) {
      const { error } = await supabase.from('crew_qualifications').update(efbForm).eq('id', existing.id);
      if (error) { toast(error.message, 'error'); return; }
    } else {
      const { error } = await supabase.from('crew_qualifications').insert({ pilot_id: selected, ac_type: 'EFB', seat: 'BOTH', hand: 'BOTH', landing_cat: 'CAT1', ...efbForm });
      if (error) { toast(error.message, 'error'); return; }
    }
    toast('EFB training record saved.', 'success');
    setShowEfb(false);
    fetch();
  };

  // EFB training durumu rengi
  const efbStatus = (rec) => {
    if (!rec?.efb_training_date) return { color: '#e02020', label: 'NO RECORD' };
    if (!rec.efb_training_valid_until) return { color: '#2d9e5f', label: 'CURRENT' };
    const daysLeft = Math.floor((new Date(rec.efb_training_valid_until) - new Date()) / 86400000);
    if (daysLeft < 0)   return { color: '#e02020',  label: 'EXPIRED'  };
    if (daysLeft < 30)  return { color: '#e8731a',  label: `${daysLeft}d LEFT` };
    return { color: '#2d9e5f', label: 'CURRENT' };
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
          <span style={S.label}>{pilots.length} CREW MEMBERS</span>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 11 }}>LOADING...</div>}

        <table style={S.table}>
          <thead>
            <tr>
              {['CODE','FULL NAME','ROLE','EMAIL','QUALIFICATIONS','EFB TRAINING','PWD'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pilots.map(p => {
              const pQuals   = quals.filter(q => q.pilot_id === p.id);
              const pEfbRec  = pQuals.find(q => q.efb_training_date);
              const pEfbStat = efbStatus(pEfbRec);
              return (
                <tr key={p.id} onClick={() => setSelected(p.id === selected ? null : p.id)}
                  style={{ cursor: 'pointer', background: selected === p.id ? `${C.accent}08` : 'transparent' }}>
                  <td style={{ ...S.td, color: C.accent, fontWeight: 700, fontSize: 13 }}>{p.code || '—'}</td>
                  <td style={{ ...S.td, color: C.t1 }}>{p.full_name || '—'}</td>
                  <td style={S.td}><span style={S.badge(p.role === 'admin' ? '' : 'blue')}>{(p.role || '—').toUpperCase()}</span></td>
                  <td style={S.td}>{p.email || '—'}</td>
                  <td style={S.td}>
                    {pQuals.filter(q => q.ac_type !== 'EFB').length === 0
                      ? <span style={{ color: C.t3 }}>—</span>
                      : pQuals.filter(q => q.ac_type !== 'EFB').map(q => (
                        <span key={q.id} style={{ ...S.badge('blue'), marginRight: 4 }}>{q.ac_type} {q.seat} {q.landing_cat}</span>
                      ))}
                  </td>
                  <td style={S.td}>
                    <span style={{ ...S.badge(''), color: pEfbStat.color, background: `${pEfbStat.color}15`, border: `1px solid ${pEfbStat.color}40` }}>
                      {pEfbStat.label}
                    </span>
                    {pEfbRec?.efb_training_date && (
                      <div style={{ fontSize: 10, color: C.t3, marginTop: 3 }}>{pEfbRec.efb_training_date}</div>
                    )}
                  </td>
                  <td style={S.td}>
                    <button style={S.btnSecondary} onClick={async (e) => {
                      e.stopPropagation();
                      if (!p.email) return;
                      const { error } = await supabase.auth.resetPasswordForEmail(p.email);
                      if (error) toast(error.message, 'error');
                      else toast(`Reset email sent to ${p.email}`, 'success');
                    }}>
                      RESET PWD
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel && (
        <DetailPanel title={`${sel.code} — ${sel.full_name}`} onClose={() => setSelected(null)}>
          <DetailRow label="Code"      value={sel.code}      accent />
          <DetailRow label="Full Name" value={sel.full_name} />
          <DetailRow label="Email"     value={sel.email}     />
          <DetailRow label="Role"      value={sel.role}      />

          {/* EFB Training — AMC 20-25 */}
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ ...S.label, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>EFB Training — AMC 20-25</span>
              {(() => { const st = efbStatus(efbRecord); return <span style={{ ...S.badge(''), color: st.color, background: `${st.color}15`, border: `1px solid ${st.color}40` }}>{st.label}</span>; })()}
            </div>
            {efbRecord ? (
              <div style={{ fontSize: 12, color: C.t1, fontFamily: "'Courier New', monospace", lineHeight: 2 }}>
                <div>Type: <span style={{ color: C.accent }}>{efbRecord.efb_training_type || '—'}</span></div>
                <div>Date: {efbRecord.efb_training_date}</div>
                <div>Valid Until: {efbRecord.efb_training_valid_until || '—'}</div>
                <div>Trained By: {efbRecord.efb_trained_by || '—'}</div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#e02020', marginBottom: 8 }}>⚠ No EFB training record on file</div>
            )}
            <button style={{ ...S.btnPrimary, marginTop: 10, width: '100%' }}
              onClick={() => {
                setEfbForm({
                  efb_training_date:        efbRecord?.efb_training_date        || '',
                  efb_training_valid_until: efbRecord?.efb_training_valid_until || '',
                  efb_training_type:        efbRecord?.efb_training_type        || 'Initial',
                  efb_trained_by:           efbRecord?.efb_trained_by           || '',
                });
                setShowEfb(true);
              }}>
              {efbRecord ? '✎ UPDATE EFB TRAINING' : '+ ADD EFB TRAINING'}
            </button>
          </div>

          {/* Type Qualifications */}
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ ...S.label, marginBottom: 8 }}>Type Qualifications</div>
            {selQuals.filter(q => q.ac_type !== 'EFB').length === 0 && (
              <div style={{ fontSize: 12, color: C.t3 }}>No qualifications</div>
            )}
            {selQuals.filter(q => q.ac_type !== 'EFB').map(q => (
              <div key={q.id} style={{ marginBottom: 8, padding: '8px 10px', background: C.bg3, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, color: C.accent, fontWeight: 700, fontFamily: "'Courier New', monospace" }}>{q.ac_type}</div>
                <div style={{ fontSize: 11, color: C.t2, marginTop: 3, fontFamily: "'Courier New', monospace" }}>
                  {q.seat} · {q.hand} · {q.landing_cat}<br />
                  {q.valid_from && `Valid: ${q.valid_from} → ${q.valid_until || '∞'}`}
                </div>
              </div>
            ))}
            <button style={{ ...S.btnPrimary, marginTop: 8, width: '100%' }} onClick={() => setShowQual(true)}>
              + ADD QUALIFICATION
            </button>
          </div>
        </DetailPanel>
      )}

      {/* EFB Training Modal */}
      {showEfb && selected && (
        <Modal title="EFB TRAINING RECORD — AMC 20-25" onClose={() => setShowEfb(false)}>
          <div style={{ fontSize: 11, color: C.t3, marginBottom: 16, lineHeight: 1.7, fontFamily: "'Courier New', monospace" }}>
            Per EASA AMC 20-25, all EFB users must complete initial and recurrent training. This record is retained for audit purposes.
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>TRAINING TYPE</label>
            <select style={S.select} value={efbForm.efb_training_type} onChange={e => setEfbForm(p => ({ ...p, efb_training_type: e.target.value }))}>
              <option value="Initial">Initial</option>
              <option value="Recurrent">Recurrent</option>
              <option value="Differences">Differences</option>
              <option value="OJT">OJT (On-the-Job)</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={S.formGroup}>
              <label style={S.formLabel}>TRAINING DATE *</label>
              <input type="date" style={S.input} value={efbForm.efb_training_date}
                onChange={e => setEfbForm(p => ({ ...p, efb_training_date: e.target.value }))} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>VALID UNTIL</label>
              <input type="date" style={S.input} value={efbForm.efb_training_valid_until}
                onChange={e => setEfbForm(p => ({ ...p, efb_training_valid_until: e.target.value }))} />
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>TRAINED BY / INSTRUCTOR</label>
            <input style={S.input} placeholder="Name or organization" value={efbForm.efb_trained_by}
              onChange={e => setEfbForm(p => ({ ...p, efb_trained_by: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={S.btnSecondary} onClick={() => setShowEfb(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleSaveEfb}>SAVE RECORD</button>
          </div>
        </Modal>
      )}

      {/* Type Qualification Modal */}
      {showQual && selected && (
        <Modal title="ADD QUALIFICATION" onClose={() => setShowQual(false)}>
          <div style={S.formGroup}>
            <label style={S.formLabel}>AIRCRAFT TYPE *</label>
            <input style={S.input} placeholder="GLF4" value={qualForm.ac_type}
              onChange={e => setQualForm(p => ({ ...p, ac_type: e.target.value.toUpperCase() }))} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={S.formGroup}>
              <label style={S.formLabel}>SEAT</label>
              <select style={S.select} value={qualForm.seat} onChange={e => setQualForm(p => ({ ...p, seat: e.target.value }))}>
                <option value="CPT">CPT</option>
                <option value="FO">FO</option>
                <option value="BOTH">BOTH</option>
              </select>
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>HAND</label>
              <select style={S.select} value={qualForm.hand} onChange={e => setQualForm(p => ({ ...p, hand: e.target.value }))}>
                <option value="LH">LH</option>
                <option value="RH">RH</option>
                <option value="BOTH">BOTH</option>
              </select>
            </div>
          </div>
          <div style={S.formGroup}>
            <label style={S.formLabel}>LANDING CATEGORY</label>
            <select style={S.select} value={qualForm.landing_cat} onChange={e => setQualForm(p => ({ ...p, landing_cat: e.target.value }))}>
              <option value="CAT1">CAT I</option>
              <option value="CAT2">CAT II</option>
              <option value="CAT3">CAT III</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={S.formGroup}>
              <label style={S.formLabel}>VALID FROM</label>
              <input type="date" style={S.input} value={qualForm.valid_from} onChange={e => setQualForm(p => ({ ...p, valid_from: e.target.value }))} />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>VALID UNTIL</label>
              <input type="date" style={S.input} value={qualForm.valid_until} onChange={e => setQualForm(p => ({ ...p, valid_until: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={S.btnSecondary} onClick={() => setShowQual(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleAddQual}>SAVE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 5. Statistics ────────────────────────────────────────────────────────────
function Statistics({ toast }) {
  const [stats, setStats] = useState(null);
  const [flights, setFlights] = useState([]);
  const [filter, setFilter] = useState({ dep: '', dest: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase.from('archived_flights')
        .select('*, plans(dep, dest, reg, ac_type)')
        .order('archived_at', { ascending: false });
      const arr = data || [];
      setFlights(arr);

      const totalFlightMins  = arr.reduce((s, f) => s + (f.airborne_minutes || 0), 0);
      const totalBlockMins   = arr.reduce((s, f) => s + (f.block_minutes || 0), 0);
      const totalLandings    = arr.reduce((s, f) => s + (f.landing_count || 0), 0);
      const nightLandings    = arr.filter(f => f.is_night_landing).length;
      setStats({ totalFlightMins, totalBlockMins, totalLandings, nightLandings, total: arr.length });
      setLoading(false);
    };
    fetch();
  }, []);

  const fmt = (mins) => {
    if (!mins) return '0:00';
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  };

  const filtered = flights.filter(f => {
    const dep = (f.departure_icao || '').toLowerCase();
    const dest = (f.destination_icao || '').toLowerCase();
    return (!filter.dep || dep.includes(filter.dep.toLowerCase())) &&
           (!filter.dest || dest.includes(filter.dest.toLowerCase()));
  });

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: C.border, borderBottom: `1px solid ${C.border}` }}>
        {loading ? <div style={{ padding: 24, color: C.t3, fontSize: 11, gridColumn: '1/-1', textAlign: 'center' }}>LOADING...</div> : stats && [
          { label: 'Total Flights', value: stats.total },
          { label: 'Flight Hours', value: fmt(stats.totalFlightMins) },
          { label: 'Block Hours', value: fmt(stats.totalBlockMins) },
          { label: 'Total Landings', value: stats.totalLandings },
          { label: 'Night Landings', value: stats.nightLandings },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: C.bg2, padding: '16px 20px' }}>
            <div style={S.label}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, fontFamily: "'Courier New', monospace", marginTop: 6 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Route filter */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={S.label}>FILTER BY ROUTE:</span>
        <input placeholder="DEP ICAO" value={filter.dep} onChange={e => setFilter(p => ({ ...p, dep: e.target.value }))}
          style={{ ...S.input, width: 100 }} />
        <span style={{ color: C.t3 }}>→</span>
        <input placeholder="DEST ICAO" value={filter.dest} onChange={e => setFilter(p => ({ ...p, dest: e.target.value }))}
          style={{ ...S.input, width: 100 }} />
        <span style={{ ...S.label, marginLeft: 'auto' }}>{filtered.length} FLIGHTS</span>
      </div>

      {/* Table */}
      <table style={S.table}>
        <thead>
          <tr>
            {['DATE','DEP','DEST','REG','BLOCK','FLIGHT','LANDINGS','NIGHT'].map(h => (
              <th key={h} style={S.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(f => (
            <tr key={f.id}>
              <td style={S.td}>{f.archived_at ? new Date(f.archived_at).toLocaleDateString('en-GB') : '—'}</td>
              <td style={{ ...S.td, color: C.accent }}>{f.departure_icao || '—'}</td>
              <td style={{ ...S.td, color: C.accent }}>{f.destination_icao || '—'}</td>
              <td style={S.td}>{f.plans?.reg || '—'}</td>
              <td style={S.td}>{fmt(f.block_minutes)}</td>
              <td style={S.td}>{fmt(f.airborne_minutes)}</td>
              <td style={S.td}>{f.landing_count || '—'}</td>
              <td style={S.td}>{f.is_night_landing ? <span style={S.badge('blue')}>NIGHT</span> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 6. Station INFO ──────────────────────────────────────────────────────────
function StationInfo({ toast }) {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ icao: '', name: '', country: '', handling_company: '', handling_contact: '', handling_vhf: '', catering_company: '', catering_contact: '', permit_required: false, permit_details: '', entry_requirements: '', risk_assessment: '' });

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('stations').select('*').order('icao');
    setStations(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async () => {
    if (!form.icao) { toast('ICAO required.', 'error'); return; }
    const { error } = await supabase.from('stations').upsert({ ...form, updated_at: new Date().toISOString() });
    if (error) { toast(error.message, 'error'); return; }
    toast('Station saved.', 'success');
    setShowAdd(false);
    setForm({ icao: '', name: '', country: '', handling_company: '', handling_contact: '', handling_vhf: '', catering_company: '', catering_contact: '', permit_required: false, permit_details: '', entry_requirements: '', risk_assessment: '' });
    fetch();
  };

  const sel = stations.find(s => s.id === selected);

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between' }}>
          <span style={S.label}>{stations.length} STATIONS</span>
          <button style={S.btnPrimary} onClick={() => setShowAdd(true)}>+ ADD STATION</button>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.t3, fontSize: 11 }}>LOADING...</div>}

        <table style={S.table}>
          <thead>
            <tr>
              {['ICAO','NAME','COUNTRY','HANDLING','CATERING','PERMIT','RISK'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {stations.map(s => (
              <tr key={s.id} onClick={() => setSelected(s.id === selected ? null : s.id)}
                style={{ cursor: 'pointer', background: selected === s.id ? `${C.accent}08` : 'transparent' }}>
                <td style={{ ...S.td, color: C.accent, fontWeight: 700 }}>{s.icao}</td>
                <td style={S.td}>{s.name || '—'}</td>
                <td style={S.td}>{s.country || '—'}</td>
                <td style={S.td}>{s.handling_company || '—'}</td>
                <td style={S.td}>{s.catering_company || '—'}</td>
                <td style={S.td}>{s.permit_required ? <span style={S.badge('')}>REQ</span> : '—'}</td>
                <td style={S.td}>{s.risk_assessment ? <span style={S.badge('blue')}>ON FILE</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && (
        <DetailPanel title={`${sel.icao} — ${sel.name || ''}`} onClose={() => setSelected(null)}>
          <DetailRow label="ICAO" value={sel.icao} accent />
          <DetailRow label="Country" value={sel.country} />
          <DetailRow label="Handling" value={sel.handling_company} />
          <DetailRow label="Handling Tel" value={sel.handling_contact} />
          <DetailRow label="Handling VHF" value={sel.handling_vhf} />
          <DetailRow label="Catering" value={sel.catering_company} />
          <DetailRow label="Catering Tel" value={sel.catering_contact} />
          <DetailRow label="Permit Req" value={sel.permit_required ? 'YES' : 'NO'} />
          {sel.permit_details && <DetailRow label="Permit Details" value={sel.permit_details} />}
          {sel.entry_requirements && (
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Entry Requirements</div>
              <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.7, fontFamily: "'Courier New', monospace" }}>{sel.entry_requirements}</div>
            </div>
          )}
          {sel.risk_assessment && (
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Risk Assessment</div>
              <div style={{ fontSize: 10, color: C.t2, lineHeight: 1.7, fontFamily: "'Courier New', monospace" }}>{sel.risk_assessment}</div>
            </div>
          )}
        </DetailPanel>
      )}

      {showAdd && (
        <Modal title="ADD / EDIT STATION" onClose={() => setShowAdd(false)} width={500}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { key: 'icao', label: 'ICAO *', ph: 'LTFM' },
              { key: 'name', label: 'AIRPORT NAME', ph: 'Istanbul' },
              { key: 'country', label: 'COUNTRY', ph: 'Turkey' },
              { key: 'handling_company', label: 'HANDLING CO.', ph: 'Celebi' },
              { key: 'handling_contact', label: 'HANDLING TEL', ph: '+90...' },
              { key: 'handling_vhf', label: 'HANDLING VHF', ph: '130.675' },
              { key: 'catering_company', label: 'CATERING CO.', ph: 'Do & Co' },
              { key: 'catering_contact', label: 'CATERING TEL', ph: '+90...' },
            ].map(({ key, label, ph }) => (
              <div key={key} style={S.formGroup}>
                <label style={S.formLabel}>{label}</label>
                <input style={S.input} placeholder={ph} value={form[key] || ''}
                  onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          {[
            { key: 'entry_requirements', label: 'ENTRY / SLOT REQUIREMENTS' },
            { key: 'permit_details', label: 'PERMIT DETAILS' },
            { key: 'risk_assessment', label: 'RISK ASSESSMENT' },
          ].map(({ key, label }) => (
            <div key={key} style={S.formGroup}>
              <label style={S.formLabel}>{label}</label>
              <textarea style={{ ...S.input, minHeight: 60, resize: 'vertical' }} value={form[key] || ''}
                onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={S.btnSecondary} onClick={() => setShowAdd(false)}>CANCEL</button>
            <button style={S.btnPrimary} onClick={handleSave}>SAVE</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── 7. FLT Logs & Times ─────────────────────────────────────────────────────
const ACTION_META = {
  PLAN_RELEASED:              { icon: '📤', label: 'Plan Released',           color: '#e8a020' },
  PLAN_DOWNLOADED:            { icon: '📥', label: 'Plan Downloaded',         color: '#1a9bc4' },
  CREW_ASSIGNED:              { icon: '👨‍✈️', label: 'Crew Assigned',          color: '#1a9bc4' },
  PREFLIGHT_MANDATORY_COMPLETE:{ icon: '✅', label: 'Mandatory Complete',      color: '#2d9e5f' },
  MANDATORY_CHECK_DONE:       { icon: '☑',  label: 'Check Done',              color: '#2d9e5f' },
  MANDATORY_CHECK_UNDONE:     { icon: '☐',  label: 'Check Undone',            color: '#e8731a' },
  FUEL_CHECKED:               { icon: '⛽', label: 'Fuel Checked',            color: '#2d9e5f' },
  PLAN_ACCEPTED:              { icon: '✍',  label: 'Plan Accepted & Signed',  color: '#2d9e5f' },
  PLAN_ACCEPTANCE_REVOKED:    { icon: '↺',  label: 'Acceptance Revoked',      color: '#e02020' },
  SYNC_TO_PM:                 { icon: '⇄',  label: 'Synced to PM',            color: '#1a9bc4' },
  OFF_BLOCKS:                 { icon: '🛫', label: 'Off Blocks',              color: '#e8a020' },
  TAKEOFF:                    { icon: '✈',  label: 'Takeoff',                 color: '#e8a020' },
  RVSM_CHECK:                 { icon: '📡', label: 'RVSM Check',              color: '#1a9bc4' },
  LANDING:                    { icon: '🛬', label: 'Landing',                 color: '#e8a020' },
  ON_BLOCKS:                  { icon: '🅿',  label: 'On Blocks',              color: '#e8a020' },
  FUEL_REMAINING:             { icon: '⛽', label: 'Fuel Remaining',          color: '#2d9e5f' },
  FLIGHT_ARCHIVED:            { icon: '📁', label: 'Flight Archived',         color: '#2d9e5f' },
  ADMIN_EDIT:                 { icon: '✎',  label: 'Admin Edit',              color: '#e02020' },
};

function FltLogsAndTimes({ toast }) {
  const [plans,      setPlans]      = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [logs,       setLogs]       = useState([]);
  const [loadingP,   setLoadingP]   = useState(true);
  const [loadingL,   setLoadingL]   = useState(false);
  const [filter,     setFilter]     = useState({ dep: '', dest: '', pilot: '' });

  // Tüm planları çek (active + archived)
  useEffect(() => {
    const fetch = async () => {
      setLoadingP(true);
      const { data } = await supabase.from('plans')
        .select('id, dep, dest, date, dispatch_no, reg, status, archived_at, created_at')
        .in('status', ['active', 'archived'])
        .order('created_at', { ascending: false })
        .limit(200);
      setPlans(data || []);
      setLoadingP(false);
    };
    fetch();
  }, []);

  // Seçilen planın loglarını çek
  useEffect(() => {
    if (!selected) { setLogs([]); return; }
    const fetch = async () => {
      setLoadingL(true);
      const { data } = await supabase.from('flight_logs')
        .select('*, profiles(full_name, code)')
        .eq('plan_id', selected)
        .order('created_at', { ascending: true });
      setLogs(data || []);
      setLoadingL(false);
    };
    fetch();
  }, [selected]);

  const filteredPlans = plans.filter(p => {
    const depMatch  = !filter.dep  || (p.dep  || '').toLowerCase().includes(filter.dep.toLowerCase());
    const destMatch = !filter.dest || (p.dest || '').toLowerCase().includes(filter.dest.toLowerCase());
    return depMatch && destMatch;
  });

  const selectedPlan = plans.find(p => p.id === selected);

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-GB')}  ${d.toTimeString().slice(0, 8)} UTC`;
  };

  const detailStr = (details) => {
    if (!details) return '';
    const skip = ['platform', 'timestamp_utc'];
    return Object.entries(details)
      .filter(([k]) => !skip.includes(k))
      .map(([k, v]) => `${k}: ${v}`)
      .join('  ·  ');
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* Sol: Plan listesi */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="DEP" value={filter.dep}  onChange={e => setFilter(p => ({ ...p, dep:  e.target.value }))} style={{ ...S.input, width: '50%', fontSize: 12 }} />
            <input placeholder="DEST" value={filter.dest} onChange={e => setFilter(p => ({ ...p, dest: e.target.value }))} style={{ ...S.input, width: '50%', fontSize: 12 }} />
          </div>
          <span style={{ ...S.label, fontSize: 10 }}>{filteredPlans.length} FLIGHTS</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingP && <div style={{ padding: 20, textAlign: 'center', color: C.t3, fontSize: 11 }}>LOADING...</div>}
          {filteredPlans.map(p => (
            <div key={p.id} onClick={() => setSelected(p.id === selected ? null : p.id)}
              style={{ padding: '10px 12px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: selected === p.id ? `${C.accent}12` : 'transparent', borderLeft: `3px solid ${selected === p.id ? C.accent : 'transparent'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, fontFamily: "'Courier New', monospace" }}>
                  {p.dep} → {p.dest}
                </span>
                <span style={S.badge(p.status === 'active' ? 'green' : '')}>
                  {p.status === 'active' ? 'ACTIVE' : 'ARCH'}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 3, fontFamily: "'Courier New', monospace" }}>
                {p.date || '—'}  ·  {p.reg || '—'}
              </div>
              <div style={{ fontSize: 10, color: C.t3, marginTop: 2, fontFamily: "'Courier New', monospace" }}>
                {p.dispatch_no || p.id.slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sağ: Timeline */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selected && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.t3, fontSize: 13, letterSpacing: 2 }}>
            ← SELECT A FLIGHT
          </div>
        )}

        {selected && (
          <>
            {/* Header */}
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.accent, fontFamily: "'Courier New', monospace" }}>
                  {selectedPlan?.dep} → {selectedPlan?.dest}
                </span>
                <span style={{ fontSize: 11, color: C.t3, marginLeft: 12, fontFamily: "'Courier New', monospace" }}>
                  {selectedPlan?.date}  ·  {selectedPlan?.reg}  ·  {selectedPlan?.dispatch_no}
                </span>
              </div>
              <span style={{ ...S.label, fontSize: 11 }}>{logs.length} LOG ENTRIES</span>
            </div>

            {/* Timeline */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {loadingL && <div style={{ textAlign: 'center', color: C.t3, fontSize: 11 }}>LOADING...</div>}
              {!loadingL && logs.length === 0 && (
                <div style={{ textAlign: 'center', color: C.t3, fontSize: 11, letterSpacing: 2, padding: 32 }}>NO LOGS FOR THIS FLIGHT</div>
              )}

              {logs.map((l, idx) => {
                const meta = ACTION_META[l.action] || { icon: '·', label: l.action, color: C.t3 };
                const isLast = idx === logs.length - 1;
                return (
                  <div key={l.id} style={{ display: 'flex', gap: 14, marginBottom: isLast ? 0 : 0 }}>
                    {/* Timeline line + dot */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 14, background: `${meta.color}20`, border: `2px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                        {meta.icon}
                      </div>
                      {!isLast && <div style={{ width: 2, flex: 1, background: C.border, minHeight: 16, margin: '2px 0' }} />}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: meta.color, fontFamily: "'Courier New', monospace" }}>
                          {meta.label}
                        </span>
                        <span style={{ fontSize: 11, color: C.t3, fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap', marginLeft: 12 }}>
                          {fmtTime(l.created_at)}
                        </span>
                      </div>

                      {/* Pilot */}
                      {l.profiles && (
                        <div style={{ fontSize: 11, color: C.t1, marginBottom: 3, fontFamily: "'Courier New', monospace" }}>
                          <span style={{ color: C.accent, fontWeight: 700 }}>{l.profiles.code}</span>
                          {' · '}{l.profiles.full_name}
                        </div>
                      )}

                      {/* Details */}
                      {l.details && Object.keys(l.details).filter(k => !['platform','timestamp_utc'].includes(k)).length > 0 && (
                        <div style={{ fontSize: 11, color: C.t3, fontFamily: "'Courier New', monospace", background: C.bg3, padding: '6px 10px', borderLeft: `2px solid ${meta.color}40`, lineHeight: 1.8 }}>
                          {detailStr(l.details)}
                        </div>
                      )}

                      {/* Platform */}
                      {l.details?.platform && (
                        <div style={{ fontSize: 10, color: C.t3, marginTop: 3, fontFamily: "'Courier New', monospace" }}>
                          via {l.details.platform}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Nav Items ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'active',    icon: '●', label: 'Active FLTs'      },
  { id: 'archived',  icon: '◎', label: 'Archived FLTs'    },
  { id: 'aircrafts', icon: '✈', label: 'Aircrafts'        },
  { id: 'crews',     icon: '◈', label: 'Crews'            },
  { id: 'stats',     icon: '▦', label: 'Statistics'       },
  { id: 'stations',  icon: '◉', label: 'Station INFO'     },
  { id: 'logs',      icon: '≡', label: 'FLTs Logs & Times'},
];

// ─── Main AdminPanel ──────────────────────────────────────────────────────────
export default function AdminPanel({ onBack }) {
  const [tab, setTab]   = useState('active');
  const [ready, setReady] = useState(false);
  const [user, setUser]   = useState(null);
  const [toast, setToast] = useState({ msg: '', type: 'success' });

  const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), []);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { onBack(); return; }
      setUser(session.user);
      setReady(true);
    };
    check();
  }, [onBack]);

  if (!ready) return (
    <div style={{ ...S.sidebar, width: '100vw', minHeight: '100vh', background: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: C.accent, letterSpacing: 3, fontSize: 11, fontFamily: "'Courier New', monospace" }}>CHECKING AUTHORIZATION...</div>
    </div>
  );

  const tabTitle = NAV.find(n => n.id === tab)?.label || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: C.bg, fontFamily: "'Courier New', monospace" }}>
      {/* Top Bar */}
      <div style={{ background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: '0 20px', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, color: C.accent, fontWeight: 700, letterSpacing: 3 }}>GO2</span>
          <span style={{ width: 1, height: 18, background: C.border }} />
          <span style={{ fontSize: 10, color: C.t3, letterSpacing: 2 }}>ADMIN PANEL</span>
          <span style={{ ...S.badge(''), fontSize: 9 }}>▲ ADMIN MODE</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 10, color: C.t3 }}>{user?.email}</span>
          <button style={S.btnSecondary} onClick={onBack}>← DASHBOARD</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {NAV.map(n => (
              <div key={n.id} style={S.navItem(tab === n.id)} onClick={() => setTab(n.id)}>
                <span style={{ ...S.navIcon, color: tab === n.id ? C.accent : C.t3 }}>{n.icon}</span>
                <span style={S.navLabel(tab === n.id)}>{n.label}</span>
              </div>
            ))}
          </div>
          {/* User info + logout */}
          <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.t1, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              {user?.email?.split('@')[0]?.toUpperCase()}
            </div>
            <button onClick={async () => { await supabase.auth.signOut(); onBack(); }}
              style={{ ...S.btnDanger, width: '100%', marginTop: 6, textAlign: 'center' }}>
              LOGOUT
            </button>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Content header */}
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg3, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: C.accent, fontWeight: 700, letterSpacing: 3 }}>{tabTitle.toUpperCase()}</span>
          </div>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {tab === 'active'   && <ActiveFlts    toast={showToast} />}
            {tab === 'archived' && <ArchivedFlts  toast={showToast} />}
            {tab === 'aircrafts'&& <Aircrafts     toast={showToast} />}
            {tab === 'crews'    && <Crews         toast={showToast} />}
            {tab === 'stats'    && <Statistics    toast={showToast} />}
            {tab === 'stations' && <StationInfo   toast={showToast} />}
            {tab === 'logs'     && <FltLogsAndTimes toast={showToast} />}
          </div>
        </div>
      </div>

      {toast.msg && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: 'success' })} />}
    </div>
  );
}