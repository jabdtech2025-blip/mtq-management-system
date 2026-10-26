import React, { useState } from 'react';
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Filter
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const SuperadminAuditView: React.FC = () => {
  const { auditLogs } = useMtq();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState('Semua Status');

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.target.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.tenantName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesOutcome =
      selectedOutcome === 'Semua Status' || log.outcome === selectedOutcome;

    return matchesSearch && matchesOutcome;
  });

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Audit Log Platform Global
          </h1>
          <span className="text-[11px] font-semibold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
            Pusat Pengawasan Sistem
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Catatan riwayat aktivitas operasional penting, pemindahan akun, konfigurasi babak, dan integritas multi-tenant
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari aktor, tindakan, target, atau tenant..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700"
          >
            <option value="Semua Status">Semua Status Hasil</option>
            <option value="Success">Success</option>
            <option value="Warning">Warning</option>
            <option value="Failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px] text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                <th className="px-5 py-3 w-40">Waktu (WIB)</th>
                <th className="px-4 py-3">Aktor Pengguna</th>
                <th className="px-4 py-3">Tindakan & Tenant</th>
                <th className="px-4 py-3">Target Entitas</th>
                <th className="px-5 py-3">Ringkasan Aktivitas</th>
                <th className="px-4 py-3 text-center w-24">Hasil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log, idx) => (
                <tr key={`${log.id}-${idx}`} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono text-slate-500 text-[11px]">
                    {log.timestamp}
                  </td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{log.actor}</td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-[11px] font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded">
                      {log.action}
                    </span>
                    <p className="text-[10px] text-slate-400 mt-0.5">{log.tenantName}</p>
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-800">{log.target}</td>
                  <td className="px-5 py-3.5 text-slate-600 leading-relaxed max-w-xs">
                    {log.summary}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        log.outcome === 'Success'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : log.outcome === 'Warning'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                          : 'bg-rose-50 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {log.outcome === 'Success' && (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      )}
                      {log.outcome === 'Warning' && (
                        <AlertTriangle className="w-3 h-3 text-amber-600" />
                      )}
                      {log.outcome === 'Failed' && (
                        <XCircle className="w-3 h-3 text-rose-600" />
                      )}
                      <span>{log.outcome}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
