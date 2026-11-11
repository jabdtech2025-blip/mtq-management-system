-- ============================================================================
-- 20261116 — Pengerasan integritas hasil lomba (Audit Lanjutan Kelompok 1–2)
--   K1 Hasil babak yang disahkan tidak bisa diubah; kolom hasil hanya via RPC
--   K2 Lembar nilai wajib memakai maqra milik peserta yang sama
--   K3 Hakim hanya boleh memotong nilai di bidang tugasnya
--   K4 Log undian bersifat append-only
--   T1 Keputusan pleno wajib lengkap & valid untuk seluruh peserta seri
--   T2 Hakim yang sudah memfinalisasi nilai tidak bisa dinonaktifkan diam-diam
--   T3 Kategori kesalahan & aturan potongan terkunci setelah dipakai
--   T4 Peserta Ditolak tidak lagi memblokir undian
--   T5 Status verifikasi hanya lewat RPC; tidak bisa dicabut setelah penilaian dimulai
--   T8 Peringkat sementara (compute_stage_rankings) hanya untuk admin
-- ============================================================================

-- ---------------------------------------------------------------------------
-- K1. Imutabilitas stage_participations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_stage_participation_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    -- mtq.rpc_participation_setup hanya dapat diset dari SQL sisi server (tidak dapat lewat Data API/PostgREST)
    v_rpc BOOLEAN := COALESCE(current_setting('mtq.rpc_stage_finalize_active', true), 'false') = 'true'
                  OR COALESCE(current_setting('mtq.rpc_participation_setup', true), 'false') = 'true';
    v_stage_id UUID;
    v_finalized BOOLEAN;
    v_stage RECORD;
BEGIN
    IF v_rpc THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    v_stage_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.stage_id ELSE NEW.stage_id END;
    SELECT * INTO v_stage FROM public.stages WHERE id = v_stage_id;
    v_finalized := COALESCE(v_stage.is_finalized, false);

    IF TG_OP = 'DELETE' THEN
        IF v_finalized THEN
            RAISE EXCEPTION 'STAGE_RESULT_LOCKED: Data peserta pada babak "%" yang sudah disahkan tidak dapat dihapus.', v_stage.name;
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF v_finalized THEN
            RAISE EXCEPTION 'STAGE_RESULT_LOCKED: Tidak dapat menambahkan peserta ke babak "%" yang sudah disahkan.', v_stage.name;
        END IF;
        -- Babak lanjutan: peserta hanya boleh masuk lewat pengesahan resmi bila babak sebelumnya sudah disahkan
        IF EXISTS (
            SELECT 1 FROM public.stages prev
            WHERE prev.tenant_id = v_stage.tenant_id
              AND prev.id <> v_stage.id
              AND prev.stage_order < v_stage.stage_order
              AND prev.is_finalized = true
              AND (v_stage.branch_id IS NULL OR prev.branch_id IS NULL OR prev.branch_id = v_stage.branch_id)
        ) THEN
            RAISE EXCEPTION 'STAGE_ENTRY_VIA_QUALIFICATION_ONLY: Peserta hanya dapat masuk ke babak "%" melalui pengesahan babak sebelumnya (advance_stage_qualifiers).', v_stage.name;
        END IF;
        IF NEW.final_score IS NOT NULL OR NEW.rank IS NOT NULL OR COALESCE(NEW.is_qualified, false) = true
           OR NEW.champion_rank IS NOT NULL OR NEW.champion_title IS NOT NULL THEN
            RAISE EXCEPTION 'STAGE_RESULT_RPC_ONLY: Nilai akhir, peringkat, kelulusan, dan gelar juara hanya dapat ditetapkan melalui pengesahan resmi.';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id OR NEW.participant_id IS DISTINCT FROM OLD.participant_id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'STAGE_RESULT_LOCKED: Babak, peserta, atau tenant pada data partisipasi tidak dapat dipindahkan.';
    END IF;

    IF v_finalized AND (
        NEW.lottery_number IS DISTINCT FROM OLD.lottery_number
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.final_score IS DISTINCT FROM OLD.final_score
        OR NEW.rank IS DISTINCT FROM OLD.rank
        OR NEW.is_qualified IS DISTINCT FROM OLD.is_qualified
        OR NEW.champion_rank IS DISTINCT FROM OLD.champion_rank
        OR NEW.champion_title IS DISTINCT FROM OLD.champion_title
        OR NEW.qualification_reason IS DISTINCT FROM OLD.qualification_reason
        OR NEW.finalized_at IS DISTINCT FROM OLD.finalized_at
    ) THEN
        RAISE EXCEPTION 'STAGE_RESULT_LOCKED: Hasil babak "%" sudah disahkan dan tidak dapat diubah.', v_stage.name;
    END IF;

    IF NEW.final_score IS DISTINCT FROM OLD.final_score
       OR NEW.rank IS DISTINCT FROM OLD.rank
       OR NEW.is_qualified IS DISTINCT FROM OLD.is_qualified
       OR NEW.champion_rank IS DISTINCT FROM OLD.champion_rank
       OR NEW.champion_title IS DISTINCT FROM OLD.champion_title
       OR NEW.qualification_reason IS DISTINCT FROM OLD.qualification_reason THEN
        RAISE EXCEPTION 'STAGE_RESULT_RPC_ONLY: Nilai akhir, peringkat, kelulusan, dan gelar juara hanya dapat diubah melalui pengesahan resmi.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stage_participation_integrity ON public.stage_participations;
CREATE TRIGGER trg_stage_participation_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.stage_participations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_participation_integrity();

-- ---------------------------------------------------------------------------
-- K2. Lembar nilai wajib memakai maqra milik peserta yang sama
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_assessment_maqra_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.assigned_maqras am
        WHERE am.id = NEW.assigned_maqra_id
          AND am.stage_participation_id = NEW.stage_participation_id
    ) THEN
        RAISE EXCEPTION 'ASSESSMENT_MAQRA_MISMATCH: Maqra pada lembar penilaian bukan milik peserta tersebut.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessment_maqra_ownership ON public.judge_assessments;
CREATE TRIGGER trg_assessment_maqra_ownership
    BEFORE INSERT OR UPDATE OF assigned_maqra_id, stage_participation_id ON public.judge_assessments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_maqra_ownership();

-- ---------------------------------------------------------------------------
-- K3. Daftar bidang yang boleh dipotong oleh seorang hakim pada sebuah lembar.
--     NULL = tanpa batasan (penugasan semua bidang / bidang tidak dapat dipetakan).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_judge_allowed_fields(
    p_judge_id UUID,
    p_stage_participation_id UUID,
    p_rubric_version_id UUID
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_unrestricted BOOLEAN := false;
    v_fields TEXT[] := ARRAY[]::text[];
    v_ja RECORD;
    v_name TEXT;
BEGIN
    FOR v_ja IN
        SELECT ja.rubric_field_id, ja.judge_field
        FROM public.judge_assignments ja
        JOIN public.stage_participations sp ON sp.id = p_stage_participation_id
        JOIN public.stages s ON s.id = sp.stage_id
        JOIN public.participants p ON p.id = sp.participant_id
        WHERE ja.stage_id = sp.stage_id
          AND ja.tenant_id = sp.tenant_id
          AND ja.judge_profile_id = p_judge_id
          AND ja.status = 'Aktif'
          AND (ja.branch_id IS NULL OR ja.branch_id = p.branch_id OR ja.branch_id = s.branch_id)
    LOOP
        v_name := NULL;
        IF v_ja.rubric_field_id IS NOT NULL THEN
            SELECT rf.name INTO v_name FROM public.rubric_fields rf WHERE rf.id = v_ja.rubric_field_id;
        ELSIF NULLIF(TRIM(COALESCE(v_ja.judge_field, '')), '') IS NOT NULL THEN
            SELECT rf.name INTO v_name
            FROM public.rubric_fields rf
            WHERE rf.rubric_version_id = p_rubric_version_id
              AND rf.status = 'Aktif'
              AND (
                  LOWER(rf.name) = regexp_replace(LOWER(TRIM(v_ja.judge_field)), '^bidang\s+', '')
                  OR LOWER(rf.code) = regexp_replace(LOWER(TRIM(v_ja.judge_field)), '^bidang\s+', '')
              )
            LIMIT 1;
        END IF;

        IF v_name IS NULL THEN
            v_unrestricted := true;
        ELSE
            v_fields := array_append(v_fields, v_name);
        END IF;
    END LOOP;

    IF v_unrestricted OR COALESCE(array_length(v_fields, 1), 0) = 0 THEN
        RETURN NULL;
    END IF;
    RETURN v_fields;
END;
$$;

-- ---------------------------------------------------------------------------
-- K4. Log undian append-only
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_lottery_draw_logs_append_only ON public.lottery_draw_logs;
CREATE TRIGGER trg_lottery_draw_logs_append_only
    BEFORE UPDATE OR DELETE ON public.lottery_draw_logs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_records();

-- ---------------------------------------------------------------------------
-- T2. Hakim yang sudah memfinalisasi nilai pada babak berjalan tidak dapat
--     dinonaktifkan / dipindahkan tanpa RPC beralasan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.judge_has_finalized_sheets_in_open_stage(
    p_tenant_id UUID,
    p_judge_id UUID,
    p_stage_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.judge_assessments jass
        JOIN public.stage_participations sp ON sp.id = jass.stage_participation_id
        JOIN public.stages s ON s.id = sp.stage_id
        WHERE jass.tenant_id = p_tenant_id
          AND jass.judge_profile_id = p_judge_id
          AND jass.status = 'finalized'
          AND s.is_finalized = false
          AND (p_stage_id IS NULL OR s.id = p_stage_id)
          AND EXISTS (
              SELECT 1 FROM public.judge_assignments ja
              WHERE ja.tenant_id = p_tenant_id
                AND ja.judge_profile_id = p_judge_id
                AND ja.stage_id = s.id
                AND ja.status = 'Aktif'
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_judge_assignment_stability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('mtq.rpc_judge_change_active', true), 'false') = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF OLD.status = 'Aktif' AND (
        TG_OP = 'DELETE'
        OR NEW.status IS DISTINCT FROM OLD.status
        OR NEW.judge_profile_id IS DISTINCT FROM OLD.judge_profile_id
        OR NEW.stage_id IS DISTINCT FROM OLD.stage_id
        OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
        OR NEW.rubric_field_id IS DISTINCT FROM OLD.rubric_field_id
    ) AND public.judge_has_finalized_sheets_in_open_stage(OLD.tenant_id, OLD.judge_profile_id, OLD.stage_id) THEN
        RAISE EXCEPTION 'JUDGE_HAS_FINALIZED_SHEETS: Hakim ini sudah memfinalisasi lembar nilai pada babak yang belum disahkan. Perubahan penugasan akan mengubah nilai peserta; gunakan release_judge_with_reason dengan alasan tertulis.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_judge_assignment_stability ON public.judge_assignments;
CREATE TRIGGER trg_judge_assignment_stability
    BEFORE UPDATE OR DELETE ON public.judge_assignments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_judge_assignment_stability();

CREATE OR REPLACE FUNCTION public.enforce_judge_membership_stability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF COALESCE(current_setting('mtq.rpc_judge_change_active', true), 'false') = 'true' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF OLD.status = 'Aktif' AND (TG_OP = 'DELETE' OR NEW.status IS DISTINCT FROM OLD.status)
       AND public.judge_has_finalized_sheets_in_open_stage(OLD.tenant_id, OLD.profile_id, NULL) THEN
        RAISE EXCEPTION 'JUDGE_HAS_FINALIZED_SHEETS: Akun ini sudah memfinalisasi lembar nilai pada babak yang belum disahkan dan tidak dapat dinonaktifkan langsung. Gunakan release_judge_with_reason dengan alasan tertulis.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_judge_membership_stability ON public.tenant_memberships;
CREATE TRIGGER trg_judge_membership_stability
    BEFORE UPDATE OR DELETE ON public.tenant_memberships
    FOR EACH ROW EXECUTE FUNCTION public.enforce_judge_membership_stability();

CREATE OR REPLACE FUNCTION public.release_judge_with_reason(
    p_tenant_id UUID,
    p_judge_profile_id UUID,
    p_reason TEXT,
    p_stage_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor RECORD;
    v_judge RECORD;
    v_count INT := 0;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Tidak terautentikasi.';
    END IF;
    IF NOT (public.is_tenant_admin(p_tenant_id) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin.';
    END IF;
    IF LENGTH(TRIM(COALESCE(p_reason, ''))) < 10 THEN
        RAISE EXCEPTION 'JUDGE_RELEASE_REASON_REQUIRED: Alasan pelepasan hakim wajib diisi minimal 10 karakter.';
    END IF;

    PERFORM set_config('mtq.rpc_judge_change_active', 'true', true);
    UPDATE public.judge_assignments ja
    SET status = 'Nonaktif'
    WHERE ja.tenant_id = p_tenant_id
      AND ja.judge_profile_id = p_judge_profile_id
      AND ja.status = 'Aktif'
      AND (p_stage_id IS NULL OR ja.stage_id = p_stage_id)
      AND EXISTS (SELECT 1 FROM public.stages s WHERE s.id = ja.stage_id AND s.is_finalized = false);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    PERFORM set_config('mtq.rpc_judge_change_active', 'false', true);

    SELECT name, role INTO v_actor FROM public.profiles WHERE id = v_actor_id;
    SELECT name INTO v_judge FROM public.profiles WHERE id = p_judge_profile_id;
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);
    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        p_tenant_id, v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'JUDGE_RELEASED',
        'Hakim: ' || COALESCE(v_judge.name, p_judge_profile_id::text),
        v_count || ' penugasan aktif pada babak berjalan dinonaktifkan. Lembar nilai hakim ini tidak lagi dihitung pada babak tersebut.',
        TRIM(p_reason),
        'Success'
    );

    RETURN jsonb_build_object('success', true, 'released_assignments', v_count);
END;
$$;

-- ---------------------------------------------------------------------------
-- T3. Kategori kesalahan & aturan potongan terkunci setelah dipakai lembar final
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.error_category_is_used(p_tenant_id UUID, p_category_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.judge_assessments ja
        WHERE ja.tenant_id = p_tenant_id
          AND ja.status = 'finalized'
          AND (ja.error_counts ? p_category_id::text OR (p_code IS NOT NULL AND ja.error_counts ? p_code))
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_error_category_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF public.error_category_is_used(OLD.tenant_id, OLD.id, OLD.code) THEN
            RAISE EXCEPTION 'ERROR_CATEGORY_LOCKED: Kategori "%" sudah dipakai pada lembar nilai final dan tidak dapat dihapus. Nonaktifkan dan buat kategori baru.', OLD.name;
        END IF;
        RETURN OLD;
    END IF;

    IF (
        NEW.default_deduction IS DISTINCT FROM OLD.default_deduction
        OR NEW.max_deduction IS DISTINCT FROM OLD.max_deduction
        OR NEW.rubric_field_id IS DISTINCT FROM OLD.rubric_field_id
        OR NEW.criterion_id IS DISTINCT FROM OLD.criterion_id
        OR NEW.deduction_rule_id IS DISTINCT FROM OLD.deduction_rule_id
        OR NEW.code IS DISTINCT FROM OLD.code
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    ) AND public.error_category_is_used(OLD.tenant_id, OLD.id, OLD.code) THEN
        RAISE EXCEPTION 'ERROR_CATEGORY_LOCKED: Bobot/pemetaan kategori "%" sudah dipakai pada lembar nilai final dan tidak dapat diubah di tengah lomba. Buat kategori baru untuk lomba berikutnya.', OLD.name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_error_category_immutability ON public.error_categories;
CREATE TRIGGER trg_error_category_immutability
    BEFORE UPDATE OR DELETE ON public.error_categories
    FOR EACH ROW EXECUTE FUNCTION public.enforce_error_category_immutability();

CREATE OR REPLACE FUNCTION public.enforce_deduction_rule_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (TG_OP = 'DELETE' OR NEW.deduction_points IS DISTINCT FROM OLD.deduction_points OR NEW.max_deduction IS DISTINCT FROM OLD.max_deduction)
       AND EXISTS (
           SELECT 1 FROM public.error_categories ec
           WHERE ec.deduction_rule_id = OLD.id
             AND public.error_category_is_used(ec.tenant_id, ec.id, ec.code)
       ) THEN
        RAISE EXCEPTION 'DEDUCTION_RULE_LOCKED: Aturan potongan ini sudah dipakai pada lembar nilai final dan tidak dapat diubah atau dihapus.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_deduction_rule_immutability ON public.deduction_rules;
CREATE TRIGGER trg_deduction_rule_immutability
    BEFORE UPDATE OR DELETE ON public.deduction_rules
    FOR EACH ROW EXECUTE FUNCTION public.enforce_deduction_rule_immutability();

-- ---------------------------------------------------------------------------
-- T5. Status verifikasi peserta hanya dapat diubah melalui verify_participant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_verification_via_rpc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
       AND COALESCE(current_setting('mtq.rpc_verify_active', true), 'false') <> 'true' THEN
        RAISE EXCEPTION 'VERIFICATION_RPC_ONLY: Status verifikasi peserta hanya dapat diubah melalui menu verifikasi berkas (verify_participant).';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verification_via_rpc ON public.participants;
CREATE TRIGGER trg_verification_via_rpc
    BEFORE UPDATE OF verification_status ON public.participants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_verification_via_rpc();


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

    -- T8: peringkat sementara hanya untuk admin/superadmin (menjaga independensi dewan hakim sebelum pleno)
    IF NOT (public.is_superadmin() OR public.is_tenant_admin(v_stage.tenant_id)) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Peringkat sementara hanya dapat dilihat Administrator penyelenggara.';
    END IF;

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
        -- K2: hanya lembar yang memakai maqra milik peserta itu sendiri
        JOIN public.assigned_maqras am_own
          ON am_own.id = jass.assigned_maqra_id
         AND am_own.stage_participation_id = jass.stage_participation_id
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
    v_calc JSONB;
    v_required_units INT;
    v_finalized_units INT;
    v_now TIMESTAMPTZ := now();
    v_allowed_fields TEXT[];
    v_foreign_fields TEXT;
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

    -- P0-01: Hitung ulang nilai resmi secara otoritatif dari error_counts mentah & rubrik database
    v_calc := calculate_assessment_score_sql(
        v_assessment.tenant_id,
        v_assessment.rubric_version_id,
        COALESCE(v_assessment.error_counts, '{}'::jsonb)
    );

    -- K3: hakim hanya boleh memotong nilai pada bidang tugasnya
    v_allowed_fields := public.get_judge_allowed_fields(v_actor_id, v_assessment.stage_participation_id, v_assessment.rubric_version_id);
    IF v_allowed_fields IS NOT NULL THEN
        SELECT string_agg(fd.key, ', ')
        INTO v_foreign_fields
        FROM jsonb_each_text(COALESCE(v_calc -> 'field_deductions', '{}'::jsonb)) AS fd(key, value)
        WHERE fd.value ~ '^-?[0-9]+(\.[0-9]+)?$'
          AND fd.value::numeric > 0
          AND NOT (fd.key = ANY(v_allowed_fields));
        IF v_foreign_fields IS NOT NULL THEN
            RAISE EXCEPTION 'JUDGE_FIELD_VIOLATION: Lembar ini memuat potongan pada bidang di luar tugas Anda (%). Bidang tugas: %.', v_foreign_fields, array_to_string(v_allowed_fields, ', ');
        END IF;
    END IF;

    -- Aktifkan flag transaksi lokal agar trigger imutabilitas mengizinkan finalisasi & audit resmi
    PERFORM set_config('mtq.rpc_finalize_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- Kunci lembar penilaian dan simpan hasil perhitungan server resmi
    UPDATE judge_assessments
    SET status = 'finalized',
        is_locked = true,
        final_score = (v_calc ->> 'final_score')::numeric,
        total_deductions = (v_calc ->> 'total_deductions')::numeric,
        field_scores = (v_calc -> 'field_scores'),
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
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Babak ini sudah pernah difinalisasi sebelumnya.';
    END IF;

    IF NOT public.is_tenant_admin(v_stage.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Anda tidak memiliki wewenang administrator pada tenant ini.';
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;

    SELECT COUNT(*) INTO v_participation_count
    FROM public.stage_participations sp
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id;

    IF v_participation_count = 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Tidak ada peserta terdaftar pada babak ini.';
    END IF;

    v_qualified_count := COALESCE(array_length(p_qualified_participant_ids, 1), 0);
    v_champion_count := GREATEST(1, COALESCE(v_stage.champion_count, 3));

    IF p_next_stage_id IS NOT NULL THEN
        IF v_stage.qualification_quota <= 0 THEN
            RAISE EXCEPTION 'Kuota kelulusan pada babak ini tidak valid.';
        END IF;
        IF v_qualified_count > v_stage.qualification_quota THEN
            RAISE EXCEPTION 'Jumlah peserta yang diloloskan (%) melebihi kuota babak (%).', v_qualified_count, v_stage.qualification_quota;
        END IF;
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

    PERFORM set_config('mtq.rpc_stage_finalize_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    v_computed_data := public.compute_stage_rankings(p_stage_id);
    v_rankings_arr := COALESCE(v_computed_data -> 'rankings', '[]'::jsonb);
    v_rubric_version_id := NULLIF(v_computed_data ->> 'rubric_version_id', '')::uuid;
    SELECT COALESCE(string_agg(elem, ' > '), 'total > Tajwid > Lagu > Fashahah')
    INTO v_tie_break_rule_used
    FROM jsonb_array_elements_text(COALESCE(v_computed_data -> 'tie_break_order', '["total","Tajwid","Lagu","Fashahah"]'::jsonb)) AS elem;

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
            -- T1: SETIAP peserta dalam kelompok seri wajib punya urutan pleno (bilangan bulat) dan alasan >= 5 karakter
            BOOL_AND(
                p_tie_resolution IS NOT NULL
                AND jsonb_typeof(p_tie_resolution) = 'object'
                AND COALESCE(p_tie_resolution ->> pr.participant_id::text, '') ~ '^[0-9]+$'
            ) AS has_tie_resolution,
            BOOL_AND(
                p_override_reasons IS NOT NULL
                AND jsonb_typeof(p_override_reasons) = 'object'
                AND LENGTH(TRIM(COALESCE(p_override_reasons ->> pr.participant_id::text, ''))) >= 5
            ) AS has_override_reason,
            COUNT(DISTINCT CASE
                WHEN COALESCE(p_tie_resolution ->> pr.participant_id::text, '') ~ '^[0-9]+$'
                THEN (p_tie_resolution ->> pr.participant_id::text)::int
            END) AS distinct_positions,
            MIN(CASE WHEN COALESCE(p_tie_resolution ->> pr.participant_id::text, '') ~ '^[0-9]+$'
                     THEN (p_tie_resolution ->> pr.participant_id::text)::int END) AS min_position,
            MAX(CASE WHEN COALESCE(p_tie_resolution ->> pr.participant_id::text, '') ~ '^[0-9]+$'
                     THEN (p_tie_resolution ->> pr.participant_id::text)::int END) AS max_position
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
    AND NOT (
        tg.has_tie_resolution
        AND tg.has_override_reason
        AND tg.distinct_positions = tg.group_size
        AND tg.min_position = 1
        AND tg.max_position = tg.group_size
    );

    IF v_unresolved_critical_tie_count > 0 THEN
        RAISE EXCEPTION 'UNRESOLVED_CRITICAL_TIE: Pengesahan babak diblokir: Terjadi nilai seri identik pada seluruh kriteria tie-break di batas kuota atau podium juara. Keputusan pleno wajib mencakup SELURUH peserta yang seri dengan urutan unik 1..n (p_tie_resolution) dan alasan minimal 5 karakter untuk setiap peserta (p_override_reasons).';
    END IF;

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
        rank = ro.resolved_rank
    FROM resolved_order ro
    WHERE sp.id = ro.stage_participation_id;

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

    UPDATE public.stages
    SET is_finalized = true,
        finalized_at = v_now,
        status = 'Selesai'
    WHERE id = p_stage_id;

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
      -- T4: hanya peserta yang masih menunggu verifikasi yang memblokir; peserta Ditolak dikeluarkan dari undian
      AND COALESCE(p.verification_status, 'Diajukan') = 'Diajukan'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'PARTICIPANT_NOT_VERIFIED: Peserta "%" belum diverifikasi berkasnya (status: %). Selesaikan verifikasi (Diverifikasi/Ditolak) sebelum undian; peserta Ditolak otomatis tidak diundi.', v_unverified.name, v_unverified.verification_status;
    END IF;

    -- Benih acak kriptografis di server. gen_random_bytes (pgcrypto) bila tersedia;
    -- jika tidak, gen_random_uuid() bawaan PostgreSQL 13+ (juga CSPRNG). Tidak ada fallback deterministik.
    BEGIN
        EXECUTE 'SELECT encode(gen_random_bytes(16), ''hex'')' INTO v_seed_hex;
    EXCEPTION WHEN undefined_function THEN
        v_seed_hex := replace(gen_random_uuid()::text, '-', '');
    END;
    IF v_seed_hex IS NULL OR length(v_seed_hex) < 32 THEN
        RAISE EXCEPTION 'LOTTERY_SEED_UNAVAILABLE: Benih acak server tidak dapat dibangkitkan.';
    END IF;

    -- SHA-256 asli (fungsi bawaan PostgreSQL 11+), dicatat agar benih dapat diverifikasi publik
    v_seed_sha256 := encode(sha256(convert_to(v_seed_hex, 'UTF8')), 'hex');

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- Acak urutan peserta secara deterministik dari benih (dapat direproduksi via verify_lottery_draw)
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
        ORDER BY public.lottery_sort_key(v_seed_hex, p.id::text, ''), p.id
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
            -- prioritaskan soal yang belum terpakai pada batch ini (sampling without replacement sebelum daur ulang)
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
                            public.lottery_sort_key(v_seed_hex, v_part.id::text, q.id::text) ASC,
                            q.id ASC
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

    -- T5: status Diverifikasi tidak dapat dicabut setelah penilaian peserta dimulai pada babak yang belum disahkan
    IF COALESCE(v_part.verification_status, 'Diajukan') = 'Diverifikasi' AND p_status <> 'Diverifikasi' AND EXISTS (
        SELECT 1
        FROM public.judge_assessments ja
        JOIN public.stage_participations sp ON sp.id = ja.stage_participation_id
        JOIN public.stages s ON s.id = sp.stage_id
        WHERE sp.participant_id = p_participant_id
          AND s.is_finalized = false
    ) THEN
        RAISE EXCEPTION 'VERIFICATION_LOCKED_DURING_JUDGING: Penilaian peserta "%" sudah dimulai. Status verifikasi tidak dapat dicabut di tengah babak; ajukan diskualifikasi melalui keputusan dewan hakim.', v_part.name;
    END IF;

    PERFORM set_config('mtq.rpc_verify_active', 'true', true);
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

REVOKE EXECUTE ON FUNCTION public.get_judge_allowed_fields(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_judge_allowed_fields(UUID, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.judge_has_finalized_sheets_in_open_stage(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.judge_has_finalized_sheets_in_open_stage(UUID, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.release_judge_with_reason(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_judge_with_reason(UUID, UUID, TEXT, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.error_category_is_used(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.error_category_is_used(UUID, UUID, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_judge_assessment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_judge_assessment(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_participant(UUID, UUID, VARCHAR, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_participant(UUID, UUID, VARCHAR, TEXT) TO authenticated;

