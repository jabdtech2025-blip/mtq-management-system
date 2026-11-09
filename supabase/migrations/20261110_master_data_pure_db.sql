-- ==============================================================================
-- MTQ MANAGEMENT SYSTEM — MASTER DATA & COMPETITION CONFIGURATION ENHANCEMENT
-- File: supabase/migrations/20261110_master_data_pure_db.sql
-- 1. Penautan Rubrik ke Cabang (branch_id) & Jenjang/Golongan (level_id)
-- 2. Penambahan Jenjang (level_id) & Bidang Penilaian (judge_field_id) pada Penugasan Hakim
-- 3. Prosedur kaskade aman untuk penghapusan bidang rubrik (rubric_fields)
-- ==============================================================================

-- 1. Tambah branch_id dan level_id pada rubric_versions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'rubric_versions' 
          AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE public.rubric_versions 
        ADD COLUMN branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'rubric_versions' 
          AND column_name = 'level_id'
    ) THEN
        ALTER TABLE public.rubric_versions 
        ADD COLUMN level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rubric_versions_branch_level 
ON public.rubric_versions(tenant_id, branch_id, level_id);

-- 2. Tambah level_id dan judge_field_id pada judge_assignments
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'judge_assignments' 
          AND column_name = 'level_id'
    ) THEN
        ALTER TABLE public.judge_assignments 
        ADD COLUMN level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'judge_assignments' 
          AND column_name = 'level_name'
    ) THEN
        ALTER TABLE public.judge_assignments 
        ADD COLUMN level_name VARCHAR(150);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'judge_assignments' 
          AND column_name = 'judge_field_id'
    ) THEN
        ALTER TABLE public.judge_assignments 
        ADD COLUMN judge_field_id UUID REFERENCES public.rubric_fields(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_judge_assignments_level 
ON public.judge_assignments(tenant_id, stage_id, branch_id, level_id);

-- 3. Fungsi Penghapusan Bidang Rubrik Secara Kaskade Aman
CREATE OR REPLACE FUNCTION public.delete_rubric_field_cascade(
    p_rubric_version_id UUID,
    p_field_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rf RECORD;
    v_rv RECORD;
    v_is_used BOOLEAN;
BEGIN
    -- Validasi keberadaan field
    SELECT * INTO v_rf FROM rubric_fields WHERE id = p_field_id AND rubric_version_id = p_rubric_version_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bidang rubrik tidak ditemukan.');
    END IF;

    -- Validasi apakah rubrik telah digunakan pada penilaian final
    SELECT * INTO v_rv FROM rubric_versions WHERE id = p_rubric_version_id;
    SELECT EXISTS (
        SELECT 1 FROM judge_assessments ja
        WHERE (ja.rubric_version_id = p_rubric_version_id OR ja.rubric_version = v_rv.code)
          AND ja.status = 'finalized'
    ) INTO v_is_used;

    IF v_is_used THEN
        RETURN jsonb_build_object(
            'success', false, 
            'message', 'Bidang tidak dapat dihapus permanen karena versi rubrik ini telah digunakan pada lembar penilaian yang sudah difinalisasi. Nonaktifkan bidang sebagai gantinya.'
        );
    END IF;

    -- Lepaskan referensi pada error_categories
    UPDATE error_categories 
    SET rubric_field_id = NULL 
    WHERE rubric_field_id = p_field_id;

    -- Lepaskan referensi pada judge_assignments
    UPDATE judge_assignments 
    SET judge_field_id = NULL 
    WHERE judge_field_id = p_field_id;

    -- Hapus kaskade rubric_criteria & deduction_rules
    DELETE FROM deduction_rules 
    WHERE criterion_id IN (SELECT id FROM rubric_criteria WHERE rubric_field_id = p_field_id);

    DELETE FROM rubric_criteria 
    WHERE rubric_field_id = p_field_id;

    -- Hapus baris rubric_fields
    DELETE FROM rubric_fields WHERE id = p_field_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', format('Bidang "%s" berhasil dihapus permanen dari versi rubrik.', v_rf.name)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_rubric_field_cascade(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_rubric_field_cascade(UUID, UUID) TO authenticated;
