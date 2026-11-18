-- =============================================================================
-- 20261121 — Jenjang tidak dipakai lagi
-- Aman dijalankan berulang (idempotent). Tidak mengubah nilai, lembar penilaian,
-- peringkat, maupun hasil babak.
--
-- Keputusan: golongan dan jenis kelamin menjadi bagian dari nama cabang
-- (mis. "Tilawah Anak Putra"), jadi kolom jenjang terpisah tidak dipakai lagi.
-- Aplikasi sudah berhenti mengisi jenjang. Migrasi ini mengosongkan tautan
-- jenjang pada data lama, supaya:
--   * pencocokan soal dan undian tidak lagi menyaring berdasarkan jenjang
--     (undian server masih membandingkan level_id bila terisi);
--   * impor tidak lagi gagal karena jenjang.
--
-- Struktur tabel tidak diubah: kolom level_id dan tabel levels dibiarkan agar
-- aman. Riwayat undian (lottery_draw_logs) tidak diubah karena bersifat arsip.
--
-- Tambahan: nama, cabang, dan urutan babak dikunci di server setelah babak itu
-- memiliki lembar penilaian; kuota dan jumlah juara dikunci setelah babak disahkan.
-- =============================================================================

UPDATE public.questions SET level_id = NULL WHERE level_id IS NOT NULL;

-- Peserta: penjaga babak/verifikasi tidak terpicu karena hanya level_id yang berubah
UPDATE public.participants SET level_id = NULL WHERE level_id IS NOT NULL;

UPDATE public.judge_assignments
SET level_id = NULL, level_name = NULL
WHERE level_id IS NOT NULL OR level_name IS NOT NULL;

UPDATE public.rubric_versions SET level_id = NULL WHERE level_id IS NOT NULL;

-- Aturan kompetisi: indeks unik per (penyelenggara, cabang, jenjang). Aturan berjenjang
-- hanya dikosongkan bila cabangnya belum punya aturan tanpa jenjang; sisanya dilaporkan.
UPDATE public.competition_rule_configs crc
SET level_id = NULL
WHERE crc.level_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.competition_rule_configs other
      WHERE other.tenant_id = crc.tenant_id
        AND other.id <> crc.id
        AND other.level_id IS NULL
        AND other.branch_id IS NOT DISTINCT FROM crc.branch_id
  )
  AND crc.id = (
      SELECT min(x.id::text)::uuid FROM public.competition_rule_configs x
      WHERE x.tenant_id = crc.tenant_id
        AND x.level_id IS NOT NULL
        AND x.branch_id IS NOT DISTINCT FROM crc.branch_id
  );

DO $$
DECLARE
    v_left INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_left FROM public.competition_rule_configs WHERE level_id IS NOT NULL;
    IF v_left > 0 THEN
        RAISE NOTICE 'Masih ada % aturan kompetisi berjenjang karena cabangnya punya aturan lain. Periksa di Master Data > Aturan Cabang dan arsipkan yang tidak dipakai.', v_left;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Struktur babak terkunci setelah penilaian dimulai
-- Mengubah nama, cabang, atau urutan babak di tengah lomba memindahkan lembar
-- penilaian ke babak lain. Itu dikunci begitu ada lembar penilaian.
-- Kuota lolos dan jumlah juara masih boleh dikoreksi (tercatat di audit log)
-- sampai babak disahkan; setelah disahkan, keduanya ikut terkunci.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_stage_structure_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.name IS DISTINCT FROM OLD.name
        OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
        OR NEW.stage_order IS DISTINCT FROM OLD.stage_order)
       AND EXISTS (
           SELECT 1
           FROM public.judge_assessments ja
           JOIN public.stage_participations sp ON sp.id = ja.stage_participation_id
           WHERE sp.stage_id = OLD.id
       ) THEN
        RAISE EXCEPTION 'STAGE_STRUCTURE_LOCKED: Babak "%" sudah memiliki lembar penilaian. Nama, cabang, dan urutan babak tidak dapat diubah lagi.', OLD.name;
    END IF;

    IF OLD.is_finalized = true
       AND (NEW.qualification_quota IS DISTINCT FROM OLD.qualification_quota
            OR NEW.champion_count IS DISTINCT FROM OLD.champion_count) THEN
        RAISE EXCEPTION 'STAGE_STRUCTURE_LOCKED: Babak "%" sudah disahkan. Kuota lolos dan jumlah juara tidak dapat diubah lagi.', OLD.name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_stage_structure_lock ON public.stages;
CREATE TRIGGER trg_enforce_stage_structure_lock
    BEFORE UPDATE ON public.stages
    FOR EACH ROW EXECUTE FUNCTION public.enforce_stage_structure_lock();

INSERT INTO public.app_schema_versions (version)
VALUES ('20261121')
ON CONFLICT (version) DO NOTHING;
