import React, { useState } from 'react';
import {
  Download,
  Search,
  AlertCircle,
  Eye,
  X,
  Lock,
  Layers
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Participant } from '../../types/mtq';
import { QURAN_PAGES_DATA } from '../../data/mockData';

export const RekapNilaiView: React.FC = () => {
  const {
    currentTenant,
    participants,
    assessments,
    users
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState('Penyisihan');
  const [selectedKafilah, setSelectedKafilah] = useState('Semua Grup');
  const [selectedStatus, setSelectedStatus] = useState('Semua Status');
  const [inspectedParticipant, setInspectedParticipant] = useState<Participant | null>(null);

  // Grouped Judges
  const judge1 = users.find((u) => u.id === 'judge-1') || users[1];
  const judge2 = users.find((u) => u.id === 'judge-2') || users[2];
  const judge3 = users.find((u) => u.id === 'judge-3') || users[3];

  const filteredParticipants = participants.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lotteryNumber.includes(searchQuery) ||
      p.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStage = selectedStage === 'Semua Babak' || p.stageName === selectedStage;
    const matchesKafilah = selectedKafilah === 'Semua Grup' || p.kafilahName === selectedKafilah;
    const matchesStatus = selectedStatus === 'Semua Status' || p.status === selectedStatus;
    return matchesSearch && matchesStage && matchesKafilah && matchesStatus;
  });

  const getJudgeAssessment = (participantId: string, judgeId: string) => {
    return assessments.find((a) => a.participantId === participantId && a.judgeId === judgeId);
  };

  const handleExportCSV = () => {
    const headers = [
      'No Undian',
      'ID Peserta',
      'Nama Peserta',
      'Grup',
      'Nilai Hakim 1 (Tajwid)',
      'Nilai Hakim 2 (Fasahah)',
      'Nilai Hakim 3 (Lagu)',
      'Rata-rata Akhir',
      'Status'
    ];

    const rows = filteredParticipants.map((p) => {
      const a1 = getJudgeAssessment(p.id, 'judge-1');
      const a2 = getJudgeAssessment(p.id, 'judge-2');
      const a3 = getJudgeAssessment(p.id, 'judge-3');

      const s1 = a1 ? a1.finalScore : null;
      const s2 = a2 ? a2.finalScore : null;
      const s3 = a3 ? a3.finalScore : null;

      const validScores = [s1, s2, s3].filter((s): s is number => s !== null);
      const avg =
        validScores.length > 0
          ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)
          : '-';

      return [
        p.lotteryNumber,
        p.participantId,
        `"${p.name}"`,
        `"${p.kafilahName}"`,
        s1?.toFixed(2) || '-',
        s2?.toFixed(2) || '-',
        s3?.toFixed(2) || '-',
        avg,
        p.status
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_mtq_${currentTenant.code}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header matching screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900">Rekap Nilai Real-Time</h1>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Matriks Live
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.eventName} · Babak {selectedStage} · Cabang Tilawah Dewasa
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar (clean without redundant label titles) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor undian, nama peserta, atau grup..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        {/* Clean dropdown selects without redundant text labels */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            <option value="Semua Babak">Semua Babak</option>
            <option value="Penyisihan">Babak Penyisihan</option>
            <option value="Final">Babak Final</option>
          </select>

          <select
            value={selectedKafilah}
            onChange={(e) => setSelectedKafilah(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            <option value="Semua Grup">Semua Grup</option>
            <option value="Kota Bandung">Kota Bandung</option>
            <option value="Kabupaten Bogor">Kabupaten Bogor</option>
            <option value="Kota Tasikmalaya">Kota Tasikmalaya</option>
            <option value="Kabupaten Cirebon">Kabupaten Cirebon</option>
            <option value="Kota Bekasi">Kota Bekasi</option>
            <option value="Kabupaten Garut">Kabupaten Garut</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            <option value="Semua Status">Semua Status</option>
            <option value="Berlangsung">Status: Berlangsung</option>
            <option value="Final">Status: Final</option>
            <option value="Menunggu">Status: Menunggu</option>
          </select>

          <span className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-50 border border-slate-100 rounded-md">
            {filteredParticipants.length} Peserta
          </span>
        </div>
      </div>

      {/* Yellow Alert Box */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3.5 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
          <p className="text-slate-700">
            Nilai berstatus <span className="font-semibold text-amber-700">Berlangsung</span> masih
            provisional dan belum menjadi hasil resmi.
          </p>
        </div>
        <span className="text-[11px] font-semibold text-slate-500">
          Format Standar Penilaian LPTQ
        </span>
      </div>

      {/* Consistent Sizing Grouped Header Recapitulation Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs table-fixed min-w-[1080px]">
            {/* Explicit Consistent Column Widths */}
            <colgroup>
              <col className="w-14" />
              <col className="w-24" />
              <col className="w-44" />
              <col className="w-36" />
              <col className="w-16" />
              <col className="w-16" />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-20" />
              <col className="w-24" />
              <col className="w-16" />
            </colgroup>
            <thead>
              {/* Row 1: High Level Categories */}
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                <th colSpan={4} className="py-3 px-3 border-r border-slate-200">
                  Identitas Peserta Musabaqah
                </th>
                <th colSpan={4} className="py-3 px-3 border-r border-slate-200 text-center bg-slate-100/60">
                  <div className="truncate">Hakim 1 — Tajwid & Makhraj</div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    {judge1.name}
                  </div>
                </th>
                <th colSpan={3} className="py-3 px-3 border-r border-slate-200 text-center">
                  <div className="truncate">Hakim 2 — Fasahah & Waqf</div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    {judge2.name}
                  </div>
                </th>
                <th colSpan={2} className="py-3 px-3 text-center bg-slate-100/60">
                  <div className="truncate">Hakim 3 — Lagu & Suara</div>
                  <div className="text-[10px] text-slate-400 font-normal truncate">
                    {judge3.name}
                  </div>
                </th>
                <th rowSpan={2} className="py-3 px-2 text-center border-l border-slate-200 bg-emerald-50/50 text-emerald-900 font-bold">
                  Total Rata²
                </th>
                <th rowSpan={2} className="py-3 px-2 text-center border-l border-slate-200">
                  Aksi
                </th>
              </tr>
              {/* Row 2: Sub-columns */}
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <th className="py-2.5 px-2 text-center">No</th>
                <th className="py-2.5 px-3">ID Peserta</th>
                <th className="py-2.5 px-3">Nama Peserta</th>
                <th className="py-2.5 px-3 border-r border-slate-200">Grup</th>

                {/* Hakim 1 */}
                <th className="py-2.5 px-2 text-center">Makhraj</th>
                <th className="py-2.5 px-2 text-center">Idgham</th>
                <th className="py-2.5 px-2 text-center">Tajwid</th>
                <th className="py-2.5 px-2 text-center font-bold text-emerald-800 border-r border-slate-200 bg-emerald-50/30">
                  Nilai H1
                </th>

                {/* Hakim 2 */}
                <th className="py-2.5 px-2 text-center">Fasahah</th>
                <th className="py-2.5 px-2 text-center">Waqf</th>
                <th className="py-2.5 px-2 text-center font-bold text-emerald-800 border-r border-slate-200 bg-emerald-50/30">
                  Nilai H2
                </th>

                {/* Hakim 3 */}
                <th className="py-2.5 px-2 text-center">Lagu</th>
                <th className="py-2.5 px-2 text-center font-bold text-emerald-800 bg-emerald-50/30">
                  Nilai H3
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredParticipants.map((p) => {
                const a1 = getJudgeAssessment(p.id, 'judge-1');
                const a2 = getJudgeAssessment(p.id, 'judge-2');
                const a3 = getJudgeAssessment(p.id, 'judge-3');

                const mkh1 = a1?.errorCounts['cat-mkh'] ?? '-';
                const idg1 = a1?.errorCounts['cat-idg'] ?? '-';
                const tjw1 = a1?.errorCounts['cat-tjw'] ?? '-';
                const score1 = a1 ? a1.finalScore.toFixed(2) : '-';

                const fsh2 = a2?.errorCounts['cat-fsh'] ?? '-';
                const wqf2 = a2?.errorCounts['cat-fsh'] ? 1 : a2 ? 0 : '-';
                const score2 = a2 ? a2.finalScore.toFixed(2) : '-';

                const lag3 = a3?.errorCounts['cat-lag'] ?? '-';
                const score3 = a3 ? a3.finalScore.toFixed(2) : '-';

                // Calculate average
                const validScores = [a1?.finalScore, a2?.finalScore, a3?.finalScore].filter(
                  (s): s is number => typeof s === 'number'
                );
                const avgScore =
                  validScores.length > 0
                    ? (validScores.reduce((acc, cur) => acc + cur, 0) / validScores.length).toFixed(2)
                    : '-';

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-2 text-center font-bold font-mono text-slate-900">
                      {p.lotteryNumber}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-800 truncate">
                      {p.participantId}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900 truncate" title={p.name}>
                      {p.name}
                    </td>
                    <td className="py-3 px-3 text-slate-600 border-r border-slate-200 truncate" title={p.kafilahName}>
                      {p.kafilahName}
                    </td>

                    {/* H1 Scores */}
                    <td className="py-3 px-2 text-center font-mono">{mkh1}</td>
                    <td className="py-3 px-2 text-center font-mono">{idg1}</td>
                    <td className="py-3 px-2 text-center font-mono">{tjw1}</td>
                    <td className="py-3 px-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20 border-r border-slate-200">
                      {score1}
                    </td>

                    {/* H2 Scores */}
                    <td className="py-3 px-2 text-center font-mono">{fsh2}</td>
                    <td className="py-3 px-2 text-center font-mono">{wqf2}</td>
                    <td className="py-3 px-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20 border-r border-slate-200">
                      {score2}
                    </td>

                    {/* H3 Scores */}
                    <td className="py-3 px-2 text-center font-mono">{lag3}</td>
                    <td className="py-3 px-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/20">
                      {score3}
                    </td>

                    {/* Final Average */}
                    <td className="py-3 px-2 text-center font-mono font-extrabold text-sm text-slate-900 bg-emerald-50/30 border-l border-slate-200">
                      {avgScore}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-2 text-center border-l border-slate-200">
                      <button
                        onClick={() => setInspectedParticipant(p)}
                        className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="Inspeksi Snapshot & Anotasi Mushaf"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail Snapshot & Audit Anotasi */}
      {inspectedParticipant && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {inspectedParticipant.participantId}
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {inspectedParticipant.name} · Kafilah {inspectedParticipant.kafilahName}
                </h3>
                <p className="text-xs text-slate-500">
                  {inspectedParticipant.branchName} · {inspectedParticipant.assignedMaqra}
                </p>
              </div>
              <button
                onClick={() => setInspectedParticipant(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-xs">
                Rincian Penilaian Dewan Hakim (Snapshot Audit)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { judge: judge1, asm: getJudgeAssessment(inspectedParticipant.id, 'judge-1') },
                  { judge: judge2, asm: getJudgeAssessment(inspectedParticipant.id, 'judge-2') },
                  { judge: judge3, asm: getJudgeAssessment(inspectedParticipant.id, 'judge-3') }
                ].map(({ judge, asm }, idx) => (
                  <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                    <p className="font-bold text-slate-900">{judge.name}</p>
                    <p className="text-[11px] text-slate-500">{judge.judgeField}</p>
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                      <span className="text-slate-500">Skor Akhir:</span>
                      <span className="font-mono font-bold text-base text-emerald-700">
                        {asm ? asm.finalScore.toFixed(2) : '--'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Pengurangan:</span>
                      <span className="font-mono font-bold text-rose-600">
                        -{asm ? asm.totalDeductions.toFixed(2) : '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">Anotasi Mushaf:</span>
                      <span className="font-semibold text-slate-700">
                        {asm ? asm.annotations.length : 0} goresan
                      </span>
                    </div>
                    <div className="pt-1 text-[11px] text-slate-400">
                      Status: {asm?.status === 'finalized' ? '🔒 Final/Terkunci' : 'Sedang Berlangsung'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mushaf Page preview indicator */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30">
                <p className="font-bold text-emerald-900">Lembar Mushaf Yang Dinilai:</p>
                <p className="text-slate-600 mt-1">
                  Halaman {inspectedParticipant.pageNumber} — Rasm Utsmani Riwayat Hafs 'an 'Ashim.
                  Coretan dan tanda penanda dewan hakim tersimpan aman dalam snapshot transaksional.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setInspectedParticipant(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Tutup Inspeksi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
