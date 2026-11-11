import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({ items, activeTab, onChange, className = '' }) => {
  return (
    <div
      role="tablist"
      className={`inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-md ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === activeTab;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-sm text-xs font-bold transition-all duration-150 ease-out cursor-pointer select-none disabled:opacity-50 disabled:cursor-not-allowed ${
              isActive
                ? 'bg-white text-emerald-900 shadow-sm border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50 border border-transparent'
            }`}
          >
            {item.icon && <span className="[&_svg]:w-4 [&_svg]:h-4 shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded-sm text-xs font-mono tabular-nums ${
                  isActive ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
