-- =============================================================================
-- 20261120 — Integritas multi-cabang & hakim multi-bidang
-- Aman dijalankan berulang (idempotent). Tidak mengubah data yang sudah ada.
--
-- Latar belakang: setiap cabang lomba memiliki babaknya sendiri, dan nama babak
-- ("Penyisihan", "Final") berulang di tiap cabang. Sebelum migrasi ini database
-- menerima peserta maupun penugasan hakim yang menempel pada babak milik cabang
-- lain, sehingga cabang-cabang bisa tercampur dalam satu babak.
--
-- Isi:
--   1. Peserta hanya boleh masuk babak milik cabangnya sendiri
--   2. Penugasan hakim harus sesuai cabang babak, tidak boleh kembar, dan
--      bidangnya harus ada di rubrik cabang itu
--   3. Satu aturan kompetisi aktif per cabang; rubrik terkunci setelah ada nilai final
--   4. Babak tanpa cabang tidak boleh bernama kembar
--   5. Peserta berstatus Ditolak tidak lagi memblokir babak; hakim boleh
--      memegang satu, beberapa, atau semua bidang dengan nilai bidang yang
--      dirata-rata hanya dari hakim bidang itu
--   6. RPC audit_multi_branch_consistency untuk memeriksa data lama
--   7. Health Check tidak lagi salah melaporkan versi skema sebagai critical
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PESERTA <-> BABAK: cabang harus sama
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_stage_participation_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_part RECORD;
BEGIN
    -- Baris lama yang tidak diubah babak/pesertanya dibiarkan (perbaikan data lama dilakukan terpisah).
    IF TG_OP = 'UPDATE'
       AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id
       AND NEW.participant_id IS NOT DISTINCT FROM OLD.participant_id THEN
        RETURN NEW;
    END IF;

    SELECT s.branch_id, s.name, b.name AS branch_name
    INTO v_stage
    FROM public.stages s
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE s.id = NEW.stage_id;

    SELECT p.branch_id, p.name, b.name AS branch_name
    INTO v_part
    FROM public.participants p
    LEFT JOIN public.branches b ON b.id = p.branch_id
    WHERE p.id = NEW.participant_id;

    IF v_stage.branch_id IS NOT NULL
       AND v_part.branch_id IS NOT NULL
       AND v_stage.branch_id <> v_part.branch_id THEN
        RAISE EXCEPTION 'STAGE_BRANCH_MISMATCH: Peserta "%" terdaftar pada cabang "%", sedangkan babak "%" adalah milik cabang "%". Buat babak "%" untuk cabang "%" terlebih dahulu, lalu daftarkan peserta ke babak tersebut.',
            v_part.name, COALESCE(v_part.branch_name, '-'), v_stage.name, COALESCE(v_stage.branch_name, '-'),
            v_stage.name, COALESCE(v_part.branch_name, '-');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_participation_branch ON public.stage_participations;
CREATE TRIGGER trg_enforce_stage_participation_branch
    BEFORE INSERT OR UPDATE ON public.stage_participations
    FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_participation_branch();

CREATE OR REPLACE FUNCTION public.enforce_participant_stage_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_branch_name TEXT;
BEGIN
    IF NEW.stage_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id
       AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id THEN
        RETURN NEW;
    END IF;

    SELECT s.branch_id, s.name, b.name AS branch_name
    INTO v_stage
    FROM public.stages s
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE s.id = NEW.stage_id;

    IF v_stage.branch_id IS NOT NULL AND v_stage.branch_id <> NEW.branch_id THEN
        SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
        RAISE EXCEPTION 'STAGE_BRANCH_MISMATCH: Peserta "%" terdaftar pada cabang "%", sedangkan babak "%" adalah milik cabang "%". Buat babak "%" untuk cabang "%" terlebih dahulu.',
            NEW.name, COALESCE(v_branch_name, '-'), v_stage.name, COALESCE(v_stage.branch_name, '-'),
            v_stage.name, COALESCE(v_branch_name, '-');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_participant_stage_branch ON public.participants;
CREATE TRIGGER trg_enforce_participant_stage_branch
    BEFORE INSERT OR UPDATE ON public.participants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_participant_stage_branch();

-- -----------------------------------------------------------------------------
-- 2. PENUGASAN HAKIM: sesuai cabang babak, tidak kembar, bidang ada di rubrik cabang
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_judge_assignment_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_branch_name TEXT;
    v_field_name TEXT;
    v_rubric_id UUID;
    v_rubric_name TEXT;
    v_active_config_count INTEGER;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id
       AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
       AND NEW.rubric_field_id IS NOT DISTINCT FROM OLD.rubric_field_id
       AND NEW.judge_field IS NOT DISTINCT FROM OLD.judge_field
       AND NEW.judge_profile_id IS NOT DISTINCT FROM OLD.judge_profile_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT s.branch_id, s.name, b.name AS branch_name
    INTO v_stage
    FROM public.stages s
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE s.id = NEW.stage_id;

    IF v_stage.branch_id IS NOT NULL THEN
        IF NEW.branch_id IS NULL THEN
            -- Babak sudah milik satu cabang: isi cabang penugasan agar konsisten.
            NEW.branch_id := v_stage.branch_id;
        ELSIF NEW.branch_id <> v_stage.branch_id THEN
            SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
            RAISE EXCEPTION 'JUDGE_ASSIGNMENT_BRANCH_MISMATCH: Penugasan untuk cabang "%" tidak dapat ditempelkan pada babak "%" milik cabang "%". Pilih babak "%" milik cabang "%" (buat dulu bila belum ada).',
                COALESCE(v_branch_name, '-'), v_stage.name, COALESCE(v_stage.branch_name, '-'),
                v_stage.name, COALESCE(v_branch_name, '-');
        END IF;
    END IF;

    IF NEW.status = 'Aktif' THEN
        IF EXISTS (
            SELECT 1
            FROM public.judge_assignments ja
            WHERE ja.tenant_id = NEW.tenant_id
              AND ja.stage_id = NEW.stage_id
              AND ja.judge_profile_id = NEW.judge_profile_id
              AND ja.status = 'Aktif'
              AND ja.id <> NEW.id
              AND ja.rubric_field_id IS NOT DISTINCT FROM NEW.rubric_field_id
              AND (
                  NEW.rubric_field_id IS NOT NULL
                  OR LOWER(TRIM(COALESCE(ja.judge_field, ''))) = LOWER(TRIM(COALESCE(NEW.judge_field, '')))
              )
        ) THEN
            RAISE EXCEPTION 'JUDGE_ASSIGNMENT_DUPLICATE: Hakim ini sudah ditugaskan pada babak dan bidang yang sama.';
        END IF;

        -- Bidang yang ditugaskan harus ada di rubrik aktif cabang babak ini.
        IF NEW.rubric_field_id IS NOT NULL AND v_stage.branch_id IS NOT NULL THEN
            SELECT rf.name INTO v_field_name FROM public.rubric_fields rf WHERE rf.id = NEW.rubric_field_id;

            SELECT COUNT(*) INTO v_active_config_count
            FROM public.competition_rule_configs crc
            WHERE crc.tenant_id = NEW.tenant_id
              AND crc.status = 'Aktif'
              AND crc.branch_id = v_stage.branch_id;

            IF v_active_config_count = 1 AND v_field_name IS NOT NULL THEN
                SELECT crc.rubric_version_id, rv.name
                INTO v_rubric_id, v_rubric_name
                FROM public.competition_rule_configs crc
                JOIN public.rubric_versions rv ON rv.id = crc.rubric_version_id
                WHERE crc.tenant_id = NEW.tenant_id
                  AND crc.status = 'Aktif'
                  AND crc.branch_id = v_stage.branch_id;

                IF v_rubric_id IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM public.rubric_fields rf
                    WHERE rf.rubric_version_id = v_rubric_id
                      AND rf.status = 'Aktif'
                      AND LOWER(TRIM(rf.name)) = LOWER(TRIM(v_field_name))
                ) THEN
                    RAISE EXCEPTION 'JUDGE_FIELD_NOT_IN_RUBRIC: Bidang "%" tidak ada pada rubrik "%" yang dipakai cabang "%". Pilih bidang dari rubrik cabang tersebut.',
                        v_field_name, v_rubric_name, COALESCE(v_stage.branch_name, '-');
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_judge_assignment_branch ON public.judge_assignments;
CREATE TRIGGER trg_enforce_judge_assignment_branch
    BEFORE INSERT OR UPDATE ON public.judge_assignments
    FOR EACH ROW EXECUTE FUNCTION public.enforce_judge_assignment_branch();

-- -----------------------------------------------------------------------------
-- 3. ATURAN KOMPETISI: satu aturan aktif per cabang; rubrik terkunci setelah ada nilai final
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_rule_config_uniqueness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_branch_name TEXT;
BEGIN
    IF NEW.status = 'Aktif'
       AND NOT (
           TG_OP = 'UPDATE'
           AND OLD.status = 'Aktif'
           AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
       )
       AND EXISTS (
           SELECT 1
           FROM public.competition_rule_configs crc
           WHERE crc.tenant_id = NEW.tenant_id
             AND crc.status = 'Aktif'
             AND crc.id <> NEW.id
             AND crc.branch_id IS NOT DISTINCT FROM NEW.branch_id
       ) THEN
        SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
        RAISE EXCEPTION 'RULE_CONFIG_DUPLICATE_ACTIVE: Cabang "%" sudah memiliki aturan kompetisi berstatus Aktif. Ubah aturan yang sudah ada, atau arsipkan dulu. Aturan berbeda per jenjang dalam satu cabang belum didukung: buat cabang terpisah untuk tiap golongan.',
            COALESCE(v_branch_name, COALESCE(NEW.branch_name, 'Semua Cabang'));
    END IF;

    IF TG_OP = 'UPDATE'
       AND NEW.status = 'Aktif'
       AND NEW.rubric_version_id IS DISTINCT FROM OLD.rubric_version_id
       AND EXISTS (
           SELECT 1
           FROM public.judge_assessments ja
           JOIN public.stage_participations sp ON sp.id = ja.stage_participation_id
           JOIN public.stages s ON s.id = sp.stage_id
           WHERE ja.tenant_id = NEW.tenant_id
             AND ja.status = 'finalized'
             AND s.is_finalized = false
             AND (NEW.branch_id IS NULL OR s.branch_id = NEW.branch_id)
       ) THEN
        RAISE EXCEPTION 'RULE_CONFIG_RUBRIC_LOCKED: Rubrik tidak dapat diganti karena sudah ada lembar nilai final pada babak yang belum disahkan. Mengganti rubrik di tengah babak membuat nilai peserta dihitung dengan rubrik berbeda.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_rule_config_uniqueness ON public.competition_rule_configs;
CREATE TRIGGER trg_enforce_rule_config_uniqueness
    BEFORE INSERT OR UPDATE ON public.competition_rule_configs
    FOR EACH ROW EXECUTE FUNCTION public.enforce_rule_config_uniqueness();

-- -----------------------------------------------------------------------------
-- 4. BABAK TANPA CABANG tidak boleh bernama kembar
--    (batasan unik lama tidak menjangkau branch_id NULL). Dilewati bila data lama
--    sudah punya nama kembar; periksa lewat audit_multi_branch_consistency.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.stages
        WHERE branch_id IS NULL
        GROUP BY tenant_id, name
        HAVING COUNT(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS stages_tenant_name_generic_key
            ON public.stages (tenant_id, name)
            WHERE branch_id IS NULL;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. KELENGKAPAN, PERINGKAT, DAN PENGESAHAN BABAK
--    a. Peserta berstatus Ditolak tidak dihitung (tidak diundi, tidak dinilai).
--    b. Hakim multi-bidang: nilai tiap bidang dirata-rata hanya dari hakim yang
--       memegang bidang itu; total = jumlah (rata-rata bidang x bobot).
--    c. Babak tidak bisa disahkan bila ada bidang rubrik tanpa hakim (FIELD_WITHOUT_JUDGE).
--    d. Status "Lengkap" hanya menghitung lembar dari hakim yang saat ini bertugas;
--       log audit finalisasi mencatat nilai hasil hitung server.
--    Fungsi di bawah identik dengan versi 20261118 kecuali bagian yang diberi komentar.
-- -----------------------------------------------------------------------------
-- -----------------------------------------------------------------------------
-- 5a. HAKIM MULTI-BIDANG: cakupan bidang per hakim per babak
--    Seorang hakim boleh ditugaskan pada satu bidang, beberapa bidang, atau semua
--    bidang (penugasan tanpa bidang). Nilai tiap bidang dirata-rata HANYA dari
--    hakim yang memegang bidang itu, sehingga lembar hakim bidang lain (yang
--    otomatis bernilai penuh di bidang yang bukan tugasnya) tidak lagi
--    mengencerkan potongan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_judge_stage_fields(p_judge_id UUID, p_stage_id UUID, p_rubric_version_id UUID)
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
        JOIN public.stages s ON s.id = ja.stage_id
        WHERE ja.stage_id = p_stage_id
          AND ja.judge_profile_id = p_judge_id
          AND ja.status = 'Aktif'
          AND (ja.branch_id IS NULL OR s.branch_id IS NULL OR ja.branch_id = s.branch_id)
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
        ELSIF NOT (v_name = ANY (v_fields)) THEN
            v_fields := array_append(v_fields, v_name);
        END IF;
    END LOOP;

    -- NULL berarti hakim menilai semua bidang (sama dengan get_judge_allowed_fields)
    IF v_unrestricted OR COALESCE(array_length(v_fields, 1), 0) = 0 THEN
        RETURN NULL;
    END IF;
    RETURN v_fields;
END;
$$;

-- Bidang aktif rubrik yang belum dipegang satu hakim pun pada babak ini.
-- Kosong bila semua bidang tercakup, atau bila babak belum punya hakim (ditangani NO_JUDGES).
CREATE OR REPLACE FUNCTION public.get_stage_uncovered_fields(p_stage_id UUID, p_rubric_version_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_scopes TEXT[][];
    v_judge RECORD;
    v_scope TEXT[];
    v_any_unrestricted BOOLEAN := false;
    v_any_judge BOOLEAN := false;
    v_covered TEXT[] := ARRAY[]::text[];
    v_result TEXT[];
BEGIN
    IF p_rubric_version_id IS NULL THEN
        RETURN ARRAY[]::text[];
    END IF;
    SELECT id, tenant_id, branch_id INTO v_stage FROM public.stages WHERE id = p_stage_id;
    IF NOT FOUND THEN
        RETURN ARRAY[]::text[];
    END IF;

    FOR v_judge IN
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
    LOOP
        v_any_judge := true;
        v_scope := public.get_judge_stage_fields(v_judge.judge_profile_id, p_stage_id, p_rubric_version_id);
        IF v_scope IS NULL THEN
            v_any_unrestricted := true;
        ELSE
            v_covered := v_covered || (SELECT array_agg(LOWER(TRIM(x))) FROM unnest(v_scope) x);
        END IF;
    END LOOP;

    IF NOT v_any_judge OR v_any_unrestricted THEN
        RETURN ARRAY[]::text[];
    END IF;

    SELECT COALESCE(array_agg(rf.name ORDER BY rf.field_order), ARRAY[]::text[])
    INTO v_result
    FROM public.rubric_fields rf
    WHERE rf.rubric_version_id = p_rubric_version_id
      AND rf.status = 'Aktif'
      AND NOT (LOWER(TRIM(rf.name)) = ANY (v_covered));

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_judge_stage_fields(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stage_uncovered_fields(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Rubrik resmi babak (aturan kompetisi aktif cabang babak itu)
CREATE OR REPLACE FUNCTION public.resolve_stage_rubric_by_stage(p_stage_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT crc.rubric_version_id
    FROM public.stages s
    JOIN public.competition_rule_configs crc
      ON crc.tenant_id = s.tenant_id
     AND crc.status = 'Aktif'
     AND crc.rubric_version_id IS NOT NULL
     AND (crc.branch_id IS NULL OR crc.branch_id = s.branch_id)
    WHERE s.id = p_stage_id
    ORDER BY CASE WHEN crc.branch_id = s.branch_id THEN 0 ELSE 1 END, crc.created_at DESC
    LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.resolve_stage_rubric_by_stage(UUID) FROM PUBLIC, anon, authenticated;

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
                pa.maqra_count >= 1
                AND v_required_judge_count >= 1
                AND pa.finalized_units_count = (pa.maqra_count * v_required_judge_count)
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

CREATE OR REPLACE FUNCTION public.finalize_judge_assessment(p_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

    -- Hanya lembar final dari hakim yang saat ini wajib menilai (hakim yang sudah dilepas tidak dihitung)
    SELECT COUNT(*) INTO v_finalized_units
    FROM assigned_maqras am
    JOIN judge_assessments jass
         ON jass.stage_participation_id = am.stage_participation_id
        AND jass.assigned_maqra_id = am.id
        AND jass.status = 'finalized'
        AND jass.is_locked = true
    WHERE am.stage_participation_id = v_sp.id
      AND jass.judge_profile_id IN (
          SELECT ja.judge_profile_id
          FROM judge_assignments ja
          JOIN participants p ON p.id = v_sp.participant_id
          WHERE ja.tenant_id = v_sp.tenant_id
            AND ja.stage_id = v_sp.stage_id
            AND (ja.branch_id IS NULL OR ja.branch_id = p.branch_id OR ja.branch_id = v_stage.branch_id)
            AND ja.status = 'Aktif'
      );

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
        'Finalisasi dan penguncian lembar penilaian dengan nilai akhir ' || (v_calc ->> 'final_score'),
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
$function$;


REVOKE EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_completion_sql(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_stage_rankings(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_stage_qualifiers(UUID, UUID, UUID[], JSONB, JSONB, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. PEMERIKSAAN DATA LAMA
--    Mengembalikan daftar ketidaksesuaian multi-cabang pada satu tenant. Hanya
--    membaca; tidak mengubah apa pun. Jalankan setelah migrasi:
--      select public.audit_multi_branch_consistency('<tenant_id>');
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_multi_branch_consistency(p_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;
    IF NOT (public.is_superadmin() OR public.is_tenant_admin(p_tenant_id)) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator penyelenggara atau Superadmin yang dapat menjalankan pemeriksaan ini.';
    END IF;

    SELECT jsonb_build_object(
        'peserta_di_babak_cabang_lain', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'kode_peserta', p.participant_code,
                'nama', p.name,
                'cabang_peserta', pb.name,
                'babak', s.name,
                'cabang_babak', sb.name,
                'babak_sudah_disahkan', s.is_finalized,
                'jumlah_lembar_nilai', (SELECT COUNT(*) FROM public.judge_assessments ja WHERE ja.stage_participation_id = sp.id)
            ) ORDER BY pb.name, p.participant_code)
            FROM public.stage_participations sp
            JOIN public.participants p ON p.id = sp.participant_id
            JOIN public.stages s ON s.id = sp.stage_id
            LEFT JOIN public.branches pb ON pb.id = p.branch_id
            LEFT JOIN public.branches sb ON sb.id = s.branch_id
            WHERE sp.tenant_id = p_tenant_id
              AND s.branch_id IS NOT NULL
              AND p.branch_id <> s.branch_id
        ), '[]'::jsonb),
        'penugasan_hakim_di_babak_cabang_lain', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'hakim', pr.name,
                'cabang_penugasan', jb.name,
                'babak', s.name,
                'cabang_babak', sb.name,
                'bidang', ja.judge_field
            ) ORDER BY pr.name)
            FROM public.judge_assignments ja
            JOIN public.stages s ON s.id = ja.stage_id
            LEFT JOIN public.profiles pr ON pr.id = ja.judge_profile_id
            LEFT JOIN public.branches jb ON jb.id = ja.branch_id
            LEFT JOIN public.branches sb ON sb.id = s.branch_id
            WHERE ja.tenant_id = p_tenant_id
              AND ja.status = 'Aktif'
              AND s.branch_id IS NOT NULL
              AND ja.branch_id IS NOT NULL
              AND ja.branch_id <> s.branch_id
        ), '[]'::jsonb),
        'cabang_dengan_lebih_dari_satu_aturan_aktif', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('cabang', COALESCE(x.branch_name, 'Semua Cabang'), 'jumlah_aturan_aktif', x.n))
            FROM (
                SELECT b.name AS branch_name, COUNT(*) AS n
                FROM public.competition_rule_configs crc
                LEFT JOIN public.branches b ON b.id = crc.branch_id
                WHERE crc.tenant_id = p_tenant_id AND crc.status = 'Aktif'
                GROUP BY crc.branch_id, b.name
                HAVING COUNT(*) > 1
            ) x
        ), '[]'::jsonb),
        'cabang_aktif_tanpa_babak', COALESCE((
            SELECT jsonb_agg(b.name ORDER BY b.name)
            FROM public.branches b
            WHERE b.tenant_id = p_tenant_id
              AND b.status = 'Aktif'
              AND NOT EXISTS (
                  SELECT 1 FROM public.stages s
                  WHERE s.tenant_id = b.tenant_id AND (s.branch_id = b.id OR s.branch_id IS NULL)
              )
        ), '[]'::jsonb),
        'cabang_aktif_tanpa_aturan_aktif', COALESCE((
            SELECT jsonb_agg(b.name ORDER BY b.name)
            FROM public.branches b
            WHERE b.tenant_id = p_tenant_id
              AND b.status = 'Aktif'
              AND NOT EXISTS (
                  SELECT 1 FROM public.competition_rule_configs crc
                  WHERE crc.tenant_id = b.tenant_id
                    AND crc.status = 'Aktif'
                    AND (crc.branch_id = b.id OR crc.branch_id IS NULL)
              )
        ), '[]'::jsonb),
        'babak_dengan_peserta_campuran_jenjang', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('cabang', x.branch_name, 'babak', x.stage_name, 'jumlah_jenjang', x.n))
            FROM (
                SELECT b.name AS branch_name, s.name AS stage_name, COUNT(DISTINCT p.level_id) AS n
                FROM public.stage_participations sp
                JOIN public.participants p ON p.id = sp.participant_id
                JOIN public.stages s ON s.id = sp.stage_id
                LEFT JOIN public.branches b ON b.id = s.branch_id
                WHERE sp.tenant_id = p_tenant_id AND p.level_id IS NOT NULL
                GROUP BY s.id, s.name, b.name
                HAVING COUNT(DISTINCT p.level_id) > 1
            ) x
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_multi_branch_consistency(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_multi_branch_consistency(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. HEALTH CHECK: versi skema yang diharapkan
--    Versi lama membandingkan dengan '20261118' secara persis, sehingga sejak migrasi
--    20261119 dijalankan Health Check selalu melaporkan versi skema "critical".
--    Fungsi di bawah identik dengan versi 20261118 kecuali pembanding versi tersebut.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_platform_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_latest_version TEXT;
    v_schema_detail JSONB;

    v_unmapped_count INT;
    v_unmapped_detail JSONB;

    v_borrowed_count INT;
    v_borrowed_detail JSONB;

    v_unverified_rubrics_count INT;
    v_unverified_rubrics_detail JSONB;

    v_orphan_tenants_count INT;
    v_orphan_tenants_detail JSONB;

    v_stages_no_judges_count INT;
    v_stages_no_judges_detail JSONB;

    v_pending_verif_count INT;
    v_pending_verif_detail JSONB;

    v_stalled_count INT;
    v_stalled_detail JSONB;

    v_site_missing_count INT;
    v_site_missing_detail JSONB;
BEGIN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Superadmin yang dapat menjalankan pemeriksaan kesehatan platform.';
    END IF;

    -- 1. schema_version
    SELECT MAX(version) INTO v_latest_version FROM public.app_schema_versions;
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'version', v.version,
                'applied_at', v.applied_at
            )
            ORDER BY v.version DESC
        ),
        '[]'::jsonb
    ) INTO v_schema_detail
    FROM (
        SELECT version, applied_at
        FROM public.app_schema_versions
        ORDER BY version DESC
        LIMIT 20
    ) v;

    -- 2. unmapped_error_categories
    SELECT COUNT(*)::int INTO v_unmapped_count
    FROM public.error_categories ec
    WHERE ec.status = 'Aktif'
      AND ec.rubric_field_id IS NULL
      AND ec.criterion_id IS NULL
      AND ec.deduction_rule_id IS NULL;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', u.id,
                'code', u.code,
                'name', u.name,
                'tenant_id', u.tenant_id,
                'tenant_name', u.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_unmapped_detail
    FROM (
        SELECT ec.id, ec.code, ec.name, ec.tenant_id, t.name AS tenant_name
        FROM public.error_categories ec
        JOIN public.tenants t ON t.id = ec.tenant_id
        WHERE ec.status = 'Aktif'
          AND ec.rubric_field_id IS NULL
          AND ec.criterion_id IS NULL
          AND ec.deduction_rule_id IS NULL
        ORDER BY t.name ASC, ec.code ASC
        LIMIT 20
    ) u;

    -- 3. borrowed_maqra_sheets
    SELECT COUNT(*)::int INTO v_borrowed_count
    FROM public.judge_assessments ja
    JOIN public.assigned_maqras am ON am.id = ja.assigned_maqra_id
    WHERE am.stage_participation_id <> ja.stage_participation_id;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'assessment_id', b.id,
                'stage_participation_id', b.stage_participation_id,
                'maqra_stage_participation_id', b.maqra_sp_id,
                'tenant_id', b.tenant_id,
                'tenant_name', b.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_borrowed_detail
    FROM (
        SELECT
            ja.id,
            ja.stage_participation_id,
            am.stage_participation_id AS maqra_sp_id,
            ja.tenant_id,
            t.name AS tenant_name
        FROM public.judge_assessments ja
        JOIN public.assigned_maqras am ON am.id = ja.assigned_maqra_id
        JOIN public.tenants t ON t.id = ja.tenant_id
        WHERE am.stage_participation_id <> ja.stage_participation_id
        ORDER BY ja.created_at DESC
        LIMIT 20
    ) b;

    -- 4. rubrics_without_official_source
    WITH unverified_items AS (
        SELECT
            'rubrik'::text AS jenis,
            rv.code AS identifier,
            rv.name AS item_name,
            COALESCE(NULLIF(TRIM(rv.official_source), ''), 'Belum diisi') AS official_source,
            rv.tenant_id,
            t.name AS tenant_name
        FROM public.rubric_versions rv
        JOIN public.tenants t ON t.id = rv.tenant_id
        WHERE COALESCE(TRIM(rv.official_source), '') = ''
        UNION ALL
        SELECT
            'aturan'::text AS jenis,
            COALESCE(crc.branch_name, 'Cabang') AS identifier,
            'Aturan Kompetisi ' || COALESCE(crc.branch_name, '') AS item_name,
            COALESCE(NULLIF(TRIM(crc.official_source), ''), 'Belum terverifikasi resmi') AS official_source,
            crc.tenant_id,
            t.name AS tenant_name
        FROM public.competition_rule_configs crc
        JOIN public.tenants t ON t.id = crc.tenant_id
        WHERE COALESCE(TRIM(crc.official_source), '') = ''
           OR crc.is_verified_official = false
    )
    SELECT
        COUNT(*)::int,
        COALESCE(
            (
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'jenis', ui.jenis,
                        'identifier', ui.identifier,
                        'name', ui.item_name,
                        'official_source', ui.official_source,
                        'tenant_id', ui.tenant_id,
                        'tenant_name', ui.tenant_name
                    )
                )
                FROM (SELECT * FROM unverified_items LIMIT 20) ui
            ),
            '[]'::jsonb
        )
    INTO v_unverified_rubrics_count, v_unverified_rubrics_detail
    FROM unverified_items;

    -- 5. tenants_without_active_admin
    SELECT COUNT(*)::int INTO v_orphan_tenants_count
    FROM public.tenants t
    WHERE t.status = 'Aktif'
      AND t.id <> '00000000-0000-0000-0000-000000000000'::uuid
      AND NOT EXISTS (
          SELECT 1 FROM public.tenant_memberships tm
          WHERE tm.tenant_id = t.id
            AND tm.role = 'admin'
            AND tm.status = 'Aktif'
      );

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'tenant_id', ot.id,
                'code', ot.code,
                'name', ot.name,
                'event_name', ot.event_name
            )
        ),
        '[]'::jsonb
    ) INTO v_orphan_tenants_detail
    FROM (
        SELECT t.id, t.code, t.name, t.event_name
        FROM public.tenants t
        WHERE t.status = 'Aktif'
          AND t.id <> '00000000-0000-0000-0000-000000000000'::uuid
          AND NOT EXISTS (
              SELECT 1 FROM public.tenant_memberships tm
              WHERE tm.tenant_id = t.id
                AND tm.role = 'admin'
                AND tm.status = 'Aktif'
          )
        ORDER BY t.created_at DESC
        LIMIT 20
    ) ot;

    -- 6. stages_without_judges
    SELECT COUNT(*)::int INTO v_stages_no_judges_count
    FROM public.stages s
    WHERE s.is_finalized = false
      AND EXISTS (
          SELECT 1 FROM public.stage_participations sp
          WHERE sp.stage_id = s.id
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.judge_assignments ja
          WHERE ja.stage_id = s.id
            AND ja.status = 'Aktif'
      );

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'stage_id', sj.id,
                'stage_name', sj.name,
                'tenant_id', sj.tenant_id,
                'tenant_name', sj.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_stages_no_judges_detail
    FROM (
        SELECT s.id, s.name, s.tenant_id, t.name AS tenant_name
        FROM public.stages s
        JOIN public.tenants t ON t.id = s.tenant_id
        WHERE s.is_finalized = false
          AND EXISTS (
              SELECT 1 FROM public.stage_participations sp
              WHERE sp.stage_id = s.id
          )
          AND NOT EXISTS (
              SELECT 1 FROM public.judge_assignments ja
              WHERE ja.stage_id = s.id
                AND ja.status = 'Aktif'
          )
        ORDER BY t.name ASC, s.stage_order ASC
        LIMIT 20
    ) sj;

    -- 7. pending_verifications
    SELECT COUNT(*)::int INTO v_pending_verif_count
    FROM public.participants p
    WHERE p.verification_status = 'Diajukan';

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'tenant_id', pv.tenant_id,
                'tenant_name', pv.tenant_name,
                'pending_count', pv.pending_count
            )
        ),
        '[]'::jsonb
    ) INTO v_pending_verif_detail
    FROM (
        SELECT
            t.id AS tenant_id,
            t.name AS tenant_name,
            COUNT(p.id)::int AS pending_count
        FROM public.participants p
        JOIN public.tenants t ON t.id = p.tenant_id
        WHERE p.verification_status = 'Diajukan'
        GROUP BY t.id, t.name
        ORDER BY COUNT(p.id) DESC
        LIMIT 20
    ) pv;

    -- 8. stalled_assessments
    SELECT COUNT(*)::int INTO v_stalled_count
    FROM public.judge_assessments ja
    WHERE ja.status = 'in_progress'
      AND ja.updated_at < (now() - interval '24 hours');

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'assessment_id', sa.id,
                'judge_name', sa.judge_name,
                'updated_at', sa.updated_at,
                'tenant_id', sa.tenant_id,
                'tenant_name', sa.tenant_name
            )
        ),
        '[]'::jsonb
    ) INTO v_stalled_detail
    FROM (
        SELECT
            ja.id,
            COALESCE(pr.name, 'Dewan Hakim') AS judge_name,
            ja.updated_at,
            ja.tenant_id,
            t.name AS tenant_name
        FROM public.judge_assessments ja
        JOIN public.tenants t ON t.id = ja.tenant_id
        LEFT JOIN public.profiles pr ON pr.id = ja.judge_profile_id
        WHERE ja.status = 'in_progress'
          AND ja.updated_at < (now() - interval '24 hours')
        ORDER BY ja.updated_at ASC
        LIMIT 20
    ) sa;

    -- 9. site_settings_missing
    SELECT COUNT(*)::int INTO v_site_missing_count
    FROM (
        SELECT 1
        WHERE NOT EXISTS (SELECT 1 FROM public.site_settings WHERE id = 'global')
           OR EXISTS (
               SELECT 1 FROM public.site_settings
               WHERE id = 'global'
                 AND (
                     COALESCE(TRIM(site_name), '') = ''
                     OR COALESCE(TRIM(default_title), '') = ''
                     OR COALESCE(TRIM(og_image_url), '') = ''
                 )
           )
    ) sm;

    IF v_site_missing_count > 0 THEN
        v_site_missing_detail := jsonb_build_array(
            jsonb_build_object(
                'id', 'global',
                'issue', 'Baris site_settings belum lengkap atau og_image_url kosong'
            )
        );
    ELSE
        v_site_missing_detail := '[]'::jsonb;
    END IF;

    RETURN jsonb_build_array(
        jsonb_build_object(
            'key', 'schema_version',
            'label', 'Versi Migrasi Skema Database',
            'status', CASE WHEN COALESCE(v_latest_version, '') >= '20261120' THEN 'ok' ELSE 'critical' END,
            'count', CASE WHEN COALESCE(v_latest_version, '') >= '20261120' THEN 0 ELSE 1 END,
            'detail', v_schema_detail,
            'how_to_fix', 'Pastikan seluruh migrasi hingga 20261120_multi_branch_integrity.sql telah dijalankan secara berurutan sesuai panduan di README.md.'
        ),
        jsonb_build_object(
            'key', 'unmapped_error_categories',
            'label', 'Kategori Kesalahan Aktif Tanpa Pemetaan Bidang Rubrik',
            'status', CASE WHEN v_unmapped_count > 0 THEN 'critical' ELSE 'ok' END,
            'count', v_unmapped_count,
            'detail', v_unmapped_detail,
            'how_to_fix', 'Buka menu Master Data & Rubrik pada penyelenggara terkait, lalu petakan setiap kategori kesalahan aktif ke bidang rubrik (rubric_field_id), kriteria, atau aturan potongan.'
        ),
        jsonb_build_object(
            'key', 'borrowed_maqra_sheets',
            'label', 'Lembar Penilaian dengan Maqra Milik Peserta Lain',
            'status', CASE WHEN v_borrowed_count > 0 THEN 'critical' ELSE 'ok' END,
            'count', v_borrowed_count,
            'detail', v_borrowed_detail,
            'how_to_fix', 'Periksa integritas lembar penilaian terkait dan pastikan assigned_maqra_id merujuk pada maqra milik stage_participation_id peserta yang sama.'
        ),
        jsonb_build_object(
            'key', 'rubrics_without_official_source',
            'label', 'Rubrik & Aturan Kompetisi Tanpa Rujukan Resmi',
            'status', CASE WHEN v_unverified_rubrics_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_unverified_rubrics_count,
            'detail', v_unverified_rubrics_detail,
            'how_to_fix', 'Buka Master Data & Rubrik, isi nomor SK/Juknis resmi LPTQ pada kolom official_source, dan tandai is_verified_official = true setelah diverifikasi.'
        ),
        jsonb_build_object(
            'key', 'tenants_without_active_admin',
            'label', 'Penyelenggara Aktif Tanpa Keanggotaan Admin Aktif',
            'status', CASE WHEN v_orphan_tenants_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_orphan_tenants_count,
            'detail', v_orphan_tenants_detail,
            'how_to_fix', 'Buka menu Manajemen Akun di Superadmin, lalu tambahkan atau aktifkan minimal satu akun Admin MTQ untuk penyelenggara tersebut.'
        ),
        jsonb_build_object(
            'key', 'stages_without_judges',
            'label', 'Babak Belum Disahkan Berpeserta Tanpa Penugasan Hakim Aktif',
            'status', CASE WHEN v_stages_no_judges_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_stages_no_judges_count,
            'detail', v_stages_no_judges_detail,
            'how_to_fix', 'Buka menu Manajemen Babak pada penyelenggara terkait dan tugaskan dewan hakim aktif pada babak yang memiliki peserta.'
        ),
        jsonb_build_object(
            'key', 'pending_verifications',
            'label', 'Peserta Berstatus Diajukan (Menunggu Verifikasi Berkas)',
            'status', CASE WHEN v_pending_verif_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_pending_verif_count,
            'detail', v_pending_verif_detail,
            'how_to_fix', 'Buka menu Grup & Peserta MTQ pada penyelenggara terkait untuk memverifikasi atau menolak berkas peserta sebelum undian dimulai.'
        ),
        jsonb_build_object(
            'key', 'stalled_assessments',
            'label', 'Lembar Penilaian In-Progress Lebih dari 24 Jam',
            'status', CASE WHEN v_stalled_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_stalled_count,
            'detail', v_stalled_detail,
            'how_to_fix', 'Buka menu Monitoring Penilaian Dewan Hakim untuk meninjau lembar penilaian yang tertahan lebih dari 24 jam.'
        ),
        jsonb_build_object(
            'key', 'site_settings_missing',
            'label', 'Kelengkapan Pengaturan SEO & Gambar Open Graph Situs',
            'status', CASE WHEN v_site_missing_count > 0 THEN 'warning' ELSE 'ok' END,
            'count', v_site_missing_count,
            'detail', v_site_missing_detail,
            'how_to_fix', 'Buka menu Pengaturan di Superadmin dan pastikan Nama Situs, Judul Bawaan, serta URL Gambar Open Graph (https://) telah terisi.'
        )
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_platform_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_health() TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Catat versi skema (dipakai Health Check)
-- -----------------------------------------------------------------------------
INSERT INTO public.app_schema_versions (version)
VALUES ('20261120')
ON CONFLICT (version) DO NOTHING;
