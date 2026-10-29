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
    return currentUser.judgeCategory || (currentUser.judgeField ? `Hakim ${currentUser.judgeField}` : 'Dewan Hakim');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Left: Hamburger Button to toggle sidebar + Static Event Context (No brand duplication) */}
      <div className="flex items-center gap-3">
        {/* Tombol Hamburger Standar untuk Buka Sidebar */}
        <button
          onClick={toggleSidebar}
          aria-label="Buka Menu Sidebar"
          className="p-2 rounded-lg text-slate-600 hover:text-emerald-800 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600"
          title="Buka Menu Navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Static Institution and Event Header */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900 truncate">
              {currentTenant.name}
            </h2>
            <span className="hidden sm:inline-block text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/60 font-mono">
              {currentTenant.code}
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate max-w-sm sm:max-w-md lg:max-w-xl">
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
        <button
          onClick={() => setIsDemoAccountModalOpen(true)}
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left cursor-pointer border border-transparent hover:border-slate-200"
          title="Ganti Akun Demo / Evaluasi Persona"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold text-xs shrink-0 border border-emerald-200">
            {getInitials(currentUser.name)}
          </div>
          <div className="hidden sm:block">
            <span className="font-semibold block text-xs leading-tight text-slate-800">
              {currentUser.name.split(',')[0]}
            </span>
            <span className="text-[11px] text-emerald-800 font-medium block">
              {getRoleBadge(currentUser.role)}
            </span>
          </div>
        </button>
      </div>
    </header>
  );
};
