"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  Wrench,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, inventoryStatusLabel } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { InventoryItem, InventoryStatus } from "@/types";

interface InventoryAlertsProps {
  items: InventoryItem[];
  isLoading?: boolean;
  onMarkForRepair?: (itemId: string) => void;
  onViewItem?: (item: InventoryItem) => void;
  className?: string;
}

export function InventoryAlerts({
  items,
  isLoading = false,
  onMarkForRepair,
  onViewItem,
  className,
}: InventoryAlertsProps) {
  const problemItems = useMemo(
    () => items.filter((i) => i.status === "DANADO" || i.status === "PERDIDO"),
    [items]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner size="md" text="Verificando alertas..." />
      </div>
    );
  }

  if (problemItems.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-12 w-12" />}
        title="Sin alertas"
        description="No hay ítems dañados o perdidos en el inventario."
      />
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Ítems con problemas
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {problemItems.length} {problemItems.length === 1 ? "ítem requiere" : "ítems requieren"} atención
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {problemItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0",
                  item.status === "PERDIDO"
                    ? "bg-red-100 dark:bg-red-800 text-red-600 dark:text-red-400"
                    : "bg-orange-100 dark:bg-orange-800 text-orange-600 dark:text-orange-400"
                )}
              >
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {item.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {inventoryStatusLabel(item.status)}
                  {item.notes && ` — ${item.notes}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                color={item.status === "PERDIDO" ? "red" : "orange"}
                size="sm"
                dot
              >
                {inventoryStatusLabel(item.status)}
              </Badge>
              {item.status === "DANADO" && onMarkForRepair && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Wrench className="h-3.5 w-3.5" />}
                  onClick={() => onMarkForRepair(item.id)}
                >
                  Reparar
                </Button>
              )}
              {onViewItem && (
                <button
                  onClick={() => onViewItem(item)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Ver detalle"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Puedes generar un reporte detallado desde la sección de reportes para enviar a administración.
          </p>
        </div>
      </div>
    </div>
  );
}
