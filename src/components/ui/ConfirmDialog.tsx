"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  className?: string;
}

const variantStyles: Record<ConfirmVariant, { iconColor: string; bgColor: string; buttonVariant: "danger" | "warning" | "primary" }> = {
  danger: {
    iconColor: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-900/10",
    buttonVariant: "danger",
  },
  warning: {
    iconColor: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400",
    bgColor: "bg-yellow-50 dark:bg-yellow-900/10",
    buttonVariant: "warning",
  },
  info: {
    iconColor: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-900/10",
    buttonVariant: "primary",
  },
};

function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  loading = false,
  className,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const styles = variantStyles[variant];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-2xl animate-in zoom-in-95 fade-in duration-200 overflow-hidden",
          className
        )}
      >
        <div className={cn("p-6", styles.bgColor)}>
          <div className="flex items-center gap-4">
            <div className={cn("p-3 rounded-full", styles.iconColor)}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {title}
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {message}
              </p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 flex justify-end gap-3 bg-white dark:bg-gray-800">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={styles.buttonVariant}
            size="md"
            onClick={onConfirm}
            isLoading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { ConfirmDialog };
export type { ConfirmDialogProps, ConfirmVariant };
