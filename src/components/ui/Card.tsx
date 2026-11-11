import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  noPadding = false,
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden ${
        noPadding ? '' : 'p-4 md:p-6'
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};

export interface CardHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  icon,
  action,
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={`px-4 py-3.5 md:px-6 md:py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 ${className}`}
      {...rest}
    >
      {children ? (
        children
      ) : (
        <>
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0">
              {title && <h3 className="text-base font-bold text-slate-900 truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
        </>
      )}
    </div>
  );
};

export const CardBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...rest
}) => {
  return (
    <div className={`p-4 md:p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...rest
}) => {
  return (
    <div
      className={`px-4 py-3.5 md:px-6 md:py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};
