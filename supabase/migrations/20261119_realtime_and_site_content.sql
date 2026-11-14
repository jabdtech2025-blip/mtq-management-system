-- =============================================================================
-- 20261119 — Realtime hemat kuota & CMS ringan (konten landing + halaman publik)
-- Aman dijalankan berulang (idempotent).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. REALTIME: daftarkan tabel ke publikasi supabase_realtime
--    Tanpa ini, langganan realtime di aplikasi tidak menerima perubahan apa pun.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_table TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH v_table IN ARRAY ARRAY['judge_assessments', 'stage_participations', 'stages'] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
            END IF;
        END LOOP;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. KONTEN SITUS (landing page). Satu baris per kunci; isi berupa JSON parsial
--    yang menimpa teks/gambar bawaan di src/content/landing.ts.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_content (
    key TEXT PRIMARY KEY CHECK (key IN ('landing')),
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_content_select_policy ON public.site_content;
CREATE POLICY site_content_select_policy ON public.site_content
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS site_content_write_policy ON public.site_content;
CREATE POLICY site_content_write_policy ON public.site_content
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

GRANT SELECT ON public.site_content TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_content TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. HALAMAN PUBLIK (Panduan, Kebijakan Privasi, Ketentuan Penggunaan, dll.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.site_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)?$' AND char_length(slug) <= 80),
    title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 120),
    summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 300),
    category TEXT NOT NULL DEFAULT 'panduan' CHECK (category IN ('panduan', 'kebijakan', 'lainnya')),
    body_md TEXT NOT NULL DEFAULT '' CHECK (char_length(body_md) <= 100000),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    effective_date DATE,
    sort_order INT NOT NULL DEFAULT 100,
    show_in_footer BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_site_pages_status_category ON public.site_pages (status, category, sort_order);

ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;

-- Pengunjung (tanpa login) hanya melihat halaman yang sudah terbit.
-- Kebijakan dipisah per peran agar pengunjung anonim tidak pernah memanggil is_superadmin()
-- (fungsi itu tidak boleh dijalankan oleh peran anon).
DROP POLICY IF EXISTS site_pages_public_select_policy ON public.site_pages;
CREATE POLICY site_pages_public_select_policy ON public.site_pages
    FOR SELECT TO anon, authenticated
    USING (status = 'published');

DROP POLICY IF EXISTS site_pages_superadmin_select_policy ON public.site_pages;
CREATE POLICY site_pages_superadmin_select_policy ON public.site_pages
    FOR SELECT TO authenticated
    USING (public.is_superadmin());

DROP POLICY IF EXISTS site_pages_superadmin_write_policy ON public.site_pages;
CREATE POLICY site_pages_superadmin_write_policy ON public.site_pages
    FOR ALL TO authenticated
    USING (public.is_superadmin())
    WITH CHECK (public.is_superadmin());

GRANT SELECT ON public.site_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_pages TO authenticated;

-- Riwayat versi halaman (untuk kebijakan privasi & ketentuan: versi mana yang berlaku kapan)
CREATE TABLE IF NOT EXISTS public.site_page_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES public.site_pages(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    body_md TEXT NOT NULL,
    status TEXT NOT NULL,
    effective_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_site_page_versions_page ON public.site_page_versions (page_id, created_at DESC);

ALTER TABLE public.site_page_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_page_versions_select_policy ON public.site_page_versions;
CREATE POLICY site_page_versions_select_policy ON public.site_page_versions
    FOR SELECT TO authenticated
    USING (public.is_superadmin());

GRANT SELECT ON public.site_page_versions TO authenticated;
-- Tidak ada GRANT INSERT/UPDATE/DELETE: versi hanya ditulis oleh trigger (append-only).

-- Isi updated_at / updated_by otomatis
CREATE OR REPLACE FUNCTION public.touch_site_cms_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := now();
    IF auth.uid() IS NOT NULL THEN
        NEW.updated_by := auth.uid();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_site_content ON public.site_content;
CREATE TRIGGER trg_touch_site_content
    BEFORE INSERT OR UPDATE ON public.site_content
    FOR EACH ROW EXECUTE FUNCTION public.touch_site_cms_metadata();

DROP TRIGGER IF EXISTS trg_touch_site_pages ON public.site_pages;
CREATE TRIGGER trg_touch_site_pages
    BEFORE INSERT OR UPDATE ON public.site_pages
    FOR EACH ROW EXECUTE FUNCTION public.touch_site_cms_metadata();

-- Simpan versi setiap kali halaman dibuat / isinya berubah
CREATE OR REPLACE FUNCTION public.record_site_page_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'INSERT'
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.body_md IS DISTINCT FROM OLD.body_md
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.effective_date IS DISTINCT FROM OLD.effective_date THEN
        INSERT INTO public.site_page_versions (page_id, slug, title, body_md, status, effective_date, created_by)
        VALUES (NEW.id, NEW.slug, NEW.title, NEW.body_md, NEW.status, NEW.effective_date, auth.uid());
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_site_page_version ON public.site_pages;
CREATE TRIGGER trg_record_site_page_version
    AFTER INSERT OR UPDATE ON public.site_pages
    FOR EACH ROW EXECUTE FUNCTION public.record_site_page_version();

-- -----------------------------------------------------------------------------
-- 4. Pengaturan situs: ganti domain lama (mtq.id) ke domain resmi bila masih bawaan
-- -----------------------------------------------------------------------------
UPDATE public.site_settings
SET canonical_url = 'https://mtqsystem.web.id'
WHERE id = 'global' AND canonical_url = 'https://mtq.id';

UPDATE public.site_settings
SET og_image_url = 'https://mtqsystem.web.id/og-image.jpg'
WHERE id = 'global' AND og_image_url = 'https://mtq.id/icons/icon-512x512.png';

-- -----------------------------------------------------------------------------
-- 5. Catat versi skema (dipakai Health Check)
-- -----------------------------------------------------------------------------
INSERT INTO public.app_schema_versions (version)
VALUES ('20261119')
ON CONFLICT (version) DO NOTHING;
