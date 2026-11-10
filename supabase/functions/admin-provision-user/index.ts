// ==============================================================================
// SUPABASE EDGE FUNCTION: admin-provision-user
// Lokasi: supabase/functions/admin-provision-user/index.ts
// Deskripsi:
//   Layanan server-side terotorisasi untuk mengundang/membuat akun pengguna
//   di Supabase Authentication (auth.users) dan memetakan public.profiles +
//   public.tenant_memberships secara atomik melalui RPC upsert_tenant_member_profile.
//
// Keamanan (T2.2 Hardened):
//   - SUPABASE_SERVICE_ROLE_KEY HANYA dibaca dari Deno.env di sisi server.
//   - Rate-limit: maks 20 undangan/jam per callerUser.id & per tenantId (HTTP 429).
//   - Anti-enumerasi: respons publik seragam ('Undangan atau penautan akun telah diproses.')
//     tanpa membocorkan provisioningState di body HTTP (dicatat hanya di audit_logs).
//   - CORS: allowlist dari env ALLOWED_ORIGINS (fallback ke http://localhost:3000 di dev).
//   - Validasi input ketat: name <= 120, username <= 60 (^[a-z0-9_.-]+$),
//     email <= 254, judgeCategory/judgeField <= 120.
// ==============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const MAX_INVITES_PER_HOUR = 20;
const USERNAME_PATTERN = /^[a-z0-9_.-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function resolveCorsHeaders(
  requestOrigin: string | null,
  allowedOriginsEnv?: string
): { allowed: boolean; headers: Record<string, string> } {
  const defaultDevOrigin = 'http://localhost:3000';
  const configuredList = (allowedOriginsEnv || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const allowlist = configuredList.length > 0 ? configuredList : [defaultDevOrigin, 'http://127.0.0.1:3000'];
  const cleanOrigin = (requestOrigin || '').trim();
  const isAllowed = !cleanOrigin || allowlist.includes(cleanOrigin);
  const resolvedOrigin =
    cleanOrigin && allowlist.includes(cleanOrigin) ? cleanOrigin : allowlist[0] || defaultDevOrigin;

  return {
    allowed: isAllowed,
    headers: {
      'Access-Control-Allow-Origin': resolvedOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    },
  };
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
  corsHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAllowedRedirectUrl(
  redirectTo: string | undefined,
  requestOrigin: string | null,
  allowedOriginsEnv?: string
): boolean {
  if (!redirectTo) return true;
  try {
    const parsed = new URL(redirectTo);
    if (
      parsed.protocol !== 'https:' &&
      parsed.hostname !== 'localhost' &&
      parsed.hostname !== '127.0.0.1'
    ) {
      return false;
    }
    const configuredList = (allowedOriginsEnv || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    if (configuredList.length > 0 && !configuredList.includes(parsed.origin)) {
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
  const requestOrigin = req.headers.get('origin');
  const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  const { allowed: isOriginAllowed, headers: corsHeaders } = resolveCorsHeaders(
    requestOrigin,
    allowedOriginsEnv
  );

  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed) {
      return jsonResponse({ success: false, code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin tidak diizinkan.' }, 403, corsHeaders);
    }
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isOriginAllowed) {
    return jsonResponse(
      { success: false, code: 'CORS_ORIGIN_FORBIDDEN', error: 'Origin permintaan tidak terdaftar dalam ALLOWED_ORIGINS.' },
      403,
      corsHeaders
    );
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Metode HTTP tidak diizinkan. Gunakan POST.' },
      405,
      corsHeaders
    );
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
      500,
      corsHeaders
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
      401,
      corsHeaders
    );
  }

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
      401,
      corsHeaders
    );
  }

  let payload: ProvisionUserPayload;
  try {
    payload = (await req.json()) as ProvisionUserPayload;
  } catch {
    return jsonResponse(
      { success: false, code: 'INVALID_JSON', error: 'Format body JSON tidak valid.' },
      400,
      corsHeaders
    );
  }

  const tenantId = (payload.tenantId || '').trim();
  const cleanEmail = (payload.email || '').trim().toLowerCase();
  const cleanName = (payload.name || '').trim();
  const rawUsername = (payload.username || '').trim().toLowerCase();
  const fallbackUsername = cleanEmail.includes('@')
    ? cleanEmail.split('@')[0].replace(/[^a-z0-9_.-]/g, '_')
    : '';
  const cleanUsername = rawUsername || fallbackUsername;
  const targetRole = payload.role || 'judge';
  const targetStatus = payload.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
  const cleanJudgeCategory = payload.judgeCategory ? payload.judgeCategory.trim() : null;
  const cleanJudgeField = payload.judgeField ? payload.judgeField.trim() : null;

  if (!tenantId || !cleanName || !cleanEmail) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Data penyelenggara (tenantId), nama lengkap, dan alamat email wajib diisi.',
      },
      400,
      corsHeaders
    );
  }

  if (cleanName.length > 120) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Nama lengkap maksimal 120 karakter.',
      },
      400,
      corsHeaders
    );
  }

  if (cleanEmail.length > 254 || !EMAIL_PATTERN.test(cleanEmail)) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Format alamat email tidak valid atau melebihi batas 254 karakter.',
      },
      400,
      corsHeaders
    );
  }

  if (!cleanUsername || cleanUsername.length > 60 || !USERNAME_PATTERN.test(cleanUsername)) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Username maksimal 60 karakter dan hanya boleh menggunakan huruf kecil, angka, titik, garis bawah, atau tanda hubung (^[a-z0-9_.-]+$).',
      },
      400,
      corsHeaders
    );
  }

  if (!['judge', 'admin', 'superadmin'].includes(targetRole)) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_ROLE',
        error: `Peran pengguna (${targetRole}) tidak dikenali oleh sistem.`,
      },
      400,
      corsHeaders
    );
  }

  if (cleanJudgeCategory && cleanJudgeCategory.length > 120) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Kategori hakim (judgeCategory) maksimal 120 karakter.',
      },
      400,
      corsHeaders
    );
  }

  if (cleanJudgeField && cleanJudgeField.length > 120) {
    return jsonResponse(
      {
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Bidang penilaian hakim (judgeField) maksimal 120 karakter.',
      },
      400,
      corsHeaders
    );
  }

  if (!isAllowedRedirectUrl(payload.redirectTo, requestOrigin, allowedOriginsEnv)) {
    return jsonResponse(
      {
        success: false,
        code: 'INVALID_REDIRECT_URL',
        error: 'URL redirect undangan tidak valid atau tidak sesuai dengan origin aplikasi.',
      },
      400,
      corsHeaders
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
      403,
      corsHeaders
    );
  }

  const isCallerSuperadmin = callerProfile.role === 'superadmin';
  const allowedRolesForCaller = isCallerSuperadmin
    ? ['judge', 'admin', 'superadmin']
    : ['judge', 'admin'];

  if (!allowedRolesForCaller.includes(targetRole)) {
    return jsonResponse(
      {
        success: false,
        code: targetRole === 'superadmin' ? 'SUPERADMIN_ESCALATION_FORBIDDEN' : 'INVALID_ROLE',
        error:
          targetRole === 'superadmin'
            ? 'Otorisasi ditolak: Administrator Tenant tidak diizinkan membuat atau menetapkan peran Superadmin.'
            : `Peran pengguna (${targetRole}) tidak diizinkan. Gunakan salah satu dari: ${allowedRolesForCaller.join(', ')}.`,
      },
      targetRole === 'superadmin' ? 403 : 400,
      corsHeaders
    );
  }

  if (!isCallerSuperadmin) {
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
        403,
        corsHeaders
      );
    }
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // T2.2 Rate-limit: maks 20 undangan/jam per callerUser.id & maks 20 undangan/jam per tenantId
  // dihitung dari audit_logs (action = 'USER_MEMBERSHIP_UPSERTED', created_at > now() - interval '1 hour')
  const oneHourAgoIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count: callerHourlyCount } = await adminClient
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', callerUser.id)
    .eq('action', 'USER_MEMBERSHIP_UPSERTED')
    .gt('created_at', oneHourAgoIso);

  if ((callerHourlyCount ?? 0) >= MAX_INVITES_PER_HOUR) {
    return jsonResponse(
      {
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        error: `Batas kuota undangan akun terlampaui (maksimal ${MAX_INVITES_PER_HOUR} undangan per jam per administrator). Silakan coba kembali nanti.`,
      },
      429,
      corsHeaders
    );
  }

  const { count: tenantHourlyCount } = await adminClient
    .from('audit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('action', 'USER_MEMBERSHIP_UPSERTED')
    .gt('created_at', oneHourAgoIso);

  if ((tenantHourlyCount ?? 0) >= MAX_INVITES_PER_HOUR) {
    return jsonResponse(
      {
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        error: `Batas kuota undangan akun untuk penyelenggara (tenant) ini terlampaui (maksimal ${MAX_INVITES_PER_HOUR} undangan per jam). Silakan coba kembali nanti.`,
      },
      429,
      corsHeaders
    );
  }

  let resolvedAuthUserId: string | null = payload.profileId?.trim() || null;
  let internalProvisioningState: 'invited' | 'linked_existing' = 'linked_existing';

  const inviteOptions: {
    data: Record<string, unknown>;
    redirectTo?: string;
  } = {
    data: {
      name: cleanName,
      username: cleanUsername,
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
    internalProvisioningState = 'invited';
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
          error: 'Permintaan undangan atau penautan akun tidak dapat diproses saat ini.',
        },
        400,
        corsHeaders
      );
    }
    internalProvisioningState = 'linked_existing';
  }

  // Panggil RPC otoritatif dengan sesi pemanggil untuk memetakan public.profiles, public.tenant_memberships, dan audit_logs
  const { data: rpcResult, error: rpcError } = await callerClient.rpc('upsert_tenant_member_profile', {
    p_tenant_id: tenantId,
    p_profile_id: resolvedAuthUserId,
    p_username: cleanUsername,
    p_name: cleanName,
    p_email: cleanEmail,
    p_role: targetRole,
    p_judge_category: cleanJudgeCategory,
    p_judge_field: cleanJudgeField,
    p_status: targetStatus,
  });

  if (rpcError) {
    let rollbackDeleted = false;
    if (internalProvisioningState === 'invited' && resolvedAuthUserId) {
      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(resolvedAuthUserId);
      rollbackDeleted = !deleteErr;
    }
    return jsonResponse(
      {
        success: false,
        code: 'MEMBERSHIP_SYNC_FAILED',
        rolledBackAuthUser: rollbackDeleted,
        error: rollbackDeleted
          ? `Sinkronisasi profil/keanggotaan gagal (${rpcError.message}). Akun Auth baru telah dibatalkan (dihapus kembali) secara otomatis agar tidak meninggalkan akun yatim.`
          : `Sinkronisasi profil/keanggotaan gagal: ${rpcError.message}.`,
      },
      422,
      corsHeaders
    );
  }

  // Catat detail internalProvisioningState hanya di audit_logs (bukan di body respons HTTP)
  await callerClient.rpc('append_admin_audit_log', {
    p_tenant_id: tenantId,
    p_action: 'USER_PROVISION_DISPATCHED',
    p_target: `Email: ${cleanEmail}`,
    p_summary: `Provisioning akun diproses (state internal: ${internalProvisioningState}) untuk peran ${targetRole}`,
    p_reason: null,
    p_outcome: 'Success',
  });

  const rpcObj = (rpcResult ?? {}) as Record<string, unknown>;

  return jsonResponse(
    {
      success: true,
      profileId: (rpcObj.profile_id as string) || resolvedAuthUserId,
      email: cleanEmail,
      role: (rpcObj.role as string) || targetRole,
      status: (rpcObj.status as string) || targetStatus,
      message: 'Undangan atau penautan akun telah diproses.',
    },
    200,
    corsHeaders
  );
});
