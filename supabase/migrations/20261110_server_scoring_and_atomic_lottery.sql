-- ==============================================================================
-- MIGRATION: 20261110_server_scoring_and_atomic_lottery.sql
-- Deskripsi:
-- 1. P0-01: Server-Authoritative Scoring Engine di PostgreSQL
--    (calculate_assessment_score_sql) & integrasi ke finalize_judge_assessment.
--    Database menghitung ulang skor resmi dari error_counts mentah dan rubrik DB,
--    sehingga manipulasi nilai browser tidak dapat menembus server.
-- 2. P0-02: Server-Authoritative Ranking & Tie-Break di advance_stage_qualifiers.
--    Menghapus client_tie_break_rank, memproses urutan tie-break dinamis resmi,
--    dan memblokir pengesahan bila terdapat seri identik pada batas kuota/podium
--    tanpa alasan override manual.
-- 3. P0-04: Transaksi Atomik Undian & Penetapan Maqra (commit_lottery_draw RPC).
--    Memvalidasi relasi 3D (babak, cabang, jenjang) dan mencatat assigned_maqras,
--    stage_participations, lottery_draw_logs, dan audit_logs dalam 1 transaksi.
-- 4. Idempotent, non-destruktif, dan backward-compatible.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FUNGSI PERHITUNGAN NILAI RESMI SERVER (Server-Authoritative Scoring Engine)
-- ------------------------------------------------------------------------------
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
    SELECT * INTO v_rubric FROM rubric_versions WHERE id = p_rubric_version_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rubrik penilaian tidak ditemukan di database.';
    END IF;

    -- Inisialisasi bidang aktif
    FOR v_field IN
        SELECT * FROM rubric_fields
        WHERE rubric_version_id = p_rubric_version_id
          AND status = 'Aktif'
        ORDER BY field_order ASC
    LOOP
        v_field_deductions := jsonb_set(v_field_deductions, ARRAY[v_field.name], '0'::jsonb);
        v_field_scores := jsonb_set(v_field_scores, ARRAY[v_field.name], to_jsonb(v_field.max_score));
    END LOOP;

    -- Iterasi setiap entri error_counts
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

            -- Cari error_categories berdasarkan ID atau CODE pada tenant
            SELECT * INTO v_cat
            FROM error_categories
            WHERE tenant_id = p_tenant_id
              AND (id::text = v_cat_key OR code = v_cat_key)
              AND status = 'Aktif'
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Kategori kesalahan % tidak ditemukan atau tidak berstatus aktif pada tenant ini.', v_cat_key;
            END IF;

            -- Resolusi bidang rubrik
            v_target_field_name := NULL;
            IF v_cat.rubric_field_id IS NOT NULL THEN
                SELECT name INTO v_target_field_name
                FROM rubric_fields
                WHERE id = v_cat.rubric_field_id
                  AND rubric_version_id = p_rubric_version_id
                  AND status = 'Aktif';
            END IF;

            IF v_target_field_name IS NULL AND v_cat.criterion_id IS NOT NULL THEN
                SELECT rf.name INTO v_target_field_name
                FROM rubric_criteria rc
                JOIN rubric_fields rf ON rf.id = rc.rubric_field_id
                WHERE rc.id = v_cat.criterion_id
                  AND rf.rubric_version_id = p_rubric_version_id
                  AND rf.status = 'Aktif';
            END IF;

            IF v_target_field_name IS NULL AND v_cat.deduction_rule_id IS NOT NULL THEN
                SELECT rf.name INTO v_target_field_name
                FROM deduction_rules dr
                JOIN rubric_criteria rc ON rc.id = dr.criterion_id
                JOIN rubric_fields rf ON rf.id = rc.rubric_field_id
                WHERE dr.id = v_cat.deduction_rule_id
                  AND rf.rubric_version_id = p_rubric_version_id
                  AND rf.status = 'Aktif';
            END IF;

            IF v_target_field_name IS NULL THEN
                SELECT name INTO v_target_field_name
                FROM rubric_fields
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

            -- Dapatkan besaran pengurangan per kejadian
            v_unit_deduction := v_cat.default_deduction;
            v_raw_deduction := ROUND(v_count * v_unit_deduction, 2);

            IF v_cat.deduction_rule_id IS NOT NULL THEN
                SELECT dr.deduction_points, dr.max_deduction
                INTO v_rule_deduction_points, v_rule_max_deduction
                FROM deduction_rules dr
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
                FROM rubric_criteria rc
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

    -- Hitung nilai akhir per bidang dengan batasan min_score, max_score, dan max_deduction bidang
    v_total_deductions := 0.00;
    v_final_score := 0.00;

    FOR v_field IN
        SELECT * FROM rubric_fields
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
        v_final_score := v_final_score + v_field_score;
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

-- ------------------------------------------------------------------------------
-- 2. HARDENING finalize_judge_assessment (P0-01)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_judge_assessment(
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
        'Finalisasi otoritatif server dengan nilai akhir ' || (v_calc ->> 'final_score'),
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Lembar penilaian berhasil dihitung secara otoritatif dan difinalisasi secara permanen.',
        'final_score', (v_calc ->> 'final_score')::numeric,
        'participant_stage_status', CASE
            WHEN v_required_units > 0 AND v_finalized_units >= v_required_units THEN 'Lengkap'
            ELSE 'Menunggu Hakim Lain'
        END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. HARDENING advance_stage_qualifiers (P0-02)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.advance_stage_qualifiers(
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
    v_next_stage stages%ROWTYPE;
    v_rule competition_rule_configs%ROWTYPE;
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
    v_tie_break_fields TEXT[];
    v_crit_1 TEXT;
    v_crit_2 TEXT;
    v_crit_3 TEXT;
    v_crit_4 TEXT;
    v_authoritative_snapshot JSONB;
    v_unresolved_boundary_tie_count INT;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Validasi sesi autentikasi
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    -- 2. Validasi babak asal ada dan belum difinalisasi
    SELECT * INTO v_stage FROM stages WHERE id = p_stage_id FOR UPDATE;
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

    -- Aktifkan flag transaksi resmi untuk stages, stage_result_snapshots, dan audit_logs
    PERFORM set_config('mtq.rpc_stage_finalize_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- Ambil konfigurasi urutan tie-break resmi cabang untuk perhitungan otoritatif di server (P1-06)
    SELECT * INTO v_rule
    FROM competition_rule_configs crc
    WHERE crc.tenant_id = v_stage.tenant_id
      AND (v_stage.branch_id IS NULL OR crc.branch_id = v_stage.branch_id)
    LIMIT 1;

    IF FOUND AND v_rule.tie_break_order IS NOT NULL THEN
        SELECT COALESCE(
            ARRAY(
                SELECT elem
                FROM unnest(v_rule.tie_break_order) AS elem
                WHERE LOWER(elem) <> 'total'
            ),
            ARRAY['Tajwid', 'Lagu', 'Fashahah', 'Suara']
        ) INTO v_tie_break_fields;
    ELSE
        v_tie_break_fields := ARRAY['Tajwid', 'Lagu', 'Fashahah', 'Suara'];
    END IF;

    v_crit_1 := v_tie_break_fields[1];
    v_crit_2 := v_tie_break_fields[2];
    v_crit_3 := v_tie_break_fields[3];
    v_crit_4 := v_tie_break_fields[4];

    -- 12A. Hitung nilai akhir resmi & tie-break per bidang (server-authoritative) langsung dari judge_assessments
    -- P0-02: Hapus sepenuhnya client_tie_break_rank dari ORDER BY resmi!
    WITH participant_scores AS (
        SELECT
            sp.id AS stage_participation_id,
            sp.participant_id,
            sp.lottery_number,
            ROUND(AVG(jass.final_score)::numeric, 2) AS computed_score,
            ROUND(AVG(
                CASE
                    WHEN v_crit_1 IS NOT NULL AND COALESCE(
                        jass.field_scores ->> v_crit_1,
                        CASE UPPER(v_crit_1)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    ) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN COALESCE(
                        jass.field_scores ->> v_crit_1,
                        CASE UPPER(v_crit_1)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    )::numeric
                    ELSE NULL
                END
            ), 2) AS crit_1_score,
            ROUND(AVG(
                CASE
                    WHEN v_crit_2 IS NOT NULL AND COALESCE(
                        jass.field_scores ->> v_crit_2,
                        CASE UPPER(v_crit_2)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    ) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN COALESCE(
                        jass.field_scores ->> v_crit_2,
                        CASE UPPER(v_crit_2)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    )::numeric
                    ELSE NULL
                END
            ), 2) AS crit_2_score,
            ROUND(AVG(
                CASE
                    WHEN v_crit_3 IS NOT NULL AND COALESCE(
                        jass.field_scores ->> v_crit_3,
                        CASE UPPER(v_crit_3)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    ) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN COALESCE(
                        jass.field_scores ->> v_crit_3,
                        CASE UPPER(v_crit_3)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    )::numeric
                    ELSE NULL
                END
            ), 2) AS crit_3_score,
            ROUND(AVG(
                CASE
                    WHEN v_crit_4 IS NOT NULL AND COALESCE(
                        jass.field_scores ->> v_crit_4,
                        CASE UPPER(v_crit_4)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    ) ~ '^-?[0-9]+(\.[0-9]+)?$'
                    THEN COALESCE(
                        jass.field_scores ->> v_crit_4,
                        CASE UPPER(v_crit_4)
                            WHEN 'TAJWID' THEN COALESCE(jass.field_scores ->> 'TJW', jass.field_scores ->> 'Tajwid')
                            WHEN 'FASHAHAH' THEN COALESCE(jass.field_scores ->> 'FSH', jass.field_scores ->> 'Fashahah')
                            WHEN 'LAGU' THEN COALESCE(jass.field_scores ->> 'LGU', jass.field_scores ->> 'LAG', jass.field_scores ->> 'Lagu')
                            WHEN 'SUARA' THEN COALESCE(jass.field_scores ->> 'SUR', jass.field_scores ->> 'SUA', jass.field_scores ->> 'Suara')
                            WHEN 'TAHFIZH' THEN COALESCE(jass.field_scores ->> 'THF', jass.field_scores ->> 'Tahfizh')
                            ELSE NULL
                        END
                    )::numeric
                    ELSE NULL
                END
            ), 2) AS crit_4_score
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
            ps.crit_1_score,
            ps.crit_2_score,
            ps.crit_3_score,
            ps.crit_4_score,
            ROW_NUMBER() OVER (
                ORDER BY
                    ps.computed_score DESC,
                    COALESCE(ps.crit_1_score, -1) DESC,
                    COALESCE(ps.crit_2_score, -1) DESC,
                    COALESCE(ps.crit_3_score, -1) DESC,
                    COALESCE(ps.crit_4_score, -1) DESC,
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

    -- P0-02: Deteksi Seri Identik pada Batas Kuota (Boundary Tie Protection)
    -- Jika peserta di rank kuota dan peserta di rank kuota + 1 memiliki nilai total dan nilai bidang identik,
    -- dan tidak ada alasan override manual, blokir pengesahan secara otomatis!
    SELECT COUNT(*) INTO v_unresolved_boundary_tie_count
    FROM stage_participations r_in
    JOIN stage_participations r_out
      ON r_out.stage_id = p_stage_id
     AND r_out.tenant_id = v_stage.tenant_id
     AND r_out.rank = (v_stage.qualification_quota + 1)
    LEFT JOIN (
        SELECT
            sp.participant_id,
            ROUND(AVG(jass.final_score)::numeric, 2) AS computed_score,
            ROUND(AVG(COALESCE((jass.field_scores ->> v_crit_1)::numeric, 0)), 2) AS crit_1_score,
            ROUND(AVG(COALESCE((jass.field_scores ->> v_crit_2)::numeric, 0)), 2) AS crit_2_score
        FROM stage_participations sp
        JOIN judge_assessments jass ON jass.stage_participation_id = sp.id AND jass.status = 'finalized'
        WHERE sp.stage_id = p_stage_id
        GROUP BY sp.participant_id
    ) sc_in ON sc_in.participant_id = r_in.participant_id
    LEFT JOIN (
        SELECT
            sp.participant_id,
            ROUND(AVG(jass.final_score)::numeric, 2) AS computed_score,
            ROUND(AVG(COALESCE((jass.field_scores ->> v_crit_1)::numeric, 0)), 2) AS crit_1_score,
            ROUND(AVG(COALESCE((jass.field_scores ->> v_crit_2)::numeric, 0)), 2) AS crit_2_score
        FROM stage_participations sp
        JOIN judge_assessments jass ON jass.stage_participation_id = sp.id AND jass.status = 'finalized'
        WHERE sp.stage_id = p_stage_id
        GROUP BY sp.participant_id
    ) sc_out ON sc_out.participant_id = r_out.participant_id
    WHERE r_in.stage_id = p_stage_id
      AND r_in.tenant_id = v_stage.tenant_id
      AND r_in.rank = v_stage.qualification_quota
      AND sc_in.computed_score = sc_out.computed_score
      AND sc_in.crit_1_score IS NOT DISTINCT FROM sc_out.crit_1_score
      AND sc_in.crit_2_score IS NOT DISTINCT FROM sc_out.crit_2_score
      AND LENGTH(TRIM(COALESCE(p_override_reasons ->> r_in.participant_id::text, ''))) < 5
      AND LENGTH(TRIM(COALESCE(p_override_reasons ->> r_out.participant_id::text, ''))) < 5;

    IF v_unresolved_boundary_tie_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak diblokir: Terjadi nilai seri identik pada batas kuota kelulusan (Top-%). Keputusan wajib diambil secara manual melalui Sidang Pleno / Penampilan Ulang disertai alasan override resmi.', v_stage.qualification_quota;
    END IF;

    -- 12B. Validasi 2 arah untuk override manual (P1-06):
    -- 1. Peserta di luar kuota yang diloloskan (rank > quota & qualified)
    -- 2. Peserta di dalam kuota yang digugurkan secara manual (rank <= quota & NOT qualified)
    SELECT COUNT(*) INTO v_unjustified_override_count
    FROM stage_participations sp
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

    -- 12C. Perbarui status kelulusan pada stage_participations babak asal
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

    -- 13. Perbarui status participants sesuai hasil babak
    UPDATE participants p
    SET status = CASE
        WHEN p.id = ANY(p_qualified_participant_ids) THEN
            CASE WHEN p_next_stage_id IS NOT NULL THEN 'Menunggu' ELSE 'Final' END
        ELSE 'Final'
    END,
    updated_at = v_now
    WHERE p.id IN (
        SELECT participant_id FROM stage_participations
        WHERE stage_id = p_stage_id AND tenant_id = v_stage.tenant_id
    );

    -- 14. Daftarkan peserta yang lolos ke babak selanjutnya secara idempoten
    IF p_next_stage_id IS NOT NULL AND v_qualified_count > 0 THEN
        INSERT INTO stage_participations (
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
            (SELECT lottery_number FROM participants WHERE id = q_pid),
            'Belum Dimulai',
            v_now,
            v_now
        FROM unnest(p_qualified_participant_ids) AS q_pid
        WHERE NOT EXISTS (
            SELECT 1 FROM stage_participations sp_exist
            WHERE sp_exist.stage_id = v_next_stage.id
              AND sp_exist.participant_id = q_pid
        );
    END IF;

    -- 15. Finalisasi babak asal di tabel stages
    UPDATE stages
    SET is_finalized = true,
        finalized_at = v_now,
        status = 'Selesai'
    WHERE id = p_stage_id;

    -- 16. Bekukan snapshot hasil resmi di stage_result_snapshots
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
            CASE WHEN FOUND AND v_rule.rubric_version_id IS NOT NULL THEN v_rule.rubric_version_id ELSE (SELECT id FROM rubric_versions WHERE tenant_id = v_stage.tenant_id LIMIT 1) END,
            CASE WHEN FOUND AND v_rule.tie_break_order IS NOT NULL THEN array_to_string(v_rule.tie_break_order, ' > ') ELSE 'total > Tajwid > Lagu > Fashahah' END,
            v_actor_id,
            v_authoritative_snapshot
        );
    END IF;

    -- 17. Catat log audit permanen
    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
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
                'Pengesahan resmi hasil kejuaraan babak final ' || v_stage.name || ' dengan ' || v_qualified_count::text || ' juara ditetapkan.'
        END,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Babak berhasil disahkan secara resmi dan peserta lolos telah dipindahkan.',
        'qualified_count', v_qualified_count,
        'next_stage_id', p_next_stage_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. TRANSAKSI ATOMIK UNDIAN & PENETAPAN MAQRA (commit_lottery_draw RPC — P0-04)
-- ------------------------------------------------------------------------------
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
    IF NOT is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator yang berwenang menetapkan hasil undian maqra.';
    END IF;

    SELECT * INTO v_stage FROM stages WHERE id = p_stage_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan pada tenant ini.';
    END IF;

    IF v_stage.is_finalized THEN
        RAISE EXCEPTION 'Penetapan undian ditolak: Babak "%" telah difinalisasi secara resmi.', v_stage.name;
    END IF;

    IF jsonb_array_length(p_results) = 0 THEN
        RAISE EXCEPTION 'Hasil undian kosong.';
    END IF;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- 1. Validasi ketat 3D untuk seluruh hasil undian
    FOR v_res_elem IN SELECT * FROM jsonb_array_elements(p_results)
    LOOP
        v_participant_id := (v_res_elem ->> 'participantId')::uuid;
        SELECT * INTO v_part FROM participants WHERE id = v_participant_id AND tenant_id = p_tenant_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Peserta dengan ID % tidak ditemukan pada tenant ini.', v_participant_id;
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
            SELECT * INTO v_question FROM questions WHERE id = v_q_id AND tenant_id = p_tenant_id;
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

        SELECT * INTO v_sp FROM stage_participations
        WHERE stage_id = p_stage_id AND participant_id = v_participant_id AND tenant_id = p_tenant_id
        LIMIT 1;

        IF NOT FOUND THEN
            INSERT INTO stage_participations (
                id, tenant_id, stage_id, stage_name, participant_id, lottery_number, status, created_at, updated_at
            ) VALUES (
                gen_random_uuid(), p_tenant_id, p_stage_id, p_stage_name, v_participant_id,
                (SELECT lottery_number FROM participants WHERE id = v_participant_id),
                'Belum Dimulai', v_now, v_now
            ) RETURNING * INTO v_sp;
        END IF;

        -- Hapus penetapan lama yang belum memiliki penilaian final (mendukung re-draw aman)
        DELETE FROM assigned_maqras
        WHERE stage_participation_id = v_sp.id
          AND tenant_id = p_tenant_id
          AND id NOT IN (
              SELECT assigned_maqra_id FROM judge_assessments
              WHERE stage_participation_id = v_sp.id AND status = 'finalized'
          );

        -- Sisipkan assigned_maqras baru
        FOR v_q_id_text IN SELECT * FROM jsonb_array_elements_text(v_res_elem -> 'questionIds')
        LOOP
            v_q_id := v_q_id_text::uuid;
            v_new_maqra_id := gen_random_uuid();

            INSERT INTO assigned_maqras (
                id, tenant_id, stage_participation_id, question_id, assigned_at, method, notes
            ) VALUES (
                v_new_maqra_id, p_tenant_id, v_sp.id, v_q_id, v_now, 'undian', p_notes
            );

            v_assigned_maqras := v_assigned_maqras || jsonb_build_object(
                'id', v_new_maqra_id,
                'participantId', v_participant_id,
                'stageParticipationId', v_sp.id,
                'questionId', v_q_id
            );
        END LOOP;

        UPDATE stage_participations
        SET status = CASE WHEN status = 'Maqra Belum Ditetapkan' THEN 'Belum Dimulai' ELSE status END,
            updated_at = v_now
        WHERE id = v_sp.id;
    END LOOP;

    -- Simpan riwayat undian di lottery_draw_logs
    INSERT INTO lottery_draw_logs (
        id, tenant_id, stage_id, stage_name, branch_id, branch_name, level_id, level_name,
        actor_id, actor_name, questions_per_participant, participant_ids, question_pool_ids,
        draw_results, notes, created_at
    ) VALUES (
        v_draw_log_id, p_tenant_id, p_stage_id, p_stage_name, p_branch_id, p_branch_name, p_level_id, p_level_name,
        p_actor_id, p_actor_name, p_questions_per_participant, v_all_p_ids, v_all_q_ids,
        p_results, p_notes, v_now
    );

    -- Simpan audit log
    INSERT INTO audit_logs (
        tenant_id, actor_id, actor_name, action, target, summary, outcome
    ) VALUES (
        p_tenant_id, p_actor_id, p_actor_name, 'LOTTERY_DRAW_COMMITTED',
        'Stage: ' || p_stage_name || ', Branch: ' || p_branch_name,
        'Penetapan undian maqra atomik untuk ' || jsonb_array_length(p_results)::text || ' peserta (Log ID: ' || v_draw_log_id::text || ')',
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Penetapan undian maqra berhasil dicatat secara atomik di database.',
        'drawLogId', v_draw_log_id,
        'assignedMaqras', v_assigned_maqras
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. GRANTS KE AUTHENTICATED USERS
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.commit_lottery_draw(UUID, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, JSONB, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_lottery_draw(UUID, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, UUID, VARCHAR, JSONB, INT, TEXT) TO authenticated;
