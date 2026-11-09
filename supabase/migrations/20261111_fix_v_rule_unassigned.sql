-- ==============================================================================
-- MIGRATION: 20261111_fix_v_rule_unassigned.sql
-- Perbaikan: Menghilangkan error "Record 'v_rule' is not assigned yet"
-- Mengganti variabel RECORD untyped dengan skalar eksplisit pada mesin penilaian server.
-- ==============================================================================

-- 1. Perbarui calculate_assessment_score_sql
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

-- 2. Pastikan izin eksekusi diberikan kepada authenticated
GRANT EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. PERBAIKAN advance_stage_qualifiers: Eliminasi error "record v_next_stage is not assigned yet"
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

    -- 12B. Validasi 2 arah untuk override manual (P1-06)
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

GRANT EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB) TO authenticated;

