import React from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../ui';

/**
 * Toast pembaruan aplikasi PWA dengan registerType: 'prompt'.
 * Tidak memuat ulang otomatis saat dewan hakim sedang mengisi lembar nilai,
 * melainkan menampilkan toast "Versi baru tersedia — Muat ulang".
 */
export const PWAUpdateToast: React.FC = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW() {
      // Service Worker terdaftar
    },
    onRegisterError() {
      // Abaikan error registrasi di lingkungan non-SW
    }
  });

  if (!needRefresh) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="pwa-update-toast"
      className="fixed bottom-4 right-4 z-50 max-w-sm bg-white border border-emerald-200 rounded-lg shadow-lg p-4 flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
          <RefreshCw className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-900">
            Versi baru tersedia — Muat ulang
          </p>
          <p className="text-xs text-slate-500">
            Simpan penilaian Anda sebelum memuat ulang aplikasi.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="primary"
          onClick={() => updateServiceWorker(true)}
          data-testid="pwa-reload-btn"
        >
          Muat ulang
        </Button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Tutup pemberitahuan pembaruan"
          className="w-8 h-8 inline-flex items-center justify-center rounded-sm text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
