import React, { useState } from 'react';
import {
  Building,
  ChevronDown,
  Check,
  BookOpen,
  Menu
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const TopHeader: React.FC = () => {
  const {
    currentTenant,
    tenants,
    setTenantId,
    currentUser,
    users,
    setCurrentUserId,
    toggleSidebar
  } = useMtq();

  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Hamburger Button to toggle sidebar + MTQ Brand & Event Title */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Tombol Hamburger Standar untuk Buka Sidebar */}
        <button
          onClick={toggleSidebar}
          aria-label="Buka Menu Sidebar"
          className="p-2 rounded-lg text-slate-700 hover:text-emerald-800 hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600"
          title="Buka Menu Navigasi"
        >
          <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Branding MTQ */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-800 flex items-center justify-center text-white shadow-xs shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="text-left hidden md:block">
            <span className="text-xs font-bold block text-slate-900 leading-none">
              Manajemen MTQ
            </span>
            <span className="text-[10px] text-emerald-800 font-semibold block mt-0.5">
              Musabaqah Digital
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-200 hidden sm:block" />

        {/* Institution and Event Header */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {currentTenant.name}
            </h2>
            {/* Quick tenant switcher trigger */}
            <div className="relative shrink-0">
              <button
                onClick={() => {
                  setIsTenantMenuOpen(!isTenantMenuOpen);
                  setIsUserMenuOpen(false);
                }}
                className="text-xs text-slate-400 hover:text-emerald-700 p-0.5 rounded transition-colors flex items-center"
                title="Ganti Penyelenggara / Tenant MTQ"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {isTenantMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 p-2 z-50">
                  <p className="text-[11px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                    Pilih Penyelenggara (Tenant)
                  </p>
                  <div className="space-y-1 mt-1">
                    {tenants.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTenantId(t.id);
                          setIsTenantMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                          t.id === currentTenant.id
                            ? 'bg-emerald-50 text-emerald-900 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <p className="font-medium">{t.name}</p>
                          <p className="text-[10px] text-slate-400">{t.eventName}</p>
                        </div>
                        {t.id === currentTenant.id && (
                          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 font-normal truncate max-w-sm sm:max-w-md lg:max-w-xl">
            {currentTenant.eventName}
          </p>
        </div>
      </div>

      {/* Right: Connection Status & Role Profile */}
      <div className="flex items-center gap-3 sm:gap-5">
        {/* Live indicator: green dot + "Terhubung" */}
        <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="hidden sm:inline">Terhubung</span>
        </div>

        {/* Role & User Switcher Trigger */}
        <div className="relative">
          <button
            onClick={() => {
              setIsUserMenuOpen(!isUserMenuOpen);
              setIsTenantMenuOpen(false);
            }}
            className="flex items-center gap-2 pl-2 sm:pl-3 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shrink-0">
              {getInitials(currentUser.name)}
            </div>
            <div className="hidden sm:block text-left">
              <span className="font-semibold block leading-tight">{currentUser.name.split(',')[0]}</span>
              <span className="text-[10px] text-slate-400 block">
                {currentUser.role === 'admin' ? 'Admin MTQ' : currentUser.judgeCategory || 'Hakim'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 p-2 z-50">
              <p className="text-[11px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                Ganti Akun Demo
              </p>
              <div className="space-y-1 mt-1">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCurrentUserId(u.id);
                      setIsUserMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between ${
                      u.id === currentUser.id
                        ? 'bg-emerald-50 text-emerald-900 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-[10px]">
                        {getInitials(u.name)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{u.name}</p>
                        <p className="text-[10px] text-slate-500">
                          {u.role === 'admin' ? 'Admin MTQ' : u.judgeField || 'Dewan Hakim'}
                        </p>
                      </div>
                    </div>
                    {u.id === currentUser.id && (
                      <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
