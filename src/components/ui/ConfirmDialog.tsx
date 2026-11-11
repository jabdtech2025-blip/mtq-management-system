import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  isLoading?: boolean;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  variant = 'danger',
  isLoading = false,
  children
}) => {
  const icon =
    variant === 'primary' ? (
      <div className="w-10 h-10 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center">
        <ShieldCheck className="w-5 h-5" />
      </div>
    ) : (
      <div
        className={`w-10 h-10 rounded-md flex items-center justify-center ${
          variant === 'danger' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
        }`}
      >
        <AlertTriangle className="w-5 h-5" />
      </div>
    );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={icon}
      maxWidthClass="max-w-md"
      isBusy={isLoading}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
        <div>{description}</div>
        {children}
      </div>
    </Modal>
  );
};
