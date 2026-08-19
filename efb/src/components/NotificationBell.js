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
//
// ┌ 19 AGU 2026 — UC KADEME ───────────────────────────────────────────────┐
// │ Serkan: "60-30 arasi sari, 30-15 arasi amber, 15-0 kirmizi."           │
// │ Onceki surumde can KENDI iki renkli mantigini kuruyordu:               │
// │   renk = worst >= 3 ? red : amber                                      │
// │ Sonuc: 45 gun kala da 20 gun kala da AYNI sari. Ekranda uc kademe      │
// │ vardi ama canda iki. Artik renk STATE_COLOR'dan okunur (Ilke 3) —      │
// │ can hicbir renk/tarih karari VERMEZ, yalnizca gosterir.                │
// │                                                                        │
// │ · Canin kendi rengi EN YUKSEK ONCELIGE gore (worstState):              │
// │   50 gun + 43 gun + 5 gun -> KIRMIZI.                                  │
// │ · Acilan listede HER EGITIM KENDI renginde.                            │
// │ · Liste oncelik sirasinda: kirmizi -> amber -> sari; esitse az gun     │
// │   kalan ustte.                                                         │
// │ · Suresi gecmis kalemin USTUNDE EXPIRED rozeti (renk ayni kirmizi,     │
// │   ayrimi yazi tasir).                                                  │
// └────────────────────────────────────────────────────────────────────────┘
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  trainingStatus, todayLocal, STATE_COLOR, STATE_RANK, worstState, ALERT_DAYS,
  latestPerTraining,
} from './TrainingRules';

const C = {
  bg2:'var(--bg2)', bg3:'var(--bg3)', border:'var(--border)', border2:'var(--border2)',
  t1:'var(--t1)', t2:'var(--t2)', t3:'var(--t3)',
};

export default function NotificationBell({ customerId }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  // OKUNAMADI durumu — Serkan (19 Agu): "kopma olursa ring bell uzerine cross
  // line olsun (not avail)". Bos liste ile OKUNAMADI ayri seylerdir; ikisine
  // ayni ekrani basmak "hepsi temiz" yalanidir (Ilke 1).
  const [okunamadi, setOkunamadi] = useState(false);
  // Son BASARILI okumanin saati. null ise hic okunamadi (giriste dustu).
  const [sonOkuma, setSonOkuma] = useState(null);

  // customerId YALNIZ super admin baska sirketi izlerken dolu gelir. Normal
  // adminde null'dir ve filtre uygulanmaz — RLS zaten kendi sirketine kisitlar
  // (AdminPanel'in geri kalaninda da desen bu).
  const load = useCallback(async () => {
    const scope = (q) => customerId ? q.eq('customer_id', customerId) : q;

    // KRONOLOJIK KURAL: status='current' filtresi KALDIRILDI. Hangi kaydin
    // gecerli oldugunu damga degil TARIH soyler (bkz. TrainingRules
    // latestPerTraining). Butun kayitlar cekilir, gecerli olan turetilir.
    // Secilen kolonlar: date_of_birth CEKILMEZ (KVKK — cana lazim degil).
    const ALANLAR = 'id,pilot_id,training_code,completed_date,expires_at,created_at';
    let trn, cat, profs;
    try {
      const [a, b, c] = await Promise.all([
        scope(supabase.from('pilot_trainings').select(ALANLAR)),
        scope(supabase.from('training_catalog').select('code,name')),
        scope(supabase.from('profiles').select('id,code,full_name')),
      ]);
      // 🔑 Supabase hatayi FIRLATMAZ, { error } olarak DONDURUR (Ilke 2).
      // Onceki surumde bu alan hic okunmuyordu: sorgu duserse data null gelir,
      // liste bosalir ve ekranda "NO TRAINING EXPIRING WITHIN 60 DAYS" yazardi
      // — yani "bakamadim" yerine "bakacak bir sey yok".
      if (a.error || b.error || c.error) { setOkunamadi(true); return; }
      [trn, cat, profs] = [a.data, b.data, c.data];
    } catch {
      // Ag koptuysa istemci bazi surumlerde firlatir — o yol da kapali kalsin.
      setOkunamadi(true); return;
    }

    const catBy = Object.fromEntries((cat || []).map(c => [c.code, c]));
    const pBy   = Object.fromEntries((profs || []).map(p => [p.id, p]));
    // YEREL takvim gunu (Serkan: "bu sayac lokal gun takip etmeli"). Yoklama
    // her 5 dk kostugu icin gun degisince sayac kendiliginden duser; sayi
    // hicbir yerde SAKLANMAZ, her seferinde expires_at'ten turetilir (Ilke 3).
    const t = todayLocal();

    // Esik artik kayittan/katalogdan degil TrainingRules'tan: sabit 60/30/15.
    const list = latestPerTraining(trn).map(r => ({
      ...r,
      st: trainingStatus(r.expires_at, t),
      pilot: pBy[r.pilot_id],
      catName: catBy[r.training_code]?.name,
    }))
    // VALID ve NO_EXPIRY cana dusmez — can yalniz DIKKAT isteyeni tasir.
    .filter(x => STATE_RANK[x.st.state])
    // ONCELIK SIRASI (Serkan): kirmizi -> amber -> sari; esit kademede az gun
    // kalan ustte. Yani en acil olan her zaman en ustte.
    .sort((a, b) => (STATE_RANK[b.st.state] - STATE_RANK[a.st.state])
                 || (a.st.daysLeft - b.st.daysLeft));

    setItems(list);
    setSonOkuma(new Date().toTimeString().slice(0, 5));   // HH:MM, yerel
    setOkunamadi(false);
  }, [customerId]);

  useEffect(() => { load(); const iv = setInterval(load, 300000); return () => clearInterval(iv); }, [load]);

  // Canin rengini EN YUKSEK ONCELIKLI kalem belirler (Serkan): 50g + 43g + 5g
  // -> KIRMIZI. Renk STATE_COLOR'dan gelir, burada renk KARARI verilmez.
  const worst = useMemo(() => worstState(items.map(x => x.st.state)), [items]);
  // OKUNAMADI ise renk YOK: bilmedigimiz seye renk vermeyiz (Ilke 1).
  const renk  = okunamadi ? null : (worst ? STATE_COLOR[worst] : null);

  const adi = (p) => p ? `${p.code ? p.code + ' — ' : ''}${(p.full_name || '').toUpperCase()}` : 'UNKNOWN PILOT';
  const metin = (x) =>
    x.st.state === 'EXPIRED'
      ? `${adi(x.pilot)} — ${x.training_code} EXPIRED ${Math.abs(x.st.daysLeft)} days ago (${x.expires_at})`
      : `${adi(x.pilot)} — ${x.training_code} will expire within ${x.st.daysLeft} days (${x.expires_at})`;

  return (
    <div style={{ position:'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={okunamadi
          ? `Training alerts not available${sonOkuma ? ` — last read ${sonOkuma}` : ''}`
          : (items.length ? `${items.length} training alert(s)` : 'No training alerts')}
        // Canin o anki durumu OKUNABILIR sekilde isaretlenir. Renk `var(--red)`
        // gibi degiskenlerle verildigi icin testten okunamiyor; bu isaret hem
        // render testinin "en yuksek oncelik rengi belirliyor mu" sorusunu
        // cevaplamasini saglar hem sahada hata ayiklamayi kolaylastirir.
        data-durum={okunamadi ? 'NOT_AVAILABLE' : (worst || 'NONE')}
        style={{ position:'relative', width:34, height:34, background:'transparent',
                 border:`1px solid ${C.border2}`, borderRadius:6, color: renk || C.t3,
                 fontSize:15, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                 opacity: okunamadi ? .65 : 1 }}>
        🔔
        {/* CAPRAZ CIZGI = NOT AVAILABLE (Serkan, 19 Agu). Okuma dustugu surece
            durur, ilk basarili okumada kendiliginden kalkar. */}
        {okunamadi && (
          <span style={{ position:'absolute', left:4, right:4, top:'50%', height:2,
                         background:C.t2, borderRadius:1, transform:'rotate(-45deg)',
                         boxShadow:'0 0 0 1px var(--bg2)' }} />
        )}
        {/* Sayac OKUNAMADI'da GIZLENIR: "0" da bir iddiadir, bilmedigimizi
            sayiya dokmeyiz — capraz cizgiyi curuturdu. */}
        {!okunamadi && items.length > 0 && (
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
              {/* Esikler TrainingRules'tan basilir — ekranda yazan sayi ile
                  hesabin kullandigi sayi ayrisamaz (Ilke 3). */}
              <span style={{ fontSize:9, color:C.t3, fontFamily:'var(--mono)', letterSpacing:1 }}>
                {okunamadi
                  ? 'NOT AVAILABLE'
                  : `${ALERT_DAYS.NOTICE} / ${ALERT_DAYS.WARNING} / ${ALERT_DAYS.CRITICAL} DAYS`}
              </span>
            </div>

            {/* OKUNAMADI — "uyari yok" cumlesi BURADA ASLA YAZILMAZ.
                Elde onceki bir liste varsa atmayiz: "14:20 itibariyla sunlar
                vardi" bilgisi hala degerlidir; ama TAZE SANILMASIN diye saat
                damgasi ustunde durur ve liste soluklastirilir. */}
            {okunamadi && (
              <div style={{ padding:'14px 16px', fontSize:11, fontFamily:'var(--mono)',
                            lineHeight:1.8, color:C.t2, background:'var(--hover)',
                            borderBottom:`1px solid ${C.border}` }}>
                NOT AVAILABLE — COULD NOT READ<br />
                <span style={{ color:C.t3 }}>
                  {sonOkuma
                    ? `Showing last successful read at ${sonOkuma}. Retrying every 5 minutes.`
                    : 'No reading has succeeded yet. Retrying every 5 minutes.'}
                </span>
              </div>
            )}

            {!okunamadi && items.length === 0 && (
              // ILKE 1: "hersey yolunda" DEMEYIZ — neye bakildigini soyleriz.
              // Girilmemis egitim uyari uretmedigi icin bos liste "tam" anlamina
              // gelmez; kullanicinin bunu bilmesi gerekir.
              <div style={{ padding:'18px 16px', fontSize:11, color:C.t3, fontFamily:'var(--mono)', lineHeight:1.8 }}>
                NO TRAINING EXPIRING WITHIN {ALERT_DAYS.NOTICE} DAYS<br />
                <span style={{ color:C.t2 }}>Covers recorded trainings only — items never entered are not tracked.</span>
              </div>
            )}

            {items.map(x => {
              // HER EGITIM KENDI RENGINDE (Serkan): 50g sari, 43g sari, 5g kirmizi.
              // Renk tek kaynaktan — canin kendi esleme tablosu YOK.
              const c = STATE_COLOR[x.st.state];
              return (
                <div key={x.id} data-testid="training-alert" data-durum={x.st.state}
                     style={{ padding:'11px 16px', borderBottom:`1px solid ${C.border}`,
                                         borderLeft:`3px solid ${c}`,
                                         opacity: okunamadi ? .45 : 1 }}>
                  {/* Suresi GECMIS kalem CRITICAL ile ayni kirmizidir; ayrimi
                      renk degil bu rozet tasir (Serkan: "ustunde EXPIRED yazsin"). */}
                  {x.st.state === 'EXPIRED' && (
                    <div style={{ display:'inline-block', marginBottom:5, padding:'1px 7px',
                                  fontSize:9, fontWeight:700, letterSpacing:1.5,
                                  fontFamily:'var(--mono)', color:'#fff', background:c }}>
                      EXPIRED
                    </div>
                  )}
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
