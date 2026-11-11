import React from 'react';
import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = ''
}) => {
  return (
    <div
      className={`py-10 px-6 text-center bg-slate-50/60 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center ${className}`}
    >
      <div className="w-12 h-12 rounded-md bg-white border border-slate-200 shadow-sm text-slate-400 flex items-center justify-center mb-3 [&_svg]:w-6 [&_svg]:h-6">
        {icon || <Inbox className="w-6 h-6" />}
      </div>
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      {description && (
        <p className="text-xs text-slate-500 max-w-md mt-1 leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
