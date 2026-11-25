-- =============================================================================
-- 20261128 — Nomor undian peserta boleh kosong saat pendaftaran/impor
-- Aman dijalankan berulang (idempotent). Tidak mengubah data.
--
-- Sebelumnya kolom participants.lottery_number wajib unik per (penyelenggara, cabang),
-- sehingga dua peserta di cabang yang sama tanpa nomor undian (string kosong) saling
-- bertabrakan dan impor gagal. Nomor undian resmi per babak diberikan saat undian
-- (draw_lottery_server, disimpan di stage_participations), jadi saat pendaftaran
-- nomor ini boleh kosong.
--
-- Perubahan: batasan unik lama diganti indeks unik parsial yang hanya berlaku untuk
-- nomor undian yang terisi. Nomor yang terisi tetap tidak boleh ganda dalam satu cabang.
-- =============================================================================

DO $$
DECLARE
    v_con RECORD;
BEGIN
    FOR v_con IN
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = 'public.participants'::regclass
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(c.conkey) k(attnum)
              JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
          ) = ARRAY['branch_id', 'lottery_number', 'tenant_id']
    LOOP
        EXECUTE format('ALTER TABLE public.participants DROP CONSTRAINT %I', v_con.conname);
    END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_participants_branch_lottery_filled
    ON public.participants (tenant_id, branch_id, lottery_number)
    WHERE btrim(lottery_number) <> '';

ALTER TABLE public.participants ALTER COLUMN lottery_number SET DEFAULT '';

INSERT INTO public.app_schema_versions (version)
VALUES ('20261128')
ON CONFLICT (version) DO NOTHING;
