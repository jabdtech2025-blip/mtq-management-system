import React, { useState, useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  Lock,
  ChevronRight,
  Users,
  Trophy,
  X,
  FileCheck2,
  RefreshCw
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Participant } from '../../types/mtq';

export const HasilKelulusanView: React.FC = () => {
  const {
    currentTenant,
    participants,
    assessments,
    stages,
    judgeAssignments,
    users,
    getParticipantProgress,
    advanceQualifiers,
    setCurrentView
  } = useMtq();

  // Active stage selector
  const [selectedStageName, setSelectedStageName] = useState<string>('Penyisihan');

  // Next stage target
  const currentStage = stages.find((s) => s.name === selectedStageName) || stages[0];
  const nextStage = stages
    .filter((s) => s.order > (currentStage?.order || 0))
    .sort((a, b) => a.order - b.order)[0] || null;

  // Manual overrides state: { [participantId]: boolean } and reasons { [participantId]: string }
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [overrideModalParticipant, setOverrideModalParticipant] = useState<Participant | null>(null);
  const [tempReasonText, setTempReasonText] = useState('');
  const [tempOverrideValue, setTempOverrideValue] = useState(true);

  // Confirmation modal
  const [isConfirmAdvancementOpen, setIsConfirmAdvancementOpen] = useState(false);
  const [advancementSuccessMessage, setAdvancementSuccessMessage] = useState('');

  // Active stage participants
  const stageParticipants = useMemo(() => {
    return participants.filter((p) => p.stageName === selectedStageName);
  }, [participants, selectedStageName]);

  // Active judges for this stage
  const stageJudges = useMemo(() => {
    const assigned = judgeAssignments.filter((ja) => ja.stageName === selectedStageName);
    if (assigned.length > 0) {
      return assigned.map((ja) => ja.judgeId);
    }
    return users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id).map((u) => u.id);
  }, [judgeAssignments, selectedStageName, users, currentTenant.id]);

  // Compute ranking and completion
  const rankedParticipants = useMemo(() => {
    return stageParticipants
      .map((p) => {
        const pAssessments = stageJudges.map((jId) =>
          assessments.find((a) => a.participantId === p.id && a.judgeId === jId)
        );

        const validScores = pAssessments
          .filter((a): a is NonNullable<typeof a> => !!a)
          .map((a) => a.finalScore);

        const isFullyFinalized =
          pAssessments.length === stageJudges.length &&
          pAssessments.every((a) => a?.status === 'finalized') &&
          stageJudges.length > 0;

        const averageScore =
          validScores.length > 0
            ? Number((validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2))
            : 0;

        const progress = getParticipantProgress(p.id, selectedStageName);

        return {
          participant: p,
          averageScore,
          isFullyFinalized,
          progress,
          judgeCount: validScores.length
        };
      })
      .sort((a, b) => b.averageScore - a.averageScore);
  }, [stageParticipants, stageJudges, assessments, getParticipantProgress, selectedStageName]);

  // Quota configuration
  const quota = currentStage?.qualificationQuota || 3;

  // Determine qualification status (Top-N + manual overrides)
  const evaluatedParticipants = useMemo(() => {
    return rankedParticipants.map((item, index) => {
      const rank = index + 1;
      const isOverridden = manualOverrides[item.participant.id] !== undefined;
      const qualified = isOverridden
        ? manualOverrides[item.participant.id]
        : rank <= quota;

      return {
        ...item,
        rank,
        isQualified: qualified,
        isOverridden,
        overrideReason: overrideReasons[item.participant.id] || ''
      };
    });
  }, [rankedParticipants, quota, manualOverrides, overrideReasons]);

  // Check if any tie exists on the boundary of quota
  const hasBoundaryTie = useMemo(() => {
    if (rankedParticipants.length <= quota) return false;
    const boundaryScore = rankedParticipants[quota - 1]?.averageScore;
    const nextScore = rankedParticipants[quota]?.averageScore;
    return boundaryScore !== undefined && nextScore !== undefined && boundaryScore === nextScore && boundaryScore > 0;
  }, [rankedParticipants, quota]);

  // Check if all participants in the stage are finalized
  const allAssessmentsFinalized = useMemo(() => {
    if (stageParticipants.length === 0) return false;
    return rankedParticipants.every((item) => item.isFullyFinalized);
  }, [stageParticipants.length, rankedParticipants]);

  const qualifiedParticipants = evaluatedParticipants.filter((p) => p.isQualified);

  // Manual Override Handler
  const handleOpenOverride = (p: Participant, currentQualified: boolean) => {
    setOverrideModalParticipant(p);
    setTempOverrideValue(!currentQualified);
    setTempReasonText(overrideReasons[p.id] || '');
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModalParticipant || !tempReasonText) return;

    setManualOverrides((prev) => ({
      ...prev,
      [overrideModalParticipant.id]: tempOverrideValue
    }));
    setOverrideReasons((prev) => ({
      ...prev,
      [overrideModalParticipant.id]: tempReasonText
    }));

    setOverrideModalParticipant(null);
  };

  const handleResetOverride = (participantId: string) => {
    setManualOverrides((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
    setOverrideReasons((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
  };

  // Confirm Advancement to Next Stage
  const handleConfirmAdvancement = () => {
    if (!nextStage) return;

    const qualifiedIds = qualifiedParticipants.map((item) => item.participant.id);
    advanceQualifiers(selectedStageName, nextStage.name, qualifiedIds, overrideReasons);

    setIsConfirmAdvancementOpen(false);
    setAdvancementSuccessMessage(
      `Selamat! ${qualifiedIds.length} peserta resmi diloloskan ke Babak ${nextStage.name}. Rekam jejak peserta telah diperbarui.`
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Hasil Babak & Kelulusan (Kualifikasi)
            </h1>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Alur Kompetisi Bertingkat
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.name} · Verifikasi penilaian juri, penetapan peringkat, dan pelolosan peserta ke babak berikutnya
          </p>
        </div>

        {/* Stage Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold text-slate-600 hidden sm:inline">Pilih Babak:</label>
          <select
            value={selectedStageName}
            onChange={(e) => {
              setSelectedStageName(e.target.value);
              setAdvancementSuccessMessage('');
            }}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 bg-white shadow-xs"
          >
            {stages.map((stg) => (
              <option key={stg.id} value={stg.name}>
                Babak {stg.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {advancementSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <p className="font-semibold">{advancementSuccessMessage}</p>
          </div>
          <button
            onClick={() => setAdvancementSuccessMessage('')}
            className="p-1 text-emerald-700 hover:text-emerald-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Status Penilaian */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Status Penilaian Babak</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {stageParticipants.filter((p) => p.status === 'Final').length} / {stageParticipants.length}
            </span>
            <span className="text-xs text-slate-500">Peserta Final</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {allAssessmentsFinalized ? (
              <span className="text-emerald-700 font-semibold">Seluruh penilaian dewan juri lengkap</span>
            ) : (
              <span className="text-amber-700 font-semibold">Terdapat penilaian yang belum difinalisasi</span>
            )}
          </p>
        </div>

        {/* Card 2: Kuota Kualifikasi */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Kuota Kelulusan Babak</span>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              Top {quota}
            </span>
            <span className="text-xs text-slate-500">Peserta Terbaik</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Target melaju ke: <strong>{nextStage ? `Babak ${nextStage.name}` : 'Juara Akhir'}</strong>
          </p>
        </div>

        {/* Card 3: Peserta Lolos */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Calon Peserta Lolos</span>
            <Users className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-emerald-800 font-mono">
              {qualifiedParticipants.length}
            </span>
            <span className="text-xs text-slate-500">Peserta Terpilih</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {Object.keys(manualOverrides).length > 0
              ? `${Object.keys(manualOverrides).length} peserta disesuaikan (override)`
              : 'Sesuai peringkat otomatis'}
          </p>
        </div>
      </div>

      {/* Tie Alert Notice */}
      {hasBoundaryTie && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-sm">Perhatian: Nilai Seri pada Batas Kuota Kelulusan!</p>
            <p className="mt-1 leading-relaxed">
              Terdapat nilai rata-rata yang sama persis antara peserta di batas peringkat kelulusan (Top {quota}). Sistem tidak secara sepihak memotong peserta. Silakan gunakan tombol <strong>Override Kualifikasi</strong> dengan mencantumkan catatan hasil rapat dewan hakim.
            </p>
          </div>
        </div>
      )}

      {/* Qualification Results Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">
              Peringkat & Kualifikasi Peserta Babak {selectedStageName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Urutan berdasarkan rata-rata nilai dewan juri cabang {currentStage?.branchName}
            </p>
          </div>

          {/* Action to confirm advancement */}
          {nextStage && (
            <button
              onClick={() => setIsConfirmAdvancementOpen(true)}
              className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>Konfirmasi & Loloskan ke Babak {nextStage.name}</span>
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                <th className="px-5 py-3 w-16 text-center">Rank</th>
                <th className="px-4 py-3 w-20">Undian</th>
                <th className="px-5 py-3">Nama Peserta & Grup</th>
                <th className="px-4 py-3 text-right">Nilai Rata-Rata</th>
                <th className="px-4 py-3 text-center">Kelengkapan Juri</th>
                <th className="px-4 py-3 text-center">Status Kelulusan</th>
                <th className="px-5 py-3 text-right">Aksi Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluatedParticipants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Belum ada peserta di babak {selectedStageName}.
                  </td>
                </tr>
              ) : (
                evaluatedParticipants.map((item) => {
                  const p = item.participant;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        item.isQualified ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* Rank */}
                      <td className="px-5 py-3.5 text-center font-mono font-extrabold text-sm">
                        {item.rank <= 3 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-900 font-bold text-xs">
                            {item.rank}
                          </span>
                        ) : (
                          <span className="text-slate-500">#{item.rank}</span>
                        )}
                      </td>

                      {/* Lottery */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        #{p.lotteryNumber}
                      </td>

                      {/* Participant identity */}
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-900">{p.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {p.participantId} · {p.kafilahName}
                        </p>
                        {item.isOverridden && (
                          <p className="text-[10px] text-amber-700 font-medium mt-0.5 italic">
                            Catatan Override: {item.overrideReason}
                          </p>
                        )}
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3.5 text-right font-mono font-extrabold text-sm text-slate-900">
                        {item.averageScore.toFixed(2)}
                      </td>

                      {/* Completeness */}
                      <td className="px-4 py-3.5 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.isFullyFinalized
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {item.judgeCount} / {stageJudges.length} Juri
                        </span>
                      </td>

                      {/* Qualification status badge */}
                      <td className="px-4 py-3.5 text-center">
                        {item.isQualified ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-800 text-white font-bold text-[11px] px-2.5 py-0.5 rounded-full shadow-2xs">
                            <Check className="w-3 h-3" />
                            <span>Lolos</span>
                          </span>
                        ) : (
                          <span className="inline-block bg-slate-100 text-slate-500 text-[11px] font-medium px-2 py-0.5 rounded-full">
                            Tidak Lolos
                          </span>
                        )}
                      </td>

                      {/* Manual Override Action */}
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleOpenOverride(p, item.isQualified)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-emerald-800 hover:bg-slate-100 rounded-lg border border-slate-200"
                        >
                          {item.isQualified ? 'Gugurkan' : 'Loloskan'}
                        </button>
                        {item.isOverridden && (
                          <button
                            onClick={() => handleResetOverride(p.id)}
                            className="p-1 text-slate-400 hover:text-rose-700 rounded"
                            title="Reset Override ke Peringkat Asli"
                          >
                            <RefreshCw className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Override Dialog with Mandatory Reason */}
      {overrideModalParticipant && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-2">
              Penyesuaian Kualifikasi (Manual Override)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Ubah status kelulusan peserta <strong>{overrideModalParticipant.name}</strong> secara manual. Alasan resmi keputusan dewan juri wajib diisi.
            </p>

            <form onSubmit={handleSaveOverride} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Status Kelulusan Baru:
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTempOverrideValue(true)}
                    className={`flex-1 py-2 rounded-lg font-bold border ${
                      tempOverrideValue
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Lolos ke Babak Berikutnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempOverrideValue(false)}
                    className={`flex-1 py-2 rounded-lg font-bold border ${
                      !tempOverrideValue
                        ? 'bg-rose-800 text-white border-rose-800'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Tidak Lolos
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Alasan / Berita Acara Dewan Hakim (Wajib):
                </label>
                <textarea
                  value={tempReasonText}
                  onChange={(e) => setTempReasonText(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  placeholder="Contoh: Keputusan sidang pleno dewan hakim memenangkan tajwid jali pada poin seri..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setOverrideModalParticipant(null)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  Simpan Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Advance Qualifiers to Next Stage */}
      {isConfirmAdvancementOpen && nextStage && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-emerald-800 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5 text-emerald-800" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Konfirmasi Pelolosan Babak
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedStageName} ➔ Babak {nextStage.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Sebanyak <strong>{qualifiedParticipants.length} peserta</strong> di bawah ini akan diloloskan ke <strong>Babak {nextStage.name}</strong>:
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1 mb-4 text-xs">
              {qualifiedParticipants.map((item, idx) => (
                <div key={item.participant.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="font-semibold text-slate-900">
                    {idx + 1}. #{item.participant.lotteryNumber} {item.participant.name}
                  </span>
                  <span className="font-mono text-emerald-800 font-bold">
                    {item.averageScore.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-5">
              Peserta yang lolos akan memasuki Babak {nextStage.name} dengan paket maqra dan lembar penilaian baru. Rekam jejak babak sebelumnya tetap tersimpan rapi.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsConfirmAdvancementOpen(false)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAdvancement}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                Ya, Loloskan Peserta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
