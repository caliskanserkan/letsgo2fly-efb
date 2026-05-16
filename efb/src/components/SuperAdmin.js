// SuperAdmin.js — GO2 eFB Super Admin Panel
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const MODULES = [
  { key: 'efp',          label: 'eFP — Flight Plan',   icon: '📋' },
  { key: 'fuel',         label: 'Fuel',                icon: '⛽' },
  { key: 'takeoff',      label: 'Takeoff Data',        icon: '🛫' },
  { key: 'landing',      label: 'Landing Data',        icon: '🛬' },
  { key: 'notam',        label: 'NOTAM',               icon: '⚠️' },
  { key: 'wxr',          label: 'Weather (WXR)',       icon: '🌤' },
  { key: 'documents',    label: 'Documents',           icon: '📁' },
  { key: 'airport_risk', label: 'Airport Risk (RASS)', icon: '🗺' },
];

const ROLES = ['pilot', 'dispatcher', 'company_admin'];

const S = {
  wrap: { display:'flex', flexDirection:'column', minHeight:'100vh', background:'var(--bg)', color:'var(--t1)', fontFamily:'inherit' },
  header: { background:'#111', borderBottom:'1px solid #2a2a2a', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 },
  badge: { background:'rgba(232,115,26,0.15)', border:'1px solid rgba(232,115,26,0.4)', borderRadius:4, padding:'2px 8px', fontSize:9, fontWeight:700, color:'#e8731a', letterSpacing:1, textTransform:'uppercase' },
  tabs: { display:'flex', background:'#1a1a1a', borderBottom:'1px solid #2a2a2a', flexShrink:0 },
  tab: (active) => ({ flex:1, padding:'11px 4px', textAlign:'center', fontSize:12, fontWeight:600, cursor:'pointer', color: active ? '#e8731a' : 'var(--t3)', borderBottom: active ? '2px solid #e8731a' : '2px solid transparent' }),
  body: { flex:1, overflowY:'auto', padding:12 },
  card: { background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden', marginBottom:8 },
  cardHeader: { background:'#1f1f1f', borderBottom:'1px solid var(--border)', padding:'9px 14px', display:'flex', alignItems:'center', gap:10 },
  btn: (v='default') => ({
    border:'none', borderRadius:6, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
    ...(v==='primary' && { background:'#1a9bc4', color:'#fff' }),
    ...(v==='danger'  && { background:'transparent', border:'1px solid #e02020', color:'#e02020' }),
    ...(v==='warning' && { background:'transparent', border:'1px solid #e8731a', color:'#e8731a' }),
    ...(v==='success' && { background:'rgba(45,158,95,0.15)', border:'1px solid #2d9e5f', color:'#2d9e5f' }),
    ...(v==='default' && { background:'#2a2a2a', border:'1px solid #383838', color:'var(--t2)' }),
    ...(v==='ghost'   && { background:'transparent', border:'1px solid #383838', color:'var(--t3)' }),
  }),
  input: { width:'100%', background:'#2a2a2a', border:'1px solid #383838', borderRadius:6, padding:'8px 10px', fontSize:13, color:'var(--t1)', fontFamily:'inherit', outline:'none', boxSizing:'border-box' },
  label: { display:'block', fontSize:10, color:'var(--t3)', fontWeight:700, letterSpacing:0.8, textTransform:'uppercase', marginBottom:4 },
  field: { marginBottom:12 },
  toggle: (on) => ({ width:38, height:20, borderRadius:10, border:'none', cursor:'pointer', background: on ? '#2d9e5f' : '#333', position:'relative', transition:'background 0.2s', flexShrink:0 }),
  toggleKnob: (on) => ({ position:'absolute', top:3, left: on ? 20 : 3, width:14, height:14, borderRadius:7, background:'#fff', transition:'left 0.2s' }),
  divider: { borderTop:'1px solid #2a2a2a', margin:'12px 0' },
  empty: { textAlign:'center', color:'#444', fontSize:12, padding:'24px 0' },
  toast: (type) => ({ position:'fixed', bottom:20, right:16, zIndex:999, padding:'10px 16px', borderRadius:8, fontSize:12, fontWeight:700, background: type==='success' ? 'rgba(45,158,95,0.95)' : 'rgba(224,32,32,0.95)', color:'#fff', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' }),
};

function Toggle({ on, onChange }) {
  return (
    <button style={S.toggle(on)} onClick={() => onChange(!on)}>
      <div style={S.toggleKnob(on)} />
    </button>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  return <div style={S.toast(type)}>{type==='success' ? '✓' : '⚠'} {msg}</div>;
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:16 }}>
      <div style={{ background:'#252525', border:'1px solid #383838', borderRadius:12, width:'100%', maxWidth:380, overflow:'hidden' }}>
        <div style={{ background:'#1f1f1f', padding:'10px 16px', borderBottom:'1px solid #383838', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#e8731a' }}>{title}</span>
          <span onClick={onClose} style={{ color:'#555', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</span>
        </div>
        <div style={{ padding:16 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── Companies Tab ────────────────────────────────────────────────────────────
function CompaniesTab({ showToast }) {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ company_name:'', icao_code:'', contact_email:'', phone:'' });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('customers').select('*').order('created_at', { ascending:false });
    setCompanies(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCompany = async () => {
    if (!form.company_name || !form.icao_code) return;
    setSaving(true);
    try {
      const { data: company, error } = await supabase.from('customers').insert({ ...form, active:true }).select().single();
      if (error) throw error;
      await supabase.from('company_modules').insert(MODULES.map(m => ({ customer_id:company.id, module_key:m.key, is_active:false })));
      showToast('Company added successfully', 'success');
      setShowAdd(false);
      setForm({ company_name:'', icao_code:'', contact_email:'', phone:'' });
      load();
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    setSaving(false);
  };

  const toggleActive = async (company) => {
    await supabase.from('customers').update({ active: !company.active }).eq('id', company.id);
    showToast(`${company.company_name} ${company.active ? 'deactivated' : 'activated'}`, 'success');
    load();
  };

  return (
    <div>
      <button onClick={() => setShowAdd(true)} style={{ ...S.btn('primary'), width:'100%', padding:'10px 14px', fontSize:12, marginBottom:12 }}>
        + Add New Company
      </button>
      {loading && <div style={S.empty}>Loading...</div>}
      {!loading && companies.length === 0 && <div style={S.empty}>No companies yet.</div>}
      {companies.map(c => (
        <div key={c.id} style={{ ...S.card, opacity: c.active === false ? 0.6 : 1 }}>
          <div style={S.cardHeader}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--t1)' }}>{c.company_name}</div>
              <div style={{ fontSize:11, color:'var(--t3)', marginTop:2 }}>{c.icao_code} · {c.contact_email || '—'}</div>
            </div>
            <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, background: c.active !== false ? 'rgba(45,158,95,0.15)' : 'rgba(100,100,100,0.15)', color: c.active !== false ? '#2d9e5f' : '#666' }}>
              {c.active !== false ? 'ACTIVE' : 'INACTIVE'}
            </span>
          </div>
          <div style={{ padding:'8px 14px', display:'flex', gap:8, alignItems:'center' }}>
            <div style={{ fontSize:11, color:'var(--t3)' }}>Max users: <b style={{ color:'var(--t2)' }}>{c.max_users || 10}</b></div>
            <div style={{ fontSize:11, color:'var(--t3)' }}>Plan: <b style={{ color:'var(--t2)' }}>{c.plan_type || 'standard'}</b></div>
            <div style={{ marginLeft:'auto' }}>
              <button onClick={() => toggleActive(c)} style={S.btn(c.active !== false ? 'warning' : 'success')}>
                {c.active !== false ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      ))}
      {showAdd && (
        <Modal title="Add New Company" onClose={() => setShowAdd(false)}>
          <div style={S.field}><label style={S.label}>Company Name *</label><input style={S.input} value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name:e.target.value }))} placeholder="SunExpress Aviation" /></div>
          <div style={S.field}><label style={S.label}>ICAO Code *</label><input style={S.input} value={form.icao_code} onChange={e => setForm(p => ({ ...p, icao_code:e.target.value.toUpperCase() }))} placeholder="SXS" maxLength={4} /></div>
          <div style={S.field}><label style={S.label}>Contact Email</label><input style={S.input} value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email:e.target.value }))} placeholder="ops@company.com" /></div>
          <div style={S.field}><label style={S.label}>Phone</label><input style={S.input} value={form.phone} onChange={e => setForm(p => ({ ...p, phone:e.target.value }))} placeholder="+90 xxx xxx xx xx" /></div>
          <div style={{ display:'flex', gap:8, marginTop:4 }}>
            <button onClick={() => setShowAdd(false)} style={{ ...S.btn('ghost'), flex:1, padding:'9px 0' }}>Cancel</button>
            <button onClick={addCompany} disabled={saving} style={{ ...S.btn('primary'), flex:2, padding:'9px 0' }}>{saving ? 'Saving...' : '+ Add Company'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ showToast }) {
  const [users, setUsers]         = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ email:'', full_name:'', code:'', role:'pilot', customer_id:'' });

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [{ data: u }, { data: c }] = await Promise.all([
          supabase.from('profiles').select('id, email, full_name, code, role, customer_id').order('created_at', { ascending:false }),
          supabase.from('customers').select('id, company_name, icao_code'),
        ]);
        if (mounted) {
          setUsers(u || []);
          setCompanies(c || []);
        }
      } catch(e) {
        if (mounted) showToast('Load error: ' + e.message, 'error');
      }
      if (mounted) setLoading(false);
    };
    fetchData();
    return () => { mounted = false; };
  }, []); // eslint-disable-line

  const refresh = async () => {
    setLoading(true);
    try {
      const [{ data: u }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('id, email, full_name, code, role, customer_id').order('created_at', { ascending:false }),
        supabase.from('customers').select('id, company_name, icao_code'),
      ]);
      setUsers(u || []);
      setCompanies(c || []);
    } catch(e) { showToast('Error: ' + e.message, 'error'); }
    setLoading(false);
  };

  const updateRole = async (userId, role) => {
    await supabase.from('profiles').update({ role }).eq('id', userId);
    showToast('Role updated', 'success');
    refresh();
  };

  const inviteUser = async () => {
    if (!form.email) return;
    setSaving(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(form.email);
      if (authError) throw authError;
      await supabase.from('profiles').insert({
        id: authData.user.id, email: form.email, full_name: form.full_name,
        code: form.code.toUpperCase(), role: form.role, customer_id: form.customer_id || null,
      });
      showToast(`Invite sent to ${form.email}`, 'success');
      setShowAdd(false);
      setForm({ email:'', full_name:'', code:'', role:'pilot', customer_id:'' });
      refresh();
    } catch(err) { showToast('Error: ' + err.message, 'error'); }
    setSaving(false);
  };

  const getCompany = (customer_id) => {
    const c = companies.find(x => x.id === customer_id);
    return c ? c.icao_code : '—';
  };

  const roleColor = (role) => {
    if (role === 'superadmin')    return '#e8731a';
    if (role === 'company_admin') return '#1a9bc4';
    if (role === 'dispatcher')    return '#9b59b6';
    return '#2d9e5f';
  };

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={refresh} style={{ ...S.btn('ghost'), fontSize:12 }}>↻ Refresh</button>
        <button onClick={() => setShowAdd(true)} style={{ ...S.btn('primary'), flex:1 }}>+ Add User</button>
      </div>
      {loading && <div style={S.empty}>Loading...</div>}
      {!loading && users.length === 0 && <div style={S.empty}>No users found.</div>}
      {!loading && users.map(u => (
        <div key={u.id} style={S.card}>
          <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:34, height:34, borderRadius:8, background:'#2a2a2a', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:roleColor(u.role), flexShrink:0 }}>
              {(u.code || u.full_name?.slice(0,2) || '?').toUpperCase().slice(0,3)}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--t1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.full_name || u.email}</div>
              <div style={{ fontSize:10, color:'var(--t3)', marginTop:1 }}>{u.email} · {getCompany(u.customer_id)}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
              <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, background:`${roleColor(u.role)}20`, color:roleColor(u.role) }}>
                {u.role?.toUpperCase() || 'PILOT'}
              </span>
              <select value={u.role || 'pilot'} onChange={e => updateRole(u.id, e.target.value)}
                style={{ background:'#2a2a2a', border:'1px solid #383838', borderRadius:4, padding:'2px 4px', fontSize:10, color:'var(--t2)', fontFamily:'inherit' }}>
                {['pilot','dispatcher','company_admin','superadmin'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        </div>
      ))}
      {showAdd && (
        <Modal title="Invite New User" onClose={() => setShowAdd(false)}>
          <div style={S.field}><label style={S.label}>Email *</label><input style={S.input} type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email:e.target.value }))} placeholder="pilot@company.com" /></div>
          <div style={S.field}><label style={S.label}>Full Name</label><input style={S.input} value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name:e.target.value }))} placeholder="Capt. John Doe" /></div>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ ...S.field, flex:1 }}><label style={S.label}>Code</label><input style={S.input} value={form.code} onChange={e => setForm(p => ({ ...p, code:e.target.value.toUpperCase() }))} placeholder="JDO" maxLength={4} /></div>
            <div style={{ ...S.field, flex:1 }}><label style={S.label}>Role</label>
              <select style={S.input} value={form.role} onChange={e => setForm(p => ({ ...p, role:e.target.value }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={S.field}><label style={S.label}>Company</label>
            <select style={S.input} value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id:e.target.value }))}>
              <option value="">— Select Company —</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.icao_code} — {c.company_name}</option>)}
            </select>
          </div>
          <div style={{ ...S.divider }} />
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowAdd(false)} style={{ ...S.btn('ghost'), flex:1, padding:'9px 0' }}>Cancel</button>
            <button onClick={inviteUser} disabled={saving} style={{ ...S.btn('primary'), flex:2, padding:'9px 0' }}>{saving ? 'Sending...' : '📧 Send Invite'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Modules Tab ──────────────────────────────────────────────────────────────
function ModulesTab({ showToast }) {
  const [companies, setCompanies]   = useState([]);
  const [selectedCo, setSelectedCo] = useState('');
  const [modules, setModules]       = useState([]);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    supabase.from('customers').select('id, company_name, icao_code').order('company_name').then(({ data }) => {
      setCompanies(data || []);
      if (data?.length > 0) setSelectedCo(data[0].id);
    });
  }, []);

  const loadModules = useCallback(async (coId) => {
    if (!coId) return;
    setLoading(true);
    const { data } = await supabase.from('company_modules').select('*').eq('customer_id', coId);
    const moduleMap = {};
    (data || []).forEach(m => { moduleMap[m.module_key] = m; });
    setModules(MODULES.map(m => ({ ...m, db: moduleMap[m.key] || null, is_active: moduleMap[m.key]?.is_active ?? false })));
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedCo) loadModules(selectedCo); }, [selectedCo, loadModules]);

  const toggleModule = async (mod) => {
    const newVal = !mod.is_active;
    try {
      if (mod.db) { await supabase.from('company_modules').update({ is_active:newVal }).eq('id', mod.db.id); }
      else { await supabase.from('company_modules').insert({ customer_id:selectedCo, module_key:mod.key, is_active:newVal }); }
      showToast(`${mod.label} ${newVal ? 'enabled' : 'disabled'}`, 'success');
      loadModules(selectedCo);
    } catch(err) { showToast('Error: ' + err.message, 'error'); }
  };

  const enableAll = async () => {
    try {
      for (const mod of modules) {
        if (mod.db) { await supabase.from('company_modules').update({ is_active:true }).eq('id', mod.db.id); }
        else { await supabase.from('company_modules').insert({ customer_id:selectedCo, module_key:mod.key, is_active:true }); }
      }
      showToast('All modules enabled', 'success');
      loadModules(selectedCo);
    } catch(err) { showToast('Error: ' + err.message, 'error'); }
  };

  const activeCount = modules.filter(m => m.is_active).length;

  return (
    <div>
      <div style={S.field}>
        <label style={S.label}>Select Company</label>
        <select style={S.input} value={selectedCo} onChange={e => setSelectedCo(e.target.value)}>
          {companies.map(c => <option key={c.id} value={c.id}>{c.icao_code} — {c.company_name}</option>)}
        </select>
      </div>
      {selectedCo && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:11, color:'var(--t3)' }}><b style={{ color:'#2d9e5f' }}>{activeCount}</b> / {MODULES.length} modules active</div>
          <button onClick={enableAll} style={S.btn('success')}>Enable All</button>
        </div>
      )}
      {loading && <div style={S.empty}>Loading...</div>}
      {modules.map(mod => (
        <div key={mod.key} style={{ ...S.card, marginBottom:6 }}>
          <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:20, flexShrink:0 }}>{mod.icon}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color: mod.is_active ? 'var(--t1)' : 'var(--t3)' }}>{mod.label}</div>
              <div style={{ fontSize:10, color:'#444', marginTop:1, fontFamily:'monospace' }}>{mod.key}</div>
            </div>
            <Toggle on={mod.is_active} onChange={() => toggleModule(mod)} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SuperAdmin ───────────────────────────────────────────────────────────────
export default function SuperAdmin({ user, profile, onBack }) {
  const [tab, setTab]     = useState('companies');
  const [toast, setToast] = useState({ msg:'', type:'success' });

  const showToast = useCallback((msg, type='success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg:'', type:'success' }), 3000);
  }, []);

  const TABS = [
    { id:'companies', label:'🏢 Companies' },
    { id:'users',     label:'👤 Users'     },
    { id:'modules',   label:'🧩 Modules'   },
  ];

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={onBack} style={{ ...S.btn('ghost'), padding:'4px 10px', fontSize:12 }}>← Back</button>
          <span style={{ fontSize:13, fontWeight:700, color:'#e8731a' }}>GO2 eFB</span>
          <span style={S.badge}>Super Admin</span>
        </div>
        <span style={{ fontSize:11, color:'var(--t3)' }}>{user?.email || ''}</span>
      </div>
      <div style={S.tabs}>
        {TABS.map(t => (
          <div key={t.id} style={S.tab(tab===t.id)} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>
      <div style={S.body}>
        {tab==='companies' && <CompaniesTab showToast={showToast} />}
        {tab==='users'     && <UsersTab     showToast={showToast} />}
        {tab==='modules'   && <ModulesTab   showToast={showToast} />}
      </div>
      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}