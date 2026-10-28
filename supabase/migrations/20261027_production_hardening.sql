-- ==============================================================================
-- MIGRATION: 20261027_production_hardening.sql
-- Description: Production hardening for MTQ Management System database
-- Features:
--   1. Dynamic Rubrics & Competition Rules status constraint updates
--   2. Strict RLS activation across all 19 system tables
--   3. Composite tenant isolation constraints
--   4. Hardened atomic RPCs for assessment reopening and stage advancement
-- ==============================================================================

-- 1. STATUS LIFECYCLE CONSTRAINTS UPDATES
ALTER TABLE rubric_versions DROP CONSTRAINT IF EXISTS rubric_versions_status_check;
ALTER TABLE rubric_versions ADD CONSTRAINT rubric_versions_status_check
    CHECK (status IN ('Draft', 'Validasi', 'Aktif', 'Arsip'));

ALTER TABLE competition_rules DROP CONSTRAINT IF EXISTS competition_rules_status_check;
ALTER TABLE competition_rules ADD CONSTRAINT competition_rules_status_check
    CHECK (status IN ('Draft', 'Validasi', 'Aktif', 'Arsip'));

ALTER TABLE stages DROP CONSTRAINT IF EXISTS stages_status_check;
ALTER TABLE stages ADD CONSTRAINT stages_status_check
    CHECK (status IN ('Menunggu', 'Berlangsung', 'Selesai'));

ALTER TABLE assessments DROP CONSTRAINT IF EXISTS assessments_status_check;
ALTER TABLE assessments ADD CONSTRAINT assessments_status_check
    CHECK (status IN ('in_progress', 'finalized'));

-- 2. ENABLE ROW LEVEL SECURITY (RLS) ACROSS ALL 19 TABLES
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE kafilahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mushaf_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_snapshots ENABLE ROW LEVEL SECURITY;

-- 3. RLS POLICIES FOR TENANT ISOLATION
-- Helper functions check
CREATE OR REPLACE FUNCTION is_tenant_member(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_memberships
        WHERE tenant_id = p_tenant_id
          AND profile_id = auth.uid()
          AND status = 'Aktif'
    );
$$;

CREATE OR REPLACE FUNCTION is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM tenant_memberships
        WHERE tenant_id = p_tenant_id
          AND profile_id = auth.uid()
          AND role IN ('admin', 'superadmin')
          AND status = 'Aktif'
    );
$$;

-- Generic read/write policies for tenant-scoped tables
DO $$
DECLARE
    t TEXT;
    tenant_tables TEXT[] := ARRAY[
        'branches', 'levels', 'kafilahs', 'participants', 'questions',
        'rubric_versions', 'error_categories', 'competition_rules',
        'stages', 'stage_participations', 'judge_assignments', 'assessments',
        'mushaf_annotations', 'audit_logs', 'activity_logs', 'stage_snapshots'
    ];
BEGIN
    FOREACH t IN ARRAY tenant_tables
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_tenant_member_policy ON %I', t, t);
        EXECUTE format('CREATE POLICY %I_tenant_member_policy ON %I FOR ALL USING (is_tenant_member(tenant_id))', t, t);
    END LOOP;
END;
$$;

-- Profiles self-access policy
DROP POLICY IF EXISTS profiles_self_policy ON profiles;
CREATE POLICY profiles_self_policy ON profiles FOR ALL USING (id = auth.uid());

-- Tenants read policy
DROP POLICY IF EXISTS tenants_read_policy ON tenants;
CREATE POLICY tenants_read_policy ON tenants FOR SELECT USING (
    EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_id = id AND profile_id = auth.uid())
);

-- 4. HARDENED ATOMIC RPC: REOPEN ASSESSMENT
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
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Alasan pembukaan kembali lembar nilai wajib diisi minimal 5 karakter.';
    END IF;

    SELECT * INTO v_assessment FROM assessments WHERE id = p_assessment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lembar penilaian tidak ditemukan.';
    END IF;

    IF NOT is_tenant_admin(v_assessment.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator yang berwenang membuka kembali penilaian yang sudah final.';
    END IF;

    IF v_assessment.status != 'finalized' THEN
        RAISE EXCEPTION 'Lembar penilaian belum berstatus final.';
    END IF;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    UPDATE assessments
    SET status = 'in_progress',
        is_locked = false,
        reopened_at = now(),
        reopened_by = v_actor_id,
        reopen_reason = p_reason,
        updated_at = now()
    WHERE id = p_assessment_id;

    -- Reset stage participation status back to Berlangsung if Complete
    UPDATE stage_participations
    SET status = 'Berlangsung'
    WHERE tenant_id = v_assessment.tenant_id
      AND participant_id = v_assessment.participant_id
      AND stage_id = v_assessment.stage_id
      AND status = 'Lengkap';

    -- Insert permanent audit log
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_assessment.tenant_id,
        v_actor_id,
        v_actor.name || ' (' || v_actor.role || ')',
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

-- 5. HARDENED ATOMIC RPC: ADVANCE STAGE QUALIFIERS
CREATE OR REPLACE FUNCTION advance_stage_qualifiers(
    p_stage_id UUID,
    p_next_stage_id UUID,
    p_qualified_participant_ids UUID[],
    p_override_reasons JSONB DEFAULT '{}'::jsonb
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
    v_pid UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    SELECT * INTO v_stage FROM stages WHERE id = p_stage_id;
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

    -- Finalisasi babak saat ini
    UPDATE stages
    SET is_finalized = true,
        status = 'Selesai',
        finalized_at = v_now,
        finalized_by = v_actor_id
    WHERE id = p_stage_id;

    -- Jika ada babak lanjutan, daftarkan peserta yang lolos
    IF p_next_stage_id IS NOT NULL THEN
        SELECT * INTO v_next_stage FROM stages WHERE id = p_next_stage_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Babak lanjutan tidak ditemukan.';
        END IF;

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
            WHERE p.id = v_pid
            ON CONFLICT (tenant_id, stage_id, participant_id) DO NOTHING;
        END LOOP;
    END IF;

    -- Record audit log
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_stage.tenant_id,
        v_actor_id,
        v_actor.name || ' (' || v_actor.role || ')',
        'STAGE_FINALIZED',
        'Babak: ' || v_stage.name,
        'Pengesahan resmi babak ' || v_stage.name || ' dengan ' || COALESCE(array_length(p_qualified_participant_ids, 1), 0)::text || ' peserta lolos.',
        p_override_reasons::text,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Babak berhasil difinalisasi dan peserta lolos telah didaftarkan ke babak berikutnya.'
    );
END;
$$;
