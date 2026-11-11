import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, ArrowRight } from 'lucide-react';
import { Modal, Button, Textarea } from '../ui';
import { Tenant } from '../../types/mtq';

interface SupervisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenant: Tenant | null;
  onConfirm: (tenantId: string, reason: string) => void;
}

const PRESET_REASONS = [
  'Investigasi kendala penilaian hakim',
  'Audit konfigurasi babak dan kelulusan',
  'Pemeriksaan kepatuhan rubrik cabang lomba',
  'Dukungan teknis darurat penyelenggara'
];

export const SupervisionModal: React.FC<SupervisionModalProps> = ({
  isOpen,
  onClose,
  tenant,
  onConfirm
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESET_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !tenant) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = useCustom ? customReason.trim() : selectedPreset;
    if (!finalReason || finalReason.length < 5) {
      setError('Harap berikan alasan supervisi yang jelas (minimal 5 karakter).');
      return;
    }
    setError(null);
    onConfirm(tenant.id, finalReason);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Supervisi Workspace Tenant"
      maxWidthClass="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Notice Info */}
        <div className="p-3.5 rounded-md bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-purple-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Akses Supervisi Terkendali</p>
            <p className="leading-relaxed text-purple-800">
              Anda akan memasuki workspace operasional penyelenggara{' '}
              <strong className="text-purple-950">{tenant.name}</strong> ({tenant.region || 'Wilayah'}).
              Aktivitas supervisi dicatat secara permanen di Log Audit Platform demi akuntabilitas kepatuhan lomba.
            </p>
          </div>
        </div>

        {/* Preset Reason Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
            Pilih Alasan Supervisi:
          </label>
          <div className="space-y-1.5">
            {PRESET_REASONS.map((preset) => (
              <label
                key={preset}
                className={`flex items-center gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                  !useCustom && selectedPreset === preset
                    ? 'bg-purple-50/80 border-purple-300 font-semibold text-purple-900'
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="supervision_preset"
                  checked={!useCustom && selectedPreset === preset}
                  onChange={() => {
                    setSelectedPreset(preset);
                    setUseCustom(false);
                  }}
                  className="text-purple-800 focus:ring-purple-700"
                />
                <span>{preset}</span>
              </label>
            ))}

            <label
              className={`flex items-center gap-2.5 p-2.5 rounded-md border text-xs cursor-pointer transition-colors ${
                useCustom
                  ? 'bg-purple-50/80 border-purple-300 font-semibold text-purple-900'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="supervision_preset"
                checked={useCustom}
                onChange={() => setUseCustom(true)}
                className="text-purple-800 focus:ring-purple-700"
              />
              <span>Alasan Khusus Lainnya...</span>
            </label>
          </div>
        </div>

        {useCustom && (
          <div className="space-y-1">
            <label className="block text-xs font-bold text-slate-700">
              Catatan Alasan Spesifik:
            </label>
            <Textarea
              rows={3}
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Jelaskan kebutuhan inspeksi teknis atau kendala yang dilaporkan..."
              className="text-xs"
              autoFocus
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-600 font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" size="md" onClick={onClose}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="bg-purple-800 hover:bg-purple-900 border-purple-800"
          >
            <span>Masuk Workspace Tenant</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </Modal>
  );
};
