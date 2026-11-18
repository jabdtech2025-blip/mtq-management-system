import React, { useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, ShieldAlert } from 'lucide-react';
import { Tenant } from '../../types/mtq';

interface SupervisionModalProps {
  tenant: Tenant | null;
  onClose: () => void;
  /** Mencatat supervisi lalu masuk workspace. Modal tetap terbuka bila pencatatan gagal. */
  onConfirm: (tenantId: string, reason: string) => Promise<{ success: boolean; message: string }>;
}

const DEFAULT_REASON = 'Audit operasional dan pemantauan berkas musabaqah';
const MIN_REASON_LENGTH = 5;

/**
 * Konfirmasi masuk Mode Supervisi workspace penyelenggara.
 * Dipakai di semua jalur masuk (Penyelenggara MTQ, Dashboard Platform, Health Check)
 * supaya setiap supervisi punya alasan dan tercatat di audit log penyelenggara itu.
 */
export const SupervisionModal: React.FC<SupervisionModalProps> = ({ tenant, onClose, onConfirm }) => {
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tenant) {
      setReason(DEFAULT_REASON);
      setError('');
      setIsSubmitting(false);
    }
  }, [tenant]);

  if (!tenant) return null;

  const cleanReason = reason.trim();
  const canSubmit = cleanReason.length >= MIN_REASON_LENGTH && !isSubmitting;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError('');
    try {
      const res = await onConfirm(tenant.id, cleanReason);
      if (!res.success) {
        setError(res.message);
        return;
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-xl max-w-lg w-full shadow-lg border border-slate-200 p-6 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Konfirmasi Masuk Mode Supervisi Workspace</h3>
            <p className="text-xs text-slate-500">Superadmin membuka data operasional milik penyelenggara.</p>
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-purple-50/70 border border-purple-200 text-xs text-purple-900 space-y-1.5">
          <p className="font-bold">
            Penyelenggara: {tenant.name}
            {tenant.code ? ` (${tenant.code})` : ''}
          </p>
          <p className="text-slate-600">
            Masuk dan keluar Mode Supervisi dicatat di audit log penyelenggara ini beserta alasannya, dan terlihat
            di Audit Log Platform. Tombol kembali ke panel platform selalu tersedia di bilah atas.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="supervision-reason" className="text-xs font-bold text-slate-700">
            Alasan / Keperluan Supervisi:
          </label>
          <input
            id="supervision-reason"
            type="text"
            value={reason}
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleConfirm();
            }}
            placeholder="Contoh: Audit operasional, pemantauan dewan hakim, atau bantuan teknis"
            className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-600 text-slate-800 font-medium"
          />
          {cleanReason.length > 0 && cleanReason.length < MIN_REASON_LENGTH && (
            <p className="text-[11px] text-slate-500">Alasan minimal {MIN_REASON_LENGTH} karakter.</p>
          )}
        </div>

        {error && (
          <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
            className="px-4 py-2 bg-purple-800 hover:bg-purple-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isSubmitting ? 'Mencatat...' : 'Masuk Mode Supervisi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
