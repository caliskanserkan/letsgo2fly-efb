-- 10 Agu 2026 — customers RLS acigi
--
-- ONCEKI DURUM: tek politika, customers_self, FOR ALL:
--   USING/WITH CHECK ((id = my_customer_id()) OR is_super_admin())
-- Yani o sirketin HERHANGI bir kullanicisi kendi customers satirini
-- UPDATE/DELETE edebiliyordu: max_users, plan_type, active, features...
-- Super admin settings tasariminin tamami bu tek satirda cokerdi
-- (musteri kapattigimiz modulu kendi acabilirdi).
--
-- YENI DURUM: okuma ayni, YAZMA yalniz super admin.
-- Kontrol edildi (10 Agu): customers'a yazan tek yer SuperAdminPanel.js
-- (insert + active toggle). FTLPanel.js ve iOS SupabaseService.swift:1205
-- yalnizca SELECT yapiyor. Edge function'lar service key ile RLS'i baypas eder.

BEGIN;

DROP POLICY IF EXISTS customers_self ON customers;

CREATE POLICY customers_read ON customers
  FOR SELECT TO authenticated
  USING (id = my_customer_id() OR is_super_admin());

CREATE POLICY customers_insert ON customers
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY customers_update ON customers
  FOR UPDATE TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- DELETE politikasi BILEREK YOK -> musteri kaydi silinemez (Ilke 3).

COMMIT;
