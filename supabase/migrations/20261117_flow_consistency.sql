-- ============================================================================
-- 20261117 — Konsistensi alur lomba (Audit Lanjutan Kelompok 3–4)
--   S1 Peserta seri di luar posisi kritis berbagi peringkat yang sama di hasil resmi
--   S2 Rubrik lembar nilai ditetapkan server dari aturan kompetisi babak
--   S3 is_assigned_judge mewajibkan keanggotaan tenant aktif
--   S5 Undian server mengunci baris babak (cegah undian ganda bersamaan)
--   S6 Hapus peserta / tenant lewat RPC transaksional
--   S7 Nilai akhir tidak melebihi nilai maksimal rubrik (paritas dengan klien)
--   S8 Perubahan kuota/jumlah juara tercatat di audit; soal yang sudah dinilai terkunci
--   J6 Hapus pemetaan heuristik kategori -> bidang berdasarkan nama
-- ============================================================================

-- ---------------------------------------------------------------------------
-- S2. Rubrik lembar nilai = rubrik aturan kompetisi babak (bila aturan ada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_stage_rubric_version(p_stage_participation_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT crc.rubric_version_id
    FROM public.stage_participations sp
    JOIN public.stages s ON s.id = sp.stage_id
    JOIN public.participants p ON p.id = sp.participant_id
    JOIN public.competition_rule_configs crc
      ON crc.tenant_id = sp.tenant_id
     AND crc.status = 'Aktif'
     AND crc.rubric_version_id IS NOT NULL
     AND (crc.branch_id IS NULL OR crc.branch_id = COALESCE(s.branch_id, p.branch_id))
    WHERE sp.id = p_stage_participation_id
    ORDER BY CASE WHEN crc.branch_id = COALESCE(s.branch_id, p.branch_id) THEN 0 ELSE 1 END,
             crc.created_at DESC
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.enforce_assessment_rubric_from_rule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rule_rubric UUID;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.rubric_version_id IS DISTINCT FROM OLD.rubric_version_id THEN
        RAISE EXCEPTION 'ASSESSMENT_RUBRIC_LOCKED: Rubrik lembar penilaian tidak dapat diganti setelah lembar dibuat.';
    END IF;
    IF TG_OP = 'INSERT' THEN
        v_rule_rubric := public.resolve_stage_rubric_version(NEW.stage_participation_id);
        IF v_rule_rubric IS NOT NULL THEN
            NEW.rubric_version_id := v_rule_rubric;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assessment_rubric_from_rule ON public.judge_assessments;
CREATE TRIGGER trg_assessment_rubric_from_rule
    BEFORE INSERT OR UPDATE OF rubric_version_id ON public.judge_assessments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_assessment_rubric_from_rule();

-- ---------------------------------------------------------------------------
-- S6. Penghapusan transaksional
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_participant_safe(p_tenant_id UUID, p_participant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_part RECORD;
    v_actor RECORD;
    v_sheet_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Tidak terautentikasi.';
    END IF;
    IF NOT (public.is_tenant_admin(p_tenant_id) OR public.is_superadmin()) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin.';
    END IF;
    SELECT * INTO v_part FROM public.participants WHERE id = p_participant_id AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Peserta tidak ditemukan pada tenant ini.';
    END IF;

    SELECT COUNT(*) INTO v_sheet_count
    FROM public.judge_assessments ja
    JOIN public.stage_participations sp ON sp.id = ja.stage_participation_id
    WHERE sp.participant_id = p_participant_id;
    IF v_sheet_count > 0 THEN
        RAISE EXCEPTION 'PARTICIPANT_HAS_ASSESSMENTS: Peserta "%" sudah memiliki % lembar penilaian (termasuk draf) dan tidak dapat dihapus. Gunakan keputusan diskualifikasi.', v_part.name, v_sheet_count;
    END IF;

    -- Semua langkah berjalan dalam satu transaksi: bila satu gagal, seluruhnya dibatalkan
    DELETE FROM public.assigned_maqras am
    USING public.stage_participations sp
    WHERE am.stage_participation_id = sp.id AND sp.participant_id = p_participant_id;
    DELETE FROM public.stage_participations WHERE participant_id = p_participant_id;
    DELETE FROM public.participants WHERE id = p_participant_id;

    SELECT name, role INTO v_actor FROM public.profiles WHERE id = auth.uid();
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);
    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (p_tenant_id, auth.uid(), COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
            'PARTICIPANT_DELETED', 'Peserta: ' || v_part.name || ' (' || v_part.participant_code || ')',
            'Peserta dihapus beserta data babak dan maqra yang belum dinilai.', 'Success');

    RETURN jsonb_build_object('success', true, 'participant_id', p_participant_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_tenant_safe(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tenant RECORD;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Superadmin yang dapat menghapus penyelenggara.';
    END IF;
    IF p_tenant_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RAISE EXCEPTION 'Tenant sistem tidak dapat dihapus.';
    END IF;
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Penyelenggara tidak ditemukan.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.judge_assessments WHERE tenant_id = p_tenant_id)
       OR EXISTS (SELECT 1 FROM public.stages WHERE tenant_id = p_tenant_id AND is_finalized = true)
       OR EXISTS (SELECT 1 FROM public.audit_logs WHERE tenant_id = p_tenant_id)
       OR EXISTS (SELECT 1 FROM public.lottery_draw_logs WHERE tenant_id = p_tenant_id) THEN
        RAISE EXCEPTION 'TENANT_HAS_HISTORY: Penyelenggara "%" sudah memiliki riwayat penilaian, undian, atau audit dan tidak dapat dihapus. Ubah statusnya menjadi Nonaktif untuk mengarsipkan.', v_tenant.name;
    END IF;

    -- Satu transaksi: seluruh data anak terhapus bersama tenant, atau tidak sama sekali
    DELETE FROM public.assigned_maqras WHERE tenant_id = p_tenant_id;
    DELETE FROM public.stage_participations WHERE tenant_id = p_tenant_id;
    DELETE FROM public.judge_assignments WHERE tenant_id = p_tenant_id;
    DELETE FROM public.questions WHERE tenant_id = p_tenant_id;
    DELETE FROM public.participants WHERE tenant_id = p_tenant_id;
    DELETE FROM public.stages WHERE tenant_id = p_tenant_id;
    DELETE FROM public.kafilahs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.competition_rule_configs WHERE tenant_id = p_tenant_id;
    DELETE FROM public.error_categories WHERE tenant_id = p_tenant_id;
    DELETE FROM public.branches WHERE tenant_id = p_tenant_id;
    DELETE FROM public.levels WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenant_memberships WHERE tenant_id = p_tenant_id;
    DELETE FROM public.tenants WHERE id = p_tenant_id;

    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- S8. Audit perubahan konfigurasi babak & kunci soal yang sudah dinilai
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_stage_config_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor RECORD;
BEGIN
    IF NEW.qualification_quota IS DISTINCT FROM OLD.qualification_quota
       OR NEW.champion_count IS DISTINCT FROM OLD.champion_count
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.stage_order IS DISTINCT FROM OLD.stage_order THEN
        SELECT name, role INTO v_actor FROM public.profiles WHERE id = auth.uid();
        PERFORM set_config('mtq.rpc_audit_active', 'true', true);
        INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
        VALUES (
            NEW.tenant_id, auth.uid(),
            COALESCE(v_actor.name, 'Sistem') || ' (' || COALESCE(v_actor.role, 'sistem') || ')',
            'STAGE_CONFIG_CHANGED',
            'Babak: ' || NEW.name,
            format('Kuota %s -> %s; jumlah juara %s -> %s; urutan %s -> %s; cabang %s -> %s',
                   OLD.qualification_quota, NEW.qualification_quota,
                   COALESCE(OLD.champion_count::text, '-'), COALESCE(NEW.champion_count::text, '-'),
                   OLD.stage_order, NEW.stage_order,
                   COALESCE(OLD.branch_id::text, '-'), COALESCE(NEW.branch_id::text, '-')),
            'Success'
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_stage_config_change ON public.stages;
CREATE TRIGGER trg_audit_stage_config_change
    AFTER UPDATE ON public.stages
    FOR EACH ROW EXECUTE FUNCTION public.audit_stage_config_change();

CREATE OR REPLACE FUNCTION public.enforce_question_content_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' OR (
        NEW.surah_number IS DISTINCT FROM OLD.surah_number
        OR NEW.start_ayah IS DISTINCT FROM OLD.start_ayah
        OR NEW.end_ayah IS DISTINCT FROM OLD.end_ayah
        OR NEW.page_number IS DISTINCT FROM OLD.page_number
        OR NEW.page_start IS DISTINCT FROM OLD.page_start
        OR NEW.page_end IS DISTINCT FROM OLD.page_end
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM public.assigned_maqras am
            JOIN public.judge_assessments ja ON ja.assigned_maqra_id = am.id
            WHERE am.question_id = OLD.id
        ) THEN
            RAISE EXCEPTION 'QUESTION_LOCKED: Soal "%" sudah dipakai pada lembar penilaian; rentang ayat/halaman tidak dapat diubah atau dihapus. Buat soal baru.', OLD.code;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_question_content_lock ON public.questions;
CREATE TRIGGER trg_question_content_lock
    BEFORE UPDATE OR DELETE ON public.questions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_question_content_lock();


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

    -- S5: kunci baris babak agar dua undian bersamaan tidak saling menimpa
    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id AND tenant_id = p_tenant_id FOR UPDATE;
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

            -- J6: tidak ada lagi tebakan bidang berdasarkan kemiripan nama (ILIKE); kategori wajib dipetakan eksplisit

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
    -- S7: nilai akhir tidak boleh melebihi nilai maksimal rubrik (paritas dengan scoringEngine klien)
    v_final_score := ROUND(GREATEST(0, LEAST(COALESCE(v_rubric.starting_score, 100.00), v_final_score)), 2);

    RETURN jsonb_build_object(
        'final_score', v_final_score,
        'total_deductions', v_total_deductions,
        'field_scores', v_field_scores,
        'field_deductions', v_field_deductions,
        'deductions', v_deductions
    );
END;
$$;

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
                                SELECT ROUND(LEAST(
                                    COALESCE((SELECT rv.starting_score FROM public.rubric_versions rv WHERE rv.id = v_rubric_version_id), 100.00),
                                    SUM(field_avg * COALESCE(rf.weight, 1))
                                ), 2)
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

CREATE OR REPLACE FUNCTION public.is_assigned_judge(
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
    SELECT (
        auth.uid() IS NOT NULL
        AND (p_judge_id = auth.uid() OR is_tenant_admin(p_tenant_id))
        AND EXISTS (
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
              -- S3: hakim wajib masih berstatus anggota aktif tenant (sama dengan syarat compute_stage_rankings)
              AND EXISTS (
                  SELECT 1 FROM tenant_memberships tm
                  WHERE tm.tenant_id = sp.tenant_id
                    AND tm.profile_id = p_judge_id
                    AND tm.status = 'Aktif'
              )
        )
    );
$$;


REVOKE EXECUTE ON FUNCTION public.resolve_stage_rubric_version(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_stage_rubric_version(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_participant_safe(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_participant_safe(UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_tenant_safe(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tenant_safe(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.is_assigned_judge(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_judge(UUID, UUID, UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_assessment_score_sql(UUID, UUID, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.draw_lottery_server(UUID, UUID, UUID, UUID, INT, VARCHAR, TEXT, UUID[], UUID[]) TO authenticated;

