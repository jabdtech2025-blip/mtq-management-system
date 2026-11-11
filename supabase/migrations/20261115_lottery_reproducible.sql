-- ============================================================================
-- 20261115 — Undian server yang dapat diaudit ulang
--  * Urutan undian ditentukan HANYA oleh benih (seed) + ID, tanpa random(),
--    sehingga siapa pun dapat mereproduksi hasil dari seed_hex yang tersimpan.
--  * SHA-256 asli (bawaan PostgreSQL), tanpa fallback MD5.
--  * verify_lottery_draw(draw_log_id) untuk memeriksa ulang urutan peserta.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.lottery_sort_key(p_seed TEXT, p_a TEXT, p_b TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
    SELECT encode(sha256(convert_to(p_seed || ':' || p_a || ':' || p_b, 'UTF8')), 'hex');
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
      AND COALESCE(p.verification_status, 'Diajukan') <> 'Diverifikasi'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'PARTICIPANT_NOT_VERIFIED: Peserta "%" belum diverifikasi berkasnya (status: %). Hanya peserta berstatus Diverifikasi yang dapat mengikuti undian.', v_unverified.name, v_unverified.verification_status;
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

CREATE OR REPLACE FUNCTION public.verify_lottery_draw(p_draw_log_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_log RECORD;
    v_expected TEXT[];
    v_sha_ok BOOLEAN;
BEGIN
    SELECT * INTO v_log FROM public.lottery_draw_logs WHERE id = p_draw_log_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Log undian tidak ditemukan.';
    END IF;
    IF NOT (v_log.tenant_id IN (SELECT public.get_user_tenants()) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Log undian berada di luar tenant Anda.';
    END IF;
    IF v_log.seed_hex IS NULL THEN
        RETURN jsonb_build_object('verifiable', false, 'reason', 'Log ini dibuat sebelum undian dapat direproduksi (tanpa seed).');
    END IF;

    SELECT ARRAY_AGG(pid ORDER BY public.lottery_sort_key(v_log.seed_hex, pid, ''), pid::uuid)
    INTO v_expected
    FROM unnest(v_log.participant_ids) AS pid;

    v_sha_ok := encode(sha256(convert_to(v_log.seed_hex, 'UTF8')), 'hex') = v_log.seed_sha256;

    RETURN jsonb_build_object(
        'verifiable', true,
        'seed_sha256_valid', v_sha_ok,
        'participant_order_valid', v_expected = v_log.participant_ids,
        'expected_order', to_jsonb(v_expected),
        'recorded_order', to_jsonb(v_log.participant_ids)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lottery_sort_key(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lottery_sort_key(TEXT, TEXT, TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_lottery_draw(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_lottery_draw(UUID) TO authenticated;
