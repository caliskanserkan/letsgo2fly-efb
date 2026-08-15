-- 15 Agu 2026 — PROBLEM RAPORU (pilot tetikler, super admin inceler)
--
-- Serkan: "App'de bir tane REPORT PROBLEM gibi bir buton yapsak, sorun
--  gordugumuzde onu tetiklesek, snapshot ve rapor yazsak; sen bunlari alsan,
--  arsivleme ile beraber snapshot alinan anlari ozellikle incelesen."
-- ve: "Super admin gorecek; kullanici sorun rapor edecek, super admin loglara
--  ve snapshot & rapora bakacak."
--
-- NEDEN AYRI TABLO: `flight_logs` denetim izidir — pilot hareketlerinin
-- degistirilemez kaydi. Problem raporu ise SERBEST METIN + o anin durumu +
-- ekran goruntusudur; denetim izine karistirilmaz. Iki kayit `plan_id` ve
-- `created_at` uzerinden zaten ayni zaman cizelgesinde bulusur.
--
-- EKRAN GORUNTUSU: `efb-documents` bucket'inda `problem-reports/<plan>/<id>.jpg`
-- yolunda durur. Yalnizca PILOT ONAYIYLA yuklenir (Serkan: "ekran goruntusu
-- pilotun onayiyla eklensin"); onaylanmazsa `screenshot_path` NULL kalir ve
-- rapor yine gecerlidir.
--
-- IDEMPOTENT: tekrar kosulabilir.

BEGIN;

CREATE TABLE IF NOT EXISTS problem_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Plan AKTIF DEGILKEN de rapor edilebilir (giris, plan listesi, indirme
  -- ekranlarinda cikan sorunlar) — bu yuzden plan_id NULL olabilir.
  plan_id      uuid REFERENCES plans(id) ON DELETE SET NULL,
  customer_id  uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  pilot_id     uuid REFERENCES profiles(id) ON DELETE SET NULL,
  -- Olayin GERCEK ani (cihazdan gelir; offline kuyruktan gec yazilsa da
  -- zaman cizelgesi dogru siralanir — flight_logs ile ayni ilke).
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Pilotun o an bulundugu modul ("navlog", "fuel", ...) ve serbest notu.
  module       text,
  note         text,
  -- O anin makine tarafi: aktif plan, GPS durumu, ekran yonu, ozellik
  -- anahtarlari, son N olay, surumler. Sema DAYATILMAZ (jsonb): rapor
  -- yapisi buyudukce eski kayitlar okunabilir kalir.
  snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  screenshot_path text,
  app_version  text,
  app_build    text,
  ios_version  text,
  device       text,
  -- Super admin is akisi: acik -> inceleniyor -> kapandi.
  status       text NOT NULL DEFAULT 'open',
  reviewed_by  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  review_note  text
);

CREATE INDEX IF NOT EXISTS problem_reports_plan_idx     ON problem_reports (plan_id, occurred_at);
CREATE INDEX IF NOT EXISTS problem_reports_customer_idx ON problem_reports (customer_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS problem_reports_status_idx   ON problem_reports (status, occurred_at DESC);

ALTER TABLE problem_reports ENABLE ROW LEVEL SECURITY;

-- OKUMA: kendi sirketi VEYA super admin (mevcut desenin aynisi).
DROP POLICY IF EXISTS problem_reports_read ON problem_reports;
CREATE POLICY problem_reports_read ON problem_reports
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id() OR is_super_admin());

-- YAZMA: pilot yalniz KENDI sirketine rapor acar.
DROP POLICY IF EXISTS problem_reports_insert_own ON problem_reports;
CREATE POLICY problem_reports_insert_own ON problem_reports
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id());

-- GUNCELLEME: yalniz SUPER ADMIN (inceleme durumu/notu). Pilot kendi raporunu
-- sonradan degistiremez — rapor da bir kayittir (Ilke 3: uzeri cizilmez).
DROP POLICY IF EXISTS problem_reports_update_super ON problem_reports;
CREATE POLICY problem_reports_update_super ON problem_reports
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- SILME POLITIKASI YOK: hard delete YASAK (denetim izi ilkesi).

COMMIT;
