-- 11 Agu 2026 — SUPER ADMIN EDIT KAPISI (mimari kural)
-- CLAUDE.md TASARIM ILKELERI md.6
--
-- SERKAN'IN KURALI:
--   "Her yerde yazabilir, ne yazarsa yazsin, ama editini RAPOR ILE
--    gerceklestirebilir — aksi halde olmaz. Yaptigi edit ILGILI SIRKETIN
--    log kayitlarinda tutulur."
--   "Edit edecek, SAVE edecekken soracak; aksi halde degisiklik olmayacak."
--
-- TASARIM: SURELI IZIN YOK. Gerekce, yazma ISTEGININ KENDISIYLE gelir
-- (PostgREST istek basligi: x-edit-reason). Tetikleyici onu okur; yoksa yazmayi
-- reddeder. Yani her edit KENDI raporunu tasir, bir kez acilan izin sonraki
-- editleri kapsamaz.
--
-- NEDEN TETIKLEYICI, NEDEN POLITIKA DEGIL:
--   37 tabloda ayri ayri politika yazmak "corba"nin kendisiydi: 26 tabloda
--   super admin yazabiliyordu, 11'inde yazamiyordu; sinir tasarimdan degil
--   parca parca mudahaleden dogmustu (super admin flt_report'u degistirebiliyor
--   ama planin adini degistiremiyordu). Tetikleyici TEK NOKTADIR; hangi tabloya
--   yazilirsa yazilsin ayni kural isler, unutulan tablo kalmaz.
--
-- ARAYUZ UNUTURSA: yazma GURULTUYLE duser ("reason required"), sessizce
-- izsiz gecmez. 10 Agu'daki deletePlan olayinin tersi.
--
-- ETKILENMEYENLER (ikisi de auth.uid() NULL -> is_super_admin() false):
--   * edge function'lar (service key) — archive-flight, parse-plan, manage-user
--   * normal kullanicilar ve pilotlar — kural onlari HIC ilgilendirmez

BEGIN;

-- ── 1) superadmin_log: edit izi alanlari ─────────────────────────────────────
ALTER TABLE superadmin_log DROP CONSTRAINT IF EXISTS superadmin_log_type_check;
ALTER TABLE superadmin_log ADD CONSTRAINT superadmin_log_type_check
  CHECK (type IN ('config_change','data_view','password_reset','limit_change','data_edit'));

ALTER TABLE superadmin_log ADD COLUMN IF NOT EXISTS table_name text;
ALTER TABLE superadmin_log ADD COLUMN IF NOT EXISTS row_id      text;
ALTER TABLE superadmin_log ADD COLUMN IF NOT EXISTS op          text;

-- ── 2) Istekle gelen gerekce ─────────────────────────────────────────────────
-- PostgREST her istegin basliklarini request.headers altinda sunar.
-- psql/service-key yolunda bu ayar YOKTUR -> NULL doner (ikinci parametre true).
CREATE OR REPLACE FUNCTION edit_reason()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(btrim(coalesce(
    current_setting('request.headers', true)::json ->> 'x-edit-reason', '')), '');
$$;

-- ── 3) TEK KURAL — kapi + iz ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION superadmin_edit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_cid uuid;
  v_rsn text := edit_reason();
BEGIN
  -- Normal kullanici / edge function: kural onlari ilgilendirmez.
  IF NOT is_super_admin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- GEREKCESIZ EDIT OLMAZ.
  IF v_rsn IS NULL OR length(v_rsn) < 3 THEN
    RAISE EXCEPTION 'A written reason is required for this change (table: %, op: %). The change was not applied.',
      TG_TABLE_NAME, TG_OP USING ERRCODE = '42501';
  END IF;

  -- Satirin sahibi sirket: once customer_id, sonra plan_id, sonra pilot_id.
  v_cid := nullif(v_row->>'customer_id','')::uuid;
  IF v_cid IS NULL AND v_row ? 'plan_id' THEN
    SELECT p.customer_id INTO v_cid FROM plans p WHERE p.id = (v_row->>'plan_id')::uuid;
  END IF;
  IF v_cid IS NULL AND v_row ? 'pilot_id' THEN
    SELECT pr.customer_id INTO v_cid FROM profiles pr WHERE pr.id = (v_row->>'pilot_id')::uuid;
  END IF;

  -- Sahibi cozulemeyen satir da gecmez: kimin verisine dokunuldugu bilinmiyorsa
  -- iz de yazilamaz; iz yazilamiyorsa edit yapilamaz.
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'The owning company of this row could not be determined; the change was not applied (table: %).',
      TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;

  -- IZ, STANDART ADMIN EDITININ DUZENIYLE: alan alan eski->yeni.
  -- (admin_edits: field_name / old_value / new_value / reason). Satirin tamamini
  -- JSON yazmak hem okunmaz olurdu hem de plan_versions gibi tablolarda tek
  -- editte 70 KB'lik iki kopya demekti.
  IF TG_OP = 'UPDATE' THEN
    DECLARE k text;
    BEGIN
      FOR k IN SELECT jsonb_object_keys(v_new) LOOP
        IF k <> 'updated_at' AND (v_new->>k) IS DISTINCT FROM (v_old->>k) THEN
          INSERT INTO superadmin_log(actor_id, customer_id, type, table_name, row_id, op,
                                     field, old_value, new_value, reason)
          VALUES (auth.uid(), v_cid, 'data_edit', TG_TABLE_NAME,
                  coalesce(v_row->>'id', v_row->>'plan_id'), TG_OP,
                  k, to_jsonb(v_old->>k), to_jsonb(v_new->>k), v_rsn);
        END IF;
      END LOOP;
    END;
  ELSE
    -- INSERT / DELETE: alan kirilimi anlamsiz, olayin kendisi yazilir.
    INSERT INTO superadmin_log(actor_id, customer_id, type, table_name, row_id, op,
                               field, old_value, new_value, reason)
    VALUES (auth.uid(), v_cid, 'data_edit', TG_TABLE_NAME,
            coalesce(v_row->>'id', v_row->>'plan_id'), TG_OP,
            CASE TG_OP WHEN 'INSERT' THEN 'RECORD_CREATED' ELSE 'RECORD_DELETED' END,
            CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(v_row->>'id') ELSE NULL END,
            CASE WHEN TG_OP = 'INSERT' THEN to_jsonb(v_row->>'id') ELSE NULL END,
            v_rsn);
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- ── 4) MUSTERI VERISI olan tablolara bagla ───────────────────────────────────
-- superadmin_log ve customers HARIC: log kendi kendini loglamamali; customers
-- ise app sahibinin ONAYLI yazma listesinde (sirket ayarlari, modul anahtarlari).
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
      AND c.relname NOT IN ('superadmin_log','customers')
      -- KURESEL / REFERANS TABLOLAR HARIC: sirket sahibi yoktur, kural orada
      -- calisamaz — kalsalardi her yazma "sahibi cozulemedi" diye reddedilirdi.
      -- Bunlar musteri verisi degil, UYGULAMA verisidir.
      AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public' AND col.table_name = c.relname
                    AND col.column_name IN ('customer_id','plan_id','pilot_id'))
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_sa_edit_guard ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER zz_sa_edit_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION superadmin_edit_guard()', t);
  END LOOP;
END $$;

-- ── 5) MUSTERI KENDI KAYITLARINDA GORSUN ─────────────────────────────────────
-- Serkan: "yaptigi edit ILGILI SIRKETIN log kayitlarinda tutulur."
-- Iz yalniz bizde dursaydi musteri bize GUVENMEK zorunda kalirdi; kendi
-- panelinde gorurse DENETLEYEBILIR.
DROP POLICY IF EXISTS superadmin_log_customer_read ON superadmin_log;
CREATE POLICY superadmin_log_customer_read ON superadmin_log
  FOR SELECT TO authenticated
  USING (customer_id = my_customer_id());

COMMIT;
