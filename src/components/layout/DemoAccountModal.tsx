import React, { useState } from 'react';
import {
  Check,
  ShieldCheck,
  Gavel,
  AlertCircle,
  Database,
  RefreshCw,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FlaskConical
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Modal, Button, Input, Badge } from '../ui';
import { PWAInstallSection } from '../pwa/PWAInstallSection';

export const DemoAccountModal: React.FC = () => {
  const {
    users,
    currentUser,
    setCurrentUserId,
    isDemoAccountModalOpen,
    setIsDemoAccountModalOpen,
    setCurrentView,
    setTenantId,
    connectionInfo,
    authenticatedProfile,
    isOfflineDemoSimulation,
    enterOfflineDemoSimulation,
    exitOfflineDemoSimulation,
    refreshSupabaseConnection,
    signInWithSupabase,
    signOutSupabase
  } = useMtq();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authFeedback, setAuthFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isDemoAccountModalOpen) return null;

  const isLiveProductionMode = connectionInfo.isConfigured && !isOfflineDemoSimulation;

  const handleSelectUser = (uId: string) => {
    if (isLiveProductionMode) {
      return;
    }

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
      if (selected.role === 'judge') {
        setCurrentView('penilaian_hakim');
      } else {
        setCurrentView('dashboard');
      }
    }

    setIsDemoAccountModalOpen(false);
  };

  const handleSupabaseSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setIsLoading(true);
    setAuthFeedback(null);
    try {
      const res = await signInWithSupabase(email, password);
      setAuthFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      if (res.success) {
        setPassword('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshCheck = async () => {
    setIsLoading(true);
    try {
      await refreshSupabaseConnection();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isDemoAccountModalOpen}
      onClose={() => setIsDemoAccountModalOpen(false)}
      title={
        isLiveProductionMode
          ? 'Sesi Autentikasi & Keamanan Supabase'
          : 'Mode Simulasi Demo Lokal & Persona Evaluasi'
      }
      subtitle={
        isLiveProductionMode
          ? 'Identitas & peran dikunci berdasarkan sesi Supabase Auth dan RLS'
          : 'Simulasi peran lokal terisolasi untuk pengujian antarmuka'
      }
      icon={
        <div className="w-9 h-9 rounded-md bg-emerald-800 text-white flex items-center justify-center font-bold text-xs">
          <ShieldCheck className="w-4 h-4" />
        </div>
      }
      maxWidthClass="max-w-lg"
      footer={
        <Button variant="secondary" onClick={() => setIsDemoAccountModalOpen(false)}>
          Tutup
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Seksi Instal Aplikasi PWA (beforeinstallprompt & panduan iOS) */}
        <PWAInstallSection />

        {/* Real Supabase Database & Schema Diagnostic Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-md space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-700 shrink-0" />
              <span className="text-xs font-bold text-slate-900">
                Status Database Supabase
              </span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRefreshCheck}
              disabled={isLoading}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Uji Koneksi DB
            </Button>
          </div>

          <div className="text-xs text-slate-700 space-y-1">
            <p className="font-semibold text-slate-900">{connectionInfo.statusLabel}</p>
            {connectionInfo.state === 'schema_missing' && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-sm flex items-start gap-2 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Skema SQL Belum Dijalankan</p>
                  <p>
                    Endpoint Supabase terjangkau, tetapi tabel inti belum ditemukan. Jalankan{' '}
                    <code className="font-mono bg-amber-100 px-1 rounded-sm">supabase/schema.sql</code>{' '}
                    di SQL Editor Supabase Anda, lalu klik <strong>Uji Koneksi DB</strong>.
                  </p>
                </div>
              </div>
            )}
            {connectionInfo.lastError && connectionInfo.state !== 'schema_missing' && (
              <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-sm">
                Detail: {connectionInfo.lastError}
              </p>
            )}
          </div>

          {connectionInfo.isConfigured && (
            <div className="pt-2 border-t border-slate-200/80">
              {authenticatedProfile ? (
                <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-sm">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-emerald-950 truncate">
                        {authenticatedProfile.name} ({currentUser.role})
                      </p>
                      <p className="text-xs text-emerald-800 truncate">
                        {authenticatedProfile.email} · Sesi Auth Aktif
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await signOutSupabase();
                      setIsDemoAccountModalOpen(false);
                    }}
                    leftIcon={<LogOut className="w-3.5 h-3.5" />}
                  >
                    Keluar
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSupabaseSignIn} className="space-y-2">
                  <p className="text-xs font-bold text-slate-700">
                    Login Akun Supabase Auth (Produksi / RLS):
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      controlSize="sm"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email pengguna Supabase"
                    />
                    <Input
                      controlSize="sm"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Kata sandi"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {authFeedback ? (
                      <span
                        className={`text-xs font-medium ${
                          authFeedback.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {authFeedback.text}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        Gunakan akun yang terdaftar pada Supabase Auth.
                      </span>
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      variant="primary"
                      disabled={isLoading || !email.trim() || !password}
                      leftIcon={<LogIn className="w-3.5 h-3.5" />}
                    >
                      Login Supabase
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>

        {isLiveProductionMode ? (
          <div className="p-4 bg-emerald-950 text-white rounded-md border border-emerald-800 space-y-3">
            <div className="flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs">
                <p className="font-extrabold text-emerald-100">
                  Pergantian Persona Palsu Dinonaktifkan pada Mode Produksi
                </p>
                <p className="text-emerald-200/80 leading-relaxed">
                  Sistem sedang berjalan dalam Mode Produksi Supabase. Peran aktif (
                  <span className="font-bold text-white">{currentUser.role}</span>) dan akses
                  tenant ditentukan sepenuhnya dari tabel <code className="font-mono">profiles</code>{' '}
                  serta <code className="font-mono">tenant_memberships</code> yang diverifikasi RLS.
                </p>
              </div>
            </div>
            <div className="pt-1 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  enterOfflineDemoSimulation();
                  setIsDemoAccountModalOpen(false);
                }}
                leftIcon={<FlaskConical className="w-3.5 h-3.5" />}
              >
                Beralih ke Mode Simulasi Demo Lokal
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-md flex items-start justify-between gap-2.5 text-xs text-amber-900">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Mode Simulasi Demo Lokal aktif. Pilih persona di bawah ini untuk menguji alur
                  antarmuka secara offline tanpa menyentuh database produksi.
                </p>
              </div>
              {connectionInfo.isConfigured && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    exitOfflineDemoSimulation();
                    setIsDemoAccountModalOpen(false);
                  }}
                >
                  Mode Produksi
                </Button>
              )}
            </div>

            {/* Group 1: Superadmin */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Persona Simulasi: Superadmin Platform
              </p>
              <div className="space-y-1.5">
                {users
                  .filter((u) => u.role === 'superadmin')
                  .map((u, idx) => (
                    <button
                      key={`${u.id}-${idx}`}
                      type="button"
                      onClick={() => handleSelectUser(u.id)}
                      className={`w-full text-left p-3 rounded-md border flex items-center justify-between transition-all cursor-pointer ${
                        u.id === currentUser.id
                          ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs shrink-0">
                          SA
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500">
                            {u.email} · Akses Multi-Tenant & Audit
                          </p>
                        </div>
                      </div>
                      {u.id === currentUser.id && (
                        <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                          Aktif
                        </Badge>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {/* Group 2: Admin MTQ */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Persona Simulasi: Administrator Event MTQ
              </p>
              <div className="space-y-1.5">
                {users
                  .filter((u) => u.role === 'admin')
                  .map((u, idx) => (
                    <button
                      key={`${u.id}-${idx}`}
                      type="button"
                      onClick={() => handleSelectUser(u.id)}
                      className={`w-full text-left p-3 rounded-md border flex items-center justify-between transition-all cursor-pointer ${
                        u.id === currentUser.id
                          ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                          ADM
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500">
                            LPTQ Provinsi Jawa Barat · Pengelola Data, Babak & Kelulusan
                          </p>
                        </div>
                      </div>
                      {u.id === currentUser.id && (
                        <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                          Aktif
                        </Badge>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {/* Group 3: Dewan Hakim */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Persona Simulasi: Dewan Hakim Penilai
              </p>
              <div className="space-y-1.5">
                {users
                  .filter((u) => u.role === 'judge')
                  .map((u, idx) => (
                    <button
                      key={`${u.id}-${idx}`}
                      type="button"
                      onClick={() => handleSelectUser(u.id)}
                      className={`w-full text-left p-3 rounded-md border flex items-center justify-between transition-all cursor-pointer ${
                        u.id === currentUser.id
                          ? 'border-emerald-600 bg-emerald-50/70 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-sky-100 text-sky-800 flex items-center justify-center font-bold text-xs shrink-0">
                          <Gavel className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">{u.name}</p>
                          <p className="text-xs text-slate-500">
                            {u.judgeCategory} · {u.judgeField}
                          </p>
                        </div>
                      </div>
                      {u.id === currentUser.id && (
                        <Badge variant="success" icon={<Check className="w-3 h-3" />}>
                          Aktif
                        </Badge>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
