import React from 'react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className = '', id, ...rest }, ref) => {
    const generatedId = React.useId();
    const checkboxId = id || generatedId;

    return (
      <label
        htmlFor={checkboxId}
        className={`inline-flex items-start gap-2.5 cursor-pointer select-none min-h-6 py-1 ${
          rest.disabled ? 'opacity-50 cursor-not-allowed' : ''
        } ${className}`}
      >
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          className="mt-0.5 w-4 h-4 rounded-sm border-slate-300 text-emerald-700 focus:ring-emerald-600 cursor-pointer shrink-0"
          {...rest}
        />
        {(label || description) && (
          <span className="min-w-0">
            {label && <span className="block text-sm font-medium text-slate-800">{label}</span>}
            {description && <span className="block text-xs text-slate-500 mt-0.5">{description}</span>}
          </span>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
