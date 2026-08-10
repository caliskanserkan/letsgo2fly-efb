-- 10 Agu 2026 — super adminin sirket panelinde EKIP ve FTL verisi gorunsun
--
-- Bulgu: CREWS panelini "kapsandi" diye isaretlemistim, EKSIKTI. Pilot listesi
-- geliyordu (profiles'ta super admin okumasi var) ama NITELIKLER, FTL BASELINE
-- ve HOME BASE kolonlari baska sirkette BOS kalirdi — o tablolarda super admin
-- okumasi yok. FTL panelinin tamami da ayni sebeple bombos gelirdi.
-- Bos tablo "bu sirkette kayit yok" diye okunur; Ilke 1 ihlali.
--
-- Desen degismiyor: yalnizca SELECT genisletiliyor, YAZMA politikalarina
-- DOKUNULMUYOR (super admin musteri verisine yazamaz).
-- IDEMPOTENT: her CREATE'ten once DROP IF EXISTS.

BEGIN;

-- ---------- crew_duties ----------
DROP POLICY IF EXISTS crew_duties_sel ON crew_duties;
CREATE POLICY crew_duties_sel ON crew_duties
  FOR SELECT TO authenticated
  USING (customer_id = ftl_customer_id() OR is_super_admin());

-- ---------- crew_duty_plans ----------
DROP POLICY IF EXISTS crew_duty_plans_sel ON crew_duty_plans;
CREATE POLICY crew_duty_plans_sel ON crew_duty_plans
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR EXISTS (SELECT 1 FROM crew_duties d
               WHERE d.id = crew_duty_plans.duty_id
                 AND d.customer_id = ftl_customer_id())
  );

-- ---------- ftl_duty_edits (denetim izi — yalniz okuma genisliyor) ----------
DROP POLICY IF EXISTS ftl_duty_edits_sel ON ftl_duty_edits;
CREATE POLICY ftl_duty_edits_sel ON ftl_duty_edits
  FOR SELECT TO authenticated
  USING (customer_id = ftl_customer_id() OR is_super_admin());

-- ---------- ftl_off_types ----------
DROP POLICY IF EXISTS ftl_offt_sel ON ftl_off_types;
CREATE POLICY ftl_offt_sel ON ftl_off_types
  FOR SELECT TO authenticated
  USING (customer_id = ftl_customer_id() OR is_super_admin());

-- ---------- ftl_pilot_baselines ----------
DROP POLICY IF EXISTS ftl_base_sel ON ftl_pilot_baselines;
CREATE POLICY ftl_base_sel ON ftl_pilot_baselines
  FOR SELECT TO authenticated
  USING (customer_id = ftl_customer_id() OR is_super_admin());

-- ---------- crew_qualifications (FOR ALL idi -> komut bazina ayriliyor) ----------
DROP POLICY IF EXISTS crew_qual_tenant_all ON crew_qualifications;

DROP POLICY IF EXISTS crew_qual_read ON crew_qualifications;
CREATE POLICY crew_qual_read ON crew_qualifications
  FOR SELECT TO authenticated
  USING (pilot_in_my_customer(pilot_id) OR is_super_admin());

DROP POLICY IF EXISTS crew_qual_insert_own ON crew_qualifications;
CREATE POLICY crew_qual_insert_own ON crew_qualifications
  FOR INSERT TO authenticated
  WITH CHECK (pilot_in_my_customer(pilot_id));

DROP POLICY IF EXISTS crew_qual_update_own ON crew_qualifications;
CREATE POLICY crew_qual_update_own ON crew_qualifications
  FOR UPDATE TO authenticated
  USING (pilot_in_my_customer(pilot_id))
  WITH CHECK (pilot_in_my_customer(pilot_id));

DROP POLICY IF EXISTS crew_qual_delete_own ON crew_qualifications;
CREATE POLICY crew_qual_delete_own ON crew_qualifications
  FOR DELETE TO authenticated
  USING (pilot_in_my_customer(pilot_id));

-- ---------- home_bases (FOR ALL idi -> komut bazina ayriliyor) ----------
DROP POLICY IF EXISTS home_bases_tenant_all ON home_bases;

DROP POLICY IF EXISTS home_bases_read ON home_bases;
CREATE POLICY home_bases_read ON home_bases
  FOR SELECT TO authenticated
  USING (pilot_in_my_customer(pilot_id) OR is_super_admin());

DROP POLICY IF EXISTS home_bases_insert_own ON home_bases;
CREATE POLICY home_bases_insert_own ON home_bases
  FOR INSERT TO authenticated
  WITH CHECK (pilot_in_my_customer(pilot_id));

DROP POLICY IF EXISTS home_bases_update_own ON home_bases;
CREATE POLICY home_bases_update_own ON home_bases
  FOR UPDATE TO authenticated
  USING (pilot_in_my_customer(pilot_id))
  WITH CHECK (pilot_in_my_customer(pilot_id));

DROP POLICY IF EXISTS home_bases_delete_own ON home_bases;
CREATE POLICY home_bases_delete_own ON home_bases
  FOR DELETE TO authenticated
  USING (pilot_in_my_customer(pilot_id));

-- ftl_rulesets ve ftl_ruleset_changes: SELECT politikasi zaten 'true',
-- degistirmeye gerek yok.

COMMIT;
