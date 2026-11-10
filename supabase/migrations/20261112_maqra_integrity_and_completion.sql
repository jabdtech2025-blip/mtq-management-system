-- ==============================================================================
-- MIGRATION: 20261112_maqra_integrity_and_completion.sql
-- T1.1: Integritas Metadata Maqra (114 Surah, Batas Ayat per Surah, Halaman 1..604)
--       serta Audit Konsistensi Soal ('Perlu Verifikasi').
-- Idempotent & Aman dijalankan berulang kali di PostgreSQL / Supabase.
-- ==============================================================================

-- 1. Perluas CHECK constraint status pada public.questions agar mendukung 'Perlu Verifikasi'
DO $$
DECLARE
    v_con_name TEXT;
BEGIN
    FOR v_con_name IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'questions'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS %I', v_con_name);
    END LOOP;

    ALTER TABLE public.questions
        ADD CONSTRAINT questions_status_check
        CHECK (status IN ('Aktif', 'Nonaktif', 'Perlu Verifikasi'));
END $$;

-- 2. Fungsi referensi jumlah ayat resmi 114 Surah Al-Qur'an (Standar Mushaf Madinah / Kufah)
CREATE OR REPLACE FUNCTION public.get_surah_max_ayah(p_surah_number INT)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_verse_counts INT[] := ARRAY[
        7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
        123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
        112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
        34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
        54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
        60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
        14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
        28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
        29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
        15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
        11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
        5, 4, 5, 6
    ];
BEGIN
    IF p_surah_number IS NULL OR p_surah_number < 1 OR p_surah_number > 114 THEN
        RETURN NULL;
    END IF;
    RETURN v_verse_counts[p_surah_number];
END;
$$;

-- 3. Tambahkan CHECK constraint rentang dasar pada public.questions
DO $$
BEGIN
    ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_surah_number_check;
    ALTER TABLE public.questions
        ADD CONSTRAINT questions_surah_number_check
        CHECK (surah_number BETWEEN 1 AND 114);

    ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_ayah_range_check;
    ALTER TABLE public.questions
        ADD CONSTRAINT questions_ayah_range_check
        CHECK (start_ayah >= 1 AND end_ayah >= start_ayah);

    ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_page_range_check;
    ALTER TABLE public.questions
        ADD CONSTRAINT questions_page_range_check
        CHECK (
            page_number BETWEEN 1 AND 604
            AND page_start BETWEEN 1 AND 604
            AND page_end BETWEEN 1 AND 604
            AND page_start <= page_end
        );
END $$;

-- 4. Trigger validasi batas maksimum ayat per surah pada public.questions
CREATE OR REPLACE FUNCTION public.validate_question_maqra_bounds()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_ayah INT;
BEGIN
    IF NEW.surah_number IS NULL OR NEW.surah_number < 1 OR NEW.surah_number > 114 THEN
        RAISE EXCEPTION 'Nomor surah tidak valid: % (harus antara 1 s.d. 114).', NEW.surah_number;
    END IF;

    v_max_ayah := public.get_surah_max_ayah(NEW.surah_number);
    IF v_max_ayah IS NULL THEN
        RAISE EXCEPTION 'Nomor surah % tidak ditemukan dalam indeks 114 surah.', NEW.surah_number;
    END IF;

    IF NEW.start_ayah IS NULL OR NEW.start_ayah < 1 OR NEW.start_ayah > v_max_ayah THEN
        RAISE EXCEPTION 'Ayat mulai (%) berada di luar batas surah ke-% (1..%).', NEW.start_ayah, NEW.surah_number, v_max_ayah;
    END IF;

    IF NEW.end_ayah IS NULL OR NEW.end_ayah < NEW.start_ayah OR NEW.end_ayah > v_max_ayah THEN
        RAISE EXCEPTION 'Ayat selesai (%) tidak valid untuk surah ke-% (harus antara %..%).', NEW.end_ayah, NEW.surah_number, NEW.start_ayah, v_max_ayah;
    END IF;

    IF NEW.page_start IS NULL OR NEW.page_start < 1 OR NEW.page_start > 604 THEN
        RAISE EXCEPTION 'Halaman mulai (%) harus berada di antara 1..604.', NEW.page_start;
    END IF;

    IF NEW.page_end IS NULL OR NEW.page_end < NEW.page_start OR NEW.page_end > 604 THEN
        RAISE EXCEPTION 'Halaman selesai (%) harus berada di antara %..604.', NEW.page_end, NEW.page_start;
    END IF;

    IF NEW.page_number IS NULL OR NEW.page_number < 1 OR NEW.page_number > 604 THEN
        NEW.page_number := NEW.page_start;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_question_maqra ON public.questions;
CREATE TRIGGER trg_validate_question_maqra
    BEFORE INSERT OR UPDATE ON public.questions
    FOR EACH ROW EXECUTE FUNCTION public.validate_question_maqra_bounds();

-- 5. RPC Audit Konsistensi Soal Eksisting (Menandai 'Perlu Verifikasi' tanpa mengubah nomor surah/ayat)
CREATE OR REPLACE FUNCTION public.audit_questions_consistency(p_tenant_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_flagged_count INT := 0;
BEGIN
    UPDATE public.questions q
    SET status = 'Perlu Verifikasi'
    WHERE (p_tenant_id IS NULL OR q.tenant_id = p_tenant_id)
      AND q.status = 'Aktif'
      AND (
          q.surah_number < 1
          OR q.surah_number > 114
          OR q.start_ayah < 1
          OR q.end_ayah < q.start_ayah
          OR q.end_ayah > COALESCE(public.get_surah_max_ayah(q.surah_number), 0)
          OR q.page_start < 1
          OR q.page_end > 604
          OR q.page_end < q.page_start
      );

    GET DIAGNOSTICS v_flagged_count = ROW_COUNT;
    RETURN v_flagged_count;
END;
$$;

-- 6. T1.2 Fungsi Server-Authoritative get_stage_completion_sql (Paritas 100% dengan src/services/completion.ts)
CREATE OR REPLACE FUNCTION public.get_stage_completion_sql(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_required_judge_count INT := 0;
    v_total_participants INT := 0;
    v_completed_participants INT := 0;
    v_missing_maqra_participants INT := 0;
    v_total_required_units INT := 0;
    v_finalized_units INT := 0;
    v_sp RECORD;
    v_sp_maqra_count INT;
    v_sp_finalized_units INT;
    v_all_complete BOOLEAN := false;
    v_blocking_code TEXT := NULL;
BEGIN
    SELECT id, tenant_id, branch_id, name
    INTO v_stage
    FROM public.stages
    WHERE id = p_stage_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'stage_id', p_stage_id,
            'total_participants_count', 0,
            'completed_participants_count', 0,
            'incomplete_participants_count', 0,
            'missing_maqra_participants_count', 0,
            'required_judge_count', 0,
            'total_required_units', 0,
            'finalized_units_count', 0,
            'all_complete', false,
            'blocking_code', 'NO_PARTICIPANTS'
        );
    END IF;

    SELECT COUNT(DISTINCT ja.judge_profile_id)
    INTO v_required_judge_count
    FROM public.judge_assignments ja
    WHERE ja.tenant_id = v_stage.tenant_id
      AND ja.stage_id = v_stage.id
      AND ja.status = 'Aktif'
      AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id);

    FOR v_sp IN
        SELECT sp.id, sp.participant_id
        FROM public.stage_participations sp
        WHERE sp.tenant_id = v_stage.tenant_id
          AND sp.stage_id = v_stage.id
    LOOP
        v_total_participants := v_total_participants + 1;

        SELECT COUNT(*)
        INTO v_sp_maqra_count
        FROM public.assigned_maqras am
        WHERE am.stage_participation_id = v_sp.id;

        IF v_sp_maqra_count = 0 THEN
            v_missing_maqra_participants := v_missing_maqra_participants + 1;
        END IF;

        v_total_required_units := v_total_required_units + (v_sp_maqra_count * v_required_judge_count);

        SELECT COUNT(*)
        INTO v_sp_finalized_units
        FROM public.assigned_maqras am
        JOIN public.judge_assignments ja
          ON ja.tenant_id = v_stage.tenant_id
         AND ja.stage_id = v_stage.id
         AND ja.status = 'Aktif'
         AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
        JOIN public.judge_assessments asm
          ON asm.stage_participation_id = v_sp.id
         AND asm.assigned_maqra_id = am.id
         AND asm.judge_profile_id = ja.judge_profile_id
         AND asm.status = 'finalized'
         AND asm.is_locked = true
        WHERE am.stage_participation_id = v_sp.id;

        v_finalized_units := v_finalized_units + v_sp_finalized_units;

        IF v_sp_maqra_count >= 1
           AND v_required_judge_count >= 1
           AND v_sp_finalized_units = (v_sp_maqra_count * v_required_judge_count)
        THEN
            v_completed_participants := v_completed_participants + 1;
        END IF;
    END LOOP;

    v_all_complete := (
        v_total_participants > 0
        AND v_required_judge_count > 0
        AND v_missing_maqra_participants = 0
        AND v_completed_participants = v_total_participants
    );

    IF v_total_participants = 0 THEN
        v_blocking_code := 'NO_PARTICIPANTS';
    ELSIF v_required_judge_count = 0 THEN
        v_blocking_code := 'NO_JUDGES';
    ELSIF v_missing_maqra_participants > 0 THEN
        v_blocking_code := 'NO_MAQRA';
    ELSIF v_completed_participants < v_total_participants THEN
        v_blocking_code := 'INCOMPLETE_ASSESSMENTS';
    END IF;

    RETURN jsonb_build_object(
        'stage_id', v_stage.id,
        'total_participants_count', v_total_participants,
        'completed_participants_count', v_completed_participants,
        'incomplete_participants_count', (v_total_participants - v_completed_participants),
        'missing_maqra_participants_count', v_missing_maqra_participants,
        'required_judge_count', v_required_judge_count,
        'total_required_units', v_total_required_units,
        'finalized_units_count', v_finalized_units,
        'all_complete', v_all_complete,
        'blocking_code', v_blocking_code
    );
END;
$$;

-- 7. T1.3: Pastikan FK error_categories.rubric_field_id bernilai ON DELETE SET NULL & RPC delete_rubric_field_cascade tersedia
DO $$
DECLARE
    v_con_name TEXT;
BEGIN
    FOR v_con_name IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'error_categories'
          AND con.contype = 'f'
          AND pg_get_constraintdef(con.oid) ILIKE '%rubric_field_id%'
    LOOP
        EXECUTE format('ALTER TABLE public.error_categories DROP CONSTRAINT IF EXISTS %I', v_con_name);
    END LOOP;

    ALTER TABLE public.error_categories
        ADD CONSTRAINT error_categories_rubric_field_id_fkey
        FOREIGN KEY (rubric_field_id) REFERENCES public.rubric_fields(id) ON DELETE SET NULL;
END $$;

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
    SELECT * INTO v_rf FROM public.rubric_fields WHERE id = p_field_id AND rubric_version_id = p_rubric_version_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bidang rubrik tidak ditemukan.');
    END IF;

    SELECT * INTO v_rv FROM public.rubric_versions WHERE id = p_rubric_version_id;
    SELECT EXISTS (
        SELECT 1 FROM public.judge_assessments ja
        WHERE (ja.rubric_version_id = p_rubric_version_id OR ja.rubric_version = v_rv.code)
          AND ja.status = 'finalized'
    ) INTO v_is_used;

    IF v_is_used THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Bidang tidak dapat dihapus permanen karena versi rubrik ini telah digunakan pada lembar penilaian yang sudah difinalisasi. Nonaktifkan bidang sebagai gantinya.'
        );
    END IF;

    UPDATE public.error_categories
    SET rubric_field_id = NULL
    WHERE rubric_field_id = p_field_id;

    UPDATE public.judge_assignments
    SET rubric_field_id = NULL
    WHERE rubric_field_id = p_field_id;

    DELETE FROM public.deduction_rules
    WHERE criterion_id IN (SELECT id FROM public.rubric_criteria WHERE rubric_field_id = p_field_id);

    DELETE FROM public.rubric_criteria
    WHERE rubric_field_id = p_field_id;

    DELETE FROM public.rubric_fields WHERE id = p_field_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', format('Bidang "%s" berhasil dihapus permanen dari versi rubrik.', v_rf.name)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_rubric_field_cascade(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_rubric_field_cascade(UUID, UUID) TO authenticated;


