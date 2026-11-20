-- =============================================================================
-- 20261124 — Kelengkapan babak per bidang (bukan per hakim)
-- Aman dijalankan berulang (idempotent). Tidak mengubah data.
--
-- Sebelumnya babak/juara baru bisa disahkan bila SETIAP hakim yang ditugaskan sudah
-- menilai SETIAP peserta. Itu tidak cocok bila dewan hakim dibagi menjadi beberapa tim
-- dalam satu babak (mis. Tim A dan Tim B masing-masing menilai separuh peserta).
--
-- Aturan baru: peserta dianggap lengkap bila untuk setiap maqra dan setiap bidang rubrik
-- aktif sudah ada minimal satu lembar FINAL dari hakim yang memegang bidang itu.
-- Nilai bidang tetap rata-rata dari hakim pemegang bidang yang menilai (perhitungan nilai
-- tidak berubah). Peserta yang terlewat, atau bidangnya belum dinilai, tetap menghalangi
-- pengesahan. Bidang tanpa hakim sama sekali (FIELD_WITHOUT_JUDGE) tetap ditolak.
--
-- Fungsi yang diganti (salinan definisi 20261120 dengan aturan kelengkapan baru):
--   get_stage_completion_sql, compute_stage_rankings, advance_stage_qualifiers
-- Fungsi baru: stage_effective_rubric, stage_participation_field_coverage
-- =============================================================================

-- Rubrik yang berlaku untuk sebuah babak (urutan sama dengan compute_stage_rankings:
-- aturan cabang aktif -> rubrik yang dipakai lembar penilaian -> rubrik aktif cabang)
CREATE OR REPLACE FUNCTION public.stage_effective_rubric(p_stage_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_rubric_version_id UUID;
BEGIN
    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT crc.rubric_version_id INTO v_rubric_version_id
    FROM public.competition_rule_configs crc
    WHERE crc.tenant_id = v_stage.tenant_id
      AND crc.status = 'Aktif'
      AND (v_stage.branch_id IS NULL OR crc.branch_id = v_stage.branch_id OR crc.branch_id IS NULL)
    ORDER BY
        CASE WHEN v_stage.branch_id IS NOT NULL AND crc.branch_id = v_stage.branch_id THEN 0 ELSE 1 END ASC,
        crc.updated_at DESC,
        crc.created_at DESC
    LIMIT 1;

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

    RETURN v_rubric_version_id;
END;
$$;

-- Cakupan penilaian satu peserta pada babaknya:
--   required_units = jumlah maqra x jumlah bidang aktif yang dipegang minimal satu hakim aktif
--                    (x 1 bila rubrik tanpa bidang). Bidang tanpa hakim sama sekali ditangani
--                    terpisah (FIELD_WITHOUT_JUDGE) dan tetap memblokir pengesahan.
--   covered_units  = pasangan (maqra, bidang) yang sudah punya lembar final terkunci dari
--                    hakim aktif babak itu yang memegang bidang tersebut
CREATE OR REPLACE FUNCTION public.stage_participation_field_coverage(
    p_stage_participation_id uuid,
    p_rubric_version_id uuid
)
RETURNS TABLE (required_units integer, covered_units integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sp RECORD;
    v_stage RECORD;
    v_maqra_count INT := 0;
    v_field_count INT := 0;
BEGIN
    SELECT * INTO v_sp FROM public.stage_participations WHERE id = p_stage_participation_id;
    IF NOT FOUND THEN
        required_units := 0;
        covered_units := 0;
        RETURN NEXT;
        RETURN;
    END IF;
    SELECT * INTO v_stage FROM public.stages WHERE id = v_sp.stage_id;

    SELECT COUNT(*) INTO v_maqra_count
    FROM public.assigned_maqras am
    WHERE am.stage_participation_id = v_sp.id;

    WITH active_judges AS (
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
    ),
    judge_scope AS (
        SELECT aj.judge_profile_id,
               public.get_judge_stage_fields(aj.judge_profile_id, v_stage.id, p_rubric_version_id) AS scope
        FROM active_judges aj
    ),
    held_fields AS (
        -- Bidang aktif yang dipegang minimal satu hakim aktif babak ini
        SELECT rf.name
        FROM public.rubric_fields rf
        WHERE p_rubric_version_id IS NOT NULL
          AND rf.rubric_version_id = p_rubric_version_id
          AND rf.status = 'Aktif'
          AND EXISTS (
              SELECT 1 FROM judge_scope js
              WHERE js.scope IS NULL
                 OR LOWER(TRIM(rf.name)) IN (SELECT LOWER(TRIM(x)) FROM unnest(js.scope) x)
          )
    ),
    final_sheets AS (
        SELECT jass.assigned_maqra_id, js.scope
        FROM public.judge_assessments jass
        JOIN judge_scope js ON js.judge_profile_id = jass.judge_profile_id
        JOIN public.assigned_maqras am
          ON am.id = jass.assigned_maqra_id
         AND am.stage_participation_id = v_sp.id
        WHERE jass.stage_participation_id = v_sp.id
          AND jass.status = 'finalized'
          AND jass.is_locked = true
    )
    SELECT
        (SELECT COUNT(*)::int FROM held_fields),
        CASE WHEN (SELECT COUNT(*) FROM held_fields) > 0 THEN (
            SELECT COUNT(*)::int
            FROM public.assigned_maqras am
            CROSS JOIN held_fields rf
            WHERE am.stage_participation_id = v_sp.id
              AND EXISTS (
                  SELECT 1 FROM final_sheets fs
                  WHERE fs.assigned_maqra_id = am.id
                    AND (fs.scope IS NULL
                         OR LOWER(TRIM(rf.name)) IN (SELECT LOWER(TRIM(x)) FROM unnest(fs.scope) x))
              )
        ) ELSE (
            SELECT COUNT(*)::int
            FROM public.assigned_maqras am
            WHERE am.stage_participation_id = v_sp.id
              AND EXISTS (SELECT 1 FROM final_sheets fs WHERE fs.assigned_maqra_id = am.id)
        ) END
    INTO v_field_count, covered_units;

    required_units := v_maqra_count * GREATEST(v_field_count, 1);
    covered_units := COALESCE(covered_units, 0);
    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_effective_rubric(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stage_participation_field_coverage(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_stage_completion_sql(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    v_uncovered_fields TEXT[] := ARRAY[]::text[];
    v_rubric_version_id UUID;
    v_cov RECORD;
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
          -- Peserta Ditolak tidak diundi/dinilai: tidak ikut syarat kelengkapan babak
          AND NOT EXISTS (SELECT 1 FROM public.participants px WHERE px.id = sp.participant_id AND px.verification_status = 'Ditolak')
    LOOP
        v_total_participants := v_total_participants + 1;

        SELECT COUNT(*)
        INTO v_sp_maqra_count
        FROM public.assigned_maqras am
        WHERE am.stage_participation_id = v_sp.id;

        IF v_sp_maqra_count = 0 THEN
            v_missing_maqra_participants := v_missing_maqra_participants + 1;
        END IF;

        -- Kelengkapan per bidang: setiap (maqra x bidang) cukup dinilai satu hakim pemegang bidang itu
        IF v_rubric_version_id IS NULL THEN
            v_rubric_version_id := public.stage_effective_rubric(v_stage.id);
        END IF;
        SELECT * INTO v_cov FROM public.stage_participation_field_coverage(v_sp.id, v_rubric_version_id);
        v_total_required_units := v_total_required_units + COALESCE(v_cov.required_units, 0);

        v_sp_finalized_units := COALESCE(v_cov.covered_units, 0);

        v_finalized_units := v_finalized_units + v_sp_finalized_units;

        IF v_sp_maqra_count >= 1
           AND v_required_judge_count >= 1
           AND COALESCE(v_cov.required_units, 0) > 0
           AND v_sp_finalized_units = v_cov.required_units
        THEN
            v_completed_participants := v_completed_participants + 1;
        END IF;
    END LOOP;

    v_uncovered_fields := COALESCE(
        public.get_stage_uncovered_fields(v_stage.id, public.resolve_stage_rubric_by_stage(v_stage.id)),
        ARRAY[]::text[]
    );

    v_all_complete := (
        COALESCE(array_length(v_uncovered_fields, 1), 0) = 0 AND
        v_total_participants > 0
        AND v_required_judge_count > 0
        AND v_missing_maqra_participants = 0
        AND v_completed_participants = v_total_participants
    );

    IF v_total_participants = 0 THEN
        v_blocking_code := 'NO_PARTICIPANTS';
    ELSIF v_required_judge_count = 0 THEN
        v_blocking_code := 'NO_JUDGES';
    ELSIF COALESCE(array_length(v_uncovered_fields, 1), 0) > 0 THEN
        v_blocking_code := 'FIELD_WITHOUT_JUDGE';
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
        'blocking_code', v_blocking_code,
        'uncovered_fields', to_jsonb(v_uncovered_fields)
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.advance_stage_qualifiers(p_stage_id uuid, p_next_stage_id uuid, p_qualified_participant_ids uuid[], p_override_reasons jsonb DEFAULT '{}'::jsonb, p_rankings_snapshot jsonb DEFAULT '[]'::jsonb, p_tie_resolution jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      AND sp.tenant_id = v_stage.tenant_id
      AND NOT EXISTS (SELECT 1 FROM public.participants px WHERE px.id = sp.participant_id AND px.verification_status = 'Ditolak');

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
      -- Peserta Ditolak memang tidak diundi, jadi tidak dihitung "belum punya maqra"
      AND NOT EXISTS (SELECT 1 FROM public.participants px WHERE px.id = sp.participant_id AND px.verification_status = 'Ditolak')
      AND NOT EXISTS (
          SELECT 1 FROM public.assigned_maqras am
          WHERE am.stage_participation_id = sp.id
            AND am.tenant_id = v_stage.tenant_id
      );

    IF v_unassigned_maqra_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Masih terdapat % peserta yang belum memiliki penetapan maqra pada babak ini.', v_unassigned_maqra_count;
    END IF;

    -- Bidang tanpa hakim sama sekali dilaporkan lebih dulu (pesan paling jelas)
    IF COALESCE(array_length(public.get_stage_uncovered_fields(p_stage_id, public.stage_effective_rubric(p_stage_id)), 1), 0) > 0 THEN
        RAISE EXCEPTION 'FIELD_WITHOUT_JUDGE: Pengesahan babak ditolak: bidang % belum dipegang hakim mana pun pada babak ini. Tugaskan hakim untuk bidang tersebut, lalu nilai ulang pesertanya.',
            array_to_string(public.get_stage_uncovered_fields(p_stage_id, public.stage_effective_rubric(p_stage_id)), ', ');
    END IF;

    -- Kelengkapan per bidang: setiap peserta (kecuali Ditolak) wajib punya lembar final untuk
    -- setiap (maqra x bidang) dari minimal satu hakim pemegang bidang itu. Tidak harus semua hakim.
    SELECT COUNT(*) INTO v_incomplete_count
    FROM public.stage_participations sp
    JOIN public.participants p ON p.id = sp.participant_id
    CROSS JOIN LATERAL public.stage_participation_field_coverage(sp.id, public.stage_effective_rubric(p_stage_id)) cov
    WHERE sp.stage_id = p_stage_id
      AND sp.tenant_id = v_stage.tenant_id
      AND p.verification_status <> 'Ditolak'
      AND (COALESCE(cov.required_units, 0) = 0 OR cov.covered_units < cov.required_units);

    IF v_incomplete_count > 0 THEN
        RAISE EXCEPTION 'Pengesahan babak ditolak: Masih terdapat % peserta yang penilaiannya belum difinalisasi untuk semua bidang rubrik. Setiap bidang wajib punya minimal satu lembar final dari hakim pemegang bidang itu.', v_incomplete_count;
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

    -- Hakim multi-bidang: setiap bidang rubrik wajib dipegang minimal satu hakim
    IF jsonb_array_length(COALESCE(v_computed_data -> 'uncovered_fields', '[]'::jsonb)) > 0 THEN
        RAISE EXCEPTION 'FIELD_WITHOUT_JUDGE: Pengesahan babak ditolak: bidang % belum dipegang hakim mana pun pada babak ini. Tugaskan hakim untuk bidang tersebut, lalu nilai ulang pesertanya.',
            (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_computed_data -> 'uncovered_fields') x);
    END IF;
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
        -- S1: seri yang tidak diputus pleno (di luar posisi kritis) berbagi peringkat yang sama;
        --     nomor undian hanya dipakai untuk urutan tampilan, bukan peringkat resmi
        rank = CASE
            WHEN ro.is_tied
                 AND NOT (COALESCE(p_tie_resolution ->> ro.participant_id::text, '') ~ '^[0-9]+$')
            THEN ro.true_rank
            ELSE ro.resolved_rank
        END
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
$function$;

CREATE OR REPLACE FUNCTION public.compute_stage_rankings(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    v_starting_score NUMERIC := 100.00;
    v_uncovered_fields TEXT[] := ARRAY[]::text[];
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

    IF v_rubric_version_id IS NOT NULL THEN
        SELECT COALESCE(rv.starting_score, 100.00) INTO v_starting_score
        FROM public.rubric_versions rv WHERE rv.id = v_rubric_version_id;
        v_uncovered_fields := public.get_stage_uncovered_fields(p_stage_id, v_rubric_version_id);
    END IF;

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
    -- Hakim multi-bidang: cakupan bidang tiap hakim (NULL = semua bidang)
    judge_scope AS (
        SELECT aj.judge_profile_id,
               public.get_judge_stage_fields(aj.judge_profile_id, p_stage_id, v_rubric_version_id) AS scope
        FROM active_judges aj
    ),
    -- Nilai bidang per peserta: rata-rata HANYA dari hakim yang memegang bidang itu
    scoped_field_scores AS (
        SELECT va.stage_participation_id,
               rf.name AS field_name,
               ROUND(AVG(public.get_field_score(va.field_scores, rf.name)), 2) AS field_avg
        FROM valid_assessments va
        JOIN judge_scope js ON js.judge_profile_id = va.judge_profile_id
        JOIN public.rubric_fields rf
          ON rf.rubric_version_id = v_rubric_version_id
         AND rf.status = 'Aktif'
        WHERE js.scope IS NULL
           OR LOWER(TRIM(rf.name)) IN (SELECT LOWER(TRIM(x)) FROM unnest(js.scope) x)
        GROUP BY va.stage_participation_id, rf.name
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
            cov.required_units AS coverage_required_units,
            cov.covered_units AS coverage_covered_units,
            (
                SELECT CASE
                    WHEN COUNT(va.id) = 0 THEN NULL
                    WHEN v_rubric_version_id IS NOT NULL AND EXISTS (
                        SELECT 1 FROM public.rubric_fields rf0
                        WHERE rf0.rubric_version_id = v_rubric_version_id AND rf0.status = 'Aktif'
                    ) THEN COALESCE((
                        -- Total = jumlah (rata-rata bidang x bobot), sama dengan cara lembar hakim dihitung.
                        -- Bidang yang belum dinilai hakimnya (peserta belum lengkap) memakai rata-rata semua lembar.
                        -- Bila ada bidang tanpa nilai sama sekali (data lembar tidak lengkap), jangan anggap
                        -- nilai penuh: pakai rata-rata nilai akhir lembar seperti sebelumnya.
                        SELECT CASE
                            WHEN COUNT(*) FILTER (WHERE COALESCE(sfs.field_avg, ufa.field_avg) IS NULL) > 0 THEN NULL
                            ELSE ROUND(GREATEST(0, LEAST(
                                v_starting_score,
                                SUM(ROUND(COALESCE(sfs.field_avg, ufa.field_avg) * COALESCE(rf.weight, 1), 2))
                            )), 2)
                        END
                        FROM public.rubric_fields rf
                        LEFT JOIN scoped_field_scores sfs
                          ON sfs.stage_participation_id = sp.id
                         AND sfs.field_name = rf.name
                        LEFT JOIN LATERAL (
                            SELECT ROUND(AVG(public.get_field_score(va3.field_scores, rf.name)), 2) AS field_avg
                            FROM valid_assessments va3
                            WHERE va3.stage_participation_id = sp.id
                        ) ufa ON true
                        WHERE rf.rubric_version_id = v_rubric_version_id
                          AND rf.status = 'Aktif'
                    ), ROUND(AVG(va.final_score)::numeric, 2))
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
                    SELECT COALESCE(
                        (
                            SELECT sfs.field_avg
                            FROM scoped_field_scores sfs
                            WHERE sfs.stage_participation_id = sp.id
                              AND LOWER(sfs.field_name) = LOWER(all_fields.fname)
                            LIMIT 1
                        ),
                        (
                            SELECT ROUND(AVG(public.get_field_score(va.field_scores, all_fields.fname)), 2)
                            FROM valid_assessments va
                            WHERE va.stage_participation_id = sp.id
                        )
                    ) AS fval
                ) calc
            ) AS field_scores
        FROM public.stage_participations sp
        JOIN public.participants p ON p.id = sp.participant_id
        CROSS JOIN LATERAL public.stage_participation_field_coverage(sp.id, v_rubric_version_id) cov
        LEFT JOIN public.kafilahs k ON k.id = p.kafilah_id
        LEFT JOIN public.branches b ON b.id = COALESCE(v_stage.branch_id, p.branch_id)
        WHERE sp.stage_id = p_stage_id
          AND sp.tenant_id = v_stage.tenant_id
          -- Peserta Ditolak tidak ikut peringkat
          AND p.verification_status <> 'Ditolak'
    ),
    participant_vectors AS (
        SELECT
            pa.*,
            (
                -- Lengkap = setiap (maqra x bidang) sudah punya lembar final dari hakim pemegang bidang itu.
                -- Tidak harus dinilai semua hakim (mis. dua tim juri dalam satu babak).
                pa.maqra_count >= 1
                AND v_required_judge_count >= 1
                AND COALESCE(pa.coverage_required_units, 0) > 0
                AND pa.coverage_covered_units = pa.coverage_required_units
            ) AS is_complete,
            CASE
                WHEN pa.computed_score IS NULL THEN NULL::numeric[]
                ELSE ARRAY[pa.computed_score] || COALESCE(
                    ARRAY(
                        SELECT public.get_field_score(pa.field_scores, crit_name)
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
                'required_units', op.coverage_required_units,
                'covered_units', op.coverage_covered_units,
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
        'uncovered_fields', to_jsonb(COALESCE(v_uncovered_fields, ARRAY[]::text[])),
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
            AND COALESCE(array_length(v_uncovered_fields, 1), 0) = 0
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
$function$;

REVOKE EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) TO authenticated;

INSERT INTO public.app_schema_versions (version)
VALUES ('20261124')
ON CONFLICT (version) DO NOTHING;
