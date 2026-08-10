-- 10 Agu 2026 — super adminin sirket panelinde TIMELINE ve DUZELTME IZI gorunsun
--
-- flight_logs ve admin_edits'te super admin okumasi HIC yoktu: baska sirketin
-- paneli acildiginda timeline ve duzeltme gecmisi BOS gorunurdu ("bu sirkette
-- kayit yok" sanilirdi) — Ilke 1 ihlali.
--
-- Desen: OKUMA ... OR is_super_admin(), YAZMA yalniz kendi sirketi.
--
-- IDEMPOTENT: her CREATE'ten once DROP IF EXISTS var. Bu dosya 10 Agu'da IKI
-- PASTA uygulandi (once admin_edits'in UPDATE/DELETE'i kaldirilmisti, Serkan'in
-- gerekcesiyle geri alindi) ve ikinci kosuda "policy already exists" hatasi
-- verdi. Tekrar kosulabilir olmasi o yuzden onemli.

BEGIN;

-- ---------- flight_logs ----------
DROP POLICY IF EXISTS flight_logs_same_customer ON flight_logs;

DROP POLICY IF EXISTS flight_logs_read ON flight_logs;
CREATE POLICY flight_logs_read ON flight_logs
  FOR SELECT TO authenticated
  USING (plan_in_my_customer(plan_id) OR is_super_admin());

DROP POLICY IF EXISTS flight_logs_insert_own ON flight_logs;
CREATE POLICY flight_logs_insert_own ON flight_logs
  FOR INSERT TO authenticated
  WITH CHECK (plan_in_my_customer(plan_id));

DROP POLICY IF EXISTS flight_logs_update_own ON flight_logs;
CREATE POLICY flight_logs_update_own ON flight_logs
  FOR UPDATE TO authenticated
  USING (plan_in_my_customer(plan_id))
  WITH CHECK (plan_in_my_customer(plan_id));

-- SILME KAPISI ACIK KALIR (Serkan, 10 Agu): "o bir temizlik kapisi" —
-- demo surecinde yapilan ucuslarin kayitlari ilerde silinecek.
-- NOT: flight_logs_delete_unarchived diye DAHA DAR bir DELETE politikasi da var,
-- ama permissive politikalar OR'lanir -> o dar kural bagalamiyor. Bu, bu gocten
-- ONCE de boyleydi; sessizce degistirilmedi.
DROP POLICY IF EXISTS flight_logs_delete_own ON flight_logs;
CREATE POLICY flight_logs_delete_own ON flight_logs
  FOR DELETE TO authenticated
  USING (plan_in_my_customer(plan_id));

-- ---------- admin_edits ----------
DROP POLICY IF EXISTS admin_edits_tenant_all ON admin_edits;

DROP POLICY IF EXISTS admin_edits_read ON admin_edits;
CREATE POLICY admin_edits_read ON admin_edits
  FOR SELECT TO authenticated
  USING (plan_in_my_customer(plan_id) OR is_super_admin());

DROP POLICY IF EXISTS admin_edits_insert_own ON admin_edits;
CREATE POLICY admin_edits_insert_own ON admin_edits
  FOR INSERT TO authenticated
  WITH CHECK (plan_in_my_customer(plan_id));

-- UPDATE/DELETE: BUGUNKU DAVRANIS KORUNUYOR (Serkan, 10 Agu).
-- Once Ilke 3 geregi kaldirmistim; Serkan'in gerekcesiyle geri alindi:
-- "demo surecinde yapilan butun ucuslarin kayitlari silinecek ilerde",
-- "o bir temizlik kapisi".
-- KALICI KURAL (Serkan): "admin delete yapar ama RAPOR YAZARAK siler" ->
-- silme yasak degil, IZSIZ silme yasak. Kalici cozum soft delete + zorunlu
-- gerekce (EASA maddesi K-4). Demo temizligi bitince bu kapi kapanacak.
DROP POLICY IF EXISTS admin_edits_update_own ON admin_edits;
CREATE POLICY admin_edits_update_own ON admin_edits
  FOR UPDATE TO authenticated
  USING (plan_in_my_customer(plan_id))
  WITH CHECK (plan_in_my_customer(plan_id));

DROP POLICY IF EXISTS admin_edits_delete_own ON admin_edits;
CREATE POLICY admin_edits_delete_own ON admin_edits
  FOR DELETE TO authenticated
  USING (plan_in_my_customer(plan_id));

COMMIT;
