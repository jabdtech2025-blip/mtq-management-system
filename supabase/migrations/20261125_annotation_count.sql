-- ==============================================================================
-- MIGRATION: 20261125_annotation_count.sql
-- Hemat egress tahap 2: kolom hitung jumlah coretan mushaf per lembar penilaian.
--
-- Aplikasi tidak lagi mengunduh kolom `annotations` (coretan mushaf, ±73% data
-- setiap muat penuh) saat memuat seluruh data penyelenggara. Coretan diambil hanya
-- ketika lembar dibuka. Untuk menampilkan "N anotasi mushaf" dan mengetahui apakah
-- sebuah lembar punya coretan, aplikasi membaca kolom kecil `annotation_count`.
--
-- Kolom GENERATED (dihitung otomatis oleh Postgres dari `annotations`), jadi:
--   * tidak perlu diisi aplikasi dan tidak bisa salah/tertinggal,
--   * aman untuk lembar yang sudah terkunci (tidak memicu trigger imutabilitas).
-- Idempotent: aman dijalankan ulang.
-- ==============================================================================

ALTER TABLE public.judge_assessments
    ADD COLUMN IF NOT EXISTS annotation_count INTEGER
    GENERATED ALWAYS AS (
        CASE WHEN jsonb_typeof(annotations) = 'array' THEN jsonb_array_length(annotations) ELSE 0 END
    ) STORED;

COMMENT ON COLUMN public.judge_assessments.annotation_count IS
    'Jumlah coretan mushaf (dihitung otomatis dari annotations). Dipakai aplikasi agar tidak perlu mengunduh annotations saat muat penuh.';
