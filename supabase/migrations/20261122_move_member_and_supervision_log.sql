-- =============================================================================
-- 20261122 — Pindah pengguna antar-penyelenggara & catatan supervisi Superadmin
-- Aman dijalankan berulang (idempotent). Tidak mengubah data yang sudah ada.
--
-- 1. move_member_to_tenant: "Pindah MTQ" sebelumnya hanya MENAMBAH keanggotaan di
--    penyelenggara tujuan; keanggotaan lama tetap aktif sehingga pengguna masih bisa
--    bekerja di penyelenggara lama dan tampilan kembali ke penyelenggara lama setelah
--    dimuat ulang. Fungsi ini memindahkan dalam satu transaksi:
--      * keanggotaan lama dinonaktifkan (riwayat dan nilai tetap utuh);
--      * penugasan hakim di penyelenggara lama dinonaktifkan;
--      * keanggotaan di penyelenggara tujuan dibuat/diaktifkan dengan peran yang sama;
--      * dicatat di audit log kedua penyelenggara.
--    Ditolak bila hakim masih punya lembar penilaian yang belum final, atau lembar
--    final pada babak yang belum disahkan.
--
-- 2. record_supervision_event: mencatat Superadmin masuk/keluar workspace
--    penyelenggara (Mode Supervisi) beserta alasannya, di audit log penyelenggara itu.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.move_member_to_tenant(
    p_profile_id UUID,
    p_from_tenant_id UUID,
    p_to_tenant_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor RECORD;
    v_profile RECORD;
    v_from RECORD;
    v_from_name TEXT;
    v_to_name TEXT;
    v_pending INT;
    v_released INT := 0;
    v_actor_label TEXT;
    v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
BEGIN
    IF v_actor_id IS NULL OR NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'MOVE_DENIED: Hanya Superadmin yang dapat memindahkan pengguna antar-penyelenggara.';
    END IF;

    IF p_from_tenant_id IS NULL OR p_to_tenant_id IS NULL OR p_from_tenant_id = p_to_tenant_id THEN
        RAISE EXCEPTION 'MOVE_INVALID: Penyelenggara asal dan tujuan wajib diisi dan harus berbeda.';
    END IF;

    IF p_to_tenant_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RAISE EXCEPTION 'MOVE_INVALID: Pengguna tidak dapat dipindahkan ke tenant sistem platform.';
    END IF;

    SELECT name INTO v_to_name FROM public.tenants WHERE id = p_to_tenant_id;
    IF v_to_name IS NULL THEN
        RAISE EXCEPTION 'MOVE_INVALID: Penyelenggara tujuan tidak ditemukan.';
    END IF;
    SELECT name INTO v_from_name FROM public.tenants WHERE id = p_from_tenant_id;

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MOVE_INVALID: Akun pengguna tidak ditemukan.';
    END IF;
    IF v_profile.role = 'superadmin' THEN
        RAISE EXCEPTION 'MOVE_INVALID: Akun Superadmin tidak terikat penyelenggara dan tidak perlu dipindahkan.';
    END IF;

    SELECT * INTO v_from
    FROM public.tenant_memberships
    WHERE tenant_id = p_from_tenant_id AND profile_id = p_profile_id
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MOVE_INVALID: Pengguna ini bukan anggota penyelenggara asal.';
    END IF;

    -- Lembar penilaian yang masih dikerjakan
    SELECT COUNT(*) INTO v_pending
    FROM public.judge_assessments ja
    WHERE ja.tenant_id = p_from_tenant_id
      AND ja.judge_profile_id = p_profile_id
      AND ja.status IN ('not_started', 'in_progress');
    IF v_pending > 0 THEN
        RAISE EXCEPTION 'MOVE_BLOCKED: Hakim ini masih memiliki % lembar penilaian yang belum difinalisasi di "%". Selesaikan atau hapus lembar tersebut sebelum memindahkan.', v_pending, COALESCE(v_from_name, 'penyelenggara asal');
    END IF;

    -- Lembar final pada babak yang belum disahkan: nilai peserta masih bergantung pada hakim ini
    IF public.judge_has_finalized_sheets_in_open_stage(p_from_tenant_id, p_profile_id, NULL) THEN
        RAISE EXCEPTION 'MOVE_BLOCKED: Hakim ini sudah memfinalisasi lembar nilai pada babak yang belum disahkan di "%". Pindahkan setelah babak tersebut disahkan.', COALESCE(v_from_name, 'penyelenggara asal');
    END IF;

    -- Penugasan hakim di penyelenggara lama dinonaktifkan
    UPDATE public.judge_assignments
    SET status = 'Nonaktif'
    WHERE tenant_id = p_from_tenant_id
      AND judge_profile_id = p_profile_id
      AND status = 'Aktif';
    GET DIAGNOSTICS v_released = ROW_COUNT;

    UPDATE public.tenant_memberships
    SET status = 'Nonaktif'
    WHERE id = v_from.id;

    INSERT INTO public.tenant_memberships (tenant_id, profile_id, role, judge_category, judge_field, status)
    VALUES (p_to_tenant_id, p_profile_id, v_from.role, v_from.judge_category, v_from.judge_field, 'Aktif')
    ON CONFLICT (tenant_id, profile_id) DO UPDATE
    SET role = EXCLUDED.role,
        judge_category = COALESCE(public.tenant_memberships.judge_category, EXCLUDED.judge_category),
        judge_field = COALESCE(public.tenant_memberships.judge_field, EXCLUDED.judge_field),
        status = 'Aktif';

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;
    v_actor_label := COALESCE(v_actor.name, 'Superadmin') || ' (superadmin)';

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);
    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES
    (
        p_from_tenant_id, v_actor_id, v_actor_label, 'USER_MOVED_OUT',
        'Pengguna: ' || COALESCE(v_profile.name, v_profile.email, p_profile_id::text),
        'Dipindahkan ke "' || v_to_name || '". Keanggotaan di sini dinonaktifkan' ||
            CASE WHEN v_released > 0 THEN '; ' || v_released || ' penugasan hakim dinonaktifkan.' ELSE '.' END,
        v_reason, 'Success'
    ),
    (
        p_to_tenant_id, v_actor_id, v_actor_label, 'USER_MOVED_IN',
        'Pengguna: ' || COALESCE(v_profile.name, v_profile.email, p_profile_id::text),
        'Dipindahkan dari "' || COALESCE(v_from_name, '-') || '" sebagai ' || v_from.role || '.',
        v_reason, 'Success'
    );
    PERFORM set_config('mtq.rpc_audit_active', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'profile_id', p_profile_id,
        'from_tenant_id', p_from_tenant_id,
        'to_tenant_id', p_to_tenant_id,
        'role', v_from.role,
        'released_assignments', v_released,
        'message', 'Pengguna dipindahkan ke "' || v_to_name || '". Keanggotaan lama dinonaktifkan' ||
            CASE WHEN v_released > 0 THEN ' dan ' || v_released || ' penugasan hakim lama dilepas.' ELSE '.' END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_member_to_tenant(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_member_to_tenant(UUID, UUID, UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Catatan Mode Supervisi
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_supervision_event(
    p_tenant_id UUID,
    p_event TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor_id UUID := auth.uid();
    v_actor RECORD;
    v_tenant_name TEXT;
    v_event TEXT := UPPER(TRIM(COALESCE(p_event, '')));
    v_reason TEXT := NULLIF(TRIM(COALESCE(p_reason, '')), '');
    v_log_id UUID;
BEGIN
    IF v_actor_id IS NULL OR NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'SUPERVISION_DENIED: Hanya Superadmin yang dapat masuk Mode Supervisi.';
    END IF;

    IF v_event NOT IN ('STARTED', 'ENDED') THEN
        RAISE EXCEPTION 'SUPERVISION_INVALID: Jenis catatan supervisi tidak dikenal.';
    END IF;

    IF v_event = 'STARTED' AND (v_reason IS NULL OR length(v_reason) < 5) THEN
        RAISE EXCEPTION 'SUPERVISION_INVALID: Alasan supervisi wajib diisi (minimal 5 karakter).';
    END IF;

    SELECT name INTO v_tenant_name FROM public.tenants WHERE id = p_tenant_id;
    IF v_tenant_name IS NULL OR p_tenant_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
        RAISE EXCEPTION 'SUPERVISION_INVALID: Penyelenggara tidak ditemukan.';
    END IF;

    SELECT * INTO v_actor FROM public.profiles WHERE id = v_actor_id;

    PERFORM set_config('mtq.rpc_audit_active', 'true', true);
    INSERT INTO public.audit_logs (tenant_id, actor_id, actor_name, action, target, summary, reason, outcome)
    VALUES (
        p_tenant_id,
        v_actor_id,
        COALESCE(v_actor.name, 'Superadmin') || ' (superadmin)',
        'SUPERVISION_' || v_event,
        'Workspace: ' || v_tenant_name,
        CASE WHEN v_event = 'STARTED'
            THEN 'Superadmin masuk Mode Supervisi workspace "' || v_tenant_name || '".'
            ELSE 'Superadmin keluar dari Mode Supervisi workspace "' || v_tenant_name || '".'
        END,
        v_reason,
        'Success'
    )
    RETURNING id INTO v_log_id;
    PERFORM set_config('mtq.rpc_audit_active', 'false', true);

    RETURN jsonb_build_object('success', true, 'audit_log_id', v_log_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_supervision_event(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_supervision_event(UUID, TEXT, TEXT) TO authenticated;

INSERT INTO public.app_schema_versions (version)
VALUES ('20261122')
ON CONFLICT (version) DO NOTHING;
