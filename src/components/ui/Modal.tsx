import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
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
 * Komponen Modal / Dialog Aksesibel:
 * - role="dialog" & aria-modal="true"
 * - Fokus terkunci (focus trap) di dalam modal saat terbuka
 * - Tutup dengan tombol Escape
 * - Overlay menggunakan .surface-glass-dark (dengan fallback solid)
 * - Radius --radius-xl (20px) dan bayangan --shadow-lg
 */
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-lg',
  isBusy = false,
  footer,
  children,
  headerBgClass = 'bg-slate-50'
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  useEffect(() => {
    if (!isOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus();
      }
    };
  }, [isOpen, isBusy, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center surface-glass-dark p-4 transition-opacity duration-200 ease-out"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={`bg-white rounded-xl shadow-lg border border-slate-200 w-full ${maxWidthClass} max-h-[90vh] flex flex-col overflow-hidden transition-transform duration-200 ease-out`}
      >
        {/* Sticky Header */}
        <div
          className={`px-4 py-3.5 md:px-6 md:py-4 border-b border-slate-100 flex items-center justify-between shrink-0 ${headerBgClass}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 id={titleId} className="font-bold text-slate-900 text-base truncate">
                {title}
              </h3>
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
            className="text-slate-400 hover:text-slate-600 p-2 rounded-sm hover:bg-slate-200/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 md:p-6 overflow-y-auto flex-1">{children}</div>

        {/* Sticky Footer */}
        {footer && (
          <div className="px-4 py-3.5 md:px-6 md:py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Dialog = Modal;
