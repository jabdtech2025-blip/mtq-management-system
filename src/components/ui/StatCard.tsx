import React from 'react';

export type StatCardTone = 'emerald' | 'amber' | 'rose' | 'sky' | 'slate';

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatCardTone;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const iconToneClasses: Record<StatCardTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  rose: 'bg-rose-50 text-rose-800 border-rose-200',
  sky: 'bg-sky-50 text-sky-800 border-sky-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200'
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  tone = 'emerald',
  badge,
  onClick,
  className = ''
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-slate-200 p-4 md:p-5 shadow-sm flex items-start justify-between gap-3 transition-all duration-150 ${
        onClick ? 'cursor-pointer hover:border-emerald-400 hover:shadow-md' : ''
      } ${className}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider truncate">
            {label}
          </p>
          {badge}
        </div>
        <p className="text-2xl font-extrabold text-slate-900 font-mono tabular-nums mt-1.5 tracking-tight">
          {value}
        </p>
        {subtitle && <p className="text-xs text-slate-500 mt-1 truncate">{subtitle}</p>}
      </div>
      {icon && (
        <div
          className={`w-10 h-10 rounded-md border flex items-center justify-center shrink-0 [&_svg]:w-5 [&_svg]:h-5 ${iconToneClasses[tone]}`}
        >
          {icon}
        </div>
      )}
    </div>
  );
};
