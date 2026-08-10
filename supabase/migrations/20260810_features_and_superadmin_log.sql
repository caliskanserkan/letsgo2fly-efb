-- 10 Agu 2026 — super admin settings, adim 1 (mekanizma)
-- Tam tasarim: GO2EFB/CLAUDE.md -> "SUPER ADMIN SETTINGS — onayli tasarim"
--
-- Bu goc DAVRANIS DEGISTIRMEZ: features bos gelir, katalogdaki 13 anahtarin
-- hepsi acik kabul edilir, REC'te hicbir sey degismez.

BEGIN;

-- Sirket bazli konfigurasyon: yalniz VARSAYILANDAN SAPMALAR yazilir.
-- Ornek: {"ui.raaq": false} -> yalnizca RAAQ kapali, gerisi katalog varsayilani.
-- Sema musteriye gore DEGISMEZ (Kural 10): tablolar kuresel kalir, kapali modul
-- yalnizca ilgili tabloya satir yazmaz.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Super admin izi — TEK TABLO (Serkan karari), tip alaniyla ayrilir.
CREATE TABLE IF NOT EXISTS superadmin_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES profiles(id),
  customer_id uuid REFERENCES customers(id),
  type        text NOT NULL CHECK (type IN ('config_change','data_view','password_reset','limit_change')),
  field       text,
  old_value   jsonb,
  new_value   jsonb,
  reason      text,
  -- Gerekce SUS DEGIL: bir ayar degisikligini denetimde savunulabilir bir karara
  -- cevirir ("OM uyarinca FMS kaydi esas"). Yalnizca goruntuleme kaydinda serbest.
  CONSTRAINT superadmin_log_reason_required
    CHECK (type = 'data_view' OR reason IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS superadmin_log_cust_at_idx
  ON superadmin_log (customer_id, at DESC);

ALTER TABLE superadmin_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY superadmin_log_read ON superadmin_log
  FOR SELECT TO authenticated
  USING (is_super_admin());

CREATE POLICY superadmin_log_insert ON superadmin_log
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

-- UPDATE / DELETE politikasi BILEREK YOK -> iz degistirilemez, silinemez (Ilke 3).

COMMIT;
