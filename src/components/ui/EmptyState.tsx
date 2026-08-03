"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { ButtonProps } from "@/components/ui/Button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps["variant"];
  };
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <div className="text-gray-300 dark:text-gray-600 mb-4">
        {icon || <Inbox className="h-16 w-16" />}
      </div>
      <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
        {title}
      </h3>
      {description && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-6">
          <Button
            variant={action.variant || "primary"}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
