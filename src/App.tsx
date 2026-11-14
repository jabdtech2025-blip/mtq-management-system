import React from 'react';
import { FlaskConical, ArrowLeft } from 'lucide-react';
import { MtqProvider, useMtq } from './context/MtqContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DemoAccountModal } from './components/layout/DemoAccountModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { Skeleton } from './components/ui';
import { PWAUpdateToast } from './components/pwa/PWAUpdateToast';

// Halaman dimuat sesuai kebutuhan (code-splitting) agar bundel awal kecil
const KafilahPesertaView = React.lazy(() => import('./components/kafilah/KafilahPesertaView').then((m) => ({ default: m.KafilahPesertaView })));
const BankSoalView = React.lazy(() => import('./components/bankSoal/BankSoalView').then((m) => ({ default: m.BankSoalView })));
const MasterDataView = React.lazy(() => import('./components/masterData/MasterDataView').then((m) => ({ default: m.MasterDataView })));
const PenilaianHakimListView = React.lazy(() => import('./components/penilaian/PenilaianHakimListView').then((m) => ({ default: m.PenilaianHakimListView })));
const RekapNilaiView = React.lazy(() => import('./components/rekap/RekapNilaiView').then((m) => ({ default: m.RekapNilaiView })));
const PenilaianDualPanelView = React.lazy(() => import('./components/penilaian/PenilaianDualPanelView').then((m) => ({ default: m.PenilaianDualPanelView })));
const UserManagementView = React.lazy(() => import('./components/users/UserManagementView').then((m) => ({ default: m.UserManagementView })));
const StageManagementView = React.lazy(() => import('./components/stages/StageManagementView').then((m) => ({ default: m.StageManagementView })));
const HasilKelulusanView = React.lazy(() => import('./components/stages/HasilKelulusanView').then((m) => ({ default: m.HasilKelulusanView })));
const SuperadminDashboardView = React.lazy(() => import('./components/superadmin/SuperadminDashboardView').then((m) => ({ default: m.SuperadminDashboardView })));
const SuperadminTenantsView = React.lazy(() => import('./components/superadmin/SuperadminTenantsView').then((m) => ({ default: m.SuperadminTenantsView })));
const SuperadminUsersView = React.lazy(() => import('./components/superadmin/SuperadminUsersView').then((m) => ({ default: m.SuperadminUsersView })));
const SuperadminHealthView = React.lazy(() => import('./components/superadmin/SuperadminHealthView').then((m) => ({ default: m.SuperadminHealthView })));
const SuperadminAuditView = React.lazy(() => import('./components/superadmin/SuperadminAuditView').then((m) => ({ default: m.SuperadminAuditView })));
const SuperadminContentView = React.lazy(() => import('./components/superadmin/SuperadminContentView').then((m) => ({ default: m.SuperadminContentView })));
const SuperadminSettingsView = React.lazy(() => import('./components/superadmin/SuperadminSettingsView').then((m) => ({ default: m.SuperadminSettingsView })));
const ActivityLogView = React.lazy(() => import('./components/activityLog/ActivityLogView').then((m) => ({ default: m.ActivityLogView })));
import { useDocumentMeta } from './hooks/useDocumentMeta';
import { AuthenticationGateView } from './components/auth/AuthenticationGateView';

const MainLayout: React.FC = () => {
  const {
    currentView,
    currentTenant,
    siteSettings,
    isLiveAccessAuthorized,
    isPasswordRecoveryMode,
    isOfflineDemoSimulation,
    exitOfflineDemoSimulation,
    isSuperadminWorkspaceMode,
    exitTenantWorkspace
  } = useMtq();

  const showAuthGate = !isLiveAccessAuthorized || isPasswordRecoveryMode;
  useDocumentMeta(currentView, siteSettings, showAuthGate ? 'Masuk' : undefined);

  // P0 Mandatory Fail-Closed Authentication Gate:
  if (showAuthGate) {
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
      case 'log_aktivitas':
        return <ActivityLogView />;

      // Superadmin Platform
      case 'superadmin_dashboard':
        return <SuperadminDashboardView />;
      case 'superadmin_tenants':
        return <SuperadminTenantsView />;
      case 'superadmin_users':
        return <SuperadminUsersView />;
      case 'superadmin_health':
        return <SuperadminHealthView />;
      case 'superadmin_audit':
        return <SuperadminAuditView />;
      case 'superadmin_settings':
        return <SuperadminSettingsView />;
      case 'superadmin_content':
        return <SuperadminContentView />;

      default:
        return <DashboardView />;
    }
  };

  const isScoringView = currentView === 'penilaian_dual_panel';

  return (
    <div className="flex h-screen w-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar: persistent on desktop, off-canvas drawer on tablet & mobile */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Offline Demo Simulation Isolation Banner */}
        {isOfflineDemoSimulation && (
          <div className="bg-amber-900 text-amber-50 px-4 py-1.5 text-xs font-semibold flex flex-row items-center justify-between gap-2 shrink-0 z-40 border-b border-amber-700">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                <span className="sm:hidden">Mode Demo (data tidak disimpan)</span>
                <span className="hidden sm:inline">
                  Mode Demo — data hanya tersimpan di browser ini, bukan di database lomba.
                </span>
              </span>
            </div>
            <button
              onClick={exitOfflineDemoSimulation}
              className="bg-white hover:bg-amber-50 text-amber-950 px-3 py-1 rounded-sm text-xs font-bold cursor-pointer transition-all shrink-0"
            >
              Keluar dari Demo
            </button>
          </div>
        )}

        {/* Mode Supervisi Workspace Tenant untuk Superadmin */}
        {isSuperadminWorkspaceMode && (
          <div className="bg-purple-950 text-purple-100 px-4 py-2 text-xs font-semibold flex flex-row items-center justify-between gap-3 shrink-0 z-40 border-b border-purple-800 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded-sm bg-purple-800 text-white font-mono text-[11px] font-bold shrink-0">
                Supervisi Aktif
              </span>
              <span className="truncate">
                Anda sedang membuka workspace operasional:{' '}
                <strong className="text-white font-bold">{currentTenant?.name || 'Tenant'}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={exitTenantWorkspace}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-purple-50 text-purple-950 px-3 py-1.5 rounded-md text-xs font-extrabold cursor-pointer transition-all shrink-0 shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Panel Platform</span>
            </button>
          </div>
        )}

        {/* Render unified TopHeader across all views */}
        <TopHeader />

        <main className={`flex-1 min-w-0 ${isScoringView ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
          <React.Suspense
            fallback={
              <div className="p-6 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton lines={3} />
              </div>
            }
          >
            {renderCurrentView()}
          </React.Suspense>
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
      <PWAUpdateToast />
    </MtqProvider>
  );
}
