import React, { useState } from 'react';
import {
  ShieldCheck,
  Database,
  RefreshCw,
  LogIn,
  LogOut,
  AlertTriangle,
  Lock,
  FlaskConical,
  ArrowRight
} from 'lucide-react';
import { MtqProvider, useMtq } from './context/MtqContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DemoAccountModal } from './components/layout/DemoAccountModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { KafilahPesertaView } from './components/kafilah/KafilahPesertaView';
import { BankSoalView } from './components/bankSoal/BankSoalView';
import { MasterDataView } from './components/masterData/MasterDataView';
import { PenilaianHakimListView } from './components/penilaian/PenilaianHakimListView';
import { RekapNilaiView } from './components/rekap/RekapNilaiView';
import { PenilaianDualPanelView } from './components/penilaian/PenilaianDualPanelView';
import { UserManagementView } from './components/users/UserManagementView';
import { StageManagementView } from './components/stages/StageManagementView';
import { HasilKelulusanView } from './components/stages/HasilKelulusanView';
import { SuperadminDashboardView } from './components/superadmin/SuperadminDashboardView';
import { SuperadminTenantsView } from './components/superadmin/SuperadminTenantsView';
import { SuperadminUsersView } from './components/superadmin/SuperadminUsersView';
import { SuperadminAuditView } from './components/superadmin/SuperadminAuditView';

const AuthenticationGateView: React.FC = () => {
  const {
    connectionInfo,
    authenticatedProfile,
    accessGateReason,
    refreshSupabaseConnection,
    signInWithSupabase,
    signOutSupabase,
    enterOfflineDemoSimulation
  } = useMtq();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await signInWithSupabase(email, password);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      if (res.success) {
        setPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await refreshSupabaseConnection();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderAccessDiagnostic = () => {
    if (accessGateReason === 'unauthenticated' || !authenticatedProfile) {
      return null;
    }

    let title = 'Otorisasi Workspace Ditolak';
    let description =
      authenticatedProfile.verificationError ||
      'Akun Anda belum memiliki hak akses aktif ke workspace tenant MTQ.';

    if (accessGateReason === 'profile_missing') {
      title = 'Profil Pengguna Belum Terdaftar (Tabel profiles)';
      description =
        authenticatedProfile.verificationError ||
        `Akun Auth (${authenticatedProfile.email}) berhasil login, tetapi baris profil pada tabel public.profiles tidak ditemukan.`;
    } else if (accessGateReason === 'membership_empty') {
      title = 'Belum Terdaftar pada Tenant MTQ (tenant_memberships Kosong)';
      description =
        authenticatedProfile.verificationError ||
        `Akun ${authenticatedProfile.email} belum memiliki keanggotaan pada penyelenggara/tenant MTQ mana pun. Hubungi Administrator atau Superadmin untuk menambahkan keanggotaan tenant.`;
    } else if (accessGateReason === 'membership_inactive') {
      title = 'Keanggotaan Tenant Nonaktif';
      description =
        authenticatedProfile.verificationError ||
        `Seluruh keanggotaan tenant untuk akun ${authenticatedProfile.email} saat ini berstatus Nonaktif.`;
    } else if (accessGateReason === 'query_error') {
      title = 'Gagal Memverifikasi Profil & Keanggotaan dari Database';
      description =
        authenticatedProfile.verificationError ||
        'Terjadi kesalahan saat membaca tabel profiles atau tenant_memberships pada Supabase.';
    }

    return (
      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-extrabold text-rose-900">{title}</p>
            <p className="text-rose-800 leading-relaxed">{description}</p>
            <p className="text-[11px] font-mono text-rose-700 pt-1">
              UID: {authenticatedProfile.authUserId} · Email: {authenticatedProfile.email} · Global Role:{' '}
              {authenticatedProfile.globalRole}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
            Periksa Ulang Otorisasi
          </button>
          <button
            type="button"
            onClick={() => void signOutSupabase()}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-900 text-white text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar dari Sesi Ini
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-emerald-950 text-white border-b border-emerald-900">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-800/90 border border-emerald-600/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-900/90 border border-emerald-700 text-[10px] font-bold uppercase tracking-wider text-emerald-200 mb-1">
                <Lock className="w-3 h-3 text-amber-400" />
                Gerbang Keamanan Produksi MTQ
              </span>
              <h1 className="text-lg font-extrabold tracking-tight">
                Sistem Manajemen & Penilaian MTQ
              </h1>
              <p className="text-xs text-emerald-200/80">
                Wajib autentikasi Supabase Auth & verifikasi keanggotaan tenant aktif
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Connection Status Bar */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-slate-900">
                  Status Koneksi Supabase
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isSubmitting ? 'animate-spin' : ''}`} />
                Cek Koneksi
              </button>
            </div>
            <p className="text-xs font-medium text-slate-700">{connectionInfo.statusLabel}</p>
            {connectionInfo.state === 'schema_missing' && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
                Endpoint Supabase aktif, tetapi tabel inti belum ditemukan. Jalankan{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">supabase/schema.sql</code> dan{' '}
                <code className="font-mono bg-amber-100 px-1 rounded">supabase/seed.sql</code> pada
                SQL Editor Supabase.
              </div>
            )}
            {connectionInfo.lastError && connectionInfo.state !== 'schema_missing' && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 p-2 rounded-lg">
                Detail: {connectionInfo.lastError}
              </p>
            )}
          </div>

          {/* Diagnostic Alert if authenticated but missing profile/membership */}
          {renderAccessDiagnostic()}

          {/* Login Form when unauthenticated */}
          {!authenticatedProfile && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Akun Resmi (Admin / Dewan Hakim / Superadmin)
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@instansi.mtq.id"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kata Sandi
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi Supabase Auth"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !email.trim() || !password}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
              >
                <LogIn className="w-4 h-4" />
                {isSubmitting ? 'Memverifikasi Sesi & Otorisasi...' : 'Masuk ke Workspace Produksi'}
              </button>
            </form>
          )}

          {/* Explicit Offline Demo Simulation Escape Hatch */}
          <div className="pt-4 border-t border-slate-200">
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-950">
                  <FlaskConical className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Evaluasi Tanpa Akun Database?</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Gunakan Mode Simulasi Demo Lokal yang terisolasi sepenuhnya dari database produksi.
                </p>
              </div>
              <button
                type="button"
                onClick={enterOfflineDemoSimulation}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 cursor-pointer transition-all"
              >
                <span>Mode Simulasi Lokal</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MainLayout: React.FC = () => {
  const {
    currentView,
    isSuperadminWorkspaceMode,
    currentTenant,
    exitTenantWorkspace,
    isLiveAccessAuthorized,
    isOfflineDemoSimulation,
    exitOfflineDemoSimulation,
    connectionInfo
  } = useMtq();

  // P0 Mandatory Authentication Gate:
  // When Supabase is configured and we are NOT in explicit offline demo simulation,
  // block access to the workspace unless the user has a verified session, profile, and active membership.
  if (!isLiveAccessAuthorized) {
    return <AuthenticationGateView />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      // Admin MTQ
      case 'dashboard':
        return <DashboardView />;
      case 'kafilah':
        return <KafilahPesertaView />;
      case 'bank_soal':
        return <BankSoalView />;
      case 'master_data':
        return <MasterDataView />;
      case 'user_management':
        return <UserManagementView />;
      case 'penilaian_hakim':
        return <PenilaianHakimListView />;
      case 'rekap_nilai':
        return <RekapNilaiView />;
      case 'stage_management':
        return <StageManagementView />;
      case 'hasil_kelulusan':
        return <HasilKelulusanView />;
      case 'penilaian_dual_panel':
        return <PenilaianDualPanelView />;

      // Superadmin Platform
      case 'superadmin_dashboard':
        return <SuperadminDashboardView />;
      case 'superadmin_tenants':
        return <SuperadminTenantsView />;
      case 'superadmin_users':
        return <SuperadminUsersView />;
      case 'superadmin_audit':
        return <SuperadminAuditView />;

      default:
        return <DashboardView />;
    }
  };

  const isScoringView = currentView === 'penilaian_dual_panel';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      {/* Sidebar: persistent on desktop, off-canvas drawer on tablet & mobile */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Offline Demo Simulation Isolation Banner when Supabase is configured */}
        {isOfflineDemoSimulation && connectionInfo.isConfigured && (
          <div className="bg-amber-900 text-amber-50 px-4 py-2 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2 sticky top-0 z-40 border-b border-amber-700">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                MODE SIMULASI DEMO LOKAL — Seluruh perubahan disimpan di memori lokal browser dan
                tidak menyentuh database produksi Supabase.
              </span>
            </div>
            <button
              onClick={exitOfflineDemoSimulation}
              className="bg-white hover:bg-amber-50 text-amber-950 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all self-start sm:self-auto shrink-0"
            >
              Kembali ke Mode Produksi Supabase
            </button>
          </div>
        )}

        {/* Superadmin Workspace Mode Banner */}
        {isSuperadminWorkspaceMode && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping"></span>
              <span>Mode Superadmin: Memantau & Mengelola Workspace [{currentTenant.name}]</span>
            </div>
            <button
              onClick={exitTenantWorkspace}
              className="bg-slate-950 hover:bg-slate-900 text-white px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all self-start sm:self-auto"
            >
              Kembali ke Dashboard Superadmin
            </button>
          </div>
        )}

        {/* On standard views, show the TopHeader; on scoring view, PenilaianDualPanelView provides its own specialized header */}
        {!isScoringView && <TopHeader />}

        <main className={`flex-1 ${isScoringView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderCurrentView()}
        </main>
      </div>

      {/* Auth & Persona Modal */}
      <DemoAccountModal />
    </div>
  );
};

export default function App() {
  return (
    <MtqProvider>
      <MainLayout />
    </MtqProvider>
  );
}
