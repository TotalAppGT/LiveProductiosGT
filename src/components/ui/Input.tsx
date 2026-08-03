"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type InputVariant = "default" | "filled" | "outline";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  variant?: InputVariant;
}

const variantStyles: Record<InputVariant, string> = {
  default:
    "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 focus:ring-blue-500",
  filled:
    "bg-gray-100 dark:bg-gray-700 border-transparent focus:bg-white dark:focus:bg-gray-800 focus:border-blue-500 focus:ring-blue-500",
  outline:
    "bg-transparent border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500",
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      variant = "default",
      className,
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={cn(
              "block w-full rounded-lg border px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              variantStyles[variant],
              leftIcon && "pl-10",
              rightIcon && "pr-10",
              error &&
                "border-red-500 focus:border-red-500 focus:ring-red-500",
              className
            )}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
          {rightIcon && (
            <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

export { Input };
export type { InputProps, InputVariant };
