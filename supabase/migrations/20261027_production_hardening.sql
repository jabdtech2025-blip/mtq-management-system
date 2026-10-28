-- ==============================================================================
-- MIGRATION: 20261027_production_hardening.sql
-- Description: Production hardening & schema alignment for MTQ Management System
-- Schema Alignment: Matches core tables in supabase/schema.sql 100%
--   - competition_rule_configs
--   - judge_assessments
--   - stage_result_snapshots
--   - assigned_maqras
--   - rubric_fields
-- ==============================================================================

-- 1. STATUS LIFECYCLE & COLUMN ALIGNMENT
ALTER TABLE rubric_versions DROP CONSTRAINT IF EXISTS rubric_versions_status_check;
ALTER TABLE rubric_versions ADD CONSTRAINT rubric_versions_status_check
    CHECK (status IN ('Draft', 'Validasi', 'Aktif', 'Arsip'));

ALTER TABLE competition_rule_configs DROP CONSTRAINT IF EXISTS competition_rule_configs_status_check;
ALTER TABLE competition_rule_configs ADD CONSTRAINT competition_rule_configs_status_check
    CHECK (status IN ('Draft', 'Validasi', 'Aktif', 'Arsip'));

ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_status_check;
ALTER TABLE stages ADD CONSTRAINT stages_status_check
    CHECK (status IN ('Menunggu', 'Aktif', 'Berlangsung', 'Selesai'));

ALTER TABLE judge_assessments DROP CONSTRAINT IF EXISTS judge_assessments_status_check;
ALTER TABLE judge_assessments ADD CONSTRAINT judge_assessments_status_check
    CHECK (status IN ('not_started', 'in_progress', 'finalized'));

ALTER TABLE rubric_fields ADD COLUMN IF NOT EXISTS max_deduction NUMERIC(5,2);
ALTER TABLE rubric_fields ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Aktif';
ALTER TABLE rubric_fields DROP CONSTRAINT IF EXISTS rubric_fields_status_check;
ALTER TABLE rubric_fields ADD CONSTRAINT rubric_fields_status_check
    CHECK (status IN ('Aktif', 'Nonaktif', 'Arsip'));

ALTER TABLE error_categories ADD COLUMN IF NOT EXISTS max_deduction NUMERIC(5,2);

-- 2. ENABLE ROW LEVEL SECURITY (RLS) ACROSS ALL CORE TABLES
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE kafilahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_maqras ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_rule_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_result_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. SECURITY HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION get_user_tenants()
RETURNS TABLE (tenant_id UUID) 
LANGUAGE sql 
STABLE 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
    SELECT tm.tenant_id FROM tenant_memberships tm
    WHERE tm.profile_id = auth.uid() AND tm.status = 'Aktif';
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
    ) OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role = 'superadmin'
    );
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
    SELECT EXISTS (
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
    );
$$;

-- 4. LEAST-PRIVILEGE RLS POLICIES ENFORCEMENT
-- Tenants
DROP POLICY IF EXISTS "Users can view assigned tenants" ON tenants;
CREATE POLICY "Users can view assigned tenants" ON tenants FOR SELECT
USING (id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "Superadmins and tenant admins can update tenant" ON tenants;
CREATE POLICY "Superadmins and tenant admins can update tenant" ON tenants FOR UPDATE
USING (is_tenant_admin(id))
WITH CHECK (is_tenant_admin(id));

-- Profiles (Prevent self role-escalation)
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON profiles;
CREATE POLICY "Users can view profiles in same tenant" ON profiles FOR SELECT
USING (
    id = auth.uid() OR 
    id IN (
        SELECT tm.profile_id FROM tenant_memberships tm 
        WHERE tm.tenant_id IN (SELECT get_user_tenants())
    )
);

DROP POLICY IF EXISTS "Users can update own profile without escalating role" ON profiles;
CREATE POLICY "Users can update own profile without escalating role" ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
);

-- Tenant Memberships
DROP POLICY IF EXISTS "Users can view memberships of their tenants" ON tenant_memberships;
CREATE POLICY "Users can view memberships of their tenants" ON tenant_memberships FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "Tenant admins can manage tenant memberships" ON tenant_memberships;
CREATE POLICY "Tenant admins can manage tenant memberships" ON tenant_memberships FOR ALL
USING (is_tenant_admin(tenant_id))
WITH CHECK (is_tenant_admin(tenant_id));

-- Generic Tenant Scoped Tables (Select for members, All for admins)
DO $$
DECLARE
    t TEXT;
    tenant_tables TEXT[] := ARRAY[
        'branches', 'levels', 'kafilahs', 'participants', 'questions',
        'assigned_maqras', 'rubric_versions', 'error_categories',
        'competition_rule_configs', 'stages', 'stage_participations', 'judge_assignments'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select_policy ON %I', t, t);
        EXECUTE format('CREATE POLICY %I_select_policy ON %I FOR SELECT USING (tenant_id IN (SELECT get_user_tenants()) OR tenant_id = %L::uuid)', t, t, '00000000-0000-0000-0000-000000000000');

        EXECUTE format('DROP POLICY IF EXISTS %I_admin_policy ON %I', t, t);
        EXECUTE format('CREATE POLICY %I_admin_policy ON %I FOR ALL USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id))', t, t);
    END LOOP;
END;
$$;

-- Rubric Fields (Joined via rubric_versions)
DROP POLICY IF EXISTS "Tenant members can view rubric fields" ON rubric_fields;
CREATE POLICY "Tenant members can view rubric fields" ON rubric_fields FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM rubric_versions rv
        WHERE rv.id = rubric_fields.rubric_version_id
          AND (rv.tenant_id IN (SELECT get_user_tenants()) OR rv.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
    )
);

DROP POLICY IF EXISTS "Tenant admins can manage rubric fields" ON rubric_fields;
CREATE POLICY "Tenant admins can manage rubric fields" ON rubric_fields FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM rubric_versions rv
        WHERE rv.id = rubric_fields.rubric_version_id
          AND is_tenant_admin(rv.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM rubric_versions rv
        WHERE rv.id = rubric_fields.rubric_version_id
          AND is_tenant_admin(rv.tenant_id)
    )
);

-- Judge Assessments Policies (Least Privilege: Assigned Judges Only, Unlocked Only)
DROP POLICY IF EXISTS "Tenant members can view judge_assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Admins and assigned judges can view judge_assessments" ON judge_assessments;
CREATE POLICY "Admins and assigned judges can view judge_assessments" ON judge_assessments FOR SELECT
USING (
    is_tenant_admin(tenant_id)
    OR (
        judge_profile_id = auth.uid()
        AND tenant_id IN (SELECT get_user_tenants())
        AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "Assigned judges can insert unlocked judge_assessments" ON judge_assessments;
CREATE POLICY "Assigned judges can insert unlocked judge_assessments" ON judge_assessments FOR INSERT
WITH CHECK (
    judge_profile_id = auth.uid()
    AND is_locked = false
    AND tenant_id IN (SELECT get_user_tenants())
    AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
);

DROP POLICY IF EXISTS "Judges can update assigned unlocked judge_assessments" ON judge_assessments;
CREATE POLICY "Judges can update assigned unlocked judge_assessments" ON judge_assessments FOR UPDATE
USING (
    judge_profile_id = auth.uid() 
    AND is_locked = false 
    AND tenant_id IN (SELECT get_user_tenants())
    AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
)
WITH CHECK (
    judge_profile_id = auth.uid()
    AND tenant_id IN (SELECT get_user_tenants())
    AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
);

DROP POLICY IF EXISTS "Admins can manage judge_assessments" ON judge_assessments;
CREATE POLICY "Admins can manage judge_assessments" ON judge_assessments FOR ALL
USING (is_tenant_admin(tenant_id))
WITH CHECK (is_tenant_admin(tenant_id));

-- Stage Result Snapshots Policies (Append-Only Immutable)
DROP POLICY IF EXISTS "Tenant members can view stage_result_snapshots" ON stage_result_snapshots;
CREATE POLICY "Tenant members can view stage_result_snapshots" ON stage_result_snapshots FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "Admins can insert stage_result_snapshots" ON stage_result_snapshots;
CREATE POLICY "Admins can insert stage_result_snapshots" ON stage_result_snapshots FOR INSERT
WITH CHECK (is_tenant_admin(tenant_id));

-- Audit Logs Policies (Append-Only Immutable)
DROP POLICY IF EXISTS "Tenant members can view audit_logs" ON audit_logs;
CREATE POLICY "Tenant members can view audit_logs" ON audit_logs FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "System and admins can append audit_logs" ON audit_logs;
CREATE POLICY "System and admins can append audit_logs" ON audit_logs FOR INSERT
WITH CHECK (tenant_id IN (SELECT get_user_tenants()));

-- 5. HARDENED ATOMIC RPC: REOPEN ASSESSMENT
CREATE OR REPLACE FUNCTION reopen_judge_assessment(
    p_assessment_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor RECORD;
    v_assessment RECORD;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Permintaan tidak memiliki sesi autentikasi.';
    END IF;

    IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Alasan pembukaan kembali lembar nilai wajib diisi minimal 5 karakter untuk rekaman audit trail.';
    END IF;

    SELECT * INTO v_assessment FROM judge_assessments WHERE id = p_assessment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lembar penilaian dengan ID tersebut tidak ditemukan.';
    END IF;

    IF v_assessment.status <> 'finalized' THEN
        RAISE EXCEPTION 'Lembar penilaian belum berstatus final.';
    END IF;

    IF NOT is_tenant_admin(v_assessment.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator atau Superadmin yang berwenang membuka kembali penilaian final.';
    END IF;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    -- Update status back to in_progress and release lock
    UPDATE judge_assessments
    SET status = 'in_progress',
        is_locked = false,
        reopened_at = now(),
        reopened_by = v_actor_id,
        reopen_reason = p_reason,
        updated_at = now()
    WHERE id = p_assessment_id;

    -- Revert stage participation status if complete
    UPDATE stage_participations
    SET status = 'Berlangsung',
        updated_at = now()
    WHERE id = v_assessment.stage_participation_id
      AND status = 'Lengkap';

    -- Insert permanent audit log
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_assessment.tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'ASSESSMENT_REOPENED',
        'Assessment ID: ' || p_assessment_id::text,
        'Pembukaan kembali lembar penilaian final dengan skor sebelum koreksi: ' || v_assessment.final_score::text,
        p_reason,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lembar penilaian berhasil dibuka kembali. Dewan hakim dapat mengoreksi nilai.'
    );
END;
$$;

-- 6. HARDENED ATOMIC RPC: ADVANCE STAGE QUALIFIERS
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
    v_qualified_count INT;
    v_assigned_judges_count INT;
    v_incomplete_count INT;
    v_invalid_participant_count INT;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Validasi sesi autentikasi
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Permintaan tidak memiliki sesi autentikasi.';
    END IF;

    -- 2. Validasi babak asal ada dan belum difinalisasi
    SELECT * INTO v_stage FROM stages WHERE id = p_stage_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Babak ini sudah pernah difinalisasi sebelumnya.';
    END IF;

    -- 3. Validasi hak akses admin pada tenant terkait
    IF NOT is_tenant_admin(v_stage.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki wewenang administrator pada tenant ini.';
    END IF;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    -- 4. Validasi kuota kelulusan
    v_qualified_count := COALESCE(array_length(p_qualified_participant_ids, 1), 0);
    IF v_stage.qualification_quota <= 0 THEN
        RAISE EXCEPTION 'Kuota kelulusan pada babak ini tidak valid.';
    END IF;
    IF v_qualified_count > v_stage.qualification_quota THEN
        RAISE EXCEPTION 'Jumlah peserta yang diloloskan (%) melebihi kuota babak (%).', v_qualified_count, v_stage.qualification_quota;
    END IF;

    -- 5. Validasi bahwa penugasan majelis hakim resmi tersedia untuk babak & cabang ini
    SELECT COUNT(DISTINCT ja.judge_profile_id) INTO v_assigned_judges_count
    FROM judge_assignments ja
    WHERE ja.tenant_id = v_stage.tenant_id
      AND ja.stage_id = p_stage_id
      AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
      AND ja.status = 'Aktif';

    IF v_assigned_judges_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Belum ada penugasan majelis hakim resmi (judge_assignments) pada babak ini.';
    END IF;

    -- 6. Validasi seluruh peserta yang diloloskan berasal dari babak & cabang yang benar
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

    -- 7. Validasi seluruh peserta pada babak ini telah dinilai final oleh seluruh hakim yang ditugaskan
    SELECT COUNT(*) INTO v_incomplete_count
    FROM stage_participations sp
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
          AND jass.judge_profile_id = req_judges.judge_profile_id
          AND jass.status = 'finalized'
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id
      AND jass.id IS NULL;

    IF v_incomplete_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Masih terdapat % lembar penilaian hakim yang belum berstatus final.', v_incomplete_count;
    END IF;

    -- 8. Validasi babak lanjutan jika ada (harus dalam tenant dan cabang yang sama)
    IF p_next_stage_id IS NOT NULL THEN
        SELECT * INTO v_next_stage FROM stages WHERE id = p_next_stage_id;
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

    -- 9. Perbarui status kelulusan pada stage_participations babak asal
    UPDATE stage_participations sp
    SET is_qualified = (sp.participant_id = ANY(p_qualified_participant_ids)),
        qualification_reason = COALESCE(
            p_override_reasons ->> sp.participant_id::text,
            CASE WHEN sp.participant_id = ANY(p_qualified_participant_ids) THEN 'Lolos Kuota Peringkat' ELSE 'Tidak Masuk Kuota' END
        ),
        finalized_at = v_now,
        updated_at = v_now
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    -- 10. Perbarui status participants sesuai hasil babak
    UPDATE participants p
    SET status = CASE
        WHEN p.id = ANY(p_qualified_participant_ids) THEN
            CASE WHEN p_next_stage_id IS NOT NULL THEN 'Lolos' ELSE 'Final' END
        ELSE 'Gugur'
    END,
    updated_at = v_now
    FROM stage_participations sp
    WHERE sp.participant_id = p.id
      AND sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    -- 11. Finalize current stage
    UPDATE stages
    SET is_finalized = true,
        status = 'Selesai',
        finalized_at = v_now,
        finalized_by = v_actor_id
    WHERE id = p_stage_id;

    -- 12. Register qualified participants into next stage if present
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

    -- 13. Insert permanent snapshot into stage_result_snapshots
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
            COALESCE(p_rankings_snapshot, '[]'::jsonb)
        );
    END IF;

    -- 14. Insert permanent audit log
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_stage.tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'STAGE_FINALIZED',
        'Babak: ' || v_stage.name,
        'Pengesahan resmi babak ' || v_stage.name || ' dengan ' || v_qualified_count::text || ' peserta lolos.',
        p_override_reasons::text,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Babak berhasil difinalisasi dan peserta lolos telah didaftarkan ke babak berikutnya.'
    );
END;
$$;

-- 7. EXPLICIT RPC EXECUTION PERMISSIONS
REVOKE EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) TO authenticated;
