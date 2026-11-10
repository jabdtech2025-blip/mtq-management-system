import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  RefreshCw,
  Eye,
  X
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

interface NormalizedLogEntry {
  id: string;
  timestamp: string;
  sortOrder: number;
  actorName: string;
  actorRole: string;
  module: string;
  action: string;
  summary: string;
  target?: string;
  outcome: 'Success' | 'Warning' | 'Error';
}

export const ActivityLogView: React.FC = () => {
  const {
    auditLogs,
    activityLogs,
    notifications,
    currentTenant,
    refreshSupabaseConnection
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<string>('ALL');
  const [filterModule, setFilterModule] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedLog, setSelectedLog] = useState<NormalizedLogEntry | null>(null);
  const pageSize = 20;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSupabaseConnection();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Combine and normalize auditLogs, activityLogs, and runtime notifications into unified log entries
  const normalizedLogs = useMemo(() => {
    const list: NormalizedLogEntry[] = [];

    // 1. Runtime notifications (including errors, warnings, and saved actions)
    (notifications || []).forEach((notif, idx) => {
      list.push({
        id: notif.id || `notif-${idx}`,
        timestamp: notif.timestamp,
        sortOrder: 300000 - idx,
        actorName: 'Sesi Aktif',
        actorRole: 'Admin / Hakim',
        module: notif.module || 'Sistem',
        action: notif.title,
        summary: notif.message,
        target: undefined,
        outcome:
          notif.type === 'error'
            ? 'Error'
            : notif.type === 'warning'
            ? 'Warning'
            : 'Success'
      });
    });

    // 2. From auditLogs
    (auditLogs || []).forEach((log, idx) => {
      const outcomeStr = log.outcome || 'Success';
      const outcome: 'Success' | 'Warning' | 'Error' =
        outcomeStr === 'Failed'
          ? 'Error'
          : outcomeStr === 'Warning'
          ? 'Warning'
          : 'Success';

      let mod = 'Sistem';
      const act = (log.action || '').toLowerCase();
      if (act.includes('penilaian') || act.includes('score') || act.includes('hakim') || act.includes('final')) {
        mod = 'Penilaian';
      } else if (act.includes('peserta') || act.includes('kafilah')) {
        mod = 'Peserta';
      } else if (act.includes('babak') || act.includes('stage') || act.includes('qualifier')) {
        mod = 'Babak';
      } else if (act.includes('rubrik') || act.includes('soal') || act.includes('maqra') || act.includes('master')) {
        mod = 'Master Data';
      } else if (act.includes('auth') || act.includes('login') || act.includes('user') || act.includes('superadmin')) {
        mod = 'Autentikasi';
      }

      list.push({
        id: log.id || `audit-${idx}`,
        timestamp: log.timestamp || '-',
        sortOrder: 200000 - idx,
        actorName: log.actor || 'Sistem MTQ',
        actorRole: log.tenantName || currentTenant?.name || 'Operator',
        module: mod,
        action: log.action,
        summary: log.reason ? `${log.summary} (Alasan: ${log.reason})` : log.summary,
        target: log.target,
        outcome
      });
    });

    // 3. From activityLogs (filtered by currentTenant where applicable)
    (activityLogs || [])
      .filter((act) => !act.tenantId || act.tenantId === currentTenant.id)
      .forEach((act, idx) => {
        if (list.some((l) => l.summary === act.description)) return;

        let mod = 'Sistem';
        if (act.type === 'finalized' || act.type === 'annotation' || act.type === 'autosave') {
          mod = 'Penilaian';
        } else if (act.type === 'stage' || act.type === 'qualification') {
          mod = 'Babak';
        } else if (act.type === 'config') {
          mod = 'Master Data';
        }

        list.push({
          id: act.id || `act-${idx}`,
          timestamp: act.timestamp || '-',
          sortOrder: 100000 - idx,
          actorName: act.actorName || 'Admin / Hakim',
          actorRole: currentTenant?.name || 'Panitia',
          module: mod,
          action: act.title,
          summary: act.description,
          target: undefined,
          outcome: 'Success'
        });
      });

    return list.sort((a, b) => b.sortOrder - a.sortOrder);
  }, [auditLogs, activityLogs, notifications, currentTenant]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return normalizedLogs.filter((log) => {
      if (filterOutcome !== 'ALL' && log.outcome !== filterOutcome) return false;
      if (filterModule !== 'ALL' && log.module !== filterModule) return false;
      if (!q) return true;
      return (
        log.actorName.toLowerCase().includes(q) ||
        log.actorRole.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        (log.target && log.target.toLowerCase().includes(q)) ||
        log.module.toLowerCase().includes(q)
      );
    });
  }, [normalizedLogs, searchQuery, filterOutcome, filterModule]);

  // Statistics
  const stats = useMemo(() => {
    const total = normalizedLogs.length;
    const errors = normalizedLogs.filter((l) => l.outcome === 'Error').length;
    const warnings = normalizedLogs.filter((l) => l.outcome === 'Warning').length;
    const success = total - errors - warnings;
    return { total, success, errors, warnings };
  }, [normalizedLogs]);

  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Waktu', 'Aktor', 'Unit/Tenant', 'Modul', 'Aksi', 'Ringkasan', 'Target', 'Status'];
    const rows = filteredLogs.map((l) => [
      `"${l.timestamp}"`,
      `"${l.actorName.replace(/"/g, '""')}"`,
      `"${l.actorRole.replace(/"/g, '""')}"`,
      `"${l.module}"`,
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.summary.replace(/"/g, '""')}"`,
      `"${(l.target || '-').replace(/"/g, '""')}"`,
      `"${l.outcome}"`
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `log_aktivitas_${currentTenant?.name || 'mtq'}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-5 max-w-7xl mx-auto space-y-3.5">
      {/* KPI Stats Cards - Monochrome White & Black per Enterprise Standard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600">Total Log Aktivitas</span>
            <History className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-lg sm:text-xl font-semibold text-slate-900 mt-1.5 font-mono">
            {stats.total}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Seluruh rekaman sistem</p>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600">Aktivitas Berhasil</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-lg sm:text-xl font-semibold text-slate-900 mt-1.5 font-mono">
            {stats.success}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Operasi sukses</p>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600">Peringatan</span>
            <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-lg sm:text-xl font-semibold text-slate-900 mt-1.5 font-mono">
            {stats.warnings}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Perlu perhatian</p>
        </div>

        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600">Error / Ditolak</span>
            <XCircle className="w-3.5 h-3.5 text-slate-400" />
          </div>
          <p className="text-lg sm:text-xl font-semibold text-slate-900 mt-1.5 font-mono">
            {stats.errors}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Penolakan / kegagalan</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex flex-wrap items-center gap-2.5">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Cari aktor, hakim, admin, aksi, sasaran, atau rincian error..."
            className="w-full pl-8 pr-3 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:bg-white transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Status Filter */}
          <select
            value={filterOutcome}
            onChange={(e) => {
              setFilterOutcome(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
          >
            <option value="ALL">Semua Status</option>
            <option value="Success">Hanya Berhasil</option>
            <option value="Warning">Hanya Peringatan</option>
            <option value="Error">Hanya Error / Ditolak</option>
          </select>

          {/* Module Filter */}
          <select
            value={filterModule}
            onChange={(e) => {
              setFilterModule(e.target.value);
              setCurrentPage(1);
            }}
            className="px-2.5 py-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-lg font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
          >
            <option value="ALL">Semua Modul</option>
            <option value="Penilaian">Penilaian</option>
            <option value="Peserta">Peserta & Kafilah</option>
            <option value="Babak">Babak & Hasil</option>
            <option value="Master Data">Master Data & Soal</option>
            <option value="Autentikasi">Autentikasi</option>
            <option value="Sistem">Sistem & Platform</option>
          </select>

          {(searchQuery || filterOutcome !== 'ALL' || filterModule !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterOutcome('ALL');
                setFilterModule('ALL');
                setCurrentPage(1);
              }}
              className="text-[11px] font-medium text-slate-500 hover:text-rose-600 px-2 py-1.5 cursor-pointer transition-colors"
            >
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 shadow-2xs cursor-pointer transition-all"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-emerald-700' : ''}`} />
            <span>Segarkan</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-[11px] font-medium shadow-xs cursor-pointer transition-all"
          >
            <Download className="w-3 h-3" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* Horizontally Scrollable Log Table Without Text Truncation */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                <th className="py-2.5 px-3.5 whitespace-nowrap">Waktu</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Aktor / Pengguna</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Modul</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Aksi / Peristiwa</th>
                <th className="py-2.5 px-3.5 whitespace-nowrap">Rincian Aktivitas</th>
                <th className="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                <th className="py-2.5 px-3.5 text-center whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <History className="w-6 h-6 mx-auto mb-1.5 text-slate-300" />
                    <p className="font-medium text-slate-700 text-xs">Tidak ada riwayat aktivitas</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Belum ada log yang sesuai dengan filter pencarian Anda.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log) => {
                  const isErr = log.outcome === 'Error';
                  const isWarn = log.outcome === 'Warning';

                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/60 transition-colors"
                    >
                      {/* Timestamp */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-mono text-[10px] text-slate-500">
                        {log.timestamp}
                      </td>

                      {/* Actor (plain text without avatar or event subtitle) */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-slate-900">
                        {log.actorName}
                      </td>

                      {/* Module */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                          {log.module}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-slate-900">
                        <span>{log.action}</span>
                        {log.target && (
                          <span className="ml-2 text-[10px] font-mono text-slate-500">
                            (Target: {log.target})
                          </span>
                        )}
                      </td>

                      {/* Summary */}
                      <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 text-[11px]">
                        {log.summary}
                      </td>

                      {/* Outcome Status */}
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        {isErr ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-900 border border-slate-300">
                            <XCircle className="w-2.5 h-2.5 text-slate-700" />
                            <span>{log.outcome}</span>
                          </span>
                        ) : isWarn ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-50 text-slate-800 border border-slate-200">
                            <AlertTriangle className="w-2.5 h-2.5 text-slate-600" />
                            <span>{log.outcome}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-700">
                            {log.outcome}
                          </span>
                        )}
                      </td>

                      {/* Action Column */}
                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-medium text-slate-700 cursor-pointer transition-colors"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>Lihat Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50/50">
            <span>
              Menampilkan {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, filteredLogs.length)} dari {filteredLogs.length} entri
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium cursor-pointer"
              >
                Sebelumnya
              </button>
              <span className="px-2 font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium cursor-pointer"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Lihat Detail Log Aktivitas */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Detail Log Aktivitas</h3>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedLog.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block">
                    Waktu Kejadian
                  </span>
                  <span className="font-mono text-slate-800 font-medium mt-0.5 block">
                    {selectedLog.timestamp}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block">
                    Status
                  </span>
                  <span className="font-medium text-slate-900 mt-0.5 block">
                    {selectedLog.outcome}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block">
                    Aktor / Pengguna
                  </span>
                  <span className="font-medium text-slate-900 mt-0.5 block">
                    {selectedLog.actorName}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block">
                    Modul Sistem
                  </span>
                  <span className="font-medium text-slate-800 mt-0.5 block">
                    {selectedLog.module}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block mb-1">
                  Aksi / Peristiwa
                </span>
                <div className="p-3 rounded-lg border border-slate-200 bg-white font-medium text-slate-900">
                  {selectedLog.action}
                  {selectedLog.target && (
                    <span className="block text-[11px] font-mono text-slate-500 mt-1">
                      Sasaran / Target: {selectedLog.target}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-medium block mb-1">
                  Rincian Lengkap Aktivitas
                </span>
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                  {selectedLog.summary}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium cursor-pointer transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

