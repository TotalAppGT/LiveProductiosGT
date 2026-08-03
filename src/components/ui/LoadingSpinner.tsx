"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  text?: string;
  className?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  xs: "h-3 w-3",
  sm: "h-4 w-4",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

const textSizeStyles: Record<SpinnerSize, string> = {
  xs: "text-xs",
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
  xl: "text-lg",
};

function LoadingSpinner({
  size = "md",
  text,
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        className
      )}
      role="status"
    >
      <Loader2
        className={cn(
          "animate-spin text-blue-600 dark:text-blue-400",
          sizeStyles[size]
        )}
      />
      {text && (
        <p
          className={cn(
            "text-gray-600 dark:text-gray-400 font-medium",
            textSizeStyles[size]
          )}
        >
          {text}
        </p>
      )}
      <span className="sr-only">Cargando...</span>
    </div>
  );
}

function PageLoader({ text = "Cargando..." }: { text?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}

function InlineLoader({ text }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 py-4">
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      {text && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {text}
        </span>
      )}
    </div>
  );
}

export { LoadingSpinner, PageLoader, InlineLoader };
export type { LoadingSpinnerProps, SpinnerSize };
