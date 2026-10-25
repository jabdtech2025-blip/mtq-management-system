import React from 'react';
import {
  Building,
  Users,
  ShieldCheck,
  FileSpreadsheet,
  ArrowRight,
  Clock,
  ExternalLink
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const SuperadminDashboardView: React.FC = () => {
  const { tenants, users, auditLogs, setTenantId, setCurrentView } = useMtq();

  const totalTenants = tenants.length;
  const totalUsers = users.length;
  const totalJudges = users.filter((u) => u.role === 'judge').length;
  const totalAdmins = users.filter((u) => u.role === 'admin').length;

  const handleOpenTenantWorkspace = (tId: string) => {
    setTenantId(tId);
    setCurrentView('dashboard');
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
            Platform Multi-Tenant
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
            Dashboard Superadmin MTQ Digital
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Kementerian Agama RI & Lembaga Pengembangan Tilawatil Qur’an (LPTQ) Nasional
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentView('superadmin_tenants')}
            className="inline-flex items-center gap-2 bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all"
          >
            <Building className="w-4 h-4" />
            <span>Kelola Seluruh MTQ</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Penyelenggara MTQ</span>
            <Building className="w-4 h-4 text-purple-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 font-mono">{totalTenants}</p>
          <p className="text-[11px] text-slate-400 mt-1">LPTQ Provinsi terdaftar</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Total Akun Pengguna</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 font-mono">{totalUsers}</p>
          <p className="text-[11px] text-slate-400 mt-1">Seluruh wilayah & dewan juri</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Dewan Hakim</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 font-mono">{totalJudges}</p>
          <p className="text-[11px] text-slate-400 mt-1">Hakim penilai bersertifikasi</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Administrator MTQ</span>
            <Users className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 font-mono">{totalAdmins}</p>
          <p className="text-[11px] text-slate-400 mt-1">Admin wilayah aktif</p>
        </div>
      </div>

      {/* Tenant List Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">
          Daftar Event Musabaqah yang Sedang Berjalan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tenants.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between hover:border-purple-300 transition-all"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded">
                    {t.code}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                    {t.status}
                  </span>
                </div>
                <h4 className="font-extrabold text-base text-slate-900 mt-2.5">{t.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{t.eventName}</p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Wilayah: {t.region} · Periode: {t.period}
                </p>
              </div>

              <div className="pt-5 border-t border-slate-100 mt-4 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {users.filter((u) => u.tenantId === t.id).length} Akun Terdaftar
                </span>
                <button
                  onClick={() => handleOpenTenantWorkspace(t.id)}
                  className="px-3 py-1.5 bg-purple-800 hover:bg-purple-900 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition-colors"
                >
                  <span>Buka MTQ Ini</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Audit Logs */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-700" />
            <h3 className="font-bold text-sm text-slate-900">
              Audit Log Platform Terakhir
            </h3>
          </div>
          <button
            onClick={() => setCurrentView('superadmin_audit')}
            className="text-xs text-purple-800 font-bold hover:underline"
          >
            Lihat Semua Log
          </button>
        </div>

        <div className="space-y-2">
          {auditLogs.slice(0, 4).map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-3 text-xs"
            >
              <div>
                <p className="font-bold text-slate-900">
                  {log.actor} · <span className="font-mono text-purple-800">{log.action}</span>
                </p>
                <p className="text-slate-500 mt-0.5">{log.summary}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {log.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
