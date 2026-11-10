export interface ProvisionPayloadValidationInput {
  tenantId?: string;
  name?: string;
  username?: string;
  email?: string;
  role?: string;
  judgeCategory?: string | null;
  judgeField?: string | null;
}

export interface ProvisionPayloadValidationResult {
  valid: boolean;
  code?: string;
  error?: string;
  sanitized?: {
    tenantId: string;
    name: string;
    username: string;
    email: string;
    role: 'judge' | 'admin' | 'superadmin';
    judgeCategory: string | null;
    judgeField: string | null;
  };
}

const USERNAME_PATTERN = /^[a-z0-9_.-]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProvisionUserPayload(
  input: ProvisionPayloadValidationInput
): ProvisionPayloadValidationResult {
  const tenantId = (input.tenantId || '').trim();
  const name = (input.name || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const rawUsername = (input.username || '').trim().toLowerCase();
  const fallbackUsername = email.includes('@')
    ? email.split('@')[0].replace(/[^a-z0-9_.-]/g, '_')
    : '';
  const username = rawUsername || fallbackUsername;
  const role = (input.role || 'judge').trim() as 'judge' | 'admin' | 'superadmin';
  const judgeCategory = input.judgeCategory ? input.judgeCategory.trim() : null;
  const judgeField = input.judgeField ? input.judgeField.trim() : null;

  if (!tenantId || !name || !email) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error: 'Data penyelenggara (tenantId), nama lengkap, dan alamat email wajib diisi.'
    };
  }

  if (name.length > 120) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error: 'Nama lengkap maksimal 120 karakter.'
    };
  }

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error: 'Format alamat email tidak valid atau melebihi batas 254 karakter.'
    };
  }

  if (!username || username.length > 60 || !USERNAME_PATTERN.test(username)) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error: 'Username maksimal 60 karakter dan hanya boleh menggunakan huruf kecil, angka, titik, garis bawah, atau tanda hubung (^[a-z0-9_.-]+$).'
    };
  }

  if (!['judge', 'admin', 'superadmin'].includes(role)) {
    return {
      valid: false,
      code: 'INVALID_ROLE',
      error: `Peran pengguna (${role}) tidak dikenali oleh sistem.`
    };
  }

  if (judgeCategory && judgeCategory.length > 120) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error: 'Kategori hakim (judgeCategory) maksimal 120 karakter.'
    };
  }

  if (judgeField && judgeField.length > 120) {
    return {
      valid: false,
      code: 'VALIDATION_ERROR',
      error: 'Bidang penilaian hakim (judgeField) maksimal 120 karakter.'
    };
  }

  return {
    valid: true,
    sanitized: {
      tenantId,
      name,
      username,
      email,
      role,
      judgeCategory,
      judgeField
    }
  };
}

export function evaluateProvisionRateLimit(
  callerHourlyCount: number,
  tenantHourlyCount: number,
  maxPerHour = 20
): { allowed: boolean; status: number; code?: string; error?: string } {
  if (callerHourlyCount >= maxPerHour) {
    return {
      allowed: false,
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      error: `Batas kuota undangan akun terlampaui (maksimal ${maxPerHour} undangan per jam per administrator). Silakan coba kembali nanti.`
    };
  }
  if (tenantHourlyCount >= maxPerHour) {
    return {
      allowed: false,
      status: 429,
      code: 'RATE_LIMIT_EXCEEDED',
      error: `Batas kuota undangan akun untuk penyelenggara (tenant) ini terlampaui (maksimal ${maxPerHour} undangan per jam). Silakan coba kembali nanti.`
    };
  }
  return { allowed: true, status: 200 };
}

export function resolveCorsHeaders(
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
  const resolvedOrigin = cleanOrigin && allowlist.includes(cleanOrigin) ? cleanOrigin : allowlist[0] || defaultDevOrigin;

  return {
    allowed: isAllowed,
    headers: {
      'Access-Control-Allow-Origin': resolvedOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin'
    }
  };
}

export function buildPublicProvisionSuccessResponse(params: {
  profileId: string | null;
  email: string;
  role: string;
  status: string;
}): Record<string, unknown> {
  return {
    success: true,
    profileId: params.profileId,
    email: params.email,
    role: params.role,
    status: params.status,
    message: 'Undangan atau penautan akun telah diproses.'
  };
}
