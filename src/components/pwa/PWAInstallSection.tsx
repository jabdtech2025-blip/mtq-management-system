import React, { useState } from 'react';
import { Download, Share, PlusSquare, Smartphone, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Button, Modal } from '../ui';

/**
 * Seksi "Instal Aplikasi" di dalam menu pengguna (DemoAccountModal).
 * Memakai event beforeinstallprompt bila tersedia, menyembunyikan diri saat sudah terinstal (standalone),
 * dan menampilkan petunjuk singkat untuk iOS (Bagikan -> Tambahkan ke Layar Utama) tanpa pop-up otomatis.
 */
export const PWAInstallSection: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return (
      <div
        data-testid="pwa-installed-info"
        className="p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2.5 text-xs text-emerald-900"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
        <span>Aplikasi Manajemen MTQ sedang berjalan dalam mode terinstal (Standalone).</span>
      </div>
    );
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await promptInstall();
    } else {
      setShowIOSGuide((prev) => !prev);
    }
  };

  return (
    <div
      data-testid="pwa-install-section"
      className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900">
              Instal Aplikasi Manajemen MTQ
            </p>
            <p className="text-xs text-slate-500">
              {isIOS
                ? 'Pasang di Layar Utama iPad / iPhone untuk akses cepat di mimbar'
                : 'Akses layar penuh di tablet dewan hakim & tetap terbuka saat jaringan putus sesaat'}
            </p>
          </div>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={handleInstallClick}
          data-testid="pwa-install-btn"
          leftIcon={<Download className="w-3.5 h-3.5" />}
        >
          Instal Aplikasi
        </Button>
      </div>

      {(isIOS || showIOSGuide) && (
        <div
          data-testid="pwa-ios-guide"
          className="p-3 bg-white border border-slate-200 rounded-sm text-xs text-slate-700 space-y-1.5"
        >
          <p className="font-bold text-slate-900">
            Petunjuk Instalasi di iOS / iPadOS (Safari) & Browser:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600">
            <li>
              Ketuk tombol <strong className="text-slate-900">Bagikan</strong>{' '}
              <Share className="w-3.5 h-3.5 inline text-emerald-700 -mt-0.5" /> pada bilah alat browser.
            </li>
            <li>
              Pilih <strong className="text-slate-900">Tambahkan ke Layar Utama</strong>{' '}
              <PlusSquare className="w-3.5 h-3.5 inline text-emerald-700 -mt-0.5" /> lalu ketuk{' '}
              <strong className="text-slate-900">Tambah</strong>.
            </li>
          </ol>
        </div>
      )}
    </div>
  );
};

/**
 * Tombol ringkas "Instal Aplikasi" untuk ditampilkan di TopHeader saat aplikasi dapat diinstal atau di iOS.
 */
export const PWAInstallHeaderButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);

  if (isInstalled || (!isInstallable && !isIOS)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (isInstallable) {
            await promptInstall();
          } else {
            setIsGuideModalOpen(true);
          }
        }}
        data-testid="header-pwa-install-btn"
        aria-label="Instal Aplikasi"
        title="Instal Aplikasi Manajemen MTQ ke Perangkat"
        className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition-colors cursor-pointer shadow-sm"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Instal Aplikasi</span>
      </button>

      <Modal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
        title="Instal Aplikasi di iPhone / iPad"
        subtitle="Pasang Manajemen MTQ ke Layar Utama perangkat Anda"
        maxWidthClass="max-w-md"
        footer={
          <Button variant="secondary" onClick={() => setIsGuideModalOpen(false)}>
            Tutup
          </Button>
        }
      >
        <div className="space-y-3 text-xs text-slate-700">
          <p className="leading-relaxed">
            Untuk memasang aplikasi di perangkat iOS / iPadOS agar berjalan layar penuh:
          </p>
          <ol className="list-decimal list-inside space-y-2 bg-slate-50 p-3.5 rounded-md border border-slate-200">
            <li>
              Ketuk ikon <strong className="text-slate-900">Bagikan</strong>{' '}
              <Share className="w-3.5 h-3.5 inline text-emerald-700" /> di bilah navigasi Safari.
            </li>
            <li>
              Gulir ke bawah lalu pilih{' '}
              <strong className="text-slate-900">Tambahkan ke Layar Utama</strong>{' '}
              <PlusSquare className="w-3.5 h-3.5 inline text-emerald-700" />.
            </li>
            <li>
              Ketuk <strong className="text-slate-900">Tambah</strong> di sudut kanan atas.
            </li>
          </ol>
        </div>
      </Modal>
    </>
  );
};
