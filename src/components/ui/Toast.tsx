import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'warning' | 'danger' | 'info';

export interface ToastProps {
  variant?: ToastVariant;
  title?: React.ReactNode;
  message: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

const toastStyles: Record<ToastVariant, string> = {
  success: 'bg-emerald-50 border-emerald-200 text-emerald-950',
  warning: 'bg-amber-50 border-amber-200 text-amber-950',
  danger: 'bg-rose-50 border-rose-200 text-rose-950',
  info: 'bg-sky-50 border-sky-200 text-sky-950'
};

export const Toast: React.FC<ToastProps> = ({
  variant = 'info',
  title,
  message,
  action,
  onClose,
  className = ''
}) => {
  const icon =
    variant === 'success' ? (
      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
    ) : variant === 'warning' ? (
      <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
    ) : variant === 'danger' ? (
      <XCircle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
    ) : (
      <Info className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" />
    );

  return (
    <div
      role="status"
      aria-live="polite"
      className={`p-3.5 rounded-md border shadow-md flex items-start justify-between gap-3 ${toastStyles[variant]} ${className}`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {icon}
        <div className="min-w-0 text-xs leading-relaxed">
          {title && <p className="font-bold text-sm mb-0.5">{title}</p>}
          <div>{message}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {action}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pemberitahuan"
            className="p-1 rounded-sm hover:bg-black/5 text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
