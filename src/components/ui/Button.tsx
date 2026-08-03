"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "success"
  | "warning"
  | "outline"
  | "ghost";

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 disabled:bg-blue-400",
  secondary:
    "bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400 disabled:bg-gray-100 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 disabled:bg-red-400",
  success:
    "bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 disabled:bg-green-400",
  warning:
    "bg-yellow-500 text-white hover:bg-yellow-600 focus:ring-yellow-400 disabled:bg-yellow-300",
  outline:
    "border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-400 disabled:text-gray-400 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-400 disabled:text-gray-400 dark:text-gray-300 dark:hover:bg-gray-800",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

const iconSizeStyles: Record<ButtonSize, string> = {
  sm: "h-4 w-4",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading ? (
          <Loader2
            className={cn("animate-spin", iconSizeStyles[size])}
          />
        ) : leftIcon ? (
          <span className={iconSizeStyles[size]}>{leftIcon}</span>
        ) : null}
        {children}
        {!isLoading && rightIcon && (
          <span className={iconSizeStyles[size]}>{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
export type { ButtonProps, ButtonVariant, ButtonSize };
