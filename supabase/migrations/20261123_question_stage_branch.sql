-- =============================================================================
-- 20261123 — Soal harus tertaut ke babak milik cabangnya sendiri
-- Aman dijalankan berulang (idempotent).
--
-- Masalah: soal lama (sebelum babak dicari per cabang) bisa tertaut ke babak
-- bernama sama milik cabang LAIN, misalnya soal "Final" cabang Marhalah
-- Mutawassithah tertaut ke babak Final cabang Marhalah Ibtidaiyyah. Daftar soal
-- di layar undian tetap menampilkannya (menyaring berdasarkan nama babak), tetapi
-- undian server menolaknya: INSUFFICIENT_QUESTION_POOL (tersedia 0).
--
-- Migrasi ini:
--   3a. memindahkan soal seperti itu ke babak bernama sama milik cabangnya sendiri;
--   3b. memasang penjaga: tautan ke babak cabang lain diluruskan otomatis bila
--       cabang soal punya babak bernama sama, dan ditolak bila tidak ada.
-- Hanya kolom stage_id pada soal yang salah tautan yang diubah.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Soal harus tertaut ke babak milik cabangnya sendiri
-- -----------------------------------------------------------------------------

-- 3a. Luruskan data lama: pindahkan ke babak bernama sama di cabang soal itu
UPDATE public.questions q
SET stage_id = own.id
FROM public.stages wrong, public.stages own
WHERE q.stage_id = wrong.id
  AND q.branch_id IS NOT NULL
  AND wrong.branch_id IS NOT NULL
  AND wrong.branch_id <> q.branch_id
  AND own.tenant_id = q.tenant_id
  AND own.branch_id = q.branch_id
  AND own.name = wrong.name;

DO $$
DECLARE
    v_left INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_left
    FROM public.questions q
    JOIN public.stages s ON s.id = q.stage_id
    WHERE q.branch_id IS NOT NULL
      AND s.branch_id IS NOT NULL
      AND s.branch_id <> q.branch_id;
    IF v_left > 0 THEN
        RAISE NOTICE 'Masih ada % soal yang tertaut ke babak cabang lain karena cabangnya belum punya babak bernama sama. Buat babaknya di Master Data > Babak Musabaqah, lalu jalankan migrasi ini sekali lagi.', v_left;
    END IF;
END $$;

-- 3b. Penjaga: tautan ke babak cabang lain diluruskan otomatis bila cabang soal punya
--     babak bernama sama; bila tidak ada, ditolak dengan pesan jelas.
CREATE OR REPLACE FUNCTION public.enforce_question_stage_branch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_stage RECORD;
    v_own_stage_id UUID;
    v_branch_name TEXT;
BEGIN
    IF NEW.stage_id IS NULL OR NEW.branch_id IS NULL THEN
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

    IF v_stage.branch_id IS NULL OR v_stage.branch_id = NEW.branch_id THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_own_stage_id
    FROM public.stages
    WHERE tenant_id = NEW.tenant_id
      AND branch_id = NEW.branch_id
      AND name = v_stage.name
    LIMIT 1;

    IF v_own_stage_id IS NOT NULL THEN
        NEW.stage_id := v_own_stage_id;
        RETURN NEW;
    END IF;

    SELECT name INTO v_branch_name FROM public.branches WHERE id = NEW.branch_id;
    RAISE EXCEPTION 'QUESTION_STAGE_BRANCH_MISMATCH: Soal "%" milik cabang "%", sedangkan babak "%" adalah milik cabang "%". Buat babak "%" untuk cabang "%" terlebih dahulu.',
        NEW.code, COALESCE(v_branch_name, '-'), v_stage.name, COALESCE(v_stage.branch_name, '-'),
        v_stage.name, COALESCE(v_branch_name, '-');
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_question_stage_branch ON public.questions;
CREATE TRIGGER trg_enforce_question_stage_branch
    BEFORE INSERT OR UPDATE ON public.questions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_question_stage_branch();

INSERT INTO public.app_schema_versions (version)
VALUES ('20261123')
ON CONFLICT (version) DO NOTHING;
