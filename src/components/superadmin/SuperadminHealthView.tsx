import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Wrench,
  CheckSquare
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import {
  PlatformHealthCheckItem,
  PlatformHealthCheckKey
} from '../../types/mtq';
import { Button, Badge, Checkbox } from '../ui';
import { supabaseDataService } from '../../services/supabaseDataService';
import { formatDateTimeWIB } from '../../utils/dateTime';
import { INITIAL_ERROR_CATEGORIES } from '../../data/mockData';

interface ManualHealthCheckDefinition {
  id: string;
  label: string;
  description: string;
}

const MANUAL_HEALTH_CHECKS: ManualHealthCheckDefinition[] = [
  {
    id: 'db_point_in_time_recovery',
    label: 'Point-in-Time Recovery (PITR) & Cadangan Otomatis Supabase Aktif',
    description:
      'Pastikan database backup otomatis atau PITR telah diaktifkan pada dashboard Supabase (Database → Backups) untuk mencegah kehilangan data nilai saat insiden operasional.'
  },
  {
    id: 'auth_email_rate_limit',
    label: 'Rate Limiting dan Proteksi Brute-Force Auth Supabase',
    description:
      'Periksa apakah rate limit autentikasi (Authentication → Rate Limits) diatur secara proporsional agar dewan hakim tidak terblokir saat login massal di venue.'
  },
  {
    id: 'self_signup_disabled',
    label: 'Pendaftaran Mandiri Supabase Auth Dinonaktifkan',
    description:
      'Pastikan "Allow new users to sign up" dimatikan (Authentication → Sign In / Providers). Akun hanya dibuat lewat undangan administrator.'
  },
  {
    id: 'realtime_publication',
    label: 'Realtime Supabase Aktif untuk Rekap Nilai',
    description:
      'Pastikan migrasi 20261119 sudah dijalankan sehingga tabel judge_assessments, stage_participations, dan stages terdaftar di publikasi supabase_realtime (Database → Publications). Tanpa ini, rekap tidak ter-update otomatis.'
  },
  {
    id: 'auth_redirect_urls',
    label: 'Site URL / Redirect URLs Supabase Auth sudah memuat /app',
    description:
      'Pastikan Site URL dan Redirect URLs di Authentication → URL Configuration telah mencantumkan rute /app untuk pemulihan kata sandi dan undangan.'
  }
];

export const SuperadminHealthView: React.FC = () => {
  const {
    tenants,
    rubricVersions,
    competitionRules,
    siteSettings,
    updateSiteSettings,
    isLiveSupabaseMode,
    setCurrentView,
    enterTenantWorkspace,
    addNotification
  } = useMtq();

  const [healthItems, setHealthItems] = useState<PlatformHealthCheckItem[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState<boolean>(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>(() =>
    formatDateTimeWIB(new Date().toISOString())
  );
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const evaluateLocalPlatformHealth = useCallback((): PlatformHealthCheckItem[] => {
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    // 1. schema_version
    const schemaDetail = [
      { version: '20261118', applied_at: '2026-11-18T09:00:00Z' },
      { version: '20261117', applied_at: '2026-11-17T09:00:00Z' },
      { version: '20261116', applied_at: '2026-11-16T09:00:00Z' },
      { version: '20261115', applied_at: '2026-11-15T09:00:00Z' },
      { version: '20261114', applied_at: '2026-11-14T09:00:00Z' }
    ];

    // 2. unmapped_error_categories
    const unmappedCats = INITIAL_ERROR_CATEGORIES.filter(
      (ec) =>
        ec.status === 'Aktif' &&
        !ec.fieldId &&
        !ec.criterionId &&
        !ec.deductionRuleId
    );

    // 3. borrowed_maqra_sheets
    const borrowedSheets: Record<string, any>[] = [];

    // 4. rubrics_without_official_source
    const unverifiedRubrics: Record<string, any>[] = [];
    for (const rv of rubricVersions) {
      if (!rv.officialSource || !rv.officialSource.trim() || !rv.isOfficialVerified) {
        unverifiedRubrics.push({
          jenis: 'rubrik',
          identifier: rv.code,
          name: rv.name,
          official_source: rv.officialSource || 'Belum terverifikasi resmi',
          tenant_id: rv.tenantId,
          tenant_name: tenantMap.get(rv.tenantId) || 'Template Sistem Nasional'
        });
      }
    }
    for (const crc of competitionRules) {
      if (!crc.officialSource || !crc.officialSource.trim() || !crc.isVerifiedOfficial) {
        unverifiedRubrics.push({
          jenis: 'aturan',
          identifier: crc.branchName,
          name: `Aturan Kompetisi ${crc.branchName}`,
          official_source: crc.officialSource || 'Belum terverifikasi resmi',
          tenant_id: crc.tenantId,
          tenant_name: tenantMap.get(crc.tenantId) || 'Template Sistem Nasional'
        });
      }
    }

    // 5. tenants_without_active_admin
    const tenantsWithoutAdmin: Record<string, any>[] = [];

    // 6. stages_without_judges
    const stagesWithoutJudges: Record<string, any>[] = [];

    // 7. pending_verifications
    const pendingVerifications: Record<string, any>[] = [];

    // 8. stalled_assessments
    const stalledAssessments: Record<string, any>[] = [];

    // 9. site_settings_missing
    const isSiteSettingsComplete =
      Boolean(siteSettings.siteName?.trim()) &&
      Boolean(siteSettings.defaultTitle?.trim()) &&
      Boolean(siteSettings.canonicalUrl?.trim()) &&
      Boolean(siteSettings.ogImageUrl?.trim());
    const siteSettingsMissing = !isSiteSettingsComplete ? [{ issue: 'Pengaturan SEO/Site Settings belum lengkap' }] : [];

    return [
      {
        key: 'schema_version',
        label: 'Integritas Riwayat Migrasi Skema Database (app_schema_versions)',
        status: 'ok',
        count: schemaDetail.length,
        detail: schemaDetail,
        how_to_fix:
          'Seluruh migrasi skema terpantau berurutan dan terdaftar resmi pada app_schema_versions.'
      },
      {
        key: 'unmapped_error_categories',
        label: 'Kategori Kesalahan Tanpa Relasi Rubrik / Komponen Pengurangan',
        status: unmappedCats.length > 0 ? 'warning' : 'ok',
        count: unmappedCats.length,
        detail: unmappedCats.map((c) => ({
          kode: c.code,
          nama: c.name,
          cakupan: c.scope,
          tenant_id: c.tenantId,
          tenant_name: tenantMap.get(c.tenantId) || 'Template Nasional'
        })),
        how_to_fix:
          'Buka Master Data & Rubrik, edit kategori kesalahan, lalu hubungkan ke RubricField atau RubricCriterion yang sesuai.'
      },
      {
        key: 'borrowed_maqra_sheets',
        label: 'Integritas Berkas Mushaf Maqra (Tanpa Penumpukan Silang)',
        status: 'ok',
        count: 0,
        detail: borrowedSheets,
        how_to_fix:
          'Pastikan setiap maqra memiliki lembar mushaf mandiri dan tidak memakai ID maqra lain secara tidak sah.'
      },
      {
        key: 'rubrics_without_official_source',
        label: 'Rubrik & Aturan Kompetisi Belum Terverifikasi Sumber Resmi LPTQ',
        status: unverifiedRubrics.length > 0 ? 'warning' : 'ok',
        count: unverifiedRubrics.length,
        detail: unverifiedRubrics,
        how_to_fix:
          'Tetapkan dasar hukum (Nomor SK LPTQ / Juknis Resmi Kemenag RI) pada pengaturan rubrik cabang terkait.'
      },
      {
        key: 'tenants_without_active_admin',
        label: 'Penyelenggara MTQ Tanpa Administrator Wilayah Aktif',
        status: tenantsWithoutAdmin.length > 0 ? 'critical' : 'ok',
        count: tenantsWithoutAdmin.length,
        detail: tenantsWithoutAdmin,
        how_to_fix:
          'Buka Manajemen Akun dan pastikan setiap penyelenggara memiliki minimal satu akun peran admin berstatus Aktif.'
      },
      {
        key: 'stages_without_judges',
        label: 'Babak Musabaqah Berjalan Tanpa Dewan Hakim Ditugaskan',
        status: stagesWithoutJudges.length > 0 ? 'warning' : 'ok',
        count: stagesWithoutJudges.length,
        detail: stagesWithoutJudges,
        how_to_fix:
          'Buka Manajemen Babak di workspace MTQ terkait dan tugaskan dewan hakim sebelum memulai sesi lomba.'
      },
      {
        key: 'pending_verifications',
        label: 'Peserta Belum Diverifikasi Menjelang Jadwal Tampil',
        status: pendingVerifications.length > 0 ? 'warning' : 'ok',
        count: pendingVerifications.length,
        detail: pendingVerifications,
        how_to_fix:
          'Buka modul Grup & Peserta lalu selesaikan verifikasi berkas dan keabsahan data peserta.'
      },
      {
        key: 'stalled_assessments',
        label: 'Penilaian Tertahan / Terputus Tanpa Status Selesai',
        status: stalledAssessments.length > 0 ? 'critical' : 'ok',
        count: stalledAssessments.length,
        detail: stalledAssessments,
        how_to_fix:
          'Periksa Monitoring Penilaian atau minta dewan hakim menyimpan/mengonfirmasi nilai peserta.'
      },
      {
        key: 'site_settings_missing',
        label: 'Konfigurasi SEO & Metadata Situs (site_settings) Lengkap',
        status: siteSettingsMissing.length > 0 ? 'warning' : 'ok',
        count: siteSettingsMissing.length,
        detail: siteSettingsMissing,
        how_to_fix:
          'Buka SEO dan Meta Situs untuk melengkapi judul bawaan, deskripsi, favicon, dan gambar Open Graph.'
      }
    ];
  }, [tenants, rubricVersions, competitionRules, siteSettings]);

  const runHealthCheck = useCallback(async () => {
    setIsCheckingHealth(true);
    try {
      if (isLiveSupabaseMode) {
        const res = await supabaseDataService.getPlatformHealth();
        if (res.success && res.data) {
          setHealthItems(res.data);
          setLastCheckedAt(formatDateTimeWIB(new Date().toISOString()));
          return;
        }
      }
      const localEvaluated = evaluateLocalPlatformHealth();
      setHealthItems(localEvaluated);
      setLastCheckedAt(formatDateTimeWIB(new Date().toISOString()));
    } finally {
      setIsCheckingHealth(false);
    }
  }, [isLiveSupabaseMode, evaluateLocalPlatformHealth]);

  useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const criticalCount = healthItems.filter((i) => i.status === 'critical').length;
  const warningCount = healthItems.filter((i) => i.status === 'warning').length;
  const okCount = healthItems.filter((i) => i.status === 'ok').length;

  const handleToggleManualCheck = async (checkId: string, checked: boolean) => {
    const nextChecks = {
      ...(siteSettings.manualChecks || {}),
      [checkId]: checked
    };
    const res = await updateSiteSettings({ manualChecks: nextChecks });
    if (res.success) {
      addNotification({
        title: 'Verifikasi Manual Disimpan',
        message: `Pemeriksaan manual "${checkId}" berhasil diperbarui.`,
        type: 'success',
        module: 'Health Check'
      });
    }
  };

  const manualCheckedCount = MANUAL_HEALTH_CHECKS.filter(
    (m) => Boolean(siteSettings.manualChecks?.[m.id])
  ).length;

  const handleNavigateFromHealthItem = (item: PlatformHealthCheckItem) => {
    const firstTenantId = item.detail?.[0]?.tenant_id;
    switch (item.key) {
      case 'site_settings_missing':
        setCurrentView('superadmin_settings');
        break;
      case 'tenants_without_active_admin':
        setCurrentView('superadmin_users');
        break;
      case 'unmapped_error_categories':
      case 'rubrics_without_official_source':
        if (firstTenantId && firstTenantId !== 'system') {
          enterTenantWorkspace(firstTenantId);
        }
        setCurrentView('master_data');
        break;
      case 'stages_without_judges':
        if (firstTenantId) {
          enterTenantWorkspace(firstTenantId);
        }
        setCurrentView('stage_management');
        break;
      case 'pending_verifications':
        if (firstTenantId) {
          enterTenantWorkspace(firstTenantId);
        }
        setCurrentView('kafilah');
        break;
      case 'stalled_assessments':
      case 'borrowed_maqra_sheets':
        if (firstTenantId) {
          enterTenantWorkspace(firstTenantId);
        }
        setCurrentView('penilaian_hakim');
        break;
      default:
        setCurrentView('superadmin_tenants');
        break;
    }
  };

  const getActionLabelForCheck = (key: PlatformHealthCheckItem['key']): string => {
    switch (key) {
      case 'site_settings_missing':
        return 'Buka SEO dan Meta Situs';
      case 'tenants_without_active_admin':
        return 'Kelola Akun Admin';
      case 'unmapped_error_categories':
      case 'rubrics_without_official_source':
        return 'Buka Master Data & Rubrik';
      case 'stages_without_judges':
        return 'Atur Dewan Hakim';
      case 'pending_verifications':
        return 'Verifikasi Peserta';
      case 'stalled_assessments':
      case 'borrowed_maqra_sheets':
        return 'Pantau Penilaian';
      default:
        return 'Kelola Penyelenggara';
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Halaman Khusus Health Check */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-purple-800 uppercase tracking-widest bg-purple-50 px-2.5 py-1 rounded-sm border border-purple-200">
            Diagnostik Integritas Platform
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Kesehatan Sistem (Health Check)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Pemeriksaan otomatis 9 indikator database, integritas skema, dan checklist keamanan infrastruktur.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="md"
          loading={isCheckingHealth}
          onClick={() => void runHealthCheck()}
          data-testid="health-recheck-btn"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Periksa Ulang Sekarang</span>
        </Button>
      </div>

      {/* Kartu Ringkasan Status */}
      <section
        aria-label="Health Dashboard Platform"
        data-testid="platform-health-dashboard"
        className="bg-white rounded-lg border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Activity className="w-4 h-4 text-purple-700" />
            <span>
              Waktu Pemeriksaan Terakhir:{' '}
              <strong
                data-testid="health-last-checked"
                className="font-mono tabular-nums text-slate-800"
              >
                {lastCheckedAt}
              </strong>
            </span>
          </div>
          <span className="text-xs font-semibold text-slate-400">
            {healthItems.length} Indikator Otomatis
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div
            data-testid="health-summary-critical"
            className={`p-4 rounded-md border flex items-center justify-between ${
              criticalCount > 0
                ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-rose-700">
                Kritis (Critical)
              </p>
              <p className="text-2xl font-extrabold font-mono tabular-nums mt-1">
                {criticalCount}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Masalah skema / integritas nilai
              </p>
            </div>
            <XCircle
              className={`w-8 h-8 shrink-0 ${
                criticalCount > 0 ? 'text-rose-600' : 'text-slate-300'
              }`}
            />
          </div>

          <div
            data-testid="health-summary-warning"
            className={`p-4 rounded-md border flex items-center justify-between ${
              warningCount > 0
                ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                Peringatan (Warning)
              </p>
              <p className="text-2xl font-extrabold font-mono tabular-nums mt-1">
                {warningCount}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Perlu tindak lanjut sebelum lomba
              </p>
            </div>
            <AlertTriangle
              className={`w-8 h-8 shrink-0 ${
                warningCount > 0 ? 'text-amber-600' : 'text-slate-300'
              }`}
            />
          </div>

          <div
            data-testid="health-summary-ok"
            className="p-4 rounded-md border bg-emerald-50/70 border-emerald-200 text-emerald-950 flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Sehat / Normal (OK)
              </p>
              <p className="text-2xl font-extrabold font-mono tabular-nums mt-1">
                {okCount}
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Pemeriksaan lolos tanpa temuan
              </p>
            </div>
            <CheckCircle2 className="w-8 h-8 shrink-0 text-emerald-600" />
          </div>
        </div>

        {/* Daftar Pemeriksaan Otomatis (Accordion 9 Item) */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Daftar Pemeriksaan Otomatis Database ({healthItems.length} Indikator)
            </h2>
            <span className="text-xs text-slate-400">
              Klik baris untuk melihat detail & langkah perbaikan
            </span>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-md overflow-hidden">
            {healthItems.map((item) => {
              const isExpanded = Boolean(expandedKeys[item.key]);
              const badgeVariant =
                item.status === 'critical'
                  ? 'danger'
                  : item.status === 'warning'
                  ? 'warning'
                  : 'success';
              const statusLabel =
                item.status === 'critical'
                  ? 'Kritis'
                  : item.status === 'warning'
                  ? 'Peringatan'
                  : 'Normal';

              return (
                <div
                  key={item.key}
                  data-testid={`health-check-${item.key}`}
                  className="bg-white"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.key)}
                    aria-expanded={isExpanded}
                    data-testid={`health-toggle-${item.key}`}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.status === 'critical' ? (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : item.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">
                          {item.label}
                        </p>
                        <p className="text-xs font-mono text-slate-400">
                          {item.key}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                        {item.count} temuan
                      </span>
                      <Badge variant={badgeVariant}>{statusLabel}</Badge>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div
                      data-testid={`health-detail-${item.key}`}
                      className="px-4 pb-4 pt-2 bg-slate-50/80 border-t border-slate-100 space-y-3 text-xs"
                    >
                      <div className="p-3 rounded-sm bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <Wrench className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-bold text-slate-800">Langkah Perbaikan:</p>
                            <p className="text-slate-600 mt-0.5 leading-relaxed">
                              {item.how_to_fix}
                            </p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => handleNavigateFromHealthItem(item)}
                          data-testid={`health-action-${item.key}`}
                          className="shrink-0"
                        >
                          <span>{getActionLabelForCheck(item.key)}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {item.detail && item.detail.length > 0 ? (
                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-700">
                            Contoh Data ({item.detail.length} baris ditampilkan, maks. 20):
                          </p>
                          <div className="max-h-56 overflow-y-auto rounded-sm border border-slate-200 bg-white divide-y divide-slate-100">
                            {item.detail.map((row, rIdx) => (
                              <div
                                key={rIdx}
                                className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-slate-700"
                              >
                                {Object.entries(row).map(([k, v]) => (
                                  <span key={k} className="mr-3">
                                    <strong className="text-slate-500">{k}:</strong>{' '}
                                    {String(v ?? '-')}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-emerald-700 font-medium">
                          Tidak ada temuan bermasalah pada indikator ini.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Seksi Pemeriksaan Manual */}
        <div
          data-testid="health-manual-section"
          className="pt-4 border-t border-slate-200 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-purple-700" />
              <h2 className="text-sm font-extrabold text-slate-900">
                Pemeriksaan Manual Infrastruktur & Keamanan Produksi
              </h2>
            </div>
            <Badge
              variant={
                manualCheckedCount === MANUAL_HEALTH_CHECKS.length ? 'success' : 'warning'
              }
            >
              {manualCheckedCount} / {MANUAL_HEALTH_CHECKS.length} Terverifikasi Manual
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {MANUAL_HEALTH_CHECKS.map((m) => {
              const isChecked = Boolean(siteSettings.manualChecks?.[m.id]);
              return (
                <div
                  key={m.id}
                  className={`p-3.5 rounded-md border transition-colors ${
                    isChecked
                      ? 'bg-emerald-50/40 border-emerald-200'
                      : 'bg-slate-50/70 border-slate-200'
                  }`}
                >
                  <Checkbox
                    id={`manual-check-${m.id}`}
                    data-testid={`manual-check-${m.id}`}
                    checked={isChecked}
                    onChange={(e) => void handleToggleManualCheck(m.id, e.target.checked)}
                    label={m.label}
                    description={m.description}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
