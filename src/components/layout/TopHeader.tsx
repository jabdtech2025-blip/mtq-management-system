import React, { useState, useEffect } from 'react';
import { Menu, Sparkles, LogOut } from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const TopHeader: React.FC = () => {
  const {
    currentTenant,
    toggleSidebar,
    isSuperadminWorkspaceMode,
    exitTenantWorkspace,
    isLiveSupabaseMode,
    connectionInfo,
    syncStatus,
    lastSyncTime,
    outboxSummary
  } = useMtq();

  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true
  );

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

  const pendingOrFailedCount = outboxSummary.pendingCount + outboxSummary.failedCount;
  const isSyncingState =
    outboxSummary.syncingCount > 0 ||
    connectionInfo.state === 'checking' ||
    syncStatus.toLowerCase().includes('menyimpan') ||
    syncStatus.toLowerCase().includes('memproses') ||
    syncStatus.toLowerCase().includes('sinkronisasi realtime');

  type HeaderConnectionState = 'Offline' | 'Syncing' | 'Unsynced' | 'Connected';
  const headerConnectionState: HeaderConnectionState = (() => {
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
      : 'bg-amber-500';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      {isSuperadminWorkspaceMode && (
        <div className="bg-amber-900 text-amber-50 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs border-b border-amber-700/60">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-extrabold uppercase tracking-wider text-[10px]">
              <Sparkles className="w-3 h-3" /> Mode Supervisi Tenant
            </span>
            <span className="font-medium text-amber-100">
              Anda sedang mengelola ruang kerja operasional:{' '}
              <strong className="text-white underline decoration-amber-400">{currentTenant.name}</strong> ({currentTenant.eventName})
            </span>
          </div>
          <button
            onClick={exitTenantWorkspace}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-800 hover:bg-amber-700 text-white font-bold transition-colors border border-amber-600 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Kembali ke Panel Platform
          </button>
        </div>
      )}

      <div className="px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
        {/* Left: Hamburger + Simple Title & Subtitle */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={toggleSidebar}
            aria-label="Buka menu navigasi"
            className="lg:hidden p-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-200 transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate">
              Musabaqah Tilawatil Qur&apos;an
            </h2>
            <p className="text-xs text-slate-500 truncate">Nasional</p>
          </div>
        </div>

        {/* Right: Simple Dot + Connected text */}
        <div
          data-testid="header-connection-status"
          title={`${syncStatus}${lastSyncTime ? ` • Sinkron terakhir: ${lastSyncTime}` : ''}`}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 shrink-0"
        >
          <span className={`w-2 h-2 rounded-full ${dotColorClass}`} />
          <span>{headerConnectionState}</span>
        </div>
      </div>
    </header>
  );
};
