import React from 'react';
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

const MainLayout: React.FC = () => {
  const { currentView } = useMtq();

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
        {/* On standard views, show the TopHeader; on scoring view, PenilaianDualPanelView provides its own specialized header */}
        {!isScoringView && <TopHeader />}

        <main className={`flex-1 ${isScoringView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderCurrentView()}
        </main>
      </div>

      {/* Demo Persona Switcher Modal for prototype testing */}
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
