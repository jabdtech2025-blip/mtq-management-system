import React, { useState, useEffect, useRef } from 'react';
import {
  Menu,
  Bell,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  XCircle,
  ChevronRight,
  WifiOff
} from 'lucide-react';
import { useMtq, ViewType } from '../../context/MtqContext';
import { formatTimestampDisplay } from '../../utils/dateTime';
import { PWAInstallHeaderButton } from '../pwa/PWAInstallSection';
import { SyncIssuesModal } from './SyncIssuesModal';

export const TopHeader: React.FC = () => {
  const {
    currentView,
    currentTenant,
    currentUser,
    toggleSidebar,
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
  const [isSyncIssuesOpen, setIsSyncIssuesOpen] = useState(false);
  // Buka otomatis jendela "Gagal menyinkronkan" saat ada perubahan BARU yang ditolak server (sekali per item)
  const seenRejectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const rejectedIds = outboxSummary.items.filter((i) => i.status === 'rejected').map((i) => i.id);
    const hasNew = rejectedIds.some((id) => !seenRejectedIdsRef.current.has(id));
    rejectedIds.forEach((id) => seenRejectedIdsRef.current.add(id));
    if (hasNew) setIsSyncIssuesOpen(true);
  }, [outboxSummary]);
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

  const pendingOrFailedCount =
    outboxSummary.pendingCount + outboxSummary.failedCount + outboxSummary.rejectedCount;
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
    // Hanya isi antrean & koneksi yang menentukan, bukan kata "gagal" pada teks status
    if (pendingOrFailedCount > 0 || (isLiveSupabaseMode && !connectionInfo.isDatabaseReady)) {
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

  const groupLabel = currentTenant?.groupLabel || 'Grup';

  // Breadcrumb mapping disamakan dengan label menu & kelompok tahap lomba di Sidebar
  const viewRouteInfo: Record<ViewType, { section: string; title: string }> = {
    dashboard: { section: 'Ringkasan', title: 'Dashboard' },
    master_data: { section: 'Persiapan', title: 'Master Data & Rubrik' },
    user_management: { section: 'Persiapan', title: 'Pengguna & Hakim' },
    bank_soal: { section: 'Persiapan', title: 'Bank Soal & Maqra' },
    kafilah: { section: 'Pendaftaran', title: 'Grup & Peserta' },
    stage_management: { section: 'Pelaksanaan', title: 'Manajemen Babak' },
    penilaian_hakim: {
      section: currentUser.role === 'judge' ? 'Pelaksanaan Penilaian' : 'Pelaksanaan',
      title: currentUser.role === 'judge' ? 'Peserta Saya' : 'Monitoring Penilaian'
    },
    penilaian_dual_panel: {
      section: currentUser.role === 'judge' ? 'Pelaksanaan Penilaian' : 'Pelaksanaan',
      title: 'Penilaian Mushaf'
    },
    rekap_nilai: {
      section: currentUser.role === 'judge' ? 'Pelaksanaan Penilaian' : 'Pelaksanaan',
      title: currentUser.role === 'judge' ? 'Rekap / Riwayat Nilai' : 'Rekap Nilai Real-Time'
    },
    hasil_kelulusan: { section: 'Hasil', title: 'Hasil & Kelulusan' },
    log_aktivitas: { section: 'Audit', title: 'Log Aktivitas' },
    superadmin_dashboard: { section: 'Superadmin Platform', title: 'Dashboard Platform' },
    superadmin_tenants: { section: 'Superadmin Platform', title: 'Penyelenggara MTQ (Manajemen MTQ)' },
    superadmin_users: { section: 'Superadmin Platform', title: 'Manajemen Akun' },
    superadmin_health: { section: 'Superadmin Platform', title: 'Kesehatan Sistem (Health Check)' },
    superadmin_audit: { section: 'Superadmin Platform', title: 'Audit Log Platform' },
    superadmin_settings: { section: 'Superadmin Platform', title: 'SEO dan Meta Situs' },
    superadmin_content: { section: 'Superadmin Platform', title: 'Konten Situs' }
  };

  const routeInfo = viewRouteInfo[currentView] || { section: 'Ringkasan', title: 'Dashboard' };
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <header className="surface-glass border-b border-slate-200 sticky top-0 z-30 shrink-0 select-none">
      <div className="px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        {/* Left: AppShell Breadcrumb Routing Header */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Buka menu navigasi"
            className="lg:hidden w-10 h-10 inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 transition-colors cursor-pointer shrink-0 shadow-sm"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Dynamic Breadcrumb Route */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0 text-xs sm:text-sm">
            <span className="text-slate-400 hidden sm:inline truncate">
              {currentTenant?.name || 'MTQ'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden sm:inline shrink-0" />
            <span className="text-slate-500 truncate hidden md:inline">
              {routeInfo.section}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden md:inline shrink-0" />
            <span className="text-sm sm:text-base font-semibold text-slate-800 tracking-tight truncate">
              {routeInfo.title}
            </span>
          </nav>
        </div>

        {/* Right: Offline Badge + PWA Install + Connected Status + Local Notifications Bell */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Offline Indicator Badge with Pending Sync Count (shown when navigator.onLine === false) */}
          {!isBrowserOnline && (
            <div
              data-testid="header-offline-badge"
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold shadow-sm"
              title="Koneksi perangkat terputus. Perubahan disimpan di antrean lokal dan akan disinkronkan saat kembali online."
            >
              <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>
                Offline ·{' '}
                <span className="font-mono tabular-nums">{pendingOrFailedCount}</span>{' '}
                menunggu sinkron
              </span>
            </div>
          )}

          {/* In-App Install Prompt Button */}
          <PWAInstallHeaderButton />

          {/* Connection Status Pill — klik untuk melihat perubahan yang belum terkirim */}
          <button
            type="button"
            data-testid="header-connection-status"
            onClick={() => isLiveSupabaseMode && setIsSyncIssuesOpen(true)}
            aria-haspopup="dialog"
            title={`${syncStatus}${lastSyncTime ? ` • Sinkron terakhir: ${lastSyncTime}` : ''}`}
            className={`inline-flex items-center gap-2 h-9 px-3 rounded-md border text-xs font-medium shadow-sm cursor-pointer transition-colors ${
              outboxSummary.rejectedCount > 0
                ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                : 'border-slate-200/80 bg-white/90 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${outboxSummary.rejectedCount > 0 ? 'bg-rose-500' : dotColorClass}`} />
            <span>
              {outboxSummary.rejectedCount > 0
                ? 'Gagal Menyinkronkan'
                : headerConnectionState === 'Connected'
                ? 'Tersambung'
                : headerConnectionState === 'Syncing'
                ? 'Menyinkronkan'
                : headerConnectionState === 'Unsynced'
                ? 'Belum Tersinkron'
                : headerConnectionState}
            </span>
            {pendingOrFailedCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-white/80 border border-current/20 font-mono tabular-nums text-[11px] leading-5 text-center">
                {pendingOrFailedCount}
              </span>
            )}
          </button>
          <SyncIssuesModal isOpen={isSyncIssuesOpen} onClose={() => setIsSyncIssuesOpen(false)} />

          {/* Notification Bell */}
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
              className={`relative w-10 h-10 inline-flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                isNotificationOpen
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-sm'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-rose-600 text-white rounded-full text-xs font-mono tabular-nums flex items-center justify-center leading-none shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Popover */}
            {isNotificationOpen && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-md border border-slate-200 z-50 overflow-hidden transition-all duration-150">
                <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-emerald-800" />
                    <h3 className="text-xs font-bold text-slate-900">
                      Notifikasi Sistem
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-sm text-xs font-mono tabular-nums bg-slate-200 text-slate-700">
                      {notifications.length}
                    </span>
                  </div>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={clearNotifications}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer transition-colors"
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
                      <p className="text-xs text-slate-500">Tidak ada notifikasi baru</p>
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
                              <p className="font-semibold text-slate-800 text-xs truncate">
                                {item.title}
                              </p>
                              <span className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
                                {formatTimestampDisplay(item.timestamp)}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed break-words">
                              {item.message}
                            </p>
                            {item.module && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded-sm bg-slate-100 text-xs text-slate-600">
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
