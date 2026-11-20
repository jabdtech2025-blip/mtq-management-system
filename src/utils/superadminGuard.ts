import { Tenant } from '../types/mtq';

export type TenantStatusFilter = 'Aktif' | 'Nonaktif' | 'Semua';

/**
 * Menentukan tenant target untuk Superadmin saat login atau refresh sesi.
 * Superadmin WAJIB selalu mendarat di 'platform' kecuali sedang menjalani sesi supervisi
 * yang dibuka secara sah melalui enterTenantWorkspace().
 */
export function resolveSuperadminTargetTenant(params: {
  currentTenantId: string;
  activeSupervisedTenantId?: string | null;
}): string {
  const activeId = (params.activeSupervisedTenantId || '').trim();
  if (activeId && params.currentTenantId === activeId) {
    return activeId;
  }
  return 'platform';
}

/**
 * Memeriksa apakah sebuah tenant boleh dibuka ke dalam Mode Supervisi.
 * Tenant berstatus Nonaktif (Arsip) tidak boleh dibuka sebelum diaktifkan kembali.
 */
export function canSuperviseTenant(tenant?: Pick<Tenant, 'id' | 'name' | 'status'> | null): {
  allowed: boolean;
  message?: string;
} {
  if (!tenant) {
    return { allowed: false, message: 'Penyelenggara tidak ditemukan.' };
  }
  if (tenant.status !== 'Aktif') {
    return {
      allowed: false,
      message: `Penyelenggara "${tenant.name}" berstatus Nonaktif (Arsip) dan tidak dapat dibuka. Aktifkan kembali terlebih dahulu bila perlu mengakses workspace-nya.`
    };
  }
  return { allowed: true };
}

/**
 * Menyaring daftar penyelenggara MTQ berdasarkan status (default: Aktif) dan kata kunci pencarian.
 */
export function filterTenantsForManagement<T extends Pick<Tenant, 'name' | 'code' | 'region' | 'eventName' | 'status'>>(
  tenants: T[],
  options: { statusFilter: TenantStatusFilter; searchQuery?: string }
): T[] {
  const q = (options.searchQuery || '').trim().toLowerCase();
  return tenants.filter((t) => {
    const matchesStatus =
      options.statusFilter === 'Semua'
        ? true
        : options.statusFilter === 'Aktif'
        ? t.status === 'Aktif'
        : t.status !== 'Aktif';
    if (!matchesStatus) return false;
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      t.code.toLowerCase().includes(q) ||
      t.region.toLowerCase().includes(q) ||
      (t.eventName || '').toLowerCase().includes(q)
    );
  });
}
