// NotificationBell.js — admin panel ust barinda CAN + uyari sayaci
//
// Serkan (17 Agu 2026): "Egitim sureleri bitmeye yakin uyari versin dedik ama
//  nasil verecek onu konusmadik. Admin panelde bir notification olsun, RING BELL
//  imaji yaninda kirmizi/amber flag; tiklayinca popup ekran ciksin ve soyle olsun
//  mesela: 'Serkan CALISKAN XXX egitimi expire olacak within xx days'."
//
// NEDEN AYRI BILESEN: uyari FTL sekmesinin ICINDE kalirsa yalniz oraya giren
// gorur. Egitim suresi ise gorev atarken degil, HERHANGI BIR AN farkedilmesi
// gereken bir sey — o yuzden ust barda, her sekmede.
//
// HESAP TrainingRules.js'ten gelir: esikler (60/30/15) ve gecerlilik kurallari
// TEK KAYNAKTIR. Bu bilesen kendi tarih matematigini YAPMAZ; yapsaydi TRAINING
// sekmesiyle can farkli gun sayilari gosterebilirdi (Ilke 3).
//
// GIRILMEMIS EGITIM UYARI URETMEZ (Serkan): kaydi olmayan kalem icin cana
// hicbir sey dusmez. Can yalniz VAR OLAN kayitlarin suresini izler.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { trainingStatus } from './TrainingRules';

const C = {
  bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)', border2:'var(--border2)',
  red:'var(--red)', amber:'var(--amber)', green:'var(--green)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)',
};
const today = () => new Date().toISOString().slice(0, 10);

// Can rengi EN KOTU kaleme gore: bir tane bile suresi dolmus/kritik varsa
// kirmizi. Sarinin icinde kirmiziyi saklamayiz.
const RANK = { EXPIRED: 4, CRITICAL: 3, WARNING: 2, NOTICE: 1 };

export default function NotificationBell({ customerId }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  // customerId YALNIZ super admin baska sirketi izlerken dolu gelir. Normal
  // adminde null'dir ve filtre uygulanmaz — RLS zaten kendi sirketine kisitlar
  // (AdminPanel'in geri kalaninda da desen bu).
  const load = useCallback(async () => {
    const scope = (q) => customerId ? q.eq('customer_id', customerId) : q;
    const [{ data: trn }, { data: cat }, { data: profs }] = await Promise.all([
      scope(supabase.from('pilot_trainings').select('*').eq('status', 'current')),
      scope(supabase.from('training_catalog').select('code,name,default_alert_days')),
      scope(supabase.from('profiles').select('id,code,full_name')),
    ]);
    const catBy = Object.fromEntries((cat || []).map(c => [c.code, c]));
    const pBy   = Object.fromEntries((profs || []).map(p => [p.id, p]));
    const t = today();

    const list = (trn || []).map(r => {
      const st = trainingStatus(r.expires_at, r.alert_days || catBy[r.training_code]?.default_alert_days, t);
      return { ...r, st, pilot: pBy[r.pilot_id], catName: catBy[r.training_code]?.name };
    })
    // VALID ve NO_EXPIRY cana dusmez — can yalniz DIKKAT isteyeni tasir.
    .filter(x => RANK[x.st.state])
    .sort((a, b) => (RANK[b.st.state] - RANK[a.st.state]) || (a.st.daysLeft - b.st.daysLeft));

    setItems(list);
  }, [customerId]);

  useEffect(() => { load(); const iv = setInterval(load, 300000); return () => clearInterval(iv); }, [load]);

  const worst = useMemo(
    () => items.reduce((m, x) => Math.max(m, RANK[x.st.state] || 0), 0), [items]);
  const renk = worst >= 3 ? C.red : worst > 0 ? C.amber : null;

  const adi = (p) => p ? `${p.code ? p.code + ' — ' : ''}${(p.full_name || '').toUpperCase()}` : 'UNKNOWN PILOT';
  const metin = (x) =>
    x.st.state === 'EXPIRED'
      ? `${adi(x.pilot)} — ${x.training_code} EXPIRED ${Math.abs(x.st.daysLeft)} days ago (${x.expires_at})`
      : `${adi(x.pilot)} — ${x.training_code} will expire within ${x.st.daysLeft} days (${x.expires_at})`;

  return (
    <div style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={items.length ? `${items.length} training alert(s)` : 'No training alerts'}
        style={{ position:'relative', width:34, height:34, background:'transparent',
                 border:`1px solid ${C.border2}`, borderRadius:6, color: renk || C.t3,
                 fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
        🔔
        {items.length > 0 && (
          <span style={{ position:'absolute', top:-6, right:-6, minWidth:16, height:16, padding:'0 4px',
                         borderRadius:8, background:renk, color:'#fff', fontSize:9, fontWeight:700,
                         fontFamily:'var(--mono)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:70 }} />
          <div style={{ position:'absolute', right:0, top:42, width:460, maxHeight:'70vh', overflowY:'auto',
                        background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:10,
                        boxShadow:'var(--shadow)', zIndex:71 }}>
            <div style={{ padding:'11px 16px', borderBottom:`1px solid ${C.border}`, background:C.bg3,
                          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, fontWeight:700, letterSpacing:2, color:renk || C.t2,
                             textTransform:'uppercase', fontFamily:'var(--mono)' }}>
                Training alerts
              </span>
              <span style={{ fontSize:9, color:C.t3, fontFamily:'var(--mono)', letterSpacing:1 }}>
                60 / 30 / 15 DAYS
              </span>
            </div>

            {items.length === 0 && (
              // ILKE 1: "hersey yolunda" DEMEYIZ — neye bakildigini soyleriz.
              // Girilmemis egitim uyari uretmedigi icin bos liste "tam" anlamina
              // gelmez; kullanicinin bunu bilmesi gerekir.
              <div style={{ padding:'18px 16px', fontSize:11, color:C.t3, fontFamily:'var(--mono)', lineHeight:1.8 }}>
                NO TRAINING EXPIRING WITHIN 60 DAYS<br />
                <span style={{ color:C.t2 }}>Covers recorded trainings only — items never entered are not tracked.</span>
              </div>
            )}

            {items.map(x => {
              const c = x.st.state === 'EXPIRED' || x.st.state === 'CRITICAL' ? C.red : C.amber;
              return (
                <div key={x.id} style={{ padding:'11px 16px', borderBottom:`1px solid ${C.border}`,
                                         borderLeft:`3px solid ${c}` }}>
                  <div style={{ fontSize:12, color:C.t1, fontFamily:'var(--mono)', lineHeight:1.5 }}>
                    {metin(x)}
                  </div>
                  <div style={{ marginTop:3, fontSize:9.5, color:C.t3, fontFamily:'var(--mono)' }}>
                    {x.catName || x.training_code}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
