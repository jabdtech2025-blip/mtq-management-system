import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Database,
  Gavel,
  FileSpreadsheet,
  LogOut,
  X
} from 'lucide-react';
import { useMtq, ViewType } from '../../context/MtqContext';

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    currentUser,
    users,
    setCurrentUserId,
    isSidebarOpen,
    setIsSidebarOpen
  } = useMtq();

  const navItems: { id: ViewType; label: string; icon: React.ReactNode }[] = [
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
      label: 'Bank Soal',
      icon: <BookOpen className="w-4 h-4" />
    },
    {
      id: 'master_data',
      label: 'Master Data',
      icon: <Database className="w-4 h-4" />
    },
    {
      id: 'penilaian_hakim',
      label: 'Penilaian Hakim',
      icon: <Gavel className="w-4 h-4" />
    },
    {
      id: 'rekap_nilai',
      label: 'Rekap Nilai',
      icon: <FileSpreadsheet className="w-4 h-4" />
    }
  ];

  const handleToggleRole = () => {
    if (currentUser.role === 'admin') {
      const judge = users.find((u) => u.role === 'judge') || users[1];
      setCurrentUserId(judge.id);
    } else {
      const admin = users.find((u) => u.role === 'admin') || users[0];
      setCurrentUserId(admin.id);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleNavClick = (viewId: ViewType) => {
    setCurrentView(viewId);
    // On tablet / mobile, close the drawer after selection
    setIsSidebarOpen(false);
  };

  const sidebarContent = (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none h-full z-50">
      <div>
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

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 mt-2">
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

      {/* Profile Footer */}
      <div className="p-3 border-t border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100/70 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
              {getInitials(currentUser.name)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-800 truncate" title={currentUser.name}>
                {currentUser.name}
              </p>
              <p className="text-[10px] text-slate-500 capitalize">
                {currentUser.role === 'admin' ? 'Admin MTQ' : currentUser.judgeCategory || 'Dewan Hakim'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleRole}
            title={`Beralih ke peran ${currentUser.role === 'admin' ? 'Hakim' : 'Admin'}`}
            className="p-1.5 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* 1. Permanent Sidebar on Desktop (xl and above, when not in scoring dual panel) */}
      {currentView !== 'penilaian_dual_panel' && (
        <div className="hidden xl:block h-screen sticky top-0 shrink-0">
          {sidebarContent}
        </div>
      )}

      {/* 2. Responsive Drawer Overlay for Tabloid / Tablet (< xl, or during scoring view) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 animate-fadeIn"
          />

          {/* Drawer panel */}
          <div className="relative z-50 h-full w-64 shadow-2xl transition-transform duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
