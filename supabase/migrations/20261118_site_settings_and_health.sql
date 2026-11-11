-- =============================================================================
-- MIGRASI 20261118: PENGATURAN SITUS & SEO (site_settings) DAN HEALTH DASHBOARD
-- =============================================================================
-- Cakupan Fase 4 & Fase 5:
--   1. Tabel public.site_settings (satu baris 'global') dengan batasan panjang
--      default_title <= 70, meta_description <= 200, dan protokol https:// pada
--      canonical_url serta og_image_url.
--   2. Kebijakan RLS site_settings: SELECT diizinkan untuk anon dan authenticated;
--      INSERT / UPDATE / DELETE hanya diizinkan untuk is_superadmin().
--   3. Trigger audit otomatis (trg_audit_site_settings_change) yang mencatat
--      setiap perubahan ke public.audit_logs dengan aksi SITE_SETTINGS_UPDATED
--      beserta daftar kolom yang berubah menggunakan flag mtq.rpc_audit_active.
--   4. Tabel public.app_schema_versions berisi riwayat versi migrasi ('20261114'
--      s.d. '20261118').
--   5. Fungsi RPC public.get_platform_health() (SECURITY DEFINER, khusus
--      Superadmin) yang mengembalikan 9 pemeriksaan kesehatan platform.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.site_settings (
    id TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
    site_name TEXT NOT NULL DEFAULT 'Manajemen MTQ',
    title_template TEXT NOT NULL DEFAULT '%s — Manajemen MTQ',
    default_title TEXT NOT NULL DEFAULT 'Manajemen MTQ — Musabaqah Digital' CHECK (char_length(default_title) <= 70),
    meta_description TEXT NOT NULL DEFAULT 'Platform manajemen MTQ multi-tenant dengan penilaian digital dewan hakim, mushaf kanvas, dan rekapitulasi nilai real-time.' CHECK (char_length(meta_description) <= 200),
    meta_keywords TEXT NOT NULL DEFAULT 'MTQ, STQ, LPTQ, Musabaqah Tilawatil Quran, E-Scoring MTQ',
    canonical_url TEXT NOT NULL DEFAULT 'https://mtq.id' CHECK (canonical_url ~ '^https://'),
    robots TEXT NOT NULL DEFAULT 'index,follow' CHECK (robots IN ('index,follow', 'noindex,nofollow')),
    favicon_url TEXT NOT NULL DEFAULT '/icon.svg',
    og_title TEXT NOT NULL DEFAULT 'Manajemen MTQ — Musabaqah Digital',
    og_description TEXT NOT NULL DEFAULT 'Platform manajemen MTQ multi-tenant dengan penilaian digital dewan hakim, mushaf kanvas, dan rekapitulasi nilai real-time.',
    og_image_url TEXT NOT NULL DEFAULT 'https://mtq.id/icons/icon-512x512.png' CHECK (og_image_url ~ '^https://'),
    og_image_alt TEXT NOT NULL DEFAULT 'Logo dan Antarmuka Manajemen MTQ Digital',
    og_type TEXT NOT NULL DEFAULT 'website',
    og_locale TEXT NOT NULL DEFAULT 'id_ID',
    twitter_card TEXT NOT NULL DEFAULT 'summary_large_image' CHECK (twitter_card IN ('summary_large_image', 'summary')),
    twitter_site TEXT NOT NULL DEFAULT '@lptq_id',
    theme_color TEXT NOT NULL DEFAULT '#065f46',
    google_site_verification TEXT NOT NULL DEFAULT '',
    manual_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.site_settings (id)
VALUES ('global')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_settings_select_policy ON public.site_settings;
CREATE POLICY site_settings_select_policy ON public.site_settings
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS site_settings_insert_policy ON public.site_settings;
CREATE POLICY site_settings_insert_policy ON public.site_settings
    FOR INSERT
    TO authenticated
    WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS site_settings_update_policy ON public.site_settings;
CREATE POLICY site_settings_update_policy ON public.site_settings
    FOR UPDATE
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS site_settings_delete_policy ON public.site_settings;
CREATE POLICY site_settings_delete_policy ON public.site_settings
    FOR DELETE
    TO authenticated
    USING (public.is_superadmin());

GRANT SELECT ON public.site_settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_site_settings_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    IF auth.uid() IS NOT NULL THEN
        NEW.updated_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_site_settings_metadata ON public.site_settings;
CREATE TRIGGER trg_touch_site_settings_metadata
    BEFORE UPDATE ON public.site_settings
    FOR EACH ROW EXECUTE FUNCTION public.touch_site_settings_metadata();

CREATE OR REPLACE FUNCTION public.audit_site_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor RECORD;
    v_target_tenant_id UUID;
    v_changed_cols TEXT[];
    v_changed_list TEXT;
BEGIN
    SELECT array_agg(n.key ORDER BY n.key)
    INTO v_changed_cols
    FROM jsonb_each(to_jsonb(NEW)) n
    LEFT JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
    WHERE n.key NOT IN ('updated_at', 'updated_by')
      AND n.value IS DISTINCT FROM o.value;

    IF v_changed_cols IS NULL OR array_length(v_changed_cols, 1) IS NULL THEN
        v_changed_cols := ARRAY['updated_at'];
    END IF;
    v_changed_list := array_to_string(v_changed_cols, ', ');

    SELECT name, role INTO v_actor FROM public.profiles WHERE id = auth.uid();

    SELECT t.id INTO v_target_tenant_id
    FROM public.tenants t
    WHERE t.id <> '00000000-0000-0000-0000-000000000000'::uuid
      AND t.status = 'Aktif'
    ORDER BY t.created_at ASC
    LIMIT 1;

    IF v_target_tenant_id IS NULL THEN
        SELECT t.id INTO v_target_tenant_id
        FROM public.tenants t
        ORDER BY t.created_at ASC
        LIMIT 1;
    END IF;

    IF v_target_tenant_id IS NOT NULL THEN
        PERFORM set_config('mtq.rpc_audit_active', 'true', true);
        INSERT INTO public.audit_logs (
            tenant_id,
            actor_id,
            actor_name,
            action,
            target,
            summary,
            outcome,
            metadata
        ) VALUES (
            v_target_tenant_id,
            auth.uid(),
            COALESCE(v_actor.name, 'Superadmin') || ' (' || COALESCE(v_actor.role, 'superadmin') || ')',
            'SITE_SETTINGS_UPDATED',
            'Pengaturan Situs & SEO (' || NEW.id || ')',
            'Memperbarui pengaturan SEO & meta situs. Kolom berubah: ' || v_changed_list,
            'Success',
            jsonb_build_object('changed_columns', to_jsonb(v_changed_cols))
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_site_settings_change ON public.site_settings;
CREATE TRIGGER trg_audit_site_settings_change
    AFTER UPDATE ON public.site_settings
    FOR EACH ROW EXECUTE FUNCTION public.audit_site_settings_change();

-- =============================================================================
-- FASE 5: TABEL VERSI SKEMA & RPC get_platform_health()
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_schema_versions (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_schema_versions (version)
VALUES
    ('20261114'),
    ('20261115'),
    ('20261116'),
    ('20261117'),
    ('20261118')
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.app_schema_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_schema_versions_select_policy ON public.app_schema_versions;
CREATE POLICY app_schema_versions_select_policy ON public.app_schema_versions
    FOR SELECT
    TO authenticated
    USING (public.is_superadmin());

DROP POLICY IF EXISTS app_schema_versions_manage_policy ON public.app_schema_versions;
CREATE POLICY app_schema_versions_manage_policy ON public.app_schema_versions
    FOR ALL
    TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_schema_versions TO authenticated;

CREATE OR REPLACE FUNCTION public.get_platform_health()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_latest_version TEXT;
    v_schema_detail JSONB;

    v_unmapped_count INT;
    v_unmapped_detail JSONB;

    v_borrowed_count INT;
    v_borrowed_detail JSONB;

    v_unverified_rubrics_count INT;
    v_unverified_rubrics_detail JSONB;

    v_orphan_tenants_count INT;
    v_orphan_tenants_detail JSONB;

    v_stages_no_judges_count INT;
    v_stages_no_judges_detail JSONB;

    v_pending_verif_count INT;
    v_pending_verif_detail JSONB;

    v_stalled_count INT;
    v_stalled_detail JSONB;

    v_site_missing_count INT;
    v_site_missing_detail JSONB;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Superadmin yang dapat menjalankan pemeriksaan kesehatan platform.';
    END IF;

    -- 1. schema_version
    SELECT MAX(version) INTO v_latest_version FROM public.app_schema_versions;
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'version', v.version,
                'applied_at', v.applied_at
            )
            ORDER BY v.version DESC
        ),
        '[]'::jsonb
    ) INTO v_schema_detail
    FROM (
        SELECT version, applied_at
        FROM public.app_schema_versions
        ORDER BY version DESC
        LIMIT 20
    ) v;

    -- 2. unmapped_error_categories
    SELECT COUNT(*)::int INTO v_unmapped_count
    FROM public.error_categories ec
    WHERE ec.status = 'Aktif'
      AND ec.rubric_field_id IS NULL
      AND ec.criterion_id IS NULL
      AND ec.deduction_rule_id IS NULL;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', u.id,
                'code', u.code,
                'name', u.name,
                'tenant_id', u.tenant_id,
                'tenant_name', u.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_unmapped_detail
    FROM (
        SELECT ec.id, ec.code, ec.name, ec.tenant_id, t.name AS tenant_name
        FROM public.error_categories ec
        JOIN public.tenants t ON t.id = ec.tenant_id
        WHERE ec.status = 'Aktif'
          AND ec.rubric_field_id IS NULL
          AND ec.criterion_id IS NULL
          AND ec.deduction_rule_id IS NULL
        ORDER BY t.name ASC, ec.code ASC
        LIMIT 20
    ) u;

    -- 3. borrowed_maqra_sheets
    SELECT COUNT(*)::int INTO v_borrowed_count
    FROM public.judge_assessments ja
    JOIN public.assigned_maqras am ON am.id = ja.assigned_maqra_id
    WHERE am.stage_participation_id <> ja.stage_participation_id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'assessment_id', b.id,
                'stage_participation_id', b.stage_participation_id,
                'maqra_stage_participation_id', b.maqra_sp_id,
                'tenant_id', b.tenant_id,
                'tenant_name', b.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_borrowed_detail
    FROM (
        SELECT
            ja.id,
            ja.stage_participation_id,
            am.stage_participation_id AS maqra_sp_id,
            ja.tenant_id,
            t.name AS tenant_name
        FROM public.judge_assessments ja
        JOIN public.assigned_maqras am ON am.id = ja.assigned_maqra_id
        JOIN public.tenants t ON t.id = ja.tenant_id
        WHERE am.stage_participation_id <> ja.stage_participation_id
        ORDER BY ja.created_at DESC
        LIMIT 20
    ) b;

    -- 4. rubrics_without_official_source
    WITH unverified_items AS (
        SELECT
            'rubrik'::text AS jenis,
            rv.code AS identifier,
            rv.name AS item_name,
            COALESCE(NULLIF(TRIM(rv.official_source), ''), 'Belum diisi') AS official_source,
            rv.tenant_id,
            t.name AS tenant_name
        FROM public.rubric_versions rv
        JOIN public.tenants t ON t.id = rv.tenant_id
        WHERE COALESCE(TRIM(rv.official_source), '') = ''
        UNION ALL
        SELECT
            'aturan'::text AS jenis,
            COALESCE(crc.branch_name, 'Cabang') AS identifier,
            'Aturan Kompetisi ' || COALESCE(crc.branch_name, '') AS item_name,
            COALESCE(NULLIF(TRIM(crc.official_source), ''), 'Belum terverifikasi resmi') AS official_source,
            crc.tenant_id,
            t.name AS tenant_name
        FROM public.competition_rule_configs crc
        JOIN public.tenants t ON t.id = crc.tenant_id
        WHERE COALESCE(TRIM(crc.official_source), '') = ''
           OR crc.is_verified_official = false
    )
    SELECT
        COUNT(*)::int,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'jenis', ui.jenis,
                        'identifier', ui.identifier,
                        'name', ui.item_name,
                        'official_source', ui.official_source,
                        'tenant_id', ui.tenant_id,
                        'tenant_name', ui.tenant_name
                    )
                )
                FROM (SELECT * FROM unverified_items LIMIT 20) ui
            ),
            '[]'::jsonb
        )
    INTO v_unverified_rubrics_count, v_unverified_rubrics_detail
    FROM unverified_items;

    -- 5. tenants_without_active_admin
    SELECT COUNT(*)::int INTO v_orphan_tenants_count
    FROM public.tenants t
    WHERE t.status = 'Aktif'
      AND t.id <> '00000000-0000-0000-0000-000000000000'::uuid
      AND NOT EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = t.id
            AND tm.role = 'admin'
            AND tm.status = 'Aktif'
      );

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'tenant_id', ot.id,
                'code', ot.code,
                'name', ot.name,
                'event_name', ot.event_name
            )
        ),
        '[]'::jsonb
    ) INTO v_orphan_tenants_detail
    FROM (
        SELECT t.id, t.code, t.name, t.event_name
        FROM public.tenants t
        WHERE t.status = 'Aktif'
          AND t.id <> '00000000-0000-0000-0000-000000000000'::uuid
          AND NOT EXISTS (
              SELECT 1 FROM public.tenant_memberships tm
              WHERE tm.tenant_id = t.id
                AND tm.role = 'admin'
                AND tm.status = 'Aktif'
          )
        ORDER BY t.created_at DESC
        LIMIT 20
    ) ot;

    -- 6. stages_without_judges
    SELECT COUNT(*)::int INTO v_stages_no_judges_count
    FROM public.stages s
    WHERE s.is_finalized = false
      AND EXISTS (
          SELECT 1 FROM public.stage_participations sp
          WHERE sp.stage_id = s.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.judge_assignments ja
          WHERE ja.stage_id = s.id
            AND ja.status = 'Aktif'
      );

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'stage_id', sj.id,
                'stage_name', sj.name,
                'tenant_id', sj.tenant_id,
                'tenant_name', sj.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_stages_no_judges_detail
    FROM (
        SELECT s.id, s.name, s.tenant_id, t.name AS tenant_name
        FROM public.stages s
        JOIN public.tenants t ON t.id = s.tenant_id
        WHERE s.is_finalized = false
          AND EXISTS (
              SELECT 1 FROM public.stage_participations sp
              WHERE sp.stage_id = s.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.judge_assignments ja
              WHERE ja.stage_id = s.id
                AND ja.status = 'Aktif'
          )
        ORDER BY t.name ASC, s.stage_order ASC
        LIMIT 20
    ) sj;

    -- 7. pending_verifications
    SELECT COUNT(*)::int INTO v_pending_verif_count
    FROM public.participants p
    WHERE p.verification_status = 'Diajukan';

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'tenant_id', pv.tenant_id,
                'tenant_name', pv.tenant_name,
                'pending_count', pv.pending_count
            )
        ),
        '[]'::jsonb
    ) INTO v_pending_verif_detail
    FROM (
        SELECT
            t.id AS tenant_id,
            t.name AS tenant_name,
            COUNT(p.id)::int AS pending_count
        FROM public.participants p
        JOIN public.tenants t ON t.id = p.tenant_id
        WHERE p.verification_status = 'Diajukan'
        GROUP BY t.id, t.name
        ORDER BY COUNT(p.id) DESC
        LIMIT 20
    ) pv;

    -- 8. stalled_assessments
    SELECT COUNT(*)::int INTO v_stalled_count
    FROM public.judge_assessments ja
    WHERE ja.status = 'in_progress'
      AND ja.updated_at < (now() - interval '24 hours');

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'assessment_id', sa.id,
                'judge_name', sa.judge_name,
                'updated_at', sa.updated_at,
                'tenant_id', sa.tenant_id,
                'tenant_name', sa.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_stalled_detail
    FROM (
        SELECT
            ja.id,
            COALESCE(pr.name, 'Dewan Hakim') AS judge_name,
            ja.updated_at,
            ja.tenant_id,
            t.name AS tenant_name
        FROM public.judge_assessments ja
        JOIN public.tenants t ON t.id = ja.tenant_id
        LEFT JOIN public.profiles pr ON pr.id = ja.judge_profile_id
        WHERE ja.status = 'in_progress'
          AND ja.updated_at < (now() - interval '24 hours')
        ORDER BY ja.updated_at ASC
        LIMIT 20
    ) sa;

    -- 9. site_settings_missing
    SELECT COUNT(*)::int INTO v_site_missing_count
    FROM (
        SELECT 1
        WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id = 'global')
           OR EXISTS (
               SELECT 1 FROM public.site_settings
               WHERE id = 'global'
                 AND (
                     COALESCE(TRIM(site_name), '') = ''
                     OR COALESCE(TRIM(default_title), '') = ''
                     OR COALESCE(TRIM(og_image_url), '') = ''
                 )
           )
    ) sm;

    IF v_site_missing_count > 0 THEN
        v_site_missing_detail := jsonb_build_array(
            jsonb_build_object(
                'id', 'global',
                'issue', 'Baris site_settings belum lengkap atau og_image_url kosong'
            )
        );
    ELSE
        v_site_missing_detail := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_array(
        jsonb_build_object(
            'key', 'schema_version',
            'label', 'Versi Migrasi Skema Database',
            'status', CASE WHEN COALESCE(v_latest_version, '') = '20261118' THEN 'ok' ELSE 'critical' END,
            'count', CASE WHEN COALESCE(v_latest_version, '') = '20261118' THEN 0 ELSE 1 END,
            'detail', v_schema_detail,
            'how_to_fix', 'Pastikan seluruh migrasi hingga 20261118_site_settings_and_health.sql telah dijalankan secara berurutan sesuai panduan di README.md.'
        ),
        jsonb_build_object(
            'key', 'unmapped_error_categories',
            'label', 'Kategori Kesalahan Aktif Tanpa Pemetaan Bidang Rubrik',
            'status', CASE WHEN v_unmapped_count > 0 THEN 'critical' ELSE 'ok' END,
            'count', v_unmapped_count,
            'detail', v_unmapped_detail,
            'how_to_fix', 'Buka menu Master Data & Rubrik pada penyelenggara terkait, lalu petakan setiap kategori kesalahan aktif ke bidang rubrik (rubric_field_id), kriteria, atau aturan potongan.'
        ),
        jsonb_build_object(
            'key', 'borrowed_maqra_sheets',
            'label', 'Lembar Penilaian dengan Maqra Milik Peserta Lain',
            'status', CASE WHEN v_borrowed_count > 0 THEN 'critical' ELSE 'ok' END,
            'count', v_borrowed_count,
            'detail', v_borrowed_detail,
            'how_to_fix', 'Periksa integritas lembar penilaian terkait dan pastikan assigned_maqra_id merujuk pada maqra milik stage_participation_id peserta yang sama.'
        ),
        jsonb_build_object(
            'key', 'rubrics_without_official_source',
            'label', 'Rubrik & Aturan Kompetisi Tanpa Rujukan Resmi',
            'status', CASE WHEN v_unverified_rubrics_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_unverified_rubrics_count,
            'detail', v_unverified_rubrics_detail,
            'how_to_fix', 'Buka Master Data & Rubrik, isi nomor SK/Juknis resmi LPTQ pada kolom official_source, dan tandai is_verified_official = true setelah diverifikasi.'
        ),
        jsonb_build_object(
            'key', 'tenants_without_active_admin',
            'label', 'Penyelenggara Aktif Tanpa Keanggotaan Admin Aktif',
            'status', CASE WHEN v_orphan_tenants_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_orphan_tenants_count,
            'detail', v_orphan_tenants_detail,
            'how_to_fix', 'Buka menu Manajemen Akun di Superadmin, lalu tambahkan atau aktifkan minimal satu akun Admin MTQ untuk penyelenggara tersebut.'
        ),
        jsonb_build_object(
            'key', 'stages_without_judges',
            'label', 'Babak Belum Disahkan Berpeserta Tanpa Penugasan Hakim Aktif',
            'status', CASE WHEN v_stages_no_judges_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_stages_no_judges_count,
            'detail', v_stages_no_judges_detail,
            'how_to_fix', 'Buka menu Manajemen Babak pada penyelenggara terkait dan tugaskan dewan hakim aktif pada babak yang memiliki peserta.'
        ),
        jsonb_build_object(
            'key', 'pending_verifications',
            'label', 'Peserta Berstatus Diajukan (Menunggu Verifikasi Berkas)',
            'status', CASE WHEN v_pending_verif_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_pending_verif_count,
            'detail', v_pending_verif_detail,
            'how_to_fix', 'Buka menu Grup & Peserta MTQ pada penyelenggara terkait untuk memverifikasi atau menolak berkas peserta sebelum undian dimulai.'
        ),
        jsonb_build_object(
            'key', 'stalled_assessments',
            'label', 'Lembar Penilaian In-Progress Lebih dari 24 Jam',
            'status', CASE WHEN v_stalled_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_stalled_count,
            'detail', v_stalled_detail,
            'how_to_fix', 'Buka menu Monitoring Penilaian Dewan Hakim untuk meninjau lembar penilaian yang tertahan lebih dari 24 jam.'
        ),
        jsonb_build_object(
            'key', 'site_settings_missing',
            'label', 'Kelengkapan Pengaturan SEO & Gambar Open Graph Situs',
            'status', CASE WHEN v_site_missing_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_site_missing_count,
            'detail', v_site_missing_detail,
            'how_to_fix', 'Buka menu Pengaturan di Superadmin dan pastikan Nama Situs, Judul Bawaan, serta URL Gambar Open Graph (https://) telah terisi.'
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_health() TO authenticated;
