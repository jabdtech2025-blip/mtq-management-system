import React from 'react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: React.ReactNode;
  helperText?: React.ReactNode;
  error?: string;
  containerClassName?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, helperText, error, containerClassName = '', className = '', id, rows = 3, ...rest }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;

    return (
      <div className={`w-full ${containerClassName}`}>
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-bold text-slate-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-invalid={Boolean(error)}
          className={`w-full px-3.5 py-2.5 text-sm bg-white text-slate-900 placeholder:text-slate-400 border rounded-md transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-emerald-700/25 focus:border-emerald-700 disabled:bg-slate-100 disabled:text-slate-500 ${
            error ? 'border-rose-500 focus:border-rose-600' : 'border-slate-300'
          } ${className}`}
          {...rest}
        />
        {error ? (
          <p className="mt-1 text-xs font-medium text-rose-700">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
