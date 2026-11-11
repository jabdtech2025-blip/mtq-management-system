import React from 'react';
import { ControlSize } from './Input';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: string;
  controlSize?: ControlSize;
  containerClassName?: string;
}

const selectSizeClasses: Record<ControlSize, string> = {
  sm: 'h-8 px-2.5 text-xs rounded-sm',
  md: 'h-10 px-3 text-sm rounded-md',
  lg: 'h-12 px-4 text-base rounded-md'
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      helperText,
      error,
      controlSize = 'md',
      containerClassName = '',
      className = '',
      id,
      children,
      ...rest
    },
    ref
  ) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;

    return (
      <div className={containerClassName || 'w-full'}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={Boolean(error)}
          className={`w-full bg-white text-slate-900 border transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed cursor-pointer ${
            error ? 'border-rose-500 focus:border-rose-600' : 'border-slate-300'
          } ${selectSizeClasses[controlSize]} ${className}`}
          {...rest}
        >
          {children}
        </select>
        {error ? (
          <p className="mt-1 text-xs font-medium text-rose-700">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = 'Select';
