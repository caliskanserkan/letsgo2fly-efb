-- 17 Agu 2026 — TRAINING MODULU (FTL sekmesi, DUTY HISTORY ile SKPK arasi)
--
-- Serkan: "Bir de eger varsa zorunlu egitim listesi ve yenileme araligi, onu da
--  direkt koyalim. Elle eklenebilir ve delete edilebilir sekilde olsun.
--  Egitimler SHGM'den gelen mandatory olarak gelsin ama yine delete edilebilir
--  olsun, cunku ileride ismi degisir, kapsami yenilenebilir."
-- ve: "Bizim kurallarimiz degil, mevzuati takip edelim."
-- ve: "Dokuman yuklenmesin. KVKK isi sorunlu, bize lazim olan sadece tarih ve
--  yenileme sureleri."
--
-- ┌ IKI TABLO, IKI FARKLI DOGA ────────────────────────────────────────────┐
-- │ training_catalog : egitim TANIMI (kod, ad, sure, capa kurali).          │
-- │                    KONFIGURASYONDUR -> SILINEBILIR.                     │
-- │ pilot_trainings  : "su pilot su tarihte yapti".                         │
-- │                    KAYITTIR -> SILINEMEZ (Ilke 4). Duzeltme/yenileme    │
-- │                    YENI SATIR acar, eskisi 'superseded' olur.           │
-- └────────────────────────────────────────────────────────────────────────┘
-- Sebep denetim: "12 Mart'ta uctugunda OPC'si gecerli miydi?" sorusu ancak
-- gecmis kayit dururken cevaplanabilir.
--
-- BELGE YUKLEME YOKTUR (KVKK). Sertifika/medical evraki tutulmaz; karar
-- TARIHTEN cikar, belgeden degil. Bu yuzden sema'da document_path YOK.
-- `notes` serbest metindir ve SAGLIK BILGISI ICERMEZ (arayuzde ipucu var).
--
-- IDEMPOTENT: tekrar kosulabilir.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) KATALOG — musteri bazli egitim tanimlari
-- ═══════════════════════════════════════════════════════════════════════
-- Liste KODA GOMULMEZ (Ilke 6): SHGM'li musteri kendi listesini, EASA/FAA'li
-- musteri kendisininkini tanimlar. Seed yalnizca baslangic degeridir.
CREATE TABLE IF NOT EXISTS training_catalog (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NOT NULL,

  -- NULL = "INTERVAL NOT SET". Uydurma sure YAZILMAZ (Ilke 1 + Ilke 8):
  -- kaynagi okunmamis bir sure, okunmus gibi gorunmemeli.
  default_validity_months int,

  -- TABAN capa kurali — ilk kayitta ve pencere DISINDA yapilan yenilemede:
  --   'END_OF_MONTH'  kontrol ayinin son gunu   (ORO.FC.230 g — OPC/LC/EMERG)
  --   'CHECK_DATE'    fiili kontrol tarihi      (FCL.740(a), MED.A.045(a)(5)(ii))
  --
  -- 'PREVIOUS_EXPIRY' BURAYA YAZILMAZ: o bir taban kural degil, pencere
  -- icindeyken devreye giren ISTISNADIR ve asagidaki carry_forward_* ile
  -- ifade edilir. Mevzuat da boyle kurulu:
  --   ORO.FC.230(h) "son 3 ayi icerisinde ... asil son gecerlilik tarihinden"
  --   FCL.740(a)    "daha erken ... yeterlilik kontrolu TARIHINDEN itibaren"
  --   MED.A.045(a)(5)(ii) "temdit edilen ... onceki ... sona erdigi tarihten"
  anchor_rule   text NOT NULL DEFAULT 'CHECK_DATE'
                CHECK (anchor_rule IN ('END_OF_MONTH','CHECK_DATE')),

  -- Erken yenileme penceresi. BIRIM TEK TIP DEGILDIR:
  -- ORO.FC.230(h) ve FCL.740.A "3 AY" der, MED.A.045(b) "45 GUN" der.
  -- Tek bir "ay" alanina sikistirilirsa medical YANLIS hesaplanir.
  carry_forward_window int,
  carry_forward_unit   text CHECK (carry_forward_unit IN ('MONTHS','DAYS')),

  -- ELP seviye 6: yeniden degerlendirme YOK (FCL.055(c)).
  no_expiry     boolean NOT NULL DEFAULT false,

  -- Yasa bagli sure (MED.A.045(a)(2)): 12 ay -> 60 yasinda 6 aya duser.
  -- Yas MUAYENE TARIHINDEKI yastir (MED.A.045(a)(5)(i)).
  age_dependent boolean NOT NULL DEFAULT false,

  -- Modulun icinde GORUNUR (Serkan: "modul icinde bu referansi yazalim,
  -- her ikisini de"). Hesaplanan her bitis tarihi hangi maddeden ciktigini
  -- yaninda yazar — OFP decoder'daki "sonucun yaninda nasil hesaplandigi da
  -- saklanir" ilkesinin ayinisi.
  legal_reference text,

  default_alert_days int[] NOT NULL DEFAULT '{60,30,15}',
  source        text NOT NULL DEFAULT 'CUSTOM' CHECK (source IN ('REGULATION','CUSTOM')),
  mandatory     boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, code)
);

-- ═══════════════════════════════════════════════════════════════════════
-- 2) PILOT EGITIM KAYITLARI — DELETE POLICY YOK
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pilot_trainings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  pilot_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Koda gore baglanir, katalog satiri silinse de kayit okunabilir kalir.
  training_code text NOT NULL,

  completed_date date NOT NULL,
  validity_months int,

  -- HESAPLANDIGI ANDA SAKLANIR, okuma aninda yeniden hesaplanmaz.
  -- Mevzuat ileride degisirse eski kayitlar YAZILDIGI ANDAKI kurala gore
  -- kalir (tarihsel yeniden uretilebilirlik). NULL = suresiz (ELP6).
  expires_at    date,

  -- Bu tarihi URETEN kural — denetci tarihi de gorur, tarihi ureten maddeyi de.
  applied_rule  text,     -- 'ORO.FC.230(g)' | 'ORO.FC.230(h)' | 'FCL.740' | 'MED.A.045' | 'CHECK_DATE'
  anchor_date   date,     -- hesabin capasi (ay sonu ya da onceki bitis)

  issued_by     text,
  alert_days    int[],    -- NULL ise katalog varsayilani

  -- YALNIZ 'MED' kaydinda doldurulur (Serkan: "dogum tarihi girmiyoruz hicbir
  -- yerde, bunu medical girisinde edit panelde girelim"). CREWS'e EKLENMEZ.
  -- Veri minimizasyonu: tek amac, tek yer.
  date_of_birth date,

  -- Operasyonel not. SAGLIK BILGISI YAZILMAZ (KVKK).
  notes         text,

  status        text NOT NULL DEFAULT 'current' CHECK (status IN ('current','superseded')),
  superseded_by uuid REFERENCES pilot_trainings(id) ON DELETE SET NULL,

  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pilot_trainings_pilot_idx
  ON pilot_trainings (pilot_id, training_code, status);
CREATE INDEX IF NOT EXISTS pilot_trainings_customer_idx
  ON pilot_trainings (customer_id, expires_at);

-- Ayni pilot + ayni egitim icin AYNI ANDA tek 'current' satir olabilir.
-- Yenileme once eskisini 'superseded' yapar, sonra yenisini acar.
CREATE UNIQUE INDEX IF NOT EXISTS pilot_trainings_one_current
  ON pilot_trainings (pilot_id, training_code)
  WHERE status = 'current';

-- ═══════════════════════════════════════════════════════════════════════
-- 3) DEGISIKLIK IZI — ftl_ruleset_changes deseninin ayinisi
-- ═══════════════════════════════════════════════════════════════════════
-- Katalog silme/duzenleme ve kayit duzeltmeleri buraya yazilir. Egitim
-- kayitlari legalite bilgisi urettigi icin degisiklikleri izlenebilir olmali.
CREATE TABLE IF NOT EXISTS training_changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  -- Hangisi degistiyse o dolu olur.
  catalog_id    uuid,
  training_id   uuid,
  action        text NOT NULL,   -- 'CATALOG_ADD' | 'CATALOG_EDIT' | 'CATALOG_DELETE'
                                 -- 'CATALOG_RETIRE' | 'TRN_ADD' | 'TRN_RENEW' | 'TRN_CORRECT'
  field         text,
  old_value     text,
  new_value     text,
  reason        text,
  changed_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_changes_customer_idx
  ON training_changes (customer_id, changed_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- 4) RLS — kiraci siniri (Ilke 10)
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE training_catalog  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pilot_trainings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_changes  ENABLE ROW LEVEL SECURITY;

-- ---------- training_catalog ----------
DROP POLICY IF EXISTS training_catalog_read ON training_catalog;
CREATE POLICY training_catalog_read ON training_catalog
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id() OR is_super_admin());

DROP POLICY IF EXISTS training_catalog_insert ON training_catalog;
CREATE POLICY training_catalog_insert ON training_catalog
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id());

DROP POLICY IF EXISTS training_catalog_update ON training_catalog;
CREATE POLICY training_catalog_update ON training_catalog
  FOR UPDATE TO authenticated
  USING (customer_id = my_customer_id())
  WITH CHECK (customer_id = my_customer_id());

-- KATALOG SILINEBILIR (Serkan'in sarti: "ileride ismi degisir, kapsami
-- yenilenebilir"). Ama KULLANIMDAYSA silinmez — asagidaki tetik engeller,
-- o durumda active=false ile emekliye ayrilir. Aksi halde gecmis kayitlar
-- tanimsiz bir koda bakar ve denetim izi kirilir.
DROP POLICY IF EXISTS training_catalog_delete ON training_catalog;
CREATE POLICY training_catalog_delete ON training_catalog
  FOR DELETE TO authenticated
  USING (customer_id = my_customer_id());

-- ---------- pilot_trainings ----------
DROP POLICY IF EXISTS pilot_trainings_read ON pilot_trainings;
CREATE POLICY pilot_trainings_read ON pilot_trainings
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id() OR is_super_admin());

DROP POLICY IF EXISTS pilot_trainings_insert ON pilot_trainings;
CREATE POLICY pilot_trainings_insert ON pilot_trainings
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id());

-- UPDATE yalnizca 'current' -> 'superseded' gecisi ve alan duzeltmesi icin.
DROP POLICY IF EXISTS pilot_trainings_update ON pilot_trainings;
CREATE POLICY pilot_trainings_update ON pilot_trainings
  FOR UPDATE TO authenticated
  USING (customer_id = my_customer_id())
  WITH CHECK (customer_id = my_customer_id());

-- SILME POLITIKASI YOK: hard delete YASAK (Ilke 4).

-- ---------- training_changes (append-only) ----------
DROP POLICY IF EXISTS training_changes_read ON training_changes;
CREATE POLICY training_changes_read ON training_changes
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id() OR is_super_admin());

DROP POLICY IF EXISTS training_changes_insert ON training_changes;
CREATE POLICY training_changes_insert ON training_changes
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id());

-- UPDATE / DELETE POLITIKASI YOK: iz uzeri cizilmez.

-- ═══════════════════════════════════════════════════════════════════════
-- 5) KULLANIMDAKI KATALOG SATIRI SILINEMEZ
-- ═══════════════════════════════════════════════════════════════════════
-- RLS "kendi sirketin" der; bu tetik "kullanimda degilse" der. Ikisi ayri
-- sorulardir. Silme reddedilirse mesaj NE YAPILACAGINI soyler (sessiz hata yok).
CREATE OR REPLACE FUNCTION training_catalog_delete_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM pilot_trainings t
   WHERE t.customer_id = OLD.customer_id
     AND t.training_code = OLD.code;
  IF n > 0 THEN
    RAISE EXCEPTION
      'TRAINING CODE % IN USE BY % RECORD(S) — set active=false to retire it instead of deleting',
      OLD.code, n;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS training_catalog_delete_guard_t ON training_catalog;
CREATE TRIGGER training_catalog_delete_guard_t
  BEFORE DELETE ON training_catalog
  FOR EACH ROW EXECUTE FUNCTION training_catalog_delete_guard();

-- ═══════════════════════════════════════════════════════════════════════
-- 6) SEED — MEVZUATTAN OKUNAN KATALOG (17 Agu 2026)
-- ═══════════════════════════════════════════════════════════════════════
-- Her satirin suresi ve capa kurali KAYNAK METINDEN dogrulanmistir:
--   SHT-OPS EK-3 (BOLUM-ORO) ORO.FC.230        -> OPC / LC / EMERG / GRND / CRM
--   SHT-FCL FCL.740, FCL.740.A                 -> LPC
--   SHT-MED MED.A.045                          -> MED
--   SHT-FCL FCL.055(c)                         -> ELP4 / ELP5 / ELP6
--   SHT-EGITIM/CBTA DGR md.9(7) + ICAO TI      -> DG
--   SHT-17.2 bolum 10.2                        -> SEC
--
-- ORO.FC.230(g): (b)(3),(c),(d) sureleri KONTROLUN YAPILDIGI AYIN SONUNDAN sayilir.
-- ORO.FC.230(h): son 3 ay icinde yapilirsa yeni sure ASIL SON GECERLILIK
--                TARIHINDEN sayilir -> capa sabit kalir, surekli one cekme olmaz.
--
-- 🔴 KAPSAM: bu katalog TURK MEVZUATIDIR (SHGM). Yalnizca FTL kullanan
-- musterilere (ftl_ruleset_id dolu olanlara) basilir. Ileride EASA/FAA
-- tescilli bir musteri gelirse ONA BU LISTE BASILMAZ — kendi mevzuatiyla
-- kendi katalogu kurulur. Yanlis varsayilan, varsayilan olmamasindan kotudur.
--
-- UNIQUE(customer_id,code) sayesinde tekrar kosmak zarar vermez.
INSERT INTO training_catalog
  (customer_id, code, name, default_validity_months, anchor_rule,
   carry_forward_window, carry_forward_unit, no_expiry, age_dependent,
   legal_reference, source, mandatory, sort_order)
SELECT c.id, s.code, s.name, s.months, s.anchor,
       s.win, s.unit, s.noexp, s.agedep, s.ref, 'REGULATION', true, s.ord
FROM customers c
CROSS JOIN (VALUES
  -- (kod, ad, ay, taban capa, pencere, birim, suresiz, yasa-bagli, referans, sira)
  ('OPC',       'Operator proficiency check (Isletici yeterlilik kontrolu)',
                 6,    'END_OF_MONTH',    3,  'MONTHS', false, false,
                 'SHT-OPS EK-3 · ORO.FC.230 (b)(3),(g),(h)', 10),
  ('LC',        'Line check (Hat kontrolu)',
                 12,   'END_OF_MONTH',    3,  'MONTHS', false, false,
                 'SHT-OPS EK-3 · ORO.FC.230 (c)(1),(g),(h)', 20),
  ('EMERG',     'Emergency & safety equipment check (Acil durum ve emniyet techizati)',
                 12,   'END_OF_MONTH',    3,  'MONTHS', false, false,
                 'SHT-OPS EK-3 · ORO.FC.230 (d),(g),(h)', 30),
  ('GRND_FSTD', 'Ground & FSTD/aircraft training (Yer egitimi + FSTD)',
                 12,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-OPS EK-3 · ORO.FC.230 (f)', 40),
  ('CRM_REC',   'CRM recurrent (yillik)',
                 12,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-OPS EK-3 · ORO.FC.230 (e)(1)', 50),
  ('CRM_MOD',   'CRM modular cycle (3 yillik donem)',
                 36,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-OPS EK-3 · ORO.FC.230 (e)(2)', 60),
  -- LPC: taban CHECK_DATE — FCL.740(a) "daha erken ... yeterlilik kontrolu
  -- tarihinden itibaren". Pencere 3 ay: FCL.740.A(a)(1).
  ('LPC',       'Type rating proficiency check (Tip yetkisi yeterlilik kontrolu)',
                 12,   'CHECK_DATE',      3,  'MONTHS', false, false,
                 'SHT-FCL · FCL.740(a), FCL.740.A(a)(1)', 70),
  -- MED: 12 ay; 60 yasina ulasinca (veya tek pilotlu ticari yolcu + 40 yas)
  -- 6 aya duser. Yas MUAYENE TARIHINDEKI yastir — MED.A.045(a)(5)(i).
  -- Temdit penceresi 45 GUN (ay degil) — MED.A.045(b).
  ('MED',       'Medical certificate Class 1 (Saglik sertifikasi 1. sinif)',
                 12,   'CHECK_DATE',      45, 'DAYS',   false, true,
                 'SHT-MED · MED.A.045 (a)(1),(a)(2),(a)(5),(b)', 80),
  ('ELP4',      'Language proficiency — Level 4 (Dil yeterliligi seviye 4)',
                 48,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-FCL · FCL.055(c)(1)', 90),
  ('ELP5',      'Language proficiency — Level 5 (Dil yeterliligi seviye 5)',
                 72,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-FCL · FCL.055(c)(2)', 100),
  ('ELP6',      'Language proficiency — Level 6 (Dil yeterliligi seviye 6, suresiz)',
                 NULL, 'CHECK_DATE',      NULL, NULL,   true,  false,
                 'SHT-FCL · FCL.055(c)', 110),
  ('DG',        'Dangerous goods (Tehlikeli maddeler)',
                 24,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-EGITIM/CBTA DGR md.9(7) · ICAO TI Doc 9284', 120),
  ('SEC',       'Aviation security — flight crew (Havacilik guvenligi)',
                 12,   'CHECK_DATE',      NULL, NULL,   false, false,
                 'SHT-17.2 bolum 10.2', 130)
) AS s(code, name, months, anchor, win, unit, noexp, agedep, ref, ord)
WHERE c.ftl_ruleset_id IS NOT NULL     -- yalnizca FTL kullanan musteriler
ON CONFLICT (customer_id, code) DO NOTHING;

COMMIT;

-- ── KOSTUKTAN SONRA DOGRULAMA ──────────────────────────────────────────
-- select code, name, default_validity_months, anchor_rule,
--        carry_forward_window, carry_forward_unit, legal_reference
--   from training_catalog
--  where customer_id = '<REC customer_id>'
--  order by sort_order;
-- Beklenen: 13 satir, hepsi source='REGULATION' ve mandatory=true.
