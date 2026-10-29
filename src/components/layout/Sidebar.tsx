import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Database,
  Gavel,
  FileSpreadsheet,
  X,
  Layers,
  Award,
  ShieldAlert,
  Building,
  UserCheck,
  History,
  FileText
} from 'lucide-react';
import { useMtq, ViewType } from '../../context/MtqContext';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    currentUser,
    isSidebarOpen,
    setIsSidebarOpen,
    setIsDemoAccountModalOpen
  } = useMtq();

  // Navigation items by role
  let navItems: { id: ViewType; label: string; icon: React.ReactNode }[] = [];

  if (currentUser.role === 'superadmin') {
    navItems = [
      {
        id: 'superadmin_dashboard',
        label: 'Dashboard Platform',
        icon: <LayoutDashboard className="w-4 h-4" />
      },
      {
        id: 'superadmin_tenants',
        label: 'Manajemen MTQ',
        icon: <Building className="w-4 h-4" />
      },
      {
        id: 'superadmin_users',
        label: 'Manajemen Akun',
        icon: <UserCheck className="w-4 h-4" />
      },
      {
        id: 'superadmin_audit',
        label: 'Audit Log Platform',
        icon: <ShieldAlert className="w-4 h-4" />
      }
    ];
  } else if (currentUser.role === 'judge') {
    navItems = [
      {
        id: 'penilaian_hakim',
        label: 'Peserta Saya',
        icon: <Users className="w-4 h-4" />
      },
      {
        id: 'penilaian_dual_panel',
        label: 'Penilaian Mushaf',
        icon: <Gavel className="w-4 h-4" />
      },
      {
        id: 'rekap_nilai',
        label: 'Rekap / Riwayat Nilai',
        icon: <FileSpreadsheet className="w-4 h-4" />
      }
    ];
  } else {
    // Admin MTQ
    navItems = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard className="w-4 h-4" />
      },
      {
        id: 'kafilah',
        label: 'Grup & Peserta',
        icon: <Users className="w-4 h-4" />
      },
      {
        id: 'bank_soal',
        label: 'Bank Soal & Maqra',
        icon: <BookOpen className="w-4 h-4" />
      },
      {
        id: 'master_data',
        label: 'Master Data & Rubrik',
        icon: <Database className="w-4 h-4" />
      },
      {
        id: 'user_management',
        label: 'Pengguna & Hakim',
        icon: <UserCheck className="w-4 h-4" />
      },
      {
        id: 'penilaian_hakim',
        label: 'Monitoring Penilaian',
        icon: <Gavel className="w-4 h-4" />
      },
      {
        id: 'rekap_nilai',
        label: 'Rekap Nilai Real-Time',
        icon: <FileSpreadsheet className="w-4 h-4" />
      },
      {
        id: 'stage_management',
        label: 'Manajemen Babak',
        icon: <Layers className="w-4 h-4" />
      },
      {
        id: 'hasil_kelulusan',
        label: 'Hasil & Kelulusan',
        icon: <Award className="w-4 h-4" />
      }
    ];
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleNavClick = (viewId: ViewType) => {
    setCurrentView(viewId);
    setIsSidebarOpen(false);
  };

  const sidebarContent = (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none h-full z-50">
      <div className="flex-1 overflow-y-auto">
        {/* Brand Lockup */}
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-800 flex items-center justify-center text-white shadow-xs shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                Manajemen MTQ
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">Musabaqah Digital</p>
            </div>
          </div>

          {/* Close button for tablet / mobile drawer */}
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 xl:hidden"
            title="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Tag */}
        <div className="px-4 pt-3 pb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {currentUser.role === 'superadmin'
              ? 'Menu Superadmin'
              : currentUser.role === 'judge'
              ? 'Menu Dewan Hakim'
              : 'Menu Admin MTQ'}
          </span>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className={isActive ? 'text-emerald-700' : 'text-slate-400'}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Discrete Prototype Demo Switcher Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/70 space-y-2">
        <button
          onClick={() => setIsDemoAccountModalOpen(true)}
          className="w-full text-left p-2 rounded-xl bg-white border border-slate-200/90 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200">
              {getInitials(currentUser.name)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate" title={currentUser.name}>
                {currentUser.name.split(',')[0]}
              </p>
              <p className="text-[10px] text-emerald-800 font-semibold truncate capitalize">
                {currentUser.role === 'superadmin'
                  ? 'Superadmin'
                  : currentUser.role === 'judge'
                  ? currentUser.judgeCategory || (currentUser.judgeField ? `Hakim ${currentUser.judgeField}` : 'Hakim')
                  : 'Admin MTQ'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 hover:text-emerald-700 shrink-0 px-1 py-0.5 rounded bg-slate-100">
            Ganti
          </span>
        </button>

        <p className="text-[10px] text-center text-slate-400 leading-tight">
          Simulasi Prototype MTQ v2.0
        </p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (hidden on tablet/mobile) */}
      <div className="hidden xl:block h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </div>

      {/* Off-canvas mobile/tablet drawer */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="relative flex flex-col w-64 max-w-xs h-full bg-white shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
