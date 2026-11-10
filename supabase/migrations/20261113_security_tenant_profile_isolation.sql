-- ==============================================================================
-- MIGRATION: 20261113_security_tenant_profile_isolation.sql
-- T2.1: Isolasi Profil Pengguna Lintas-Tenant pada upsert_tenant_member_profile
--       & Penegakan Hierarki Peran (profiles.role khusus superadmin, peran tenant
--       murni dari tenant_memberships.role).
-- Idempotent & Aman dijalankan berulang kali di PostgreSQL / Supabase.
-- ==============================================================================

-- 1. Pastikan is_superadmin() dan is_tenant_admin(p_tenant_id) konsisten:
--    - profiles.role hanya bermakna untuk 'superadmin' tingkat platform
--    - peran tingkat-tenant ('admin', 'judge') selalu dievaluasi dari tenant_memberships
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'superadmin'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.profile_id = auth.uid()
          AND tm.role IN ('admin', 'superadmin')
          AND tm.status = 'Aktif'
    ) OR public.is_superadmin();
$$;

-- 2. Perkuat upsert_tenant_member_profile untuk mencegah penimpaan profil lintas-tenant
CREATE OR REPLACE FUNCTION public.upsert_tenant_member_profile(
    p_tenant_id UUID,
    p_profile_id UUID,
    p_username TEXT,
    p_name TEXT,
    p_email TEXT,
    p_role TEXT,
    p_judge_category TEXT DEFAULT NULL,
    p_judge_field TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'Aktif'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor RECORD;
    v_target_id UUID;
    v_auth_email TEXT;
    v_existing_profile RECORD;
    v_has_other_tenant_membership BOOLEAN := false;
    v_preserve_global_profile BOOLEAN := false;
    v_clean_role TEXT;
    v_clean_status TEXT;
    v_clean_username TEXT;
    v_audit_summary TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RAISE EXCEPTION 'Tenant tujuan tidak ditemukan atau tidak valid.';
    END IF;

    IF NOT public.is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang dapat mengelola keanggotaan pengguna.';
    END IF;

    v_clean_role := LOWER(TRIM(COALESCE(p_role, 'judge')));
    IF v_clean_role NOT IN ('judge', 'admin', 'superadmin') THEN
        RAISE EXCEPTION 'Peran pengguna tidak valid: %', v_clean_role;
    END IF;

    IF v_clean_role = 'superadmin' AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Superadmin yang dapat menetapkan peran superadmin.';
    END IF;

    v_clean_status := CASE WHEN p_status = 'Nonaktif' THEN 'Nonaktif' ELSE 'Aktif' END;

    -- Resolusi di auth.users berdasarkan ID atau Email
    IF p_profile_id IS NOT NULL THEN
        SELECT u.id, u.email INTO v_target_id, v_auth_email
        FROM auth.users u
        WHERE u.id = p_profile_id
        LIMIT 1;
    END IF;

    IF v_target_id IS NULL AND NULLIF(TRIM(p_email), '') IS NOT NULL THEN
        SELECT u.id, u.email INTO v_target_id, v_auth_email
        FROM auth.users u
        WHERE LOWER(u.email) = LOWER(TRIM(p_email))
        LIMIT 1;
    END IF;

    -- Fallback ke tabel profiles jika sudah terpetakan sebelumnya
    IF v_target_id IS NULL THEN
        SELECT p.id, p.email INTO v_target_id, v_auth_email
        FROM public.profiles p
        WHERE (p_profile_id IS NOT NULL AND p.id = p_profile_id)
           OR (NULLIF(TRIM(p_email), '') IS NOT NULL AND LOWER(p.email) = LOWER(TRIM(p_email)))
           OR (NULLIF(TRIM(p_username), '') IS NOT NULL AND LOWER(p.username) = LOWER(TRIM(p_username)))
        LIMIT 1;
    END IF;

    IF v_target_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_USER_NOT_FOUND: Pengguna (%) belum terdaftar di Supabase Auth (auth.users). Gunakan layanan undangan akun (Edge Function admin-provision-user) atau daftarkan email di Supabase Authentication terlebih dahulu.', COALESCE(NULLIF(TRIM(p_email), ''), NULLIF(TRIM(p_username), ''), 'tanpa-identitas');
    END IF;

    -- Cegah admin tenant biasa memodifikasi akun milik Superadmin
    SELECT * INTO v_existing_profile FROM public.profiles WHERE id = v_target_id;
    IF FOUND AND v_existing_profile.role = 'superadmin' AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Administrator Tenant tidak memiliki wewenang untuk mengubah profil atau keanggotaan Superadmin.';
    END IF;

    -- T2.1: Cek apakah v_target_id sudah menjadi anggota di tenant lain
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_memberships tm
        WHERE tm.profile_id = v_target_id
          AND tm.tenant_id <> p_tenant_id
    ) INTO v_has_other_tenant_membership;

    IF v_existing_profile.id IS NOT NULL
       AND NOT public.is_superadmin()
       AND v_has_other_tenant_membership
    THEN
        v_preserve_global_profile := true;
    END IF;

    PERFORM set_config('mtq.rpc_role_admin_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    IF NOT v_preserve_global_profile THEN
        v_clean_username := COALESCE(
            NULLIF(TRIM(p_username), ''),
            v_existing_profile.username,
            'user_' || SUBSTRING(v_target_id::text FROM 1 FOR 8)
        );

        IF EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE LOWER(p.username) = LOWER(v_clean_username)
              AND p.id <> v_target_id
        ) THEN
            v_clean_username := v_clean_username || '_' || SUBSTRING(v_target_id::text FROM 1 FOR 4);
        END IF;

        INSERT INTO public.profiles (id, username, name, email, role, updated_at)
        VALUES (
            v_target_id,
            v_clean_username,
            COALESCE(NULLIF(TRIM(p_name), ''), 'Pengguna MTQ'),
            COALESCE(NULLIF(TRIM(p_email), ''), v_auth_email),
            CASE
                WHEN public.is_superadmin() AND v_clean_role = 'superadmin' THEN 'superadmin'
                WHEN v_clean_role = 'admin' THEN 'admin'
                ELSE 'judge'
            END,
            now()
        )
        ON CONFLICT (id) DO UPDATE
        SET username = COALESCE(NULLIF(TRIM(EXCLUDED.username), ''), public.profiles.username),
            name = COALESCE(NULLIF(TRIM(EXCLUDED.name), ''), public.profiles.name),
            email = COALESCE(NULLIF(TRIM(EXCLUDED.email), ''), public.profiles.email),
            role = CASE
                WHEN public.profiles.role = 'superadmin' AND NOT public.is_superadmin() THEN 'superadmin'
                WHEN public.is_superadmin() AND v_clean_role = 'superadmin' THEN 'superadmin'
                ELSE EXCLUDED.role
            END,
            updated_at = now();
    END IF;

    INSERT INTO public.tenant_memberships (
        tenant_id,
        profile_id,
        role,
        judge_category,
        judge_field,
        status
    )
    VALUES (
        p_tenant_id,
        v_target_id,
        v_clean_role,
        NULLIF(TRIM(p_judge_category), ''),
        NULLIF(TRIM(p_judge_field), ''),
        v_clean_status
    )
    ON CONFLICT (tenant_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role,
        judge_category = EXCLUDED.judge_category,
        judge_field = EXCLUDED.judge_field,
        status = EXCLUDED.status;

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;

    IF v_preserve_global_profile THEN
        v_audit_summary := 'Penautan keanggotaan lintas-tenant untuk ' || COALESCE(v_existing_profile.email, '') ||
                           ' sebagai ' || v_clean_role || ' (' || v_clean_status ||
                           '); profil global (nama/username/role) dipertahankan demi isolasi lintas-tenant.';
    ELSE
        v_audit_summary := 'Pemetaan profil & keanggotaan ' || COALESCE(p_name, '') ||
                           ' dengan peran ' || v_clean_role || ' (' || v_clean_status || ')';
    END IF;

    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (
        p_tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'USER_MEMBERSHIP_UPSERTED',
        'Profile ID: ' || v_target_id::text,
        v_audit_summary,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', v_target_id,
        'email', COALESCE(v_existing_profile.email, NULLIF(TRIM(p_email), ''), v_auth_email),
        'role', v_clean_role,
        'status', v_clean_status,
        'global_profile_preserved', v_preserve_global_profile
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_tenant_member_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_member_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
