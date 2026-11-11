import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconOnly?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-emerald-800 hover:bg-emerald-900 active:bg-emerald-950 text-white border border-emerald-800 shadow-sm',
  secondary:
    'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 border border-slate-300 shadow-sm',
  ghost:
    'bg-transparent hover:bg-slate-100 active:bg-slate-200/70 text-slate-700 border border-transparent',
  danger:
    'bg-rose-700 hover:bg-rose-800 active:bg-rose-900 text-white border border-rose-700 shadow-sm'
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-sm',
  md: 'h-10 px-4 text-sm gap-2 rounded-md',
  lg: 'h-12 px-5 text-base gap-2.5 rounded-md'
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  sm: 'w-8 h-8 p-0 rounded-sm',
  md: 'w-10 h-10 p-0 rounded-md',
  lg: 'w-12 h-12 p-0 rounded-md'
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      iconOnly = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const iconSizeClass = size === 'lg' ? '[&_svg]:w-5 [&_svg]:h-5' : '[&_svg]:w-4 [&_svg]:h-4';

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-semibold transition-all duration-150 ease-out cursor-pointer select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
          variantClasses[variant]
        } ${iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size]} ${iconSizeClass} ${
          fullWidth ? 'w-full' : ''
        } ${className}`}
        {...rest}
      >
        {loading ? (
          <Loader2 className={`${size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} animate-spin shrink-0`} />
        ) : (
          leftIcon && <span className="shrink-0 inline-flex items-center">{leftIcon}</span>
        )}
        {children && <span className="truncate">{children}</span>}
        {!loading && rightIcon && (
          <span className="shrink-0 inline-flex items-center">{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
