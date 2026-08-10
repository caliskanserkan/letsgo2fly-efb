import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import AdminPanel from './AdminPanel';
import { FEATURE_KEYS, isEnabled, catalogTree, affectsOf } from './featureCatalog';

const C = {
  bg:'var(--bg)', bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)', accent:'var(--accent)',
};

const S = {
  label:{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:1,textTransform:'uppercase'},
  btnPrimary:{background:C.accent,border:'none',borderRadius:6,padding:'7px 14px',fontSize:11,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:'inherit'},
  btnSecondary:{background:'transparent',border:`1px solid ${C.border}`,borderRadius:6,padding:'7px 14px',fontSize:11,color:C.t2,cursor:'pointer',fontFamily:'inherit'},
  formGroup:{marginBottom:12},
  formLabel:{display:'block',fontSize:10,color:C.t3,fontWeight:700,letterSpacing:0.8,textTransform:'uppercase',marginBottom:5},
  input:{width:'100%',background:C.bg3,border:`1px solid ${C.border}`,borderRadius:6,padding:'9px 11px',fontSize:13,color:C.t1,fontFamily:'inherit',outline:'none',boxSizing:'border-box'},
  select:{width:'100%',background:C.bg3,border:`1px solid ${C.border}`,borderRadius:6,padding:'9px 11px',fontSize:13,color:C.t1,fontFamily:'inherit',outline:'none',boxSizing:'border-box'},
  table:{width:'100%',borderCollapse:'collapse'},
  th:{textAlign:'left',padding:'8px 12px',fontSize:10,color:C.t3,fontWeight:700,letterSpacing:0.6,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`},
  td:{padding:'9px 12px',fontSize:12,color:C.t2,borderBottom:`1px solid ${C.border}`},
};

// Settings artik ust seviyede DEGIL: sirkete tiklaninca acilan iki basliktan biri
// (SETTINGS | DASHBOARD). Konfigurasyon her zaman bir sirkete aittir.
const NAV = [
  { id:'companies', icon:'⌂', label:'Companies' },
];

function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div style={{ position:'fixed', bottom:20, right:20, background: type==='error' ? 'var(--red)' : 'var(--green)', color:'#fff', padding:'10px 16px', borderRadius:8, fontSize:12, fontWeight:700, zIndex:200 }}>
      {msg}
    </div>
  );
}

function Companies({ toast, myProfile, onOpenDashboard }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [subTab, setSubTab] = useState('settings');
  const [form, setForm] = useState({ company_name:'', icao_code:'', contact_email:'', plan_type:'standard', max_users:10 });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order('company_name');
    setList(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.company_name || !form.icao_code) { toast('Company name and ICAO code required.', 'error'); return; }
    setSaving(true);
    const { error } = await supabase.from('customers').insert({
      company_name: form.company_name,
      icao_code: form.icao_code.toUpperCase(),
      contact_email: form.contact_email || null,
      plan_type: form.plan_type,
      max_users: form.max_users,
      active: true,
    });
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`${form.company_name} added.`, 'success');
    setShowAdd(false);
    setForm({ company_name:'', icao_code:'', contact_email:'', plan_type:'standard', max_users:10 });
    load();
  };

  const toggleActive = async (c, e) => {
    e.stopPropagation();
    const { error } = await supabase.from('customers').update({ active: !c.active }).eq('id', c.id);
    if (error) { toast(error.message, 'error'); return; }
    load();
  };

  if (selected) {
    return (
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`, background:C.bg3, display:'flex', alignItems:'center', gap:12 }}>
          <button style={S.btnSecondary} onClick={() => { setSelected(null); setSubTab('settings'); }}>← ALL COMPANIES</button>
          <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>{selected.company_name}</span>
          <span style={{ fontSize:10, color:C.t3 }}>{selected.icao_code}</span>
          <div style={{ display:'flex', gap:4, marginLeft:12 }}>
            <div onClick={() => setSubTab('settings')} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', color: subTab==='settings' ? C.accent : C.t3, borderBottom: subTab==='settings' ? `2px solid ${C.accent}` : '2px solid transparent' }}>
              ⚙ SETTINGS
            </div>
            {/* DASHBOARD ic ice degil TAM EKRAN acilir — musterinin admini gibi gezilsin. */}
            <div onClick={() => onOpenDashboard(selected)} style={{ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', color:C.t3 }}>
              ▤ DASHBOARD
            </div>
          </div>
        </div>
        <Settings customer={selected} toast={toast} myProfile={myProfile} onSaved={(row) => { setSelected(row); load(); }} />
      </div>
    );
  }

  return (
    <div style={{ flex:1, overflowY:'auto' }}>
      <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={S.label}>{list.length} COMPANIES</span>
        <button style={S.btnPrimary} onClick={() => setShowAdd(true)}>+ ADD COMPANY</button>
      </div>
      {loading && <div style={{ padding:32, textAlign:'center', color:C.t3, fontSize:11 }}>LOADING...</div>}
      <table style={S.table}>
        <thead><tr>{['COMPANY','ICAO','EMAIL','PLAN','MAX USERS','STATUS'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
        <tbody>
          {list.map(c => (
            <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor:'pointer' }}>
              <td style={{ ...S.td, color:C.accent, fontWeight:700 }}>{c.company_name}</td>
              <td style={S.td}>{c.icao_code || '—'}</td>
              <td style={S.td}>{c.contact_email || '—'}</td>
              <td style={S.td}>{c.plan_type || '—'}</td>
              <td style={S.td}>{c.max_users ?? '—'}</td>
              <td style={S.td}>
                <span onClick={(e) => toggleActive(c, e)} style={{ cursor:'pointer', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, background: c.active ? 'rgba(45,158,95,0.15)' : 'rgba(224,32,32,0.15)', color: c.active ? 'var(--green)' : 'var(--red)' }}>
                  {c.active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {showAdd && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:150 }}>
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, width:400, overflow:'hidden' }}>
            <div style={{ background:C.bg3, padding:'10px 16px', borderBottom:`1px solid ${C.border}`, fontSize:12, fontWeight:700, color:C.accent }}>ADD COMPANY</div>
            <div style={{ padding:'16px' }}>
              <div style={S.formGroup}>
                <label style={S.formLabel}>COMPANY NAME *</label>
                <input style={S.input} value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name:e.target.value }))} />
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>ICAO CODE *</label>
                <input style={S.input} maxLength={4} value={form.icao_code} onChange={e => setForm(p => ({ ...p, icao_code:e.target.value.toUpperCase() }))} />
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>CONTACT EMAIL</label>
                <input style={S.input} type="email" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email:e.target.value }))} />
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>PLAN TYPE</label>
                <select style={S.select} value={form.plan_type} onChange={e => setForm(p => ({ ...p, plan_type:e.target.value }))}>
                  <option value="standard">Standard</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div style={S.formGroup}>
                <label style={S.formLabel}>MAX USERS</label>
                <input style={S.input} type="number" value={form.max_users} onChange={e => setForm(p => ({ ...p, max_users:parseInt(e.target.value) || 0 }))} />
              </div>
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
                <button style={S.btnSecondary} onClick={() => setShowAdd(false)}>CANCEL</button>
                <button style={S.btnPrimary} onClick={handleAdd} disabled={saving}>{saving ? 'ADDING...' : 'ADD COMPANY'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sirket bazli modul/hucre yetkilendirmesi.
// Tam tasarim: GO2EFB/CLAUDE.md -> "SUPER ADMIN SETTINGS — onayli tasarim".
// Katalog kodda (featureCatalog.js), DB'de yalnizca SAPMALAR (customers.features).
function Settings({ customer, toast, myProfile, onSaved }) {
  const [saved, setSaved]       = useState(customer.features || {});
  const [draft, setDraft]       = useState(customer.features || {});
  const [maxUsers, setMaxUsers] = useState(String(customer.max_users ?? ''));
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason]     = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    setSaved(customer.features || {});
    setDraft(customer.features || {});
    setMaxUsers(String(customer.max_users ?? ''));
    setConfirming(false); setReason('');
  }, [customer]);

  const changed      = FEATURE_KEYS.filter(k => isEnabled(saved, k) !== isEnabled(draft, k));
  const closingKeys  = changed.filter(k => !isEnabled(draft, k));
  const openingKeys  = changed.filter(k =>  isEnabled(draft, k));
  const limitChanged = Number(maxUsers || 0) !== (customer.max_users ?? 0);
  const dirty        = changed.length > 0 || limitChanged;

  // Varsayilana donen anahtar features'tan SILINIR — kayitta yalnizca sapmalar durur.
  const toggle = (f) => setDraft(d => {
    const next = { ...d };
    const val = !isEnabled(d, f.key);
    if (val === f.defaultOn) delete next[f.key]; else next[f.key] = val;
    return next;
  });

  const doSave = async () => {
    if (!reason.trim()) { toast('Reason is required.', 'error'); return; }
    setSaving(true);

    // IZ ONCE YAZILIR (proje kurali, Ilke 3): degisiklik izsiz kalmasin.
    // Iz yazilip guncelleme patlarsa "denenmis ama uygulanmamis" gorunur;
    // tersi — izsiz uygulanmis degisiklik — kabul edilemez.
    const base = { actor_id: myProfile?.id ?? null, customer_id: customer.id, reason: reason.trim() };
    const rows = changed.map(k => ({
      ...base, type: 'config_change', field: k,
      old_value: isEnabled(saved, k), new_value: isEnabled(draft, k),
    }));
    if (limitChanged) rows.push({
      ...base, type: 'limit_change', field: 'max_users',
      old_value: customer.max_users ?? null, new_value: Number(maxUsers || 0),
    });

    const { error: logErr } = await supabase.from('superadmin_log').insert(rows);
    if (logErr) { setSaving(false); toast(`Audit write failed, nothing applied: ${logErr.message}`, 'error'); return; }

    const patch = { features: draft };
    if (limitChanged) patch.max_users = Number(maxUsers || 0);
    const { data, error } = await supabase.from('customers').update(patch).eq('id', customer.id).select().single();
    setSaving(false);
    if (error) { toast(error.message, 'error'); return; }

    setSaved(data.features || {});
    setConfirming(false); setReason('');
    toast(`${customer.company_name} configuration saved.`, 'success');
    onSaved && onSaved(data);
  };

  const KIND = { module:'MODULE', cell:'CELL', button:'BUTTON' };

  const Section = ({ title, section }) => (
    <div style={{ marginBottom:22 }}>
      <div style={{ ...S.label, marginBottom:8 }}>{title}</div>
      {catalogTree(section).map(group => (
        <div key={group.module} style={{ border:`1px solid ${C.border}`, borderRadius:8, marginBottom:10, overflow:'hidden' }}>
          <div style={{ background:C.bg3, padding:'7px 12px', fontSize:11, fontWeight:700, color:C.t2 }}>{group.module}</div>
          {group.items.map(f => {
            const on = isEnabled(draft, f.key);
            const moved = isEnabled(saved, f.key) !== on;
            return (
              <div key={f.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderTop:`1px solid ${C.border}` }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, color:C.t1 }}>
                    {f.label}
                    {moved && <span style={{ marginLeft:8, fontSize:9, fontWeight:700, color:'var(--amber)' }}>CHANGED</span>}
                  </div>
                  <div style={{ fontSize:10, color:C.t3, marginTop:2 }}>{f.key} · {KIND[f.kind]}</div>
                </div>
                <div onClick={() => toggle(f)} style={{ cursor:'pointer', fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:4, minWidth:44, textAlign:'center', background: on ? 'rgba(45,158,95,0.15)' : 'rgba(224,32,32,0.15)', color: on ? 'var(--green)' : 'var(--red)' }}>
                  {on ? 'ON' : 'OFF'}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'16px 20px' }}>
      <Section title="UI — IPAD" section="ui" />
      <Section title="WEB ADMIN" section="admin" />

      <div style={{ marginBottom:22 }}>
        <div style={{ ...S.label, marginBottom:8 }}>LIMITS</div>
        <div style={{ border:`1px solid ${C.border}`, borderRadius:8, padding:'10px 12px', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:12, color:C.t1, flex:1 }}>MAX USERS</span>
          <input style={{ ...S.input, width:90 }} type="number" value={maxUsers} onChange={e => setMaxUsers(e.target.value)} />
        </div>
      </div>

      {dirty && (
        <div style={{ position:'sticky', bottom:0, background:C.bg2, borderTop:`1px solid ${C.border}`, padding:'12px 0', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, color:C.t2 }}>
            {changed.length} module change{changed.length === 1 ? '' : 's'}{limitChanged ? ' + limit' : ''}
          </span>
          <div style={{ flex:1 }} />
          <button style={S.btnSecondary} onClick={() => { setDraft(saved); setMaxUsers(String(customer.max_users ?? '')); }}>DISCARD</button>
          <button style={S.btnPrimary} onClick={() => setConfirming(true)}>SAVE</button>
        </div>
      )}

      {confirming && (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:150 }}>
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:12, width:560, maxHeight:'82vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            <div style={{ background:C.bg3, padding:'10px 16px', borderBottom:`1px solid ${C.border}`, fontSize:12, fontWeight:700, color:C.accent }}>
              CONFIRM — {customer.company_name}
            </div>
            <div style={{ padding:16, overflowY:'auto' }}>
              {closingKeys.length > 0 && (
                <>
                  <div style={{ ...S.label, marginBottom:6 }}>TURNING OFF — ALSO AFFECTED</div>
                  {affectsOf(closingKeys).map(a => (
                    <div key={a.key} style={{ border:`1px solid ${C.border}`, borderRadius:6, padding:'8px 10px', marginBottom:8 }}>
                      <div style={{ fontSize:12, color:'var(--red)', fontWeight:700 }}>{a.module} · {a.label}</div>
                      <ul style={{ margin:'6px 0 0 16px', padding:0 }}>
                        {a.affects.map((x, i) => <li key={i} style={{ fontSize:11, color:C.t2, marginBottom:2 }}>{x}</li>)}
                      </ul>
                      {a.note && <div style={{ fontSize:10, color:C.t3, marginTop:5 }}>{a.note}</div>}
                    </div>
                  ))}
                </>
              )}
              {openingKeys.length > 0 && (
                <>
                  <div style={{ ...S.label, marginBottom:6 }}>TURNING ON</div>
                  {affectsOf(openingKeys).map(a => (
                    <div key={a.key} style={{ fontSize:12, color:'var(--green)', marginBottom:4 }}>{a.module} · {a.label}</div>
                  ))}
                  <div style={{ fontSize:10, color:C.t3, marginBottom:10 }}>
                    Applies forward only — past flights are not regenerated.
                  </div>
                </>
              )}
              {limitChanged && (
                <div style={{ fontSize:12, color:C.t2, marginBottom:10 }}>
                  MAX USERS: {customer.max_users ?? '—'} → {Number(maxUsers || 0)}
                </div>
              )}
              <div style={S.formGroup}>
                <label style={S.formLabel}>REASON * (goes to the audit trail)</label>
                <textarea style={{ ...S.input, minHeight:64, resize:'vertical' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. OM 8.3.2 — runway condition is recorded in the FMS" />
              </div>
            </div>
            <div style={{ padding:'12px 16px', borderTop:`1px solid ${C.border}`, display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btnSecondary} onClick={() => setConfirming(false)}>CANCEL</button>
              <button style={S.btnPrimary} onClick={doSave} disabled={saving || !reason.trim()}>{saving ? 'SAVING...' : 'APPLY'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuperAdminPanel({ onBack }) {
  const [tab, setTab] = useState('companies');
  const [ready, setReady] = useState(false);
  const [dashCompany, setDashCompany] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  const [toast, setToast] = useState({ msg:'', type:'success' });
  const showToast = useCallback((msg, type='success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:'', type:'success' }), 3000);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { onBack(); return; }
      const { data: prof } = await supabase.from('profiles').select('id,role,customer_id,is_super_admin').eq('id', session.user.id).single();
      if (!prof?.is_super_admin) { onBack(); return; }
      setMyProfile(prof);
      setReady(true);
    })();
  }, [onBack]);

  if (!ready) return (
    <div style={{ display:'flex', width:'100vw', minHeight:'100vh', background:C.bg, alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.accent, letterSpacing:3, fontSize:11, fontFamily:'var(--mono)' }}>CHECKING AUTHORIZATION...</div>
    </div>
  );

  // Musterinin admin paneli: TAM EKRAN, kendi menusuyle — super admin orada
  // sirketin admini gibi gezer. Salt okunurdur (RLS dayatir), ust barda kirmizi
  // "VIEWING <sirket> — READ ONLY" bandi durur.
  if (dashCompany) return (
    <AdminPanel
      onBack={() => setDashCompany(null)}
      customerId={dashCompany.id}
      companyName={dashCompany.company_name}
    />
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:C.bg, fontFamily:'var(--mono)' }}>
      <Toast msg={toast.msg} type={toast.type} />
      <div style={{ background:C.bg2, borderBottom:`1px solid ${C.border}`, padding:'0 16px', height:44, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'var(--amber)', letterSpacing:2 }}>SUPER ADMIN</span>
          <div style={{ display:'flex', gap:4 }}>
            {NAV.map(n => (
              <div key={n.id} onClick={() => setTab(n.id)} style={{ padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', color: tab===n.id ? C.accent : C.t3, borderBottom: tab===n.id ? `2px solid ${C.accent}` : '2px solid transparent' }}>
                {n.icon} {n.label}
              </div>
            ))}
          </div>
        </div>
        <button onClick={onBack} style={S.btnSecondary}>← BACK</button>
      </div>
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {tab === 'companies' && <Companies toast={showToast} myProfile={myProfile} onOpenDashboard={setDashCompany} />}
      </div>
    </div>
  );
}
