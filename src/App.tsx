import React from 'react';
import { MtqProvider, useMtq } from './context/MtqContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DashboardView } from './components/dashboard/DashboardView';
import { KafilahPesertaView } from './components/kafilah/KafilahPesertaView';
import { BankSoalView } from './components/bankSoal/BankSoalView';
import { MasterDataView } from './components/masterData/MasterDataView';
import { PenilaianHakimListView } from './components/penilaian/PenilaianHakimListView';
import { RekapNilaiView } from './components/rekap/RekapNilaiView';
import { PenilaianDualPanelView } from './components/penilaian/PenilaianDualPanelView';

const MainLayout: React.FC = () => {
  const { currentView } = useMtq();

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'kafilah':
        return <KafilahPesertaView />;
      case 'bank_soal':
        return <BankSoalView />;
      case 'master_data':
        return <MasterDataView />;
      case 'penilaian_hakim':
        return <PenilaianHakimListView />;
      case 'rekap_nilai':
        return <RekapNilaiView />;
      case 'penilaian_dual_panel':
        return <PenilaianDualPanelView />;
      default:
        return <DashboardView />;
    }
  };

  const isScoringView = currentView === 'penilaian_dual_panel';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      {/* Sidebar: hidden by default on tabloid/tablet and opens via logo click as off-canvas drawer */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* On standard views, show the TopHeader with MTQ Logo; on scoring view, PenilaianDualPanelView provides its own clean header */}
        {!isScoringView && <TopHeader />}

        <main className={`flex-1 ${isScoringView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderCurrentView()}
        </main>
      </div>
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
