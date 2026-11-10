-- ==============================================================================
-- MIGRATION: 20261114_audit_fixes.sql
-- Deskripsi: Perbaikan Audit Komprehensif MTQ Management System
--   FASE 1: Keamanan & Multi-Tenant
--     1.1 Pengamanan audit_questions_consistency (wajib p_tenant_id, cek admin/superadmin, REVOKE anon/PUBLIC)
--     1.2 Pengamanan get_stage_completion_sql (cek akses tenant & REVOKE anon/PUBLIC)
--     1.3 Penertiban seluruh fungsi SECURITY DEFINER (search_path & REVOKE EXECUTE dari PUBLIC, anon)
--     1.4 Integritas relasi lintas-tenant (UNIQUE(tenant_id, id), FK komposit & trigger BEFORE INSERT/UPDATE)
--     1.5 Keamanan pelaku audit undian commit_lottery_draw (abaikan p_actor_id/p_actor_name klien, pakai auth.uid())
--     1.7 Sanitasi handle_new_auth_user (huruf kecil [a-z0-9_.-], 3..30 karakter, tolak nama tercadang, sufiks unik)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1.1 PENGAMANAN audit_questions_consistency & delete_rubric_field_cascade
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_questions_consistency(p_tenant_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_flagged_count INT := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    IF p_tenant_id IS NULL AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Parameter p_tenant_id wajib diisi kecuali oleh Superadmin.';
    END IF;

    IF NOT (public.is_superadmin() OR (p_tenant_id IS NOT NULL AND public.is_tenant_admin(p_tenant_id))) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang berwenang menjalankan audit konsistensi soal.';
    END IF;

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

REVOKE EXECUTE ON FUNCTION public.audit_questions_consistency(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_questions_consistency(UUID) TO authenticated;

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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    SELECT * INTO v_rf FROM public.rubric_fields WHERE id = p_field_id AND rubric_version_id = p_rubric_version_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Bidang rubrik tidak ditemukan.');
    END IF;

    SELECT * INTO v_rv FROM public.rubric_versions WHERE id = p_rubric_version_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Versi rubrik tidak ditemukan.');
    END IF;

    IF NOT (public.is_tenant_admin(v_rv.tenant_id) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang dapat menghapus bidang rubrik.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.judge_assessments ja
        WHERE ja.rubric_version_id = p_rubric_version_id
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

-- ------------------------------------------------------------------------------
-- 1.2 PENGAMANAN get_stage_completion_sql (CEK TENANT & REVOKE ANON/PUBLIC)
-- ------------------------------------------------------------------------------
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

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

    IF NOT (public.is_superadmin() OR v_stage.tenant_id IN (SELECT public.get_user_tenants())) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki hak akses untuk membaca kelengkapan babak pada tenant lain.';
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

REVOKE EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) TO authenticated;

-- ------------------------------------------------------------------------------
-- 1.4 INTEGRITAS RELASI LINTAS-TENANT
--   - Tambahkan UNIQUE (tenant_id, id) pada tabel induk
--   - Pasang FK komposit dan Trigger BEFORE INSERT OR UPDATE lintas-tenant pada:
--     participants, stage_participations, judge_assignments, assigned_maqras, judge_assessments
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kafilahs_tenant_id_id_key') THEN
        ALTER TABLE public.kafilahs ADD CONSTRAINT kafilahs_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_tenant_id_id_key') THEN
        ALTER TABLE public.branches ADD CONSTRAINT branches_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'levels_tenant_id_id_key') THEN
        ALTER TABLE public.levels ADD CONSTRAINT levels_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stages_tenant_id_id_key') THEN
        ALTER TABLE public.stages ADD CONSTRAINT stages_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'participants_tenant_id_id_key') THEN
        ALTER TABLE public.participants ADD CONSTRAINT participants_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stage_participations_tenant_id_id_key') THEN
        ALTER TABLE public.stage_participations ADD CONSTRAINT stage_participations_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'questions_tenant_id_id_key') THEN
        ALTER TABLE public.questions ADD CONSTRAINT questions_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assigned_maqras_tenant_id_id_key') THEN
        ALTER TABLE public.assigned_maqras ADD CONSTRAINT assigned_maqras_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rubric_versions_tenant_id_id_key') THEN
        ALTER TABLE public.rubric_versions ADD CONSTRAINT rubric_versions_tenant_id_id_key UNIQUE (tenant_id, id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_cross_tenant_reference_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ref_tenant UUID;
    v_system_tenant UUID := '00000000-0000-0000-0000-000000000000'::uuid;
BEGIN
    IF TG_TABLE_NAME = 'participants' THEN
        IF NEW.kafilah_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.kafilahs WHERE id = NEW.kafilah_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: kafilah_id (%) bukan milik tenant peserta (%).', NEW.kafilah_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.branch_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.branches WHERE id = NEW.branch_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: branch_id (%) bukan milik tenant peserta (%).', NEW.branch_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.level_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.levels WHERE id = NEW.level_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: level_id (%) bukan milik tenant peserta (%).', NEW.level_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.stage_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.stages WHERE id = NEW.stage_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: stage_id (%) bukan milik tenant peserta (%).', NEW.stage_id, NEW.tenant_id;
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'stage_participations' THEN
        IF NEW.stage_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.stages WHERE id = NEW.stage_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: stage_id (%) pada stage_participations bukan milik tenant (%).', NEW.stage_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.participant_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.participants WHERE id = NEW.participant_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: participant_id (%) pada stage_participations bukan milik tenant (%).', NEW.participant_id, NEW.tenant_id;
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'judge_assignments' THEN
        IF NEW.stage_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.stages WHERE id = NEW.stage_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: stage_id (%) pada judge_assignments bukan milik tenant (%).', NEW.stage_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.branch_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.branches WHERE id = NEW.branch_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: branch_id (%) pada judge_assignments bukan milik tenant (%).', NEW.branch_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.level_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.levels WHERE id = NEW.level_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: level_id (%) pada judge_assignments bukan milik tenant (%).', NEW.level_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.rubric_field_id IS NOT NULL THEN
            SELECT rv.tenant_id INTO v_ref_tenant
            FROM public.rubric_fields rf
            JOIN public.rubric_versions rv ON rv.id = rf.rubric_version_id
            WHERE rf.id = NEW.rubric_field_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id AND v_ref_tenant IS DISTINCT FROM v_system_tenant THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: rubric_field_id (%) pada judge_assignments bukan milik tenant (%).', NEW.rubric_field_id, NEW.tenant_id;
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'assigned_maqras' THEN
        IF NEW.stage_participation_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.stage_participations WHERE id = NEW.stage_participation_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: stage_participation_id (%) pada assigned_maqras bukan milik tenant (%).', NEW.stage_participation_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.question_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.questions WHERE id = NEW.question_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: question_id (%) pada assigned_maqras bukan milik tenant (%).', NEW.question_id, NEW.tenant_id;
            END IF;
        END IF;

    ELSIF TG_TABLE_NAME = 'judge_assessments' THEN
        IF NEW.stage_participation_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.stage_participations WHERE id = NEW.stage_participation_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: stage_participation_id (%) pada judge_assessments bukan milik tenant (%).', NEW.stage_participation_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.assigned_maqra_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.assigned_maqras WHERE id = NEW.assigned_maqra_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: assigned_maqra_id (%) pada judge_assessments bukan milik tenant (%).', NEW.assigned_maqra_id, NEW.tenant_id;
            END IF;
        END IF;

        IF NEW.rubric_version_id IS NOT NULL THEN
            SELECT tenant_id INTO v_ref_tenant FROM public.rubric_versions WHERE id = NEW.rubric_version_id;
            IF v_ref_tenant IS DISTINCT FROM NEW.tenant_id AND v_ref_tenant IS DISTINCT FROM v_system_tenant THEN
                RAISE EXCEPTION 'Pelanggaran Isolasi Lintas-Tenant: rubric_version_id (%) pada judge_assessments bukan milik tenant (%).', NEW.rubric_version_id, NEW.tenant_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cross_tenant_participants ON public.participants;
CREATE TRIGGER trg_cross_tenant_participants
    BEFORE INSERT OR UPDATE ON public.participants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_cross_tenant_reference_integrity();

DROP TRIGGER IF EXISTS trg_cross_tenant_stage_participations ON public.stage_participations;
CREATE TRIGGER trg_cross_tenant_stage_participations
    BEFORE INSERT OR UPDATE ON public.stage_participations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_cross_tenant_reference_integrity();

DROP TRIGGER IF EXISTS trg_cross_tenant_judge_assignments ON public.judge_assignments;
CREATE TRIGGER trg_cross_tenant_judge_assignments
    BEFORE INSERT OR UPDATE ON public.judge_assignments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_cross_tenant_reference_integrity();

DROP TRIGGER IF EXISTS trg_cross_tenant_assigned_maqras ON public.assigned_maqras;
CREATE TRIGGER trg_cross_tenant_assigned_maqras
    BEFORE INSERT OR UPDATE ON public.assigned_maqras
    FOR EACH ROW EXECUTE FUNCTION public.enforce_cross_tenant_reference_integrity();

DROP TRIGGER IF EXISTS trg_cross_tenant_judge_assessments ON public.judge_assessments;
CREATE TRIGGER trg_cross_tenant_judge_assessments
    BEFORE INSERT OR UPDATE ON public.judge_assessments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_cross_tenant_reference_integrity();

-- ------------------------------------------------------------------------------
-- 1.5 KEAMANAN PELAKU AUDIT UNDIAN PADA commit_lottery_draw
--   - Abaikan p_actor_id dan p_actor_name dari klien
--   - Selalu gunakan auth.uid() dan profiles.name dari database
-- ------------------------------------------------------------------------------
ALTER TABLE public.assigned_maqras ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE OR REPLACE FUNCTION public.commit_lottery_draw(
    p_tenant_id UUID,
    p_stage_id UUID,
    p_stage_name VARCHAR(100),
    p_branch_id UUID,
    p_branch_name VARCHAR(150),
    p_level_id UUID,
    p_level_name VARCHAR(150),
    p_actor_id UUID,
    p_actor_name VARCHAR(255),
    p_results JSONB,
    p_questions_per_participant INT DEFAULT 1,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_real_actor_id UUID;
    v_real_actor_name VARCHAR(255);
    v_actor_profile RECORD;
    v_stage RECORD;
    v_res_elem JSONB;
    v_participant_id UUID;
    v_q_ids_json JSONB;
    v_q_id_text TEXT;
    v_q_id UUID;
    v_question RECORD;
    v_part RECORD;
    v_sp RECORD;
    v_now TIMESTAMPTZ := now();
    v_draw_log_id UUID := gen_random_uuid();
    v_assigned_maqras JSONB := '[]'::jsonb;
    v_all_p_ids TEXT[] := ARRAY[]::TEXT[];
    v_all_q_ids TEXT[] := ARRAY[]::TEXT[];
    v_new_maqra_id UUID;
    v_questions_count INT;
BEGIN
    v_real_actor_id := auth.uid();
    IF v_real_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    IF NOT public.is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator yang berwenang menetapkan hasil undian maqra.';
    END IF;

    SELECT name, role INTO v_actor_profile FROM public.profiles WHERE id = v_real_actor_id;
    v_real_actor_name := COALESCE(NULLIF(TRIM(v_actor_profile.name), ''), 'Administrator MTQ');

    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan pada tenant ini.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Penetapan undian ditolak: Babak "%" telah difinalisasi secara resmi.', v_stage.name;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.judge_assessments ja
        JOIN public.stage_participations sp ON sp.id = ja.stage_participation_id
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'STAGE_ASSESSMENTS_ALREADY_STARTED: Penetapan undian ditolak karena penilaian dewan hakim sudah dimulai pada babak "%".', v_stage.name;
    END IF;

    IF LENGTH(TRIM(COALESCE(p_notes, ''))) < 5 THEN
        RAISE EXCEPTION 'LOTTERY_OVERRIDE_REASON_REQUIRED: Penetapan maqra manual wajib menyertakan alasan override minimal 5 karakter.';
    END IF;

    IF jsonb_array_length(p_results) = 0 THEN
        RAISE EXCEPTION 'Hasil undian kosong.';
    END IF;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- 1. Validasi ketat 3D + status verifikasi berkas untuk seluruh hasil undian
    FOR v_res_elem IN SELECT * FROM jsonb_array_elements(p_results)
    LOOP
        v_participant_id := (v_res_elem ->> 'participantId')::uuid;
        SELECT * INTO v_part FROM public.participants WHERE id = v_participant_id AND tenant_id = p_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Peserta dengan ID % tidak ditemukan pada tenant ini.', v_participant_id;
        END IF;

        IF COALESCE(v_part.verification_status, 'Diverifikasi') <> 'Diverifikasi' THEN
            RAISE EXCEPTION 'PARTICIPANT_NOT_VERIFIED: Peserta "%" belum diverifikasi berkasnya (status: %). Hanya peserta berstatus Diverifikasi yang dapat mengikuti undian.', v_part.name, v_part.verification_status;
        END IF;

        IF p_branch_id IS NOT NULL AND v_part.branch_id IS NOT NULL AND v_part.branch_id <> p_branch_id THEN
            RAISE EXCEPTION 'Ketidaksesuaian cabang: Peserta "%" terdaftar pada cabang berbeda.', v_part.name;
        END IF;

        IF p_level_id IS NOT NULL AND v_part.level_id IS NOT NULL AND v_part.level_id <> p_level_id THEN
            RAISE EXCEPTION 'Ketidaksesuaian jenjang: Peserta "%" terdaftar pada jenjang berbeda.', v_part.name;
        END IF;

        v_q_ids_json := v_res_elem -> 'questionIds';
        v_questions_count := jsonb_array_length(v_q_ids_json);
        IF v_questions_count = 0 THEN
            RAISE EXCEPTION 'Tidak ada soal yang ditetapkan untuk peserta "%".', v_part.name;
        END IF;

        v_all_p_ids := array_append(v_all_p_ids, v_participant_id::text);

        FOR v_q_id_text IN SELECT * FROM jsonb_array_elements_text(v_q_ids_json)
        LOOP
            v_q_id := v_q_id_text::uuid;
            SELECT * INTO v_question FROM public.questions WHERE id = v_q_id AND tenant_id = p_tenant_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Soal dengan ID % tidak ditemukan.', v_q_id;
            END IF;

            IF v_question.status <> 'Aktif' THEN
                RAISE EXCEPTION 'Soal "%" (%) tidak berstatus Aktif.', v_question.title, v_question.code;
            END IF;

            IF p_branch_id IS NOT NULL AND v_question.branch_id IS NOT NULL AND v_question.branch_id <> p_branch_id THEN
                RAISE EXCEPTION 'Ketidaksesuaian cabang: Soal "%" berada pada cabang berbeda.', v_question.title;
            END IF;

            IF p_level_id IS NOT NULL AND v_question.level_id IS NOT NULL AND v_question.level_id <> p_level_id THEN
                RAISE EXCEPTION 'Ketidaksesuaian jenjang: Soal "%" berada pada jenjang berbeda.', v_question.title;
            END IF;

            v_all_q_ids := array_append(v_all_q_ids, v_q_id::text);
        END LOOP;
    END LOOP;

    -- 2. Eksekusi atomik pembaruan database
    FOR v_res_elem IN SELECT * FROM jsonb_array_elements(p_results)
    LOOP
        v_participant_id := (v_res_elem ->> 'participantId')::uuid;

        SELECT * INTO v_sp FROM public.stage_participations
        WHERE stage_id = p_stage_id AND participant_id = v_participant_id AND tenant_id = p_tenant_id
        LIMIT 1;

        IF NOT FOUND THEN
            INSERT INTO public.stage_participations (
                id, tenant_id, stage_id, participant_id, lottery_number, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, p_stage_id, v_participant_id,
                (SELECT lottery_number FROM public.participants WHERE id = v_participant_id),
                'Belum Dimulai', v_now, v_now
            ) RETURNING * INTO v_sp;
        END IF;

        DELETE FROM public.assigned_maqras
        WHERE stage_participation_id = v_sp.id
          AND tenant_id = p_tenant_id
          AND id NOT IN (
              SELECT assigned_maqra_id FROM public.judge_assessments
              WHERE stage_participation_id = v_sp.id AND status = 'finalized'
          );

        FOR v_q_id_text IN SELECT * FROM jsonb_array_elements_text(v_res_elem -> 'questionIds')
        LOOP
            v_q_id := v_q_id_text::uuid;
            v_new_maqra_id := gen_random_uuid();

            INSERT INTO public.assigned_maqras (
                id, tenant_id, stage_participation_id, question_id, assigned_at, assigned_by, method, notes
            ) VALUES (
                v_new_maqra_id, p_tenant_id, v_sp.id, v_q_id, v_now, v_real_actor_id, 'undian', p_notes
            );

            v_assigned_maqras := v_assigned_maqras || jsonb_build_object(
                'id', v_new_maqra_id,
                'participantId', v_participant_id,
                'stageParticipationId', v_sp.id,
                'questionId', v_q_id
            );
        END LOOP;

        UPDATE public.stage_participations
        SET status = CASE WHEN status = 'Maqra Belum Ditetapkan' THEN 'Belum Dimulai' ELSE status END,
            updated_at = v_now
        WHERE id = v_sp.id;
    END LOOP;

    -- Simpan riwayat undian di lottery_draw_logs dengan pelaku otoritatif v_real_actor_id & v_real_actor_name
    INSERT INTO public.lottery_draw_logs (
        id, tenant_id, stage_id, stage_name, branch_id, branch_name, level_id, level_name,
        actor_id, actor_name, questions_per_participant, participant_ids, question_pool_ids,
        draw_results, notes, created_at
    ) VALUES (
        v_draw_log_id, p_tenant_id, p_stage_id, p_stage_name, p_branch_id, p_branch_name, p_level_id, p_level_name,
        v_real_actor_id, v_real_actor_name, p_questions_per_participant, v_all_p_ids, v_all_q_ids,
        p_results, p_notes, v_now
    );

    -- Simpan audit log dengan pelaku otoritatif
    INSERT INTO public.audit_logs (
        tenant_id, actor_id, actor_name, action, target, summary, outcome
    ) VALUES (
        p_tenant_id, v_real_actor_id, v_real_actor_name, 'LOTTERY_DRAW_COMMITTED',
        'Stage: ' || p_stage_name || ', Branch: ' || COALESCE(p_branch_name, '-'),
        'Penetapan undian maqra atomik untuk ' || jsonb_array_length(p_results)::text || ' peserta (Log ID: ' || v_draw_log_id::text || ')',
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Penetapan undian maqra berhasil dicatat secara atomik di database.',
        'drawLogId', v_draw_log_id,
        'actorId', v_real_actor_id,
        'actorName', v_real_actor_name,
        'assignedMaqras', v_assigned_maqras
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.commit_lottery_draw(UUID, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, JSONB, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_lottery_draw(UUID, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, JSONB, INT, TEXT) TO authenticated;

-- ------------------------------------------------------------------------------
-- 1.7 SANITASI PENDAFTARAN / PEMBUATAN AKUN PADA handle_new_auth_user
--   - Sanitasi username: huruf kecil, [a-z0-9_.-], panjang 3..30 karakter
--   - Tolak nama tercadang ('admin', 'superadmin', 'root', 'support') -> ganti dengan sufiks aman
--   - Bila bentrok dengan profil yang sudah ada, tambahkan sufiks unik alih-alih gagal
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raw_username TEXT;
    v_username TEXT;
    v_name TEXT;
    v_uid_short TEXT;
BEGIN
    v_uid_short := LOWER(SUBSTRING(REPLACE(NEW.id::text, '-', '') FROM 1 FOR 6));

    v_raw_username := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), ''),
        SPLIT_PART(COALESCE(NEW.email, 'user_' || v_uid_short), '@', 1)
    );

    -- 1. Huruf kecil dan ganti karakter di luar [a-z0-9_.-] menjadi '_'
    v_username := LOWER(v_raw_username);
    v_username := REGEXP_REPLACE(v_username, '[^a-z0-9_.-]+', '_', 'g');
    v_username := REGEXP_REPLACE(v_username, '^[_.-]+|[_.-]+$', '', 'g');

    -- 2. Tolak nama tercadang ('admin', 'superadmin', 'root', 'support')
    IF v_username IN ('admin', 'superadmin', 'root', 'support') THEN
        v_username := 'user_' || v_uid_short;
    END IF;

    -- 3. Pastikan panjang minimal 3 karakter dan maksimal 30 karakter
    IF LENGTH(v_username) < 3 THEN
        v_username := 'user_' || v_uid_short;
    END IF;

    IF LENGTH(v_username) > 30 THEN
        v_username := LEFT(v_username, 30);
        v_username := REGEXP_REPLACE(v_username, '[_.-]+$', '', 'g');
    END IF;

    -- 4. Bila bentrok dengan username lain di public.profiles, tambahkan sufiks unik (maks 30 karakter)
    IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE LOWER(p.username) = LOWER(v_username)
          AND p.id <> NEW.id
    ) THEN
        v_username := LEFT(v_username, 23) || '_' || v_uid_short;
    END IF;

    v_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''),
        NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
        SPLIT_PART(COALESCE(NEW.email, 'Pengguna MTQ'), '@', 1)
    );

    INSERT INTO public.profiles (id, username, name, email, role)
    VALUES (NEW.id, v_username, v_name, NEW.email, 'judge')
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();

    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- FASE 2 — PENENTUAN PERINGKAT, KELULUSAN, DAN JUARA (SERVER-AUTHORITATIVE)
--   2.1 get_field_score, compare_tie_vectors, compute_stage_rankings, level_id & updated_at pada competition_rule_configs
--   2.2 Resolusi seri eksplisit p_tie_resolution + p_override_reasons pada advance_stage_qualifiers
--   2.3 Pemisahan qualification_quota vs stages.champion_count (Juara 1..N tanpa Juara Harapan)
--   2.4 Transisi status peserta tidak lolos di babak non-final menjadi 'Gugur'
--   2.5 stage_result_snapshots.branch_id nullable & UNIQUE(tenant_id, stage_id)
--   2.7 Bobot bidang rubrik (rubric_fields.weight NUMERIC NOT NULL DEFAULT 1 CHECK (weight > 0))
-- ------------------------------------------------------------------------------

-- 2.1 & 2.7 Perubahan Skema Tabel untuk Fase 2
ALTER TABLE public.competition_rule_configs
    ADD COLUMN IF NOT EXISTS level_id UUID REFERENCES public.levels(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.competition_rule_configs
    DROP CONSTRAINT IF EXISTS competition_rule_configs_tenant_id_branch_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_competition_rule_configs_unique_scope
    ON public.competition_rule_configs (
        tenant_id,
        COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE(level_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

ALTER TABLE public.rubric_fields
    ADD COLUMN IF NOT EXISTS weight NUMERIC NOT NULL DEFAULT 1;

DO $$
BEGIN
    ALTER TABLE public.rubric_fields DROP CONSTRAINT IF EXISTS rubric_fields_weight_check;
    ALTER TABLE public.rubric_fields
        ADD CONSTRAINT rubric_fields_weight_check CHECK (weight > 0);
END $$;

ALTER TABLE public.stages
    ADD COLUMN IF NOT EXISTS champion_count INT NOT NULL DEFAULT 3;

DO $$
BEGIN
    ALTER TABLE public.stages DROP CONSTRAINT IF EXISTS stages_champion_count_check;
    ALTER TABLE public.stages
        ADD CONSTRAINT stages_champion_count_check CHECK (champion_count >= 1);
END $$;

ALTER TABLE public.stage_participations
    ADD COLUMN IF NOT EXISTS champion_rank INT NULL,
    ADD COLUMN IF NOT EXISTS champion_title TEXT NULL;

ALTER TABLE public.stage_result_snapshots
    ALTER COLUMN branch_id DROP NOT NULL;

DROP INDEX IF EXISTS public.idx_stage_result_snapshots_unique_stage_branch;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_result_snapshots_unique_stage
    ON public.stage_result_snapshots (tenant_id, stage_id);

-- Perbarui get_stage_completion_sql agar hanya menghitung hakim dengan judge_assignments.status = 'Aktif' DAN tenant_memberships.status = 'Aktif'
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

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

    IF NOT (public.is_superadmin() OR v_stage.tenant_id IN (SELECT public.get_user_tenants())) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki hak akses untuk membaca kelengkapan babak pada tenant lain.';
    END IF;

    SELECT COUNT(DISTINCT ja.judge_profile_id)
    INTO v_required_judge_count
    FROM public.judge_assignments ja
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ja.tenant_id
     AND tm.profile_id = ja.judge_profile_id
     AND tm.status = 'Aktif'
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
        JOIN (
            SELECT DISTINCT ja.judge_profile_id
            FROM public.judge_assignments ja
            JOIN public.tenant_memberships tm
              ON tm.tenant_id = ja.tenant_id
             AND tm.profile_id = ja.judge_profile_id
             AND tm.status = 'Aktif'
            WHERE ja.tenant_id = v_stage.tenant_id
              AND ja.stage_id = v_stage.id
              AND ja.status = 'Aktif'
              AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
        ) active_judges ON true
        JOIN public.judge_assessments asm
          ON asm.stage_participation_id = v_sp.id
         AND asm.assigned_maqra_id = am.id
         AND asm.judge_profile_id = active_judges.judge_profile_id
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

REVOKE EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) TO authenticated;

-- 2.7 Perbarui calculate_assessment_score_sql agar memperhitungkan rubric_fields.weight
CREATE OR REPLACE FUNCTION public.calculate_assessment_score_sql(
    p_tenant_id UUID,
    p_rubric_version_id UUID,
    p_error_counts JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rubric RECORD;
    v_field RECORD;
    v_cat RECORD;
    v_cat_key TEXT;
    v_count_val TEXT;
    v_count NUMERIC;
    v_target_field_name TEXT;
    v_field_max_deduction NUMERIC;
    v_deduction NUMERIC;
    v_rule_deduction_points NUMERIC;
    v_rule_max_deduction NUMERIC;
    v_crit_id UUID;
    v_crit_max_deduction NUMERIC;
    v_unit_deduction NUMERIC;
    v_raw_deduction NUMERIC;
    v_crit_deductions JSONB := '{}'::jsonb;
    v_field_deductions JSONB := '{}'::jsonb;
    v_field_scores JSONB := '{}'::jsonb;
    v_deductions JSONB := '{}'::jsonb;
    v_total_deductions NUMERIC := 0.00;
    v_final_score NUMERIC := 0.00;
    v_cur_crit_ded NUMERIC;
    v_allowed_crit NUMERIC;
    v_field_score NUMERIC;
BEGIN
    SELECT * INTO v_rubric FROM public.rubric_versions WHERE id = p_rubric_version_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rubrik penilaian tidak ditemukan di database.';
    END IF;

    FOR v_field IN
        SELECT * FROM public.rubric_fields
        WHERE rubric_version_id = p_rubric_version_id
          AND status = 'Aktif'
        ORDER BY field_order ASC
    LOOP
        v_field_deductions := jsonb_set(v_field_deductions, ARRAY[v_field.name], '0'::jsonb);
        v_field_scores := jsonb_set(v_field_scores, ARRAY[v_field.name], to_jsonb(v_field.max_score));
    END LOOP;

    IF p_error_counts IS NOT NULL AND jsonb_typeof(p_error_counts) = 'object' THEN
        FOR v_cat_key, v_count_val IN
            SELECT key, value #>> '{}' FROM jsonb_each(p_error_counts)
        LOOP
            IF v_count_val IS NULL OR TRIM(v_count_val) = '' THEN
                CONTINUE;
            END IF;

            IF NOT (v_count_val ~ '^[0-9]+$') THEN
                RAISE EXCEPTION 'Jumlah kejadian kesalahan kategori % wajib berupa bilangan bulat non-negatif.', v_cat_key;
            END IF;

            v_count := v_count_val::numeric;
            IF v_count <= 0 THEN
                CONTINUE;
            END IF;

            SELECT * INTO v_cat
            FROM public.error_categories
            WHERE tenant_id = p_tenant_id
              AND (id::text = v_cat_key OR code = v_cat_key)
              AND status = 'Aktif'
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Kategori kesalahan % tidak ditemukan atau tidak berstatus aktif pada tenant ini.', v_cat_key;
            END IF;

            v_target_field_name := NULL;
            IF v_cat.rubric_field_id IS NOT NULL THEN
                SELECT name INTO v_target_field_name
                FROM public.rubric_fields
                WHERE id = v_cat.rubric_field_id
                  AND rubric_version_id = p_rubric_version_id
                  AND status = 'Aktif';
            END IF;

            IF v_target_field_name IS NULL AND v_cat.criterion_id IS NOT NULL THEN
                SELECT rf.name INTO v_target_field_name
                FROM public.rubric_criteria rc
                JOIN public.rubric_fields rf ON rf.id = rc.rubric_field_id
                WHERE rc.id = v_cat.criterion_id
                  AND rf.rubric_version_id = p_rubric_version_id
                  AND rf.status = 'Aktif';
            END IF;

            IF v_target_field_name IS NULL AND v_cat.deduction_rule_id IS NOT NULL THEN
                SELECT rf.name INTO v_target_field_name
                FROM public.deduction_rules dr
                JOIN public.rubric_criteria rc ON rc.id = dr.criterion_id
                JOIN public.rubric_fields rf ON rf.id = rc.rubric_field_id
                WHERE dr.id = v_cat.deduction_rule_id
                  AND rf.rubric_version_id = p_rubric_version_id
                  AND rf.status = 'Aktif';
            END IF;

            IF v_target_field_name IS NULL THEN
                SELECT name INTO v_target_field_name
                FROM public.rubric_fields
                WHERE rubric_version_id = p_rubric_version_id
                  AND status = 'Aktif'
                  AND (
                      LOWER(name) = LOWER(v_cat.name)
                      OR LOWER(code) = LOWER(v_cat.code)
                      OR (v_cat.scope IS NOT NULL AND LOWER(name) = LOWER(v_cat.scope))
                  )
                LIMIT 1;
            END IF;

            IF v_target_field_name IS NULL AND (v_rubric.code = 'RUBRIC-SENI-BACA-2025' OR v_rubric.name ILIKE '%Seni Baca%') THEN
                IF v_cat.name ILIKE '%tajwid%' OR v_cat.name ILIKE '%makharij%' OR v_cat.code IN ('tjw', 'mkh', 'idg') OR COALESCE(v_cat.scope, '') ILIKE '%tajwid%' THEN
                    v_target_field_name := 'Tajwid';
                ELSIF v_cat.name ILIKE '%fashahah%' OR v_cat.name ILIKE '%fasahah%' OR v_cat.name ILIKE '%waqf%' OR v_cat.code = 'fsh' OR COALESCE(v_cat.scope, '') ILIKE '%fashahah%' THEN
                    v_target_field_name := 'Fashahah';
                ELSIF v_cat.name ILIKE '%lagu%' OR v_cat.name ILIKE '%irama%' OR v_cat.code IN ('lag', 'lgu') OR COALESCE(v_cat.scope, '') ILIKE '%lagu%' THEN
                    v_target_field_name := 'Lagu';
                ELSIF v_cat.name ILIKE '%suara%' OR v_cat.name ILIKE '%vokal%' OR v_cat.code IN ('sua', 'sur') OR COALESCE(v_cat.scope, '') ILIKE '%suara%' THEN
                    v_target_field_name := 'Suara';
                END IF;
            END IF;

            IF v_target_field_name IS NULL THEN
                RAISE EXCEPTION 'Kategori kesalahan "%" belum terpetakan ke bidang rubrik aktif pada rubrik "%". Dilarang fallback ke bidang lain.', v_cat.name, v_rubric.name;
            END IF;

            v_unit_deduction := v_cat.default_deduction;
            v_raw_deduction := ROUND(v_count * v_unit_deduction, 2);

            IF v_cat.deduction_rule_id IS NOT NULL THEN
                SELECT dr.deduction_points, dr.max_deduction
                INTO v_rule_deduction_points, v_rule_max_deduction
                FROM public.deduction_rules dr
                WHERE dr.id = v_cat.deduction_rule_id;

                IF FOUND THEN
                    IF v_rule_deduction_points IS NOT NULL THEN
                        v_unit_deduction := v_rule_deduction_points;
                        v_raw_deduction := ROUND(v_count * v_unit_deduction, 2);
                    END IF;
                    IF v_rule_max_deduction IS NOT NULL AND v_rule_max_deduction >= 0 THEN
                        v_raw_deduction := LEAST(v_raw_deduction, v_rule_max_deduction);
                    END IF;
                END IF;
            END IF;

            IF v_cat.max_deduction IS NOT NULL AND v_cat.max_deduction >= 0 THEN
                v_raw_deduction := LEAST(v_raw_deduction, v_cat.max_deduction);
            END IF;

            IF v_cat.criterion_id IS NOT NULL THEN
                SELECT rc.id, rc.max_deduction
                INTO v_crit_id, v_crit_max_deduction
                FROM public.rubric_criteria rc
                WHERE rc.id = v_cat.criterion_id;

                IF FOUND AND v_crit_max_deduction IS NOT NULL AND v_crit_max_deduction >= 0 THEN
                    v_cur_crit_ded := COALESCE((v_crit_deductions ->> v_crit_id::text)::numeric, 0.00);
                    v_allowed_crit := GREATEST(0.00, v_crit_max_deduction - v_cur_crit_ded);
                    v_raw_deduction := LEAST(v_raw_deduction, v_allowed_crit);
                    v_crit_deductions := jsonb_set(
                        v_crit_deductions,
                        ARRAY[v_crit_id::text],
                        to_jsonb(ROUND(v_cur_crit_ded + v_raw_deduction, 2))
                    );
                END IF;
            END IF;

            v_deductions := jsonb_set(v_deductions, ARRAY[v_cat_key], to_jsonb(v_raw_deduction));

            v_deduction := COALESCE((v_field_deductions ->> v_target_field_name)::numeric, 0.00) + v_raw_deduction;
            v_field_deductions := jsonb_set(v_field_deductions, ARRAY[v_target_field_name], to_jsonb(ROUND(v_deduction, 2)));
        END LOOP;
    END IF;

    v_total_deductions := 0.00;
    v_final_score := 0.00;

    FOR v_field IN
        SELECT * FROM public.rubric_fields
        WHERE rubric_version_id = p_rubric_version_id
          AND status = 'Aktif'
        ORDER BY field_order ASC
    LOOP
        v_deduction := COALESCE((v_field_deductions ->> v_field.name)::numeric, 0.00);
        v_field_max_deduction := COALESCE(v_field.max_deduction, (v_field.max_score - v_field.min_score));
        v_deduction := LEAST(v_deduction, v_field_max_deduction);
        v_deduction := ROUND(v_deduction, 2);

        v_field_score := GREATEST(v_field.min_score, LEAST(v_field.max_score, v_field.max_score - v_deduction));
        v_field_score := ROUND(v_field_score, 2);

        v_field_scores := jsonb_set(v_field_scores, ARRAY[v_field.name], to_jsonb(v_field_score));
        v_field_deductions := jsonb_set(v_field_deductions, ARRAY[v_field.name], to_jsonb(v_deduction));

        v_total_deductions := v_total_deductions + v_deduction;
        v_final_score := v_final_score + ROUND(v_field_score * COALESCE(v_field.weight, 1), 2);
    END LOOP;

    v_total_deductions := ROUND(v_total_deductions, 2);
    v_final_score := ROUND(v_final_score, 2);

    RETURN jsonb_build_object(
        'final_score', v_final_score,
        'total_deductions', v_total_deductions,
        'field_scores', v_field_scores,
        'field_deductions', v_field_deductions,
        'deductions', v_deductions
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) TO authenticated;

-- 2.1 Fungsi pembantu get_field_score: mengenali alias kode/nama dan mengembalikan NULL jika tidak ada/bukan angka
CREATE OR REPLACE FUNCTION public.get_field_score(
    p_field_scores JSONB,
    p_field_name TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_name TEXT;
    v_upper_name TEXT;
    v_raw_val TEXT;
    v_key TEXT;
    v_val TEXT;
BEGIN
    IF p_field_scores IS NULL OR jsonb_typeof(p_field_scores) <> 'object' OR p_field_name IS NULL THEN
        RETURN NULL;
    END IF;

    v_clean_name := TRIM(p_field_name);
    IF v_clean_name = '' THEN
        RETURN NULL;
    END IF;

    v_upper_name := UPPER(v_clean_name);

    -- 1. Akses langsung nama persis
    v_raw_val := p_field_scores ->> v_clean_name;

    -- 2. Alias standar MTQ (kode <-> nama)
    IF v_raw_val IS NULL THEN
        CASE v_upper_name
            WHEN 'TAJWID', 'TJW' THEN
                v_raw_val := COALESCE(p_field_scores ->> 'Tajwid', p_field_scores ->> 'TJW', p_field_scores ->> 'tajwid', p_field_scores ->> 'tjw');
            WHEN 'FASHAHAH', 'FSH' THEN
                v_raw_val := COALESCE(p_field_scores ->> 'Fashahah', p_field_scores ->> 'FSH', p_field_scores ->> 'fashahah', p_field_scores ->> 'fsh');
            WHEN 'LAGU', 'LGU', 'LAG' THEN
                v_raw_val := COALESCE(p_field_scores ->> 'Lagu', p_field_scores ->> 'LGU', p_field_scores ->> 'LAG', p_field_scores ->> 'lagu', p_field_scores ->> 'lgu', p_field_scores ->> 'lag');
            WHEN 'SUARA', 'SUR', 'SUA' THEN
                v_raw_val := COALESCE(p_field_scores ->> 'Suara', p_field_scores ->> 'SUR', p_field_scores ->> 'SUA', p_field_scores ->> 'suara', p_field_scores ->> 'sur', p_field_scores ->> 'sua');
            WHEN 'TAHFIZH', 'THF' THEN
                v_raw_val := COALESCE(p_field_scores ->> 'Tahfizh', p_field_scores ->> 'THF', p_field_scores ->> 'tahfizh', p_field_scores ->> 'thf');
            WHEN 'ITQAN', 'ITQ' THEN
                v_raw_val := COALESCE(p_field_scores ->> 'Itqan', p_field_scores ->> 'ITQ', p_field_scores ->> 'itqan', p_field_scores ->> 'itq');
            ELSE
                NULL;
        END CASE;
    END IF;

    -- 3. Pencarian case-insensitive pada key JSONB
    IF v_raw_val IS NULL THEN
        FOR v_key, v_val IN SELECT key, value #>> '{}' FROM jsonb_each(p_field_scores)
        LOOP
            IF UPPER(TRIM(v_key)) = v_upper_name THEN
                v_raw_val := v_val;
                EXIT;
            END IF;
        END LOOP;
    END IF;

    IF v_raw_val IS NULL OR NOT (TRIM(v_raw_val) ~ '^-?[0-9]+(\.[0-9]+)?$') THEN
        RETURN NULL;
    END IF;

    RETURN TRIM(v_raw_val)::numeric;
END;
$$;

-- Fungsi pembantu compare_tie_vectors: membandingkan dua vektor nilai (total + seluruh kriteria tie-break)
-- dengan semantik DESC NULLS LAST pada setiap elemen.
-- Mengembalikan:
--   -1 jika p_vec_a lebih unggul dari p_vec_b
--    1 jika p_vec_b lebih unggul dari p_vec_a
--    0 jika seluruh elemen identik (IS NOT DISTINCT FROM)
CREATE OR REPLACE FUNCTION public.compare_tie_vectors(
    p_vec_a NUMERIC[],
    p_vec_b NUMERIC[]
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_len INT;
    v_i INT;
    v_a NUMERIC;
    v_b NUMERIC;
BEGIN
    v_len := GREATEST(COALESCE(array_length(p_vec_a, 1), 0), COALESCE(array_length(p_vec_b, 1), 0));
    IF v_len = 0 THEN
        RETURN 0;
    END IF;

    FOR v_i IN 1..v_len LOOP
        v_a := p_vec_a[v_i];
        v_b := p_vec_b[v_i];

        IF v_a IS NULL AND v_b IS NULL THEN
            CONTINUE;
        ELSIF v_a IS NOT NULL AND v_b IS NULL THEN
            RETURN -1; -- NULLS LAST: nilai valid mengalahkan NULL
        ELSIF v_a IS NULL AND v_b IS NOT NULL THEN
            RETURN 1;  -- NULLS LAST: NULL kalah terhadap nilai valid
        ELSIF v_a > v_b THEN
            RETURN -1;
        ELSIF v_a < v_b THEN
            RETURN 1;
        END IF;
    END LOOP;

    RETURN 0;
END;
$$;

-- 2.1 Fungsi Otoritatif Server: compute_stage_rankings(p_stage_id UUID)
CREATE OR REPLACE FUNCTION public.compute_stage_rankings(p_stage_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_rule RECORD;
    v_has_rule BOOLEAN := false;
    v_active_rules_count INT := 0;
    v_tie_break_fields TEXT[];
    v_rubric_version_id UUID := NULL;
    v_has_custom_weights BOOLEAN := false;
    v_required_judge_count INT := 0;
    v_rankings JSONB := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan.';
    END IF;

    IF NOT (public.is_superadmin() OR v_stage.tenant_id IN (SELECT public.get_user_tenants())) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki akses ke tenant babak ini.';
    END IF;

    -- Deteksi konflik apabila terdapat >1 aturan kompetisi berstatus 'Aktif' untuk cakupan cabang yang sama
    SELECT COUNT(*) INTO v_active_rules_count
    FROM public.competition_rule_configs crc
    WHERE crc.tenant_id = v_stage.tenant_id
      AND crc.status = 'Aktif'
      AND (
          (v_stage.branch_id IS NOT NULL AND crc.branch_id = v_stage.branch_id)
          OR (v_stage.branch_id IS NULL AND crc.branch_id IS NULL)
      );

    IF v_active_rules_count > 1 THEN
        RAISE EXCEPTION 'Konflik konfigurasi aturan kompetisi: Ditemukan % aturan berstatus Aktif untuk cabang pada babak ini.', v_active_rules_count;
    END IF;

    SELECT * INTO v_rule
    FROM public.competition_rule_configs crc
    WHERE crc.tenant_id = v_stage.tenant_id
      AND crc.status = 'Aktif'
      AND (v_stage.branch_id IS NULL OR crc.branch_id = v_stage.branch_id OR crc.branch_id IS NULL)
    ORDER BY
        CASE WHEN v_stage.branch_id IS NOT NULL AND crc.branch_id = v_stage.branch_id THEN 0 ELSE 1 END ASC,
        crc.updated_at DESC,
        crc.created_at DESC
    LIMIT 1;

    v_has_rule := FOUND;

    IF v_has_rule AND v_rule.tie_break_order IS NOT NULL THEN
        SELECT COALESCE(
            ARRAY(
                SELECT TRIM(elem)
                FROM unnest(v_rule.tie_break_order) WITH ORDINALITY AS t(elem, ord)
                WHERE LOWER(TRIM(elem)) <> 'total' AND TRIM(elem) <> ''
                ORDER BY ord ASC
            ),
            ARRAY['Tajwid', 'Lagu', 'Fashahah', 'Suara']
        ) INTO v_tie_break_fields;
        v_rubric_version_id := v_rule.rubric_version_id;
    ELSE
        v_tie_break_fields := ARRAY['Tajwid', 'Lagu', 'Fashahah', 'Suara'];
    END IF;

    IF v_rubric_version_id IS NULL THEN
        SELECT jass.rubric_version_id INTO v_rubric_version_id
        FROM public.stage_participations sp
        JOIN public.judge_assessments jass ON jass.stage_participation_id = sp.id
        WHERE sp.stage_id = p_stage_id AND sp.tenant_id = v_stage.tenant_id
        LIMIT 1;
    END IF;

    IF v_rubric_version_id IS NULL THEN
        SELECT rv.id INTO v_rubric_version_id
        FROM public.rubric_versions rv
        WHERE rv.tenant_id = v_stage.tenant_id AND rv.status = 'Aktif'
        ORDER BY CASE WHEN v_stage.branch_id IS NOT NULL AND rv.branch_id = v_stage.branch_id THEN 0 ELSE 1 END ASC
        LIMIT 1;
    END IF;

    IF v_rubric_version_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.rubric_fields rf
            WHERE rf.rubric_version_id = v_rubric_version_id
              AND rf.status = 'Aktif'
              AND COALESCE(rf.weight, 1) <> 1
        ) INTO v_has_custom_weights;
    END IF;

    -- Hitung jumlah hakim aktif yang sah (judge_assignments.status = 'Aktif' DAN tenant_memberships.status = 'Aktif')
    SELECT COUNT(DISTINCT ja.judge_profile_id) INTO v_required_judge_count
    FROM public.judge_assignments ja
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ja.tenant_id
     AND tm.profile_id = ja.judge_profile_id
     AND tm.status = 'Aktif'
    WHERE ja.tenant_id = v_stage.tenant_id
      AND ja.stage_id = p_stage_id
      AND ja.status = 'Aktif'
      AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id);

    WITH active_judges AS (
        SELECT DISTINCT ja.judge_profile_id
        FROM public.judge_assignments ja
        JOIN public.tenant_memberships tm
          ON tm.tenant_id = ja.tenant_id
         AND tm.profile_id = ja.judge_profile_id
         AND tm.status = 'Aktif'
        WHERE ja.tenant_id = v_stage.tenant_id
          AND ja.stage_id = p_stage_id
          AND ja.status = 'Aktif'
          AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
    ),
    valid_assessments AS (
        SELECT jass.*
        FROM public.judge_assessments jass
        JOIN active_judges aj ON aj.judge_profile_id = jass.judge_profile_id
        WHERE jass.tenant_id = v_stage.tenant_id
          AND jass.status = 'finalized'
          AND jass.is_locked = true
    ),
    participant_agg AS (
        SELECT
            sp.id AS stage_participation_id,
            sp.participant_id,
            p.name AS participant_name,
            sp.lottery_number,
            COALESCE(k.name, '-') AS kafilah_name,
            COALESCE(v_stage.branch_id, p.branch_id) AS branch_id,
            COALESCE(b.name, 'Semua Cabang') AS branch_name,
            (
                SELECT COUNT(*) FROM public.assigned_maqras am
                WHERE am.stage_participation_id = sp.id
            )::int AS maqra_count,
            (
                SELECT COUNT(*)
                FROM public.assigned_maqras am
                JOIN valid_assessments va
                  ON va.stage_participation_id = sp.id
                 AND va.assigned_maqra_id = am.id
                WHERE am.stage_participation_id = sp.id
            )::int AS finalized_units_count,
            (
                SELECT COUNT(DISTINCT va.judge_profile_id)
                FROM valid_assessments va
                WHERE va.stage_participation_id = sp.id
            )::int AS finalized_judge_count,
            (
                SELECT CASE
                    WHEN COUNT(va.id) = 0 THEN NULL
                    WHEN v_has_custom_weights AND v_rubric_version_id IS NOT NULL THEN
                        COALESCE(
                            (
                                SELECT ROUND(SUM(field_avg * COALESCE(rf.weight, 1)), 2)
                                FROM public.rubric_fields rf
                                CROSS JOIN LATERAL (
                                    SELECT AVG(public.get_field_score(va2.field_scores, rf.name)) AS field_avg
                                    FROM valid_assessments va2
                                    WHERE va2.stage_participation_id = sp.id
                                ) fa
                                WHERE rf.rubric_version_id = v_rubric_version_id
                                  AND rf.status = 'Aktif'
                                  AND fa.field_avg IS NOT NULL
                            ),
                            ROUND(AVG(va.final_score)::numeric, 2)
                        )
                    ELSE
                        ROUND(AVG(va.final_score)::numeric, 2)
                END
                FROM valid_assessments va
                WHERE va.stage_participation_id = sp.id
            ) AS computed_score,
            (
                SELECT COALESCE(
                    jsonb_object_agg(fname, fval) FILTER (WHERE fval IS NOT NULL),
                    '{}'::jsonb
                )
                FROM (
                    SELECT DISTINCT fname
                    FROM (
                        SELECT rf.name AS fname
                        FROM public.rubric_fields rf
                        WHERE rf.rubric_version_id = v_rubric_version_id
                          AND rf.status = 'Aktif'
                        UNION
                        SELECT unnest(v_tie_break_fields) AS fname
                    ) fn
                    WHERE fname IS NOT NULL AND TRIM(fname) <> ''
                ) all_fields
                CROSS JOIN LATERAL (
                    SELECT ROUND(AVG(public.get_field_score(va.field_scores, all_fields.fname)), 2) AS fval
                    FROM valid_assessments va
                    WHERE va.stage_participation_id = sp.id
                ) calc
            ) AS field_scores
        FROM public.stage_participations sp
        JOIN public.participants p ON p.id = sp.participant_id
        LEFT JOIN public.kafilahs k ON k.id = p.kafilah_id
        LEFT JOIN public.branches b ON b.id = COALESCE(v_stage.branch_id, p.branch_id)
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = v_stage.tenant_id
    ),
    participant_vectors AS (
        SELECT
            pa.*,
            (
                pa.maqra_count >= 1
                AND v_required_judge_count >= 1
                AND pa.finalized_units_count = (pa.maqra_count * v_required_judge_count)
            ) AS is_complete,
            CASE
                WHEN pa.computed_score IS NULL THEN NULL::numeric[]
                ELSE ARRAY[pa.computed_score] || COALESCE(
                    ARRAY(
                        SELECT (
                            SELECT ROUND(AVG(public.get_field_score(va.field_scores, crit_name)), 2)
                            FROM valid_assessments va
                            WHERE va.stage_participation_id = pa.stage_participation_id
                        )
                        FROM unnest(v_tie_break_fields) WITH ORDINALITY AS t(crit_name, ord)
                        ORDER BY ord ASC
                    ),
                    ARRAY[]::numeric[]
                )
            END AS tie_vector
        FROM participant_agg pa
    ),
    ranked_participants AS (
        SELECT
            pv.*,
            CASE
                WHEN pv.computed_score IS NULL THEN NULL::int
                ELSE (
                    1 + (
                        SELECT COUNT(*)
                        FROM participant_vectors other
                        WHERE other.computed_score IS NOT NULL
                          AND other.participant_id <> pv.participant_id
                          AND public.compare_tie_vectors(other.tie_vector, pv.tie_vector) < 0
                    )
                )::int
            END AS true_rank,
            CASE
                WHEN pv.computed_score IS NULL THEN false
                ELSE EXISTS (
                    SELECT 1
                    FROM participant_vectors other
                    WHERE other.computed_score IS NOT NULL
                      AND other.participant_id <> pv.participant_id
                      AND public.compare_tie_vectors(pv.tie_vector, other.tie_vector) = 0
                )
            END AS is_tied,
            CASE
                WHEN pv.computed_score IS NULL THEN false
                ELSE EXISTS (
                    SELECT 1
                    FROM participant_vectors other
                    WHERE other.computed_score IS NOT NULL
                      AND other.participant_id <> pv.participant_id
                      AND other.computed_score = pv.computed_score
                )
            END AS has_same_total_score
        FROM participant_vectors pv
    ),
    ordered_participants AS (
        SELECT
            rp.*,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE WHEN rp.computed_score IS NULL THEN 1 ELSE 0 END ASC,
                    rp.true_rank ASC NULLS LAST,
                    rp.lottery_number ASC NULLS LAST,
                    rp.participant_id ASC
            )::int AS display_order
        FROM ranked_participants rp
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'stage_participation_id', op.stage_participation_id,
                'participant_id', op.participant_id,
                'participant_name', op.participant_name,
                'lottery_number', op.lottery_number,
                'kafilah_name', op.kafilah_name,
                'branch_id', op.branch_id,
                'branch_name', op.branch_name,
                'computed_score', op.computed_score,
                'final_score', op.computed_score,
                'field_scores', op.field_scores,
                'tie_vector', to_jsonb(op.tie_vector),
                'rank', op.true_rank,
                'display_order', op.display_order,
                'is_tied', op.is_tied,
                'has_same_total_score', op.has_same_total_score,
                'is_complete', op.is_complete,
                'finalized_judge_count', op.finalized_judge_count,
                'required_judge_count', v_required_judge_count,
                'tie_break_note', CASE
                    WHEN op.is_tied THEN 'Nilai seri identik pada seluruh kriteria bidang (Perlu Keputusan Sidang Pleno / Resolusi Seri)'
                    WHEN op.has_same_total_score THEN 'Diselesaikan melalui urutan tie-break resmi (' || array_to_string(v_tie_break_fields, ' > ') || ')'
                    ELSE NULL
                END
            )
            ORDER BY op.display_order ASC
        ),
        '[]'::jsonb
    ) INTO v_rankings
    FROM ordered_participants op;

    RETURN jsonb_build_object(
        'stage_id', v_stage.id,
        'tenant_id', v_stage.tenant_id,
        'branch_id', v_stage.branch_id,
        'qualification_quota', v_stage.qualification_quota,
        'champion_count', COALESCE(v_stage.champion_count, 3),
        'rubric_version_id', v_rubric_version_id,
        'tie_break_order', CASE
            WHEN v_has_rule AND v_rule.tie_break_order IS NOT NULL THEN to_jsonb(v_rule.tie_break_order)
            ELSE to_jsonb(ARRAY['total'] || v_tie_break_fields)
        END,
        'required_judge_count', v_required_judge_count,
        'all_finalized', (
            v_required_judge_count >= 1
            AND jsonb_array_length(v_rankings) > 0
            AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(v_rankings) elem
                WHERE COALESCE((elem ->> 'is_complete')::boolean, false) = false
            )
        ),
        'can_finalize', (
            v_required_judge_count >= 1
            AND jsonb_array_length(v_rankings) > 0
            AND NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(v_rankings) elem
                WHERE COALESCE((elem ->> 'is_complete')::boolean, false) = false
            )
        ),
        'rankings', v_rankings
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) TO authenticated;

-- 2.2, 2.3, 2.4, 2.5 Perbarui advance_stage_qualifiers:
--   - Gunakan compute_stage_rankings sebagai sumber tunggal kebenaran
--   - Tolak seri di batas kuota (non-final) atau podium juara (final) kecuali diselesaikan lewat p_tie_resolution + p_override_reasons
--   - Pisahkan qualification_quota (babak non-final) dan champion_count (babak final, Juara 1..N tanpa Juara Harapan)
--   - Set status peserta gugur di babak non-final menjadi 'Gugur'
--   - Simpan stage_result_snapshots selalu meskipun branch_id IS NULL
DROP FUNCTION IF EXISTS public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.advance_stage_qualifiers(
    p_stage_id UUID,
    p_next_stage_id UUID,
    p_qualified_participant_ids UUID[],
    p_override_reasons JSONB DEFAULT '{}'::jsonb,
    p_rankings_snapshot JSONB DEFAULT '[]'::jsonb,
    p_tie_resolution JSONB DEFAULT '{}'::jsonb
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
    v_next_stage public.stages%ROWTYPE;
    v_override_key TEXT;
    v_override_val TEXT;
    v_participation_count INT;
    v_qualified_count INT;
    v_assigned_judges_count INT;
    v_unassigned_maqra_count INT;
    v_incomplete_count INT;
    v_invalid_participant_count INT;
    v_unjustified_override_count INT;
    v_unresolved_critical_tie_count INT := 0;
    v_computed_data JSONB;
    v_rankings_arr JSONB;
    v_rubric_version_id UUID;
    v_tie_break_rule_used TEXT;
    v_champion_count INT;
    v_authoritative_snapshot JSONB;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Validasi sesi autentikasi
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    -- 2. Validasi babak asal ada dan belum difinalisasi
    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Babak ini sudah pernah difinalisasi sebelumnya.';
    END IF;

    -- 3. Validasi hak akses admin pada tenant terkait
    IF NOT public.is_tenant_admin(v_stage.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki wewenang administrator pada tenant ini.';
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;

    -- 4. Pastikan terdapat peserta terdaftar pada babak ini
    SELECT COUNT(*) INTO v_participation_count
    FROM public.stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    IF v_participation_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Tidak ada peserta terdaftar pada babak ini.';
    END IF;

    v_qualified_count := COALESCE(array_length(p_qualified_participant_ids, 1), 0);
    v_champion_count := GREATEST(1, COALESCE(v_stage.champion_count, 3));

    -- 5. Validasi kuota kelulusan (hanya membatasi pelolosan pada babak non-final)
    IF p_next_stage_id IS NOT NULL THEN
        IF v_stage.qualification_quota <= 0 THEN
            RAISE EXCEPTION 'Kuota kelulusan pada babak ini tidak valid.';
        END IF;
        IF v_qualified_count > v_stage.qualification_quota THEN
            RAISE EXCEPTION 'Jumlah peserta yang diloloskan (%) melebihi kuota babak (%).', v_qualified_count, v_stage.qualification_quota;
        END IF;
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

    -- 7. Validasi bahwa penugasan majelis hakim resmi tersedia dan aktif di tenant_memberships
    SELECT COUNT(DISTINCT ja.judge_profile_id) INTO v_assigned_judges_count
    FROM public.judge_assignments ja
    JOIN public.tenant_memberships tm
      ON tm.tenant_id = ja.tenant_id
     AND tm.profile_id = ja.judge_profile_id
     AND tm.status = 'Aktif'
    WHERE ja.tenant_id = v_stage.tenant_id
      AND ja.stage_id = p_stage_id
      AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
      AND ja.status = 'Aktif';

    IF v_assigned_judges_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Belum ada penugasan majelis hakim resmi (judge_assignments) yang aktif pada babak ini.';
    END IF;

    -- 8. Validasi seluruh peserta yang diloloskan berasal dari babak & cabang yang benar
    IF v_qualified_count > 0 THEN
        SELECT COUNT(*) INTO v_invalid_participant_count
        FROM unnest(p_qualified_participant_ids) AS q_pid
        LEFT JOIN public.stage_participations sp
               ON sp.participant_id = q_pid
              AND sp.stage_id = p_stage_id
              AND sp.tenant_id = v_stage.tenant_id
        LEFT JOIN public.participants p
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
    FROM public.stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id
      AND NOT EXISTS (
          SELECT 1 FROM public.assigned_maqras am
          WHERE am.stage_participation_id = sp.id
            AND am.tenant_id = v_stage.tenant_id
      );

    IF v_unassigned_maqra_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Masih terdapat % peserta yang belum memiliki penetapan maqra pada babak ini.', v_unassigned_maqra_count;
    END IF;

    -- 10. Validasi seluruh kombinasi (peserta x assigned_maqras x hakim bertugas aktif) telah berstatus finalized & terkunci
    SELECT COUNT(*) INTO v_incomplete_count
    FROM public.stage_participations sp
    JOIN public.assigned_maqras am
      ON am.stage_participation_id = sp.id
     AND am.tenant_id = sp.tenant_id
    CROSS JOIN (
        SELECT DISTINCT ja.judge_profile_id
        FROM public.judge_assignments ja
        JOIN public.tenant_memberships tm
          ON tm.tenant_id = ja.tenant_id
         AND tm.profile_id = ja.judge_profile_id
         AND tm.status = 'Aktif'
        WHERE ja.tenant_id = v_stage.tenant_id
          AND ja.stage_id = p_stage_id
          AND (v_stage.branch_id IS NULL OR ja.branch_id IS NULL OR ja.branch_id = v_stage.branch_id)
          AND ja.status = 'Aktif'
    ) req_judges
    LEFT JOIN public.judge_assessments jass
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
        SELECT * INTO v_next_stage FROM public.stages WHERE id = p_next_stage_id FOR UPDATE;
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

    -- Aktifkan flag transaksi resmi untuk stages, stage_result_snapshots, dan audit_logs
    PERFORM set_config('mtq.rpc_stage_finalize_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- 12A. Gunakan compute_stage_rankings(p_stage_id) sebagai sumber tunggal kebenaran peringkat & tie-break
    v_computed_data := public.compute_stage_rankings(p_stage_id);
    v_rankings_arr := COALESCE(v_computed_data -> 'rankings', '[]'::jsonb);
    v_rubric_version_id := NULLIF(v_computed_data ->> 'rubric_version_id', '')::uuid;
    SELECT COALESCE(string_agg(elem, ' > '), 'total > Tajwid > Lagu > Fashahah')
    INTO v_tie_break_rule_used
    FROM jsonb_array_elements_text(COALESCE(v_computed_data -> 'tie_break_order', '["total","Tajwid","Lagu","Fashahah"]'::jsonb)) AS elem;

    -- 12B. Deteksi seri identik (is_tied = true) pada batas kuota (non-final) atau podium juara (final)
    WITH parsed_rankings AS (
        SELECT
            (elem ->> 'stage_participation_id')::uuid AS stage_participation_id,
            (elem ->> 'participant_id')::uuid AS participant_id,
            elem ->> 'lottery_number' AS lottery_number,
            (elem ->> 'computed_score')::numeric AS computed_score,
            (elem ->> 'rank')::int AS true_rank,
            (elem ->> 'display_order')::int AS display_order,
            COALESCE((elem ->> 'is_tied')::boolean, false) AS is_tied
        FROM jsonb_array_elements(v_rankings_arr) AS elem
    ),
    tie_groups AS (
        SELECT
            pr.true_rank,
            COUNT(*) AS group_size,
            MIN(pr.display_order) AS min_order,
            MAX(pr.display_order) AS max_order,
            BOOL_OR(
                p_tie_resolution IS NOT NULL
                AND jsonb_typeof(p_tie_resolution) = 'object'
                AND (p_tie_resolution ? pr.participant_id::text)
            ) AS has_tie_resolution,
            BOOL_OR(
                p_override_reasons IS NOT NULL
                AND jsonb_typeof(p_override_reasons) = 'object'
                AND LENGTH(TRIM(COALESCE(p_override_reasons ->> pr.participant_id::text, ''))) >= 5
            ) AS has_override_reason
        FROM parsed_rankings pr
        WHERE pr.is_tied = true
        GROUP BY pr.true_rank
    )
    SELECT COUNT(*) INTO v_unresolved_critical_tie_count
    FROM tie_groups tg
    WHERE (
        (p_next_stage_id IS NOT NULL AND tg.min_order <= v_stage.qualification_quota AND tg.max_order > v_stage.qualification_quota)
        OR
        (p_next_stage_id IS NULL AND tg.true_rank <= v_champion_count)
    )
    AND NOT (tg.has_tie_resolution AND tg.has_override_reason);

    IF v_unresolved_critical_tie_count > 0 THEN
        RAISE EXCEPTION 'UNRESOLVED_CRITICAL_TIE: Pengesahan babak diblokir: Terjadi nilai seri identik pada seluruh kriteria tie-break di batas kuota atau podium juara. Keputusan wajib menyertakan resolusi seri (p_tie_resolution) dan alasan override resmi (p_override_reasons minimal 5 karakter).';
    END IF;

    -- 12C. Tetapkan final_score dan rank ke stage_participations (dengan memperhitungkan p_tie_resolution bila seri telah diselesaikan)
    WITH parsed_rankings AS (
        SELECT
            (elem ->> 'stage_participation_id')::uuid AS stage_participation_id,
            (elem ->> 'participant_id')::uuid AS participant_id,
            elem ->> 'lottery_number' AS lottery_number,
            (elem ->> 'computed_score')::numeric AS computed_score,
            (elem ->> 'rank')::int AS true_rank,
            (elem ->> 'display_order')::int AS display_order,
            COALESCE((elem ->> 'is_tied')::boolean, false) AS is_tied
        FROM jsonb_array_elements(v_rankings_arr) AS elem
    ),
    resolved_order AS (
        SELECT
            pr.stage_participation_id,
            pr.participant_id,
            pr.computed_score,
            pr.true_rank,
            pr.is_tied,
            ROW_NUMBER() OVER (
                ORDER BY
                    pr.true_rank ASC NULLS LAST,
                    CASE
                        WHEN pr.is_tied
                             AND p_tie_resolution IS NOT NULL
                             AND jsonb_typeof(p_tie_resolution) = 'object'
                             AND (p_tie_resolution ->> pr.participant_id::text) ~ '^[0-9]+(\.[0-9]+)?$'
                        THEN (p_tie_resolution ->> pr.participant_id::text)::numeric
                        ELSE NULL
                    END ASC NULLS LAST,
                    CASE
                        WHEN pr.is_tied
                             AND p_tie_resolution IS NOT NULL
                             AND jsonb_typeof(p_tie_resolution) = 'object'
                             AND LOWER(COALESCE(p_tie_resolution ->> pr.participant_id::text, '')) IN ('true', 'qualified', 'lolos', 'winner')
                        THEN 0
                        WHEN pr.is_tied AND (pr.participant_id = ANY(p_qualified_participant_ids))
                        THEN 0
                        ELSE 1
                    END ASC,
                    pr.display_order ASC
            )::int AS resolved_rank
        FROM parsed_rankings pr
    )
    UPDATE public.stage_participations sp
    SET final_score = ro.computed_score,
        rank = CASE
            WHEN ro.is_tied AND p_tie_resolution IS NOT NULL AND p_tie_resolution <> '{}'::jsonb THEN ro.resolved_rank
            ELSE ro.resolved_rank
        END
    FROM resolved_order ro
    WHERE sp.id = ro.stage_participation_id;

    -- 12D. Validasi 2 arah untuk override manual pada babak non-final (P1-06)
    IF p_next_stage_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_unjustified_override_count
        FROM public.stage_participations sp
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = v_stage.tenant_id
          AND (
              (sp.participant_id = ANY(p_qualified_participant_ids) AND sp.rank > v_stage.qualification_quota)
              OR
              (NOT (sp.participant_id = ANY(p_qualified_participant_ids)) AND sp.rank <= v_stage.qualification_quota)
          )
          AND LENGTH(TRIM(COALESCE(p_override_reasons ->> sp.participant_id::text, ''))) < 5;

        IF v_unjustified_override_count > 0 THEN
            RAISE EXCEPTION 'Pengesahan babak ditolak: Setiap perubahan kelulusan terhadap peringkat kuota (meloloskan di luar kuota atau menggugurkan di dalam kuota) wajib disertai alasan override minimal 5 karakter.';
        END IF;
    END IF;

    -- 12E. Perbarui status kelulusan / gelar juara pada stage_participations babak asal
    IF p_next_stage_id IS NOT NULL THEN
        UPDATE public.stage_participations sp
        SET is_qualified = (sp.participant_id = ANY(p_qualified_participant_ids)),
            champion_rank = NULL,
            champion_title = NULL,
            status = 'Lengkap',
            qualification_reason = COALESCE(
                NULLIF(TRIM(p_override_reasons ->> sp.participant_id::text), ''),
                CASE WHEN sp.participant_id = ANY(p_qualified_participant_ids) THEN 'Lolos Kuota Peringkat' ELSE 'Tidak Masuk Kuota' END
            ),
            finalized_at = v_now,
            updated_at = v_now
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = v_stage.tenant_id;
    ELSE
        -- Babak Final: tetapkan Juara 1..champion_count berdasarkan rank (tanpa memakai is_qualified sebagai penanda juara dan tanpa juara harapan)
        UPDATE public.stage_participations sp
        SET is_qualified = false,
            champion_rank = CASE WHEN sp.rank <= v_champion_count THEN sp.rank ELSE NULL END,
            champion_title = CASE WHEN sp.rank <= v_champion_count THEN 'Juara ' || sp.rank::text ELSE NULL END,
            status = 'Lengkap',
            qualification_reason = COALESCE(
                NULLIF(TRIM(p_override_reasons ->> sp.participant_id::text), ''),
                CASE
                    WHEN sp.rank <= v_champion_count THEN 'Juara ' || sp.rank::text
                    ELSE 'Finalis Peringkat ' || sp.rank::text
                END
            ),
            finalized_at = v_now,
            updated_at = v_now
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = v_stage.tenant_id;
    END IF;

    -- 13. Perbarui status participants sesuai hasil babak (2.4: peserta tidak lolos di babak non-final menjadi 'Gugur')
    UPDATE public.participants p
    SET status = CASE
        WHEN p_next_stage_id IS NOT NULL THEN
            CASE WHEN p.id = ANY(p_qualified_participant_ids) THEN 'Menunggu' ELSE 'Gugur' END
        ELSE 'Final'
    END,
    updated_at = v_now
    WHERE p.id IN (
        SELECT participant_id FROM public.stage_participations
        WHERE stage_id = p_stage_id AND tenant_id = v_stage.tenant_id
    );

    -- 14. Daftarkan peserta yang lolos ke babak selanjutnya secara idempoten
    IF p_next_stage_id IS NOT NULL AND v_qualified_count > 0 THEN
        INSERT INTO public.stage_participations (
            id,
            tenant_id,
            stage_id,
            participant_id,
            lottery_number,
            status,
            created_at,
            updated_at
        )
        SELECT
            gen_random_uuid(),
            v_stage.tenant_id,
            v_next_stage.id,
            q_pid,
            (SELECT lottery_number FROM public.participants WHERE id = q_pid),
            'Belum Dimulai',
            v_now,
            v_now
        FROM unnest(p_qualified_participant_ids) AS q_pid
        WHERE NOT EXISTS (
            SELECT 1 FROM public.stage_participations sp_exist
            WHERE sp_exist.stage_id = v_next_stage.id
              AND sp_exist.participant_id = q_pid
        );
    END IF;

    -- 15. Finalisasi babak asal di tabel stages
    UPDATE public.stages
    SET is_finalized = true,
        finalized_at = v_now,
        status = 'Selesai'
    WHERE id = p_stage_id;

    -- 16. Bekukan snapshot hasil resmi di stage_result_snapshots (2.5: selalu disimpan meski branch_id IS NULL)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'participant_id', sp.participant_id,
                'participantId', sp.participant_id,
                'participant_name', p.name,
                'participantName', p.name,
                'lottery_number', sp.lottery_number,
                'lotteryNumber', sp.lottery_number,
                'kafilah_name', COALESCE(k.name, '-'),
                'kafilahName', COALESCE(k.name, '-'),
                'branch_id', COALESCE(v_stage.branch_id, p.branch_id),
                'branchId', COALESCE(v_stage.branch_id, p.branch_id),
                'branch_name', COALESCE(b.name, 'Semua Cabang'),
                'branchName', COALESCE(b.name, 'Semua Cabang'),
                'stage_id', p_stage_id,
                'stageId', p_stage_id,
                'stage_name', v_stage.name,
                'stageName', v_stage.name,
                'final_score', sp.final_score,
                'totalScore', sp.final_score,
                'field_scores', COALESCE(r_elem -> 'field_scores', '{}'::jsonb),
                'fieldScores', COALESCE(r_elem -> 'field_scores', '{}'::jsonb),
                'rank', sp.rank,
                'is_qualified', sp.is_qualified,
                'isQualified', sp.is_qualified,
                'champion_rank', sp.champion_rank,
                'championRank', sp.champion_rank,
                'champion_title', sp.champion_title,
                'championTitle', sp.champion_title,
                'qualification_reason', sp.qualification_reason,
                'reason', sp.qualification_reason,
                'tieBreakResolvedBy', r_elem ->> 'tie_break_note'
            )
            ORDER BY sp.rank ASC, sp.lottery_number ASC
        ),
        '[]'::jsonb
    ) INTO v_authoritative_snapshot
    FROM public.stage_participations sp
    JOIN public.participants p ON p.id = sp.participant_id
    LEFT JOIN public.kafilahs k ON k.id = p.kafilah_id
    LEFT JOIN public.branches b ON b.id = COALESCE(v_stage.branch_id, p.branch_id)
    LEFT JOIN LATERAL (
        SELECT elem
        FROM jsonb_array_elements(v_rankings_arr) AS elem
        WHERE (elem ->> 'participant_id')::uuid = sp.participant_id
        LIMIT 1
    ) r_match(r_elem) ON true
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    INSERT INTO public.stage_result_snapshots (
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
        CASE WHEN p_next_stage_id IS NOT NULL THEN v_stage.qualification_quota ELSE v_champion_count END,
        v_rubric_version_id,
        v_tie_break_rule_used,
        v_actor_id,
        v_authoritative_snapshot
    )
    ON CONFLICT (tenant_id, stage_id) DO NOTHING;

    -- 17. Catat log audit permanen
    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (
        v_stage.tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'STAGE_FINALIZED',
        'Stage: ' || v_stage.name || ' (ID: ' || p_stage_id::text || ')',
        CASE
            WHEN p_next_stage_id IS NOT NULL THEN
                'Pengesahan resmi babak ' || v_stage.name || ' dengan ' || v_qualified_count::text || ' peserta diloloskan ke ' || COALESCE(v_next_stage.name, 'Babak Lanjutan')
            ELSE
                'Pengesahan resmi hasil kejuaraan babak final ' || v_stage.name || ' dengan ' || LEAST(v_participation_count, v_champion_count)::text || ' juara ditetapkan.'
        END,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Babak berhasil disahkan secara resmi dan peserta lolos telah dipindahkan.',
        'qualified_count', v_qualified_count,
        'champion_count', CASE WHEN p_next_stage_id IS NULL THEN LEAST(v_participation_count, v_champion_count) ELSE 0 END,
        'next_stage_id', p_next_stage_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) TO authenticated;

-- ==============================================================================
-- FASE 3 — VERIFIKASI BERKAS PESERTA & PENGACAKAN UNDIAN DI SERVER
-- ==============================================================================

-- 3.1 Status Verifikasi Berkas Peserta
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) NOT NULL DEFAULT 'Diajukan'
    CHECK (verification_status IN ('Diajukan', 'Diverifikasi', 'Ditolak')),
  ADD COLUMN IF NOT EXISTS verification_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS verified_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ NULL;

-- Backfill peserta lama yang sudah ada sebelum migrasi menjadi 'Diverifikasi'
UPDATE public.participants
SET verification_status = 'Diverifikasi',
    verified_at = COALESCE(verified_at, now())
WHERE verification_status = 'Diajukan';

CREATE OR REPLACE FUNCTION public.verify_participant(
    p_tenant_id UUID,
    p_participant_id UUID,
    p_status VARCHAR,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor RECORD;
    v_part public.participants%ROWTYPE;
    v_clean_note TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Tidak terautentikasi.';
    END IF;

    IF NOT (public.is_tenant_admin(p_tenant_id) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang berwenang memverifikasi berkas peserta.';
    END IF;

    IF p_status NOT IN ('Diajukan', 'Diverifikasi', 'Ditolak') THEN
        RAISE EXCEPTION 'Status verifikasi "%" tidak valid. Gunakan Diajukan, Diverifikasi, atau Ditolak.', p_status;
    END IF;

    v_clean_note := NULLIF(TRIM(COALESCE(p_note, '')), '');
    IF p_status = 'Ditolak' AND (v_clean_note IS NULL OR LENGTH(v_clean_note) < 3) THEN
        RAISE EXCEPTION 'VERIFICATION_NOTE_REQUIRED: Penolakan berkas peserta wajib menyertakan alasan penolakan (minimal 3 karakter).';
    END IF;

    SELECT * INTO v_part
    FROM public.participants
    WHERE id = p_participant_id AND tenant_id = p_tenant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Peserta tidak ditemukan pada tenant ini.';
    END IF;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    UPDATE public.participants
    SET verification_status = p_status,
        verification_note = v_clean_note,
        verified_by = v_actor_id,
        verified_at = now(),
        updated_at = now()
    WHERE id = p_participant_id
      AND tenant_id = p_tenant_id;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    SELECT name, role INTO v_actor FROM public.profiles WHERE id = v_actor_id;

    INSERT INTO public.audit_logs (
        tenant_id, actor_id, actor_name, action, target, summary, outcome
    ) VALUES (
        p_tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'PARTICIPANT_VERIFICATION_UPDATED',
        'Participant: ' || v_part.name || ' (' || v_part.participant_code || ')',
        'Status verifikasi berkas peserta diubah menjadi ' || p_status || COALESCE(' — Catatan: ' || v_clean_note, ''),
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'participant_id', p_participant_id,
        'verification_status', p_status,
        'verification_note', v_clean_note,
        'verified_by', v_actor_id,
        'verified_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_participant(UUID, UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_participant(UUID, UUID, VARCHAR, TEXT) TO authenticated;

-- 3.2 Kolom Seed Kriptografis & Mode Undian pada lottery_draw_logs + RPC draw_lottery_server
ALTER TABLE public.lottery_draw_logs
  ADD COLUMN IF NOT EXISTS seed_hex TEXT NULL,
  ADD COLUMN IF NOT EXISTS seed_sha256 TEXT NULL,
  ADD COLUMN IF NOT EXISTS draw_mode VARCHAR(30) NOT NULL DEFAULT 'both'
    CHECK (draw_mode IN ('lottery_number', 'maqra', 'both'));

CREATE OR REPLACE FUNCTION public.draw_lottery_server(
    p_tenant_id UUID,
    p_stage_id UUID,
    p_branch_id UUID DEFAULT NULL,
    p_level_id UUID DEFAULT NULL,
    p_questions_per_participant INT DEFAULT 1,
    p_draw_mode VARCHAR DEFAULT 'both',
    p_notes TEXT DEFAULT NULL,
    p_participant_ids UUID[] DEFAULT NULL,
    p_question_pool_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_profile RECORD;
    v_actor_name VARCHAR(150);
    v_stage public.stages%ROWTYPE;
    v_branch_name VARCHAR(150);
    v_level_name VARCHAR(150);
    v_seed_hex TEXT;
    v_seed_sha256 TEXT;
    v_draw_version INT;
    v_draw_log_id UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := now();
    v_unverified RECORD;
    v_part RECORD;
    v_sp public.stage_participations%ROWTYPE;
    v_idx INT := 0;
    v_new_lottery_no VARCHAR(30);
    v_used_q_ids UUID[] := ARRAY[]::uuid[];
    v_picked_q_ids UUID[];
    v_picked_q_codes TEXT[];
    v_first_q public.questions%ROWTYPE;
    v_q_id UUID;
    v_all_p_ids TEXT[] := ARRAY[]::text[];
    v_all_q_ids TEXT[] := ARRAY[]::text[];
    v_draw_results JSONB := '[]'::jsonb;
    v_target_count INT := 0;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Tidak terautentikasi: Sesi pengguna tidak ditemukan.';
    END IF;

    IF NOT (public.is_tenant_admin(p_tenant_id) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang berwenang menjalankan undian server.';
    END IF;

    IF p_draw_mode NOT IN ('lottery_number', 'maqra', 'both') THEN
        RAISE EXCEPTION 'Mode undian "%" tidak valid. Gunakan lottery_number, maqra, atau both.', p_draw_mode;
    END IF;

    IF COALESCE(p_questions_per_participant, 1) < 1 THEN
        RAISE EXCEPTION 'Jumlah maqra per peserta minimal 1.';
    END IF;

    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan pada tenant ini.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'STAGE_ALREADY_FINALIZED: Pengundian ditolak karena Babak "%" telah difinalisasi secara resmi.', v_stage.name;
    END IF;

    -- Blokir pengundian ulang apabila sudah ada lembar penilaian pada babak ini
    IF EXISTS (
        SELECT 1
        FROM public.judge_assessments ja
        JOIN public.stage_participations sp ON sp.id = ja.stage_participation_id
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'STAGE_ASSESSMENTS_ALREADY_STARTED: Pengundian ditolak karena penilaian dewan hakim sudah dimulai pada babak "%".', v_stage.name;
    END IF;

    SELECT name, role INTO v_actor_profile FROM public.profiles WHERE id = v_actor_id;
    v_actor_name := COALESCE(NULLIF(TRIM(v_actor_profile.name), ''), 'Administrator MTQ');

    IF p_branch_id IS NOT NULL THEN
        SELECT name INTO v_branch_name FROM public.branches WHERE id = p_branch_id AND tenant_id = p_tenant_id;
    ELSIF v_stage.branch_id IS NOT NULL THEN
        SELECT name INTO v_branch_name FROM public.branches WHERE id = v_stage.branch_id AND tenant_id = p_tenant_id;
    END IF;

    IF p_level_id IS NOT NULL THEN
        SELECT name INTO v_level_name FROM public.levels WHERE id = p_level_id AND tenant_id = p_tenant_id;
    END IF;

    -- Periksa apakah ada peserta dalam cakupan undian yang belum berstatus 'Diverifikasi'
    SELECT p.id, p.name, p.verification_status
    INTO v_unverified
    FROM public.participants p
    LEFT JOIN public.stage_participations sp
      ON sp.participant_id = p.id
     AND sp.stage_id = p_stage_id
     AND sp.tenant_id = p_tenant_id
    WHERE p.tenant_id = p_tenant_id
      AND (
          (p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 AND p.id = ANY(p_participant_ids))
          OR (
              (p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL)
              AND (sp.id IS NOT NULL OR p.stage_id = p_stage_id OR (p.stage_id IS NULL AND v_stage.stage_order = 1))
              AND (COALESCE(p_branch_id, v_stage.branch_id) IS NULL OR p.branch_id = COALESCE(p_branch_id, v_stage.branch_id))
              AND (p_level_id IS NULL OR p.level_id = p_level_id)
          )
      )
      AND COALESCE(p.verification_status, 'Diajukan') <> 'Diverifikasi'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'PARTICIPANT_NOT_VERIFIED: Peserta "%" belum diverifikasi berkasnya (status: %). Hanya peserta berstatus Diverifikasi yang dapat mengikuti undian.', v_unverified.name, v_unverified.verification_status;
    END IF;

    -- Bangkitkan benih acak kriptografis di server (pgcrypto dengan fallback aman)
    BEGIN
        EXECUTE 'SELECT encode(gen_random_bytes(16), ''hex'')' INTO v_seed_hex;
    EXCEPTION WHEN OTHERS THEN
        v_seed_hex := md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text);
    END;

    BEGIN
        EXECUTE 'SELECT encode(digest($1, ''sha256''), ''hex'')' INTO v_seed_sha256 USING v_seed_hex;
    EXCEPTION WHEN OTHERS THEN
        v_seed_sha256 := md5('sha256-a:' || v_seed_hex) || md5('sha256-b:' || v_seed_hex);
    END;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- Acak urutan peserta di server menggunakan benih kriptografis + random()
    FOR v_part IN
        SELECT p.*
        FROM public.participants p
        LEFT JOIN public.stage_participations sp
          ON sp.participant_id = p.id
         AND sp.stage_id = p_stage_id
         AND sp.tenant_id = p_tenant_id
        WHERE p.tenant_id = p_tenant_id
          AND COALESCE(p.verification_status, 'Diajukan') = 'Diverifikasi'
          AND (
              (p_participant_ids IS NOT NULL AND array_length(p_participant_ids, 1) > 0 AND p.id = ANY(p_participant_ids))
              OR (
                  (p_participant_ids IS NULL OR array_length(p_participant_ids, 1) IS NULL)
                  AND (sp.id IS NOT NULL OR p.stage_id = p_stage_id OR (p.stage_id IS NULL AND v_stage.stage_order = 1))
                  AND (COALESCE(p_branch_id, v_stage.branch_id) IS NULL OR p.branch_id = COALESCE(p_branch_id, v_stage.branch_id))
                  AND (p_level_id IS NULL OR p.level_id = p_level_id)
              )
          )
        ORDER BY md5(v_seed_hex || p.id::text || random()::text)
    LOOP
        v_idx := v_idx + 1;
        v_target_count := v_target_count + 1;
        v_all_p_ids := array_append(v_all_p_ids, v_part.id::text);

        SELECT * INTO v_sp
        FROM public.stage_participations
        WHERE stage_id = p_stage_id
          AND participant_id = v_part.id
          AND tenant_id = p_tenant_id
        LIMIT 1;

        IF NOT FOUND THEN
            INSERT INTO public.stage_participations (
                id, tenant_id, stage_id, participant_id, lottery_number, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, p_stage_id, v_part.id,
                v_part.lottery_number, 'Belum Dimulai', v_now, v_now
            ) RETURNING * INTO v_sp;
        END IF;

        IF p_draw_mode IN ('lottery_number', 'both') THEN
            v_new_lottery_no := LPAD(v_idx::text, 2, '0');
            UPDATE public.stage_participations
            SET lottery_number = v_new_lottery_no,
                updated_at = v_now
            WHERE id = v_sp.id;

            UPDATE public.participants
            SET stage_id = COALESCE(stage_id, p_stage_id),
                updated_at = v_now
            WHERE id = v_part.id
              AND tenant_id = p_tenant_id;
        ELSE
            v_new_lottery_no := COALESCE(v_sp.lottery_number, v_part.lottery_number, LPAD(v_idx::text, 2, '0'));
        END IF;

        v_picked_q_ids := ARRAY[]::uuid[];
        v_picked_q_codes := ARRAY[]::text[];

        IF p_draw_mode IN ('maqra', 'both') THEN
            -- Pilih p_questions_per_participant soal aktif yang sesuai 3D (cabang + jenjang + babak),
            -- prioritaskan soal yang belum terpakai pada batch ini (sampling without replacement قبل recycle)
            SELECT
                ARRAY_AGG(sub.id ORDER BY sub.ord),
                ARRAY_AGG((sub.code || ' - ' || sub.title) ORDER BY sub.ord)
            INTO v_picked_q_ids, v_picked_q_codes
            FROM (
                SELECT
                    q.id,
                    q.code,
                    q.title,
                    ROW_NUMBER() OVER (
                        ORDER BY
                            CASE WHEN q.id = ANY(v_used_q_ids) THEN 1 ELSE 0 END ASC,
                            md5(v_seed_hex || v_part.id::text || q.id::text || random()::text) ASC
                    ) AS ord
                FROM public.questions q
                WHERE q.tenant_id = p_tenant_id
                  AND q.status = 'Aktif'
                  AND (q.stage_id IS NULL OR q.stage_id = p_stage_id)
                  AND (COALESCE(p_branch_id, v_stage.branch_id, v_part.branch_id) IS NULL OR q.branch_id IS NULL OR q.branch_id = COALESCE(p_branch_id, v_stage.branch_id, v_part.branch_id))
                  AND (COALESCE(p_level_id, v_part.level_id) IS NULL OR q.level_id IS NULL OR q.level_id = COALESCE(p_level_id, v_part.level_id))
                  AND (p_question_pool_ids IS NULL OR array_length(p_question_pool_ids, 1) IS NULL OR q.id = ANY(p_question_pool_ids))
                LIMIT p_questions_per_participant
            ) sub;

            IF v_picked_q_ids IS NULL OR COALESCE(array_length(v_picked_q_ids, 1), 0) < p_questions_per_participant THEN
                RAISE EXCEPTION 'INSUFFICIENT_QUESTION_POOL: Jumlah soal aktif yang sesuai cabang/jenjang/babak tidak mencukupi untuk peserta "%" (butuh %, tersedia %).',
                    v_part.name, p_questions_per_participant, COALESCE(array_length(v_picked_q_ids, 1), 0);
            END IF;

            DELETE FROM public.assigned_maqras
            WHERE stage_participation_id = v_sp.id
              AND tenant_id = p_tenant_id;

            FOREACH v_q_id IN ARRAY v_picked_q_ids
            LOOP
                INSERT INTO public.assigned_maqras (
                    id, tenant_id, stage_participation_id, question_id, assigned_at, assigned_by, method, notes
                ) VALUES (
                    gen_random_uuid(),
                    p_tenant_id,
                    v_sp.id,
                    v_q_id,
                    v_now,
                    v_actor_id,
                    'undian',
                    COALESCE(p_notes, 'Undian Server Terverifikasi (SHA-256: ' || LEFT(v_seed_sha256, 12) || ')')
                );
                v_used_q_ids := array_append(v_used_q_ids, v_q_id);
                IF NOT (v_q_id::text = ANY(v_all_q_ids)) THEN
                    v_all_q_ids := array_append(v_all_q_ids, v_q_id::text);
                END IF;
            END LOOP;

            SELECT * INTO v_first_q FROM public.questions WHERE id = v_picked_q_ids[1];

            UPDATE public.stage_participations
            SET status = 'Belum Dimulai',
                updated_at = v_now
            WHERE id = v_sp.id;

            UPDATE public.participants
            SET stage_id = COALESCE(stage_id, p_stage_id),
                updated_at = v_now
            WHERE id = v_part.id
              AND tenant_id = p_tenant_id;
        ELSE
            -- Jika hanya mengundi nomor tampil, pertahankan daftar maqra yang sudah ada untuk catatan log
            SELECT
                COALESCE(ARRAY_AGG(q.id), ARRAY[]::uuid[]),
                COALESCE(ARRAY_AGG(q.code || ' - ' || q.title), ARRAY[]::text[])
            INTO v_picked_q_ids, v_picked_q_codes
            FROM public.assigned_maqras am
            JOIN public.questions q ON q.id = am.question_id
            WHERE am.stage_participation_id = v_sp.id;
        END IF;

        v_draw_results := v_draw_results || jsonb_build_array(
            jsonb_build_object(
                'participantId', v_part.id,
                'participantCode', v_part.participant_code,
                'participantName', v_part.name,
                'lotteryNumber', v_new_lottery_no,
                'questionIds', to_jsonb(v_picked_q_ids),
                'assignedQuestionIds', to_jsonb(v_picked_q_ids),
                'questionTitles', to_jsonb(v_picked_q_codes),
                'assignedQuestionCodes', to_jsonb(v_picked_q_codes)
            )
        );
    END LOOP;

    IF v_target_count = 0 THEN
        RAISE EXCEPTION 'NO_ELIGIBLE_PARTICIPANTS: Tidak ada peserta berstatus Diverifikasi yang ditemukan untuk cakupan undian ini.';
    END IF;

    SELECT COALESCE(MAX(draw_version), 0) + 1 INTO v_draw_version
    FROM public.lottery_draw_logs
    WHERE tenant_id = p_tenant_id AND stage_id = p_stage_id;

    INSERT INTO public.lottery_draw_logs (
        id, tenant_id, stage_id, stage_name, branch_id, branch_name, level_id, level_name,
        actor_id, actor_name, questions_per_participant, participant_ids, question_pool_ids,
        draw_results, draw_version, notes, seed_hex, seed_sha256, draw_mode, created_at
    ) VALUES (
        v_draw_log_id, p_tenant_id, p_stage_id, v_stage.name,
        COALESCE(p_branch_id, v_stage.branch_id), COALESCE(v_branch_name, 'Semua Cabang'),
        p_level_id, COALESCE(v_level_name, 'Semua Jenjang'),
        v_actor_id, v_actor_name, p_questions_per_participant,
        v_all_p_ids, v_all_q_ids,
        v_draw_results, v_draw_version,
        COALESCE(p_notes, 'Undian Server (' || p_draw_mode || ') SHA-256: ' || LEFT(v_seed_sha256, 16)),
        v_seed_hex, v_seed_sha256, p_draw_mode, v_now
    );

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    INSERT INTO public.audit_logs (
        tenant_id, actor_id, actor_name, action, target, summary, outcome, created_at
    ) VALUES (
        p_tenant_id, v_actor_id, v_actor_name,
        'LOTTERY_DRAW_COMMITTED',
        v_stage.name || ' - ' || COALESCE(v_branch_name, 'Semua Cabang'),
        'Undian Server (' || p_draw_mode || ') versi #' || v_draw_version || ': ' || v_target_count || ' peserta (SHA-256: ' || LEFT(v_seed_sha256, 12) || ').',
        'Success', v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'draw_log_id', v_draw_log_id,
        'draw_version', v_draw_version,
        'draw_mode', p_draw_mode,
        'seed_hex', v_seed_hex,
        'seed_sha256', v_seed_sha256,
        'participants_count', v_target_count,
        'results', v_draw_results
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) TO authenticated;

-- ==============================================================================
-- FASE 4.2 — LABEL GRUP DINAMIS PER TENANT (tenants.group_label)
-- ==============================================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS group_label VARCHAR(40) NOT NULL DEFAULT 'Kafilah / Utusan';

-- ------------------------------------------------------------------------------
-- 1.3 PENERTIBAN OTOMATIS SELURUH FUNGSI SECURITY DEFINER DI SCHEMA public
--   - Pastikan setiap fungsi SECURITY DEFINER non-trigger memiliki search_path
--   - Cabut EXECUTE dari PUBLIC dan anon, berikan ke authenticated
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_fn RECORD;
BEGIN
    FOR v_fn IN
        SELECT
            p.oid,
            n.nspname,
            p.proname,
            pg_get_function_identity_arguments(p.oid) AS ident_args,
            p.proconfig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosecdef = true
          AND p.prorettype <> 'pg_catalog.trigger'::regtype
    LOOP
        IF v_fn.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(v_fn.proconfig) cfg WHERE cfg LIKE 'search_path=%'
        ) THEN
            EXECUTE format(
                'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
                v_fn.nspname, v_fn.proname, v_fn.ident_args
            );
        END IF;

        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
            v_fn.nspname, v_fn.proname, v_fn.ident_args
        );
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated',
            v_fn.nspname, v_fn.proname, v_fn.ident_args
        );
    END LOOP;
END $$;


