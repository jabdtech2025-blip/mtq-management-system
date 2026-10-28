-- ==============================================================================
-- MTQ MANAGEMENT SYSTEM — FINAL PRODUCTION DATABASE SCHEMA (SUPABASE / POSTGRESQL)
-- Versi: 2026.3 (Multi-Tenant, Least-Privilege RLS, Immutable Triggers & Atomic RPCs)
-- Standar Regulasi: LPTQ Nasional / Buku Pedoman MTQ 2025 & Juknis 2026
-- Target: Database Supabase Kosong (Idempotent & Siap Dijalankan di SQL Editor)
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

-- Pastikan tenant sistem global (00000000-0000-0000-0000-000000000000) tersedia untuk template rubrik nasional
INSERT INTO tenants (id, code, name, event_name, region, edition, period, status)
VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'LPTQ-SYSTEM',
    'Standar Nasional LPTQ (Template Sistem)',
    'Pedoman Nasional MTQ 2025/2026',
    'Nasional',
    'Pedoman 2025',
    '2025 - 2026',
    'Aktif'
)
ON CONFLICT (id) DO NOTHING;

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

-- Trigger Sinkronisasi Otomatis auth.users -> public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_username TEXT;
    v_name TEXT;
BEGIN
    v_username := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), ''),
        SPLIT_PART(COALESCE(NEW.email, NEW.id::text), '@', 1) || '_' || SUBSTRING(NEW.id::text FROM 1 FOR 6)
    );
    v_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
        SPLIT_PART(COALESCE(NEW.email, 'Pengguna MTQ'), '@', 1)
    );

    -- Keamanan: Pendaftaran mandiri selalu mendapat role 'judge' secara default.
    -- Kenaikan role ke 'admin' atau 'superadmin' hanya dilakukan oleh administrator melalui manajemen profil/membership.
    INSERT INTO public.profiles (id, username, name, email, role)
    VALUES (NEW.id, v_username, v_name, NEW.email, 'judge')
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

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
    description TEXT,
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
    leader_name VARCHAR(150),
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
    status VARCHAR(30) NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Aktif', 'Berlangsung', 'Selesai')),
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
    branch_code VARCHAR(30),
    branch_name VARCHAR(150),
    version VARCHAR(20) NOT NULL,
    description TEXT,
    official_source TEXT,
    starting_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Draft', 'Validasi', 'Aktif', 'Arsip')),
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
    max_deduction NUMERIC(5,2),
    field_order INT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif', 'Arsip')),
    description TEXT,
    UNIQUE (rubric_version_id, code)
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_field_id UUID NOT NULL REFERENCES rubric_fields(id) ON DELETE CASCADE,
    code VARCHAR(40),
    name VARCHAR(150) NOT NULL,
    description TEXT,
    max_deduction NUMERIC(5,2),
    sort_order INT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS deduction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criterion_id UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    error_grade VARCHAR(30) DEFAULT 'Jali' CHECK (error_grade IN ('Jali', 'Khafi', 'Umum', 'Kecil', 'Sedang', 'Besar')),
    deduction_points NUMERIC(5,2) NOT NULL DEFAULT 0.50,
    max_deduction NUMERIC(5,2),
    method_type VARCHAR(40) NOT NULL DEFAULT 'Pengurangan tetap' CHECK (method_type IN ('Pengurangan tetap', 'Pengurangan berbobot'))
);

CREATE TABLE IF NOT EXISTS error_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rubric_field_id UUID REFERENCES rubric_fields(id) ON DELETE SET NULL,
    criterion_id UUID REFERENCES rubric_criteria(id) ON DELETE SET NULL,
    deduction_rule_id UUID REFERENCES deduction_rules(id) ON DELETE SET NULL,
    code VARCHAR(20) NOT NULL,
    name VARCHAR(150) NOT NULL,
    scope VARCHAR(150),
    default_deduction NUMERIC(4,2) NOT NULL DEFAULT 0.50,
    max_deduction NUMERIC(5,2),
    method_type VARCHAR(40) NOT NULL DEFAULT 'Pengurangan tetap',
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
    sort_order INT NOT NULL DEFAULT 1,
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS competition_rule_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    branch_name VARCHAR(150),
    rubric_version_id UUID NOT NULL REFERENCES rubric_versions(id) ON DELETE RESTRICT,
    tie_break_order TEXT[] NOT NULL DEFAULT ARRAY['total', 'Tajwid', 'Lagu', 'Fashahah'],
    quota_per_stage JSONB NOT NULL DEFAULT '{"Penyisihan": 3, "Final": 3}'::jsonb,
    official_source TEXT,
    is_verified_official BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Draft', 'Validasi', 'Aktif', 'Arsip')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, branch_id)
);

-- 9. JUDGE ASSIGNMENTS & ASSESSMENTS
CREATE TABLE IF NOT EXISTS judge_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
    rubric_field_id UUID REFERENCES rubric_fields(id) ON DELETE CASCADE,
    judge_field VARCHAR(150),
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
CREATE INDEX IF NOT EXISTS idx_competition_rules_lookup ON competition_rule_configs (tenant_id, branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_result_snapshots_unique_stage_branch ON stage_result_snapshots (tenant_id, stage_id, branch_id);

-- 13. DATA INTEGRITY & IMMUTABILITY TRIGGERS

-- 13A. Proteksi Imutabilitas Lembar Penilaian Final (Mencegah perubahan/penghapusan langsung di luar RPC reopen)
CREATE OR REPLACE FUNCTION public.enforce_judge_assessment_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'finalized' OR OLD.is_locked = true THEN
            RAISE EXCEPTION 'Pelanggaran Integritas: Lembar penilaian yang sudah berstatus final dan terkunci tidak dapat dihapus.';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'finalized' THEN
            NEW.is_locked := true;
            NEW.finalized_at := COALESCE(NEW.finalized_at, now());
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        -- Cegah perubahan identitas referensi utama
        IF NEW.tenant_id <> OLD.tenant_id
           OR NEW.stage_participation_id <> OLD.stage_participation_id
           OR NEW.assigned_maqra_id <> OLD.assigned_maqra_id
           OR NEW.judge_profile_id <> OLD.judge_profile_id THEN
            RAISE EXCEPTION 'Pelanggaran Integritas: Kolom identitas lembar penilaian (tenant, partisipasi babak, maqra, atau hakim) tidak dapat diubah.';
        END IF;

        -- Jika lembar nilai sudah final atau terkunci, tolak semua UPDATE langsung kecuali melalui RPC reopen_judge_assessment
        IF (OLD.status = 'finalized' OR OLD.is_locked = true) THEN
            IF COALESCE(current_setting('mtq.rpc_reopen_active', true), 'false') <> 'true' THEN
                RAISE EXCEPTION 'Pelanggaran Keamanan: Lembar penilaian yang sudah final bersifat terkunci (read-only). Pembukaan kembali hanya dapat dilakukan oleh Administrator melalui prosedur resmi reopen_judge_assessment dengan alasan audit.';
            END IF;
        END IF;

        -- Pastikan setiap transisi ke finalized mengunci baris secara otomatis
        IF NEW.status = 'finalized' THEN
            NEW.is_locked := true;
            NEW.finalized_at := COALESCE(NEW.finalized_at, now());
        END IF;

        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_judge_assessment_immutability ON judge_assessments;
CREATE TRIGGER trg_enforce_judge_assessment_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON judge_assessments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_judge_assessment_immutability();

-- 13B. Proteksi Append-Only pada Audit Logs & Stage Result Snapshots
CREATE OR REPLACE FUNCTION public.enforce_append_only_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'Pelanggaran Integritas: Tabel % bersifat append-only (rekaman historis permanen) dan tidak dapat diubah atau dihapus.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_records();

DROP TRIGGER IF EXISTS trg_stage_snapshots_append_only ON stage_result_snapshots;
CREATE TRIGGER trg_stage_snapshots_append_only
    BEFORE UPDATE OR DELETE ON stage_result_snapshots
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_records();

-- 13C. Proteksi Imutabilitas Historis Rubrik yang Sudah Dipakai Penilaian Final
CREATE OR REPLACE FUNCTION public.enforce_rubric_field_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rubric_id UUID;
    v_used_count INT;
BEGIN
    v_rubric_id := COALESCE(OLD.rubric_version_id, NEW.rubric_version_id);

    SELECT COUNT(*) INTO v_used_count
    FROM judge_assessments ja
    WHERE ja.rubric_version_id = v_rubric_id
      AND ja.status = 'finalized';

    IF v_used_count > 0 THEN
        RAISE EXCEPTION 'Pelanggaran Imutabilitas Historis: Struktur bidang rubrik ini telah digunakan pada % lembar penilaian final dan tidak dapat dimodifikasi. Buat versi rubrik baru.', v_used_count;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_rubric_field_immutability ON rubric_fields;
CREATE TRIGGER trg_enforce_rubric_field_immutability
    BEFORE UPDATE OR DELETE ON rubric_fields
    FOR EACH ROW EXECUTE FUNCTION public.enforce_rubric_field_immutability();

-- 14. ROW LEVEL SECURITY (RLS) POLICIES (LEAST PRIVILEGE — ZERO DUPLICATES)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE kafilahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_maqras ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE deduction_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_rule_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE judge_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_result_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Security Helper: Get tenant memberships for authenticated user
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

-- Security Helper: Check if user is tenant admin or superadmin
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

-- Security Helper: Verify official judge assignment for a specific stage participation
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

-- Bersihkan kebijakan lama dan buat kebijakan kanonik tunggal tanpa duplikasi
-- RLS: Tenants
DROP POLICY IF EXISTS "Users can view assigned tenants" ON tenants;
DROP POLICY IF EXISTS tenants_select_policy ON tenants;
CREATE POLICY tenants_select_policy ON tenants FOR SELECT
USING (id IN (SELECT get_user_tenants()) OR id = '00000000-0000-0000-0000-000000000000'::uuid);

DROP POLICY IF EXISTS "Superadmins and tenant admins can update tenant" ON tenants;
DROP POLICY IF EXISTS tenants_update_policy ON tenants;
CREATE POLICY tenants_update_policy ON tenants FOR UPDATE
USING (is_tenant_admin(id))
WITH CHECK (is_tenant_admin(id));

-- RLS: Profiles (Prevent self role-escalation)
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON profiles;
DROP POLICY IF EXISTS profiles_select_policy ON profiles;
CREATE POLICY profiles_select_policy ON profiles FOR SELECT
USING (
    id = auth.uid() OR 
    id IN (
        SELECT tm.profile_id FROM tenant_memberships tm 
        WHERE tm.tenant_id IN (SELECT get_user_tenants())
    )
);

DROP POLICY IF EXISTS "Users can update own profile without escalating role" ON profiles;
DROP POLICY IF EXISTS profiles_update_policy ON profiles;
CREATE POLICY profiles_update_policy ON profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
);

-- RLS: Tenant Memberships
DROP POLICY IF EXISTS "Users can view memberships of their tenants" ON tenant_memberships;
DROP POLICY IF EXISTS tenant_memberships_select_policy ON tenant_memberships;
CREATE POLICY tenant_memberships_select_policy ON tenant_memberships FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS "Tenant admins can manage tenant memberships" ON tenant_memberships;
DROP POLICY IF EXISTS tenant_memberships_admin_policy ON tenant_memberships;
CREATE POLICY tenant_memberships_admin_policy ON tenant_memberships FOR ALL
USING (is_tenant_admin(tenant_id))
WITH CHECK (is_tenant_admin(tenant_id));

-- RLS: Strict Tenant-Scoped Operational & Master Tables (NO system tenant leakage on operational tables)
DO $$
DECLARE
    t TEXT;
    strict_tenant_tables TEXT[] := ARRAY[
        'branches', 'levels', 'kafilahs', 'participants', 'questions',
        'assigned_maqras', 'error_categories', 'competition_rule_configs',
        'stages', 'stage_participations', 'judge_assignments'
    ];
BEGIN
    FOREACH t IN ARRAY strict_tenant_tables
    LOOP
        -- Drop legacy human-readable policy names if present
        EXECUTE format('DROP POLICY IF EXISTS "Tenant members can view %s" ON %I', replace(t, '_', ' '), t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant admins can manage %s" ON %I', replace(t, '_', ' '), t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant members can view competition rules" ON %I', t);
        EXECUTE format('DROP POLICY IF EXISTS "Tenant admins can manage competition rules" ON %I', t);

        -- Drop and recreate canonical policies
        EXECUTE format('DROP POLICY IF EXISTS %I_select_policy ON %I', t, t);
        EXECUTE format('CREATE POLICY %I_select_policy ON %I FOR SELECT USING (tenant_id IN (SELECT get_user_tenants()))', t, t);

        EXECUTE format('DROP POLICY IF EXISTS %I_admin_policy ON %I', t, t);
        EXECUTE format('CREATE POLICY %I_admin_policy ON %I FOR ALL USING (is_tenant_admin(tenant_id)) WITH CHECK (is_tenant_admin(tenant_id))', t, t);
    END LOOP;
END;
$$;

-- RLS: Rubric Hierarchy (Allows reading National System Templates 00000000-0000-0000-0000-000000000000)
DROP POLICY IF EXISTS "Tenant members can view rubric versions" ON rubric_versions;
DROP POLICY IF EXISTS "Tenant admins can manage rubric versions" ON rubric_versions;
DROP POLICY IF EXISTS rubric_versions_select_policy ON rubric_versions;
DROP POLICY IF EXISTS rubric_versions_admin_policy ON rubric_versions;

CREATE POLICY rubric_versions_select_policy ON rubric_versions FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()) OR tenant_id = '00000000-0000-0000-0000-000000000000'::uuid);

CREATE POLICY rubric_versions_admin_policy ON rubric_versions FOR ALL
USING (is_tenant_admin(tenant_id))
WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "Tenant members can view rubric fields" ON rubric_fields;
DROP POLICY IF EXISTS "Tenant admins can manage rubric fields" ON rubric_fields;
DROP POLICY IF EXISTS rubric_fields_select_policy ON rubric_fields;
DROP POLICY IF EXISTS rubric_fields_admin_policy ON rubric_fields;

CREATE POLICY rubric_fields_select_policy ON rubric_fields FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM rubric_versions rv
        WHERE rv.id = rubric_fields.rubric_version_id
          AND (rv.tenant_id IN (SELECT get_user_tenants()) OR rv.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
    )
);

CREATE POLICY rubric_fields_admin_policy ON rubric_fields FOR ALL
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

DROP POLICY IF EXISTS rubric_criteria_select_policy ON rubric_criteria;
DROP POLICY IF EXISTS rubric_criteria_admin_policy ON rubric_criteria;

CREATE POLICY rubric_criteria_select_policy ON rubric_criteria FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM rubric_fields rf
        JOIN rubric_versions rv ON rv.id = rf.rubric_version_id
        WHERE rf.id = rubric_criteria.rubric_field_id
          AND (rv.tenant_id IN (SELECT get_user_tenants()) OR rv.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
    )
);

CREATE POLICY rubric_criteria_admin_policy ON rubric_criteria FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM rubric_fields rf
        JOIN rubric_versions rv ON rv.id = rf.rubric_version_id
        WHERE rf.id = rubric_criteria.rubric_field_id
          AND is_tenant_admin(rv.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM rubric_fields rf
        JOIN rubric_versions rv ON rv.id = rf.rubric_version_id
        WHERE rf.id = rubric_criteria.rubric_field_id
          AND is_tenant_admin(rv.tenant_id)
    )
);

DROP POLICY IF EXISTS deduction_rules_select_policy ON deduction_rules;
DROP POLICY IF EXISTS deduction_rules_admin_policy ON deduction_rules;

CREATE POLICY deduction_rules_select_policy ON deduction_rules FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM rubric_criteria rc
        JOIN rubric_fields rf ON rf.id = rc.rubric_field_id
        JOIN rubric_versions rv ON rv.id = rf.rubric_version_id
        WHERE rc.id = deduction_rules.criterion_id
          AND (rv.tenant_id IN (SELECT get_user_tenants()) OR rv.tenant_id = '00000000-0000-0000-0000-000000000000'::uuid)
    )
);

CREATE POLICY deduction_rules_admin_policy ON deduction_rules FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM rubric_criteria rc
        JOIN rubric_fields rf ON rf.id = rc.rubric_field_id
        JOIN rubric_versions rv ON rv.id = rf.rubric_version_id
        WHERE rc.id = deduction_rules.criterion_id
          AND is_tenant_admin(rv.tenant_id)
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM rubric_criteria rc
        JOIN rubric_fields rf ON rf.id = rc.rubric_field_id
        JOIN rubric_versions rv ON rv.id = rf.rubric_version_id
        WHERE rc.id = deduction_rules.criterion_id
          AND is_tenant_admin(rv.tenant_id)
    )
);

-- RLS: Judge Assessments (Least Privilege: NO Admin FOR ALL bypass; Judges only edit own assigned unlocked sheets)
DROP POLICY IF EXISTS "Tenant members can view judge_assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Admins and assigned judges can view assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Admins and assigned judges can view judge_assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Assigned judges can insert unlocked assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Assigned judges can insert unlocked judge_assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Assigned judges can update own unlocked assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Judges can update assigned unlocked judge_assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Admins can manage assessments" ON judge_assessments;
DROP POLICY IF EXISTS "Admins can manage judge_assessments" ON judge_assessments;
DROP POLICY IF EXISTS judge_assessments_select_policy ON judge_assessments;
DROP POLICY IF EXISTS judge_assessments_insert_policy ON judge_assessments;
DROP POLICY IF EXISTS judge_assessments_update_policy ON judge_assessments;

CREATE POLICY judge_assessments_select_policy ON judge_assessments FOR SELECT
USING (
    is_tenant_admin(tenant_id)
    OR (
        judge_profile_id = auth.uid()
        AND tenant_id IN (SELECT get_user_tenants())
        AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
    )
);

CREATE POLICY judge_assessments_insert_policy ON judge_assessments FOR INSERT
WITH CHECK (
    judge_profile_id = auth.uid()
    AND is_locked = false
    AND status IN ('not_started', 'in_progress')
    AND tenant_id IN (SELECT get_user_tenants())
    AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
);

CREATE POLICY judge_assessments_update_policy ON judge_assessments FOR UPDATE
USING (
    judge_profile_id = auth.uid() 
    AND is_locked = false 
    AND status <> 'finalized'
    AND tenant_id IN (SELECT get_user_tenants())
    AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
)
WITH CHECK (
    judge_profile_id = auth.uid()
    AND tenant_id IN (SELECT get_user_tenants())
    AND is_assigned_judge(tenant_id, stage_participation_id, auth.uid())
);

-- RLS: Stage Result Snapshots & Audit Logs (Append-Only Immutable: NO UPDATE / DELETE policies)
DROP POLICY IF EXISTS "Tenant members can view snapshots" ON stage_result_snapshots;
DROP POLICY IF EXISTS "Tenant members can view stage_result_snapshots" ON stage_result_snapshots;
DROP POLICY IF EXISTS "Admins can insert stage result snapshots" ON stage_result_snapshots;
DROP POLICY IF EXISTS "Admins can insert stage_result_snapshots" ON stage_result_snapshots;
DROP POLICY IF EXISTS stage_result_snapshots_select_policy ON stage_result_snapshots;
DROP POLICY IF EXISTS stage_result_snapshots_insert_policy ON stage_result_snapshots;

CREATE POLICY stage_result_snapshots_select_policy ON stage_result_snapshots FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

CREATE POLICY stage_result_snapshots_insert_policy ON stage_result_snapshots FOR INSERT
WITH CHECK (is_tenant_admin(tenant_id));

DROP POLICY IF EXISTS "Tenant members can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Tenant members can view audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "System and admins can append audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System and admins can append audit_logs" ON audit_logs;
DROP POLICY IF EXISTS audit_logs_select_policy ON audit_logs;
DROP POLICY IF EXISTS audit_logs_insert_policy ON audit_logs;

CREATE POLICY audit_logs_select_policy ON audit_logs FOR SELECT
USING (tenant_id IN (SELECT get_user_tenants()));

CREATE POLICY audit_logs_insert_policy ON audit_logs FOR INSERT
WITH CHECK (
    tenant_id IN (SELECT get_user_tenants())
    AND (actor_id IS NULL OR actor_id = auth.uid())
);

-- 15. STORED PROCEDURES / RPC FUNCTIONS (ATOMIC & HARDENED)

-- RPC 1: Finalisasi & Penguncian Lembar Penilaian oleh Hakim Bertugas (Finalize Judge Assessment)
CREATE OR REPLACE FUNCTION finalize_judge_assessment(
    p_assessment_id UUID
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
    v_sp RECORD;
    v_stage RECORD;
    v_required_units INT;
    v_finalized_units INT;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Permintaan tidak memiliki sesi autentikasi.';
    END IF;

    SELECT * INTO v_assessment FROM judge_assessments WHERE id = p_assessment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Finalisasi ditolak: Lembar penilaian belum diinisialisasi di database.';
    END IF;

    IF v_assessment.judge_profile_id <> v_actor_id THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya hakim pemilik lembar penilaian yang berwenang mengunci nilai.';
    END IF;

    IF NOT is_assigned_judge(v_assessment.tenant_id, v_assessment.stage_participation_id, v_actor_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak terdaftar pada penugasan majelis hakim resmi (judge_assignments) untuk babak dan cabang peserta ini.';
    END IF;

    IF v_assessment.status = 'finalized' OR v_assessment.is_locked THEN
        RAISE EXCEPTION 'Lembar penilaian ini sudah berstatus final dan terkunci.';
    END IF;

    SELECT * INTO v_sp FROM stage_participations WHERE id = v_assessment.stage_participation_id;
    SELECT * INTO v_stage FROM stages WHERE id = v_sp.stage_id;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Finalisasi ditolak: Babak musabaqah ini telah ditutup/disahkan.';
    END IF;

    -- Kunci lembar penilaian
    UPDATE judge_assessments
    SET status = 'finalized',
        is_locked = true,
        finalized_at = v_now,
        updated_at = v_now
    WHERE id = p_assessment_id;

    -- Hitung total kombinasi wajib (assigned_maqras x assigned_judges) untuk peserta ini
    SELECT COUNT(*) INTO v_required_units
    FROM assigned_maqras am
    CROSS JOIN (
        SELECT DISTINCT ja.judge_profile_id
        FROM judge_assignments ja
        JOIN participants p ON p.id = v_sp.participant_id
        WHERE ja.tenant_id = v_sp.tenant_id
          AND ja.stage_id = v_sp.stage_id
          AND (ja.branch_id IS NULL OR ja.branch_id = p.branch_id OR ja.branch_id = v_stage.branch_id)
          AND ja.status = 'Aktif'
    ) req_judges
    WHERE am.stage_participation_id = v_sp.id;

    SELECT COUNT(*) INTO v_finalized_units
    FROM assigned_maqras am
    JOIN judge_assessments jass
         ON jass.stage_participation_id = am.stage_participation_id
        AND jass.assigned_maqra_id = am.id
        AND jass.status = 'finalized'
        AND jass.is_locked = true
    WHERE am.stage_participation_id = v_sp.id;

    -- Perbarui status progres stage_participations
    UPDATE stage_participations
    SET status = CASE
            WHEN v_required_units > 0 AND v_finalized_units >= v_required_units THEN 'Lengkap'
            WHEN v_finalized_units > 0 THEN 'Menunggu Hakim Lain'
            ELSE 'Berlangsung'
        END,
        finalized_at = CASE
            WHEN v_required_units > 0 AND v_finalized_units >= v_required_units THEN v_now
            ELSE finalized_at
        END,
        updated_at = v_now
    WHERE id = v_sp.id;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (
        v_assessment.tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Dewan Hakim') || ' (judge)',
        'ASSESSMENT_FINALIZED',
        'Assessment ID: ' || p_assessment_id::text,
        'Finalisasi dan penguncian lembar penilaian dengan nilai akhir ' || v_assessment.final_score::text,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lembar penilaian berhasil dikunci dan difinalisasi secara permanen.',
        'participant_stage_status', CASE
            WHEN v_required_units > 0 AND v_finalized_units >= v_required_units THEN 'Lengkap'
            ELSE 'Menunggu Hakim Lain'
        END
    );
END;
$$;

-- RPC 2: Buka Kembali Penilaian Final (Reopen Assessment — Admin Only)
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
    v_sp RECORD;
    v_stage RECORD;
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

    SELECT * INTO v_sp FROM stage_participations WHERE id = v_assessment.stage_participation_id;
    SELECT * INTO v_stage FROM stages WHERE id = v_sp.stage_id;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Pembukaan kembali ditolak: Babak musabaqah ini sudah disahkan secara resmi.';
    END IF;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    -- Aktifkan flag transaksi lokal agar trigger imutabilitas mengizinkan pembukaan kunci resmi ini
    PERFORM set_config('mtq.rpc_reopen_active', 'true', true);

    -- Update status kembali ke in_progress dan lepaskan kunci
    UPDATE judge_assessments
    SET status = 'in_progress',
        is_locked = false,
        reopened_at = now(),
        reopened_by = v_actor_id,
        reopen_reason = TRIM(p_reason),
        updated_at = now()
    WHERE id = p_assessment_id;

    -- Kembalikan status partisipasi babak jika sebelumnya Lengkap
    UPDATE stage_participations
    SET status = 'Berlangsung',
        updated_at = now()
    WHERE id = v_assessment.stage_participation_id
      AND status = 'Lengkap';

    -- Catat immutable audit log
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        v_assessment.tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'ASSESSMENT_REOPENED',
        'Assessment ID: ' || p_assessment_id::text,
        'Pembukaan kembali lembar penilaian final dengan skor sebelum koreksi: ' || v_assessment.final_score::text,
        TRIM(p_reason),
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lembar penilaian berhasil dibuka kembali. Dewan hakim dapat mengoreksi nilai.'
    );
END;
$$;

-- RPC 3: Pengesahan Babak & Pelolosan Kualifikasi Atomik (Advance Stage Qualifiers)
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
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Validasi sesi autentikasi
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
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

    -- 4. Pastikan terdapat peserta terdaftar pada babak ini
    SELECT COUNT(*) INTO v_participation_count
    FROM stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    IF v_participation_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Tidak ada peserta terdaftar pada babak ini.';
    END IF;

    -- 5. Validasi kuota kelulusan
    v_qualified_count := COALESCE(array_length(p_qualified_participant_ids, 1), 0);
    IF v_stage.qualification_quota <= 0 THEN
        RAISE EXCEPTION 'Kuota kelulusan pada babak ini tidak valid.';
    END IF;
    IF v_qualified_count > v_stage.qualification_quota THEN
        RAISE EXCEPTION 'Jumlah peserta yang diloloskan (%) melebihi kuota babak (%).', v_qualified_count, v_stage.qualification_quota;
    END IF;

    -- 6. Validasi alasan override manual (jika diberikan, wajib minimal 5 karakter)
    IF p_override_reasons IS NOT NULL AND jsonb_typeof(p_override_reasons) = 'object' THEN
        FOR v_override_key, v_override_val IN
            SELECT key, value #>> '{}' FROM jsonb_each(p_override_reasons)
        LOOP
            IF v_override_val IS NULL OR LENGTH(TRIM(v_override_val)) < 5 THEN
                RAISE EXCEPTION 'Pengesahan babak ditolak: Alasan override manual untuk peserta % wajib diisi minimal 5 karakter.', v_override_key;
            END IF;
        END LOOP;
    END IF;

    -- 7. Validasi bahwa penugasan majelis hakim resmi tersedia untuk babak & cabang ini
    SELECT COUNT(DISTINCT ja.judge_profile_id) INTO v_assigned_judges_count
    FROM judge_assignments ja
    WHERE ja.tenant_id = v_stage.tenant_id
      AND ja.stage_id = p_stage_id
      AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
      AND ja.status = 'Aktif';

    IF v_assigned_judges_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Belum ada penugasan majelis hakim resmi (judge_assignments) pada babak ini.';
    END IF;

    -- 8. Validasi seluruh peserta yang diloloskan berasal dari babak & cabang yang benar
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

    -- 9. Validasi seluruh peserta pada babak ini telah memiliki minimal 1 penetapan maqra (assigned_maqras)
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

    -- 10. Validasi seluruh kombinasi (peserta x assigned_maqras x hakim bertugas) telah berstatus finalized & terkunci
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

    -- 11. Validasi babak lanjutan jika ada (harus dalam tenant dan cabang yang sama)
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

    -- 12. Perbarui status kelulusan pada stage_participations babak asal
    UPDATE stage_participations sp
    SET is_qualified = (sp.participant_id = ANY(p_qualified_participant_ids)),
        status = 'Lengkap',
        qualification_reason = COALESCE(
            p_override_reasons ->> sp.participant_id::text,
            CASE WHEN sp.participant_id = ANY(p_qualified_participant_ids) THEN 'Lolos Kuota Peringkat' ELSE 'Tidak Masuk Kuota' END
        ),
        finalized_at = v_now,
        updated_at = v_now
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    -- 13. Perbarui status participants sesuai hasil babak
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

    -- 14. Finalisasi babak saat ini & aktifkan babak berikutnya jika ada
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

    -- 15. Daftarkan peserta lolos ke stage_participations babak berikutnya (tanpa maqra palsu)
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
            WHERE p.id = v_pid
              AND p.tenant_id = v_stage.tenant_id
            ON CONFLICT (tenant_id, stage_id, participant_id) DO NOTHING;
        END LOOP;
    END IF;

    -- 16. Simpan snapshot permanen ke stage_result_snapshots
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

    -- 17. Catat immutable audit log
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

-- 16. EXPLICIT RPC EXECUTION PERMISSIONS
REVOKE EXECUTE ON FUNCTION finalize_judge_assessment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finalize_judge_assessment(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reopen_judge_assessment(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) TO authenticated;
