-- =============================================================================
-- 20261130 — Tanggal lahir peserta, usia di layar Live, dan perlindungan nomor undian
-- Aman dijalankan berulang (idempotent).
--
-- 1. participants.birth_date (boleh kosong).
-- 2. live_session_build_display menambahkan 'age' (usia dalam tahun, dihitung server
--    pada hari tampil). Tanggal lahir sendiri TIDAK dikirim ke layar publik.
-- 3. Nomor undian hasil undian babak (stage_participations.lottery_number) tidak boleh
--    dikosongkan oleh penyimpanan data peserta. Sebelumnya, mengedit/mengimpor peserta
--    menyalin nomor undian pendaftaran (yang kini boleh kosong) ke seluruh babak peserta.
-- 4. Pemulihan: nomor undian yang terhapus dipulihkan dari riwayat undian terakhir
--    (lottery_draw_logs) per babak yang belum disahkan.
-- =============================================================================

-- 1. Tanggal lahir ---------------------------------------------------------------
ALTER TABLE public.participants ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.participants DROP CONSTRAINT IF EXISTS participants_birth_date_check;
ALTER TABLE public.participants ADD CONSTRAINT participants_birth_date_check
    CHECK (birth_date IS NULL OR birth_date >= DATE '1900-01-01');

-- 2. Usia di layar Live (sama dengan 20261127, ditambah 'age') --------------------
CREATE OR REPLACE FUNCTION public.live_session_build_display(
    p_stage_id UUID,
    p_stage_participation_id UUID,
    p_hide_names BOOLEAN,
    p_maqra_index INT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_participant JSONB := NULL;
    v_position INT := NULL;
    v_total INT := 0;
BEGIN
    SELECT s.id, s.name, s.branch_id, COALESCE(b.name, 'Semua Cabang') AS branch_name
    INTO v_stage
    FROM public.stages s
    LEFT JOIN public.branches b ON b.id = s.branch_id
    WHERE s.id = p_stage_id;

    SELECT COUNT(*)::int INTO v_total FROM public.live_stage_order(p_stage_id);

    IF p_stage_participation_id IS NOT NULL THEN
        SELECT o.pos INTO v_position
        FROM public.live_stage_order(p_stage_id) o
        WHERE o.stage_participation_id = p_stage_participation_id;

        SELECT jsonb_build_object(
            'lottery_number', COALESCE(NULLIF(sp.lottery_number, ''), p.lottery_number, '-'),
            'name', CASE WHEN p_hide_names THEN NULL ELSE p.name END,
            'father_name', CASE WHEN p_hide_names THEN NULL ELSE NULLIF(TRIM(COALESCE(p.father_name, '')), '') END,
            'age', CASE
                WHEN p.birth_date IS NULL OR p.birth_date > CURRENT_DATE THEN NULL
                ELSE date_part('year', age(CURRENT_DATE, p.birth_date))::int
            END,
            'name_hidden', COALESCE(p_hide_names, false),
            'origin', COALESCE(NULLIF(k.name, ''), '-'),
            'branch_name', COALESCE(bp.name, v_stage.branch_name),
            'maqra_count', (
                SELECT COUNT(*)::int FROM public.assigned_maqras am WHERE am.stage_participation_id = sp.id
            ),
            'maqra', CASE WHEN p_maqra_index IS NULL THEN NULL ELSE (
                SELECT jsonb_build_object(
                    'index', m.idx,
                    'surah_name', m.surah_name,
                    'surah_number', m.surah_number,
                    'start_ayah', m.start_ayah,
                    'end_ayah', m.end_ayah,
                    'page_start', m.page_start,
                    'page_end', m.page_end
                )
                FROM public.live_participation_maqras(sp.id) m
                WHERE m.idx = p_maqra_index
            ) END
        )
        INTO v_participant
        FROM public.stage_participations sp
        JOIN public.participants p ON p.id = sp.participant_id
        LEFT JOIN public.kafilahs k ON k.id = p.kafilah_id
        LEFT JOIN public.branches bp ON bp.id = COALESCE(v_stage.branch_id, p.branch_id)
        WHERE sp.id = p_stage_participation_id
          AND sp.stage_id = p_stage_id;
    END IF;

    RETURN jsonb_build_object(
        'stage_name', v_stage.name,
        'branch_name', v_stage.branch_name,
        'hide_names', COALESCE(p_hide_names, false),
        'participant', v_participant,
        'position', v_position,
        'total', v_total,
        'updated_at', now()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.live_session_build_display(UUID, UUID, BOOLEAN, INT) FROM PUBLIC, anon, authenticated;

-- 3. Nomor undian babak tidak boleh dikosongkan oleh penyimpanan biasa -------------
CREATE OR REPLACE FUNCTION public.stage_participations_keep_lottery()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF btrim(COALESCE(OLD.lottery_number, '')) <> ''
       AND btrim(COALESCE(NEW.lottery_number, '')) = '' THEN
        NEW.lottery_number := OLD.lottery_number;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.stage_participations_keep_lottery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sp_keep_lottery ON public.stage_participations;
CREATE TRIGGER trg_sp_keep_lottery
    BEFORE UPDATE OF lottery_number ON public.stage_participations
    FOR EACH ROW EXECUTE FUNCTION public.stage_participations_keep_lottery();

-- 4. Pulihkan nomor undian dari riwayat undian terakhir per babak -----------------
--    Hanya baris yang nomornya kosong atau sama dengan nomor pendaftaran (tanda tertimpa),
--    dan hanya babak yang belum disahkan.
WITH latest_log AS (
    SELECT DISTINCT ON (l.stage_id) l.stage_id, l.draw_results
    FROM public.lottery_draw_logs l
    WHERE l.stage_id IS NOT NULL
      AND COALESCE(l.draw_mode, 'both') IN ('lottery_number', 'both')
    ORDER BY l.stage_id, l.draw_version DESC, l.created_at DESC
),
drawn AS (
    SELECT ll.stage_id,
           (elem ->> 'participantId') AS participant_id,
           NULLIF(btrim(elem ->> 'lotteryNumber'), '') AS lottery_number
    FROM latest_log ll
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(ll.draw_results) = 'array' THEN ll.draw_results ELSE '[]'::jsonb END
    ) elem
)
UPDATE public.stage_participations sp
SET lottery_number = d.lottery_number,
    updated_at = now()
FROM drawn d, public.participants p, public.stages s
WHERE d.lottery_number IS NOT NULL
  AND d.participant_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND sp.stage_id = d.stage_id
  AND sp.participant_id = d.participant_id::uuid
  AND p.id = sp.participant_id
  AND s.id = sp.stage_id
  AND COALESCE(s.is_finalized, false) = false
  AND (
      btrim(COALESCE(sp.lottery_number, '')) = ''
      OR btrim(sp.lottery_number) = btrim(COALESCE(p.lottery_number, ''))
  )
  AND sp.lottery_number IS DISTINCT FROM d.lottery_number;

INSERT INTO public.app_schema_versions (version)
VALUES ('20261130')
ON CONFLICT (version) DO NOTHING;
