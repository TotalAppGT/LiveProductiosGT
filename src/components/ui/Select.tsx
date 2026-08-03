"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      hint,
      options,
      placeholder = "Seleccionar...",
      className,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={cn(
              "block w-full appearance-none rounded-lg border px-3 py-2 pr-10 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:ring-offset-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              error &&
                "border-red-500 focus:border-red-500 focus:ring-red-500",
              className
            )}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
              >
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none h-full w-5 text-gray-400" />
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export { Select };
export type { SelectProps, SelectOption };
