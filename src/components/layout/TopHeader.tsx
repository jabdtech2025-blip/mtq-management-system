import React, { useState } from 'react';
import {
  BookOpen,
  Menu,
  ShieldCheck,
  CheckCircle,
  Database
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const TopHeader: React.FC = () => {
  const {
    currentTenant,
    currentUser,
    toggleSidebar,
    syncStatus,
    lastSyncTime,
    setIsDemoAccountModalOpen
  } = useMtq();

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    if (role === 'superadmin') return 'Superadmin Platform';
    if (role === 'admin') return 'Admin MTQ';
    return currentUser.judgeCategory || 'Dewan Hakim';
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Hamburger Button to toggle sidebar + MTQ Brand & Static Event Context */}
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

        {/* Static Institution and Event Header (No direct dropdown in header) */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {currentTenant.name}
            </h2>
            <span className="hidden sm:inline-block text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              {currentTenant.code}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 font-normal truncate max-w-sm sm:max-w-md lg:max-w-xl">
            {currentTenant.eventName}
          </p>
        </div>
      </div>

      {/* Right: Honest Prototype Status Indicator & Profile */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Honest storage indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-medium bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
          <Database className="w-3.5 h-3.5 text-emerald-600" />
          <span>{syncStatus}</span>
        </div>

        {/* Profile Card with Quick Demo Account Modal trigger */}
        <div className="flex items-center gap-2.5 pl-2 sm:pl-3 py-1">
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200">
            {getInitials(currentUser.name)}
          </div>
          <div className="text-left">
            <span className="font-semibold block text-xs leading-tight text-slate-800">
              {currentUser.name.split(',')[0]}
            </span>
            <span className="text-[10px] text-emerald-800 font-medium block">
              {getRoleBadge(currentUser.role)}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
