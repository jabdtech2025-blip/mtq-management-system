import React, { useState } from 'react';
import { Check, Gavel, AlertCircle, LogIn, LogOut, Lock, FlaskConical, UserRound } from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Modal, Button, Badge } from '../ui';
import { PWAInstallSection } from '../pwa/PWAInstallSection';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Pengelola Platform',
  admin: 'Admin Penyelenggara',
  judge: 'Dewan Hakim'
};

/**
 * Jendela akun (dibuka dari profil di sidebar).
 * - Mode produksi: menampilkan akun yang sedang masuk, tombol Keluar, dan pintasan ke Mode Demo.
 * - Mode Demo: memilih peran contoh.
 * Sengaja TIDAK menampilkan istilah teknis (nama layanan database, RLS, status koneksi, form login kedua);
 * masuk dengan akun hanya lewat halaman masuk.
 */
export const DemoAccountModal: React.FC = () => {
  const {
    users,
    currentUser,
    setCurrentUserId,
    isDemoAccountModalOpen,
    setIsDemoAccountModalOpen,
    setCurrentView,
    setTenantId,
    currentTenant,
    connectionInfo,
    authenticatedProfile,
    isOfflineDemoSimulation,
    enterOfflineDemoSimulation,
    exitOfflineDemoSimulation,
    signOutSupabase
  } = useMtq();

  const [isSigningOut, setIsSigningOut] = useState(false);

  if (!isDemoAccountModalOpen) return null;

  const isLiveProductionMode = connectionInfo.isConfigured && !isOfflineDemoSimulation;
  const close = () => setIsDemoAccountModalOpen(false);

  const handleSelectUser = (uId: string) => {
    if (isLiveProductionMode) return;

    const selected = users.find((u) => u.id === uId);
    if (!selected) return;

    setCurrentUserId(uId);

    if (selected.role === 'superadmin') {
      setTenantId('platform');
      setCurrentView('superadmin_dashboard');
    } else {
      if (selected.tenantId && selected.tenantId !== 'platform') {
        setTenantId(selected.tenantId);
      }
      setCurrentView(selected.role === 'judge' ? 'penilaian_hakim' : 'dashboard');
    }

    close();
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOutSupabase();
      close();
    } finally {
      setIsSigningOut(false);
    }
  };

  const initials = (name: string) =>
    name
      .replace(/^((prof|dr|drs|h|hj|kh|ust|ustadz|ustadzah)\.?\s+)+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');

  const renderPersonaGroup = ({
    title,
    role,
    describe,
    tone
  }: {
    title: string;
    role: 'superadmin' | 'admin' | 'judge';
    describe: (u: (typeof users)[number]) => string;
    tone: string;
  }) => {
    const list = users.filter((u) => u.role === role);
    if (list.length === 0) return null;
    return (
      <section aria-label={title}>
        <h3 className="text-xs font-semibold text-slate-500 mb-2">{title}</h3>
        <div className="space-y-1.5">
          {list.map((u, idx) => {
            const active = u.id === currentUser.id;
            return (
              <button
                key={`${u.id}-${idx}`}
                type="button"
                onClick={() => handleSelectUser(u.id)}
                aria-pressed={active}
                className={`w-full text-left px-3 py-2.5 rounded-lg border flex items-center justify-between gap-3 transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 ${
                  active
                    ? 'border-emerald-600 bg-emerald-50/70'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-9 h-9 rounded-full ${tone} flex items-center justify-center font-semibold text-xs shrink-0`}
                    aria-hidden="true"
                  >
                    {role === 'judge' ? <Gavel className="w-4 h-4" /> : initials(u.name) || '?'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 truncate">{u.name}</span>
                    <span className="block text-xs text-slate-500 truncate">{describe(u)}</span>
                  </span>
                </span>
                {active && (
                  <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                    Aktif
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <Modal
      isOpen={isDemoAccountModalOpen}
      onClose={close}
      title={isLiveProductionMode ? 'Akun Anda' : 'Mode Demo · Pilih Peran'}
      subtitle={
        isLiveProductionMode
          ? 'Informasi akun yang sedang masuk'
          : 'Coba aplikasi dari sudut pandang peran yang berbeda'
      }
      icon={
        <div className="w-9 h-9 rounded-md bg-emerald-800 text-white flex items-center justify-center">
          {isLiveProductionMode ? <UserRound className="w-4 h-4" /> : <FlaskConical className="w-4 h-4" />}
        </div>
      }
      maxWidthClass="max-w-lg"
      footer={
        <Button variant="secondary" onClick={close}>
          Tutup
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Instal aplikasi (PWA) */}
        <PWAInstallSection />

        {isLiveProductionMode ? (
          <>
            {/* Akun yang sedang masuk */}
            <div className="p-4 rounded-lg border border-slate-200 bg-white flex items-center gap-3">
              <span
                className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center font-semibold text-sm shrink-0"
                aria-hidden="true"
              >
                {initials(authenticatedProfile?.name || currentUser.name) || '?'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {authenticatedProfile?.name || currentUser.name}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {authenticatedProfile?.email || currentUser.email}
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                  {ROLE_LABELS[currentUser.role] || currentUser.role}
                  {currentTenant?.name && currentUser.role !== 'superadmin' ? ` · ${currentTenant.name}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                leftIcon={<LogOut className="w-3.5 h-3.5" />}
              >
                Keluar
              </Button>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
              <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="m-0">
                Peran dan akses Anda ditetapkan oleh pengelola penyelenggara. Hubungi pengelola bila perlu
                mengubah peran atau penugasan.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-dashed border-slate-300">
              <div className="text-xs text-slate-600 leading-relaxed">
                <p className="m-0 font-semibold text-slate-800">Ingin mencoba tanpa mengubah data lomba?</p>
                <p className="m-0">Mode Demo memakai data contoh yang hanya tersimpan di browser ini.</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  enterOfflineDemoSimulation();
                  close();
                }}
                leftIcon={<FlaskConical className="w-3.5 h-3.5" />}
              >
                Coba Mode Demo
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start justify-between gap-3 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="m-0 leading-relaxed">
                  Anda sedang di <strong>Mode Demo</strong>. Data contoh hanya tersimpan di browser ini dan tidak
                  memengaruhi data lomba.
                </p>
              </div>
              {connectionInfo.isConfigured && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    void exitOfflineDemoSimulation();
                    close();
                  }}
                  leftIcon={<LogIn className="w-3.5 h-3.5" />}
                >
                  Masuk dengan Akun
                </Button>
              )}
            </div>

            {renderPersonaGroup({
              title: 'Pengelola Platform',
              role: 'superadmin',
              tone: 'bg-purple-100 text-purple-800',
              describe: () => 'Mengelola penyelenggara dan akun'
            })}
            {renderPersonaGroup({
              title: 'Admin Penyelenggara',
              role: 'admin',
              tone: 'bg-emerald-100 text-emerald-800',
              describe: () => 'Data peserta, babak, dan kelulusan'
            })}
            {renderPersonaGroup({
              title: 'Dewan Hakim',
              role: 'judge',
              tone: 'bg-sky-100 text-sky-800',
              describe: (u) => [u.judgeCategory, u.judgeField].filter(Boolean).join(' · ') || 'Penilaian peserta'
            })}
          </>
        )}
      </div>
    </Modal>
  );
};
