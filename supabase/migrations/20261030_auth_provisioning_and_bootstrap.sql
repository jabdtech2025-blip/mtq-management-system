-- ==============================================================================
-- MIGRATION: 20261030_auth_provisioning_and_bootstrap.sql
-- Deskripsi: Migrasi Incremental, Idempoten & Non-Destruktif (Setelah 20261029)
--            TANPA mereset database atau menghapus data yang sudah ada.
-- Cakupan:
--   1. Mekanisme Bootstrap Superadmin Pertama Satu Kali (bootstrap_first_superadmin)
--   2. Penguatan RPC upsert_tenant_member_profile (Resolusi Email auth.users &
--      Pemulihan Kegagalan Parsial / Retry-Safe + Proteksi Akun Superadmin)
--   3. Proteksi Action Audit INITIAL_SUPERADMIN_BOOTSTRAPPED pada append_admin_audit_log
--   4. Pembatasan Hak Eksekusi Fungsi (REVOKE PUBLIC/anon, GRANT authenticated)
-- ==============================================================================

-- 1. PERBARUI append_admin_audit_log AGAR TIDAK BISA MEMALSUKAN INITIAL_SUPERADMIN_BOOTSTRAPPED
CREATE OR REPLACE FUNCTION public.append_admin_audit_log(
    p_tenant_id UUID,
    p_action TEXT,
    p_target TEXT,
    p_summary TEXT,
    p_reason TEXT DEFAULT NULL,
    p_outcome TEXT DEFAULT 'Success'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID;
    v_actor RECORD;
    v_clean_action TEXT;
    v_clean_outcome TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Permintaan tidak memiliki sesi autentikasi.';
    END IF;

    IF NOT is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator atau Superadmin yang berwenang mencatat audit administrasi.';
    END IF;

    v_clean_action := UPPER(TRIM(COALESCE(p_action, '')));
    IF v_clean_action = '' THEN
        RAISE EXCEPTION 'Tindakan audit (action) wajib diisi.';
    END IF;

    IF v_clean_action IN (
        'ASSESSMENT_FINALIZED',
        'ASSESSMENT_REOPENED',
        'STAGE_FINALIZED',
        'CHAMPIONSHIP_FINALIZED',
        'INITIAL_SUPERADMIN_BOOTSTRAPPED'
    ) THEN
        RAISE EXCEPTION 'Pelanggaran Keamanan: Tindakan sistem % hanya dapat dicatat oleh prosedur transaksi utamanya.', v_clean_action;
    END IF;

    v_clean_outcome := CASE
        WHEN p_outcome IN ('Success', 'Failed', 'Warning') THEN p_outcome
        ELSE 'Success'
    END;

    SELECT * INTO v_actor FROM profiles WHERE id = v_actor_id;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    INSERT INTO audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        p_tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        v_clean_action,
        LEFT(TRIM(COALESCE(p_target, '-')), 255),
        TRIM(COALESCE(p_summary, '-')),
        p_reason,
        v_clean_outcome
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. PERKUAT upsert_tenant_member_profile UNTUK RESOLUSI EMAIL auth.users & RETRY-SAFE
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
    v_clean_role TEXT;
    v_clean_status TEXT;
    v_clean_username TEXT;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Sesi tidak terautentikasi.';
    END IF;

    IF p_tenant_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id) THEN
        RAISE EXCEPTION 'Tenant tujuan tidak ditemukan atau tidak valid.';
    END IF;

    IF NOT is_tenant_admin(p_tenant_id) THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Administrator Tenant atau Superadmin yang dapat mengelola keanggotaan pengguna.';
    END IF;

    v_clean_role := LOWER(TRIM(COALESCE(p_role, 'judge')));
    IF v_clean_role NOT IN ('judge', 'admin', 'superadmin') THEN
        RAISE EXCEPTION 'Peran pengguna tidak valid: %', v_clean_role;
    END IF;

    IF v_clean_role = 'superadmin' AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Hanya Superadmin yang dapat menetapkan peran superadmin.';
    END IF;

    v_clean_status := CASE WHEN p_status = 'Nonaktif' THEN 'Nonaktif' ELSE 'Aktif' END;

    -- Prioritaskan pencarian di auth.users berdasarkan ID atau Email agar retry pasca-undangan selalu sinkron
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
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_target_id AND role = 'superadmin') AND NOT is_superadmin() THEN
        RAISE EXCEPTION 'Otorisasi ditolak: Administrator Tenant tidak memiliki wewenang untuk mengubah profil atau keanggotaan Superadmin.';
    END IF;

    v_clean_username := COALESCE(
        NULLIF(TRIM(p_username), ''),
        'user_' || SUBSTRING(v_target_id::text FROM 1 FOR 8)
    );

    -- Jika username bentrok dengan profile_id lain, tambahkan sufiks pendek dari UUID target agar retry tidak gagal
    IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE LOWER(p.username) = LOWER(v_clean_username)
          AND p.id <> v_target_id
    ) THEN
        v_clean_username := v_clean_username || '_' || SUBSTRING(v_target_id::text FROM 1 FOR 4);
    END IF;

    PERFORM set_config('mtq.rpc_role_admin_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    INSERT INTO public.profiles (id, username, name, email, role, updated_at)
    VALUES (
        v_target_id,
        v_clean_username,
        COALESCE(NULLIF(TRIM(p_name), ''), 'Pengguna MTQ'),
        COALESCE(NULLIF(TRIM(p_email), ''), v_auth_email),
        CASE WHEN is_superadmin() AND v_clean_role = 'superadmin' THEN 'superadmin'
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
            WHEN public.profiles.role = 'superadmin' AND NOT is_superadmin() THEN 'superadmin'
            WHEN is_superadmin() AND v_clean_role = 'superadmin' THEN 'superadmin'
            WHEN public.profiles.role = 'admin' AND v_clean_role = 'judge' AND p_tenant_id <> (
                SELECT tm.tenant_id FROM public.tenant_memberships tm
                WHERE tm.profile_id = v_target_id AND tm.role = 'admin' AND tm.status = 'Aktif' LIMIT 1
            ) THEN 'admin'
            ELSE EXCLUDED.role
        END,
        updated_at = now();

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

    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (
        p_tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Admin') || ' (' || COALESCE(v_actor.role, 'admin') || ')',
        'USER_MEMBERSHIP_UPSERTED',
        'Profile ID: ' || v_target_id::text,
        'Pemetaan profil & keanggotaan ' || COALESCE(p_name, '') || ' dengan peran ' || v_clean_role || ' (' || v_clean_status || ')',
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', v_target_id,
        'email', COALESCE(NULLIF(TRIM(p_email), ''), v_auth_email),
        'role', v_clean_role,
        'status', v_clean_status
    );
END;
$$;

-- 3. MEKANISME BOOTSTRAP SUPERADMIN PERTAMA (ONE-TIME GUARDED RPC / SQL FUNCTION)
CREATE OR REPLACE FUNCTION public.bootstrap_first_superadmin(
    p_target_email TEXT DEFAULT NULL,
    p_initial_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_caller_uid UUID;
    v_caller_role TEXT;
    v_auth_user RECORD;
    v_target_tenant_id UUID;
    v_username TEXT;
    v_display_name TEXT;
    v_tenant_rec RECORD;
BEGIN
    v_caller_uid := auth.uid();
    v_caller_role := COALESCE(current_setting('role', true), '');

    -- Tolak panggilan anonim tanpa sesi
    IF v_caller_uid IS NULL AND v_caller_role IN ('anon', 'authenticated') THEN
        RAISE EXCEPTION 'Otorisasi Bootstrap Ditolak: Fungsi ini tidak dapat dipanggil oleh sesi anonim.';
    END IF;

    -- Kunci tabel profiles secara eksklusif dalam transaksi ini untuk mencegah race condition bootstrap ganda
    LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

    -- Verifikasi keras: HANYA boleh berjalan jika BELUM ADA satu pun profil dengan role = 'superadmin'
    IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'superadmin') THEN
        RAISE EXCEPTION 'Bootstrap Ditolak: Akun Superadmin pertama sudah terdaftar di sistem. Mekanisme bootstrap satu kali telah terkunci permanen.';
    END IF;

    -- Cari pengguna di auth.users berdasarkan p_target_email atau auth.uid()
    IF NULLIF(TRIM(p_target_email), '') IS NOT NULL THEN
        SELECT u.id, u.email, u.raw_user_meta_data
        INTO v_auth_user
        FROM auth.users u
        WHERE LOWER(u.email) = LOWER(TRIM(p_target_email))
        LIMIT 1;
    ELSIF v_caller_uid IS NOT NULL THEN
        SELECT u.id, u.email, u.raw_user_meta_data
        INTO v_auth_user
        FROM auth.users u
        WHERE u.id = v_caller_uid
        LIMIT 1;
    ELSE
        RAISE EXCEPTION 'Parameter p_target_email wajib diisi saat menjalankan bootstrap_first_superadmin dari SQL Editor.';
    END IF;

    IF v_auth_user.id IS NULL THEN
        RAISE EXCEPTION 'Bootstrap Gagal: Akun email (%) belum ditemukan di auth.users. Buat pengguna terlebih dahulu melalui Supabase Authentication -> Users.', COALESCE(p_target_email, 'UID saat ini');
    END IF;

    -- Jika dipanggil dari sesi aplikasi (authenticated), pengguna hanya boleh mem-bootstrap dirinya sendiri
    IF v_caller_uid IS NOT NULL AND v_caller_uid <> v_auth_user.id THEN
        RAISE EXCEPTION 'Otorisasi Bootstrap Ditolak: Sesi autentikasi aktif hanya diizinkan melakukan bootstrap untuk akun miliknya sendiri.';
    END IF;

    v_display_name := COALESCE(
        NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'name'), ''),
        NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'full_name'), ''),
        INITCAP(SPLIT_PART(v_auth_user.email, '@', 1)),
        'Superadmin LPTQ'
    );

    v_username := COALESCE(
        NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'username'), ''),
        LOWER(REGEXP_REPLACE(SPLIT_PART(v_auth_user.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'))
    );

    IF EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE LOWER(p.username) = LOWER(v_username)
          AND p.id <> v_auth_user.id
    ) THEN
        v_username := v_username || '_' || SUBSTRING(v_auth_user.id::text FROM 1 FOR 4);
    END IF;

    -- Tentukan tenant awal untuk pencatatan audit dan pengikatan membership awal
    IF p_initial_tenant_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.tenants WHERE id = p_initial_tenant_id) THEN
        v_target_tenant_id := p_initial_tenant_id;
    ELSE
        SELECT t.id INTO v_target_tenant_id
        FROM public.tenants t
        WHERE t.id <> '00000000-0000-0000-0000-000000000000'::uuid
          AND t.status = 'Aktif'
        ORDER BY t.created_at ASC
        LIMIT 1;

        IF v_target_tenant_id IS NULL THEN
            SELECT t.id INTO v_target_tenant_id
            FROM public.tenants t
            ORDER BY t.created_at ASC
            LIMIT 1;
        END IF;
    END IF;

    IF v_target_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Bootstrap Gagal: Belum ada data tenant di tabel public.tenants. Jalankan schema.sql / seed.sql terlebih dahulu.';
    END IF;

    PERFORM set_config('mtq.rpc_role_admin_active', 'true', true);
    PERFORM set_config('mtq.rpc_audit_active', 'true', true);

    -- Upsert profil sebagai superadmin pertama
    INSERT INTO public.profiles (id, username, name, email, role, updated_at)
    VALUES (
        v_auth_user.id,
        v_username,
        v_display_name,
        v_auth_user.email,
        'superadmin',
        now()
    )
    ON CONFLICT (id) DO UPDATE
    SET role = 'superadmin',
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        name = COALESCE(NULLIF(TRIM(public.profiles.name), ''), EXCLUDED.name),
        username = COALESCE(NULLIF(TRIM(public.profiles.username), ''), EXCLUDED.username),
        updated_at = now();

    -- Hubungkan membership superadmin ke tenant awal (dan seluruh tenant operasional aktif)
    FOR v_tenant_rec IN
        SELECT t.id
        FROM public.tenants t
        WHERE t.id = v_target_tenant_id
           OR (t.id <> '00000000-0000-0000-0000-000000000000'::uuid AND t.status = 'Aktif')
    LOOP
        INSERT INTO public.tenant_memberships (tenant_id, profile_id, role, status)
        VALUES (v_tenant_rec.id, v_auth_user.id, 'superadmin', 'Aktif')
        ON CONFLICT (tenant_id, profile_id) DO UPDATE
        SET role = 'superadmin',
            status = 'Aktif';
    END LOOP;

    -- Catat audit trail bootstrap permanen
    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, outcome)
    VALUES (
        v_target_tenant_id,
        v_auth_user.id,
        v_display_name || ' (superadmin)',
        'INITIAL_SUPERADMIN_BOOTSTRAPPED',
        'Profile ID: ' || v_auth_user.id::text,
        'Promosi satu kali (one-time bootstrap) akun Superadmin pertama sistem untuk ' || v_auth_user.email,
        'Success'
    );

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', v_auth_user.id,
        'email', v_auth_user.email,
        'username', v_username,
        'role', 'superadmin',
        'initial_tenant_id', v_target_tenant_id,
        'message', 'Akun Superadmin pertama berhasil di-bootstrap dan diikat ke tenant operasional.'
    );
END;
$$;

-- 4. KEAMANAN EKSEKUSI FUNGSI (CABUT PUBLIC & ANON)
REVOKE EXECUTE ON FUNCTION public.append_admin_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.append_admin_audit_log(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_tenant_member_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_member_profile(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_superadmin(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_superadmin(TEXT, UUID) TO authenticated;
