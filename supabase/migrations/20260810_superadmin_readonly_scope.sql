-- 10 Agu 2026 — super admin: musteri verisinde SALT OKUNUR
-- Tam tasarim: GO2EFB/CLAUDE.md -> "Super adminin yazma siniri"
--
-- Serkan: "ucuslara karismamaliyiz."
-- Desen: OKUMA  ... OR is_super_admin()
--        YAZMA  yalnizca customer_id = my_customer_id()
--
-- DIKKAT: Serkan ayni zamanda REC'in adminidir. Yazma kosulu "kendi sirketi"
-- oldugu icin REC'teki gunluk isi DEGISMEZ; kapanan yalnizca BASKA musterinin
-- verisine yazma yetkisidir.
--
-- Ayrica archived_flights'ta super admin okumasi EKLENIYOR: bugun
-- plan_in_my_customer(plan_id) tek basina duruyor, yani super admin baska
-- sirketin arsivini HIC goremiyor -> DASHBOARD bos gorunurdu.

BEGIN;

-- ---------- plans ----------
DROP POLICY IF EXISTS plans_same_customer ON plans;

CREATE POLICY plans_read ON plans
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id() OR is_super_admin());

CREATE POLICY plans_insert_own ON plans
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id());

CREATE POLICY plans_update_own ON plans
  FOR UPDATE TO authenticated
  USING (customer_id = my_customer_id())
  WITH CHECK (customer_id = my_customer_id());

CREATE POLICY plans_delete_own ON plans
  FOR DELETE TO authenticated
  USING (customer_id = my_customer_id());

-- ---------- profiles ----------
DROP POLICY IF EXISTS profiles_same_customer ON profiles;

CREATE POLICY profiles_read ON profiles
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id() OR is_super_admin());

CREATE POLICY profiles_insert_own ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = my_customer_id());

CREATE POLICY profiles_update_own ON profiles
  FOR UPDATE TO authenticated
  USING (customer_id = my_customer_id())
  WITH CHECK (customer_id = my_customer_id());

CREATE POLICY profiles_delete_own ON profiles
  FOR DELETE TO authenticated
  USING (customer_id = my_customer_id());

-- NOT: kullanici ekleme ve sifre sifirlama manage-user edge function'i uzerinden
-- SERVICE KEY ile yapiliyor -> RLS'i baypas eder, bu degisiklikten etkilenmez.
-- Super adminin "yazabilir" listesindeki isler bu yuzden calismaya devam eder.

-- ---------- archived_flights ----------
DROP POLICY IF EXISTS archived_flights_tenant_all ON archived_flights;

CREATE POLICY archived_flights_read ON archived_flights
  FOR SELECT TO authenticated
  USING (plan_in_my_customer(plan_id) OR is_super_admin());

CREATE POLICY archived_flights_insert_own ON archived_flights
  FOR INSERT TO authenticated
  WITH CHECK (plan_in_my_customer(plan_id));

CREATE POLICY archived_flights_update_own ON archived_flights
  FOR UPDATE TO authenticated
  USING (plan_in_my_customer(plan_id))
  WITH CHECK (plan_in_my_customer(plan_id));

-- DELETE: bugunku davranis korunuyor (kendi sirketi silebiliyor).
-- K-4 maddesi (arsiv kaydinin kalici silinmesi -> soft delete) AYRI bir istir,
-- burada sessizce degistirilmedi.
CREATE POLICY archived_flights_delete_own ON archived_flights
  FOR DELETE TO authenticated
  USING (plan_in_my_customer(plan_id));

COMMIT;
