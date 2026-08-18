-- 18 Agu 2026 — YAKIT AYRISTIRMASI SESSIZ DUSMESIN
--
-- Saha bulgusu (Serkan, LTFE-LSGG 18 Agu): OFP yuklendi, "basarili" dendi,
-- ama plans satirinda fob/trip_fuel/alternate_fuel/reserve_fuel/tow/zfw ve
-- fms_ident BOS kaldi. Eksiklik ancak UCUSTAN SONRA raporda goruldu
-- (FOB Plan ve vs OFP Plan hucreleri tire).
--
-- Kok neden: sunucunun PDF metin cikaricisi etiket kelimeleri arasina
-- fazladan bosluk koydu ("FMS   IDENT=", "TOTAL   FOB"), kaliplar ise duz
-- tek bosluklu literaldi. Kalip tutmayinca blok bos kaldi ve ondan beslenen
-- YEDI alan birden sessizce bosaldi. `\s+` kullanan kaliplar (TRIP gibi)
-- hayatta kaldi — kusur sinifi buydu.
--
-- Kalip duzeltmesi ayri commit'te. Bu goc, AYNI SEYIN SESSIZ OLMAMASI icin:
-- `phase_parse` ile ayni desen — parser ne yapabildigini SOYLER.
--   'ok'           yakit blogu okundu
--   'no_block'     OFP blogu hic bulunamadi (kalip/cikarici sorunu)
--   'no_total_fob' blok var ama TOTAL FOB yok (belge farkli basilmis)
--   'no_trip'      blok var ama TRIP yok
--   NULL           bu goc oncesi yuklenmis plan (bilinmiyor — 'ok' SAYILMAZ)
--
-- IDEMPOTENT.

BEGIN;

ALTER TABLE plans ADD COLUMN IF NOT EXISTS fuel_parse text;

COMMENT ON COLUMN plans.fuel_parse IS
  'parse-plan yakit blogu tanisi: ok | no_block | no_total_fob | no_trip. NULL = goc oncesi, bilinmiyor.';

-- Gecmis planlar icin GERIYE DONUK isaret: kolonlar bossa ayristirma dusmus
-- demektir. NULL birakip "bilinmiyor" demek de dogruydu, ama bu bilgi zaten
-- veride duruyor — okunabilir hale getiriyoruz. 'ok' ETIKETI UYDURULMUYOR:
-- yalnizca DUSMUS olanlar isaretleniyor, gerisi NULL kaliyor.
UPDATE plans
   SET fuel_parse = 'no_block'
 WHERE fuel_parse IS NULL
   AND (fob IS NULL OR fob = '')
   AND (trip_fuel IS NULL OR trip_fuel = '');

COMMIT;
