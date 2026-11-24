-- =============================================================================
-- 20261127 — Live Scoring (layar publik peserta yang sedang tampil)
-- Aman dijalankan berulang (idempotent). Tidak mengubah data peserta atau nilai.
--
-- Halaman publik /live/<KODE PENYELENGGARA> menampilkan peserta yang sedang tampil:
-- nomor undian, nama lengkap, nama ayah, asal (kafilah/instansi), cabang, dan babak. TIDAK ADA NILAI.
-- Maqra bersifat rahasia: TERSEMBUNYI secara bawaan. Admin menampilkan satu maqra
-- (Maqra 1, Maqra 2, ...) bila sudah waktunya; maqra yang belum ditampilkan tidak pernah
-- dikirim ke publik. Pindah peserta otomatis menyembunyikan maqra lagi.
--
-- Rancangan:
--   1. Tabel live_sessions: satu baris per babak (babak sudah spesifik per cabang).
--      Kolom `display` berisi salinan ringkas data yang boleh tampil di layar publik,
--      dibuat oleh server. Saat sesi dihentikan, `display` dikosongkan sehingga nama
--      peserta tidak lagi terbuka untuk publik.
--   2. Tabel hanya bisa diubah lewat RPC live_session_control (admin penyelenggara).
--   3. Pengunjung tanpa login membaca lewat RPC get_live_sessions(kode) dan menerima
--      pembaruan lewat realtime (tabel didaftarkan ke publikasi supabase_realtime).
--      get_live_sessions berjalan dengan hak pengunjung (SECURITY INVOKER) dan hanya
--      membaca live_sessions; tidak ada fungsi SECURITY DEFINER yang dibuka untuk publik.
--   4. Mulai dan berhenti sesi tercatat di audit_logs (LIVE_SESSION_STARTED/STOPPED).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabel sesi
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    stage_id UUID NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    hide_names BOOLEAN NOT NULL DEFAULT false,
    current_stage_participation_id UUID REFERENCES public.stage_participations(id) ON DELETE SET NULL,
    display JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT live_sessions_stage_unique UNIQUE (stage_id)
);

-- Identitas penyelenggara disalin ke baris sesi agar halaman publik tidak perlu membaca
-- tabel tenants (yang tertutup untuk publik). Diperbarui setiap kali sesi diatur.
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS tenant_code TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS tenant_name TEXT;
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS event_name TEXT;
CREATE INDEX IF NOT EXISTS idx_live_sessions_code ON public.live_sessions (UPPER(tenant_code));

-- Maqra yang sedang ditampilkan ke publik (1, 2, ...). NULL = maqra disembunyikan.
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS shown_maqra_index INT;

-- Versi awal fungsi (tanpa parameter maqra) diganti: hapus agar tidak ada fungsi ganda
DROP FUNCTION IF EXISTS public.live_session_build_display(UUID, UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.live_session_control(UUID, TEXT, UUID, BOOLEAN);

CREATE INDEX IF NOT EXISTS idx_live_sessions_tenant ON public.live_sessions (tenant_id, is_active);

ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Baris boleh dibaca siapa pun (dibutuhkan realtime pengunjung tanpa login).
-- Isinya hanya data layar publik; sesi yang tidak aktif tidak memuat data peserta.
DROP POLICY IF EXISTS live_sessions_public_select ON public.live_sessions;
CREATE POLICY live_sessions_public_select ON public.live_sessions
    FOR SELECT TO anon, authenticated
    USING (true);

REVOKE ALL ON public.live_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.live_sessions TO anon, authenticated;

-- Realtime: kirim baris lengkap saat UPDATE
ALTER TABLE public.live_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
           WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_sessions'
       ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Urutan tampil: nomor undian (angka), lalu teks undian, lalu nama.
--    Peserta berstatus Ditolak tidak ikut.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_stage_order(p_stage_id UUID)
RETURNS TABLE (stage_participation_id UUID, pos INT, total INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT x.id, x.rn::int, (COUNT(*) OVER ())::int
    FROM (
        SELECT sp.id,
               ROW_NUMBER() OVER (
                   ORDER BY NULLIF(regexp_replace(COALESCE(NULLIF(sp.lottery_number, ''), p.lottery_number, ''), '[^0-9]', '', 'g'), '')::numeric NULLS LAST,
                            COALESCE(NULLIF(sp.lottery_number, ''), p.lottery_number) NULLS LAST,
                            p.name,
                            sp.id
               ) AS rn
        FROM public.stage_participations sp
        JOIN public.participants p ON p.id = sp.participant_id
        WHERE sp.stage_id = p_stage_id
          AND COALESCE(p.verification_status, '') <> 'Ditolak'
    ) x;
$$;

-- -----------------------------------------------------------------------------
-- 2b. Daftar maqra peserta berurutan (Maqra 1, Maqra 2, ...): halaman, lalu waktu penetapan
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_participation_maqras(p_stage_participation_id UUID)
RETURNS TABLE (idx INT, surah_name TEXT, surah_number INT, start_ayah INT, end_ayah INT, page_start INT, page_end INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT (ROW_NUMBER() OVER (ORDER BY q.page_start, am.assigned_at, q.id))::int,
           q.surah_name::text, q.surah_number, q.start_ayah, q.end_ayah, q.page_start, q.page_end
    FROM public.assigned_maqras am
    JOIN public.questions q ON q.id = am.question_id
    WHERE am.stage_participation_id = p_stage_participation_id;
$$;

-- -----------------------------------------------------------------------------
-- 3. Isi layar publik untuk satu sesi (tanpa nilai). Hanya maqra ke-p_maqra_index
--    yang disertakan; bila NULL, tidak ada data maqra sama sekali (hanya jumlahnya).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. Kendali sesi (admin penyelenggara)
--    p_action: start | stop | set | next | prev | options | refresh | show_maqra | hide_maqra
--    show_maqra memakai p_maqra_index (1, 2, ...). Pindah peserta menyembunyikan maqra.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.live_session_control(
    p_stage_id UUID,
    p_action TEXT,
    p_stage_participation_id UUID DEFAULT NULL,
    p_hide_names BOOLEAN DEFAULT NULL,
    p_maqra_index INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor RECORD;
    v_stage public.stages%ROWTYPE;
    v_session public.live_sessions%ROWTYPE;
    v_action TEXT := LOWER(TRIM(COALESCE(p_action, '')));
    v_current UUID;
    v_hide BOOLEAN;
    v_pos INT;
    v_branch_name TEXT;
    v_tenant RECORD;
    v_maqra INT;
    v_maqra_count INT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;
    IF v_action NOT IN ('start', 'stop', 'set', 'next', 'prev', 'options', 'refresh', 'show_maqra', 'hide_maqra') THEN
        RAISE EXCEPTION 'LIVE_INVALID_ACTION: Perintah sesi live tidak dikenal (%).', p_action;
    END IF;

    SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Babak musabaqah tidak ditemukan.';
    END IF;
    IF NOT public.is_tenant_admin(v_stage.tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator penyelenggara yang dapat mengatur sesi live.';
    END IF;

    SELECT * INTO v_session FROM public.live_sessions WHERE stage_id = p_stage_id FOR UPDATE;
    IF NOT FOUND THEN
        IF v_action NOT IN ('start', 'options') THEN
            RAISE EXCEPTION 'LIVE_NOT_ACTIVE: Sesi live untuk babak ini belum dimulai.';
        END IF;
        INSERT INTO public.live_sessions (tenant_id, stage_id, branch_id)
        VALUES (v_stage.tenant_id, v_stage.id, v_stage.branch_id)
        RETURNING * INTO v_session;
    END IF;

    SELECT code, name, event_name INTO v_tenant FROM public.tenants WHERE id = v_stage.tenant_id;
    UPDATE public.live_sessions
    SET tenant_code = v_tenant.code, tenant_name = v_tenant.name, event_name = v_tenant.event_name
    WHERE id = v_session.id;

    IF v_action NOT IN ('start', 'stop', 'options') AND NOT v_session.is_active THEN
        RAISE EXCEPTION 'LIVE_NOT_ACTIVE: Sesi live untuk babak ini belum dimulai.';
    END IF;

    -- Peserta yang dipilih wajib terdaftar di babak ini dan tidak Ditolak
    IF p_stage_participation_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.live_stage_order(p_stage_id) o WHERE o.stage_participation_id = p_stage_participation_id
    ) THEN
        RAISE EXCEPTION 'LIVE_INVALID_PARTICIPANT: Peserta tidak terdaftar pada babak ini.';
    END IF;

    v_hide := COALESCE(p_hide_names, v_session.hide_names, false);
    v_current := v_session.current_stage_participation_id;
    v_maqra := v_session.shown_maqra_index;
    -- Peserta lama sudah tidak berlaku (dipindah/Ditolak): mulai dari awal
    IF v_current IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.live_stage_order(p_stage_id) o WHERE o.stage_participation_id = v_current
    ) THEN
        v_current := NULL;
    END IF;

    IF v_action = 'start' THEN
        v_current := COALESCE(
            p_stage_participation_id,
            v_current,
            (SELECT o.stage_participation_id FROM public.live_stage_order(p_stage_id) o ORDER BY o.pos LIMIT 1)
        );
    ELSIF v_action = 'set' THEN
        IF p_stage_participation_id IS NULL THEN
            RAISE EXCEPTION 'LIVE_INVALID_PARTICIPANT: Pilih peserta yang sedang tampil.';
        END IF;
        v_current := p_stage_participation_id;
    ELSIF v_action IN ('next', 'prev') THEN
        SELECT o.pos INTO v_pos FROM public.live_stage_order(p_stage_id) o WHERE o.stage_participation_id = v_current;
        IF v_pos IS NULL THEN
            v_current := (SELECT o.stage_participation_id FROM public.live_stage_order(p_stage_id) o
                          ORDER BY CASE WHEN v_action = 'next' THEN o.pos ELSE -o.pos END LIMIT 1);
        ELSE
            v_current := COALESCE(
                (SELECT o.stage_participation_id FROM public.live_stage_order(p_stage_id) o
                 WHERE o.pos = v_pos + CASE WHEN v_action = 'next' THEN 1 ELSE -1 END),
                v_current
            );
        END IF;
    END IF;

    -- Maqra: bawaan tersembunyi; disembunyikan lagi setiap kali peserta berganti atau sesi dimulai/berhenti
    IF v_action IN ('start', 'stop', 'hide_maqra')
       OR v_current IS DISTINCT FROM v_session.current_stage_participation_id THEN
        v_maqra := NULL;
    END IF;
    IF v_action = 'show_maqra' THEN
        SELECT COUNT(*)::int INTO v_maqra_count FROM public.assigned_maqras am WHERE am.stage_participation_id = v_current;
        IF v_current IS NULL OR p_maqra_index IS NULL OR p_maqra_index < 1 OR p_maqra_index > COALESCE(v_maqra_count, 0) THEN
            RAISE EXCEPTION 'LIVE_INVALID_MAQRA: Maqra yang dipilih tidak ada untuk peserta ini.';
        END IF;
        v_maqra := p_maqra_index;
    END IF;

    IF v_action = 'stop' THEN
        UPDATE public.live_sessions
        SET is_active = false,
            hide_names = v_hide,
            current_stage_participation_id = v_current,
            shown_maqra_index = NULL,
            display = '{}'::jsonb,
            ended_at = now(),
            updated_at = now()
        WHERE id = v_session.id
        RETURNING * INTO v_session;
    ELSE
        UPDATE public.live_sessions
        SET is_active = CASE WHEN v_action = 'start' THEN true ELSE is_active END,
            hide_names = v_hide,
            current_stage_participation_id = v_current,
            shown_maqra_index = v_maqra,
            branch_id = v_stage.branch_id,
            started_at = CASE WHEN v_action = 'start' AND NOT is_active THEN now() ELSE started_at END,
            ended_at = CASE WHEN v_action = 'start' THEN NULL ELSE ended_at END,
            display = CASE
                WHEN v_action = 'start' OR is_active THEN public.live_session_build_display(p_stage_id, v_current, v_hide, v_maqra)
                ELSE '{}'::jsonb
            END,
            updated_at = now()
        WHERE id = v_session.id
        RETURNING * INTO v_session;
    END IF;

    IF v_action IN ('start', 'stop') THEN
        SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
        SELECT COALESCE(b.name, 'Semua Cabang') INTO v_branch_name FROM public.branches b WHERE b.id = v_stage.branch_id;
        PERFORM set_config('mtq.rpc_audit_active', 'true', true);
        INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
        VALUES (
            v_stage.tenant_id,
            v_actor_id,
            COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
            CASE WHEN v_action = 'start' THEN 'LIVE_SESSION_STARTED' ELSE 'LIVE_SESSION_STOPPED' END,
            'Live: ' || v_stage.name || ' (' || COALESCE(v_branch_name, 'Semua Cabang') || ')',
            CASE WHEN v_action = 'start'
                THEN 'Sesi live scoring dimulai untuk babak ' || v_stage.name || ' cabang ' || COALESCE(v_branch_name, 'Semua Cabang')
                     || CASE WHEN v_hide THEN ' (nama peserta disembunyikan).' ELSE '.' END
                ELSE 'Sesi live scoring dihentikan untuk babak ' || v_stage.name || ' cabang ' || COALESCE(v_branch_name, 'Semua Cabang') || '.'
            END,
            'Success'
        );
    END IF;

    RETURN to_jsonb(v_session);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Bacaan publik (tanpa login) berdasarkan kode penyelenggara
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_live_sessions(p_tenant_code TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
    WITH sess AS (
        SELECT ls.*
        FROM public.live_sessions ls
        WHERE UPPER(ls.tenant_code) = UPPER(TRIM(COALESCE(p_tenant_code, '')))
    ),
    info AS (
        SELECT tenant_id, tenant_name, event_name, tenant_code
        FROM sess
        ORDER BY updated_at DESC
        LIMIT 1
    )
    SELECT CASE
        WHEN NOT EXISTS (SELECT 1 FROM info) THEN jsonb_build_object('found', false)
        ELSE (
            SELECT jsonb_build_object(
                'found', true,
                'tenant_id', i.tenant_id,
                'tenant_name', i.tenant_name,
                'event_name', i.event_name,
                'tenant_code', i.tenant_code,
                'sessions', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', r.id,
                        'stage_id', r.stage_id,
                        'display', r.display,
                        'updated_at', r.updated_at
                    ) ORDER BY r.display ->> 'branch_name', r.display ->> 'stage_name', r.started_at)
                    FROM sess r
                    WHERE r.is_active = true
                ), '[]'::jsonb)
            )
            FROM info i
        )
    END;
$$;

REVOKE EXECUTE ON FUNCTION public.live_stage_order(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.live_participation_maqras(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.live_session_build_display(UUID, UUID, BOOLEAN, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.live_session_control(UUID, TEXT, UUID, BOOLEAN, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_session_control(UUID, TEXT, UUID, BOOLEAN, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_live_sessions(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_sessions(TEXT) TO anon, authenticated;

INSERT INTO public.app_schema_versions (version)
VALUES ('20261127')
ON CONFLICT (version) DO NOTHING;
