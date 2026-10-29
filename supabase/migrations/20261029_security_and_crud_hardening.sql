-- ==============================================================================
-- MIGRATION: 20261029_security_and_crud_hardening.sql
-- Deskripsi: Migrasi Non-Destruktif & Idempoten untuk Database yang Sudah Menjalankan
--            supabase/schema.sql dan supabase/seed.sql (Tanpa Menghapus Data)
-- Cakupan:
--   1. Penutupan Bypass Pengesahan Babak (Trigger & RLS Granular pada tabel stages)
--   2. Penutupan Bypass Snapshot Hasil (Trigger & RLS Trusted Insert pada stage_result_snapshots)
--   3. Perhitungan Nilai & Peringkat Otoritatif Server pada RPC advance_stage_qualifiers
--   4. Proteksi Eskalasi Role Mandiri pada profiles (Trigger & Non-Recursive Helper)
--   5. Pembatasan Caller pada is_assigned_judge & Hak Akses Superadmin Lintas Tenant
--   6. RPC upsert_tenant_member_profile untuk Manajemen Anggota Tenant Terotorisasi
-- ==============================================================================

-- 1. TRIGGER PROTEKSI SNAPSHOT HASIL BABAK (TRUSTED RPC INSERT ONLY)
CREATE OR REPLACE FUNCTION public.enforce_trusted_stage_snapshot_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('mtq.rpc_stage_finalize_active', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'Pelanggaran Keamanan: Pembuatan stage_result_snapshots secara langsung melalui Data API ditolak. Snapshot hasil resmi hanya dapat dibuat oleh transaksi advance_stage_qualifiers(...).';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_snapshots_trusted_insert ON stage_result_snapshots;
CREATE TRIGGER trg_stage_snapshots_trusted_insert
    BEFORE INSERT ON stage_result_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.enforce_trusted_stage_snapshot_insert();

-- 2. TRIGGER PROTEKSI PENGESAHAN & IMUTABILITAS BABAK (STAGES)
CREATE OR REPLACE FUNCTION public.enforce_stage_finalization_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rpc_stage_finalize BOOLEAN := COALESCE(current_setting('mtq.rpc_stage_finalize_active', true), 'false') = 'true';
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF (NEW.is_finalized = true OR NEW.status = 'Selesai' OR NEW.finalized_at IS NOT NULL OR NEW.finalized_by IS NOT NULL)
           AND NOT v_rpc_stage_finalize THEN
            RAISE EXCEPTION 'Pelanggaran Keamanan: Babak baru tidak dapat langsung dibuat dalam status selesai atau terfinalisasi tanpa prosedur pengesahan resmi.';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.is_finalized = true THEN
            RAISE EXCEPTION 'Pelanggaran Imutabilitas: Babak musabaqah yang sudah disahkan bersifat permanen dan tidak dapat dihapus.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.is_finalized = true THEN
            RAISE EXCEPTION 'Pelanggaran Imutabilitas: Babak musabaqah yang sudah disahkan secara resmi terkunci dan tidak dapat dimodifikasi.';
        END IF;

        IF (
            NEW.is_finalized = true
            OR NEW.status = 'Selesai'
            OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
            OR NEW.finalized_by IS DISTINCT FROM OLD.finalized_by
        ) AND NOT v_rpc_stage_finalize THEN
            RAISE EXCEPTION 'Pelanggaran Keamanan: Pengesahan babak secara langsung melalui Data API ditolak. Gunakan prosedur resmi advance_stage_qualifiers(...).';
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_finalization_integrity ON stages;
CREATE TRIGGER trg_enforce_stage_finalization_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON stages
    FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_finalization_integrity();

-- 3. FUNGSI PEMBANTU KEAMANAN & PROTEKSI ESKALASI ROLE PROFILES
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'superadmin'
    );
$$;

CREATE OR REPLACE FUNCTION get_my_profile_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.role::text FROM profiles p WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_role_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF COALESCE(current_setting('mtq.rpc_role_admin_active', true), 'false') <> 'true'
           AND NOT is_superadmin()
           AND (auth.uid() IS NOT NULL OR COALESCE(current_setting('role', true), '') IN ('authenticated', 'anon')) THEN
            RAISE EXCEPTION 'Pelanggaran Keamanan: Eskalasi atau perubahan peran (role) secara langsung melalui Data API ditolak.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_role_protection ON profiles;
CREATE TRIGGER trg_enforce_profile_role_protection
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_role_protection();

CREATE OR REPLACE FUNCTION get_user_tenants()
RETURNS TABLE (tenant_id UUID) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
    SELECT tm.tenant_id FROM tenant_memberships tm
    WHERE tm.profile_id = auth.uid() AND tm.status = 'Aktif'
    UNION
    SELECT t.id FROM tenants t
    WHERE is_superadmin() AND t.id <> '00000000-0000-0000-0000-000000000000'::uuid;
$$;

CREATE OR REPLACE FUNCTION is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_memberships tm
        WHERE tm.tenant_id = p_tenant_id 
          AND tm.profile_id = auth.uid()
          AND tm.role IN ('admin', 'superadmin')
          AND tm.status = 'Aktif'
    ) OR is_superadmin();
$$;

CREATE OR REPLACE FUNCTION is_assigned_judge(
    p_tenant_id UUID,
    p_stage_participation_id UUID,
    p_judge_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT (
        auth.uid() IS NOT NULL
        AND (p_judge_id = auth.uid() OR is_tenant_admin(p_tenant_id))
        AND EXISTS (
            SELECT 1
            FROM stage_participations sp
            JOIN stages s ON s.id = sp.stage_id
            JOIN participants p ON p.id = sp.participant_id
            JOIN judge_assignments ja ON ja.stage_id = sp.stage_id
                 AND ja.tenant_id = sp.tenant_id
                 AND (ja.branch_id IS NULL OR ja.branch_id = p.branch_id OR ja.branch_id = s.branch_id)
            WHERE sp.id = p_stage_participation_id
              AND sp.tenant_id = p_tenant_id
              AND ja.judge_profile_id = p_judge_id
              AND ja.status = 'Aktif'
        )
    );
$$;

-- 4. PEMBARUAN KEBIJAKAN RLS (STAGES, SNAPSHOTS, PROFILES, TENANTS, MEMBERSHIPS)
DROP POLICY IF EXISTS tenants_insert_policy ON tenants;
CREATE POLICY tenants_insert_policy ON tenants FOR INSERT
WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON profiles;
DROP POLICY IF EXISTS profiles_select_policy ON profiles;
CREATE POLICY profiles_select_policy ON profiles FOR SELECT
USING (
    id = auth.uid()
    OR is_superadmin()
    OR id IN (
        SELECT tm.profile_id FROM tenant_memberships tm 
        WHERE tm.tenant_id IN (SELECT get_user_tenants())
    )
);

DROP POLICY IF EXISTS "Users can update own profile without escalating role" ON profiles;
DROP POLICY IF EXISTS profiles_update_policy ON profiles;
CREATE POLICY profiles_update_policy ON profiles FOR UPDATE
USING (id = auth.uid() OR is_superadmin())
WITH CHECK (
    (id = auth.uid() AND role = get_my_profile_role())
    OR is_superadmin()
);

DROP POLICY IF EXISTS "Users can view memberships of their tenants" ON tenant_memberships;
DROP POLICY IF EXISTS tenant_memberships_select_policy ON tenant_memberships;
CREATE POLICY tenant_memberships_select_policy ON tenant_memberships FOR SELECT
USING (profile_id = auth.uid() OR tenant_id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "Tenant members can view stages" ON stages;
DROP POLICY IF EXISTS "Tenant admins can manage stages" ON stages;
DROP POLICY IF EXISTS stages_admin_policy ON stages;
DROP POLICY IF EXISTS stages_select_policy ON stages;
DROP POLICY IF EXISTS stages_insert_policy ON stages;
DROP POLICY IF EXISTS stages_update_policy ON stages;
DROP POLICY IF EXISTS stages_delete_policy ON stages;

CREATE POLICY stages_select_policy ON stages FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

CREATE POLICY stages_insert_policy ON stages FOR INSERT
WITH CHECK (
    is_tenant_admin(tenant_id)
    AND is_finalized = false
    AND status <> 'Selesai'
);

CREATE POLICY stages_update_policy ON stages FOR UPDATE
USING (
    is_tenant_admin(tenant_id)
    AND is_finalized = false
)
WITH CHECK (
    is_tenant_admin(tenant_id)
    AND (
        (is_finalized = false AND status <> 'Selesai')
        OR COALESCE(current_setting('mtq.rpc_stage_finalize_active', true), 'false') = 'true'
    )
);

CREATE POLICY stages_delete_policy ON stages FOR DELETE
USING (
    is_tenant_admin(tenant_id)
    AND is_finalized = false
);

DROP POLICY IF EXISTS "Admins can insert stage result snapshots" ON stage_result_snapshots;
DROP POLICY IF EXISTS "Admins can insert stage_result_snapshots" ON stage_result_snapshots;
DROP POLICY IF EXISTS stage_result_snapshots_insert_policy ON stage_result_snapshots;
CREATE POLICY stage_result_snapshots_insert_policy ON stage_result_snapshots FOR INSERT
WITH CHECK (
    COALESCE(current_setting('mtq.rpc_stage_finalize_active', true), 'false') = 'true'
    AND is_tenant_admin(tenant_id)
);

-- 5. RPC PENGESAHAN BABAK OTORITATIF SERVER & MANAJEMEN PROFIL ANGGOTA TENANT
CREATE OR REPLACE FUNCTION advance_stage_qualifiers(
    p_stage_id UUID,
    p_next_stage_id UUID,
    p_qualified_participant_ids UUID[],
    p_override_reasons JSONB DEFAULT '{}'::jsonb,
    p_rankings_snapshot JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor RECORD;
    v_stage RECORD;
    v_next_stage RECORD;
    v_rule RECORD;
    v_pid UUID;
    v_override_key TEXT;
    v_override_val TEXT;
    v_participation_count INT;
    v_qualified_count INT;
    v_assigned_judges_count INT;
    v_unassigned_maqra_count INT;
    v_incomplete_count INT;
    v_invalid_participant_count INT;
    v_unjustified_override_count INT;
    v_authoritative_snapshot JSONB;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    SELECT * INTO v_stage FROM stages WHERE id = p_stage_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Babak ini sudah pernah difinalisasi sebelumnya.';
    END IF;

    IF NOT is_tenant_admin(v_stage.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki wewenang administrator pada tenant ini.';
    END IF;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    SELECT COUNT(*) INTO v_participation_count
    FROM stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    IF v_participation_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Tidak ada peserta terdaftar pada babak ini.';
    END IF;

    v_qualified_count := COALESCE(array_length(p_qualified_participant_ids, 1), 0);
    IF v_stage.qualification_quota <= 0 THEN
        RAISE EXCEPTION 'Kuota kelulusan pada babak ini tidak valid.';
    END IF;
    IF v_qualified_count > v_stage.qualification_quota THEN
        RAISE EXCEPTION 'Jumlah peserta yang diloloskan (%) melebihi kuota babak (%).', v_qualified_count, v_stage.qualification_quota;
    END IF;

    IF p_override_reasons IS NOT NULL AND jsonb_typeof(p_override_reasons) = 'object' THEN
        FOR v_override_key, v_override_val IN
            SELECT key, value #>> '{}' FROM jsonb_each(p_override_reasons)
        LOOP
            IF v_override_val IS NULL OR LENGTH(TRIM(v_override_val)) < 5 THEN
                RAISE EXCEPTION 'Pengesahan babak ditolak: Alasan override manual untuk peserta % wajib diisi minimal 5 karakter.', v_override_key;
            END IF;
        END LOOP;
    END IF;

    SELECT COUNT(DISTINCT ja.judge_profile_id) INTO v_assigned_judges_count
    FROM judge_assignments ja
    WHERE ja.tenant_id = v_stage.tenant_id
      AND ja.stage_id = p_stage_id
      AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
      AND ja.status = 'Aktif';

    IF v_assigned_judges_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Belum ada penugasan majelis hakim resmi (judge_assignments) pada babak ini.';
    END IF;

    IF v_qualified_count > 0 THEN
        SELECT COUNT(*) INTO v_invalid_participant_count
        FROM unnest(p_qualified_participant_ids) AS q_pid
        LEFT JOIN stage_participations sp
               ON sp.participant_id = q_pid
              AND sp.stage_id = p_stage_id
              AND sp.tenant_id = v_stage.tenant_id
        LEFT JOIN participants p
               ON p.id = q_pid
              AND p.tenant_id = v_stage.tenant_id
        WHERE sp.id IS NULL
           OR (v_stage.branch_id IS NOT NULL AND p.branch_id <> v_stage.branch_id);

        IF v_invalid_participant_count > 0 THEN
            RAISE EXCEPTION 'Pengesahan babak ditolak: Terdapat peserta lolos yang tidak terdaftar pada babak atau cabang lomba ini.';
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_unassigned_maqra_count
    FROM stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id
      AND NOT EXISTS (
          SELECT 1 FROM assigned_maqras am
          WHERE am.stage_participation_id = sp.id
            AND am.tenant_id = v_stage.tenant_id
      );

    IF v_unassigned_maqra_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Masih terdapat % peserta yang belum memiliki penetapan maqra pada babak ini.', v_unassigned_maqra_count;
    END IF;

    SELECT COUNT(*) INTO v_incomplete_count
    FROM stage_participations sp
    JOIN assigned_maqras am
      ON am.stage_participation_id = sp.id
     AND am.tenant_id = sp.tenant_id
    CROSS JOIN (
        SELECT DISTINCT ja.judge_profile_id
        FROM judge_assignments ja
        WHERE ja.tenant_id = v_stage.tenant_id
          AND ja.stage_id = p_stage_id
          AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
          AND ja.status = 'Aktif'
    ) req_judges
    LEFT JOIN judge_assessments jass
           ON jass.stage_participation_id = sp.id
          AND jass.assigned_maqra_id = am.id
          AND jass.judge_profile_id = req_judges.judge_profile_id
          AND jass.status = 'finalized'
          AND jass.is_locked = true
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id
      AND jass.id IS NULL;

    IF v_incomplete_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Masih terdapat % lembar penilaian (peserta x maqra x hakim) yang belum difinalisasi.', v_incomplete_count;
    END IF;

    IF p_next_stage_id IS NOT NULL THEN
        SELECT * INTO v_next_stage FROM stages WHERE id = p_next_stage_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Babak lanjutan tidak ditemukan.';
        END IF;
        IF v_next_stage.tenant_id <> v_stage.tenant_id THEN
            RAISE EXCEPTION 'Ketidaksesuaian tenant: Babak lanjutan berada pada tenant berbeda.';
        END IF;
        IF v_stage.branch_id IS NOT NULL AND v_next_stage.branch_id IS NOT NULL AND v_next_stage.branch_id <> v_stage.branch_id THEN
            RAISE EXCEPTION 'Ketidaksesuaian cabang: Babak lanjutan berada pada cabang lomba berbeda.';
        END IF;
    END IF;

    PERFORM set_config('mtq.rpc_stage_finalize_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    WITH participant_scores AS (
        SELECT
            sp.id AS stage_participation_id,
            sp.participant_id,
            sp.lottery_number,
            ROUND(AVG(jass.final_score)::numeric, 2) AS computed_score,
            (
                SELECT (snap.elem ->> 'rank')::int
                FROM jsonb_array_elements(
                    CASE
                        WHEN p_rankings_snapshot IS NOT NULL AND jsonb_typeof(p_rankings_snapshot) = 'array'
                        THEN p_rankings_snapshot
                        ELSE '[]'::jsonb
                    END
                ) AS snap(elem)
                WHERE (snap.elem ->> 'participant_id') = sp.participant_id::text
                  AND (snap.elem ->> 'rank') ~ '^[0-9]+$'
                LIMIT 1
            ) AS client_tie_break_rank
        FROM stage_participations sp
        JOIN judge_assessments jass
          ON jass.stage_participation_id = sp.id
         AND jass.tenant_id = sp.tenant_id
         AND jass.status = 'finalized'
         AND jass.is_locked = true
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = v_stage.tenant_id
        GROUP BY sp.id, sp.participant_id, sp.lottery_number
    ),
    ranked_scores AS (
        SELECT
            ps.stage_participation_id,
            ps.participant_id,
            ps.computed_score,
            ROW_NUMBER() OVER (
                ORDER BY
                    ps.computed_score DESC,
                    COALESCE(ps.client_tie_break_rank, 999999) ASC,
                    ps.lottery_number ASC NULLS LAST,
                    ps.participant_id ASC
            )::int AS authoritative_rank
        FROM participant_scores ps
    )
    UPDATE stage_participations sp
    SET final_score = rs.computed_score,
        rank = rs.authoritative_rank
    FROM ranked_scores rs
    WHERE sp.id = rs.stage_participation_id;

    SELECT COUNT(*) INTO v_unjustified_override_count
    FROM stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id
      AND sp.participant_id = ANY(p_qualified_participant_ids)
      AND sp.rank > v_stage.qualification_quota
      AND LENGTH(TRIM(COALESCE(p_override_reasons ->> sp.participant_id::text, ''))) < 5;

    IF v_unjustified_override_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Peserta yang diloloskan di luar kuota peringkat wajib disertai alasan override atau tie-break minimal 5 karakter.';
    END IF;

    UPDATE stage_participations sp
    SET is_qualified = (sp.participant_id = ANY(p_qualified_participant_ids)),
        status = 'Lengkap',
        qualification_reason = COALESCE(
            NULLIF(TRIM(p_override_reasons ->> sp.participant_id::text), ''),
            CASE WHEN sp.participant_id = ANY(p_qualified_participant_ids) THEN 'Lolos Kuota Peringkat' ELSE 'Tidak Masuk Kuota' END
        ),
        finalized_at = v_now,
        updated_at = v_now
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    UPDATE participants p
    SET status = CASE
        WHEN p.id = ANY(p_qualified_participant_ids) THEN
            CASE WHEN p_next_stage_id IS NOT NULL THEN 'Menunggu' ELSE 'Final' END
        ELSE 'Final'
    END,
    updated_at = v_now
    FROM stage_participations sp
    WHERE sp.participant_id = p.id
      AND sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    UPDATE stages
    SET is_finalized = true,
        status = 'Selesai',
        finalized_at = v_now,
        finalized_by = v_actor_id
    WHERE id = p_stage_id;

    IF p_next_stage_id IS NOT NULL THEN
        UPDATE stages
        SET status = 'Aktif'
        WHERE id = p_next_stage_id
          AND status = 'Menunggu';
    END IF;

    IF p_next_stage_id IS NOT NULL AND v_qualified_count > 0 THEN
        FOREACH v_pid IN ARRAY p_qualified_participant_ids
        LOOP
            INSERT INTO stage_participations (
                tenant_id,
                participant_id,
                stage_id,
                lottery_number,
                status
            )
            SELECT
                v_stage.tenant_id,
                v_pid,
                p_next_stage_id,
                p.lottery_number,
                'Maqra Belum Ditetapkan'
            FROM participants p
            WHERE p.id = v_pid AND p.tenant_id = v_stage.tenant_id
            ON CONFLICT (tenant_id, stage_id, participant_id) DO NOTHING;
        END LOOP;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'participant_id', sp.participant_id,
                'participant_name', p.name,
                'lottery_number', sp.lottery_number,
                'final_score', sp.final_score,
                'rank', sp.rank,
                'is_qualified', sp.is_qualified,
                'qualification_reason', sp.qualification_reason
            )
            ORDER BY sp.rank ASC
        ),
        '[]'::jsonb
    ) INTO v_authoritative_snapshot
    FROM stage_participations sp
    JOIN participants p ON p.id = sp.participant_id
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    SELECT * INTO v_rule
    FROM competition_rule_configs crc
    WHERE crc.tenant_id = v_stage.tenant_id
      AND (v_stage.branch_id IS NULL OR crc.branch_id = v_stage.branch_id)
    LIMIT 1;

    IF v_stage.branch_id IS NOT NULL THEN
        INSERT INTO stage_result_snapshots (
            tenant_id,
            stage_id,
            branch_id,
            quota,
            rubric_version_id,
            tie_break_rule_used,
            finalized_by,
            rankings_snapshot
        )
        VALUES (
            v_stage.tenant_id,
            p_stage_id,
            v_stage.branch_id,
            v_stage.qualification_quota,
            v_rule.rubric_version_id,
            COALESCE(array_to_string(v_rule.tie_break_order, ' > '), 'total > Tajwid > Lagu > Fashahah'),
            v_actor_id,
            v_authoritative_snapshot
        );
    END IF;

    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_stage.tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'STAGE_FINALIZED',
        'Babak: ' || v_stage.name,
        CASE
            WHEN p_next_stage_id IS NOT NULL THEN
                'Pengesahan resmi babak ' || v_stage.name || ' dengan ' || v_qualified_count::text || ' peserta lolos ke babak lanjutan.'
            ELSE
                'Pengesahan resmi hasil kejuaraan babak final ' || v_stage.name || ' dengan ' || v_qualified_count::text || ' juara ditetapkan.'
        END,
        p_override_reasons::text,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE
            WHEN p_next_stage_id IS NOT NULL THEN
                'Babak berhasil difinalisasi dan peserta lolos telah didaftarkan ke babak berikutnya.'
            ELSE
                'Hasil kejuaraan babak final berhasil disahkan dan dikunci secara permanen di database.'
        END,
        'rankings_snapshot', v_authoritative_snapshot
    );
END;
$$;

CREATE OR REPLACE FUNCTION upsert_tenant_member_profile(
    p_tenant_id UUID,
    p_profile_id UUID,
    p_username TEXT,
    p_name TEXT,
    p_email TEXT,
    p_role TEXT,
    p_judge_category TEXT DEFAULT NULL,
    p_judge_field TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'Aktif'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor RECORD;
    v_target_id UUID;
    v_clean_role TEXT;
    v_clean_status TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    IF NOT is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang dapat mengelola keanggotaan pengguna.';
    END IF;

    v_clean_role := LOWER(TRIM(COALESCE(p_role, 'judge')));
    IF v_clean_role NOT IN ('judge', 'admin', 'superadmin') THEN
        RAISE EXCEPTION 'Peran pengguna tidak valid: %', v_clean_role;
    END IF;

    IF v_clean_role = 'superadmin' AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Superadmin yang dapat menetapkan peran superadmin.';
    END IF;

    v_clean_status := CASE WHEN p_status = 'Nonaktif' THEN 'Nonaktif' ELSE 'Aktif' END;

    SELECT p.id INTO v_target_id
    FROM profiles p
    WHERE (p_profile_id IS NOT NULL AND p.id = p_profile_id)
       OR (NULLIF(TRIM(p_email), '') IS NOT NULL AND LOWER(p.email) = LOWER(TRIM(p_email)))
       OR (NULLIF(TRIM(p_username), '') IS NOT NULL AND LOWER(p.username) = LOWER(TRIM(p_username)))
    LIMIT 1;

    IF v_target_id IS NULL AND NULLIF(TRIM(p_email), '') IS NOT NULL THEN
        SELECT u.id INTO v_target_id
        FROM auth.users u
        WHERE LOWER(u.email) = LOWER(TRIM(p_email))
        LIMIT 1;
    END IF;

    IF v_target_id IS NULL AND p_profile_id IS NOT NULL THEN
        SELECT u.id INTO v_target_id
        FROM auth.users u
        WHERE u.id = p_profile_id
        LIMIT 1;
    END IF;

    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'Pengguna belum terdaftar di Supabase Auth (auth.users). Daftarkan akun email pengguna terlebih dahulu melalui autentikasi sebelum memetakan keanggotaan tenant.';
    END IF;

    PERFORM set_config('mtq.rpc_role_admin_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    INSERT INTO profiles (id, username, name, email, role, updated_at)
    VALUES (
        v_target_id,
        COALESCE(NULLIF(TRIM(p_username), ''), 'user_' || SUBSTRING(v_target_id::text FROM 1 FOR 8)),
        COALESCE(NULLIF(TRIM(p_name), ''), 'Pengguna MTQ'),
        NULLIF(TRIM(p_email), ''),
        CASE WHEN is_superadmin() AND v_clean_role = 'superadmin' THEN 'superadmin'
             WHEN v_clean_role = 'admin' THEN 'admin'
             ELSE 'judge'
        END,
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET username = COALESCE(NULLIF(TRIM(EXCLUDED.username), ''), profiles.username),
        name = COALESCE(NULLIF(TRIM(EXCLUDED.name), ''), profiles.name),
        email = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''), profiles.email),
        role = CASE
            WHEN profiles.role = 'superadmin' AND NOT is_superadmin() THEN 'superadmin'
            ELSE EXCLUDED.role
        END,
        updated_at = now();

    INSERT INTO tenant_memberships (
        tenant_id,
        profile_id,
        role,
        judge_category,
        judge_field,
        status
    )
    VALUES (
        p_tenant_id,
        v_target_id,
        v_clean_role,
        NULLIF(TRIM(p_judge_category), ''),
        NULLIF(TRIM(p_judge_field), ''),
        v_clean_status
    )
    ON CONFLICT (tenant_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role,
        judge_category = EXCLUDED.judge_category,
        judge_field = EXCLUDED.judge_field,
        status = EXCLUDED.status;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (
        p_tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'USER_MEMBERSHIP_UPSERTED',
        'Profile ID: ' || v_target_id::text,
        'Pemetaan profil & keanggotaan ' || COALESCE(p_name, '') || ' dengan peran ' || v_clean_role || ' (' || v_clean_status || ')',
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', v_target_id,
        'role', v_clean_role,
        'status', v_clean_status
    );
END;
$$;

-- 6. PERIZINAN EKSEKUSI FUNGSI SECARA EKSPLISIT (LEAST PRIVILEGE)
REVOKE EXECUTE ON FUNCTION is_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_superadmin() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_my_profile_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_profile_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION get_user_tenants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_user_tenants() TO authenticated;

REVOKE EXECUTE ON FUNCTION is_tenant_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_tenant_admin(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION is_assigned_judge(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_assigned_judge(UUID, UUID, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION finalize_judge_assessment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finalize_judge_assessment(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION append_admin_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION append_admin_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION upsert_tenant_member_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION upsert_tenant_member_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
