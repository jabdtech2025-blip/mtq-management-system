-- ==============================================================================
-- MTQ MANAGEMENT SYSTEM — CORE DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Versi: 2026.1 (Arsitektur Multi-Tenant, RLS, & Atomic RPC)
-- Standar Regulasi: LPTQ Nasional / Buku Pedoman MTQ 2025
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TENANTS & COMPETITIONS
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    region VARCHAR(100) NOT NULL,
    edition VARCHAR(100),
    period VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. PROFILES & TENANT MEMBERSHIPS (Supabase Auth Integration)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    role VARCHAR(30) NOT NULL DEFAULT 'judge' CHECK (role IN ('superadmin', 'admin', 'judge')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'judge' CHECK (role IN ('admin', 'judge', 'superadmin')),
    judge_category VARCHAR(100),
    judge_field VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, profile_id)
);

-- 4. MASTER DATA: CABANG, GOLONGAN, & JENJANG
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

-- 5. KAFILAHS & PARTICIPANTS
CREATE TABLE IF NOT EXISTS kafilahs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    region VARCHAR(150) NOT NULL,
    contact_person VARCHAR(150),
    contact_phone VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    participant_code VARCHAR(50) NOT NULL, -- e.g. "TLW-004"
    lottery_number VARCHAR(20) NOT NULL,   -- e.g. "04"
    name VARCHAR(255) NOT NULL,
    gender VARCHAR(10) NOT NULL CHECK (gender IN ('Putra', 'Putri')),
    kafilah_id UUID NOT NULL REFERENCES kafilahs(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    level_id UUID REFERENCES levels(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Berlangsung', 'Lolos', 'Gugur', 'Final')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, participant_code),
    UNIQUE (tenant_id, branch_id, lottery_number)
);

-- 6. COMPETITION STAGES & PARTICIPATIONS
CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    stage_order INT NOT NULL DEFAULT 1,
    qualification_quota INT NOT NULL DEFAULT 3,
    qualification_method VARCHAR(30) NOT NULL DEFAULT 'top_n' CHECK (qualification_method IN ('top_n', 'manual')),
    status VARCHAR(30) NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Aktif', 'Selesai')),
    is_finalized BOOLEAN NOT NULL DEFAULT false,
    finalized_at TIMESTAMPTZ,
    finalized_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, branch_id, name)
);

CREATE TABLE IF NOT EXISTS stage_participations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE RESTRICT,
    lottery_number VARCHAR(20) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'Maqra Belum Ditetapkan' 
        CHECK (status IN ('Maqra Belum Ditetapkan', 'Belum Dimulai', 'Berlangsung', 'Menunggu Hakim Lain', 'Lengkap')),
    provisional_score NUMERIC(5,2),
    final_score NUMERIC(5,2),
    rank INT,
    is_qualified BOOLEAN NOT NULL DEFAULT false,
    qualification_reason TEXT,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, stage_id, participant_id)
);

-- 7. QUESTIONS / MAQRAS & ASSIGNMENTS
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    surah_name VARCHAR(100) NOT NULL,
    surah_number INT NOT NULL,
    start_ayah INT NOT NULL,
    end_ayah INT NOT NULL,
    page_number INT NOT NULL,
    page_start INT NOT NULL,
    page_end INT NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES stages(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS assigned_maqras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_participation_id UUID NOT NULL REFERENCES stage_participations(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE RESTRICT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES profiles(id),
    method VARCHAR(30) NOT NULL DEFAULT 'undian' CHECK (method IN ('undian', 'manual', 'jadwal')),
    UNIQUE (stage_participation_id, question_id)
);

-- 8. RUBRIC ARCHITECTURE & COMPETITION RULES
CREATE TABLE IF NOT EXISTS rubric_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    official_source TEXT,
    starting_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Arsip')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code, version)
);

CREATE TABLE IF NOT EXISTS rubric_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    max_score NUMERIC(5,2) NOT NULL,
    min_score NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    field_order INT NOT NULL DEFAULT 1,
    description TEXT,
    UNIQUE (rubric_version_id, code)
);

CREATE TABLE IF NOT EXISTS error_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rubric_field_id UUID REFERENCES rubric_fields(id) ON DELETE SET NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    scope VARCHAR(150),
    default_deduction NUMERIC(4,2) NOT NULL DEFAULT 0.50,
    method_type VARCHAR(40) NOT NULL DEFAULT 'Pengurangan tetap',
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    sort_order INT NOT NULL DEFAULT 1,
    UNIQUE (tenant_id, code)
);

-- 9. JUDGE ASSIGNMENTS & ASSESSMENTS
CREATE TABLE IF NOT EXISTS judge_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    rubric_field_id UUID REFERENCES rubric_fields(id) ON DELETE CASCADE,
    judge_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, stage_id, judge_profile_id, rubric_field_id)
);

CREATE TABLE IF NOT EXISTS judge_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_participation_id UUID NOT NULL REFERENCES stage_participations(id) ON DELETE CASCADE,
    assigned_maqra_id UUID NOT NULL REFERENCES assigned_maqras(id) ON DELETE RESTRICT,
    judge_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'finalized')),
    total_deductions NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    final_score NUMERIC(5,2) NOT NULL DEFAULT 100.00 CHECK (final_score >= 0 AND final_score <= 100),
    field_scores JSONB DEFAULT '{}'::jsonb,
    error_counts JSONB DEFAULT '{}'::jsonb,
    annotations JSONB DEFAULT '[]'::jsonb,
    is_locked BOOLEAN NOT NULL DEFAULT false,
    reopened_at TIMESTAMPTZ,
    reopened_by UUID REFERENCES profiles(id),
    reopen_reason TEXT,
    finalized_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (stage_participation_id, assigned_maqra_id, judge_profile_id)
);

-- 10. STAGE RESULT SNAPSHOTS (Permanent Audited Final Results)
CREATE TABLE IF NOT EXISTS stage_result_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE RESTRICT,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    quota INT NOT NULL,
    rubric_version_id UUID REFERENCES rubric_versions(id),
    tie_break_rule_used TEXT NOT NULL,
    finalized_by UUID NOT NULL REFERENCES profiles(id),
    rankings_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. AUDIT LOGS (Append-Only Immutable Table)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES profiles(id),
    actor_name VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,
    reason TEXT,
    outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('Success', 'Failed', 'Warning')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. INDEXES (Optimized for Querying and Joins)
CREATE INDEX IF NOT EXISTS idx_participants_tenant_branch ON participants (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_stage_participations_lookup ON stage_participations (tenant_id, stage_id, status);
CREATE INDEX IF NOT EXISTS idx_judge_assessments_lookup ON judge_assessments (tenant_id, stage_participation_id, judge_profile_id);
CREATE INDEX IF NOT EXISTS idx_assigned_maqras_lookup ON assigned_maqras (stage_participation_id, question_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs (tenant_id, created_at DESC);

-- 13. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_maqras ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_result_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policy Example: Tenant isolation helper
CREATE OR REPLACE FUNCTION get_user_tenants(user_id UUID)
RETURNS TABLE (tenant_id UUID) AS $$
BEGIN
    RETURN QUERY
    SELECT tm.tenant_id FROM tenant_memberships tm
    WHERE tm.profile_id = user_id AND tm.status = 'Aktif';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. STORED PROCEDURES / RPC FUNCTIONS
-- RPC 1: Buka Kembali Penilaian (Reopen Assessment with Audit Log)
CREATE OR REPLACE FUNCTION reopen_judge_assessment(
    p_assessment_id UUID,
    p_actor_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_assessment RECORD;
    v_actor RECORD;
BEGIN
    -- Validasi actor role
    SELECT * INTO v_actor FROM profiles WHERE id = p_actor_id;
    IF v_actor.role = 'judge' THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Dewan hakim tidak diizinkan membuka kembali penilaian yang sudah final.';
    END IF;

    IF LENGTH(TRIM(p_reason)) < 5 THEN
        RAISE EXCEPTION 'Alasan pembukaan kembali wajib diisi minimal 5 karakter.';
    END IF;

    SELECT * INTO v_assessment FROM judge_assessments WHERE id = p_assessment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Lembar penilaian tidak ditemukan.';
    END IF;

    -- Update assessment status back to in_progress
    UPDATE judge_assessments
    SET status = 'in_progress',
        is_locked = false,
        reopened_at = now(),
        reopened_by = p_actor_id,
        reopen_reason = p_reason,
        updated_at = now()
    WHERE id = p_assessment_id;

    -- Catat immutable audit log
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_assessment.tenant_id,
        p_actor_id,
        v_actor.name || ' (' || v_actor.role || ')',
        'ASSESSMENT_REOPENED',
        'Assessment ID: ' || p_assessment_id::text,
        'Pembukaan kembali lembar penilaian final dengan skor sebelum koreksi: ' || v_assessment.final_score::text,
        p_reason,
        'Success'
    );

    RETURN jsonb_build_object('success', true, 'message', 'Lembar penilaian berhasil dibuka kembali.');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
