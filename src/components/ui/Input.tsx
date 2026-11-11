import React from 'react';

export type ControlSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: string;
  controlSize?: ControlSize;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerClassName?: string;
}

const inputSizeClasses: Record<ControlSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-sm',
  md: 'h-10 px-3.5 text-sm rounded-md',
  lg: 'h-12 px-4 text-base rounded-md'
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      controlSize = 'md',
      leftIcon,
      rightElement,
      containerClassName = '',
      className = '',
      id,
      ...rest
    },
    ref
  ) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;

    return (
      <div className={containerClassName || 'w-full'}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 text-slate-400 pointer-events-none flex items-center [&_svg]:w-4 [&_svg]:h-4">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error)}
            className={`w-full bg-white text-slate-900 placeholder:text-slate-400 border transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed ${
              error ? 'border-rose-500 focus:border-rose-600 focus:ring-rose-500/20' : 'border-slate-300'
            } ${inputSizeClasses[controlSize]} ${leftIcon ? 'pl-9' : ''} ${
              rightElement ? 'pr-9' : ''
            } ${className}`}
            {...rest}
          />
          {rightElement && (
            <div className="absolute right-2.5 flex items-center text-slate-400">
              {rightElement}
            </div>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs font-medium text-rose-700">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
