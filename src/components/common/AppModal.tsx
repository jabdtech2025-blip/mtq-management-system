import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  maxWidthClass?: string;
  isBusy?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  headerBgClass?: string;
}

/**
 * Komponen Modal Standar & Reusable untuk seluruh modul MTQ Management System.
 * - Mendukung aksesibilitas (role="dialog", aria-modal="true", tombol Escape)
 * - Body scrollable dengan max-h-[90vh] agar tidak terpotong di layar laptop/tablet
 * - Sticky header & sticky footer
 * - Proteksi penutupan saat proses async (isBusy) sedang berjalan
 */
export const AppModal: React.FC<AppModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-lg',
  isBusy = false,
  footer,
  children,
  headerBgClass = 'bg-slate-50',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isBusy, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-slate-200 w-full ${maxWidthClass} max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200`}
      >
        {/* Sticky Header */}
        <div
          className={`px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 ${headerBgClass}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-base truncate">{title}</h3>
              {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!isBusy) onClose();
            }}
            disabled={isBusy}
            aria-label="Tutup modal"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1">{children}</div>

        {/* Sticky Footer */}
        {footer && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
