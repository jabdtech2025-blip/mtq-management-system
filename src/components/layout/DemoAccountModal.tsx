import React, { useState } from 'react';
import {
  X,
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
    // Hard block persona switching in live production mode
    if (isLiveProductionMode) {
      return;
    }

    const selected = users.find((u) => u.id === uId);
    if (!selected) return;

    setCurrentUserId(uId);

    // If user belongs to a specific tenant, switch context for testing
    if (selected.tenantId && selected.tenantId !== 'platform') {
      setTenantId(selected.tenantId);
    }

    // Set initial view according to role
    if (selected.role === 'superadmin') {
      setCurrentView('superadmin_dashboard');
    } else if (selected.role === 'judge') {
      setCurrentView('penilaian_hakim');
    } else {
      setCurrentView('dashboard');
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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white text-slate-900 rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {isLiveProductionMode
                  ? 'Sesi Autentikasi & Keamanan Supabase'
                  : 'Mode Simulasi Demo Lokal & Persona Evaluasi'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isLiveProductionMode
                  ? 'Identitas & peran dikunci berdasarkan sesi Supabase Auth dan RLS'
                  : 'Simulasi peran lokal terisolasi untuk pengujian antarmuka'}
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsDemoAccountModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Real Supabase Database & Schema Diagnostic Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-slate-900">
                  Status Database Supabase
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefreshCheck}
                disabled={isLoading}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                Uji Koneksi DB
              </button>
            </div>

            <div className="text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-900">{connectionInfo.statusLabel}</p>
              {connectionInfo.state === 'schema_missing' && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-[11px] text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Skema SQL Belum Dijalankan</p>
                    <p>
                      Endpoint Supabase terjangkau, tetapi tabel inti belum ditemukan. Jalankan{' '}
                      <code className="font-mono bg-amber-100 px-1 rounded">supabase/schema.sql</code>{' '}
                      di SQL Editor Supabase Anda, lalu klik <strong>Uji Koneksi DB</strong>.
                    </p>
                  </div>
                </div>
              )}
              {connectionInfo.lastError && connectionInfo.state !== 'schema_missing' && (
                <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                  Detail: {connectionInfo.lastError}
                </p>
              )}
            </div>

            {/* Supabase Auth Session Info / Login Form when configured */}
            {connectionInfo.isConfigured && (
              <div className="pt-2 border-t border-slate-200/80">
                {authenticatedProfile ? (
                  <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg">
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-emerald-950 truncate">
                          {authenticatedProfile.name} ({currentUser.role})
                        </p>
                        <p className="text-[11px] text-emerald-800 truncate">
                          {authenticatedProfile.email} · Sesi Auth Aktif
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await signOutSupabase();
                        setIsDemoAccountModalOpen(false);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 text-[11px] font-bold shrink-0 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      Keluar
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSupabaseSignIn} className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-700">
                      Login Akun Supabase Auth (Produksi / RLS):
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email pengguna Supabase"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Kata sandi"
                        className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      {authFeedback ? (
                        <span
                          className={`text-[11px] font-medium ${
                            authFeedback.type === 'success' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {authFeedback.text}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">
                          Gunakan akun yang terdaftar pada Supabase Auth.
                        </span>
                      )}
                      <button
                        type="submit"
                        disabled={isLoading || !email.trim() || !password}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shrink-0"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        Login Supabase
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {isLiveProductionMode ? (
            <div className="p-4 bg-emerald-950 text-white rounded-xl border border-emerald-800 space-y-3">
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
                <button
                  type="button"
                  onClick={() => {
                    enterOfflineDemoSimulation();
                    setIsDemoAccountModalOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  Beralih ke Mode Simulasi Demo Lokal
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start justify-between gap-2.5 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Mode Simulasi Demo Lokal aktif. Pilih persona di bawah ini untuk menguji alur
                    antarmuka secara offline tanpa menyentuh database produksi.
                  </p>
                </div>
                {connectionInfo.isConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      exitOfflineDemoSimulation();
                      setIsDemoAccountModalOpen(false);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    Mode Produksi
                  </button>
                )}
              </div>

              {/* Group 1: Superadmin */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Persona Simulasi: Superadmin Platform
                </p>
                <div className="space-y-1.5">
                  {users
                    .filter((u) => u.role === 'superadmin')
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSelectUser(u.id)}
                        className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                          u.id === currentUser.id
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs shrink-0">
                            SA
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{u.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {u.email} · Akses Multi-Tenant & Audit
                            </p>
                          </div>
                        </div>
                        {u.id === currentUser.id && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" />
                            Aktif
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </div>

              {/* Group 2: Admin MTQ */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Persona Simulasi: Administrator Event MTQ
                </p>
                <div className="space-y-1.5">
                  {users
                    .filter((u) => u.role === 'admin')
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSelectUser(u.id)}
                        className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                          u.id === currentUser.id
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                            ADM
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{u.name}</p>
                            <p className="text-[11px] text-slate-500">
                              LPTQ Provinsi Jawa Barat · Pengelola Data, Babak & Kelulusan
                            </p>
                          </div>
                        </div>
                        {u.id === currentUser.id && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" />
                            Aktif
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </div>

              {/* Group 3: Dewan Hakim */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Persona Simulasi: Dewan Hakim Penilai
                </p>
                <div className="space-y-1.5">
                  {users
                    .filter((u) => u.role === 'judge')
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSelectUser(u.id)}
                        className={`w-full text-left p-3 rounded-xl border flex items-center justify-between transition-all ${
                          u.id === currentUser.id
                            ? 'border-emerald-600 bg-emerald-50/70 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                            <Gavel className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{u.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {u.judgeCategory} · {u.judgeField}
                            </p>
                          </div>
                        </div>
                        {u.id === currentUser.id && (
                          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                            <Check className="w-3 h-3" />
                            Aktif
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={() => setIsDemoAccountModalOpen(false)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs rounded-xl"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
