// AdminPanel.js — GO2 eFB Admin Panel v3
import React, { useState, useEffect, useCallback } from 'react';
import FlightReport from './FlightReport';
import FTLPanel from './FTLPanel';
import { toMin as ftlToMin, fmtMin as ftlFmtMin } from './FTLEngine';
import { normTime, normDuration, up } from './inputFormat';
import { supabase } from '../supabaseClient';
import { RiskSurvey, AssessmentHistory } from './RiskSurvey';
import PlanDocuments from './PlanDocuments';
import Drawer from './Drawer';
import AdminHelp from './AdminHelp';
import { isEnabled } from './featureCatalog';
import { askReason, withReason, setReasonOpener } from '../editReason';
import ThemeToggle from './ThemeToggle';
import OpsCalculator from './OpsCalculator';

// ─── Font Controls ────────────────────────────────────────────
const FONT_KEY = 'efb_font_size';
const FONT_DEF = 15;
const FONT_MIN = 12;
const FONT_MAX = 24;
function applyFont(size) {
  document.documentElement.style.zoom = (size / FONT_DEF).toString();
  localStorage.setItem(FONT_KEY, size);
}
export function FontControls() {
  const [size, setSize] = React.useState(() => parseInt(localStorage.getItem(FONT_KEY) || FONT_DEF));
  const change = (d) => { const n = Math.min(FONT_MAX, Math.max(FONT_MIN, size + d)); setSize(n); applyFont(n); };
  return (
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <button onClick={() => change(-1)} style={{ width:28, height:28, background:"transparent", border:"1px solid var(--border)", borderRadius:6, color:"var(--t2)", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit" }}>−</button>
      <span style={{ fontSize:11, color:"var(--t3)", minWidth:22, textAlign:"center", fontFamily:"var(--mono)" }}>{size}</span>
      <button onClick={() => change(+1)} style={{ width:28, height:28, background:"transparent", border:"1px solid var(--border)", borderRadius:6, color:"var(--t2)", fontSize:16, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"inherit" }}>+</button>
    </div>
  );
}



// Tema token eşlemesi — gerçek renkler App.css'te (koyu/açık)
const C = {
  bg:'var(--bg)',bg2:'var(--bg2)',bg3:'var(--bg3)',border:'var(--border)',border2:'var(--border2)',
  accent:'var(--accent)',accentDim:'var(--accent-soft)',t1:'var(--t1)',t2:'var(--t2)',t3:'var(--t3)',
  green:'var(--green)',greenDim:'var(--green-soft)',red:'var(--red)',redDim:'var(--red-soft)',
  blue:'var(--accent)',blueDim:'var(--accent-soft)',
};
const S = {
  navItem:(a)=>({padding:'11px 16px',cursor:'pointer',display:'flex',alignItems:'center',gap:10,borderLeft:`3px solid ${a?C.accent:'transparent'}`,background:a?`var(--accent-soft)`:'transparent',borderBottom:`1px solid ${C.border}`,transition:'all 0.15s'}),
  navLabel:(a)=>({fontSize:14,fontWeight:a?700:500,color:a?C.accent:C.t1,letterSpacing:0.5,fontFamily:'var(--mono)',textTransform:'uppercase'}),
  navIcon:{fontSize:16,width:20,textAlign:'center'},
  label:{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',fontFamily:'var(--mono)'},
  table:{width:'100%',borderCollapse:'collapse',fontSize:11},
  th:{padding:'10px 14px',textAlign:'left',fontSize:11,color:C.t3,fontWeight:700,letterSpacing:1.2,textTransform:'uppercase',borderBottom:`1px solid ${C.border}`,fontFamily:'var(--mono)',background:C.bg3,position:'sticky',top:0,zIndex:1},
  td:{padding:'12px 14px',borderBottom:`1px solid var(--line-soft)`,color:C.t1,fontFamily:'var(--mono)',fontSize:13,fontWeight:500,verticalAlign:'middle'},
  badge:(c)=>({display:'inline-block',padding:'2px 8px',fontSize:11,letterSpacing:1,fontWeight:700,fontFamily:'var(--mono)',borderRadius:5,background:c==='green'?C.greenDim:c==='red'?C.redDim:c==='blue'?C.blueDim:'var(--amber-soft)',color:c==='green'?'var(--green)':c==='red'?'var(--red)':c==='blue'?'var(--accent)':'var(--amber)',border:`1px solid var(--line-soft)`}),
  input:{width:'100%',background:'var(--input-bg)',border:`1px solid ${C.border}`,borderRadius:6,color:'var(--t1)',padding:'9px 12px',fontSize:14,fontFamily:'var(--mono)',outline:'none',boxSizing:'border-box'},
  select:{width:'100%',background:'var(--input-bg)',border:`1px solid ${C.border}`,borderRadius:6,color:'var(--t1)',padding:'9px 12px',fontSize:14,fontFamily:'var(--mono)',outline:'none',boxSizing:'border-box',appearance:'none'},
  btnPrimary:{background:C.accent,color:'#fff',border:'none',borderRadius:6,padding:'10px 18px',fontSize:12,fontFamily:'var(--mono)',fontWeight:700,letterSpacing:1.2,cursor:'pointer',textTransform:'uppercase'},
  btnSecondary:{background:'none',color:'var(--t2)',border:`1px solid ${C.border2}`,borderRadius:6,padding:'8px 14px',fontSize:12,fontFamily:'var(--mono)',cursor:'pointer',letterSpacing:1},
  btnDanger:{background:'none',color:C.red,border:'1px solid var(--red-soft)',borderRadius:6,padding:'8px 14px',fontSize:12,fontFamily:'var(--mono)',cursor:'pointer',letterSpacing:1},
  formGroup:{marginBottom:16},
  formLabel:{display:'block',fontSize:11,color:'var(--t2)',letterSpacing:1,fontWeight:700,textTransform:'uppercase',fontFamily:'var(--mono)',marginBottom:6},
  modal:{position:'fixed',inset:0,background:'var(--backdrop)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200},
  modalBox:{background:C.bg2,border:`1px solid ${C.border2}`,borderRadius:10,padding:28,minWidth:'min(400px,90vw)',maxWidth:560,width:'90%',maxHeight:'85vh',overflowY:'auto',boxShadow:'var(--shadow)'},
  toast:(t)=>({position:'fixed',bottom:24,right:24,background:t==='error'?C.redDim:C.greenDim,border:`1px solid ${t==='error'?'var(--red-soft)':'var(--green-soft)'}`,borderRadius:8,color:t==='error'?'var(--red)':'var(--green)',padding:'10px 18px',fontSize:11,fontFamily:'var(--mono)',zIndex:1000,letterSpacing:1}),
};

function Toast({msg,type,onClose}){
  useEffect(()=>{const t=setTimeout(onClose,3500);return()=>clearTimeout(t);},[onClose]);
  if(!msg)return null;
  return <div style={S.toast(type)}>{type==='error'?'! ':'OK '}{msg}</div>;
}
// SUPER ADMIN EDIT GEREKCESI — kendi tasarim dilimizle (11 Agu 2026).
// Once tarayicinin window.prompt kutusu kullaniliyordu; Serkan: "acilan hucre
// bizim tasarim ogelerimize uygun degil", "tek satir degil bir hucre acilmali",
// "renk kodlari da uygun olmali, butunluk ariyoruz".
// Bu yuzden: uygulamanin kendi Modal'i, kendi S/C stilleri, COK SATIRLI hucre.
// Hicbir renk elle yazilmaz — hepsi C/S uzerinden gelir.
//
// Promise ile calisir: cagri yerleri `const sb = await askReason(...)` seklinde
// AYNEN kalir; bu bilesen yalnizca kutuyu acip gerekceyi dondurur.
function EditReasonGate(){
  const [ask,setAsk]=useState(null);      // {what, resolve}
  const [text,setText]=useState('');

  useEffect(()=>{
    setReasonOpener((what)=>new Promise(resolve=>{ setText(''); setAsk({what,resolve}); }));
    return ()=>setReasonOpener(null);
  },[]);

  if(!ask) return null;
  const close=(v)=>{ ask.resolve(v); setAsk(null); setText(''); };
  const ok = text.trim().length>=3;

  return (
    <Modal title="CHANGE REPORT — REQUIRED" onClose={()=>close(null)} width={520}>
      <div style={{fontSize:11,color:C.t2,lineHeight:1.8,marginBottom:14}}>
        You are about to change <span style={{color:C.accent,fontWeight:700}}>{ask.what}</span> in a
        customer's data. Write what you are doing and why.
        <div style={{color:C.t3,marginTop:6}}>
          This report is stored in the customer's own log records — they will see that the app owner made this change.
        </div>
      </div>
      <div style={S.formGroup}>
        <label style={S.formLabel}>REASON *</label>
        <textarea
          style={{...S.input, minHeight:110, resize:'vertical', lineHeight:1.7, padding:'10px 12px'}}
          value={text} onChange={e=>setText(e.target.value)} autoFocus
          placeholder="e.g. Fleet setup for the demo tenant — aircraft added at the operator's request."/>
        <div style={{fontSize:10,color:ok?C.t3:C.red,marginTop:6}}>
          {ok ? `${text.trim().length} characters` : 'At least 3 characters — without a reason the change will not be applied.'}
        </div>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:18}}>
        <button style={S.btnSecondary} onClick={()=>close(null)}>CANCEL</button>
        <button style={S.btnPrimary} disabled={!ok} onClick={()=>close(text.trim())}>SAVE CHANGE</button>
      </div>
    </Modal>
  );
}

function Modal({title,children,onClose,width}){
  return(
    <div style={S.modal} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{...S.modalBox,...(width?{minWidth:`min(${width}px,90vw)`}:{})}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20,paddingBottom:10,borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:11,color:C.accent,letterSpacing:3,fontWeight:700,fontFamily:'var(--mono)',textTransform:'uppercase'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:18}}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function DetailPanel({title,children,onClose,width}){
  if(!children)return null;
  return(
    <div style={{width:width||360,maxWidth:'92vw',background:C.bg2,borderLeft:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden'}}>
      <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:10,color:C.accent,fontWeight:700,letterSpacing:2,fontFamily:'var(--mono)',textTransform:'uppercase'}}>{title}</span>
        <button onClick={onClose} style={{background:'none',border:'none',color:C.t3,cursor:'pointer',fontSize:16}}>x</button>
      </div>
      <div style={{flex:1,overflowY:'auto'}}>{children}</div>
    </div>
  );
}
function DetailRow({label,value,accent}){
  return(
    <div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <span style={{fontSize:14,color:'var(--t1)',fontWeight:700,letterSpacing:1,fontFamily:'var(--mono)',textTransform:'uppercase'}}>{label}</span>
      <span style={{fontSize:15,color:accent?C.accent:'var(--t1)',fontFamily:'var(--mono)',fontWeight:700}}>{value||'—'}</span>
    </div>
  );
}

const ACTION_META = {
  PLAN_RELEASED:              {icon:'>>',label:'Plan Released',          color:'var(--amber)'},
  PLAN_DOWNLOADED:            {icon:'<<',label:'Plan Downloaded',        color:'var(--accent)'},
  CREW_ASSIGNED:              {icon:'**',label:'Crew Assigned',          color:'var(--accent)'},
  PREFLIGHT_MANDATORY_COMPLETE:{icon:'OK',label:'Mandatory Complete',    color:'var(--green)'},
  MANDATORY_CHECK_DONE:       {icon:'[x]',label:'Check Done',            color:'var(--green)'},
  MANDATORY_CHECK_UNDONE:     {icon:'[ ]',label:'Check Undone',          color:'var(--orange)'},
  MANDATORY_SIGNED:           {icon:'///',label:'Mandatory Signed',      color:'var(--green)'},
  FUEL_CHECKED:               {icon:'F',  label:'Fuel Checked',          color:'var(--green)'},
  PLAN_ACCEPTED:              {icon:'SIG',label:'Plan Accepted & Signed',color:'var(--green)'},
  PLAN_ACCEPTANCE_REVOKED:    {icon:'REV',label:'Acceptance Revoked',    color:'var(--red)'},
  SYNC_TO_PM:                 {icon:'<>',label:'Synced to PM',           color:'var(--accent)'},
  TKOF_RWY_SELECTED:          {icon:'RWY',label:'T/O Runway Selected',  color:'var(--accent)'},
  TKOF_ATIS_ENTERED:          {icon:'ATI',label:'DEP ATIS Entered',      color:'var(--accent)'},
  TKOF_SPEEDS_ENTERED:        {icon:'V',  label:'T/O Speeds (V1/VR/V2)',color:'var(--amber)'},
  TKOF_ATC_CLR:               {icon:'ATC',label:'ATC Clearance',         color:'var(--accent)'},
  TKOF_RVSM_GROUND:           {icon:'RVG',label:'RVSM Ground Check',     color:'var(--green)'},
  OFF_BLOCKS:                 {icon:'OFB',label:'Off Blocks',            color:'var(--amber)'},
  TAKEOFF:                    {icon:'T/O',label:'Takeoff',               color:'var(--amber)'},
  RVSM_CHECK:                 {icon:'RVC',label:'RVSM Check',            color:'var(--accent)'},
  GPS_ACTIVATED:              {icon:'GPS',label:'GPS Activated',         color:'var(--green)'},
  LANDING:                    {icon:'LND',label:'Landing',               color:'var(--amber)'},
  ON_BLOCKS:                  {icon:'ONB',label:'On Blocks',             color:'var(--amber)'},
  FUEL_REMAINING:             {icon:'FR', label:'Fuel Remaining',        color:'var(--green)'},
  LND_RWY_SELECTED:           {icon:'RWY',label:'LND Runway Selected',  color:'var(--accent)'},
  LND_ATIS_ENTERED:           {icon:'ATI',label:'ARR ATIS Entered',      color:'var(--accent)'},
  LND_PERF_DATA:              {icon:'LW', label:'LND Perf Data',         color:'var(--amber)'},
  FLIGHT_ARCHIVED:            {icon:'ARC',label:'Flight Archived',       color:'var(--green)'},
  ADMIN_EDIT:                 {icon:'EDT',label:'Admin Edit',            color:'var(--red)'},
  PLAN_ACTIVATED:             {icon:'>',  label:'Plan Activated',        color:'var(--accent)'},
  LND_QNH_ENTERED:            {icon:'QNH',label:'ARR QNH Entered',       color:'var(--accent)'},
};

// ─── Module Log View — denetci-okunur pilot hareket dokumu ──────────────────
// Modul baslıklari altinda satirlar: SAAT + ne yapildi + [girilen deger] + KIM (ad soyad).
// Teknik id gosterilmez. Realtime: yeni log satiri saniyesinde ekrana duser
// (flight_logs publication'a ekli olmali); 30s polling yedek olarak kalir.

const MODULE_ORDER = ['PLAN','FLT CREW','MANDATORY','eFP','FUEL','RAAQ','ACCEPT & SIGN','T/O DATA','NAV LOG','LND DATA','END FLT','DOC UPLOAD','OTHER'];

// iOS ModuleKey rawValue -> ekran adi (MODULE_COMPLETE icin)
const MODULE_KEY_MAP = {
  'flight-crew':'FLT CREW', mandatory:'MANDATORY', efp:'eFP', fuel:'FUEL', rass:'RAAQ',
  'accept-sign':'ACCEPT & SIGN', todata:'T/O DATA', navlog:'NAV LOG', lnddata:'LND DATA',
  endflt:'END FLT', docupload:'DOC UPLOAD',
};

const ACTION_MODULE = {
  PLAN_RELEASED:'PLAN', PLAN_DOWNLOADED:'PLAN', PLAN_ACTIVATED:'PLAN', PLAN_DEACTIVATED:'PLAN',
  CZIB_CHECKED:'FLT CREW', CREW_ASSIGNED:'FLT CREW',
  MANDATORY_CHECK_DONE:'MANDATORY', MANDATORY_CHECK_UNDONE:'MANDATORY',
  MANDATORY_SIGNED:'MANDATORY', PREFLIGHT_MANDATORY_COMPLETE:'MANDATORY',
  OFP_OPENED:'eFP', OFP_MARKUP:'eFP', WXR_REFRESHED:'eFP', NOTAM_SEEN:'eFP',
  FUEL_CHECKED:'FUEL',
  RASS_REVIEWED:'RAAQ',
  PLAN_ACCEPTED:'ACCEPT & SIGN', PLAN_ACCEPTANCE_REVOKED:'ACCEPT & SIGN', SYNC_TO_PM:'ACCEPT & SIGN',
  TKOF_RWY_SELECTED:'T/O DATA', TKOF_ATIS_ENTERED:'T/O DATA', TKOF_SPEEDS_ENTERED:'T/O DATA',
  TKOF_ATC_CLR:'T/O DATA', TKOF_RVSM_GROUND:'T/O DATA',
  OFF_BLOCKS:'NAV LOG', TAKEOFF:'NAV LOG', RVSM_CHECK:'NAV LOG', GPS_ACTIVATED:'NAV LOG',
  LANDING:'NAV LOG', ON_BLOCKS:'NAV LOG', FUEL_REMAINING:'NAV LOG', DIVERT_SET:'NAV LOG',
  LND_RWY_SELECTED:'LND DATA', LND_ATIS_ENTERED:'LND DATA', LND_QNH_ENTERED:'LND DATA', LND_PERF_DATA:'LND DATA',
  FLIGHT_ARCHIVED:'END FLT',
  DOC_UPLOADED:'DOC UPLOAD', DOC_DELETED:'DOC UPLOAD',
  // 11 Agu 2026 — iOS'un urettigi 41 eylemin 22'si buraya hic yazilmamisti ve
  // OTHER'a dusuyordu; emniyetle ilgili olanlar da (RVSM/LMC/rejected) dahil.
  // Cogu 9 Agu'da iOS'a eklendi, okuyucu guncellenmedi.
  DIRECT_TO_SET:'NAV LOG', DIRECT_TO_CLEARED:'NAV LOG',
  WPT_ADDED:'NAV LOG', WPT_DELETED:'NAV LOG',
  NAVLOG_ATA_AUTO:'NAV LOG', NAVLOG_ATA_AUTO_REJECTED:'NAV LOG',
  NAVLOG_ATA_AHEAD_CONFIRMED:'NAV LOG', NAVLOG_ENTRY_REJECTED:'NAV LOG',
  NAVLOG_CHECK_ALARM:'NAV LOG', NAVLOG_LEG_LEAK_REPAIRED:'NAV LOG',
  ROUTE_ADDED_FROM_FMS:'NAV LOG', ROUTE_FMS_PHOTO_READ:'NAV LOG',
  RVSM_DIFF_EXCEEDED:'NAV LOG',   // NavLogView.swift:1812 — ucus ici. Yerdeki karsiligi TKOF_RVSM_GROUND.
  OEO_DP_LOADED:'T/O DATA', LMC_LIMIT_EXCEEDED:'T/O DATA',
  ARCHIVE_ALREADY_ON_SERVER:'END FLT', ARCHIVE_WB_WARNING_ACCEPTED:'END FLT',
  SYNC_ARCHIVE_NOTICE:'END FLT',   // olayin kendisi arsiv bildirimi; tipe bakmaya gerek yok
};

// iOS SyncType (SyncModels.swift:36) -> ekran adi. Serkan kurali (11 Agu):
// "sync hangi modul icinde atildiysa orda gorunebilir".
// TAM eslesme: bes degerin besi de yazili. Eskiden yalniz NAVLOG ve ENDFLIGHT
// taniniyor, GERI KALAN HEPSI ternary'nin else'i ile sessizce ACCEPT & SIGN'a
// yaziliyordu — ARCHIVED ve SIDEBAR yanlis modulde gorunuyordu (Ilke 1: bilmedigini
// biliyormus gibi yazma). Yeni bir SyncType eklenirse burada yoktur, OTHER'a duser.
const SYNC_TYPE_MODULE = {
  HANDOFF:  'ACCEPT & SIGN',
  NAVLOG:   'NAV LOG',
  ENDFLIGHT:'END FLT',
  ARCHIVED: 'END FLT',
  SIDEBAR:  'OTHER',   // sol menuden atilir, bir modulun ICINDEN degil — dogru yeri OTHER
};

function logModule(l){
  const d = l.details || {};
  if (l.action === 'FIELD_ENTRY')     return d.module || 'OTHER';
  // MODULE_ENTRIES (iOS, 9 Agu: modulden CIKISTA tek satir) MODULE_COMPLETE ile
  // ayni yoldan gecer — ikisi de details.module icinde ModuleKey rawValue tasir.
  if (l.action === 'MODULE_COMPLETE' ||
      l.action === 'MODULE_ENTRIES')  return MODULE_KEY_MAP[d.module] || 'OTHER';
  // SYNC_SENT gonderende, SYNC_APPLIED alicida; ikisi de yukunde `type` tasir.
  // SYNC_FAILED de 12 Agu 2026'dan (iOS build 43) itibaren tasiyor. Eski
  // tabletlerden gelen ve gecmiste yazilmis kayitlarda `type` YOKTUR:
  // SYNC_TYPE_MODULE[undefined] -> undefined -> 'OTHER'. Yani bu satir geriye
  // donuk guvenlidir; eski kayitlar bugunku yerlerinde kalir.
  // SYNC_DECLINED / SYNC_APPLIED_WITH_LOSS hala tasimiyor -> OTHER'da kalirlar.
  // Uydurulmaz: reddetme aninda iOS yalnizca SyncInvite'i goruyor, o da `kind`
  // olarak "SYNC"|"ARCHIVED" tasiyor, modulu bilmiyor (Ilke 1).
  if (l.action === 'SYNC_SENT' ||
      l.action === 'SYNC_FAILED' ||
      l.action === 'SYNC_APPLIED')    return SYNC_TYPE_MODULE[d.type] || 'OTHER';
  return ACTION_MODULE[l.action] || 'OTHER';
}

// Detay dokumu. `platform`/`timestamp_utc` her zaman elenir; cagiran ayrica
// kendi ic anahtarlarini eleyebilir (ornek MODULE_ENTRIES -> `module`, o zaten
// satirin hangi grupta durdugunu belirliyor, denetciye tekrar gosterilmez).
function detailText(d, skip = []){
  return Object.entries(d)
    .filter(([k]) => !['platform','timestamp_utc', ...skip].includes(k))
    .map(([k,v]) => `${k}: ${v}`).join(' · ');
}

// Insan cumlesi olmayan olaylar: [etiket, ton?]. Deger her zaman TAM detay
// dokumudur — denetim izinden alan kirpilmaz, yalniz basligi Turkcelestirilir.
// `tone:'warn'` olanlar emniyet olaylari: denetci turuncuyu tarayarak bulabilmeli.
const SIMPLE_LABEL = {
  DIRECT_TO_SET:['Direct to'],                  DIRECT_TO_CLEARED:['Direct to cleared'],
  WPT_ADDED:['Waypoint added'],                 WPT_DELETED:['Waypoint deleted'],
  NAVLOG_ATA_AUTO:['ATA auto'],                 NAVLOG_ATA_AUTO_REJECTED:['ATA auto rejected','warn'],
  NAVLOG_ATA_AHEAD_CONFIRMED:['ATA ahead of plan — confirmed','warn'],
  NAVLOG_ENTRY_REJECTED:['Entry rejected','warn'],
  NAVLOG_CHECK_ALARM:['Check alarm'],           NAVLOG_LEG_LEAK_REPAIRED:['Leg repaired'],
  ROUTE_ADDED_FROM_FMS:['Route added from FMS'],ROUTE_FMS_PHOTO_READ:['FMS photo read'],
  RVSM_DIFF_EXCEEDED:['RVSM difference exceeded','warn'],
  OEO_DP_LOADED:['OEO DP loaded'],              LMC_LIMIT_EXCEEDED:['LMC limit exceeded','warn'],
  ARCHIVE_ALREADY_ON_SERVER:['Archive already on server'],
  ARCHIVE_WB_WARNING_ACCEPTED:['Archived without W&B — accepted','warn'],
  SYNC_APPLIED:['Sync applied'],                SYNC_APPLIED_WITH_LOSS:['Sync applied with loss','warn'],
  SYNC_ARCHIVE_NOTICE:['Archive notice from other tablet'],
  SYNC_DECLINED:['Sync declined'],              SYNC_FAILED:['Sync failed','warn'],
};

// Her satir icin insan cumlesi: {label, value?, tone?}
// tone: 'ok' yesil, 'warn' turuncu, 'accept' vurgulu yesil
// who: pilot_id -> ad soyad cozucu (eski loglar isim yerine id tasir)
function logRow(l, who = () => null){
  const d = l.details || {};
  switch (l.action) {
    case 'FIELD_ENTRY':            return { label:`${d.field} entry`, value:d.value };
    case 'MODULE_COMPLETE':        return { label:'MODULE COMPLETE', tone:'ok' };
    case 'MANDATORY_CHECK_DONE':   return { label:`Check done — ${d.check || d.check_label || ''}` };
    case 'MANDATORY_CHECK_UNDONE': return { label:`Check UNDONE — ${d.check || d.check_label || ''}`, tone:'warn' };
    case 'MANDATORY_SIGNED':       return { label:`Signed by ${d.pilot || d.pilot_name || '—'}` };
    case 'PREFLIGHT_MANDATORY_COMPLETE': return { label:'All checks complete', tone:'ok' };
    case 'CREW_ASSIGNED':          return { label:`Crew assigned — PF ${d.pf || d.pf_name || '—'} / PM ${d.pm || d.pm_name || '—'}` };
    case 'CZIB_CHECKED':           return { label:'CZIB conflict check', value:d.result, tone:d.result==='CONFLICT'?'warn':undefined };
    case 'OFP_OPENED':             return { label:'OFP opened' };
    case 'OFP_MARKUP':             return { label:'OFP markup — pilot drew on OFP' };
    case 'WXR_REFRESHED':          return { label:'WXR updated (live)', value:d.airports };
    case 'NOTAM_SEEN':             return { label:'NOTAM reviewed' };
    case 'FUEL_CHECKED':           return { label:'Fuel checked', value:d.fob_lb ? `FOB ${d.fob_lb} lb` : undefined };
    case 'RASS_REVIEWED':          return { label:`${d.airport || 'Airport'} risk reviewed`, value:d.risk };
    case 'PLAN_ACCEPTED': {
      // Eski loglar isim degil id tasir -> profiles'tan coz.
      const pic = d.pic || who(d.pic_id) || d.pic_name || '—';
      const sic = d.sic || who(d.sic_id) || '';
      return { label:`PLAN ACCEPTED — READY FOR FLIGHT · PIC ${pic}${sic ? ` / SIC ${sic}` : ''}`, tone:'accept' };
    }
    case 'PLAN_ACCEPTANCE_REVOKED':return { label:'Acceptance REVOKED', tone:'warn' };
    case 'SYNC_SENT':              return { label:'Data synced to other EFB' };
    case 'SYNC_TO_PM':             return { label:'Synced to PM' };
    case 'DIVERT_SET':             return { label:`DIVERT to ${d.to || '?'} (from ${d.from || '?'})`, tone:'warn' };
    case 'FLIGHT_ARCHIVED': {
      // Eski web formati: dep/dest + dakika sayilari; yeni iOS: route + hazir metin.
      const route = d.route || (d.dep && d.dest ? `${d.dep} → ${d.dest}` : '');
      const hm = x => (x || x === 0) ? `${Math.floor(x/60)}:${String(x%60).padStart(2,'0')}` : null;
      const t = d.flight_time ? `FLT ${d.flight_time} · BLK ${d.block_time}`
              : hm(d.airborne_minutes) ? `FLT ${hm(d.airborne_minutes)} · BLK ${hm(d.block_minutes)}` : undefined;
      return { label:`Flight archived${route ? ` — ${route}` : ''}`, value:t, tone:'ok' };
    }
    case 'DOC_UPLOADED':           return { label:'Document uploaded', value:d.file };
    case 'DOC_DELETED':            return { label:'Document DELETED', value:d.file, tone:'warn' };
    case 'PLAN_ACTIVATED':         return { label:'Plan activated', value:d.route };
    case 'PLAN_DEACTIVATED':       return { label:'Plan deactivated', value:d.route, tone:'warn' };
    case 'PLAN_DOWNLOADED':        return { label:'Plan downloaded' };
    case 'PLAN_RELEASED':          return { label:'Plan released by dispatch' };
    case 'OFF_BLOCKS':             return { label:'Off blocks', value:d.time };
    case 'TAKEOFF':                return { label:'Takeoff', value:d.time };
    case 'LANDING':                return { label:'Landing', value:d.time };
    case 'ON_BLOCKS':              return { label:'On blocks', value:d.time };
    case 'FUEL_REMAINING':         return { label:'Fuel remaining', value:d.fuel_lb ? `${d.fuel_lb} lb` : undefined };
    // Modulden cikista girilenler/degisenler (eski → yeni). `module` elenir.
    case 'MODULE_ENTRIES':         return { label:'Entries', value:detailText(d, ['module']) || undefined };
    default: {
      const detail = detailText(d);
      const simple = SIMPLE_LABEL[l.action];
      if (simple) return { label: simple[0], value: detail || undefined, tone: simple[1] };
      const meta = ACTION_META[l.action];
      return { label: meta ? meta.label : l.action.replace(/_/g,' '), value: detail || undefined };
    }
  }
}

// Log sirasi: kronolojik; AYNI saniye icinde MODULE_COMPLETE her zaman SONA.
// (iOS, tamamlayici girisle COMPLETE'i ayni saniyede loglar; ms sirasi bazen
// ters duser — denetci "giris -> complete" akisini gormeli. Damga degismez,
// yalniz gosterim sirasi duzeltilir.)
function logOrder(a, b) {
  const ta = new Date(a.created_at).getTime(), tb = new Date(b.created_at).getTime();
  const sa = Math.floor(ta / 1000), sb = Math.floor(tb / 1000);
  if (sa !== sb) return ta - tb;
  const ca = a.action === 'MODULE_COMPLETE' ? 1 : 0, cb = b.action === 'MODULE_COMPLETE' ? 1 : 0;
  if (ca !== cb) return ca - cb;
  return ta - tb;
}

function ModuleLogView({ planId, live=false }) {
  const [logs,setLogs]=useState([]);
  const [loading,setLoading]=useState(true);
  const [pilots,setPilots]=useState([]);
  const [expanded,setExpanded]=useState(()=>new Set());   // acilmis xN gruplari

  useEffect(()=>{ supabase.from('profiles').select('id,full_name,code').then(({data})=>setPilots(data||[])); },[]);
  const who = id => { if (!id) return null; const p = pilots.find(x=>x.id===id); return p ? p.full_name : null; };

  const load = useCallback(async () => {
    if (!planId) return;
    const { data } = await supabase.from('flight_logs').select('*').eq('plan_id', planId).order('created_at', { ascending: true });
    setLogs((data || []).slice().sort(logOrder));
    setLoading(false);
  }, [planId]);

  // Ilk yukleme + canli ucusta 30s polling (Realtime yedegi)
  useEffect(() => { setLoading(true); load(); if (!live) return; const iv = setInterval(load, 30000); return () => clearInterval(iv); }, [load, live]);

  // Realtime: yeni log satiri saniyesinde eklenir
  useEffect(() => {
    if (!planId) return;
    const ch = supabase.channel(`flt-logs-${planId}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'flight_logs', filter:`plan_id=eq.${planId}` },
        payload => setLogs(prev => prev.some(x => x.id === payload.new.id)
          ? prev
          : [...prev, payload.new].sort(logOrder)))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [planId]);

  const mono = { fontFamily:'var(--mono)' };
  const fmtT = iso => { const dt = new Date(iso); return `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')} ${dt.toISOString().slice(11,19)}Z`; };
  const toneColor = t => t === 'ok' ? 'var(--green)' : t === 'warn' ? 'var(--orange)' : t === 'accept' ? 'var(--green)' : C.t1;

  if (loading) return <div style={{padding:20,color:C.t3,fontSize:11,textAlign:'center',...mono}}>LOADING LOGS...</div>;
  if (!logs.length) return <div style={{padding:20,color:C.t3,fontSize:11,textAlign:'center',...mono}}>NO LOG ENTRIES</div>;

  // Modul basina grupla, sabit operasyonel sirada goster
  const groups = {};
  for (const l of logs) { const m = logModule(l); (groups[m] = groups[m] || []).push(l); }
  const ordered = MODULE_ORDER.filter(m => groups[m]?.length);

  return (
    <div style={{height:'100%',overflowY:'auto',padding:'12px 16px'}}>
      {live && (
        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:12}}>
          <div style={{width:7,height:7,borderRadius:4,background:'var(--green)',boxShadow:'0 0 6px rgba(64,208,128,0.6)'}}/>
          <span style={{fontSize:10,color:'var(--green)',...mono,letterSpacing:1}}>LIVE</span>
          <span style={{marginLeft:'auto',fontSize:10,color:C.t3,...mono}}>{logs.length} entries</span>
        </div>
      )}
      {ordered.map(m => {
        // Denetci akisi (log politikasi): "girisler -> module complete".
        // COMPLETE, modul yesile dondugu ANDA damgalanir; pilot son alani yazmayi
        // bitirmeden dusebilir (orn. FOB debounce'u COMPLETE'ten sonra loglanir).
        // Damga DEGISMEZ; yalniz gosterimde COMPLETE kendi grubunun SONUNA alinir.
        const glogs = groups[m].slice().sort((a, b) =>
          ((a.action === 'MODULE_COMPLETE' ? 1 : 0) - (b.action === 'MODULE_COMPLETE' ? 1 : 0)) || logOrder(a, b));
        const complete = glogs.find(l => l.action === 'MODULE_COMPLETE');
        return (
          <div key={m} style={{marginBottom:14,border:`1px solid ${C.border}`,borderRadius:8,overflow:'hidden'}}>
            <div style={{padding:'7px 12px',background:C.bg3,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:11,fontWeight:700,letterSpacing:2,color:C.accent,...mono}}>{m}</span>
              {complete && (
                <span style={{fontSize:9,fontWeight:700,color:'var(--green)',background:'rgba(74,222,128,0.12)',padding:'2px 8px',borderRadius:4,...mono}}>
                  COMPLETE {fmtT(complete.created_at)}
                </span>
              )}
              <span style={{marginLeft:'auto',fontSize:9,color:C.t3,...mono}}>{groups[m].length}</span>
            </div>
            {(() => {
              // Ardisik AYNI satirlar (etiket+deger) tek satirda toplanir (xN),
              // tiklayinca tum zamanlar acilir. Eski test dongulerinin tekrarlari
              // (5x PLAN ACCEPTED gibi) denetciyi bogmasin diye.
              const packed = [];
              for (const l of glogs) {
                const r = logRow(l, who);
                const last = packed[packed.length - 1];
                if (last && last.r.label === r.label && last.r.value === r.value) last.items.push(l);
                else packed.push({ r, items: [l] });
              }
              return packed.map(g => {
                const first = g.items[0], lastItem = g.items[g.items.length - 1];
                const multi = g.items.length > 1;
                const isOpen = expanded.has(first.id);
                const name = who(lastItem.pilot_id);
                const toggle = () => setExpanded(prev => { const n = new Set(prev); n.has(first.id) ? n.delete(first.id) : n.add(first.id); return n; });
                return (
                  <div key={first.id} style={{borderTop:`1px solid var(--line-soft)`,background:g.r.tone==='accept'?'rgba(74,222,128,0.06)':'transparent'}}>
                    <div onClick={multi ? toggle : undefined} style={{display:'flex',gap:10,alignItems:'baseline',padding:'5px 12px',cursor:multi?'pointer':'default'}}>
                      <span style={{fontSize:10,color:C.t3,whiteSpace:'nowrap',...mono}}>{fmtT(lastItem.created_at)}</span>
                      <span style={{fontSize:11.5,color:toneColor(g.r.tone),fontWeight:g.r.tone?700:400,...mono,flex:1}}>
                        {g.r.label}
                        {g.r.value != null && g.r.value !== '' && (
                          <span style={{color:C.accent,fontWeight:700}}> [{g.r.value}]</span>
                        )}
                        {multi && <span style={{color:C.t3,fontWeight:700}}> ×{g.items.length} {isOpen ? '▾' : '▸'}</span>}
                      </span>
                      {name && <span style={{fontSize:10,color:C.t2,whiteSpace:'nowrap',...mono}}>{name}</span>}
                    </div>
                    {multi && isOpen && g.items.map(item => (
                      <div key={item.id} style={{display:'flex',gap:10,padding:'2px 12px 2px 28px'}}>
                        <span style={{fontSize:10,color:C.t3,...mono}}>{fmtT(item.created_at)}</span>
                        {who(item.pilot_id) && <span style={{fontSize:10,color:C.t3,...mono}}>{who(item.pilot_id)}</span>}
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        );
      })}
    </div>
  );
}

function CollapsibleEditBox({ title, icon, color, logs, fields, flight, onSave, toast, user, pilots=[] }) {
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState(false);
  const [form,setForm]=useState({});
  const [reason,setReason]=useState('');
  const [saving,setSaving]=useState(false);
  const openEdit = () => { const init = {}; (fields||[]).forEach(f => { let val = flight[f.key]; if (f.type === 'time' && val) val = new Date(val).toISOString().slice(11,16); init[f.key] = val != null ? String(val) : ''; }); setForm(init); setReason(''); setEditing(true); };
  const handleSave = async () => {
    if (!reason.trim()) { toast('Reason is mandatory.', 'error'); return; }
    // Gerekce ZATEN alindi — istege baslikla tasinir, tekrar sorulmaz.
    const sb = await withReason(reason);
    if (!fields || !fields.length) return;
    setSaving(true);
    // Saatler HH:MM olarak karsilastirilir ve timestamptz'ye cevrilerek yazilir
    // (ayni kusur burada da vardi — bkz. TIME_KEYS notu).
    const cur = f => f.type === 'time' ? tsToHHMM(flight[f.key]) : String(flight[f.key] ?? '');
    const changes = fields.filter(f => String(form[f.key] || '') !== cur(f));
    if (!changes.length) { toast('No changes detected.', 'error'); setSaving(false); return; }
    const updateObj = {};
    for (const f of changes) {
      if (f.type === 'time') {
        if (!form[f.key]) { updateObj[f.key] = null; continue; }
        const iso = hhmmToTs(form[f.key], flight[f.key], flight.plans?.date,
                             f.key === 'off_blocks' ? null : (flight.off_blocks || flight.takeoff_time));
        if (!iso) { toast(`${f.label}: cannot resolve a date for "${form[f.key]}" — edit not saved.`, 'error'); setSaving(false); return; }
        updateObj[f.key] = iso;
      } else updateObj[f.key] = form[f.key] || null;
    }
    const { error: upErr } = await sb.from('archived_flights').update(updateObj).eq('id', flight.id);
    if (upErr) { toast(`Update failed: ${upErr.message}`, 'error'); setSaving(false); return; }
    for (const f of changes) { await sb.from('admin_edits').insert({ archived_flight_id: flight.id, plan_id: flight.plan_id, field_name: f.key, old_value: String(cur(f)), new_value: String(form[f.key]||''), reason, edit_type: 'EDIT', edited_by: user?.id ?? null }); }
    toast(`${changes.length} field(s) updated.`, 'success'); setSaving(false); setEditing(false); onSave();
    // TEK RAPOR: duzeltme sonrasi arsiv PDF'i duzeltme isaretleriyle yeniden uretilir
    supabase.functions.invoke('archive-flight',{body:{plan_id:flight.plan_id,regenerate_pdf:true}})
      .then(({error:e})=>toast(e?`Report PDF regen failed: ${e.message}`:'Report PDF regenerated with amendments.',e?'error':'success'));
  };
  const fmtTime = iso => iso ? new Date(iso).toISOString().slice(11,16) + ' Z' : null;
  return (
    <div style={{borderBottom:`1px solid ${C.border}`}}>
      <div onClick={() => setOpen(o=>!o)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',cursor:'pointer',background:open?`${color}08`:'transparent',borderLeft:`3px solid ${open?color:'transparent'}`}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:12,color:color,fontWeight:700,fontFamily:'var(--mono)',width:30}}>{icon}</span>
          <span style={{fontSize:12,color:open?color:C.t3,fontWeight:700,fontFamily:'var(--mono)',letterSpacing:1,textTransform:'uppercase'}}>{title}</span>
          {logs && logs.length > 0 && (<span style={{fontSize:9,color:C.t3,background:C.bg3,padding:'1px 6px',borderRadius:3,fontFamily:'var(--mono)'}}>{logs.length}</span>)}
        </div>
        <span style={{fontSize:12,color:C.t3}}>{open?'v':'^'}</span>
      </div>
      {open && (
        <div style={{background:C.bg3}}>
          {logs && logs.length > 0 && (
            <div style={{borderBottom:`1px solid ${C.border}`}}>
              {logs.map(l => { const meta = ACTION_META[l.action] || { icon:'·', label: l.action, color: C.t3 }; return (
                <div key={l.id} style={{padding:'7px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:9,color:meta.color,fontWeight:700,fontFamily:'var(--mono)',width:28,flexShrink:0,paddingTop:2}}>{meta.icon}</span>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:11,color:meta.color,fontFamily:'var(--mono)',fontWeight:700}}>{meta.label}</span><span style={{fontSize:9,color:C.t3,fontFamily:'var(--mono)'}}>{new Date(l.created_at).toLocaleTimeString('en-GB').slice(0,8)} UTC</span></div>
                    {l.details && (<div style={{fontSize:9,color:C.t3,fontFamily:'var(--mono)',marginTop:2,lineHeight:1.7}}>{Object.entries(l.details).filter(([k])=>!['platform','timestamp_utc'].includes(k)).map(([k,v])=>`${k}: ${v}`).join('  ·  ')}</div>)}
                  </div>
                </div>
              ); })}
            </div>
          )}
          {fields && fields.length > 0 && (
            <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,color:C.t3,fontWeight:700,letterSpacing:1,fontFamily:'var(--mono)',marginBottom:6}}>CURRENT VALUES</div>
              {fields.map(f => { let val = flight[f.key]; if (f.type === 'time' && val) val = fmtTime(val); if (f.type === 'pilot' && val) { const p = pilots.find(x=>x.id===val); val = p ? `${p.code} — ${p.full_name}` : val.slice(0,8)+'...'; } return (<div key={f.key} style={{display:'flex',justifyContent:'space-between',padding:'3px 0'}}><span style={{fontSize:11,color:C.t3,fontFamily:'var(--mono)'}}>{f.label}</span><span style={{fontSize:11,color:val?C.t1:'var(--t3)',fontFamily:'var(--mono)',fontWeight:700}}>{val||'—'}</span></div>); })}
            </div>
          )}
          {fields && fields.length > 0 && !editing && (<div style={{padding:'8px 16px'}}><button style={{...S.btnPrimary,fontSize:11,padding:'6px 14px'}} onClick={openEdit}>EDIT THIS SECTION</button></div>)}
          {editing && (
            <div style={{padding:'10px 16px'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                {fields.map(f => (
                  <div key={f.key}>
                    <div style={{fontSize:10,color:C.t3,fontFamily:'var(--mono)',marginBottom:3}}>{f.label}</div>
                    {f.type==='pilot'?(<select style={{...S.select,fontSize:13,padding:'6px 8px'}} value={form[f.key]||''} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))}><option value="">— Select —</option>{pilots.map(p=><option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>)}</select>):(<input style={{...S.input,fontSize:13,padding:'6px 8px'}} value={form[f.key]||''} placeholder={f.type==='time'?'HH:MM':'—'} maxLength={f.type==='time'?5:undefined} onChange={e=>setForm(p=>({...p,[f.key]:f.type==='time'?normTime(e.target.value):up(e.target.value)}))}/>)}
                  </div>
                ))}
              </div>
              <div style={{marginBottom:8}}><div style={{fontSize:10,color:C.t3,fontFamily:'var(--mono)',marginBottom:3}}>REASON *</div><textarea style={{...S.input,minHeight:56,resize:'vertical',fontSize:12}} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Mandatory: explain why..."/></div>
              <div style={{display:'flex',gap:8}}><button style={{...S.btnSecondary,fontSize:11,padding:'6px 12px'}} onClick={()=>setEditing(false)}>CANCEL</button><button style={{...S.btnPrimary,fontSize:11,padding:'6px 14px'}} onClick={handleSave} disabled={saving}>{saving?'SAVING...':'SAVE & LOG'}</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminEditsHistory({archivedFlightId, readOnly=false}){
  const [edits,setEdits]=useState([]);const[loading,setLoading]=useState(true);
  useEffect(()=>{ if(!archivedFlightId)return; (async()=>{ setLoading(true); const{data}=await supabase.from('admin_edits').select('id,created_at,edit_type,field_name,old_value,new_value,reason').eq('archived_flight_id',archivedFlightId).order('created_at',{ascending:false}); setEdits(data||[]); setLoading(false); })(); },[archivedFlightId]);
  if(loading)return<div style={{padding:'10px 16px',fontSize:11,color:C.t3,fontFamily:'var(--mono)'}}>LOADING EDIT HISTORY...</div>;
  if(!edits.length)return<div style={{padding:'10px 16px',fontSize:11,color:C.t3,fontFamily:'var(--mono)'}}>NO ADMIN EDITS ON RECORD</div>;
  return(
    <div>
      <div style={{padding:'8px 16px',background:C.bg3,borderBottom:`1px solid ${C.border}`,borderTop:`1px solid ${C.border}`}}><span style={{...S.label,color:readOnly?'var(--accent)':C.accent}}>{readOnly?'ADMIN EDIT HISTORY — READ ONLY':'EDIT HISTORY'}</span></div>
      {edits.map(e=>(
        <div key={e.id} style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,borderLeft:`3px solid ${e.edit_type==='DELETE'?C.red:C.accent}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><span style={S.badge(e.edit_type==='DELETE'?'red':'')}>{e.edit_type||'EDIT'}</span><span style={{fontSize:10,color:C.t3,fontFamily:'var(--mono)'}}>{new Date(e.created_at).toLocaleString('en-GB')}</span></div>
          {e.field_name!=='RECORD_DELETED'&&(<div style={{fontSize:11,color:C.t1,fontFamily:'var(--mono)',marginBottom:3}}><span style={{color:C.accent}}>{e.field_name}</span>{' '}<span style={{color:C.t3}}>{String(e.old_value||'—').slice(0,25)}</span>{' > '}<span style={{color:'var(--green)'}}>{String(e.new_value||'—').slice(0,25)}</span></div>)}
          <div style={{fontSize:11,color:C.t2,fontFamily:'var(--mono)',lineHeight:1.5}}><span style={{color:C.t3}}>Reason: </span>{e.reason||'—'}</div>
        </div>
      ))}
    </div>
  );
}

// ─── 1. Active FLTs ───────────────────────────────────────────────────────────
// customerId: super admin baska bir sirketi izliyorsa dolu gelir. Normal adminde
// null'dir ve filtre uygulanmaz — RLS zaten kendi sirketine kisitliyor.
function ActiveFlts({toast, customerId=null}){
  const [plans,setPlans]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selected,setSelected]=useState(null);
  const [detailTab,setDetailTab]=useState('details');
  const [pilots,setPilots]=useState([]);
  useEffect(()=>{ let q=supabase.from('profiles').select('id,full_name,code'); if(customerId){q=q.eq('customer_id',customerId);} q.then(({data})=>setPilots(data||[])); },[customerId]);
  const pilotName = id => { if (!id) return '—'; const p = pilots.find(x=>x.id===id); return p ? `${p.code} — ${p.full_name}` : id.slice(0,8)+'...'; };
  useEffect(()=>{ const load=async()=>{ setLoading(true); let q=supabase.from('plans').select('*').eq('status','active').order('created_at',{ascending:false}); if(customerId){q=q.eq('customer_id',customerId);} const{data}=await q; setPlans(data||[]); setLoading(false); }; load(); const iv=setInterval(load,30000); return()=>clearInterval(iv); },[customerId]);
  const sel=plans.find(p=>p.id===selected);
  const handleSelect = (id) => { setSelected(id===selected?null:id); setDetailTab('details'); };
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:4,background:'var(--green)',boxShadow:'0 0 8px rgba(64,208,128,0.6)'}}/><span style={S.label}>Live — refreshes every 30s</span></div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11,letterSpacing:2}}>LOADING...</div>}
        {!loading&&plans.length===0&&<div style={{padding:48,textAlign:'center',color:C.t3,fontSize:11,letterSpacing:2}}>NO ACTIVE FLIGHTS</div>}
        {plans.map(p=>(
          <div key={p.id} onClick={()=>handleSelect(p.id)} style={{padding:'14px 16px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:selected===p.id?`var(--accent-soft)`:'transparent',borderLeft:selected===p.id?`3px solid ${C.accent}`:'3px solid transparent'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><span style={{fontSize:14,fontWeight:700,color:C.accent,fontFamily:'var(--mono)',letterSpacing:1}}>{p.dep} → {p.dest}</span><span style={S.badge('green')}>ACTIVE</span></div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap'}}>{[['REG',p.reg],['TYPE',p.ac_type],['STD',p.std],['ETA',p.eta],['DISP',p.dispatch_no]].map(([l,v])=>(<div key={l}><div style={S.label}>{l}</div><div style={{fontSize:11,color:C.t2,fontFamily:'var(--mono)'}}>{v||'—'}</div></div>))}</div>
          </div>
        ))}
      </div>
      {sel&&(
        <DetailPanel title={`${sel.dep} → ${sel.dest}`} onClose={()=>setSelected(null)} width={400}>
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,background:C.bg3}}>
            {['details','timeline'].map(tab=>(<div key={tab} onClick={()=>setDetailTab(tab)} style={{flex:1,padding:'10px',textAlign:'center',cursor:'pointer',fontFamily:'var(--mono)',fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:detailTab===tab?C.accent:C.t3,borderBottom:detailTab===tab?`2px solid ${C.accent}`:'2px solid transparent',background:detailTab===tab?`var(--accent-soft)`:'transparent'}}>{tab==='timeline'?'TIMELINE':'DETAILS'}</div>))}
          </div>
          {detailTab==='details'&&(<div><DetailRow label="Route" value={`${sel.dep} → ${sel.dest}`} accent/><DetailRow label="Registration" value={sel.reg}/><DetailRow label="Type" value={sel.ac_type}/><DetailRow label="Dispatch No" value={sel.dispatch_no}/><DetailRow label="STD" value={sel.std}/><DetailRow label="ETA" value={sel.eta}/><DetailRow label="PF Pilot" value={pilotName(sel.pf_pilot)}/><DetailRow label="PM Pilot" value={pilotName(sel.pm_pilot)}/></div>)}
          {detailTab==='timeline'&&(<ModuleLogView planId={sel.id} live={true}/>)}
        </DetailPanel>
      )}
    </div>
  );
}

// ─── 2. Archived FLTs ─────────────────────────────────────────────────────────
// ── ARSIV EDIT: SAAT ALANLARI ────────────────────────────────────────────────
// archived_flights'ta bu dort kolon `timestamptz`; formda ise HH:MM gosterilir.
//
// 🔴 IKI KUSUR (2 Agu 2026, Serkan: "Update failed: invalid input syntax for
//    type timestamp with time zone: 07:11"):
//    (1) Kayitta HH:MM ham gonderiliyordu -> Postgres reddediyor.
//    (2) Degisiklik tespiti HH:MM'i tam ISO damgayla karsilastiriyordu ->
//        saat alanlari DOKUNULMASA BILE "degisti" sayiliyor, her kayit
//        denemesi bu dordunu yazmaya kalkiyor ve (1) yuzunden patliyordu.
//        Yani ATIS'i duzeltmek bile imkansizdi; admin duzeltme yolu (ve onunla
//        denetim izi kaydi) tamamen kilitliydi.
const TIME_KEYS = ['off_blocks','takeoff_time','landing_time','on_blocks'];

// 🔴 SURE ALANLARI (6 Agu 2026 saha bulgusu, Serkan): BLOCK ve FLIGHT
// veritabaninda TAMSAYI DAKIKA (`block_minutes`/`airborne_minutes`), ama form
// serbest metin gonderiyordu → "3:08" gidince Postgres
// `invalid input syntax for type integer` ile REDDEDIYOR. Sonuc: o kayitta
// HICBIR alan duzeltilemiyordu (ATIS bile), cunku UPDATE tek islem.
// Cozum: saat alanlariyla AYNI desen — formda HH:MM gosterilir/maskelenir,
// yazarken dakikaya cevrilir, karsilastirma da HH:MM uzerinden yapilir
// (yoksa dokunulmamis alan her seferinde "degisti" gorunur).
const DURATION_KEYS = ['block_minutes','airborne_minutes'];

/** dakika -> "HH:MM". Saat BASINDA SIFIR YOK — normDuration maskesiyle AYNI
 *  bicim ("3:08"). Ayrisirlarsa sahte "degisti" tespiti dogar: alan acilista
 *  "03:08" gosterip kullanici ayni degeri yeniden yazinca "3:08" olurdu ve
 *  deger hic degismedigi halde denetim izine satir yazilirdi. */
export const minsToHHMM = (m) => (m == null || m === '' || isNaN(m)) ? ''
  : `${Math.floor(Math.abs(m)/60)}:${String(Math.abs(m)%60).padStart(2,'0')}`;

/** "HH:MM" -> dakika. Cozulemezse null (SAYI UYDURULMAZ — cagiran hata verir).
 *  CIPLAK SAYI KABUL EDILMEZ: maske zaten HH:MM uretiyor; "308" gelirse bu
 *  308 dakika mi 3:08 mi belirsizdir, tahmin etmektense reddederiz. */
export const hhmmToMins = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^(\d{1,3}):([0-5]\d)$/);
  if (m) return Number(m[1])*60 + Number(m[2]);
  return null;
};

/** timestamptz -> "HH:MM" (karsilastirma ve gosterim icin tek kaynak) */
export const tsToHHMM = (v) => v ? new Date(v).toISOString().slice(11,16) : '';

/** Plan tarihi coziculeri: once ISO ("2026-08-03"), sonra OFP bicimi
 *  ("03 AUG 2026"). 🔴 4 Agu bulgusu (Serkan: bos inis saatine deger
 *  yazilamiyordu): eski kod yalniz ISO deniyordu, plans.date ise OFP
 *  bicimindedir -> Invalid Date -> null -> her deneme "cannot resolve a
 *  date" hatasi. Bicim artik acikca parse ediliyor. */
const parseFlightDate = (sVal) => {
  if (!sVal) return null;
  const iso = new Date(`${sVal}T00:00:00Z`);
  if (!isNaN(iso.getTime())) return iso;
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/.exec(String(sVal).trim());
  if (!m) return null;
  const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    .indexOf(m[2].toUpperCase());
  if (mon < 0) return null;
  return new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
};

/** "HH:MM" -> timestamptz. Tarih MEVCUT damgadan alinir (gece yarisini asan
 *  inisler dogru gunde kalir); damga yoksa ucus tarihinden (ISO veya
 *  "03 AUG 2026"). Ikisi de yoksa tarih UYDURULMAZ -> null doner, cagiran
 *  acik hata verir (Ilke 1). notBeforeIso verilirse (or. inis icin off block)
 *  sonuc ondan ONCEYE dusuyorsa +24s alinir — gece yarisini asan inis, ucus
 *  tarihinden turetilirken de dogru gune oturur. */
export const hhmmToTs = (hhmm, prevIso, flightDate, notBeforeIso) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm||'').trim());
  if (!m) return null;
  // Taban zinciri: mevcut damga -> ucus tarihi -> ayni ucusun BASKA damgasi
  // (off block). Ucuncu basamak sayesinde plan tarihi hic cozulemese bile
  // ayni ucusta dolu tek bir saat varsa tarih ondan turer (4 Agu bulgusunun
  // tum varyantlarini kapatir).
  const base = prevIso ? new Date(prevIso)
             : (parseFlightDate(flightDate) ?? (notBeforeIso ? new Date(notBeforeIso) : null));
  if (!base || isNaN(base.getTime())) return null;
  const d = new Date(base);
  d.setUTCHours(Number(m[1]), Number(m[2]), 0, 0);
  if (notBeforeIso) {
    const ref = new Date(notBeforeIso);
    if (!isNaN(ref.getTime()) && d.getTime() < ref.getTime()) {
      d.setTime(d.getTime() + 24 * 3600000);
    }
  }
  return d.toISOString();
};

// Arsiv EDIT formu alani.
//
// 🔴 REACT TUZAGI (2 Agu 2026, Serkan bulgusu — "her harften sonra hucreye
// tekrar tiklamak gerekiyor"): bu bilesen ArchivedFlts'in RENDER GOVDESI
// ICINDE tanimliydi. Her tus vurusunda setEditForm ebeveyni yeniden render
// ediyor, `EF` YENI BIR FONKSIYON KIMLIGI aliyor ve React onu farkli bir
// bilesen turu sanip <input>'u SOKUP YENIDEN TAKIYOR -> odak kayboluyor,
// harf basina bir tiklama. Bilesen tanimlari baska bir bilesenin icinde
// DURMAZ; disari alindi, state prop olarak geciyor.
//
// BUYUK HARF: operasyonel metin alanlari (RWY, SID, ATIS) `up` ile buyuk
// harfe cevrilir — iOS ile tek kaynak (inputFormat.js). Sayilar etkilenmez
// (rakamin buyugu kucugu yok). GEREKCE metni HARIC: o bir cumle, denetim
// kaydina oyle girer.
function EF({label,k,type='text',form,setForm}){
  const set = (val) => setForm(p=>({...p,[k]:val}));
  return (
    <div style={{marginBottom:10}}>
      <label style={S.formLabel}>{label}</label>
      {type==='toggle'?(
        <div style={{display:'flex',gap:10}}>
          {['YES','NO'].map(v=>(<button key={v} onClick={()=>set(v==='YES')} style={{...S.btnSecondary,background:form[k]===(v==='YES')?`var(--accent-soft)`:'none',borderColor:form[k]===(v==='YES')?C.accent:C.border2,color:form[k]===(v==='YES')?C.accent:C.t2}}>{v}</button>))}
        </div>
      ):(<input style={S.input} value={form[k]||''}
          type={(type==='time'||type==='duration')?'text':type}
          placeholder={(type==='time'||type==='duration')?'HH:MM':undefined}
          maxLength={type==='time'?5:type==='duration'?7:undefined}
          onChange={e=>set(type==='time'?normTime(e.target.value)
                          :type==='duration'?normDuration(e.target.value)
                          :up(e.target.value))}/>)}
    </div>
  );
}

// customerId : sorgu kapsami (her zaman dolu — kendi sirketin ya da izlenen sirket)
// readOnly   : YALNIZ super admin baska sirketi izlerken true
function ArchivedFlts({toast,user,customerId=null,readOnly=false}){
  const[flights,setFlights]=useState([]);
  const[loading,setLoading]=useState(true);
  const[selected,setSelected]=useState(null);
  const[detailTab,setDetailTab]=useState('details');
  const[filter,setFilter]=useState({route:''});
  const[editModal,setEditModal]=useState(false);
  const[deleteModal,setDeleteModal]=useState(false);
  const[regen,setRegen]=useState(false);
  const[editForm,setEditForm]=useState({});
  const[deleteReason,setDeleteReason]=useState('');
  const[saving,setSaving]=useState(false);
  const[planLogs,setPlanLogs]=useState([]);
  const[pilots,setPilots]=useState([]);

  useEffect(()=>{ let q=supabase.from('profiles').select('id,full_name,code').order('full_name'); if(customerId){q=q.eq('customer_id',customerId);} q.then(({data})=>setPilots(data||[])); },[customerId]);
  useEffect(()=>{ setDetailTab('details'); },[selected]);

  const pilotName = id => { if (!id) return '—'; const p = pilots.find(x=>x.id===id); return p ? `${p.code} — ${p.full_name}` : id.slice(0,8)+'...'; };

  const load=useCallback(async()=>{
    setLoading(true);
    // archived_flights'ta customer_id YOK — sirket bagi plan uzerinden kurulur.
    // Filtre ISTEMCIDE yapiliyor, PostgREST'in !inner join'iyle DEGIL: inner join
    // plani silinmis YETIM arsivleri de listeden dusururdu (bugun REC'te oyle
    // kayitlar var, bilinen acik madde). Kendi sirketini izlerken yetimler
    // gorunmeye devam etsin; BASKA sirketi izlerken dusurulsunler, cunku sahibi
    // bilinmeyen kayit bir sirkete aitmis gibi gosterilemez.
    const{data,error}=await supabase.from('archived_flights')
      .select('*,plans(customer_id,dep,dest,date,reg,ac_type,dispatch_no,pf_pilot,pm_pilot)')
      .order('archived_at',{ascending:false,nullsFirst:false}).limit(200);
    if(error)console.error('ArchivedFlts:',error);
    const rows=(data||[]).filter(f=>{
      if(!f.plans) return !readOnly;                 // yetim kayit
      return !customerId || f.plans.customer_id===customerId;
    });
    setFlights(rows);setLoading(false);
  },[customerId,readOnly]);
  useEffect(()=>{load();},[load]);

  useEffect(()=>{
    const sel=flights.find(f=>f.id===selected);
    if(!sel?.plan_id){setPlanLogs([]);return;}
    supabase.from('flight_logs').select('*').eq('plan_id', sel.plan_id).order('created_at',{ascending:true}).then(({data})=>setPlanLogs(data||[]));
  },[selected,flights]);

  const filtered=flights.filter(f=>{const p=f.plans||{};return!filter.route||`${p.dep}${p.dest}`.toLowerCase().includes(filter.route.toLowerCase());});
  const sel=flights.find(f=>f.id===selected);
  const fmtMins=m=>m?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`:'—';

  const logsByCategory = {
    crew:      planLogs.filter(l=>['CREW_ASSIGNED'].includes(l.action)).slice(-1),
    mandatory: planLogs.filter(l=>['PREFLIGHT_MANDATORY_COMPLETE','MANDATORY_SIGNED'].includes(l.action)).slice(-2),
    fuel:      planLogs.filter(l=>['FUEL_CHECKED'].includes(l.action)).slice(-1),
    accepted:  planLogs.filter(l=>['PLAN_ACCEPTED','PLAN_ACCEPTANCE_REVOKED','SYNC_TO_PM'].includes(l.action)),
    tkof:      planLogs.filter(l=>['TKOF_RVSM_GROUND','TKOF_SPEEDS_ENTERED'].includes(l.action)).slice(-2),
    navlog:    planLogs.filter(l=>['OFF_BLOCKS','TAKEOFF','LANDING','ON_BLOCKS','FUEL_REMAINING'].includes(l.action)),
    lnd:       planLogs.filter(l=>['LND_PERF_DATA','LND_RWY_SELECTED'].includes(l.action)).slice(-2),
  };

  const openEdit=f=>{
    setEditForm({
      off_blocks:f.off_blocks?new Date(f.off_blocks).toISOString().slice(11,16):'',
      takeoff_time:f.takeoff_time?new Date(f.takeoff_time).toISOString().slice(11,16):'',
      landing_time:f.landing_time?new Date(f.landing_time).toISOString().slice(11,16):'',
      on_blocks:f.on_blocks?new Date(f.on_blocks).toISOString().slice(11,16):'',
      // Sure alanlari FORMDA HH:MM (kayitta dakika) — bkz. DURATION_KEYS notu.
      block_minutes:minsToHHMM(f.block_minutes),airborne_minutes:minsToHHMM(f.airborne_minutes),
      takeoff_fuel:f.takeoff_fuel||'',remaining_fuel:f.remaining_fuel||'',
      actual_lw:f.actual_lw||'',vref:f.vref||'',req_landing_dist:f.req_landing_dist||'',
      dep_rwy:f.dep_rwy||'',arr_rwy:f.arr_rwy||'',dep_atis:f.dep_atis||'',
      arr_atis:f.arr_atis||'',sid:f.sid||'',pax:f.pax||'',
      landing_count:f.landing_count||1,is_night_landing:f.is_night_landing||false,reason:'',
    });
    setEditModal(true);
  };

  const handleSaveEdit=async()=>{
    if(!editForm.reason){toast('Reason is mandatory.','error');return;}
    setSaving(true);
    const{reason,...fields}=editForm;
    // Saat alanlari HH:MM olarak KARSILASTIRILIR (ikisi de ayni bicime indirilir),
    // yoksa dokunulmamis saatler her seferinde "degisti" gorunur.
    const cur=k=>TIME_KEYS.includes(k)?tsToHHMM(sel[k])
               :DURATION_KEYS.includes(k)?minsToHHMM(sel[k])
               :String(sel[k]==null?'':sel[k]);
    // Sure alanlari DAKIKA uzerinden karsilastirilir: "3:08" ile "03:08" ayni
    // degerdir, metin olarak karsilastirmak sahte degisiklik uretirdi.
    const same=(k,v)=>DURATION_KEYS.includes(k)
      ? hhmmToMins(v)===hhmmToMins(cur(k))
      : String(v==null?'':v)===cur(k);
    const changes=Object.entries(fields).filter(([k,v])=>!same(k,v));
    if(!changes.length){toast('No changes detected.','error');setSaving(false);return;}

    // HH:MM -> timestamptz. Tarih cikarilamiyorsa YAZMA, alani isimlendirerek soyle.
    const updateObj={};
    for(const[k,v]of changes){
      if(TIME_KEYS.includes(k)){
        if(!v){updateObj[k]=null;continue;}
        const iso=hhmmToTs(v,sel[k],sel.plans?.date,k==='off_blocks'?null:(sel.off_blocks||sel.takeoff_time));
        if(!iso){toast(`${k}: cannot resolve a date for "${v}" — edit not saved.`,'error');setSaving(false);return;}
        updateObj[k]=iso;
      } else if(DURATION_KEYS.includes(k)){
        // HH:MM -> dakika. Cozulemiyorsa YAZMA ve alani ISIMLENDIREREK soyle —
        // eskiden ham metin gidip Postgres'in tip hatasina donuyordu, kullanici
        // hangi alanin bozuk oldugunu goremiyordu.
        if(v===''||v==null){updateObj[k]=null;continue;}
        const mins=hhmmToMins(v);
        if(mins==null){toast(`${k}: "${v}" is not a valid duration (use HH:MM) — edit not saved.`,'error');setSaving(false);return;}
        updateObj[k]=mins;
      } else updateObj[k]=v;
    }
    const sb=await withReason(reason);
    const{error:upErr}=await sb.from('archived_flights').update(updateObj).eq('id',sel.id);
    if(upErr){toast(`Update failed: ${upErr.message}`,'error');setSaving(false);return;}
    // Denetim izine OKUNABILIR deger yazilir: saatler HH:MM, tam ISO damga degil.
    for(const[k,v]of changes){ await sb.from('admin_edits').insert({archived_flight_id:sel.id,plan_id:sel.plan_id,field_name:k,old_value:String(cur(k)),new_value:String(v==null?'':v),reason,edit_type:'EDIT',edited_by:user?.id??null}); }
    toast(`${changes.length} field(s) updated and logged.`,'success');
    // TEK RAPOR: duzeltme sonrasi arsiv PDF'i duzeltme isaretleriyle yeniden uretilir
    supabase.functions.invoke('archive-flight',{body:{plan_id:sel.plan_id,regenerate_pdf:true}})
      .then(({error:e})=>toast(e?`Report PDF regen failed: ${e.message}`:'Report PDF regenerated with amendments.',e?'error':'success'));
    setEditModal(false);setSaving(false);load();
  };

  const handleDelete=async()=>{
    if(!deleteReason){toast('Reason is mandatory.','error');return;}
    const sb=await withReason(deleteReason);
    setSaving(true);
    await sb.from('admin_edits').insert({archived_flight_id:sel.id,plan_id:sel.plan_id,field_name:'RECORD_DELETED',old_value:String(sel.id),new_value:'DELETED',reason:deleteReason,edit_type:'DELETE',edited_by:user?.id??null});
    await sb.from('archived_flights').delete().eq('id',sel.id);
    // SOFT DELETE KALIR (Serkan kurali, 1 Agu 2026): admin bir plani ASLA kalici
    // silmez — mezar tasi denetim izinin parcasidir. Tekrar-yukleme sorunu burada
    // DEGIL, parse-plan'da cozuldu: dedup artik yalniz CANLI (available/active)
    // planlarla eslesir, 'deleted' bir kayit yeni yuklemeyi engellemez.
    if(sel.plan_id) await sb.from('plans').update({status:'deleted'}).eq('id',sel.plan_id);
    toast('Record deleted and logged.','success');
    setDeleteModal(false);setSelected(null);setDeleteReason('');setSaving(false);load();
  };

  const DETAIL_TABS = [{ id:'details', label:'DETAILS' }, { id:'logs', label:'LOGS' }, { id:'docs', label:'DOCUMENTS' }];

  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}>
          <input placeholder="Route / ICAO..." value={filter.route} onChange={e=>setFilter(p=>({...p,route:e.target.value}))} style={{...S.input,width:200}}/>
          <span style={{...S.label,marginLeft:'auto'}}>{filtered.length} RECORDS</span>
        </div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}>
          <thead><tr>{['ARCHIVED','ROUTE','REG','BLOCK','FLIGHT','LANDINGS','PF','PM'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {filtered.map(f=>{
              const p=f.plans||{};
              const pfPilot=pilots.find(x=>x.id===f.pf_id||x.id===p.pf_pilot);
              const pmPilot=pilots.find(x=>x.id===f.sic_id||x.id===p.pm_pilot);
              return(
                <tr key={f.id} className="adm-row" onClick={()=>setSelected(f.id===selected?null:f.id)} style={{cursor:'pointer',background:selected===f.id?`var(--accent-soft)`:'transparent'}}>
                  <td style={S.td}>{f.archived_at?new Date(f.archived_at).toLocaleString('en-GB'):'—'}</td>
                  <td style={{...S.td,color:C.accent,fontWeight:700}}>{p.dep||'—'} → {p.dest||'—'}</td>
                  <td style={S.td}>{p.reg||'—'}</td>
                  <td style={S.td}>{fmtMins(f.block_minutes)}</td>
                  <td style={S.td}>{fmtMins(f.airborne_minutes)}</td>
                  <td style={S.td}>{f.landing_count||'—'}</td>
                  <td style={{...S.td,color:'var(--accent)'}}>{pfPilot?pfPilot.full_name:'—'}</td>
                  <td style={{...S.td,color:'var(--t2)'}}>{pmPilot?pmPilot.full_name:'—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sel&&(
        <Drawer
          title={`${sel.plans?.dep||'—'} → ${sel.plans?.dest||'—'}`}
          subtitle={`${sel.plans?.date||'—'} · ${sel.plans?.reg||'—'} · Archived ${sel.archived_at?new Date(sel.archived_at).toLocaleString('en-GB'):'—'}`}
          onClose={()=>setSelected(null)}
          width={640}
          footer={ readOnly ? (
            // SALT OKUNUR (super admin baska sirketi izliyor). UI'da gizlemek
            // burada SUS DEGIL: REGEN REPORT bir edge function cagirir ve edge
            // function SERVICE KEY ile calisir, yani RLS onu DURDURMAZ.
            // Musterinin raporunu yeniden uretmek de bir degisikliktir.
            <div style={{flex:1,textAlign:'center',fontSize:11,color:C.t3,letterSpacing:1,fontFamily:'var(--mono)'}}>READ ONLY — SUPER ADMIN VIEW</div>
          ) : (
            <>
              <button style={{...S.btnPrimary,flex:1}} onClick={()=>openEdit(sel)}>EDIT ALL FIELDS</button>
              {/* RAPORU YENIDEN URET (6 Agu 2026, Serkan: "raporlarda geriye
                  donuk SHT/HG uyarlamasi yapacaktik, hala EASA yaziyor").
                  Eskiden regen YALNIZ bir duzeltmenin yan etkisiydi; rapor KODU
                  degistiginde mevcut PDF'leri tazelemenin yolu yoktu ve insan
                  sahte bir duzeltme yapmak zorunda kaliyordu. Bu dugme VERIYE
                  DOKUNMAZ, PDF'i guncel sablonla yeniden cizer. */}
              <button style={S.btnSecondary} disabled={regen} onClick={async()=>{
                setRegen(true);
                const{error}=await supabase.functions.invoke('archive-flight',
                  {body:{plan_id:sel.plan_id,regenerate_pdf:true}});
                toast(error?`Report regen failed: ${error.message}`
                           :'Report PDF regenerated with the current template.',error?'error':'success');
                setRegen(false); load();
              }}>{regen?'REGENERATING…':'REGEN REPORT'}</button>
              <button style={S.btnDanger} onClick={()=>setDeleteModal(true)}>DELETE RECORD</button>
            </>
          )}>
          <div style={{display:'flex',borderBottom:`1px solid ${C.border}`,background:C.bg3,position:'sticky',top:0,zIndex:2}}>
            {DETAIL_TABS.map(tab=>(
              <div key={tab.id} onClick={()=>setDetailTab(tab.id)} style={{flex:1,padding:'10px',textAlign:'center',cursor:'pointer',fontFamily:'var(--mono)',fontSize:11,fontWeight:700,letterSpacing:1,color:detailTab===tab.id?C.accent:C.t3,borderBottom:detailTab===tab.id?`2px solid ${C.accent}`:'2px solid transparent',background:detailTab===tab.id?`var(--accent-soft)`:'transparent'}}>
                {tab.label}
              </div>
            ))}
          </div>

          {detailTab==='details'&&(
            <>
              {/* Özet: iki kolon — sıkışık dikey liste yerine ferah grid */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'10px 18px',padding:'14px 20px',borderBottom:`1px solid ${C.border}`}}>
                {[
                  ['PF PILOT', pilotName(sel.pf_id||sel.plans?.pf_pilot)||'—', true],
                  ['PM PILOT', pilotName(sel.sic_id||sel.plans?.pm_pilot)||'—', false],
                  ['OFF BLOCK', sel.off_blocks?new Date(sel.off_blocks).toISOString().slice(11,16)+' Z':'—', false],
                  ['T/O TIME', sel.takeoff_time?new Date(sel.takeoff_time).toISOString().slice(11,16)+' Z':'—', false],
                  ['LANDING', sel.landing_time?new Date(sel.landing_time).toISOString().slice(11,16)+' Z':'—', false],
                  ['ON BLOCK', sel.on_blocks?new Date(sel.on_blocks).toISOString().slice(11,16)+' Z':'—', false],
                  ['BLOCK', fmtMins(sel.block_minutes), true],
                  ['FLIGHT', fmtMins(sel.airborne_minutes), true],
                ].map(([l,v,a])=>(
                  <div key={l}>
                    <div style={{...S.label,marginBottom:3}}>{l}</div>
                    <div style={{fontSize:13,color:a?C.accent:C.t1,fontFamily:'var(--mono)',fontWeight:700}}>{v}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{padding:'7px 16px',background:C.bg3,fontSize:10,color:C.t3,fontWeight:700,letterSpacing:1.5,fontFamily:'var(--mono)'}}>FLIGHT DATA — CLICK TO EXPAND / EDIT</div>
                <CollapsibleEditBox title="Flight Crew" icon="**" color="var(--accent)" logs={logsByCategory.crew} fields={[{key:'pf_id',label:'PF Pilot',type:'pilot'},{key:'sic_id',label:'PM Pilot',type:'pilot'}]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
                <CollapsibleEditBox title="Mandatory" icon="OK" color="var(--green)" logs={logsByCategory.mandatory} fields={[]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
                <CollapsibleEditBox title="Fuel" icon="F" color="var(--green)" logs={logsByCategory.fuel} fields={[{key:'takeoff_fuel',label:'T/O Fuel (lb)',type:'text'},{key:'remaining_fuel',label:'Rem Fuel (lb)',type:'text'}]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
                <CollapsibleEditBox title="Accept & Sign" icon="SIG" color="var(--amber)" logs={logsByCategory.accepted} fields={[]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
                <CollapsibleEditBox title="T/O Data" icon="T/O" color="var(--amber)" logs={logsByCategory.tkof} fields={[{key:'dep_rwy',label:'DEP RWY',type:'text'},{key:'dep_atis',label:'DEP ATIS',type:'text'},{key:'sid',label:'SID',type:'text'}]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
                <CollapsibleEditBox title="NAV LOG" icon="NAV" color="var(--accent)" logs={logsByCategory.navlog} fields={[{key:'off_blocks',label:'Off Blocks (HH:MM)',type:'time'},{key:'takeoff_time',label:'T/O Time (HH:MM)',type:'time'},{key:'landing_time',label:'Landing (HH:MM)',type:'time'},{key:'on_blocks',label:'On Blocks (HH:MM)',type:'time'},{key:'takeoff_fuel',label:'T/O Fuel (lb)',type:'text'},{key:'remaining_fuel',label:'Rem Fuel (lb)',type:'text'}]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
                <CollapsibleEditBox title="LND Data" icon="LND" color="var(--accent)" logs={logsByCategory.lnd} fields={[{key:'arr_rwy',label:'ARR RWY',type:'text'},{key:'arr_atis',label:'ARR ATIS',type:'text'},{key:'actual_lw',label:'Actual LW (lb)',type:'text'},{key:'vref',label:'Vref (kt)',type:'text'},{key:'req_landing_dist',label:'Req LND Dist',type:'text'}]} flight={sel} onSave={load} toast={toast} user={user} pilots={pilots}/>
              </div>
              <AdminEditsHistory archivedFlightId={sel.id} readOnly={false}/>
            </>
          )}

          {detailTab==='logs'&&(
            <ModuleLogView planId={sel.plan_id}/>
          )}

          {detailTab==='docs'&&(
            <PlanDocuments planId={sel.plan_id} readOnly={true}/>
          )}
        </Drawer>
      )}

      {editModal&&sel&&(
        <Modal title="EDIT ARCHIVED FLIGHT — REPORT REQUIRED" onClose={()=>setEditModal(false)} width={520}>
          <div style={{fontSize:11,color:'var(--orange)',marginBottom:16,padding:'8px 12px',background:'rgba(232,115,26,0.08)',border:'1px solid rgba(232,115,26,0.2)'}}>All edits are logged. Only changed fields will be updated.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <EF form={editForm} setForm={setEditForm} label="OFF BLOCK (HH:MM)" k="off_blocks" type="time"/><EF form={editForm} setForm={setEditForm} label="T/O TIME (HH:MM)" k="takeoff_time" type="time"/>
            <EF form={editForm} setForm={setEditForm} label="LANDING (HH:MM)" k="landing_time" type="time"/><EF form={editForm} setForm={setEditForm} label="ON BLOCK (HH:MM)" k="on_blocks" type="time"/>
            <EF form={editForm} setForm={setEditForm} label="BLOCK (HH:MM)" k="block_minutes" type="duration"/><EF form={editForm} setForm={setEditForm} label="FLIGHT (HH:MM)" k="airborne_minutes" type="duration"/>
            <EF form={editForm} setForm={setEditForm} label="T/O FUEL (lb)" k="takeoff_fuel"/><EF form={editForm} setForm={setEditForm} label="REM FUEL (lb)" k="remaining_fuel"/>
            <EF form={editForm} setForm={setEditForm} label="ACTUAL LW (lb)" k="actual_lw"/><EF form={editForm} setForm={setEditForm} label="VREF (kt)" k="vref"/>
            <EF form={editForm} setForm={setEditForm} label="REQ LND DIST (ft)" k="req_landing_dist"/><EF form={editForm} setForm={setEditForm} label="LANDINGS" k="landing_count"/>
            <EF form={editForm} setForm={setEditForm} label="DEP RWY" k="dep_rwy"/><EF form={editForm} setForm={setEditForm} label="ARR RWY" k="arr_rwy"/>
            <EF form={editForm} setForm={setEditForm} label="SID" k="sid"/><EF form={editForm} setForm={setEditForm} label="PAX" k="pax"/>
          </div>
          <EF form={editForm} setForm={setEditForm} label="DEP ATIS" k="dep_atis"/><EF form={editForm} setForm={setEditForm} label="ARR ATIS" k="arr_atis"/>
          <EF form={editForm} setForm={setEditForm} label="NIGHT LANDING" k="is_night_landing" type="toggle"/>
          <div style={{marginTop:16}}><label style={S.formLabel}>REASON / REPORT *</label><textarea style={{...S.input,minHeight:80,resize:'vertical'}} value={editForm.reason} onChange={e=>setEditForm(p=>({...p,reason:e.target.value}))} placeholder="Mandatory: explain why this edit is required..."/></div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}><button style={S.btnSecondary} onClick={()=>setEditModal(false)}>CANCEL</button><button style={S.btnPrimary} onClick={handleSaveEdit} disabled={saving}>{saving?'SAVING...':'SAVE & LOG EDITS'}</button></div>
        </Modal>
      )}

      {deleteModal&&sel&&(
        <Modal title="DELETE ARCHIVED FLIGHT RECORD" onClose={()=>setDeleteModal(false)}>
          <div style={{fontSize:12,color:'var(--red)',marginBottom:16,padding:'10px 12px',background:'rgba(224,32,32,0.08)',border:'1px solid rgba(224,32,32,0.2)'}}>Irreversible. Record will be permanently deleted and logged.</div>
          <DetailRow label="Flight" value={`${sel.plans?.dep} → ${sel.plans?.dest}`} accent/>
          <DetailRow label="Archived" value={sel.archived_at?new Date(sel.archived_at).toLocaleString('en-GB'):'—'}/>
          <div style={{marginTop:16}}><label style={S.formLabel}>REASON FOR DELETION *</label><textarea style={{...S.input,minHeight:80,resize:'vertical'}} value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} placeholder="Mandatory: explain why this record is being deleted..."/></div>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}><button style={S.btnSecondary} onClick={()=>setDeleteModal(false)}>CANCEL</button><button style={S.btnDanger} onClick={handleDelete} disabled={saving}>{saving?'DELETING...':'CONFIRM DELETE'}</button></div>
        </Modal>
      )}
    </div>
  );
}

// ─── AIRCRAFT DATABASE ────────────────────────────────────────────────────────
const AIRCRAFT_DB = {
  'Gulfstream': [{model:'G200',ac_type:'G200'},{model:'G280',ac_type:'G280'},{model:'G300',ac_type:'GLF3'},{model:'G350',ac_type:'GLF4'},{model:'G400',ac_type:'GLF4'},{model:'G450',ac_type:'GLF4'},{model:'G500',ac_type:'GLF5'},{model:'G550',ac_type:'GLF5'},{model:'G600',ac_type:'GLF6'},{model:'G650',ac_type:'GLF6'},{model:'G700',ac_type:'G700'}],
  'Falcon (Dassault)': [{model:'Falcon 6X',ac_type:'F6X'},{model:'Falcon 7X',ac_type:'F7X'},{model:'Falcon 8X',ac_type:'F8X'},{model:'Falcon 900',ac_type:'F900'},{model:'Falcon 2000',ac_type:'F2TH'},{model:'Falcon 2000S',ac_type:'F2TH'},{model:'Falcon 2000LX',ac_type:'F2TH'}],
  'Bombardier': [{model:'Challenger 300',ac_type:'CL30'},{model:'Challenger 350',ac_type:'CL35'},{model:'Challenger 604',ac_type:'CL60'},{model:'Challenger 605',ac_type:'CL60'},{model:'Challenger 650',ac_type:'CL60'},{model:'Global 5000',ac_type:'GL5T'},{model:'Global 6000',ac_type:'GL6T'},{model:'Global 7500',ac_type:'GL7T'},{model:'Learjet 45',ac_type:'LJ45'},{model:'Learjet 75',ac_type:'LJ75'}],
  'Hawker': [{model:'Hawker 400XP',ac_type:'BE40'},{model:'Hawker 750',ac_type:'H25B'},{model:'Hawker 800XP',ac_type:'H25B'},{model:'Hawker 900XP',ac_type:'H25B'},{model:'Hawker 4000',ac_type:'HA4T'}],
  'Embraer': [{model:'Phenom 100',ac_type:'E50P'},{model:'Phenom 300',ac_type:'E55P'},{model:'Legacy 450',ac_type:'E45X'},{model:'Legacy 500',ac_type:'E50P'},{model:'Legacy 600',ac_type:'E135'},{model:'Legacy 650',ac_type:'E135'},{model:'Praetor 500',ac_type:'E55P'},{model:'Praetor 600',ac_type:'E50P'}],
};

function AircraftForm({form, setForm, onSave, onCancel, saveLabel='SAVE'}){
  const manufacturers = Object.keys(AIRCRAFT_DB);
  const models = form.manufacturer && AIRCRAFT_DB[form.manufacturer] ? AIRCRAFT_DB[form.manufacturer] : null;
  const handleManufacturer = (mfr) => { setForm(p=>({...p, manufacturer:mfr, model:'', ac_type:''})); };
  const handleModel = (modelStr) => { const entry = models?.find(m=>m.model===modelStr); setForm(p=>({...p, model:modelStr, ac_type:entry?.ac_type||p.ac_type})); };
  return (
    <div>
      <div style={S.formGroup}><label style={S.formLabel}>REGISTRATION *</label><input style={S.input} placeholder="TC-REC" value={form.registration||''} onChange={e=>setForm(p=>({...p,registration:e.target.value.toUpperCase()}))}/></div>
      <div style={S.formGroup}><label style={S.formLabel}>MANUFACTURER</label>
        <select style={S.select} value={form.manufacturer||''} onChange={e=>handleManufacturer(e.target.value)}>
          <option value="">— Select —</option>{manufacturers.map(m=><option key={m} value={m}>{m}</option>)}<option value="__other__">Other</option>
        </select>
        {form.manufacturer==='__other__'&&(<input style={{...S.input,marginTop:8}} placeholder="Manufacturer name" value={form._mfrCustom||''} onChange={e=>setForm(p=>({...p,_mfrCustom:e.target.value,manufacturer:e.target.value}))}/>)}
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>MODEL</label>
        {models?(<select style={S.select} value={form.model||''} onChange={e=>handleModel(e.target.value)}><option value="">— Select model —</option>{models.map(m=><option key={m.model} value={m.model}>{m.model}</option>)}<option value="__other__">Other</option></select>):(<input style={S.input} placeholder="Model name" value={form.model||''} onChange={e=>setForm(p=>({...p,model:e.target.value}))}/>)}
        {form.model==='__other__'&&(<input style={{...S.input,marginTop:8}} placeholder="Model name" value={form._modelCustom||''} onChange={e=>setForm(p=>({...p,_modelCustom:e.target.value,model:e.target.value}))}/>)}
      </div>
      <div style={S.formGroup}><label style={S.formLabel}>ICAO TYPE CODE *</label><input style={S.input} placeholder="e.g. GLF4" value={form.ac_type||''} onChange={e=>setForm(p=>({...p,ac_type:e.target.value.toUpperCase()}))}/>{form.ac_type&&<div style={{fontSize:10,color:C.t3,marginTop:4,fontFamily:'var(--mono)'}}>Auto-filled from model selection. Edit if needed.</div>}</div>
      <div style={S.formGroup}><label style={S.formLabel}>LANDING CATEGORY</label><select style={S.select} value={form.landing_cat||'CAT1'} onChange={e=>setForm(p=>({...p,landing_cat:e.target.value}))}><option value="CAT1">CAT I</option><option value="CAT2">CAT II</option><option value="CAT3">CAT III</option></select></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div style={S.formGroup}><label style={S.formLabel}>BASELINE HOURS</label><input style={S.input} placeholder="0" type="number" value={form.total_hours||''} onChange={e=>setForm(p=>({...p,total_hours:e.target.value}))}/><div style={{fontSize:10,color:C.t3,marginTop:4}}>Hours before app tracking started</div></div>
        <div style={S.formGroup}><label style={S.formLabel}>BASELINE CYCLES</label><input style={S.input} placeholder="0" type="number" value={form.total_cycles||''} onChange={e=>setForm(p=>({...p,total_cycles:e.target.value}))}/><div style={{fontSize:10,color:C.t3,marginTop:4}}>Cycles before app tracking started</div></div>
      </div>
      <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}><button style={S.btnSecondary} onClick={onCancel}>CANCEL</button><button style={S.btnPrimary} onClick={onSave}>{saveLabel}</button></div>
    </div>
  );
}

// ─── 3. Aircrafts ─────────────────────────────────────────────────────────────
function Aircrafts({toast,myProfile,customerId}){
  const[list,setList]=useState([]);const[loading,setLoading]=useState(true);
  const[showAdd,setShowAdd]=useState(false);const[selected,setSelected]=useState(null);
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({registration:'',manufacturer:'',model:'',ac_type:'',landing_cat:'CAT1',total_hours:0,total_cycles:0});
  const[editForm,setEditForm]=useState({});const[saving,setSaving]=useState(false);const[acStats,setAcStats]=useState({});
  const load=useCallback(async()=>{ setLoading(true); let acq=supabase.from('aircraft').select('*').order('registration'); if(customerId){acq=acq.eq('customer_id',customerId);} const[{data:acData},{data:flData}]=await Promise.all([acq,supabase.from('archived_flights').select('airborne_minutes,landing_count,plans(reg)')]); setList(acData||[]); const stats={}; (flData||[]).forEach(f=>{ const reg=f.plans?.reg; if(!reg)return; if(!stats[reg])stats[reg]={mins:0,cycles:0}; stats[reg].mins+=(f.airborne_minutes||0); stats[reg].cycles+=(f.landing_count||0); }); setAcStats(stats); setLoading(false); },[customerId]);
  useEffect(()=>{load();},[load]);
  const sel=list.find(a=>a.id===selected);
  const getTotals=(a)=>{ const s=acStats[a.registration]||{mins:0,cycles:0}; const baseMins=Math.round((parseFloat(a.total_hours)||0)*60); const totalMins=baseMins+s.mins; const totalHours=totalMins/60; const totalCycles=(a.total_cycles||0)+s.cycles; return{ hours: totalMins>0?`${Math.floor(totalHours)}:${String(Math.round((totalHours%1)*60)).padStart(2,'0')}`:'0:00', cycles:totalCycles, appMins:s.mins, appCycles:s.cycles }; };
  const handleAdd=async()=>{ if(!form.registration||!form.ac_type){toast('Registration and type required.','error');return;} const sb=await askReason('adding an aircraft'); if(!sb)return; const targetCustomer=myProfile?.is_super_admin?customerId:myProfile?.customer_id; if(!targetCustomer){toast('No company context for aircraft.','error');return;} const{registration,manufacturer,model,ac_type,landing_cat,total_hours,total_cycles}=form; const{error}=await sb.from('aircraft').insert({registration,manufacturer,model,ac_type,landing_cat,total_hours:parseFloat(total_hours)||0,total_cycles:parseInt(total_cycles)||0,customer_id:targetCustomer}); if(error){toast(error.message,'error');return;} toast('Aircraft added.','success'); setShowAdd(false); setForm({registration:'',manufacturer:'',model:'',ac_type:'',landing_cat:'CAT1',total_hours:0,total_cycles:0}); load(); };
  const openEdit=()=>{ if(!sel)return; setEditForm({registration:sel.registration||'',manufacturer:sel.manufacturer||'',model:sel.model||'',ac_type:sel.ac_type||'',landing_cat:sel.landing_cat||'CAT1',total_hours:sel.total_hours||0,total_cycles:sel.total_cycles||0}); setEditing(true); };
  const handleSaveEdit=async()=>{ if(!editForm.registration||!editForm.ac_type){toast('Registration and type required.','error');return;} const sb=await askReason('editing this aircraft'); if(!sb)return; setSaving(true); const{registration,manufacturer,model,ac_type,landing_cat,total_hours,total_cycles}=editForm; const{error}=await sb.from('aircraft').update({registration,manufacturer,model,ac_type,landing_cat,total_hours:parseFloat(total_hours)||0,total_cycles:parseInt(total_cycles)||0}).eq('id',sel.id); if(error){toast(error.message,'error');}else{toast('Aircraft updated.','success');setEditing(false);load();} setSaving(false); };
  const handleToggleActive=async()=>{ const sb=await askReason('toggle active'); if(!sb)return; if(!sel)return; const next=!sel.active; const verb=next?'reactivate':'retire from the fleet'; if(!window.confirm(`Are you sure you want to ${verb} ${sel.registration}? Historical flight records are always preserved.`))return; setSaving(true); const{error}=await sb.from('aircraft').update({active:next}).eq('id',sel.id); if(error){toast(error.message,'error');}else{toast(next?`${sel.registration} reactivated.`:`${sel.registration} retired from fleet.`,'success');load();} setSaving(false); };
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={S.label}>{list.length} AIRCRAFT REGISTERED</span><button style={S.btnPrimary} onClick={()=>setShowAdd(true)}>+ ADD AIRCRAFT</button></div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}><thead><tr>{['REGISTRATION','MANUFACTURER','MODEL','TYPE','CAT','TOTAL HOURS','TOTAL CYCLES','STATUS'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{list.map(a=>{const t=getTotals(a);return(<tr key={a.id} onClick={()=>{setSelected(a.id===selected?null:a.id);setEditing(false);}} style={{cursor:'pointer',background:selected===a.id?`var(--accent-soft)`:'transparent'}}><td style={{...S.td,color:C.accent,fontWeight:700}}>{a.registration}</td><td style={S.td}>{a.manufacturer||'—'}</td><td style={S.td}>{a.model||'—'}</td><td style={S.td}>{a.ac_type||'—'}</td><td style={S.td}><span style={S.badge('blue')}>{a.landing_cat}</span></td><td style={{...S.td,color:C.accent,fontWeight:700}}>{t.hours}</td><td style={{...S.td,color:C.accent,fontWeight:700}}>{t.cycles}</td><td style={S.td}><span style={S.badge(a.active?'green':'red')}>{a.active?'ACTIVE':'INACTIVE'}</span></td></tr>);})}</tbody></table>
      </div>
      {sel&&!editing&&(()=>{ const t=getTotals(sel); const appHours=t.appMins>0?`${Math.floor(t.appMins/60)}:${String(t.appMins%60).padStart(2,'0')}`:'0:00'; return(<DetailPanel title="Aircraft Detail" onClose={()=>setSelected(null)}><DetailRow label="Registration" value={sel.registration} accent/><DetailRow label="Manufacturer" value={sel.manufacturer}/><DetailRow label="Model" value={sel.model}/><DetailRow label="ICAO Type" value={sel.ac_type}/><DetailRow label="Landing Cat" value={sel.landing_cat}/><div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:C.t3,fontFamily:'var(--mono)'}}>TOTAL HOURS</span><span style={{fontSize:15,color:C.accent,fontFamily:'var(--mono)',fontWeight:700}}>{t.hours}</span></div><div style={{fontSize:10,color:'var(--t3)',fontFamily:'var(--mono)'}}>Baseline: {sel.total_hours||0}h + App logged: {appHours}</div></div><div style={{padding:'9px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3}}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:C.t3,fontFamily:'var(--mono)'}}>TOTAL CYCLES</span><span style={{fontSize:15,color:C.accent,fontFamily:'var(--mono)',fontWeight:700}}>{t.cycles}</span></div><div style={{fontSize:10,color:'var(--t3)',fontFamily:'var(--mono)'}}>Baseline: {sel.total_cycles||0} + App logged: {t.appCycles}</div></div><DetailRow label="Status" value={sel.active?'Active':'Inactive'}/><div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:8}}><button style={{...S.btnPrimary,width:'100%'}} onClick={openEdit}>EDIT AIRCRAFT</button><button style={{...(sel.active?S.btnDanger:S.btnPrimary),width:'100%'}} onClick={handleToggleActive} disabled={saving}>{sel.active?'RETIRE FROM FLEET':'REACTIVATE'}</button></div></DetailPanel>); })()}
      {sel&&editing&&(<DetailPanel title={`EDIT — ${sel.registration}`} onClose={()=>setEditing(false)} width={380}><div style={{padding:'12px 16px',overflowY:'auto'}}><AircraftForm form={editForm} setForm={setEditForm} onSave={handleSaveEdit} onCancel={()=>setEditing(false)} saveLabel={saving?'SAVING...':'SAVE CHANGES'}/></div></DetailPanel>)}
      {showAdd&&(<Modal title="ADD AIRCRAFT" onClose={()=>setShowAdd(false)} width={480}><AircraftForm form={form} setForm={setForm} onSave={handleAdd} onCancel={()=>setShowAdd(false)} saveLabel="ADD AIRCRAFT"/></Modal>)}
    </div>
  );
}


function HomeBaseCell({ pilotId }) {
  const [icao, setIcao] = React.useState(null);
  React.useEffect(() => {
    supabase.from('home_bases').select('icao').eq('pilot_id', pilotId).limit(1)
      .then(({ data }) => setIcao(data?.[0]?.icao || null));
  }, [pilotId]);
  if (!icao) return <span style={{color:'var(--t3)',fontSize:11}}>—</span>;
  return <span style={{...S.badge('blue'),fontSize:11}}>{icao}</span>;
}

// ─── 4. Crews ─────────────────────────────────────────────────────────────────
export function Crews({toast,myProfile,customerId}){
  const[pilots,setPilots]=useState([]);const[quals,setQuals]=useState([]);
  const[loading,setLoading]=useState(true);const[selected,setSelected]=useState(null);
  const[showQual,setShowQual]=useState(false);const[showEfb,setShowEfb]=useState(false);
  const[editingCrew,setEditingCrew]=useState(false);const[crewEditForm,setCrewEditForm]=useState({});
  const[showAdd,setShowAdd]=useState(false);const[deleteModal,setDeleteModal]=useState(false);
  const[deleteTarget,setDeleteTarget]=useState(null);const[deleteConfirm,setDeleteConfirm]=useState(false);
  const[saving,setSaving]=useState(false);
  // SIFRE ATAMA (10 Agu 2026): eski "RESET PWD" Supabase'in sifirlama MAILINI
  // gonderiyordu; teslim edilemeyen adresi olan hesaplarda "email address
  // invalid" ile duvara carpiyordu. Artik sifre DOGRUDAN atanir (manage-user
  // action=set_password), mail devrede degil. Sifre HICBIR yere kaydedilmez;
  // kutu kapaninca state temizlenir, ize yalnizca OLAYIN oldugu yazilir.
  const[pwdTarget,setPwdTarget]=useState(null);
  const[newPwd,setNewPwd]=useState('');
  const[pwdReason,setPwdReason]=useState('');
  const[addForm,setAddForm]=useState({full_name:'',code:'',email:'',role:'pilot',password:''});
  const[qualForm,setQualForm]=useState({ac_type:'',seat:'CPT',hand:'BOTH',landing_cat:'CAT1',valid_from:'',valid_until:''});
  const[efbForm,setEfbForm]=useState({efb_training_date:'',efb_training_valid_until:'',efb_training_type:'Initial',efb_trained_by:''});
  const[bases,setBases]=useState({});const[showBase,setShowBase]=useState(false);
  const[baseForm,setBaseForm]=useState({});
  const load=useCallback(async()=>{ setLoading(true); let pq=supabase.from('profiles').select('*').order('full_name'); if(customerId){pq=pq.eq('customer_id',customerId);} const[{data:p},{data:q},{data:b}]=await Promise.all([pq,supabase.from('crew_qualifications').select('*'),supabase.from('ftl_pilot_baselines').select('*').order('created_at',{ascending:false})]); setPilots(p||[]); setQuals(q||[]); const bm={};(b||[]).forEach(r=>{if(!bm[r.pilot_id])bm[r.pilot_id]=r;}); setBases(bm); setLoading(false); },[customerId]);
  useEffect(()=>{load();},[load]);
  const sel=pilots.find(p=>p.id===selected);
  const selQuals=quals.filter(q=>q.pilot_id===selected);
  const efbRecord=selQuals.find(q=>q.efb_training_date);
  const handleAddCrew=async()=>{ if(!addForm.full_name||!addForm.code||!addForm.email||!addForm.password){toast('All fields required.','error');return;} if(myProfile?.is_super_admin&&!customerId){toast('Please select a company first.','error');return;} setSaving(true); try{ const{data:{session}}=await supabase.auth.getSession(); if(!session){toast('Session expired, please log in again.','error');setSaving(false);return;} const payload={action:'create',email:addForm.email,password:addForm.password,full_name:addForm.full_name,code:addForm.code,role:addForm.role}; if(myProfile?.is_super_admin){payload.target_customer_id=customerId;} const res=await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/manage-user`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(payload)}); const result=await res.json(); if(!res.ok){toast(result.error||'User creation failed','error');setSaving(false);return;} toast(`${addForm.full_name} added successfully.`,'success'); setShowAdd(false); setAddForm({full_name:'',code:'',email:'',role:'pilot',password:''}); load(); }catch(e){toast(e.message,'error');} setSaving(false); };
  const handleDeleteStep1=(pilot)=>{setDeleteTarget(pilot);setDeleteModal(true);setDeleteConfirm(false);};
  const closePwd=()=>{ setPwdTarget(null); setNewPwd(''); setPwdReason(''); };
  const handleSetPwd=async()=>{
    if(newPwd.length<8){ toast('Password must be at least 8 characters.','error'); return; }
    if(pwdReason.trim().length<3){ toast('A reason is required.','error'); return; }
    setSaving(true);
    try{
      const{data:{session}}=await supabase.auth.getSession();
      if(!session){ toast('Session expired, please log in again.','error'); setSaving(false); return; }
      const res=await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/manage-user`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},
        body:JSON.stringify({action:'set_password',target_user_id:pwdTarget.id,password:newPwd,reason:pwdReason.trim()}),
      });
      const result=await res.json();
      if(!res.ok){ toast(result.error||'Could not set password','error'); setSaving(false); return; }
      toast(`Password set for ${pwdTarget.full_name}.`,'success');
      closePwd();
    }catch(e){ toast(e.message,'error'); }
    setSaving(false);
  };

  const handleDeleteConfirm=async()=>{ if(!deleteTarget)return; setSaving(true); try{ const{data:{session}}=await supabase.auth.getSession(); if(!session){toast('Session expired, please log in again.','error');setSaving(false);return;} const res=await fetch(`${process.env.REACT_APP_SUPABASE_URL}/functions/v1/manage-user`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'delete',target_user_id:deleteTarget.id})}); const result=await res.json(); if(!res.ok){toast(result.error||'Delete failed','error');setSaving(false);return;} toast(`${deleteTarget.full_name} deleted.`,'success'); setDeleteModal(false);setDeleteTarget(null);setSelected(null);load(); }catch(e){toast(e.message,'error');} setSaving(false); };
  const handleAddQual=async()=>{ const sb=await askReason('add qual'); if(!sb)return; if(!qualForm.ac_type){toast('Aircraft type required.','error');return;} const{error}=await sb.from('crew_qualifications').upsert({pilot_id:selected,...qualForm}); if(error){toast(error.message,'error');return;} toast('Qualification saved.','success');setShowQual(false);load(); };
  const handleSaveCrew=async()=>{ if(!crewEditForm.full_name||!crewEditForm.code){toast('Name and code required.','error');return;} const sb=await askReason('editing this crew member'); if(!sb)return; const{error}=await sb.from('profiles').update({full_name:crewEditForm.full_name,code:crewEditForm.code.toUpperCase(),role:crewEditForm.role}).eq('id',sel.id); if(error){toast(error.message,'error');return;} if(crewEditForm.home_base){await sb.from('home_bases').upsert({pilot_id:sel.id,icao:crewEditForm.home_base.toUpperCase(),reg:'TC-REC'},{onConflict:'pilot_id'});}else{await sb.from('home_bases').delete().eq('pilot_id',sel.id);} toast('Crew updated.','success');setEditingCrew(false);load(); };
  const handleSaveEfb=async()=>{ if(!efbForm.efb_training_date){toast('Training date required.','error');return;} const sb=await askReason('this EFB training record'); if(!sb)return; const existing=selQuals[0]; if(existing){await sb.from('crew_qualifications').update(efbForm).eq('id',existing.id);}else{await sb.from('crew_qualifications').insert({pilot_id:selected,ac_type:'EFB',seat:'BOTH',hand:'BOTH',landing_cat:'CAT1',...efbForm});} toast('EFB training record saved.','success');setShowEfb(false);load(); };
  const efbStatus=rec=>{ if(!rec?.efb_training_date)return{color:'var(--red)',label:'NO RECORD'}; if(!rec.efb_training_valid_until)return{color:'var(--green)',label:'CURRENT'}; const d=Math.floor((new Date(rec.efb_training_valid_until)-new Date())/86400000); if(d<0)return{color:'var(--red)',label:'EXPIRED'}; if(d<30)return{color:'var(--orange)',label:`${d}d LEFT`}; return{color:'var(--green)',label:'CURRENT'}; };
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={S.label}>{pilots.length} CREW MEMBERS</span><div style={{display:'flex',gap:8}}><button style={S.btnPrimary} onClick={()=>setShowAdd(true)}>+ ADD CREW</button>{selected&&<button style={S.btnDanger} onClick={()=>handleDeleteStep1(sel)}>DELETE CREW</button>}</div></div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}><thead><tr>{['CODE','FULL NAME','ROLE','EMAIL','QUALIFICATIONS','EFB TRAINING','FTL BASELINE','HOME BASE','PWD'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{pilots.map(p=>{ const pQ=quals.filter(q=>q.pilot_id===p.id);const pE=pQ.find(q=>q.efb_training_date);const pS=efbStatus(pE);const pB=bases[p.id]; return(<tr key={p.id} onClick={()=>setSelected(p.id===selected?null:p.id)} style={{cursor:'pointer',background:selected===p.id?`var(--accent-soft)`:'transparent'}}><td style={{...S.td,color:C.accent,fontWeight:700,fontSize:13}}>{p.code||'—'}</td><td style={{...S.td,color:C.t1}}>{p.full_name||'—'}</td><td style={S.td}><span style={S.badge(p.role==='admin'?'':'blue')}>{(p.role||'—').toUpperCase()}</span></td><td style={S.td}>{p.email||'—'}</td><td style={S.td}>{pQ.filter(q=>q.ac_type!=='EFB').length===0?<span style={{color:C.t3}}>—</span>:pQ.filter(q=>q.ac_type!=='EFB').map(q=><span key={q.id} style={{...S.badge('blue'),marginRight:4}}>{q.ac_type} {q.seat} {q.landing_cat}</span>)}</td><td style={S.td}><span style={{...S.badge(''),color:pS.color,background:`${pS.color}15`,border:`1px solid ${pS.color}40`}}>{pS.label}</span></td><td style={S.td}>{['pilot','admin_pilot'].includes(p.role)?(pB?<span style={S.badge('green')}>SET · {new Date(pB.effective_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}).toUpperCase()}</span>:<span style={S.badge('red')}>NOT SET</span>):<span style={{color:C.t3}}>—</span>}</td><td style={S.td}><HomeBaseCell pilotId={p.id}/></td><td style={S.td}><button style={S.btnSecondary} onClick={e=>{e.stopPropagation();setNewPwd('');setPwdTarget(p);}}>SET PWD</button></td></tr>); })}</tbody></table>
      </div>
      {sel&&(<DetailPanel title={`${sel.code} — ${sel.full_name}`} onClose={()=>{setSelected(null);setEditingCrew(false);}}>
        {!editingCrew?(<><DetailRow label="Code" value={sel.code} accent/><DetailRow label="Full Name" value={sel.full_name}/><DetailRow label="Email" value={sel.email}/><DetailRow label="Role" value={sel.role}/><div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}><button style={{...S.btnSecondary,width:'100%'}} onClick={()=>{supabase.from('home_bases').select('icao').eq('pilot_id',sel.id).limit(1).then(({data})=>{ setCrewEditForm({full_name:sel.full_name||'',code:sel.code||'',role:sel.role||'pilot',home_base:data?.[0]?.icao||''}); setEditingCrew(true); });}}>EDIT PROFILE</button></div></>):(<><div style={{padding:'12px 16px',borderBottom:`1px solid ${C.border}`}}><div style={{...S.label,marginBottom:12}}>EDIT CREW PROFILE</div><div style={S.formGroup}><label style={S.formLabel}>FULL NAME *</label><input style={S.input} value={crewEditForm.full_name} onChange={e=>setCrewEditForm(p=>({...p,full_name:e.target.value}))}/></div><div style={S.formGroup}><label style={S.formLabel}>CODE *</label><input style={S.input} maxLength={5} value={crewEditForm.code} onChange={e=>setCrewEditForm(p=>({...p,code:e.target.value.toUpperCase()}))}/></div><div style={S.formGroup}><label style={S.formLabel}>ROLE</label><select style={S.select} value={crewEditForm.role} onChange={e=>setCrewEditForm(p=>({...p,role:e.target.value}))}><option value="pilot">Pilot</option><option value="admin">Admin</option><option value="dispatcher">Dispatcher</option><option value="admin_pilot">Admin + Pilot</option></select></div><div style={S.formGroup}><label style={S.formLabel}>HOME BASE</label><input style={S.input} maxLength={4} placeholder="LTAC" value={crewEditForm.home_base||''} onChange={e=>setCrewEditForm(p=>({...p,home_base:e.target.value.toUpperCase()}))}/><div style={{fontSize:10,color:C.t3,marginTop:4}}>ICAO code — used for FTL duty/rest calculation</div></div><div style={{display:'flex',gap:8}}><button style={{...S.btnSecondary,flex:1}} onClick={()=>setEditingCrew(false)}>CANCEL</button><button style={{...S.btnPrimary,flex:2}} onClick={handleSaveCrew}>SAVE</button></div></div></>)}
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}><div style={{...S.label,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>EFB Training</span>{(()=>{const st=efbStatus(efbRecord);return<span style={{...S.badge(''),color:st.color,background:`${st.color}15`,border:`1px solid ${st.color}40`}}>{st.label}</span>;})()}</div>{efbRecord?(<div style={{fontSize:12,color:C.t1,fontFamily:'var(--mono)',lineHeight:2}}><div>Type: <span style={{color:C.accent}}>{efbRecord.efb_training_type||'—'}</span></div><div>Date: {efbRecord.efb_training_date}</div><div>Valid Until: {efbRecord.efb_training_valid_until||'—'}</div><div>Trained By: {efbRecord.efb_trained_by||'—'}</div></div>):<div style={{fontSize:12,color:'var(--red)',marginBottom:8}}>No EFB training record on file</div>}<button style={{...S.btnPrimary,marginTop:10,width:'100%'}} onClick={()=>{setEfbForm({efb_training_date:efbRecord?.efb_training_date||'',efb_training_valid_until:efbRecord?.efb_training_valid_until||'',efb_training_type:efbRecord?.efb_training_type||'Initial',efb_trained_by:efbRecord?.efb_trained_by||''});setShowEfb(true);}}>{efbRecord?'UPDATE EFB TRAINING':'ADD EFB TRAINING'}</button></div>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`}}><div style={{...S.label,marginBottom:8}}>Type Qualifications</div>{selQuals.filter(q=>q.ac_type!=='EFB').length===0&&<div style={{fontSize:12,color:C.t3}}>No qualifications</div>}{selQuals.filter(q=>q.ac_type!=='EFB').map(q=>(<div key={q.id} style={{marginBottom:8,padding:'8px 10px',background:C.bg3,border:`1px solid ${C.border}`}}><div style={{fontSize:12,color:C.accent,fontWeight:700,fontFamily:'var(--mono)'}}>{q.ac_type}</div><div style={{fontSize:11,color:C.t2,marginTop:3,fontFamily:'var(--mono)'}}>{q.seat} · {q.hand} · {q.landing_cat}</div></div>))}<button style={{...S.btnPrimary,marginTop:8,width:'100%'}} onClick={()=>setShowQual(true)}>+ ADD QUALIFICATION</button></div>
        {['pilot','admin_pilot'].includes(sel.role)&&(()=>{const b=bases[sel.id];return(
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,borderLeft:`2px solid ${C.accent}`}}>
          <div style={{...S.label,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span>FTL Baseline</span>{b?<span style={S.badge('green')}>SET · {b.effective_date}</span>:<span style={S.badge('red')}>NOT SET</span>}</div>
          {b?(<div style={{fontSize:12,color:C.t1,fontFamily:'var(--mono)',lineHeight:2}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:C.t3}}>FLT 28 days</span><span>{ftlFmtMin(b.flt_28d_min)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:C.t3}}>FLT cal year</span><span>{ftlFmtMin(b.flt_cal_year_min)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:C.t3}}>FLT 12 months</span><span>{ftlFmtMin(b.flt_12mo_min)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:C.t3}}>DUTY 28 days</span><span>{ftlFmtMin(b.duty_28d_min)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:C.t3}}>Last recurrent rest</span><span>{b.last_recurrent_rest_end||'—'}</span></div>
          </div>):(<div style={{fontSize:11,color:'var(--red)',marginBottom:4}}>No baseline — pilot cannot be assigned FLT duty in the FTL wizard.</div>)}
          <button style={{...S.btnPrimary,marginTop:10,width:'100%'}} onClick={()=>{setBaseForm({effective_date:b?.effective_date||'',last_recurrent_rest_end:b?.last_recurrent_rest_end||'',flt_7d:ftlFmtMin(b?.flt_7d_min??0),flt_28d:ftlFmtMin(b?.flt_28d_min??0),flt_cal_year:ftlFmtMin(b?.flt_cal_year_min??0),flt_12mo:ftlFmtMin(b?.flt_12mo_min??0),duty_7d:ftlFmtMin(b?.duty_7d_min??0),duty_14d:ftlFmtMin(b?.duty_14d_min??0),duty_28d:ftlFmtMin(b?.duty_28d_min??0),duty_cal_year:ftlFmtMin(b?.duty_cal_year_min??0),off_days_month:b?.off_days_month??0,off_days_cal_year:b?.off_days_cal_year??0});setShowBase(true);}}>{b?'UPDATE BASELINE':'SET BASELINE'}</button>
          <div style={{fontSize:9.5,color:C.t3,marginTop:6,lineHeight:1.6}}>Correction creates a new row — history kept, no delete.</div>
        </div>);})()}
      </DetailPanel>)}
      {showBase&&sel&&(<Modal title={`FTL BASELINE — ${sel.code} ${sel.full_name}`} onClose={()=>setShowBase(false)} width={560}>
        <div style={{fontSize:10,color:C.t2,letterSpacing:.5,lineHeight:1.7,padding:'9px 12px',background:C.bg3,borderLeft:`2px solid ${C.accent}`,marginBottom:16,fontFamily:'var(--mono)'}}>Carried-over totals <b>as of the baseline date</b> — starts cumulative FTL limits correctly. Time fields HH:MM.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div style={S.formGroup}><label style={S.formLabel}>BASELINE DATE *</label><input type="date" style={S.input} value={baseForm.effective_date||''} onChange={e=>setBaseForm(f=>({...f,effective_date:e.target.value}))}/></div>
          <div style={S.formGroup}><label style={S.formLabel}>LAST RECURRENT REST END</label><input type="date" style={S.input} value={baseForm.last_recurrent_rest_end||''} onChange={e=>setBaseForm(f=>({...f,last_recurrent_rest_end:e.target.value}))}/></div>
        </div>
        <div style={{...S.formLabel,color:C.accent,marginBottom:8}}>FLIGHT TIME</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
          {[['flt_7d','LAST 7 D'],['flt_28d','LAST 28 D'],['flt_cal_year','CAL YEAR'],['flt_12mo','LAST 12 MO']].map(([k,l])=>(<div key={k} style={S.formGroup}><label style={{...S.formLabel,fontSize:10}}>{l}</label><input style={S.input} value={baseForm[k]||''} onChange={e=>setBaseForm(f=>({...f,[k]:e.target.value}))}/></div>))}
        </div>
        <div style={{...S.formLabel,color:C.accent,marginBottom:8}}>DUTY TIME</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
          {[['duty_7d','LAST 7 D'],['duty_14d','LAST 14 D'],['duty_28d','LAST 28 D'],['duty_cal_year','CAL YEAR']].map(([k,l])=>(<div key={k} style={S.formGroup}><label style={{...S.formLabel,fontSize:10}}>{l}</label><input style={S.input} value={baseForm[k]||''} onChange={e=>setBaseForm(f=>({...f,[k]:e.target.value}))}/></div>))}
        </div>
        <div style={{...S.formLabel,color:C.accent,marginBottom:8}}>OFF DAYS</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 2fr',gap:10}}>
          {[['off_days_month','THIS MONTH'],['off_days_cal_year','CAL YEAR']].map(([k,l])=>(<div key={k} style={S.formGroup}><label style={{...S.formLabel,fontSize:10}}>{l}</label><input style={S.input} value={baseForm[k]??''} onChange={e=>setBaseForm(f=>({...f,[k]:e.target.value}))}/></div>))}
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
          <button style={S.btnSecondary} onClick={()=>setShowBase(false)}>CANCEL</button>
          <button style={S.btnPrimary} disabled={saving} onClick={async()=>{
            if(!baseForm.effective_date){toast('Baseline date required.','error');return;}
            setSaving(true);
            const row={customer_id:sel.customer_id||customerId||myProfile?.customer_id,pilot_id:sel.id,entered_by:myProfile?.id,
              effective_date:baseForm.effective_date,last_recurrent_rest_end:baseForm.last_recurrent_rest_end||null,
              flt_7d_min:ftlToMin(baseForm.flt_7d)||0,flt_28d_min:ftlToMin(baseForm.flt_28d)||0,
              flt_cal_year_min:ftlToMin(baseForm.flt_cal_year)||0,flt_12mo_min:ftlToMin(baseForm.flt_12mo)||0,
              duty_7d_min:ftlToMin(baseForm.duty_7d)||0,duty_14d_min:ftlToMin(baseForm.duty_14d)||0,
              duty_28d_min:ftlToMin(baseForm.duty_28d)||0,duty_cal_year_min:ftlToMin(baseForm.duty_cal_year)||0,
              off_days_month:Number(baseForm.off_days_month)||0,off_days_cal_year:Number(baseForm.off_days_cal_year)||0};
            const sb=await askReason('this FTL baseline'); if(!sb)return;
            const{error}=await sb.from('ftl_pilot_baselines').insert([row]);
            if(error){toast(error.message,'error');}else{toast('Baseline saved (new audit row).','success');setShowBase(false);load();}
            setSaving(false);
          }}>{saving?'SAVING...':'SAVE BASELINE'}</button>
        </div>
      </Modal>)}
      {pwdTarget&&(<Modal title={`SET PASSWORD — ${pwdTarget.code||''} ${pwdTarget.full_name||''}`} onClose={closePwd} width={420}>
        <div style={{fontSize:11,color:C.t2,lineHeight:1.7,marginBottom:12}}>
          The password is set directly — no e-mail is sent. Give it to the crew member yourself.
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>NEW PASSWORD * (min 8 characters)</label>
          <input style={S.input} type="password" autoComplete="new-password" value={newPwd}
                 onChange={e=>setNewPwd(e.target.value)} />
        </div>
        <div style={S.formGroup}>
          <label style={S.formLabel}>REASON * (goes to the audit trail)</label>
          <input style={S.input} value={pwdReason} onChange={e=>setPwdReason(e.target.value)}
                 placeholder="e.g. demo account handover" />
        </div>
        <div style={{fontSize:10,color:C.t3,marginBottom:4}}>{pwdTarget.email||'no e-mail on file'}</div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}>
          <button style={S.btnSecondary} onClick={closePwd}>CANCEL</button>
          <button style={S.btnPrimary} onClick={handleSetPwd} disabled={saving||newPwd.length<8||pwdReason.trim().length<3}>
            {saving?'SAVING...':'SET PASSWORD'}
          </button>
        </div>
      </Modal>)}
      {showAdd&&(<Modal title="ADD CREW MEMBER" onClose={()=>setShowAdd(false)} width={480}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><div style={S.formGroup}><label style={S.formLabel}>FULL NAME *</label><input style={S.input} placeholder="Capt. Ali Veli" value={addForm.full_name} onChange={e=>setAddForm(p=>({...p,full_name:e.target.value}))}/></div><div style={S.formGroup}><label style={S.formLabel}>CODE *</label><input style={S.input} placeholder="AAK" maxLength={5} value={addForm.code} onChange={e=>setAddForm(p=>({...p,code:e.target.value.toUpperCase()}))}/></div><div style={S.formGroup}><label style={S.formLabel}>EMAIL *</label><input style={S.input} placeholder="pilot@airline.com" type="email" value={addForm.email} onChange={e=>setAddForm(p=>({...p,email:e.target.value}))}/></div><div style={S.formGroup}><label style={S.formLabel}>TEMP PASSWORD *</label><input style={S.input} placeholder="Min 8 chars" type="password" value={addForm.password} onChange={e=>setAddForm(p=>({...p,password:e.target.value}))}/></div></div><div style={S.formGroup}><label style={S.formLabel}>ROLE</label><select style={S.select} value={addForm.role} onChange={e=>setAddForm(p=>({...p,role:e.target.value}))}><option value="pilot">Pilot</option><option value="admin">Admin</option><option value="dispatcher">Dispatcher</option><option value="admin_pilot">Admin + Pilot</option></select></div><div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}><button style={S.btnSecondary} onClick={()=>setShowAdd(false)}>CANCEL</button><button style={S.btnPrimary} onClick={handleAddCrew} disabled={saving}>{saving?'CREATING...':'CREATE CREW MEMBER'}</button></div></Modal>)}
      {deleteModal&&deleteTarget&&!deleteConfirm&&(<Modal title="DELETE CREW MEMBER" onClose={()=>{setDeleteModal(false);setDeleteTarget(null);}}><div style={{fontSize:12,color:'var(--red)',marginBottom:16,padding:'10px 12px',background:'rgba(224,32,32,0.08)',border:'1px solid rgba(224,32,32,0.2)'}}>This will permanently delete the crew member and all their qualifications.</div><DetailRow label="Name" value={deleteTarget.full_name} accent/><DetailRow label="Code" value={deleteTarget.code}/><DetailRow label="Email" value={deleteTarget.email}/><div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}><button style={S.btnSecondary} onClick={()=>{setDeleteModal(false);setDeleteTarget(null);}}>CANCEL</button><button style={S.btnDanger} onClick={()=>setDeleteConfirm(true)}>CONTINUE</button></div></Modal>)}
      {deleteModal&&deleteTarget&&deleteConfirm&&(<Modal title="CONFIRM DELETION" onClose={()=>{setDeleteModal(false);setDeleteTarget(null);setDeleteConfirm(false);}}><div style={{fontSize:14,color:'var(--t1)',textAlign:'center',padding:'20px 0'}}>Are you sure you want to delete<br/><span style={{color:'var(--red)',fontWeight:700}}>{deleteTarget.full_name}</span>?<br/><span style={{fontSize:11,color:C.t3}}>This action cannot be undone.</span></div><div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}><button style={S.btnSecondary} onClick={()=>{setDeleteModal(false);setDeleteTarget(null);setDeleteConfirm(false);}}>NO — CANCEL</button><button style={S.btnDanger} onClick={handleDeleteConfirm} disabled={saving}>{saving?'DELETING...':'YES — DELETE'}</button></div></Modal>)}
      {showEfb&&selected&&(<Modal title="EFB TRAINING RECORD — AMC 20-25" onClose={()=>setShowEfb(false)}><div style={S.formGroup}><label style={S.formLabel}>TRAINING TYPE</label><select style={S.select} value={efbForm.efb_training_type} onChange={e=>setEfbForm(p=>({...p,efb_training_type:e.target.value}))}><option value="Initial">Initial</option><option value="Recurrent">Recurrent</option><option value="Differences">Differences</option><option value="OJT">OJT</option></select></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><div style={S.formGroup}><label style={S.formLabel}>TRAINING DATE *</label><input type="date" style={S.input} value={efbForm.efb_training_date} onChange={e=>setEfbForm(p=>({...p,efb_training_date:e.target.value}))}/></div><div style={S.formGroup}><label style={S.formLabel}>VALID UNTIL</label><input type="date" style={S.input} value={efbForm.efb_training_valid_until} onChange={e=>setEfbForm(p=>({...p,efb_training_valid_until:e.target.value}))}/></div></div><div style={S.formGroup}><label style={S.formLabel}>TRAINED BY</label><input style={S.input} placeholder="Name or organization" value={efbForm.efb_trained_by} onChange={e=>setEfbForm(p=>({...p,efb_trained_by:e.target.value}))}/></div><div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}><button style={S.btnSecondary} onClick={()=>setShowEfb(false)}>CANCEL</button><button style={S.btnPrimary} onClick={handleSaveEfb}>SAVE RECORD</button></div></Modal>)}
      {showQual&&selected&&(<Modal title="ADD QUALIFICATION" onClose={()=>setShowQual(false)}><div style={S.formGroup}><label style={S.formLabel}>AIRCRAFT TYPE *</label><input style={S.input} placeholder="GLF4" value={qualForm.ac_type} onChange={e=>setQualForm(p=>({...p,ac_type:e.target.value.toUpperCase()}))}/></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><div style={S.formGroup}><label style={S.formLabel}>SEAT</label><select style={S.select} value={qualForm.seat} onChange={e=>setQualForm(p=>({...p,seat:e.target.value}))}><option value="CPT">CPT</option><option value="FO">FO</option><option value="BOTH">BOTH</option></select></div><div style={S.formGroup}><label style={S.formLabel}>HAND</label><select style={S.select} value={qualForm.hand} onChange={e=>setQualForm(p=>({...p,hand:e.target.value}))}><option value="LH">LH</option><option value="RH">RH</option><option value="BOTH">BOTH</option></select></div></div><div style={S.formGroup}><label style={S.formLabel}>LANDING CATEGORY</label><select style={S.select} value={qualForm.landing_cat} onChange={e=>setQualForm(p=>({...p,landing_cat:e.target.value}))}><option value="CAT1">CAT I</option><option value="CAT2">CAT II</option><option value="CAT3">CAT III</option></select></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}><div style={S.formGroup}><label style={S.formLabel}>VALID FROM</label><input type="date" style={S.input} value={qualForm.valid_from} onChange={e=>setQualForm(p=>({...p,valid_from:e.target.value}))}/></div><div style={S.formGroup}><label style={S.formLabel}>VALID UNTIL</label><input type="date" style={S.input} value={qualForm.valid_until} onChange={e=>setQualForm(p=>({...p,valid_until:e.target.value}))}/></div></div><div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20}}><button style={S.btnSecondary} onClick={()=>setShowQual(false)}>CANCEL</button><button style={S.btnPrimary} onClick={handleAddQual}>SAVE</button></div></Modal>)}
    </div>
  );
}

// ─── 5. Statistics ────────────────────────────────────────────────────────────
function Statistics({customerId=null}){
  const[flights,setFlights]=useState([]);const[pilots,setPilots]=useState([]);const[aircraft,setAircraft]=useState([]);
  const[loading,setLoading]=useState(true);const[filterReg,setFilterReg]=useState('');const[filterCrew,setFilterCrew]=useState('');
  // Sirket filtresi ACIKCA yaziliyor — RLS'e birakmak super admin icin bozuluyor.
  // archived_flights'ta customer_id yok, bag plan uzerinden; filtre istemcide.
  useEffect(()=>{ (async()=>{ setLoading(true);
    let pq=supabase.from('profiles').select('id,full_name,code').in('role',['pilot','admin_pilot']).order('full_name');
    let aq=supabase.from('aircraft').select('registration').order('registration');
    if(customerId){ pq=pq.eq('customer_id',customerId); aq=aq.eq('customer_id',customerId); }
    const[{data:f},{data:p},{data:a}]=await Promise.all([
      supabase.from('archived_flights').select('*,plans(customer_id,dep,dest,reg,ac_type,pf_pilot,pm_pilot)').order('archived_at',{ascending:false}),
      pq, aq,
    ]);
    setFlights((f||[]).filter(x=>!customerId||!x.plans||x.plans.customer_id===customerId));
    setPilots(p||[]);setAircraft(a||[]); setLoading(false); })(); },[customerId]);
  const fmt=m=>m?`${Math.floor(m/60)}:${String(m%60).padStart(2,'0')}`:'0:00';
  const filtered=flights.filter(f=>{ const reg=f.plans?.reg||''; const pfId=f.plans?.pf_pilot||f.pf_id||''; const pmId=f.plans?.pm_pilot||f.sic_id||''; return(!filterReg||reg===filterReg)&&(!filterCrew||(pfId===filterCrew||pmId===filterCrew)); });
  const calcStats=arr=>({total:arr.length,totalFlightMins:arr.reduce((s,f)=>s+(f.airborne_minutes||0),0),totalBlockMins:arr.reduce((s,f)=>s+(f.block_minutes||0),0),totalLandings:arr.reduce((s,f)=>s+(f.landing_count||0),0),nightLandings:arr.filter(f=>f.is_night_landing).length});
  const stats=calcStats(filtered);
  const selPilot=pilots.find(p=>p.id===filterCrew);
  const title=filterReg&&filterCrew?`${filterReg} · ${selPilot?.code||''}`:filterReg?filterReg:filterCrew?`${selPilot?.code} — ${selPilot?.full_name}`:'ALL FLIGHTS';
  return(
    <div style={{flex:1,overflowY:'auto'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',background:C.bg3}}>
        <span style={S.label}>FILTER:</span>
        <select style={{...S.select,width:140}} value={filterReg} onChange={e=>setFilterReg(e.target.value)}><option value="">All Aircraft</option>{aircraft.filter(a=>a.registration).map(a=>(<option key={a.registration} value={a.registration}>{a.registration}</option>))}</select>
        <select style={{...S.select,width:200}} value={filterCrew} onChange={e=>setFilterCrew(e.target.value)}><option value="">All Crew</option>{pilots.map(p=>(<option key={p.id} value={p.id}>{p.code} — {p.full_name}</option>))}</select>
        {(filterReg||filterCrew)&&(<button style={{...S.btnSecondary,fontSize:11,padding:'5px 12px'}} onClick={()=>{setFilterReg('');setFilterCrew('');}}>CLEAR</button>)}
        <span style={{...S.label,marginLeft:'auto',color:C.accent}}>{title}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:1,background:C.border,borderBottom:`1px solid ${C.border}`}}>
        {loading?<div style={{padding:24,color:C.t3,fontSize:11,gridColumn:'1/-1',textAlign:'center'}}>LOADING...</div>:[{label:'Total Flights',value:stats.total},{label:'Flight Hours',value:fmt(stats.totalFlightMins)},{label:'Block Hours',value:fmt(stats.totalBlockMins)},{label:'Total Landings',value:stats.totalLandings},{label:'Night Landings',value:stats.nightLandings}].map(({label,value})=>(<div key={label} style={{background:C.bg2,padding:'16px 20px'}}><div style={S.label}>{label}</div><div style={{fontSize:22,fontWeight:700,color:C.accent,fontFamily:'var(--mono)',marginTop:6}}>{value}</div></div>))}
      </div>
      <div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`}}><span style={{...S.label,fontSize:10}}>{filtered.length} FLIGHTS</span></div>
      <SortableTable flights={filtered} fmt={fmt}/>
    </div>
  );
}

function SortableTable({flights, fmt}){
  const[sortKey,setSortKey]=useState('archived_at');const[sortDir,setSortDir]=useState('desc');
  const COLS=[{key:'archived_at',label:'DATE'},{key:'dep',label:'DEP'},{key:'dest',label:'DEST'},{key:'reg',label:'REG'},{key:'block_minutes',label:'BLOCK'},{key:'airborne_minutes',label:'FLIGHT'},{key:'landing_count',label:'LANDINGS'},{key:'is_night_landing',label:'NIGHT'}];
  const toggle=(key)=>{ if(sortKey===key)setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortKey(key);setSortDir('asc');} };
  const getValue=(f,key)=>{ if(key==='dep')return f.departure_icao||f.plans?.dep||''; if(key==='dest')return f.destination_icao||f.plans?.dest||''; if(key==='reg')return f.plans?.reg||''; return f[key]??''; };
  const sorted=[...flights].sort((a,b)=>{ const av=getValue(a,sortKey),bv=getValue(b,sortKey); const dir=sortDir==='asc'?1:-1; if(typeof av==='number'&&typeof bv==='number')return(av-bv)*dir; return String(av).localeCompare(String(bv))*dir; });
  const icon=(key)=>{ if(sortKey!==key)return<span style={{color:'var(--t3)',marginLeft:4}}>⇅</span>; return<span style={{color:C.accent,marginLeft:4}}>{sortDir==='asc'?'↑':'↓'}</span>; };
  const [adminReportPlan, setAdminReportPlan] = React.useState(null);
  return(<>{adminReportPlan && <FlightReport plan={adminReportPlan} onClose={()=>setAdminReportPlan(null)}/>}<table style={S.table}><thead><tr>{COLS.map(c=>(<th key={c.key} style={{...S.th,cursor:'pointer',userSelect:'none'}} onClick={()=>toggle(c.key)}>{c.label}{icon(c.key)}</th>))}</tr></thead><tbody>{sorted.map(f=>(<tr key={f.id}><td style={S.td}>{f.archived_at?new Date(f.archived_at).toLocaleDateString('en-GB'):'—'}</td><td style={{...S.td,color:C.accent}}>{f.departure_icao||f.plans?.dep||'—'}</td><td style={{...S.td,color:C.accent}}>{f.destination_icao||f.plans?.dest||'—'}</td><td style={S.td}>{f.plans?.reg||'—'}</td><td style={S.td}>{fmt(f.block_minutes)}</td><td style={S.td}>{fmt(f.airborne_minutes)}</td><td style={S.td}>{f.landing_count||'—'}</td><td style={S.td}>{f.is_night_landing?<span style={S.badge('blue')}>NIGHT</span>:'—'}</td><td style={S.td}><button onClick={()=>setAdminReportPlan({id:f.plan_id,reg:f.plans?.reg,dep:f.departure_icao||f.plans?.dep,dest:f.destination_icao||f.plans?.dest,date:f.archived_at?new Date(f.archived_at).toLocaleDateString('en-GB'):'—',ac_type:f.plans?.ac_type,pf_pilot:f.plans?.pf_pilot,pm_pilot:f.plans?.pm_pilot})} style={{background:'rgba(56,189,248,0.12)',border:'1px solid var(--accent)',borderRadius:4,padding:'2px 7px',fontSize:10,fontWeight:700,color:'var(--accent)',cursor:'pointer',fontFamily:'inherit'}}>📄 RPT</button></td></tr>))}</tbody></table></>);
}

// ─── 6. RASS ──────────────────────────────────────────────────────────────────
// readOnly: super admin baska sirketi izliyor. ADD AIRPORT'u GIZLEMEK SART —
// addAirport() hedefi rpc('my_customer_id') ile buluyor, yani GO2Demo izlenirken
// eklenen meydan SESSIZCE REC'e yazilirdi. RLS bunu engellemez (kendi sirketine
// yazmak mesrudur); tek kapi arayuzdur.
function StationInfo({toast,customerId=null,readOnly=false}){
  const [airports,setAirports]=useState([]);const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');const [selected,setSelected]=useState(null);
  const [riskModal,setRiskModal]=useState(null);const [showAddAirport,setShowAddAirport]=useState(false);
  const [newAirport,setNewAirport]=useState({icao:'',name:'',category:'B'});
  useEffect(()=>{ setLoading(true); let q=supabase.from('airport_risks').select('icao,name,country,category,base_score,risk_level,ops_approval,ad_elev_ft,max_s,max_l,mitigation').order('icao'); if(customerId){q=q.eq('customer_id',customerId);} q.then(({data})=>{setAirports(data||[]);setLoading(false);}); },[customerId]);
  const filtered=airports.filter(a=>!search||a.icao.toLowerCase().includes(search.toLowerCase())||(a.name||'').toLowerCase().includes(search.toLowerCase()));
  const sel=airports.find(a=>a.icao===selected);
  const riskBadge=(level)=>{ const textColors={LOW:'var(--accent)',MEDIUM:'var(--amber)',HIGH:'var(--orange)',EXTREME:'var(--red)'}; return(<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',background:level==='LOW'?C.blueDim:level==='MEDIUM'?'var(--amber-soft)':level==='HIGH'?'var(--amber-soft)':'var(--red-soft)',color:textColors[level]||'var(--t2)',border:`1px solid ${textColors[level]||'var(--t3)'}`}}>{level||'—'}</span>); };
  const addAirport=async()=>{ if(!newAirport.icao)return;
    // 4 Agu bulgusu (LEIB eklenemedi, 42P10): PK BILESIK (icao,customer_id) —
    // onConflict:'icao' tek basina eslesen kisit bulamiyor. customer_id de
    // paylodda YOKTU (Ilke 5 ihlali). RiskSurvey'deki dogru desen buraya alindi.
    const { data: myCid } = await supabase.rpc('my_customer_id');
    if(!myCid){ alert('Şirket bilgisi alınamadı (customer_id boş).'); return; }
    const sb=await askReason('adding this airport'); if(!sb)return;
    const{error}=await sb.from('airport_risks').upsert({customer_id:myCid,icao:newAirport.icao,name:newAirport.name,category:newAirport.category,base_score:0,max_s:1,max_l:1,s_scores:'[]',l_scores:'[]'},{onConflict:'icao,customer_id'}); if(error){alert(error.message);return;} setShowAddAirport(false);setNewAirport({icao:'',name:'',category:'B'}); supabase.from('airport_risks').select('icao,name,country,category,base_score,risk_level,ops_approval,ad_elev_ft,max_s,max_l,mitigation').order('icao').then(({data})=>setAirports(data||[])); };
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto'}}>
        <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}><input placeholder="ICAO veya havalimanı adı..." value={search} onChange={e=>setSearch(e.target.value.toUpperCase())} style={{...S.input,width:260}}/>{!readOnly&&<button style={S.btnPrimary} onClick={()=>setShowAddAirport(true)}>+ ADD AIRPORT</button>}{readOnly&&<span style={{fontSize:10,color:C.red,letterSpacing:1,fontFamily:'var(--mono)'}}>READ ONLY</span>}<span style={{...S.label,marginLeft:'auto'}}>{filtered.length} AIRPORTS</span></div>
        {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
        <table style={S.table}><thead><tr>{['ICAO','AIRPORT NAME','CAT','ELEV FT','BASE SCORE','RISK LEVEL','OPS APPROVAL'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{filtered.map(a=>(<tr key={a.icao} onClick={()=>setSelected(a.icao===selected?null:a.icao)} style={{cursor:'pointer',background:selected===a.icao?`var(--accent-soft)`:'transparent'}}><td style={{...S.td,color:C.accent,fontWeight:700}}>{a.icao}</td><td style={S.td}>{(a.name||'—').toUpperCase()}</td><td style={S.td}><span style={S.badge('blue')}>{a.category||'B'}</span></td><td style={S.td}>{a.ad_elev_ft||'—'}</td><td style={{...S.td,color:C.accent,fontWeight:700}}>{a.base_score||0}</td><td style={S.td}>{riskBadge(a.risk_level)}</td><td style={{...S.td,fontSize:11,color:C.t3}}>{a.ops_approval||'—'}</td></tr>))}</tbody></table>
      </div>
      {sel&&(<DetailPanel title={sel.icao} onClose={()=>setSelected(null)} width={360}><DetailRow label="ICAO" value={sel.icao} accent/><DetailRow label="Name" value={sel.name?sel.name.toUpperCase():sel.name}/><DetailRow label="Category" value={sel.category||'B'}/><DetailRow label="Elevation" value={sel.ad_elev_ft?`${sel.ad_elev_ft} ft`:'—'}/><DetailRow label="Base Score" value={sel.base_score||0}/><DetailRow label="Risk Level" value={sel.risk_level||'—'}/><DetailRow label="Max S" value={sel.max_s||1}/><DetailRow label="Max L" value={sel.max_l||1}/>{sel.mitigation&&(<div style={{padding:'8px 16px',borderBottom:`1px solid ${C.border}`,fontSize:10,color:C.t3,lineHeight:1.7}}>{sel.mitigation}</div>)}{!readOnly&&<div style={{padding:'12px 16px'}}><button style={{...S.btnPrimary,width:'100%'}} onClick={()=>setRiskModal(sel.icao)}>RISK ASSESSMENT MATRIX</button></div>}</DetailPanel>)}
      {showAddAirport&&(<Modal title="ADD AIRPORT" onClose={()=>setShowAddAirport(false)} width={420}><div style={S.formGroup}><label style={S.formLabel}>ICAO CODE *</label><input style={S.input} placeholder="LTFM" maxLength={4} value={newAirport.icao} onChange={e=>setNewAirport(p=>({...p,icao:e.target.value.toUpperCase()}))}/></div><div style={S.formGroup}><label style={S.formLabel}>AIRPORT NAME</label><input style={S.input} placeholder="ISTANBUL AIRPORT" value={newAirport.name} onChange={e=>setNewAirport(p=>({...p,name:up(e.target.value)}))}/></div><div style={S.formGroup}><label style={S.formLabel}>CATEGORY</label><select style={S.select} value={newAirport.category} onChange={e=>setNewAirport(p=>({...p,category:e.target.value}))}><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div><div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:16}}><button style={S.btnSecondary} onClick={()=>setShowAddAirport(false)}>CANCEL</button><button style={S.btnPrimary} onClick={addAirport}>ADD</button></div></Modal>)}
      {riskModal&&(<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.9)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:20}}><div style={{background:'var(--bg3)',border:'1px solid var(--bg3)',width:'100%',maxWidth:640,maxHeight:'90vh',overflowY:'auto',borderRadius:8}}><RiskAssessmentInline icao={riskModal} onClose={()=>setRiskModal(null)}/></div></div>)}
    </div>
  );
}

// Ayni React tuzagi (bkz. EF): bilesen tanimi ebeveynin render govdesinde
// durursa her render'da yeniden yaratilir ve DOM dugumu sokulup takilir.
// Select'te odak kaybi yazmayi engellemez ama acik liste kapanir — desen
// yine yanlis, disari alindi.
function ScoreInput({val,onChange}){
  return (
    <select value={val} onChange={e=>onChange(parseInt(e.target.value))} style={{background:'var(--bg3)',border:'1px solid var(--t3)',color:'var(--t1)',fontSize:11,padding:'3px 6px',borderRadius:3,fontFamily:'var(--mono)',width:44}}>
      {[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}
    </select>
  );
}

function RiskAssessmentInline({icao, onClose}){
  const TOPICS_LIST=['Approach & Traffic Density','Obstacles / Terrain','Seasonal / Meteorology','ATC Phraseology / Language','Complex Taxi Routings','RWY Ops / Late Clearance','Security / Terror Threat','Handling / Fuel / Pax Support','Radio Nav / GNSS Reliability','Other Local Constraints'];
  const ADDONS_LIST=[{key:'night',label:'Night Ops',pts:1},{key:'xw',label:'Strong XW/Gust',pts:2},{key:'wet',label:'RWY Wet/Contam',pts:2},{key:'lv',label:'Low Vis/TS',pts:2},{key:'fam',label:'Crew Low FAM',pts:2}];
  const RISK_C={LOW:{bg:'rgba(56,189,248,0.12)',border:'var(--accent)',text:'var(--accent)'},MEDIUM:{bg:'rgba(232,163,32,0.12)',border:'var(--amber)',text:'var(--amber)'},HIGH:{bg:'rgba(232,115,26,0.12)',border:'var(--orange)',text:'var(--orange)'},EXTREME:{bg:'rgba(224,32,32,0.12)',border:'var(--red)',text:'var(--red)'}};
  const cellC=(score)=>score>=20?{bg:'var(--red-soft)',text:'var(--red)'}:score>=12?{bg:'var(--amber-soft)',text:'var(--orange)'}:score>=6?{bg:'var(--green-soft)',text:'var(--green)'}:{bg:'var(--accent-soft)',text:'var(--accent)'};
  const sColor=(v)=>v>=5?'var(--red)':v>=4?'var(--orange)':v>=3?'var(--amber)':v>=2?'var(--accent)':'var(--green)';
  const getRisk=(t)=>t<=6?'LOW':t<=9?'MEDIUM':t<=12?'HIGH':'EXTREME';
  const getOps=(rl,cat)=>rl==='EXTREME'?'OPS MANAGER APPROVAL REQUIRED':rl==='HIGH'&&cat==='C'?'OPS MANAGER APPROVAL REQUIRED':rl==='HIGH'?'CAPTAIN REVIEW / DISPATCH COORDINATION':'DISPATCH OK';
  const [ap,setAp]=useState(null);const [loading,setLoad]=useState(true);const [addons,setAd]=useState({});const [tab,setTab]=useState('matrix');
  const [editing,setEditing]=useState(false);const [surveyMode,setSurveyMode]=useState(false);const [saving,setSaving]=useState(false);
  const [sEdit,setSEdit]=useState(Array(10).fill(1));const [lEdit,setLEdit]=useState(Array(10).fill(1));const [catEdit,setCatEdit]=useState('B');const [mitEdit,setMitEdit]=useState('');
  useEffect(()=>{ supabase.from('airport_risks').select('*').eq('icao',icao).single().then(({data})=>{ setAp(data); if(data){ const ss=typeof data.s_scores==='string'?JSON.parse(data.s_scores):(data.s_scores||[]); const ls=typeof data.l_scores==='string'?JSON.parse(data.l_scores):(data.l_scores||[]); setSEdit(ss.map(v=>parseFloat(v)||1)); setLEdit(ls.map(v=>parseFloat(v)||1)); setCatEdit(data.category||'B'); setMitEdit(data.mitigation||''); } setLoad(false); }); },[icao]);
  if(loading)return<div style={{padding:32,textAlign:'center',color:'var(--t3)',fontFamily:'var(--mono)'}}>LOADING {icao}...</div>;
  if(!ap)return<div style={{padding:16,color:'var(--red)',fontFamily:'var(--mono)'}}>Not found: {icao}</div>;
  if(surveyMode)return<RiskSurvey icao={icao} airportName={ap.name} airportCat={ap.category} onClose={()=>setSurveyMode(false)} onSaved={()=>{setSurveyMode(false);supabase.from('airport_risks').select('*').eq('icao',icao).single().then(({data})=>setAp(data));}}/>;
  const _ss=typeof ap.s_scores==='string'?JSON.parse(ap.s_scores):(ap.s_scores||[]);const _ls=typeof ap.l_scores==='string'?JSON.parse(ap.l_scores):(ap.l_scores||[]);
  const sArr=editing?sEdit:_ss.map(v=>parseFloat(v)||0);const lArr=editing?lEdit:_ls.map(v=>parseFloat(v)||0);
  const topicScores=sArr.map((sv,i)=>sv*(lArr[i]||0));const baseScore=editing?Math.max(...topicScores,0):(ap.base_score||0);
  const maxSVal=editing?(sArr.reduce((a,b)=>Math.max(a,b),1)):(ap.max_s||1);const maxLVal=editing?(lArr.reduce((a,b)=>Math.max(a,b),1)):(ap.max_l||1);
  const adPts=ADDONS_LIST.reduce((s,a)=>s+(addons[a.key]?a.pts:0),0);const total=baseScore+adPts;const rl=getRisk(total);const rc=RISK_C[rl]||RISK_C.LOW;
  const handleSave=async()=>{ const sb=await askReason('save'); if(!sb)return; setSaving(true); const newBase=Math.max(...topicScores,0);const newMaxS=sEdit.reduce((a,b)=>Math.max(a,b),1);const newMaxL=lEdit.reduce((a,b)=>Math.max(a,b),1);const newRL=getRisk(newBase);const newOps=getOps(newRL,catEdit); const{error}=await sb.from('airport_risks').update({s_scores:JSON.stringify(sEdit),l_scores:JSON.stringify(lEdit),base_score:newBase,max_s:newMaxS,max_l:newMaxL,risk_level:newRL,ops_approval:newOps,category:catEdit,mitigation:mitEdit,updated_at:new Date().toISOString()}).eq('icao',icao); if(error){alert(error.message);}else{const{data}=await supabase.from('airport_risks').select('*').eq('icao',icao).single();setAp(data);setEditing(false);} setSaving(false); };
  const tabS=(t)=>({flex:1,padding:'8px 4px',textAlign:'center',cursor:'pointer',fontFamily:'var(--mono)',fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',color:tab===t?'var(--accent)':'var(--t3)',borderBottom:tab===t?'2px solid var(--accent)':'2px solid transparent',background:'transparent',border:'none'});
  return(
    <div style={{fontFamily:'var(--mono)',color:'var(--t1)'}}>
      <div style={{padding:'14px 18px',background:'var(--bg3)',borderBottom:'1px solid var(--bg3)',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div><div style={{fontSize:20,fontWeight:700,color:'var(--amber)',letterSpacing:2}}>{ap.icao}</div><div style={{fontSize:13,color:'var(--t1)',marginTop:2}}>{ap.name}</div><div style={{fontSize:10,color:'var(--t3)',marginTop:3}}>CAT {editing?catEdit:ap.category||'B'}{ap.ad_elev_ft?` · ${ap.ad_elev_ft} ft`:''}</div></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {!editing?(<button style={{...S.btnSecondary,fontSize:10,padding:'5px 12px'}} onClick={()=>setSurveyMode(true)}>EDIT SCORES</button>):(<><button onClick={()=>setEditing(false)} style={{...S.btnSecondary,fontSize:10,padding:'5px 12px'}}>CANCEL</button><button onClick={handleSave} disabled={saving} style={{...S.btnPrimary,fontSize:10,padding:'5px 12px'}}>{saving?'SAVING...':'SAVE'}</button></>)}
          <button onClick={onClose} style={{background:'none',border:'none',color:'var(--t3)',cursor:'pointer',fontSize:20}}>x</button>
        </div>
      </div>
      {editing&&(<div style={{padding:'8px 12px',background:'var(--bg3)',borderBottom:'1px solid var(--bg3)',display:'flex',gap:16,alignItems:'center'}}><div style={{fontSize:10,color:'var(--t3)',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Category</div><select value={catEdit} onChange={e=>setCatEdit(e.target.value)} style={{background:'var(--bg3)',border:'1px solid var(--t3)',color:'var(--t1)',fontSize:11,padding:'4px 8px',borderRadius:3}}><option value="A">A</option><option value="B">B</option><option value="C">C</option></select><div style={{fontSize:10,color:'var(--t3)',fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>Mitigation</div><input value={mitEdit} onChange={e=>setMitEdit(e.target.value)} style={{...S.input,flex:1,fontSize:11}} placeholder="Brief mitigation note..."/></div>)}
      <div style={{display:'flex',gap:2,margin:'12px 12px 0',background:'var(--bg3)',padding:2}}>
        <div style={{flex:1,background:rc.bg,border:`2px solid ${rc.border}`,padding:'12px 10px',textAlign:'center'}}><div style={{fontSize:36,fontWeight:800,color:rc.text,lineHeight:1}}>{total}</div><div style={{fontSize:9,color:rc.text,opacity:.7,marginTop:2}}>BASE {baseScore}{adPts>0?` + ${adPts}`:''}</div></div>
        <div style={{flex:2,background:'var(--bg3)',border:`2px solid ${rc.border}`,padding:'12px 14px'}}><div style={{fontSize:18,fontWeight:800,color:rc.text}}>{rl}</div><div style={{fontSize:10,color:rc.text,opacity:.8,marginTop:4}}>{getOps(rl,editing?catEdit:ap.category)}</div></div>
        <div style={{flex:2,background:'var(--bg3)',border:'2px solid var(--bg3)',padding:'12px 14px',fontSize:10,color:'var(--t2)',lineHeight:1.8}}><div>MAX S: <span style={{color:'var(--t1)',fontWeight:700}}>{maxSVal}</span></div><div>MAX L: <span style={{color:'var(--t1)',fontWeight:700}}>{maxLVal}</span></div><div style={{marginTop:4,color:'var(--t3)',fontSize:9}}>{(editing?mitEdit:ap.mitigation||'').slice(0,60)}</div></div>
      </div>
      <div style={{margin:'10px 12px 0',background:'var(--bg3)',border:'1px solid var(--bg3)',padding:'10px 12px'}}><div style={{fontSize:9,color:'var(--t3)',fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:'uppercase'}}>Operasyonel Faktörler</div><div style={{display:'flex',flexWrap:'wrap',gap:6}}>{ADDONS_LIST.map(a=>(<div key={a.key} onClick={()=>setAd(p=>({...p,[a.key]:!p[a.key]}))} style={{cursor:'pointer',padding:'5px 10px',borderRadius:4,fontSize:10,fontWeight:700,background:addons[a.key]?'rgba(232,115,26,0.2)':'var(--bg3)',border:`1px solid ${addons[a.key]?'var(--orange)':'var(--t3)'}`,color:addons[a.key]?'var(--orange)':'var(--t3)'}}>{addons[a.key]?'✓':'+'} {a.label} (+{a.pts})</div>))}</div></div>
      <div style={{display:'flex',margin:'10px 12px 0',borderBottom:'1px solid var(--bg3)'}}><button style={tabS('matrix')} onClick={()=>setTab('matrix')}>5×5 Matrix</button><button style={tabS('topics')} onClick={()=>setTab('topics')}>{editing?'✏ Edit Scores':'Topic Scores'}</button><button style={tabS('briefing')} onClick={()=>setTab('briefing')}>PPS Briefing</button></div>
      <div style={{margin:'0 12px 12px',background:'var(--bg3)',border:'1px solid var(--bg3)',overflowX:'auto'}}>
        {tab==='matrix'&&(<div style={{padding:12}}><div style={{fontSize:9,color:'var(--t3)',marginBottom:8}}>Mevcut: S={maxSVal} × L={maxLVal} → Base {baseScore} · Total {total}</div><div style={{display:'grid',gridTemplateColumns:'24px repeat(5,1fr)',gap:2,marginBottom:2}}><div style={{fontSize:9,color:'var(--t3)',textAlign:'center'}}>L\S</div>{[1,2,3,4,5].map(sv=><div key={sv} style={{fontSize:9,color:'var(--t3)',textAlign:'center',fontWeight:700}}>S{sv}</div>)}</div>{[5,4,3,2,1].map(lv=>(<div key={lv} style={{display:'grid',gridTemplateColumns:'24px repeat(5,1fr)',gap:2,marginBottom:2}}><div style={{fontSize:9,color:'var(--t3)',textAlign:'center',fontWeight:700,alignSelf:'center'}}>L{lv}</div>{[1,2,3,4,5].map(sv=>{const cs=lv*sv;const cc=cellC(cs);const isCur=lv===maxLVal&&sv===maxSVal;return<div key={sv} style={{background:cc.bg,border:isCur?`2px solid ${rc.border}`:'1px solid var(--bg3)',borderRadius:3,padding:'6px 0',textAlign:'center',fontSize:isCur?13:11,fontWeight:isCur?800:600,color:cc.text}}>{isCur?'▶':''}{cs}</div>;})})</div>))}</div>)}
        {tab==='topics'&&(<div style={{padding:8}}>{editing&&(<div style={{padding:'6px 8px',marginBottom:4,background:'rgba(232,115,26,0.08)',border:'1px solid rgba(232,115,26,0.2)',fontSize:10,color:'var(--orange)'}}>S = Severity (1-5) · L = Likelihood (1-5) · Max score auto-calculated</div>)}{TOPICS_LIST.map((topic,i)=>{ const sv=editing?sEdit[i]||1:parseFloat(sArr[i])||0; const lv=editing?lEdit[i]||1:parseFloat(lArr[i])||0; const score=Math.round(sv*lv); return(<div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 8px',borderBottom:'1px solid var(--line-soft)'}}><div style={{flex:1,fontSize:10,color:'var(--t2)'}}>{i+1}. {topic}</div>{editing?(<><ScoreInput val={sv} onChange={v=>setSEdit(p=>{const n=[...p];n[i]=v;return n;})}/><div style={{fontSize:9,color:'var(--t3)'}}>×</div><ScoreInput val={lv} onChange={v=>setLEdit(p=>{const n=[...p];n[i]=v;return n;})}/></>):(<><div style={{background:sColor(sv),color:'var(--t1)',borderRadius:3,padding:'2px 6px',fontSize:10,fontWeight:700,width:28,textAlign:'center'}}>S{sv}</div><div style={{fontSize:9,color:'var(--t3)'}}>×</div><div style={{background:sColor(lv),color:'var(--t1)',borderRadius:3,padding:'2px 6px',fontSize:10,fontWeight:700,width:28,textAlign:'center'}}>L{lv}</div></>)}<div style={{fontSize:11,fontWeight:700,color:sColor(Math.max(sv,lv)),width:28,textAlign:'right'}}>{score}</div></div>); })}</div>)}
        {tab==='briefing'&&(<div style={{padding:12}}>{[{title:'SECTION 1 — Traffic / ATC / Taxi / RWY Ops',key:'section1'},{title:'SECTION 2 — Meteorology / Wind',key:'section2'},{title:'SECTION 3 — Security / Handling / Nav',key:'section3'}].map(sec=>ap[sec.key]?(<div key={sec.key} style={{marginBottom:12}}><div style={{fontSize:9,color:'var(--accent)',fontWeight:700,letterSpacing:1,marginBottom:6,textTransform:'uppercase'}}>{sec.title}</div><div style={{fontSize:11,color:'var(--t2)',lineHeight:1.8,whiteSpace:'pre-line',padding:'8px 10px',background:'var(--bg3)',borderLeft:'2px solid rgba(56,189,248,0.2)'}}>{ap[sec.key]}</div></div>):null)}<div style={{marginTop:16,borderTop:'1px solid var(--bg3)',paddingTop:12}}><div style={{fontSize:9,color:'var(--accent)',fontWeight:700,letterSpacing:1,marginBottom:8,textTransform:'uppercase'}}>Assessment History</div><AssessmentHistory icao={icao}/></div></div>)}
      </div>
    </div>
  );
}

// ─── 7. FLT Logs & Times ─────────────────────────────────────────────────────
function FltLogsAndTimes({customerId=null}){
  const[plans,setPlans]=useState([]);const[selected,setSelected]=useState(null);const[filter,setFilter]=useState({dep:'',dest:''});const[loadingP,setLoadingP]=useState(true);
  useEffect(()=>{(async()=>{setLoadingP(true);let q=supabase.from('plans').select('id,dep,dest,date,dispatch_no,reg,status,created_at').in('status',['active','archived']).order('created_at',{ascending:false}).limit(200); if(customerId){q=q.eq('customer_id',customerId);} const{data}=await q;setPlans(data||[]);setLoadingP(false);})();},[customerId]);
  const filteredPlans=plans.filter(p=>(!filter.dep||(p.dep||'').toLowerCase().includes(filter.dep.toLowerCase()))&&(!filter.dest||(p.dest||'').toLowerCase().includes(filter.dest.toLowerCase())));
  const selectedPlan=plans.find(p=>p.id===selected);
  return(
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      <div style={{width:280,borderRight:`1px solid ${C.border}`,display:'flex',flexDirection:'column',flexShrink:0}}>
        <div style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:6,flexDirection:'column'}}><div style={{display:'flex',gap:6}}><input placeholder="DEP" value={filter.dep} onChange={e=>setFilter(p=>({...p,dep:e.target.value}))} style={{...S.input,width:'50%',fontSize:12}}/><input placeholder="DEST" value={filter.dest} onChange={e=>setFilter(p=>({...p,dest:e.target.value}))} style={{...S.input,width:'50%',fontSize:12}}/></div><span style={{...S.label,fontSize:10}}>{filteredPlans.length} FLIGHTS</span></div>
        <div style={{flex:1,overflowY:'auto'}}>{loadingP&&<div style={{padding:20,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}{filteredPlans.map(p=>(<div key={p.id} onClick={()=>setSelected(p.id===selected?null:p.id)} style={{padding:'10px 12px',borderBottom:`1px solid ${C.border}`,cursor:'pointer',background:selected===p.id?`var(--accent-soft)`:'transparent',borderLeft:`3px solid ${selected===p.id?C.accent:'transparent'}`}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:13,fontWeight:700,color:C.accent,fontFamily:'var(--mono)'}}>{p.dep} → {p.dest}</span><span style={S.badge(p.status==='active'?'green':'')}>{p.status==='active'?'ACTIVE':'ARCH'}</span></div><div style={{fontSize:11,color:C.t3,marginTop:3,fontFamily:'var(--mono)'}}>{p.date||'—'}  ·  {p.reg||'—'}</div><div style={{fontSize:10,color:C.t3,marginTop:2,fontFamily:'var(--mono)'}}>{p.dispatch_no||p.id.slice(0,8)}</div></div>))}</div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        {!selected&&<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:C.t3,fontSize:13,letterSpacing:2}}>SELECT A FLIGHT</div>}
        {selected&&(<><div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,background:C.bg3,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><span style={{fontSize:14,fontWeight:700,color:C.accent,fontFamily:'var(--mono)'}}>{selectedPlan?.dep} → {selectedPlan?.dest}</span><span style={{fontSize:11,color:C.t3,marginLeft:12,fontFamily:'var(--mono)'}}>{selectedPlan?.date}  ·  {selectedPlan?.reg}</span></div></div><div style={{flex:1,overflow:'hidden'}}><ModuleLogView planId={selected} live={selectedPlan?.status==='active'}/></div></>)}
      </div>
    </div>
  );
}

// ─── 8. Edit Reports ──────────────────────────────────────────────────────────
function EditReports({customerId=null}){
  const[reports,setReports]=useState([]);const[loading,setLoading]=useState(true);const[filter,setFilter]=useState('');
  // admin_edits'te customer_id yok, bag plan uzerinden -> filtre istemcide.
  // IKI KAYNAK TEK LISTEDE (11 Agu 2026 — Serkan'in mimari kurali, md.6):
  // musterinin KENDI duzeltmeleri (admin_edits) + APP SAHIBININ o sirkette
  // yaptigi HER SEY (superadmin_log). Serkan: "super admin kime edit yaparsa
  // O GORMELI, yoksa cok buyuk sorun."
  // Kapsam: superadmin_log'un RLS'i sirket adminini kendi satirlariyla
  // sinirlar; super admin izlerken de customerId ile suzulur. Yani kural
  // butun musteriler icin ayni sekilde isler, demoya ozel bir sey yok.
  useEffect(()=>{ (async()=>{ setLoading(true);
    const flat=(v)=>v==null?'':(typeof v==='object'?JSON.stringify(v):String(v)).replace(/^"|"$/g,'');
    const [ae,sa]=await Promise.all([
      supabase.from('admin_edits').select('id,created_at,edit_type,field_name,old_value,new_value,reason,plan_id,plans:plan_id(customer_id,dep,dest,date)').order('created_at',{ascending:false}).limit(500),
      supabase.from('superadmin_log').select('id,at,type,table_name,op,field,old_value,new_value,reason,customer_id').order('at',{ascending:false}).limit(500),
    ]);
    const own=(ae.data||[]).filter(r=>!customerId||!r.plans||r.plans.customer_id===customerId);
    const sup=(sa.data||[]).filter(r=>!customerId||r.customer_id===customerId).map(r=>({
      id:'sa_'+r.id, created_at:r.at, edit_type:'GO2 SUPPORT', _go2:true,
      _table:r.table_name, _op:r.op, _kind:r.type,
      field_name:r.field, old_value:flat(r.old_value), new_value:flat(r.new_value), reason:r.reason,
    }));
    setReports([...own,...sup].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)));
    setLoading(false); })(); },[customerId]);
  const filtered=reports.filter(r=>!filter||r.field_name?.toLowerCase().includes(filter.toLowerCase())||r.reason?.toLowerCase().includes(filter.toLowerCase())||`${r.plans?.dep}${r.plans?.dest}`.toLowerCase().includes(filter.toLowerCase()));
  return(
    <div style={{flex:1,overflowY:'auto'}}>
      <div style={{padding:'10px 16px',borderBottom:`1px solid ${C.border}`,display:'flex',gap:10,alignItems:'center'}}><input placeholder="Search by route, field, reason..." value={filter} onChange={e=>setFilter(e.target.value)} style={{...S.input,width:300}}/><span style={{...S.label,marginLeft:'auto'}}>{filtered.length} REPORTS</span></div>
      {loading&&<div style={{padding:32,textAlign:'center',color:C.t3,fontSize:11}}>LOADING...</div>}
      {!loading&&filtered.length===0&&<div style={{padding:48,textAlign:'center',color:C.t3,fontSize:11,letterSpacing:2}}>NO REPORTS</div>}
      <table style={S.table}><thead><tr>{['DATE','TYPE','FLIGHT','FIELD','OLD VALUE','NEW VALUE','REASON'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead><tbody>{filtered.map(r=>(<tr key={r.id}><td style={{...S.td,fontSize:11,whiteSpace:'nowrap'}}>{new Date(r.created_at).toLocaleString('en-GB')}</td><td style={S.td}><span style={S.badge(r._go2?'amber':(r.edit_type==='DELETE'?'red':''))}>{r._go2?'GO2 SUPPORT':(r.edit_type||'EDIT')}</span>{r._go2&&<div style={{fontSize:9,color:C.t3,marginTop:3}}>{r._table} · {r._op||r._kind}</div>}</td><td style={{...S.td,color:C.accent,fontWeight:700}}>{r.plans?`${r.plans.dep} → ${r.plans.dest}`:(r._go2?(r._table||'—'):(r.plan_id?.slice(0,8)||'—'))}</td><td style={{...S.td,color:C.accent}}>{r.field_name||'—'}</td><td style={{...S.td,color:C.t3,fontSize:12}}>{String(r.old_value||'—').slice(0,30)}</td><td style={{...S.td,color:'var(--green)',fontSize:12}}>{String(r.new_value||'—').slice(0,30)}</td><td style={{...S.td,color:C.t2,maxWidth:320,fontSize:12}}>{r.reason||'—'}</td></tr>))}</tbody></table>
    </div>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────
// feature: bu sekmeyi acan/kapatan katalog anahtari. Anahtari OLMAYAN sekme
// CEKIRDEKTIR, kapatilamaz (katalogda olan = kapatilabilir olan).
const NAV=[
  {id:'active',   icon:'●', label:'Active FLTs'},
  {id:'archived', icon:'◎', label:'Archived FLTs'},
  {id:'aircrafts',icon:'✈', label:'Aircrafts'},
  {id:'crews',    icon:'◈', label:'Crews'},
  {id:'ftl',      icon:'⏱', label:'FTL',    feature:'admin.ftl'},
  {id:'stats',    icon:'▦', label:'Statistics'},
  {id:'opscalc',  icon:'∑', label:'Ops Calculator'},
  {id:'stations', icon:'◉', label:'RAAQ',   feature:'admin.raaq'},
  {id:'logs',     icon:'≡', label:'FLTs Logs & Times'},
  {id:'reports',  icon:'R', label:'Edit Reports'},
];

// ─── AdminPanel ───────────────────────────────────────────────────────────────
// SUPER ADMIN KAPSAMI (10 Agu 2026)
// customerId verilirse panel BASKA bir sirketin verisini gosterir ve SALT OKUNUR
// calisir (yazma RLS'te de kapali: policy'ler customer_id = my_customer_id() ister).
//
// Alt panellerin cogu "giris yapanin sirketi" varsayimiyla yazilmis. Kapsami
// DOGRULANMIS olanlar asagida sayilidir; digerleri kapsam modunda ACIKCA
// "henuz kapsama alinmadi" der. Baslikta GO2Demo yazarken REC'in ucuslarini
// gostermek Ilke 1'in ihlalidir — bos birakmak degil, SEBEBINI yazmak dogrudur.
// 10 Agu 2026: on panelin tamami kapsama alindi.
const SCOPED_TABS = ['active', 'archived', 'crews', 'aircrafts', 'ftl', 'stats', 'stations', 'logs', 'reports', 'opscalc'];

// Kapsama alinmamis panel: BOS birakilmaz, sebebi yazilir (Ilke 1).
function NotScopedYet({ tab, companyName }) {
  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
      <div style={{ maxWidth:460, textAlign:'center' }}>
        <div style={{ fontSize:12, color:C.red, fontWeight:700, letterSpacing:1, marginBottom:10 }}>NOT SCOPED TO {(companyName||'').toUpperCase()}</div>
        <div style={{ fontSize:12, color:C.t2, lineHeight:1.7 }}>
          Bu panel henüz şirket kapsamına alınmadı; açılırsa <b>kendi şirketinin</b> verisini
          gösterirdi. Yanlış şirketin verisini doğruymuş gibi göstermektense
          göstermemeyi seçtik.
        </div>
        <div style={{ fontSize:11, color:C.t3, marginTop:10 }}>Panel: {tab.toUpperCase()}</div>
      </div>
    </div>
  );
}

export default function AdminPanel({onBack, customerId=null, companyName=null}){
  const [tab,         setTab]         = useState('active');
  const [ready,       setReady]       = useState(false);
  const [user,        setUser]        = useState(null);
  const [myProfile,   setMyProfile]   = useState(null);
  const [features,    setFeatures]    = useState({});
  const [toast,       setToast]       = useState({msg:'',type:'success'});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile,    setIsMobile]    = useState(window.innerWidth < 900);

  const showToast = useCallback((msg,type='success') => setToast({msg,type}), []);

  // KAPSAM TEK YERDE HESAPLANIR ve HER ZAMAN doludur.
  // customerId = "baska sirketi izliyorum" (banner + salt okunur icin)
  // scopeId    = sorgularin filtresi; izleme yoksa kullanicinin kendi sirketi
  // Filtreyi RLS'e birakmak super admin icin SESSIZCE bozuluyor: super adminin
  // okuma politikalari cok kiracilidir, filtresiz sorgu butun sirketleri getirir.
  const scopeId = customerId || myProfile?.customer_id || null;

  // Sirketin ozellik konfigurasyonu. Okunamazsa {} kalir -> isEnabled her seye
  // ACIK der (Kural 8: belirsizlik = acik; kapaliya dusmek kapi kaldirmaktir).
  useEffect(() => {
    if (!scopeId) return;
    let alive = true;
    supabase.from('customers').select('features').eq('id', scopeId).single()
      .then(({ data }) => { if (alive) setFeatures(data?.features || {}); });
    return () => { alive = false; };
  }, [scopeId]);

  const navItems = NAV.filter(n => !n.feature || isEnabled(features, n.feature));

  // Acik sekme kapatildiysa ilk acik sekmeye dus (bos ekranda kalma).
  useEffect(() => {
    if (tab !== 'help' && !navItems.some(n => n.id === tab)) {
      setTab(navItems[0]?.id || 'help');
    }
  }, [navItems, tab]);

  // Resize dinle
  useEffect(() => {
    const handle = () => {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(false);
    };
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);

  // Tab değişince sidebar kapat
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [tab, isMobile]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { onBack(); return; }
      setUser(session.user);
      const { data: prof } = await supabase.from('profiles').select('id,role,customer_id,is_super_admin').eq('id', session.user.id).single();
      setMyProfile(prof || null);
      setReady(true);
    })();
  }, [onBack]);

  if (!ready) return (
    <div style={{ display:'flex', width:'100vw', minHeight:'100vh', background:C.bg, alignItems:'center', justifyContent:'center' }}>
      <div style={{ color:C.accent, letterSpacing:3, fontSize:11, fontFamily:'var(--mono)' }}>CHECKING AUTHORIZATION...</div>
    </div>
  );

  const tabTitle = NAV.find(n => n.id === tab)?.label || '';

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:C.bg, fontFamily:'var(--mono)' }}>

      {/* Top bar */}
      <div style={{ background:C.bg2, borderBottom:`1px solid ${C.border}`, padding:'0 16px', height:50, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {/* Hamburger */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(o => !o)}
              style={{ width:34, height:34, background:'transparent', border:`1px solid ${C.border}`, borderRadius:6, color:C.t2, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              {sidebarOpen ? '✕' : '☰'}
            </button>
          )}
          <span style={{ fontSize:12, color:C.accent, fontWeight:700, letterSpacing:3 }}>GO2</span>
          <span style={{ width:1, height:18, background:C.border }} />
          <span style={{ fontSize:10, color:C.t3, letterSpacing:2 }}>ADMIN PANEL</span>
          {customerId ? (
            <span style={{ display:'inline-block', padding:'3px 9px', fontSize:9, letterSpacing:1, fontWeight:700, fontFamily:'var(--mono)', borderRadius:5, background:'var(--red-soft)', color:C.red, border:'1px solid var(--red-soft)' }}>
              VIEWING {(companyName || '').toUpperCase()} — READ ONLY
            </span>
          ) : (
            <span style={{ display:'inline-block', padding:'3px 9px', fontSize:9, letterSpacing:1, fontWeight:700, fontFamily:'var(--mono)', borderRadius:5, background:'var(--amber-soft)', color:'var(--amber)', border:'1px solid var(--line-soft)' }}>ADMIN MODE</span>
          )}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:10, color:C.t3 }}>{user?.email}</span>
          <ThemeToggle />
          <FontControls /><button style={{ background:'none', color:'var(--t2)', border:`1px solid ${C.border2}`, borderRadius:6, padding:'7px 14px', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', letterSpacing:1 }} onClick={onBack}>{customerId ? '← SUPER ADMIN' : 'DASHBOARD'}</button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, overflow:'hidden', position:'relative' }}>

        {/* Overlay */}
        {isMobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position:'fixed', inset:0, top:44, background:'rgba(0,0,0,0.6)', zIndex:98 }} />
        )}

        {/* Sidebar */}
        <div style={{
          width: 200,
          background: C.bg2,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          ...(isMobile ? {
            position: 'fixed',
            top: 44,
            left: 0,
            bottom: 0,
            zIndex: 99,
            transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s ease',
          } : {})
        }}>
          <div style={{ flex:1, overflowY:'auto', padding:'8px 8px' }}>
            {navItems.map(n => (
              <div key={n.id} className="adm-nav-item"
                style={{ padding:'10px 12px', margin:'2px 0', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderRadius:8, background:tab===n.id?'var(--accent-soft)':'transparent' }}
                onClick={() => { setTab(n.id); setSidebarOpen(false); }}>
                <span style={{ fontSize:15, width:20, textAlign:'center', color:tab===n.id?C.accent:C.t3 }}>{n.icon}</span>
                <span style={{ fontSize:12, fontWeight:tab===n.id?700:500, color:tab===n.id?C.accent:C.t2, letterSpacing:0.5, fontFamily:'var(--mono)', textTransform:'uppercase' }}>{n.label}</span>
              </div>
            ))}
            {/* FAQ & HELP — bilerek AYRIK (Serkan: Edit Reports'un 2 satir bosluk altinda) */}
            <div className="adm-nav-item"
              style={{ padding:'10px 12px', margin:'34px 0 2px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, borderRadius:8, background:tab==='help'?'var(--accent-soft)':'transparent' }}
              onClick={() => { setTab('help'); setSidebarOpen(false); }}>
              <span style={{ fontSize:15, width:20, textAlign:'center', color:tab==='help'?C.accent:C.t3 }}>?</span>
              <span style={{ fontSize:12, fontWeight:tab==='help'?700:500, color:tab==='help'?C.accent:C.t2, letterSpacing:0.5, fontFamily:'var(--mono)', textTransform:'uppercase' }}>FAQ &amp; HELP</span>
            </div>
          </div>
          <div style={{ padding:'14px 16px', borderTop:`1px solid ${C.border}` }}>
            <div style={{ fontSize:10, color:C.t2, fontWeight:700, letterSpacing:1, marginBottom:4 }}>{user?.email?.split('@')[0]?.toUpperCase()}</div>
            <button onClick={async () => { await supabase.auth.signOut(); onBack(); }}
              style={{ background:'none', color:C.red, border:'1px solid var(--red-soft)', borderRadius:6, padding:'7px 14px', fontSize:11, fontFamily:'var(--mono)', cursor:'pointer', letterSpacing:1, width:'100%', marginTop:6, textAlign:'center' }}>
              LOGOUT
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
          <div style={{ padding:'10px 16px', borderBottom:`1px solid ${C.border}`, background:C.bg3, flexShrink:0 }}>
            <span style={{ fontSize:10, color:C.accent, fontWeight:700, letterSpacing:3 }}>{tabTitle.toUpperCase()}</span>
          </div>
          <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
            {customerId && !SCOPED_TABS.includes(tab) && tab !== 'help' ? (
              <NotScopedYet tab={tab} companyName={companyName} />
            ) : (<>
              {tab==='active'    && <ActiveFlts   toast={showToast} customerId={scopeId}/>}
              {tab==='archived'  && <ArchivedFlts toast={showToast} user={user} customerId={scopeId} readOnly={!!customerId}/>}
              {tab==='aircrafts' && <Aircrafts    toast={showToast} myProfile={myProfile} customerId={scopeId}/>}
              {tab==='crews'     && <Crews        toast={showToast} myProfile={myProfile} customerId={scopeId}/>}
              {/* Kapali modul menude gizlenmekle kalmaz, ICERIGI de acilmaz —
                  yoksa bir sekme URL'i ya da eski state onu geri getirebilir. */}
              {tab==='ftl'       && isEnabled(features,'admin.ftl')  && <FTLPanel toast={showToast} myProfile={myProfile} customerId={scopeId} readOnly={!!customerId}/>}
              {tab==='stats'     && <Statistics    customerId={scopeId}/>}
              {tab==='stations'  && isEnabled(features,'admin.raaq') && <StationInfo toast={showToast} customerId={scopeId} readOnly={!!customerId}/>}
              {tab==='opscalc'   && <OpsCalculator toast={showToast} customerId={scopeId} readOnly={!!customerId}/>}
              {tab==='logs'      && <FltLogsAndTimes customerId={scopeId}/>}
              {tab==='reports'   && <EditReports   customerId={scopeId}/>}
              {tab==='help'      && <AdminHelp features={features}/>}
            </>)}
          </div>
        </div>
      </div>

      {toast.msg && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({msg:'',type:'success'})}/>}
      {/* Gerekce hucresi — panelde TEK yerde durur, butun yazma yollari onu kullanir. */}
      <EditReasonGate />

    </div>
  );
}