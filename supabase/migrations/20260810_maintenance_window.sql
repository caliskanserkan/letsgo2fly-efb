-- 10 Agu 2026 — BAKIM MODU (super admin yazma penceresi)
-- Tam tasarim: GO2EFB/CLAUDE.md -> "BAKIM MODU"
--
-- SERKAN'IN KURALI: "bir degisiklik yapacaksa rapor yazmadan kapatamaz,
-- yaptigi yer degisiklik loglanir."
--
-- NEDEN KAPI VERITABANINDA (secenek B):
--   Admin yuzeyinde 44 yazma yolu var (AdminPanel 20, FTLPanel 22, RiskSurvey 2).
--   Kurali 44 yerde hatirlamak zorunda kalirsak, unutulan tek kapi SESSIZCE ve
--   IZSIZ yazar — ve hicbir sey hata vermez. 10 Agu'daki yarim silme olayi tam
--   olarak boyle sessiz kaldi. Burada kapi TEK: pencere yoksa yazma reddedilir,
--   yani unutulan kapi gurultuyle DUSER, sessizce gecmez.
--
-- SURE: pencere kendiliginden kapanir. Kimsenin "kapatmayi hatirlamasi" gerekmez.

BEGIN;

-- 1) Pencere damgasi
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS maintenance_until timestamptz;

COMMENT ON COLUMN customers.maintenance_until IS
  'Super adminin bu musteri verisine YAZABILECEGI pencerenin bitisi. Gerekceyle acilir (superadmin_log tip=maintenance_open), suresi dolunca kendiliginden kapanir.';

-- 2) Pencere acik mi?
CREATE OR REPLACE FUNCTION maintenance_open(cid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM customers c
    WHERE c.id = cid AND c.maintenance_until IS NOT NULL AND c.maintenance_until > now()
  );
$$;

-- 3) Super admin yazabilir mi? (customer_id kolonu OLAN tablolar icin)
CREATE OR REPLACE FUNCTION sa_write_ok(cid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_super_admin() AND maintenance_open(cid);
$$;

-- 4) Ayni soru, bag PLAN uzerinden kuruluyorsa
CREATE OR REPLACE FUNCTION sa_write_ok_plan(pid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_super_admin() AND EXISTS (
    SELECT 1 FROM plans p WHERE p.id = pid AND maintenance_open(p.customer_id)
  );
$$;

-- 5) superadmin_log yeni olay tipini kabul etsin
ALTER TABLE superadmin_log DROP CONSTRAINT IF EXISTS superadmin_log_type_check;
ALTER TABLE superadmin_log ADD CONSTRAINT superadmin_log_type_check
  CHECK (type IN ('config_change','data_view','password_reset','limit_change',
                  'maintenance_open','maintenance_close'));

-- 6) YAZMA POLITIKALARI — tek kosul eklendi.
--    Okuma politikalarina DOKUNULMADI (super admin zaten okuyabiliyor).

-- plans
DROP POLICY IF EXISTS plans_insert_own ON plans;
CREATE POLICY plans_insert_own ON plans FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id() OR sa_write_ok(customer_id));
DROP POLICY IF EXISTS plans_update_own ON plans;
CREATE POLICY plans_update_own ON plans FOR UPDATE TO authenticated
  USING (customer_id = my_customer_id() OR sa_write_ok(customer_id))
  WITH CHECK (customer_id = my_customer_id() OR sa_write_ok(customer_id));
DROP POLICY IF EXISTS plans_delete_own ON plans;
CREATE POLICY plans_delete_own ON plans FOR DELETE TO authenticated
  USING (customer_id = my_customer_id() OR sa_write_ok(customer_id));

-- profiles
DROP POLICY IF EXISTS profiles_insert_own ON profiles;
CREATE POLICY profiles_insert_own ON profiles FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id() OR sa_write_ok(customer_id));
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE TO authenticated
  USING (customer_id = my_customer_id() OR sa_write_ok(customer_id))
  WITH CHECK (customer_id = my_customer_id() OR sa_write_ok(customer_id));
DROP POLICY IF EXISTS profiles_delete_own ON profiles;
CREATE POLICY profiles_delete_own ON profiles FOR DELETE TO authenticated
  USING (customer_id = my_customer_id() OR sa_write_ok(customer_id));

-- archived_flights (bag plan uzerinden)
DROP POLICY IF EXISTS archived_flights_insert_own ON archived_flights;
CREATE POLICY archived_flights_insert_own ON archived_flights FOR INSERT TO authenticated
  WITH CHECK (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));
DROP POLICY IF EXISTS archived_flights_update_own ON archived_flights;
CREATE POLICY archived_flights_update_own ON archived_flights FOR UPDATE TO authenticated
  USING (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id))
  WITH CHECK (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));
DROP POLICY IF EXISTS archived_flights_delete_own ON archived_flights;
CREATE POLICY archived_flights_delete_own ON archived_flights FOR DELETE TO authenticated
  USING (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));

-- flight_logs
DROP POLICY IF EXISTS flight_logs_insert_own ON flight_logs;
CREATE POLICY flight_logs_insert_own ON flight_logs FOR INSERT TO authenticated
  WITH CHECK (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));
DROP POLICY IF EXISTS flight_logs_update_own ON flight_logs;
CREATE POLICY flight_logs_update_own ON flight_logs FOR UPDATE TO authenticated
  USING (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id))
  WITH CHECK (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));
DROP POLICY IF EXISTS flight_logs_delete_own ON flight_logs;
CREATE POLICY flight_logs_delete_own ON flight_logs FOR DELETE TO authenticated
  USING (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));

-- admin_edits (musterinin duzeltme izi; demo temizligi icin silme acik kalir)
DROP POLICY IF EXISTS admin_edits_insert_own ON admin_edits;
CREATE POLICY admin_edits_insert_own ON admin_edits FOR INSERT TO authenticated
  WITH CHECK (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));
DROP POLICY IF EXISTS admin_edits_update_own ON admin_edits;
CREATE POLICY admin_edits_update_own ON admin_edits FOR UPDATE TO authenticated
  USING (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id))
  WITH CHECK (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));
DROP POLICY IF EXISTS admin_edits_delete_own ON admin_edits;
CREATE POLICY admin_edits_delete_own ON admin_edits FOR DELETE TO authenticated
  USING (plan_in_my_customer(plan_id) OR sa_write_ok_plan(plan_id));

-- NOT: customers tablosuna DOKUNULMADI — sirket ayarlari (moduller, max users)
-- zaten super adminin ONAYLI yazma listesinde, pencere gerektirmez.
-- NOT: superadmin_log'a UPDATE/DELETE politikasi YOK, iz degistirilemez (Ilke 3).

COMMIT;
