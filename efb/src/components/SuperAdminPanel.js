import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { Crews } from './AdminPanel';

const C = {
  bg:'#0f1115', bg2:'#161923', bg3:'#1c202b', border:'#2a2e3a',
  t1:'#e8eaf0', t2:'#9aa3b5', t3:'#6b7180', accent:'#1a9bc4',
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

const NAV = [
  { id:'companies', icon:'⌂', label:'Companies' },
  { id:'settings',   icon:'⚙', label:'Settings' },
];

function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div style={{ position:'fixed', bottom:20, right:20, background: type==='error' ? '#e02020' : '#2d9e5f', color:'#fff', padding:'10px 16px', borderRadius:8, fontSize:12, fontWeight:700, zIndex:200 }}>
      {msg}
    </div>
  );
}

function Companies({ toast, myProfile }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
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
          <button style={S.btnSecondary} onClick={() => setSelected(null)}>← ALL COMPANIES</button>
          <span style={{ fontSize:13, fontWeight:700, color:C.accent }}>{selected.company_name}</span>
          <span style={{ fontSize:10, color:C.t3 }}>{selected.icao_code}</span>
        </div>
        <Crews toast={toast} myProfile={myProfile} customerId={selected.id} />
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
                <span onClick={(e) => toggleActive(c, e)} style={{ cursor:'pointer', fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:4, background: c.active ? 'rgba(45,158,95,0.15)' : 'rgba(224,32,32,0.15)', color: c.active ? '#2d9e5f' : '#e02020' }}>
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

function Settings() {
  return (
    <div style={{ flex:1, padding:24, color:C.t3, fontSize:12 }}>
      Settings — module visibility, global configuration. Coming soon.
    </div>
  );
}

export default function SuperAdminPanel({ onBack }) {
  const [tab, setTab] = useState('companies');
  const [ready, setReady] = useState(false);
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
      <div style={{ color:C.accent, letterSpacing:3, fontSize:11, fontFamily:"'Courier New',monospace" }}>CHECKING AUTHORIZATION...</div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:C.bg, fontFamily:"'Courier New',monospace" }}>
      <Toast msg={toast.msg} type={toast.type} />
      <div style={{ background:C.bg2, borderBottom:`1px solid ${C.border}`, padding:'0 16px', height:44, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <span style={{ fontSize:12, fontWeight:700, color:'#e8a020', letterSpacing:2 }}>SUPER ADMIN</span>
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
        {tab === 'companies' && <Companies toast={showToast} myProfile={myProfile} />}
        {tab === 'settings' && <Settings />}
      </div>
    </div>
  );
}
