import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CloudOff, RefreshCw, Trash2, Clock, CheckCircle2 } from 'lucide-react';
import { Modal, Button } from '../ui';
import { useMtq } from '../../context/MtqContext';
import { friendlySyncError, OutboxRecord } from '../../services/outboxSyncService';
import { formatTimestampDisplay } from '../../utils/dateTime';

/**
 * Jendela "Gagal Menyinkronkan": daftar perubahan yang belum terkirim ke server beserta alasannya.
 * Pengguna dapat memilih: Coba lagi, Buang perubahan ini, atau Nanti saja.
 * Terbuka otomatis bila ada perubahan yang DITOLAK server, dan bisa dibuka dari lencana di header.
 */
export const SyncIssuesModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { outboxSummary, retryOutboxItem, discardOutboxItems } = useMtq();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<{ ids: string[]; label: string } | null>(null);

  const items = outboxSummary.items.filter((i) => i.status !== 'synced');
  const rejected = items.filter((i) => i.status === 'rejected');
  const waiting = items.filter((i) => i.status !== 'rejected');

  const statusInfo = (item: OutboxRecord) => {
    if (item.status === 'rejected') return { text: 'Ditolak server', cls: 'bg-rose-50 text-rose-800 border-rose-200' };
    if (item.status === 'syncing') return { text: 'Sedang dikirim', cls: 'bg-sky-50 text-sky-800 border-sky-200' };
    if (item.status === 'failed') return { text: 'Menunggu jaringan', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
    return { text: 'Menunggu dikirim', cls: 'bg-slate-50 text-slate-700 border-slate-200' };
  };

  const handleRetry = async (id: string) => {
    setBusyId(id);
    try {
      await retryOutboxItem(id);
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscard = async (ids: string[]) => {
    setBusyId(ids.length === 1 ? ids[0] : 'all');
    try {
      await discardOutboxItems(ids);
      setConfirmDiscard(null);
    } finally {
      setBusyId(null);
    }
  };

  const title =
    rejected.length > 0
      ? `Gagal menyinkronkan ${rejected.length} perubahan`
      : items.length > 0
        ? `${items.length} perubahan belum terkirim`
        : 'Semua perubahan sudah tersimpan';

  // Dirender lewat portal ke <body>: header memakai efek kaca (backdrop-filter) yang membuat elemen
  // `position: fixed` di dalamnya terpotong seukuran header. Portal membuat jendela tampil penuh layar.
  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={
        rejected.length > 0
          ? 'Server menolak perubahan berikut. Pilih tindakan agar aplikasi kembali berjalan normal.'
          : items.length > 0
            ? 'Perubahan disimpan di perangkat ini dan dikirim otomatis saat tersambung.'
            : 'Seluruh perubahan sudah tersimpan di server.'
      }
      icon={
        <div
          className={`w-9 h-9 rounded-md flex items-center justify-center ${
            rejected.length > 0
              ? 'bg-rose-100 text-rose-700'
              : items.length > 0
                ? 'bg-amber-100 text-amber-700'
                : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {rejected.length > 0 ? (
            <AlertTriangle className="w-4 h-4" />
          ) : items.length > 0 ? (
            <CloudOff className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
        </div>
      }
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {rejected.length > 1 ? (
            <Button
              variant="danger"
              size="sm"
              disabled={busyId !== null}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() =>
                setConfirmDiscard({
                  ids: rejected.map((r) => r.id),
                  label: `${rejected.length} perubahan yang ditolak server`
                })
              }
            >
              Buang semua yang ditolak
            </Button>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={onClose}>
            {items.length > 0 ? 'Nanti saja' : 'Tutup'}
          </Button>
        </div>
      }
    >
      {confirmDiscard ? (
        <div className="space-y-4" role="alertdialog" aria-labelledby="konfirmasi-buang-judul">
          <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-900 space-y-1.5">
            <p id="konfirmasi-buang-judul" className="m-0 font-semibold">
              Buang {confirmDiscard.label}?
            </p>
            <p className="m-0 text-rose-800 leading-relaxed">
              Perubahan ini <strong>tidak akan tersimpan di server</strong> dan akan dihapus dari perangkat ini. Lembar
              penilaian akan dimuat ulang sesuai data di server.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmDiscard(null)} disabled={busyId !== null}>
              Batal
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleDiscard(confirmDiscard.ids)}
              disabled={busyId !== null}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Ya, buang
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-600">Tidak ada perubahan yang menunggu dikirim.</p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-2.5" aria-label="Perubahan yang belum terkirim">
          {[...rejected, ...waiting].map((item) => {
            const st = statusInfo(item);
            const isBusy = busyId === item.id || item.status === 'syncing';
            return (
              <li key={item.id} className="p-3.5 rounded-lg border border-slate-200 bg-white space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold text-slate-900">{item.entityLabel}</p>
                    <p className="m-0 mt-0.5 text-xs text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      {formatTimestampDisplay(item.createdAt)}
                      {item.retryCount > 0 ? ` · ${item.retryCount}× dicoba` : ''}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>
                    {st.text}
                  </span>
                </div>
                {item.lastError && (
                  <p className="m-0 text-xs leading-relaxed text-slate-700 bg-slate-50 border border-slate-200 rounded-md p-2">
                    {friendlySyncError(item.lastError)}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isBusy || busyId !== null}
                    leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />}
                    onClick={() => void handleRetry(item.id)}
                  >
                    Coba lagi
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={isBusy || busyId !== null}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => setConfirmDiscard({ ids: [item.id], label: `perubahan "${item.entityLabel}"` })}
                  >
                    Buang perubahan ini
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>,
    document.body
  );
};
