import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  lines?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({ lines = 1, className = '', ...rest }) => {
  if (lines > 1) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: lines }).map((_, idx) => (
          <div
            key={idx}
            className={`h-4 bg-slate-200/80 rounded-sm animate-pulse ${
              idx === lines - 1 ? 'w-3/4' : 'w-full'
            } ${className}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`h-4 bg-slate-200/80 rounded-sm animate-pulse ${className}`}
      {...rest}
    />
  );
};
