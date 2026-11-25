-- =============================================================================
-- 20261129 — Logo penyelenggara (tenant) untuk header layar Live publik
-- Aman dijalankan berulang (idempotent).
--
-- 1. tenants.logo_url: tautan https:// ATAU gambar terunggah yang disimpan sebagai
--    data URI (png/jpeg/webp/gif, diperkecil di peramban, maks. ±150 KB).
-- 2. live_sessions.tenant_logo_url: salinan logo untuk layar publik. Tabel tenants
--    tertutup bagi anon, jadi logo ikut didenormalisasi seperti tenant_name.
--    Disinkronkan otomatis lewat trigger (saat sesi dibuat/diubah dan saat logo diubah).
-- 3. get_live_sessions mengembalikan tenant_logo_url.
-- =============================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_logo_url_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_logo_url_check CHECK (
    logo_url IS NULL
    OR (
        length(logo_url) <= 200000
        AND (
            logo_url ~* '^https://[^[:space:]"''<>]+$'
            OR logo_url ~ '^data:image/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$'
        )
    )
);

ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS tenant_logo_url TEXT;

-- Isi logo pada sesi live setiap kali baris dibuat atau diubah
CREATE OR REPLACE FUNCTION public.live_sessions_fill_tenant_logo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    SELECT t.logo_url INTO NEW.tenant_logo_url FROM public.tenants t WHERE t.id = NEW.tenant_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_sessions_fill_tenant_logo ON public.live_sessions;
CREATE TRIGGER trg_live_sessions_fill_tenant_logo
    BEFORE INSERT OR UPDATE ON public.live_sessions
    FOR EACH ROW EXECUTE FUNCTION public.live_sessions_fill_tenant_logo();

-- Saat logo penyelenggara diubah, perbarui sesi live miliknya
CREATE OR REPLACE FUNCTION public.tenants_sync_live_logo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.live_sessions
    SET tenant_logo_url = NEW.logo_url
    WHERE tenant_id = NEW.id
      AND tenant_logo_url IS DISTINCT FROM NEW.logo_url;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_sync_live_logo ON public.tenants;
CREATE TRIGGER trg_tenants_sync_live_logo
    AFTER UPDATE OF logo_url ON public.tenants
    FOR EACH ROW
    WHEN (OLD.logo_url IS DISTINCT FROM NEW.logo_url)
    EXECUTE FUNCTION public.tenants_sync_live_logo();

REVOKE EXECUTE ON FUNCTION public.live_sessions_fill_tenant_logo() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tenants_sync_live_logo() FROM PUBLIC, anon, authenticated;

-- Isi logo untuk sesi yang sudah ada
UPDATE public.live_sessions ls
SET tenant_logo_url = t.logo_url
FROM public.tenants t
WHERE t.id = ls.tenant_id
  AND ls.tenant_logo_url IS DISTINCT FROM t.logo_url;

-- Bacaan publik: sama seperti 20261127, ditambah tenant_logo_url
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
        SELECT tenant_id, tenant_name, event_name, tenant_code, tenant_logo_url
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
                'tenant_logo_url', i.tenant_logo_url,
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

REVOKE EXECUTE ON FUNCTION public.get_live_sessions(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_sessions(TEXT) TO anon, authenticated;

INSERT INTO public.app_schema_versions (version)
VALUES ('20261129')
ON CONFLICT (version) DO NOTHING;
