// TrainingPanel.js — FTL sekmesi > TRAINING (DUTY HISTORY ile SKPK arasi)
//
// Serkan (17 Agu 2026): "Egitimleri ve egitim tarihi ve expire tarihi girmek
//  icin TRAINING modul ekleyelim, her 3 pilot icin giris yapma imkani olsun,
//  +ADD TRN ile ekleyelim. 60 gun kala, 30 gun kala, 15 gun kala alarm."
//
// ┌ UC AYRI ISLEM — KARISTIRILMAZ ─────────────────────────────────────────┐
// │ ADD    yeni kayit                                                       │
// │ RENEW  YENI OLAY -> YENI SATIR; eskisi 'superseded', tarihi DEGISMEZ.   │
// │        Sebep denetim: "12 Mart'ta uctugunda OPC'si gecerli miydi?"      │
// │ EDIT   AYNI OLAY, yanlis yazilmis -> satir YERINDE duzeltilir.          │
// │        Serkan: "biz egitimin gerekliligini delete etmiyoruz, sadece     │
// │        icini edit edebilelim; matbu bir hata olabilir, tarihler,        │
// │        isimler, harf hatasi olabilir. Edit edilebilsin her sey."        │
// │        + "rapor yazilsin tabi" -> GEREKCE ZORUNLU ve iz DEGISIKLIKTEN   │
// │        ONCE yazilir (ftl_duty_edits deseninin ayinisi).                 │
// └────────────────────────────────────────────────────────────────────────┘
//
// SILME YOK: pilot_trainings'te DELETE policy yoktur. Silme dugmesi de yok —
// olsaydi RLS 0 satir doner, hata vermez ve kullanici silindi sanirdi (Ilke 2).
// Silinen sey zaten istenmiyor: duzeltme EDIT, degisiklik RENEW ile olur.
//
// DIGER KARARLAR (spec: GO2EFB/FTL-LIMITS-TRAINING-SPEC.md, bolum B):
//  · Suresi dolmus egitim gorev atamasini ENGELLEMEZ, UYARIR.
//  · GIRILMEMIS veri uyari URETMEZ ("veri girilince uyari sistemi kurulur").
//  · BELGE YUKLEME YOK (KVKK) — tutulan tek sey tarih ve yenileme suresi.
//  · Dogum tarihi YALNIZ medical kaydinda, sistemde baska hicbir yerde yok.
//
// Hesap TrainingRules.js'te (saf mantik). Bu dosya ekran + kayit.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  computeExpiry, trainingStatus, medicalValidityMonths, ageAt,
  STATE_COLOR, ALERT_DAYS, todayLocal, latestPerTraining, previousRecord,
} from './TrainingRules';
// Serbest metin girisleri BUYUK HARF — TEK KAYNAK `up` (iOS: TextFormat.swift).
// Kendi buyuk-harf mantigimizi yazmayiz; Turkce karakter donusumu de burada.
import { up } from './inputFormat';

const C = {
  bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)', border2:'var(--border2)',
  accent:'var(--accent)', green:'var(--green)', red:'var(--red)', amber:'var(--amber)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)',
};
const S = {
  panel:{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden', marginBottom:22 },
  panelH:{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 16px', borderBottom:`1px solid ${C.border}`, background:C.bg3 },
  panelT:{ fontSize:11, fontWeight:700, letterSpacing:2, color:C.accent, textTransform:'uppercase', fontFamily:'var(--mono)' },
  table:{ width:'100%', borderCollapse:'collapse' },
  th:{ padding:'9px 12px', textAlign:'left', fontSize:10, color:C.t1, fontWeight:700, letterSpacing:1, textTransform:'uppercase', borderBottom:`1px solid ${C.border}`, background:C.bg3, whiteSpace:'nowrap', fontFamily:'var(--mono)' },
  td:{ padding:'8px 12px', borderBottom:`1px solid ${C.border}`, color:C.t1, fontSize:12.5, fontWeight:600, verticalAlign:'middle', whiteSpace:'nowrap', fontFamily:'var(--mono)', fontVariantNumeric:'tabular-nums' },
  label:{ fontSize:10, color:C.t2, fontWeight:700, letterSpacing:1.5, textTransform:'uppercase', fontFamily:'var(--mono)', display:'block', marginBottom:6 },
  input:{ background:'var(--input-bg)', border:`1px solid ${C.border}`, borderRadius:6, color:C.t1, padding:'9px 11px', fontSize:13, fontFamily:'var(--mono)', width:'100%', boxSizing:'border-box', outline:'none' },
  btnP:{ background:C.accent, color:'#fff', border:'none', borderRadius:6, padding:'10px 22px', fontSize:12, fontFamily:'var(--mono)', fontWeight:700, letterSpacing:1.5, cursor:'pointer', textTransform:'uppercase' },
  btnS:{ background:'none', color:C.t2, border:`1px solid ${C.border2}`, borderRadius:6, padding:'8px 16px', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', letterSpacing:1 },
  btnTiny:{ background:'none', color:C.t3, border:`1px solid ${C.border2}`, borderRadius:5, padding:'2px 9px', fontSize:9, fontFamily:'var(--mono)', cursor:'pointer', letterSpacing:1 },
  note:{ fontSize:10, color:C.t3, letterSpacing:.5, lineHeight:1.7, padding:'9px 12px', background:C.bg3, borderLeft:`2px solid ${C.border2}`, fontFamily:'var(--mono)' },
  modalBg:{ position:'fixed', inset:0, background:'var(--backdrop)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60, padding:20 },
  modal:{ background:C.bg2, border:`1px solid ${C.border2}`, borderRadius:12, width:540, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'var(--shadow)' },
};
const PILOT_ROLES = ['pilot', 'admin_pilot'];
// "Bugun" TrainingRules.todayLocal()'dan gelir — kendi kopyamizi yazmayiz.
// Eskiden burada da canda da ayri birer toISOString() kopyasi vardi (UTC) ve
// Turkiye'de gece 00:00-03:00 arasi gun bir geride kaliyordu.

const stateBadge = (state, daysLeft) => {
  const c = STATE_COLOR[state] || C.t3;
  const txt = state === 'EXPIRED'   ? 'EXPIRED'
            : state === 'NO_EXPIRY' ? 'NO EXPIRY'
            : state === 'VALID'     ? 'VALID'
            : `${daysLeft} D`;
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', fontSize:9, letterSpacing:1,
                   fontWeight:700, border:`1px solid ${c}`, color:c, fontFamily:'var(--mono)' }}>
      {txt}
    </span>
  );
};

const basisText = (rule, anchor) =>
    rule === 'CARRY_FORWARD' ? `carried from ${anchor}`
  : rule === 'END_OF_MONTH'  ? 'from end of check month'
  : rule === 'NO_EXPIRY'     ? 'no re-assessment required'
  : 'from check date';

export default function TrainingPanel({ toast, myProfile, pilots, customerId, readOnly = false }) {
  const [catalog, setCatalog] = useState([]);
  const [rows, setRows] = useState([]);
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [modal, setModal] = useState(null);   // {mode:'add'|'edit', row?} | null

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cat }, { data: trn }, { data: ch }] = await Promise.all([
      supabase.from('training_catalog').select('*').eq('customer_id', customerId).order('sort_order'),
      supabase.from('pilot_trainings').select('*').eq('customer_id', customerId).order('completed_date', { ascending: false }),
      supabase.from('training_changes').select('*').eq('customer_id', customerId).order('changed_at', { ascending: false }).limit(200),
    ]);
    setCatalog(cat || []); setRows(trn || []); setChanges(ch || []);
    setLoading(false);
  }, [customerId]);
  useEffect(() => { if (customerId) load(); }, [load, customerId]);

  const crew = useMemo(() => (pilots || []).filter(p => PILOT_ROLES.includes(p.role)), [pilots]);
  const catByCode = useMemo(() => Object.fromEntries(catalog.map(c => [c.code, c])), [catalog]);
  const pilotName = useCallback(
    (id) => { const p = crew.find(x => x.id === id); return p ? (p.code ? p.code + ' — ' : '') + (p.full_name || '') : '—'; },
    [crew]);
  // KRONOLOJIK KURAL (Serkan, 19 Agu): hangi kaydin gecerli oldugunu `status`
  // damgasi degil TARIH soyler. Damga giris sirasina gore yaziliyordu ve eski
  // tarihli bir kaydin ikinci kez girilmesi daha yeni bir kaydi sessizce devre
  // disi birakabiliyordu (AAK/LC, 19 Agu canli veri). Butun kayitlar listede
  // DURUR — "girili butun kayitlar duracak sistemde, ama uyari esigi en
  // guncele gore".
  //
  // ⚠️ BU HOOK ASAGIDAKI ERKEN RETURN'LERDEN ONCE DURMAK ZORUNDA. Ilk surumde
  //    `visible`in yanina, return'lerin ALTINA konmustu: loading=true iken hic
  //    calismiyor, veri gelince calisiyordu -> React "hook sayisi degisti" deyip
  //    bileseni cokertiyor ve TRAINING sekmesi HIC ACILMIYORDU (19 Agu).
  const gecerliIds = useMemo(
    () => new Set(latestPerTraining(rows).map(r => r.id)), [rows]);

  const t = todayLocal();

  if (loading) return <div style={{ padding:24, color:C.t3, fontSize:11, fontFamily:'var(--mono)' }}>LOADING TRAINING DATA...</div>;

  // Katalog yoksa SESSIZ KALMAYIZ: bos ekran "kayit yok" diye okunurdu, oysa
  // goc kosulmamis olabilir (Ilke 1).
  if (catalog.length === 0) {
    return (
      <div style={{ padding:24, color:C.red, fontSize:11, fontFamily:'var(--mono)', lineHeight:1.9 }}>
        NO TRAINING CATALOG FOR THIS CUSTOMER<br />
        <span style={{ color:C.t3 }}>run supabase/migrations/20260817_training_module.sql</span>
      </div>
    );
  }

  const visible = rows.filter(r => showHistory || gecerliIds.has(r.id));

  return (
    <>
      <div style={S.panel}>
        <div style={S.panelH}>
          <span style={S.panelT}>Training — validity &amp; renewals</span>
          <div style={{ display:'flex', gap:10, alignItems:'center' }}>
            <button style={S.btnS} onClick={() => setShowReport(v => !v)}>
              {showReport ? 'HIDE REPORT' : 'CHANGE REPORT'}
            </button>
            <button style={S.btnS} onClick={() => setShowHistory(h => !h)}>
              {showHistory ? 'HIDE HISTORY' : 'SHOW HISTORY'}
            </button>
            {!readOnly && (
              <button style={S.btnP} onClick={() => setModal({ mode:'add' })}>+ ADD TRN</button>
            )}
          </div>
        </div>

        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Pilot</th>
              <th style={S.th}>Training</th>
              <th style={S.th}>Val</th>
              <th style={S.th}>Completed</th>
              <th style={S.th}>Expires</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Issued by</th>
              <th style={S.th}>Basis</th>
              <th style={S.th} />
            </tr>
          </thead>
          <tbody>
            {crew.map(p => {
              const mine = visible.filter(r => r.pilot_id === p.id);
              if (mine.length === 0) {
                // GIRILMEMIS VERI UYARI URETMEZ (Serkan). Bos satir "kayit yok"
                // der; MISSING/eksik rozeti YAZILMAZ.
                return (
                  <tr key={p.id}>
                    <td style={S.td}>{(p.code ? p.code + ' — ' : '') + (p.full_name || '').toUpperCase()}</td>
                    <td style={{ ...S.td, color:C.t3 }} colSpan={8}>no training recorded</td>
                  </tr>
                );
              }
              return mine.map((r, i) => {
                const cat = catByCode[r.training_code];
                const st = trainingStatus(r.expires_at, t);
                const sup = !gecerliIds.has(r.id);   // gecerli DEGIL (tarihe gore)
                return (
                  <tr key={r.id} style={sup ? { opacity:.5 } : undefined}>
                    <td style={S.td}>{i === 0 ? (p.code ? p.code + ' — ' : '') + (p.full_name || '').toUpperCase() : ''}</td>
                    <td style={S.td}>
                      {r.training_code}
                      {sup && <span style={{ marginLeft:8, fontSize:9, color:C.t3 }}>SUPERSEDED</span>}
                    </td>
                    <td style={{ ...S.td, color:C.t2 }}>{r.validity_months != null ? `${r.validity_months}M` : '—'}</td>
                    <td style={S.td}>{r.completed_date}</td>
                    <td style={S.td}>{r.expires_at || (cat?.no_expiry ? 'NO EXPIRY' : '—')}</td>
                    <td style={S.td}>{sup ? '' : stateBadge(st.state, st.daysLeft)}</td>
                    <td style={{ ...S.td, color:C.t2, whiteSpace:'normal' }}>{r.issued_by || '—'}</td>
                    {/* Her tarih HANGI MADDEDEN ciktigini yaninda tasir. */}
                    <td style={{ ...S.td, color:C.t3, fontSize:9.5, whiteSpace:'normal', maxWidth:250 }}>
                      {basisText(r.applied_rule, r.anchor_date)}
                      {cat?.legal_reference && <><br /><span style={{ color:C.t2 }}>{cat.legal_reference}</span></>}
                    </td>
                    <td style={S.td}>
                      {!readOnly && (
                        <button style={S.btnTiny} onClick={() => setModal({ mode:'edit', row:r })}>EDIT</button>
                      )}
                    </td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>

        <div style={S.note}>
          BASIS: SHT-OPS EK-3 · ORO.FC.230 (g)(h) &nbsp;·&nbsp; AMC1 ORO.FC.230(b)(4) &nbsp;·&nbsp;
          SHT-FCL FCL.740 / FCL.055 &nbsp;·&nbsp; SHT-MED MED.A.045<br />
          Alerts are fixed at {ALERT_DAYS.NOTICE} / {ALERT_DAYS.WARNING} / {ALERT_DAYS.CRITICAL} days
          and count down on the local calendar day. Validity always follows the record with the
          <b> latest completion date</b> — every record is kept, but only the newest one drives the alert.<br />
          An expired training does <b>not</b> block duty assignment — it raises a warning only.
          Trainings with no record produce no warning. Records are never deleted: a typo is
          corrected with EDIT (reason required, logged), a new event creates a new row and
          supersedes the previous one.
        </div>
      </div>

      {showReport && (
        <div style={S.panel}>
          <div style={S.panelH}><span style={S.panelT}>Change report</span></div>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>When</th><th style={S.th}>Action</th><th style={S.th}>Field</th>
                <th style={S.th}>Old</th><th style={S.th}>New</th><th style={S.th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {changes.length === 0 && (
                <tr><td style={{ ...S.td, color:C.t3 }} colSpan={6}>no changes recorded</td></tr>
              )}
              {changes.map(c => (
                <tr key={c.id}>
                  <td style={S.td}>{(c.changed_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td style={S.td}>{c.action}</td>
                  <td style={{ ...S.td, color:C.t2 }}>{c.field || '—'}</td>
                  <td style={{ ...S.td, color:C.t3 }}>{c.old_value || '—'}</td>
                  <td style={S.td}>{c.new_value || '—'}</td>
                  <td style={{ ...S.td, color:C.t2, whiteSpace:'normal' }}>{c.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TrainingModal
          {...{ toast, myProfile, customerId, crew, catalog, rows, pilotName }}
          mode={modal.mode}
          row={modal.row || null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ADD / RENEW / EDIT — tek modal, mod'a gore davranis
// ═══════════════════════════════════════════════════════════════════
function TrainingModal({ toast, myProfile, customerId, crew, catalog, rows, pilotName,
                         mode, row, onClose, onSaved }) {
  const editing = mode === 'edit';

  const [pilotId, setPilotId]   = useState(row?.pilot_id || crew[0]?.id || '');
  const [code, setCode]         = useState(row?.training_code || catalog[0]?.code || '');
  const [completed, setCompleted] = useState(row?.completed_date || todayLocal());
  const [months, setMonths]     = useState(row?.validity_months != null ? String(row.validity_months) : '');
  const [issuedBy, setIssuedBy] = useState(row?.issued_by || '');
  const [dob, setDob]           = useState(row?.date_of_birth || '');
  const [notes, setNotes]       = useState(row?.notes || '');
  const [reason, setReason]     = useState('');
  const [saving, setSaving]     = useState(false);

  const cat = useMemo(() => catalog.find(c => c.code === code) || null, [catalog, code]);

  // Ayni pilot+kod icin GIRILEN TARIHTEN ONCEKI kayit — devir capasi budur.
  // Eskiden `status==='current'` satiri aranirdi; damga giris sirasina gore
  // yazildigi icin geriye donuk bir kayit girildiginde YANLIS capa secilirdi.
  // Simdi tarihten bulunur ve `superseded_by` baglantisina HIC bakilmaz —
  // o baglanti kopsa bile hesap dogru kalir (19 Agu acik bulgusu kapandi).
  const prev = useMemo(
    () => previousRecord(rows, { pilotId, code, completed, excludeId: row?.id || null }),
    [rows, pilotId, code, completed, row]);

  // Ayni kalemin BUTUN kayitlari (kendisi haric) — geriye donuk giris tespiti.
  const grup = useMemo(
    () => rows.filter(r => r.pilot_id === pilotId && r.training_code === code && r.id !== row?.id),
    [rows, pilotId, code, row]);

  // Girilen tarih grubun en yenisi mi? Degilse bu kayit UYARIYI BELIRLEMEZ —
  // ama sistemde durur (Serkan: "girili butun kayitlar duracak sistemde").
  const dahaYeniVar = useMemo(
    () => grup.find(r => (r.completed_date || '') > (completed || '')) || null,
    [grup, completed]);

  const prevDob = useMemo(
    () => rows.find(r => r.pilot_id === pilotId && r.training_code === code && r.date_of_birth && r.id !== row?.id)?.date_of_birth || '',
    [rows, pilotId, code, row]);
  useEffect(() => { if (!editing) setDob(prevDob); }, [prevDob, editing]);

  // Katalog degisince varsayilan sure (admin ustune yazabilir).
  useEffect(() => {
    if (!cat || editing) return;
    setMonths(cat.default_validity_months != null ? String(cat.default_validity_months) : '');
  }, [cat, editing]);

  // MED: sure DOGUM TARIHINDEN — MED.A.045(a)(2); yas MUAYENE tarihindeki yas
  // (a)(5)(i). Dogum tarihi yoksa HESAPLANMAZ (uydurma yok).
  const autoMonths = useMemo(
    () => (cat?.age_dependent ? medicalValidityMonths(dob, completed) : null),
    [cat, dob, completed]);
  useEffect(() => { if (autoMonths != null) setMonths(String(autoMonths)); }, [autoMonths]);

  const calc = useMemo(() => computeExpiry({
    completed,
    validityMonths: months === '' ? null : Number(months),
    cat,
    prevExpiry: prev?.expires_at || null,
  }), [completed, months, cat, prev]);

  const dobWarn = cat?.age_dependent && dob && prevDob && dob !== prevDob;

  const save = async () => {
    if (!pilotId || !code || !completed) { toast?.('PILOT, TRAINING AND DATE REQUIRED'); return; }
    if (!cat?.no_expiry && months === '')  { toast?.('VALIDITY REQUIRED'); return; }
    // GEREKCE ZORUNLU (ftl_duty_edits deseni). Bir kaydin ustune yaziliyorsa
    // NEDEN yazildigi da durmali; gerekcesiz duzeltme denetimde savunulamaz.
    if (editing && !reason.trim()) { toast?.('REASON REQUIRED FOR CORRECTION'); return; }
    setSaving(true);

    // alert_days ARTIK YAZILMAZ: esik 60/30/15 sabittir ve TrainingRules'ta
    // tek yerde durur (Serkan, 19 Agu: "ayni kalsin, degismesin"). Kolon semada
    // kalir, eski kayitlarin degeri silinmez (Ilke 4) — sadece okunmaz.
    const fields = {
      pilot_id: pilotId,
      training_code: code,
      completed_date: completed,
      validity_months: months === '' ? null : Number(months),
      expires_at: calc.expiresAt,
      applied_rule: calc.appliedRule,
      anchor_date: calc.anchorDate,
      issued_by: issuedBy || null,
      date_of_birth: cat?.age_dependent ? (dob || null) : null,
      notes: notes || null,
    };

    // ───────────── EDIT: yerinde duzeltme ─────────────
    if (editing) {
      // IZ DEGISIKLIKTEN ONCE YAZILIR — update duserse bile neyin denendigi
      // kayitli kalir (ftl_duty_edits ile ayni sira).
      const diffs = Object.entries(fields)
        .filter(([k, v]) => String(row[k] ?? '') !== String(v ?? ''))
        .map(([k, v]) => ({
          customer_id: customerId, training_id: row.id, action: 'TRN_CORRECT',
          field: k, old_value: row[k] == null ? null : String(row[k]),
          new_value: v == null ? null : String(v),
          reason: reason.trim(), changed_by: myProfile?.id || null,
        }));

      if (diffs.length === 0) { setSaving(false); toast?.('NO CHANGE'); return; }
      const { error: logErr } = await supabase.from('training_changes').insert(diffs);
      if (logErr) { setSaving(false); toast?.('AUDIT WRITE FAILED — ' + logErr.message); return; }

      const { error } = await supabase.from('pilot_trainings')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      setSaving(false);
      if (error) { toast?.('UPDATE FAILED — ' + error.message); return; }
      toast?.(`CORRECTED — ${diffs.length} FIELD(S) LOGGED`);
      onSaved();
      return;
    }

    // ───────────── ADD / RENEW: yeni satir ─────────────
    // KRONOLOJIK KURAL: yeni kayit 'current' damgasini ANCAK grubun en yeni
    // tarihlisiyse alir. Geriye donuk bir giris yururlukteki kaydi DEVIRMEZ
    // — eskiden deviriyordu ve AAK/LC boyle bozulmustu (19 Agu).
    // Not: hesap zaten damgaya degil tarihe bakiyor; damga veritabani
    // seviyesinde tutarli kalsin diye dogru yaziliyor (kismi unique index
    // ayni anda iki 'current' satira izin vermez).
    const mevcutCurrent = grup.find(r => r.status === 'current') || null;
    const gecerliOlacak = !dahaYeniVar;
    let uyari = '';

    // Yeni kayit gecerli olacaksa, damgayi tasiyan satiri ONCE dusurmeliyiz.
    // Insert duserse GERI ALIRIZ — yarim durumda birakmayiz (Ilke 2).
    if (gecerliOlacak && mevcutCurrent) {
      const { error } = await supabase.from('pilot_trainings')
        .update({ status:'superseded', updated_at:new Date().toISOString() }).eq('id', mevcutCurrent.id);
      if (error) { setSaving(false); toast?.('SUPERSEDE FAILED — ' + error.message); return; }
    }

    const { data: ins, error } = await supabase.from('pilot_trainings')
      .insert({ ...fields, customer_id: customerId,
                status: gecerliOlacak ? 'current' : 'superseded',
                superseded_by: gecerliOlacak ? null : (dahaYeniVar?.id || null),
                created_by: myProfile?.id || null })
      .select('id').single();

    if (error) {
      if (gecerliOlacak && mevcutCurrent) {
        await supabase.from('pilot_trainings').update({ status:'current' }).eq('id', mevcutCurrent.id);
      }
      setSaving(false); toast?.('SAVE FAILED — ' + error.message); return;
    }

    // superseded_by yalnizca IZ'dir; hesap ona BAKMAZ (capa tarihten bulunur).
    // Yine de duserse SESSIZ KALMAYIZ (Ilke 2) — eskiden bu satirin sonucu hic
    // okunmuyordu.
    if (gecerliOlacak && mevcutCurrent) {
      const { error: linkErr } = await supabase.from('pilot_trainings')
        .update({ superseded_by: ins.id }).eq('id', mevcutCurrent.id);
      if (linkErr) uyari = ' · LINK NOT WRITTEN';
    }

    // Denetim izi de kontrolsuz yazilmayacak: iz dusmusse kullanici bilmeli,
    // cunku kayit izsiz kalmis olur (Ilke 4).
    const { error: izErr } = await supabase.from('training_changes').insert({
      customer_id: customerId, training_id: ins.id,
      action: prev ? 'TRN_RENEW' : 'TRN_ADD',
      field: 'expires_at',
      old_value: prev?.expires_at || null,
      new_value: calc.expiresAt,
      reason: reason.trim() || calc.appliedRule,
      changed_by: myProfile?.id || null,
    });
    if (izErr) uyari += ' · AUDIT NOT WRITTEN';

    setSaving(false);
    toast?.((gecerliOlacak ? (prev ? 'TRAINING RENEWED' : 'TRAINING ADDED')
                          : 'RECORD ADDED — NOT THE LATEST, ALERTS UNCHANGED') + uyari);
    onSaved();
  };

  const title = editing ? 'Correct training record' : (prev ? 'Renew training' : 'Add training');

  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.panelH}>
          <span style={S.panelT}>{title}</span>
          <button style={S.btnS} onClick={onClose}>CLOSE</button>
        </div>

        <div style={{ padding:18, display:'grid', gap:14 }}>
          {editing && (
            <div style={{ ...S.note, borderLeftColor:C.accent }}>
              CORRECTION — this fixes a mistyped entry on the SAME record.
              If the training was actually taken again, close this and use <b>+ ADD TRN</b>:
              a new event must create a new row, not overwrite this one.
            </div>
          )}

          <div>
            <label style={S.label}>Pilot</label>
            <select style={S.input} value={pilotId} onChange={e => setPilotId(e.target.value)}>
              {crew.map(p => <option key={p.id} value={p.id}>{(p.code ? p.code + ' — ' : '') + (p.full_name || '')}</option>)}
            </select>
          </div>

          <div>
            <label style={S.label}>Training</label>
            <select style={S.input} value={code} onChange={e => setCode(e.target.value)}>
              {catalog.filter(c => c.active || c.code === code).map(c => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            {cat?.legal_reference && (
              <div style={{ marginTop:5, fontSize:9.5, color:C.t3, fontFamily:'var(--mono)' }}>
                {cat.source === 'REGULATION' && <span style={{ color:C.amber, marginRight:6 }}>MANDATORY</span>}
                {cat.legal_reference}
              </div>
            )}
          </div>

          {!editing && prev && !dahaYeniVar && (
            <div style={{ ...S.note, borderLeftColor:C.amber }}>
              RENEWAL — previous record expires <b>{prev.expires_at || '—'}</b> and will be marked
              SUPERSEDED. Its dates are not modified.
            </div>
          )}

          {/* GERIYE DONUK GIRIS — sistem susmaz (Ilke 1). Kayit kabul edilir ve
              listede durur, ama uyari esigini BELIRLEMEZ; belirleyen en yeni
              tarihli kayittir (Serkan, 19 Agu). Eskiden bu giris yururlukteki
              kaydi SESSIZCE devirirdi. */}
          {dahaYeniVar && (
            <div style={{ ...S.note, borderLeftColor:C.red, color:C.t1 }}>
              NOT THE LATEST RECORD — a newer {code} exists for this pilot
              (completed <b>{dahaYeniVar.completed_date}</b>, expires <b>{dahaYeniVar.expires_at || '—'}</b>).
              <br />This entry will be kept in the history, but the alert will continue to follow the
              newer record. Nothing is overwritten.
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 130px', gap:12 }}>
            <div>
              <label style={S.label}>Completed</label>
              <input style={S.input} type="date" value={completed} onChange={e => setCompleted(e.target.value)} />
            </div>
            <div>
              <label style={S.label}>Validity (mo)</label>
              <input style={S.input} value={months} disabled={!!cat?.no_expiry}
                     onChange={e => setMonths(e.target.value.replace(/[^0-9]/g, ''))} />
            </div>
          </div>

          {/* DOGUM TARIHI — YALNIZ yasa bagli kalemde (medical). Sistemde baska
              hicbir yerde tutulmaz (Serkan, KVKK). */}
          {cat?.age_dependent && (
            <div>
              <label style={S.label}>Date of birth <span style={{ color:C.t3 }}>— medical only</span></label>
              <input style={S.input} type="date" value={dob} onChange={e => setDob(e.target.value)} />
              <div style={{ marginTop:5, fontSize:9.5, color:C.t3, fontFamily:'var(--mono)', lineHeight:1.7 }}>
                {dob
                  ? <>age at examination <b>{ageAt(dob, completed)}</b> → validity <b>{autoMonths} months</b> · MED.A.045(a)(2),(a)(5)(i)</>
                  : <>enter date of birth to derive validity (12 / 6 months) — MED.A.045(a)(2)</>}
                {dobWarn && <div style={{ color:C.amber }}>⚠ differs from previous record ({prevDob})</div>}
              </div>
            </div>
          )}

          {/* Hesaplanan bitis + HANGI MADDEDEN ciktigi */}
          <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:8, padding:'12px 14px' }}>
            <div style={{ fontSize:10, letterSpacing:1.5, color:C.t2, fontFamily:'var(--mono)', marginBottom:5 }}>EXPIRES</div>
            <div style={{ fontSize:18, fontWeight:700, fontFamily:'var(--mono)',
                          color:(calc.expiresAt || cat?.no_expiry) ? C.t1 : C.red }}>
              {cat?.no_expiry ? 'NO EXPIRY' : (calc.expiresAt || 'INTERVAL NOT SET')}
            </div>
            <div style={{ marginTop:5, fontSize:9.5, color:C.t3, fontFamily:'var(--mono)', lineHeight:1.6 }}>
              ⓘ {calc.note}
            </div>
            {editing && row.expires_at && row.expires_at !== calc.expiresAt && (
              <div style={{ marginTop:6, fontSize:9.5, color:C.amber, fontFamily:'var(--mono)' }}>
                was {row.expires_at} → {calc.expiresAt || '—'}
              </div>
            )}
          </div>

          <div>
            <label style={S.label}>Issued by</label>
            <input style={S.input} value={issuedBy} onChange={e => setIssuedBy(up(e.target.value))}
                   placeholder="E.G. GOZEN AIR TRAINING ORG." />
          </div>

          {/* Esik ARTIK GIRILMEZ, gosterilir. Serbest metin kutusu 19 Agu'da
              kaldirildi: "60,30" yazilirsa CRITICAL hic olusmuyor, bitise 1 gun
              kala bile uyari amber kaliyordu. Serkan: "ayni kalsin, degismesin."
              Sayilar ve renkler TrainingRules'tan basilir — ekranda gorunen ile
              hesabin kullandigi ayrisamaz (Ilke 3). */}
          <div>
            <label style={S.label}>Alerts <span style={{ color:C.t3 }}>— fixed</span></label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {[['NOTICE', `${ALERT_DAYS.NOTICE}\u2013${ALERT_DAYS.WARNING} D`],
                ['WARNING', `${ALERT_DAYS.WARNING}\u2013${ALERT_DAYS.CRITICAL} D`],
                ['CRITICAL', `${ALERT_DAYS.CRITICAL}\u20130 D`],
                ['EXPIRED', 'EXPIRED']].map(([st, txt]) => (
                <span key={st} style={{ padding:'2px 9px', fontSize:9, letterSpacing:1,
                                        fontWeight:700, fontFamily:'var(--mono)',
                                        border:`1px solid ${STATE_COLOR[st]}`, color:STATE_COLOR[st] }}>
                  {txt}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label style={S.label}>Notes</label>
            <input style={S.input} value={notes} onChange={e => setNotes(up(e.target.value))}
                   placeholder="E.G. EXTENSION APPLIED" />
            <div style={{ marginTop:5, fontSize:9.5, color:C.t3, fontFamily:'var(--mono)' }}>
              ⚠ operational note only — do not enter health information
            </div>
          </div>

          <div>
            <label style={S.label}>
              Reason {editing ? <span style={{ color:C.red }}>— required</span> : <span style={{ color:C.t3 }}>— optional</span>}
            </label>
            <input style={S.input} value={reason} onChange={e => setReason(up(e.target.value))}
                   placeholder={editing ? 'E.G. DATE MISTYPED, CORRECTED FROM CERTIFICATE' : ''} />
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button style={S.btnS} onClick={onClose}>CANCEL</button>
            <button style={S.btnP} onClick={save} disabled={saving}>
              {saving ? 'SAVING...' : editing ? 'SAVE CORRECTION' : (prev ? 'RENEW' : 'SAVE')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
