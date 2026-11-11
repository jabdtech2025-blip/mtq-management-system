import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Sparkles,
  LogOut,
  Bell,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  ChevronRight
} from 'lucide-react';
import { useMtq, ViewType } from '../../context/MtqContext';
import { formatTimestampDisplay } from '../../utils/dateTime';

export const TopHeader: React.FC = () => {
  const {
    currentView,
    currentTenant,
    toggleSidebar,
    isSuperadminWorkspaceMode,
    exitTenantWorkspace,
    isLiveSupabaseMode,
    connectionInfo,
    syncStatus,
    lastSyncTime,
    outboxSummary,
    notifications,
    markAllNotificationsAsRead,
    clearNotifications
  } = useMtq();

  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );

  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsBrowserOnline(true);
    const onOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // Close notification popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(e.target as Node)
      ) {
        setIsNotificationOpen(false);
      }
    };
    if (isNotificationOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationOpen]);

  const pendingOrFailedCount = outboxSummary.pendingCount + outboxSummary.failedCount;
  const isSyncingState =
    outboxSummary.syncingCount > 0 ||
    connectionInfo.state === 'checking' ||
    syncStatus.toLowerCase().includes('menyimpan') ||
    syncStatus.toLowerCase().includes('memproses') ||
    syncStatus.toLowerCase().includes('sinkronisasi realtime');

  type HeaderConnectionState = 'Offline' | 'Syncing' | 'Unsynced' | 'Connected' | 'Mode Demo';
  const headerConnectionState: HeaderConnectionState = (() => {
    if (!isLiveSupabaseMode) return 'Mode Demo';
    if (!isBrowserOnline) return 'Offline';
    if (isSyncingState) return 'Syncing';
    if (
      pendingOrFailedCount > 0 ||
      syncStatus.toLowerCase().includes('gagal') ||
      (isLiveSupabaseMode && !connectionInfo.isDatabaseReady)
    ) {
      return 'Unsynced';
    }
    return 'Connected';
  })();

  const dotColorClass =
    headerConnectionState === 'Connected'
      ? 'bg-emerald-500'
      : headerConnectionState === 'Syncing'
      ? 'bg-sky-500 animate-pulse'
      : headerConnectionState === 'Offline'
      ? 'bg-slate-400'
      : headerConnectionState === 'Mode Demo'
      ? 'bg-amber-400'
      : 'bg-amber-500';

  // Breadcrumb mapping for Enterprise AppShell
  const viewRouteInfo: Record<ViewType, { section: string; title: string }> = {
    dashboard: { section: 'Operasional', title: 'Dashboard' },
    kafilah: { section: 'Data Peserta', title: 'Grup & Peserta' },
    bank_soal: { section: 'Materi Lomba', title: 'Bank Soal & Maqra' },
    master_data: { section: 'Konfigurasi', title: 'Master Data & Rubrik' },
    user_management: { section: 'Pengaturan', title: 'Pengguna & Hakim' },
    penilaian_hakim: { section: 'Penilaian', title: 'Monitoring Penilaian' },
    rekap_nilai: { section: 'Hasil Lomba', title: 'Rekap Nilai Real-Time' },
    stage_management: { section: 'Kompetisi', title: 'Manajemen Babak' },
    hasil_kelulusan: { section: 'Hasil Lomba', title: 'Hasil & Kelulusan' },
    penilaian_dual_panel: { section: 'Penilaian', title: 'Penilaian Mushaf' },
    log_aktivitas: { section: 'Sistem', title: 'Log Aktivitas' },
    superadmin_dashboard: { section: 'Superadmin', title: 'Dashboard Platform' },
    superadmin_tenants: { section: 'Superadmin', title: 'Penyelenggara MTQ' },
    superadmin_users: { section: 'Superadmin', title: 'Manajemen Akun' },
    superadmin_audit: { section: 'Superadmin', title: 'Audit Log Platform' }
  };

  const routeInfo = viewRouteInfo[currentView] || { section: 'Beranda', title: 'MTQ Digital' };
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shrink-0 select-none">
      {isSuperadminWorkspaceMode && (
        <div className="bg-amber-900 text-amber-50 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-amber-700/60">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-normal uppercase tracking-wider text-xs">
              <Sparkles className="w-3 h-3" /> Mode Supervisi Tenant
            </span>
            <span className="font-normal text-amber-100">
              Anda sedang mengelola ruang kerja operasional:{' '}
              <span className="text-white underline decoration-amber-400">{currentTenant.name}</span> ({currentTenant.eventName})
            </span>
          </div>
          <button
            onClick={exitTenantWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-800 hover:bg-amber-700 text-white font-normal transition-colors border border-amber-600 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Kembali ke Panel Platform
          </button>
        </div>
      )}

      <div className="px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        {/* Left: AppShell Breadcrumb Routing Header (all non-bold) */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={toggleSidebar}
            aria-label="Buka menu navigasi"
            className="lg:hidden p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Dynamic Breadcrumb Route - Non-bold text */}
          <div className="flex items-center gap-1.5 min-w-0 text-xs sm:text-sm font-normal">
            <span className="text-slate-400 font-normal hidden sm:inline truncate">
              {currentTenant?.name || 'MTQ'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline shrink-0" />
            <span className="text-slate-500 font-normal truncate hidden md:inline">
              {routeInfo.section}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden md:inline shrink-0" />
            <span className="text-sm sm:text-base font-normal text-slate-800 tracking-tight truncate">
              {routeInfo.title}
            </span>
          </div>
        </div>

        {/* Right: Connected Status + Local Notifications Bell */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Connection Status Pill (non-bold) */}
          <div
            data-testid="header-connection-status"
            title={`${syncStatus}${lastSyncTime ? ` • Sinkron terakhir: ${lastSyncTime}` : ''}`}
            className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200/80 bg-slate-50 text-xs font-normal text-slate-700 shadow-2xs"
          >
            <span className={`w-2 h-2 rounded-full ${dotColorClass}`} />
            <span>
              {headerConnectionState === 'Connected'
                ? 'Tersambung'
                : headerConnectionState === 'Syncing'
                ? 'Menyinkronkan'
                : headerConnectionState === 'Unsynced'
                ? 'Belum Tersinkron'
                : headerConnectionState}
            </span>
          </div>

          {/* Notification Bell (placed to the right of connected) */}
          <div className="relative" ref={notificationDropdownRef}>
            <button
              type="button"
              onClick={() => {
                if (!isNotificationOpen && unreadCount > 0) {
                  markAllNotificationsAsRead();
                }
                setIsNotificationOpen(!isNotificationOpen);
              }}
              aria-label="Buka notifikasi"
              data-testid="notification-bell-btn"
              className={`relative p-2 rounded-xl border transition-colors cursor-pointer ${
                isNotificationOpen
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-2xs'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-600 text-white rounded-full text-xs font-normal flex items-center justify-center leading-none shadow-xs animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Popover */}
            {isNotificationOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-800" />
                    <h3 className="text-xs font-normal text-slate-900">
                      Notifikasi Sistem
                    </h3>
                    <span className="px-1.5 py-0.2 rounded text-xs font-normal bg-slate-200 text-slate-700">
                      {notifications.length}
                    </span>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={clearNotifications}
                      className="inline-flex items-center gap-1 text-xs font-normal text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
                      title="Hapus semua riwayat notifikasi lokal"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Bersihkan</span>
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="py-8 px-4 text-center">
                      <p className="text-xs font-normal text-slate-500">Tidak ada notifikasi baru</p>
                    </div>
                  ) : (
                    notifications.map((item) => {
                      const icon =
                        item.type === 'error' ? (
                          <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        ) : item.type === 'warning' ? (
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        ) : item.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                        );

                      return (
                        <div
                          key={item.id}
                          className={`p-3 text-xs flex items-start gap-2.5 transition-colors ${
                            item.type === 'error'
                              ? 'bg-rose-50/40 hover:bg-rose-50/70'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {icon}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <p className="font-medium text-slate-800 text-xs truncate">
                                {item.title}
                              </p>
                              <span className="text-xs text-slate-400 font-mono shrink-0">
                                {formatTimestampDisplay(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">
                              {item.message}
                            </p>
                            {item.module && (
                              <span className="inline-block mt-1 px-1.5 py-0.2 rounded bg-slate-100 text-xs font-normal text-slate-600">
                                {item.module}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
