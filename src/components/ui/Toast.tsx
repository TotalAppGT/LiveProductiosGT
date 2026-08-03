"use client";

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastData {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const typeConfig: Record<
  ToastType,
  { icon: typeof CheckCircle; bg: string; border: string; iconColor: string }
> = {
  success: {
    icon: CheckCircle,
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    iconColor: "text-green-500",
  },
  error: {
    icon: XCircle,
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    iconColor: "text-red-500",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-yellow-50 dark:bg-yellow-900/20",
    border: "border-yellow-200 dark:border-yellow-800",
    iconColor: "text-yellow-500",
  },
  info: {
    icon: Info,
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-500",
  },
};

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);
  const config = typeConfig[toast.type];
  const Icon = config.icon;

  useEffect(() => {
    const showTimer = requestAnimationFrame(() => setVisible(true));

    if (toast.duration !== 0) {
      const hideTimer = setTimeout(() => {
        setVisible(false);
        setTimeout(() => onDismiss(toast.id), 300);
      }, toast.duration || 5000);

      return () => {
        cancelAnimationFrame(showTimer);
        clearTimeout(hideTimer);
      };
    }

    return () => cancelAnimationFrame(showTimer);
  }, [toast, onDismiss]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-300 max-w-sm w-full",
        config.bg,
        config.border,
        visible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
      )}
      role="alert"
    >
      <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", config.iconColor)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {toast.title}
        </p>
        {toast.message && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {toast.message}
          </p>
        )}
      </div>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(() => onDismiss(toast.id), 300);
        }}
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  children: (props: {
    toasts: ToastData[];
    addToast: (toast: Omit<ToastData, "id">) => void;
    removeToast: (id: string) => void;
  }) => ReactNode;
}

function ToastContainer({
  position = "top-right",
}: {
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
}) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  function addToast(toast: Omit<ToastData, "id">) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  const positionStyles: Record<string, string> = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
  };

  return { toasts, addToast, removeToast };
}

interface ToastRendererProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  style?: CSSProperties;
  className?: string;
}

function ToastRenderer({
  toasts,
  onDismiss,
  position = "top-right",
  style,
  className,
}: ToastRendererProps) {
  const positionStyles: Record<string, string> = {
    "top-right": "top-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-right": "bottom-4 right-4",
    "bottom-left": "bottom-4 left-4",
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-2",
        positionStyles[position],
        className
      )}
      style={style}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

export { ToastContainer, ToastRenderer };
export type { ToastData, ToastType };
