-- ==============================================================================
-- MIGRATION: 20261109_complete_system_improvement.sql
-- Deskripsi:
-- 1. Penambahan atribut administratif lengkap peserta (nomor urut administratif,
--    nama ayah, asal kota/kabupaten, asal wilayah/provinsi, lembaga asal, stage_id).
-- 2. Pemisahan relasi jenjang/marhalah (level_id) pada tabel questions (Bank Soal).
-- 3. Pembuatan tabel lottery_draw_logs beserta RLS policy untuk riwayat & audit
--    undian maqra secara transparan dan dapat ditelusuri.
-- 4. Bersifat idempotent (non-destruktif) dan backward-compatible.
-- ==============================================================================

-- 1. Kolom Tambahan pada Tabel participants
ALTER TABLE public.participants
    ADD COLUMN IF NOT EXISTS admin_sequence_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS father_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS origin_city VARCHAR(150),
    ADD COLUMN IF NOT EXISTS origin_region VARCHAR(150),
    ADD COLUMN IF NOT EXISTS origin_institution VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_participants_tenant_level ON public.participants (tenant_id, level_id);
CREATE INDEX IF NOT EXISTS idx_participants_tenant_stage ON public.participants (tenant_id, stage_id);

-- 2. Kolom level_id pada Tabel questions (Pemisahan Cabang, Jenjang, dan Babak)
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_questions_tenant_branch_level_stage
    ON public.questions (tenant_id, branch_id, level_id, stage_id);

-- 3. Tabel Riwayat & Audit Undian Maqra (lottery_draw_logs)
CREATE TABLE IF NOT EXISTS public.lottery_draw_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES public.stages(id) ON DELETE SET NULL,
    stage_name VARCHAR(100) NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    branch_name VARCHAR(150) NOT NULL,
    level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL,
    level_name VARCHAR(150),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(255) NOT NULL,
    questions_per_participant INT NOT NULL DEFAULT 1 CHECK (questions_per_participant >= 1),
    participant_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    question_pool_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    draw_results JSONB NOT NULL DEFAULT '[]'::jsonb,
    draw_version INT NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lottery_draw_logs_tenant_time
    ON public.lottery_draw_logs (tenant_id, created_at DESC);

ALTER TABLE public.lottery_draw_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lottery_draw_logs_select_policy ON public.lottery_draw_logs;
CREATE POLICY lottery_draw_logs_select_policy ON public.lottery_draw_logs
    FOR SELECT
    USING (tenant_id IN (SELECT get_user_tenants()));

DROP POLICY IF EXISTS lottery_draw_logs_admin_policy ON public.lottery_draw_logs;
CREATE POLICY lottery_draw_logs_admin_policy ON public.lottery_draw_logs
    FOR ALL
    USING (is_tenant_admin(tenant_id))
    WITH CHECK (is_tenant_admin(tenant_id));
