import React from 'react';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  icon,
  actions,
  className = ''
}) => {
  return (
    <div
      className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-1 ${className}`}
    >
      <div className="flex items-start gap-3.5 min-w-0">
        {icon && (
          <div className="w-11 h-11 rounded-md bg-emerald-800 text-white flex items-center justify-center shadow-sm shrink-0 [&_svg]:w-5 [&_svg]:h-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="text-xs md:text-sm text-slate-600 mt-1 leading-relaxed max-w-3xl">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </div>
  );
};
