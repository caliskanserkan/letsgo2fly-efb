-- ════════════════════════════════════════════════════════════════════════
-- OFP SAFHA VERISI — plan basina tirmanma/alcalma olcumu
-- 16 Agustos 2026 · Serkan
--
-- "Bu irtifalara tirmanma ve alcalma sureleri de planda var, oradan da
--  ortalama bir tirmanis/alcalis suresi ve buna bagli yakit hesaplayalim.
--  Bizim sabit degerler anlamsiz olur cunku elimizde veri var."
--
-- "Biz veriyi bir tablodan cekmicez mi, surekli plan girildikce guncellenen?"
--  -> Evet. Olcum PLAN YUKLENIRKEN yapilir (`parse-plan`), sonradan toplu
--     taramayla degil. Her yeni plan profile kendiliginden katkı verir;
--     kimse bir dugmeye basmayi unutamaz.
--
-- NEDEN `plans` TABLOSU (ayri tablo degil):
--   `trip_fuel`, `ete`, `cruise_fl` zaten burada ve hepsi AYNI BACAGA ait
--   turev degerler. `parse-plan` her bacagi ayri satir olarak yazdigi icin
--   (cok bacaklı OFP dahil) satir basina tek olcum dusuyor — join gerekmez.
--
-- CRUISE SUTUNU YOK — bilerek: `trip - climb - desc` olarak TURETILIR.
-- Ayrica saklansaydi ayni bilgi iki yerde durur ve er gec celisirdi (Ilke 2).
-- ════════════════════════════════════════════════════════════════════════

alter table plans
  add column if not exists climb_min   integer,   -- tirmanmanin bittigi an (dk)
  add column if not exists desc_min    integer,   -- alcalmanin SURESI (dk)
  add column if not exists phase_parse text;      -- olcumun durumu (asagi bkz.)

comment on column plans.climb_min is
  'OFP navlog satirlarindaki son CLB isaretinin kumulatif dakikasi. Tirmanmanin bittigi an.';
comment on column plans.desc_min is
  'Alcalma suresi: trip suresi - ilk DSC isaretinin kumulatif dakikasi.';

-- 🔑 OLCULEMEYEN PLAN SESSIZ KALMAZ (Ilke 1): kolon NULL birakilip gecilmez,
-- SEBEBI yazilir. Boylece "10 planin 8'i okundu, 2'si cok bacakli OFP
-- yuzunden okunamadi" denebilir — ve bacak izolasyonu duzeldiginde o sayinin
-- dustugu GORULUR. Sessiz NULL, duzelmenin ise yarayip yaramadigini
-- olcemeyecegimiz anlamina gelirdi.
--   'ok'            olculdu
--   'no_phase_rows' navlogda CLB/DSC isareti bulunamadi (lehce farki olabilir)
--   'inconsistent'  okundu ama sira tutmuyor (alcalma tirmanmadan once vb.)
--   'no_trip_time'  ETE yok, alcalma suresi hesaplanamaz
comment on column plans.phase_parse is
  'ok | no_phase_rows | inconsistent | no_trip_time — olculemeyen plan sessiz kalmaz.';

-- Tescil bazli profil sorgusu bu suzgecle calisir.
create index if not exists plans_phase_reg_idx
  on plans (reg) where phase_parse = 'ok';
