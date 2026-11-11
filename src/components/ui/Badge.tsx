import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'primary';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
  dot?: boolean;
}

const badgeVariantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  primary: 'bg-emerald-800 text-white border-emerald-800'
};

const dotVariantClasses: Record<BadgeVariant, string> = {
  success: 'bg-emerald-600',
  warning: 'bg-amber-500',
  danger: 'bg-rose-600',
  info: 'bg-sky-600',
  neutral: 'bg-slate-500',
  primary: 'bg-emerald-200'
};

/**
 * Helper pemetaan otomatis status domain MTQ ke varian warna semantik Badge.
 */
export function getStatusBadgeVariant(status?: string | null): BadgeVariant {
  if (!status) return 'neutral';
  const normalized = status.toLowerCase().trim();
  if (
    normalized.includes('diverifikasi') ||
    normalized.includes('lolos') ||
    normalized.includes('final') ||
    normalized.includes('juara') ||
    normalized.includes('aktif') ||
    normalized.includes('selesai') ||
    normalized.includes('submitted') ||
    normalized.includes('locked') ||
    normalized.includes('disahkan')
  ) {
    return 'success';
  }
  if (
    normalized.includes('diajukan') ||
    normalized.includes('cadangan') ||
    normalized.includes('menunggu') ||
    normalized.includes('perhatian') ||
    normalized.includes('in_progress') ||
    normalized.includes('sedang')
  ) {
    return 'warning';
  }
  if (
    normalized.includes('ditolak') ||
    normalized.includes('gugur') ||
    normalized.includes('diskualifikasi') ||
    normalized.includes('nonaktif') ||
    normalized.includes('gagal')
  ) {
    return 'danger';
  }
  if (normalized.includes('info') || normalized.includes('berlangsung')) {
    return 'info';
  }
  return 'neutral';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  icon,
  dot = false,
  className = '',
  children,
  ...rest
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm border text-xs font-bold leading-snug shrink-0 ${badgeVariantClasses[variant]} ${className}`}
      {...rest}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotVariantClasses[variant]}`} />}
      {icon && <span className="shrink-0 inline-flex [&_svg]:w-3.5 [&_svg]:h-3.5">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};
