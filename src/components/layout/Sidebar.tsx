import React, { useState } from 'react';
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
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Activity
} from 'lucide-react';
import { useMtq, ViewType } from '../../context/MtqContext';

export interface NavGroup {
  groupLabel: string;
  items: { id: ViewType; label: string; icon: React.ReactNode }[];
}

export const Sidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    currentUser,
    isSidebarOpen,
    setIsSidebarOpen,
    setIsDemoAccountModalOpen,
    currentTenant,
    isSuperadminWorkspaceMode,
    exitTenantWorkspace
  } = useMtq();

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  const isSuperadmin = currentUser.role === 'superadmin';

  const superadminNavGroup: NavGroup = {
    groupLabel: 'Superadmin Platform',
    items: [
      {
        id: 'superadmin_dashboard',
        label: 'Dashboard Platform',
        icon: <LayoutDashboard className="w-4 h-4 shrink-0" />
      },
      {
        id: 'superadmin_tenants',
        label: 'Penyelenggara MTQ (Manajemen MTQ)',
        icon: <Building className="w-4 h-4 shrink-0" />
      },
      {
        id: 'superadmin_users',
        label: 'Manajemen Akun',
        icon: <UserCheck className="w-4 h-4 shrink-0" />
      },
      {
        id: 'superadmin_health',
        label: 'Kesehatan Sistem (Health Check)',
        icon: <Activity className="w-4 h-4 shrink-0" />
      },
      {
        id: 'superadmin_audit',
        label: 'Audit Log Platform',
        icon: <ShieldAlert className="w-4 h-4 shrink-0" />
      },
      {
        id: 'superadmin_settings',
        label: 'SEO dan Meta Situs',
        icon: <Settings className="w-4 h-4 shrink-0" />
      }
    ]
  };

  const adminNavGroups: NavGroup[] = [
    {
      groupLabel: 'Ringkasan',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: <LayoutDashboard className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      groupLabel: 'Persiapan',
      items: [
        {
          id: 'master_data',
          label: 'Master Data & Rubrik',
          icon: <Database className="w-4 h-4 shrink-0" />
        },
        {
          id: 'user_management',
          label: 'Pengguna & Hakim',
          icon: <UserCheck className="w-4 h-4 shrink-0" />
        },
        {
          id: 'bank_soal',
          label: 'Bank Soal & Maqra',
          icon: <BookOpen className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      groupLabel: 'Pendaftaran',
      items: [
        {
          id: 'kafilah',
          label: 'Grup & Peserta',
          icon: <Users className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      groupLabel: 'Pelaksanaan',
      items: [
        {
          id: 'stage_management',
          label: 'Manajemen Babak',
          icon: <Layers className="w-4 h-4 shrink-0" />
        },
        {
          id: 'penilaian_hakim',
          label: 'Monitoring Penilaian',
          icon: <Gavel className="w-4 h-4 shrink-0" />
        },
        {
          id: 'rekap_nilai',
          label: 'Rekap Nilai Real-Time',
          icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      groupLabel: 'Hasil',
      items: [
        {
          id: 'hasil_kelulusan',
          label: 'Hasil & Kelulusan',
          icon: <Award className="w-4 h-4 shrink-0" />
        }
      ]
    },
    {
      groupLabel: 'Audit',
      items: [
        {
          id: 'log_aktivitas',
          label: 'Log Aktivitas',
          icon: <History className="w-4 h-4 shrink-0" />
        }
      ]
    }
  ];

  let navGroups: NavGroup[] = [];

  if (currentUser.role === 'superadmin') {
    if (isSuperadminWorkspaceMode && !currentView.startsWith('superadmin_')) {
      navGroups = [superadminNavGroup, ...adminNavGroups];
    } else {
      navGroups = [superadminNavGroup];
    }
  } else if (currentUser.role === 'judge') {
    navGroups = [
      {
        groupLabel: 'Pelaksanaan Penilaian',
        items: [
          {
            id: 'penilaian_hakim',
            label: 'Peserta Saya',
            icon: <Users className="w-4 h-4 shrink-0" />
          },
          {
            id: 'penilaian_dual_panel',
            label: 'Penilaian Mushaf',
            icon: <Gavel className="w-4 h-4 shrink-0" />
          },
          {
            id: 'rekap_nilai',
            label: 'Rekap / Riwayat Nilai',
            icon: <FileSpreadsheet className="w-4 h-4 shrink-0" />
          }
        ]
      }
    ];
  } else {
    navGroups = adminNavGroups;
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const roleLabel =
    currentUser.role === 'superadmin'
      ? 'Superadmin'
      : currentUser.role === 'judge'
      ? currentUser.judgeCategory ||
        (currentUser.judgeField ? `Hakim ${currentUser.judgeField}` : 'Hakim')
      : 'Admin MTQ';

  const handleNavClick = (viewId: ViewType) => {
    if (viewId.startsWith('superadmin_') && isSuperadminWorkspaceMode) {
      exitTenantWorkspace();
    }
    setCurrentView(viewId);
    setIsSidebarOpen(false);
  };

  const renderSidebarBody = (collapsed: boolean) => (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-64'
      } bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 select-none h-full max-h-screen z-50 overflow-hidden transition-all duration-200 ease-out`}
    >
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* Brand Lockup & Collapse Toggle */}
        <div
          className={`${
            collapsed ? 'p-2.5 flex-col gap-2' : 'p-4 flex-row'
          } flex items-center justify-between border-b border-slate-100`}
        >
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 min-w-0'}`}>
            <div
              className={`w-9 h-9 rounded-md ${
                isSuperadmin ? 'bg-purple-800' : 'bg-emerald-800'
              } flex items-center justify-center text-white shadow-sm shrink-0`}
              title="Manajemen MTQ · Musabaqah Digital"
            >
              <BookOpen className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-slate-900 tracking-tight leading-snug truncate">
                  Manajemen MTQ
                </h1>
                <p className="text-xs text-slate-500 font-medium truncate">Musabaqah Digital</p>
              </div>
            )}
          </div>

          {/* Collapse / Expand button for desktop */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!collapsed)}
            aria-label={collapsed ? 'Tampilkan sidebar' : 'Sembunyikan sidebar'}
            title={collapsed ? 'Tampilkan Sidebar' : 'Sembunyikan Sidebar'}
            className={`hidden lg:inline-flex w-8 h-8 items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors cursor-pointer shrink-0 ${
              isSuperadmin
                ? 'hover:text-purple-800 hover:bg-purple-50 hover:border-purple-200/70'
                : 'hover:text-emerald-800 hover:bg-emerald-50 hover:border-emerald-200/70'
            }`}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>

          {/* Close button for tablet / mobile drawer */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Tutup menu navigasi"
            className="w-10 h-10 inline-flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 lg:hidden cursor-pointer shrink-0"
            title="Tutup Menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Groups by Stage */}
        <nav className={collapsed ? 'p-2 space-y-2' : 'p-3 space-y-4'} aria-label="Menu Utama">
          {navGroups.map((group, groupIdx) => (
            <div key={group.groupLabel} className="space-y-1">
              {collapsed ? (
                groupIdx > 0 && <div className="h-px bg-slate-100 my-1.5 mx-1" />
              ) : (
                <div className="px-3 py-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {group.groupLabel}
                  </span>
                </div>
              )}
              {group.items.map((item, idx) => {
                const isActive = currentView === item.id;
                const activeClasses = isSuperadmin
                  ? 'bg-purple-50 text-purple-800 font-bold border border-purple-200/80'
                  : 'bg-emerald-50 text-emerald-800 font-bold border border-emerald-200/70';
                const activeIconClass = isSuperadmin ? 'text-purple-700' : 'text-emerald-700';

                return (
                  <button
                    key={`${item.id}-${idx}`}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-label={item.label}
                    title={item.label}
                    className={`w-full min-h-10 flex items-center ${
                      collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2 text-left'
                    } rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer ${
                      isActive
                        ? activeClasses
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <span className={isActive ? activeIconClass : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Discrete Locked Bottom Persona Footer (without visible "Ganti" badge) */}
      <div className={`${collapsed ? 'p-2' : 'p-3'} border-t border-slate-200 bg-white shrink-0 z-20 mt-auto`}>
        <button
          type="button"
          onClick={() => setIsDemoAccountModalOpen(true)}
          aria-label={`Profil ${currentUser.name} - Ganti Akun`}
          title={`${currentUser.name} (${roleLabel})`}
          className={`w-full rounded-md bg-white border border-slate-200 transition-all duration-150 flex items-center cursor-pointer ${
            collapsed ? 'justify-center p-1.5' : 'text-left p-2.5 justify-between'
          } ${
            isSuperadmin
              ? 'hover:border-purple-500 hover:bg-purple-50/40'
              : 'hover:border-emerald-500 hover:bg-emerald-50/40'
          }`}
        >
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 border ${
                isSuperadmin
                  ? 'bg-purple-100 text-purple-900 border-purple-200'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-200'
              }`}
            >
              {getInitials(currentUser.name)}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">
                  {currentUser.name.split(',')[0]}
                </p>
                <p
                  className={`text-xs font-semibold truncate capitalize ${
                    isSuperadmin ? 'text-purple-800' : 'text-emerald-800'
                  }`}
                >
                  {roleLabel}
                </p>
              </div>
            )}
          </div>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar (visible on lg screens >= 1024px) */}
      <div className="hidden lg:block h-screen max-h-screen sticky top-0 shrink-0 overflow-hidden">
        {renderSidebarBody(isCollapsed)}
      </div>

      {/* Off-canvas mobile/tablet drawer (for screens < lg, always expanded) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 surface-glass-dark transition-opacity duration-200"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="relative flex flex-col w-64 max-w-xs h-full max-h-screen bg-white shadow-lg z-50 transition-transform duration-200 ease-out overflow-hidden">
            {renderSidebarBody(false)}
          </div>
        </div>
      )}
    </>
  );
};
