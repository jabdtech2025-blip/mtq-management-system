// ==============================================================================
// SUPABASE EDGE FUNCTION: admin-provision-user
// Lokasi: supabase/functions/admin-provision-user/index.ts
// Deskripsi:
//   Layanan server-side terotorisasi untuk mengundang/membuat akun pengguna
//   di Supabase Authentication (auth.users) dan memetakan public.profiles +
//   public.tenant_memberships secara atomik melalui RPC upsert_tenant_member_profile.
//
// Keamanan:
//   - SUPABASE_SERVICE_ROLE_KEY HANYA dibaca dari Deno.env di sisi server
//     (Supabase Edge Function Secrets) dan TIDAK PERNAH diekspos ke frontend.
//   - Memverifikasi JWT pemanggil (auth.getUser()) serta memvalidasi kewenangan
//     superadmin atau admin tenant tujuan sebelum menyentuh Admin Auth API.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ProvisionUserPayload {
  tenantId: string;
  profileId?: string | null;
  username: string;
  name: string;
  email: string;
  role: 'judge' | 'admin' | 'superadmin';
  judgeCategory?: string | null;
  judgeField?: string | null;
  status?: 'Aktif' | 'Nonaktif';
  redirectTo?: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isAllowedRedirectUrl(redirectTo: string | undefined, requestOrigin: string | null): boolean {
  if (!redirectTo) return true;
  try {
    const parsed = new URL(redirectTo);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      return false;
    }
    if (requestOrigin) {
      const originUrl = new URL(requestOrigin);
      if (parsed.origin !== originUrl.origin) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Metode HTTP tidak diizinkan. Gunakan POST.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return jsonResponse(
      {
        success: false,
        code: 'EDGE_ENV_INCOMPLETE',
        error: 'Konfigurasi server Edge Function belum lengkap (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).',
      },
      500
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse(
      {
        success: false,
        code: 'UNAUTHORIZED',
        error: 'Otorisasi ditolak: Header Authorization Bearer JWT wajib disertakan.',
      },
      401
    );
  }

  // Client dengan konteks JWT pemanggil untuk memverifikasi identitas & menjalankan RPC dengan auth.uid() asli
  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: callerUser },
    error: callerAuthError,
  } = await callerClient.auth.getUser();

  if (callerAuthError || !callerUser) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_SESSION',
        error: 'Otorisasi ditolak: Sesi autentikasi pemanggil tidak valid atau telah berakhir.',
      },
      401
    );
  }

  let payload: ProvisionUserPayload;
  try {
    payload = (await req.json()) as ProvisionUserPayload;
  } catch {
    return jsonResponse({ success: false, code: 'INVALID_JSON', error: 'Format body JSON tidak valid.' }, 400);
  }

  const tenantId = (payload.tenantId || '').trim();
  const cleanEmail = (payload.email || '').trim().toLowerCase();
  const cleanName = (payload.name || '').trim();
  const cleanUsername = (payload.username || '').trim().toLowerCase();
  const targetRole = payload.role || 'judge';
  const targetStatus = payload.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';

  if (!tenantId || !cleanName || !cleanEmail || !isValidEmail(cleanEmail)) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Data penyelenggara (tenantId), nama lengkap, dan alamat email yang valid wajib diisi.',
      },
      400
    );
  }

  if (!['judge', 'admin', 'superadmin'].includes(targetRole)) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_ROLE',
        error: `Peran pengguna (${targetRole}) tidak dikenali oleh sistem.`,
      },
      400
    );
  }

  const requestOrigin = req.headers.get('origin');
  if (!isAllowedRedirectUrl(payload.redirectTo, requestOrigin)) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_REDIRECT_URL',
        error: 'URL redirect undangan tidak valid atau tidak sesuai dengan origin aplikasi.',
      },
      400
    );
  }

  // Verifikasi peran pemanggil melalui profil & keanggotaan tenant
  const { data: callerProfile, error: profileErr } = await callerClient
    .from('profiles')
    .select('id, role, name')
    .eq('id', callerUser.id)
    .maybeSingle();

  if (profileErr || !callerProfile) {
    return jsonResponse(
      {
        success: false,
        code: 'CALLER_PROFILE_MISSING',
        error: 'Otorisasi ditolak: Profil pemanggil tidak ditemukan di database.',
      },
      403
    );
  }

  const isCallerSuperadmin = callerProfile.role === 'superadmin';

  if (!isCallerSuperadmin) {
    if (targetRole === 'superadmin') {
      return jsonResponse(
        {
          success: false,
          code: 'SUPERADMIN_ESCALATION_FORBIDDEN',
          error: 'Otorisasi ditolak: Administrator Tenant tidak diizinkan membuat atau menetapkan peran Superadmin.',
        },
        403
      );
    }

    const { data: callerMembership, error: membershipErr } = await callerClient
      .from('tenant_memberships')
      .select('id, role, status')
      .eq('tenant_id', tenantId)
      .eq('profile_id', callerUser.id)
      .eq('status', 'Aktif')
      .maybeSingle();

    if (membershipErr || !callerMembership || !['admin', 'superadmin'].includes(callerMembership.role)) {
      return jsonResponse(
        {
          success: false,
          code: 'TENANT_ADMIN_REQUIRED',
          error: 'Otorisasi ditolak: Anda bukan Administrator aktif pada penyelenggara (tenant) tujuan ini.',
        },
        403
      );
    }
  }

  // Gunakan Service Role Client di sisi server untuk mengundang/memeriksa akun di Supabase Auth
  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let resolvedAuthUserId: string | null = payload.profileId?.trim() || null;
  let provisioningState: 'invited' | 'linked_existing' = 'linked_existing';

  // Periksa apakah akun email belum ada di auth.users dengan mencoba mengundang melalui Admin API
  const inviteOptions: {
    data: Record<string, unknown>;
    redirectTo?: string;
  } = {
    data: {
      name: cleanName,
      username: cleanUsername || cleanEmail.split('@')[0],
      tenant_id: tenantId,
      role: targetRole,
    },
  };
  if (payload.redirectTo) {
    inviteOptions.redirectTo = payload.redirectTo;
  }

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    cleanEmail,
    inviteOptions
  );

  if (!inviteError && inviteData?.user?.id) {
    resolvedAuthUserId = inviteData.user.id;
    provisioningState = 'invited';
  } else if (inviteError) {
    const errLower = inviteError.message.toLowerCase();
    const isAlreadyRegistered =
      errLower.includes('already been registered') ||
      errLower.includes('already registered') ||
      errLower.includes('already exists') ||
      errLower.includes('user already');

    if (!isAlreadyRegistered) {
      return jsonResponse(
        {
          success: false,
          code: 'AUTH_INVITE_FAILED',
          error: `Gagal mengundang pengguna di Supabase Auth: ${inviteError.message}`,
        },
        400
      );
    }
    // Jika email sudah terdaftar di auth.users, RPC upsert_tenant_member_profile akan mencocokkan berdasarkan email secara langsung
    provisioningState = 'linked_existing';
  }

  // Panggil RPC otoritatif dengan sesi pemanggil untuk memetakan public.profiles, public.tenant_memberships, dan audit_logs
  const { data: rpcResult, error: rpcError } = await callerClient.rpc('upsert_tenant_member_profile', {
    p_tenant_id: tenantId,
    p_profile_id: resolvedAuthUserId,
    p_username: cleanUsername || cleanEmail.split('@')[0],
    p_name: cleanName,
    p_email: cleanEmail,
    p_role: targetRole,
    p_judge_category: payload.judgeCategory ?? null,
    p_judge_field: payload.judgeField ?? null,
    p_status: targetStatus,
  });

  if (rpcError) {
    return jsonResponse(
      {
        success: false,
        code: 'MEMBERSHIP_SYNC_FAILED',
        authUserId: resolvedAuthUserId,
        provisioningState,
        error: `Akun Auth berhasil disiapkan, namun sinkronisasi profil/keanggotaan gagal: ${rpcError.message}. Anda dapat menekan tombol Coba Ulang (Retry) tanpa membuat duplikasi akun.`,
      },
      422
    );
  }

  const rpcObj = (rpcResult ?? {}) as Record<string, unknown>;

  return jsonResponse({
    success: true,
    profileId: (rpcObj.profile_id as string) || resolvedAuthUserId,
    email: cleanEmail,
    role: (rpcObj.role as string) || targetRole,
    status: (rpcObj.status as string) || targetStatus,
    provisioningState,
    message:
      provisioningState === 'invited'
        ? `Undangan aktivasi akun telah dikirim ke ${cleanEmail} dan keanggotaan tenant berhasil diikat.`
        : `Akun ${cleanEmail} yang sudah terdaftar berhasil ditautkan dan diperbarui pada tenant ini.`,
  });
});
