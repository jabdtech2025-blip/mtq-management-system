import React, { useState } from 'react';
import {
  Plus,
  CheckCircle2,
  Pencil,
  X,
  AlertCircle
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { CompetitionStage } from '../../types/mtq';
import { getStageCompletion } from '../../services/completion';
import { PageHeader, Card, Badge, Button, Input, Select, Modal } from '../ui';

export const StageManagementView: React.FC = () => {
  const {
    stages,
    addStage,
    updateStage,
    cabangList,
    participants,
    stageParticipations,
    judgeAssignments,
    assessments,
    getParticipantStageQuestions,
    currentTenant
  } = useMtq();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<CompetitionStage | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formOrder, setFormOrder] = useState<number>(stages.length + 1);
  const [formBranch, setFormBranch] = useState(cabangList[0]?.name || '');
  const [formQuota, setFormQuota] = useState<number>(3);
  const [formChampionCount, setFormChampionCount] = useState<number>(3);
  const [formStatus, setFormStatus] = useState<'Menunggu' | 'Aktif' | 'Selesai'>('Menunggu');

  const handleOpenAdd = () => {
    setEditingStage(null);
    setFormName('');
    setFormOrder(stages.length + 1);
    setFormBranch(cabangList[0]?.name || '');
    setFormQuota(3);
    setFormChampionCount(3);
    setFormStatus('Menunggu');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: CompetitionStage) => {
    setEditingStage(s);
    setFormName(s.name);
    setFormOrder(s.order);
    setFormBranch(s.branchName);
    setFormQuota(s.qualificationQuota);
    setFormChampionCount(s.championCount ?? 3);
    setFormStatus(s.status);
    setIsModalOpen(true);
  };

  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    if (editingStage) {
      updateStage(editingStage.id, {
        name: formName,
        order: Number(formOrder),
        branchName: formBranch,
        qualificationQuota: Number(formQuota),
        championCount: Number(formChampionCount) || 3,
        status: formStatus
      });
      setFeedback({ type: 'success', message: `Konfigurasi Babak "${formName}" berhasil diperbarui.` });
    } else {
      addStage({
        name: formName,
        order: Number(formOrder),
        branchName: formBranch,
        status: formStatus,
        qualificationQuota: Number(formQuota),
        championCount: Number(formChampionCount) || 3,
        qualificationMethod: 'top_n',
        isFinalized: false
      });
      setFeedback({ type: 'success', message: `Babak "${formName}" berhasil ditambahkan.` });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Manajemen Babak Musabaqah"
        description={`${currentTenant.name} · Kelola struktur tahapan babak (Penyisihan, Semifinal, Final) dan kuota kelulusan`}
        actions={
          <Button
            variant="primary"
            onClick={handleOpenAdd}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            Tambah Babak
          </Button>
        }
      />

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-lg border flex items-center justify-between text-xs font-semibold shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Tutup pemberitahuan"
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stage Progression Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stages
          .filter((stg) => !currentTenant.id || stg.tenantId === currentTenant.id)
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((stg, idx) => {
            const stageCompletion = getStageCompletion({
              tenantId: currentTenant.id,
              stageId: stg.id,
              stageName: stg.name,
              branchId: stg.branchId,
              branchName: stg.branchName && stg.branchName !== 'Semua Cabang' ? stg.branchName : undefined,
              participations: stageParticipations,
              participants,
              assessments,
              judgeAssignments,
              stageQuestionsGetter: getParticipantStageQuestions
            });
            const totalStage = stageCompletion.totalParticipantsCount;
            const finalizedStage = stageCompletion.completedParticipantsCount;

            return (
              <Card
                key={`${stg.id}-${idx}`}
                className={`flex flex-col justify-between transition-all ${
                  stg.status === 'Aktif'
                    ? 'border-emerald-600 ring-2 ring-emerald-500/10'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-400">
                      TAHAP 0{stg.order}
                    </span>
                    <Badge
                      variant={
                        stg.status === 'Aktif'
                          ? 'success'
                          : stg.status === 'Selesai'
                          ? 'info'
                          : 'neutral'
                      }
                    >
                      {stg.status === 'Aktif' ? 'Sedang Berjalan' : stg.status}
                    </Badge>
                  </div>

                  <h3 className="text-lg font-extrabold text-slate-900 mt-2">
                    Babak {stg.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{stg.branchName}</p>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jumlah Peserta:</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">{totalStage} Peserta</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Penilaian Lengkap:</span>
                      <span className="font-mono tabular-nums font-bold text-emerald-700">
                        {finalizedStage} / {totalStage}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kuota Melaju:</span>
                      <span className="font-mono tabular-nums font-bold text-slate-800">
                        Top {stg.qualificationQuota} Peserta
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jumlah Juara Final:</span>
                      <span className="font-mono tabular-nums font-bold text-slate-800">
                        Juara 1 – {stg.championCount ?? 3}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenEdit(stg)}
                    leftIcon={<Pencil className="w-3.5 h-3.5" />}
                  >
                    Edit Konfigurasi
                  </Button>
                </div>
              </Card>
            );
          })}
      </div>

      {/* Add / Edit Stage Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStage ? 'Edit Konfigurasi Babak' : 'Tambah Babak Baru'}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveStage} className="space-y-4">
          <Input
            label="Nama Babak"
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
            placeholder="Mis. Penyisihan, Semifinal, Final"
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Urutan Babak"
              type="number"
              min={1}
              value={formOrder}
              onChange={(e) => setFormOrder(Number(e.target.value))}
              className="font-mono tabular-nums"
            />
            <Input
              label="Kuota Lolos (Top-N)"
              type="number"
              min={1}
              value={formQuota}
              onChange={(e) => setFormQuota(Number(e.target.value))}
              className="font-mono tabular-nums"
            />
            <Input
              label="Jumlah Juara Final"
              type="number"
              min={1}
              max={10}
              value={formChampionCount}
              onChange={(e) => setFormChampionCount(Number(e.target.value))}
              className="font-mono tabular-nums"
            />
          </div>

          <Select
            label="Cabang Musabaqah"
            value={formBranch}
            onChange={(e) => setFormBranch(e.target.value)}
            required
          >
            {Array.from(
              new Set([
                ...cabangList.map((c) => c.name),
                ...stages.map((s) => s.branchName),
                formBranch
              ].filter(Boolean))
            ).map((br) => (
              <option key={br} value={br}>
                {br}
              </option>
            ))}
          </Select>

          <Select
            label="Status Tahapan"
            value={formStatus}
            onChange={(e) =>
              setFormStatus(e.target.value as 'Menunggu' | 'Aktif' | 'Selesai')
            }
          >
            <option value="Menunggu">Menunggu</option>
            <option value="Aktif">Aktif (Sedang Berjalan)</option>
            <option value="Selesai">Selesai</option>
          </Select>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary">
              Simpan Konfigurasi
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
