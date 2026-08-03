"use client";

import { useMemo } from "react";
import {
  Package,
  CheckCircle2,
  UserCheck,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { InventoryItem } from "@/types";

interface InventoryStatsProps {
  items: InventoryItem[];
  isLoading?: boolean;
  className?: string;
}

interface StatItem {
  label: string;
  value: number;
  icon: typeof Package;
  color: string;
  bgColor: string;
  iconBg: string;
  iconColor: string;
}

export function InventoryStats({
  items,
  isLoading = false,
  className,
}: InventoryStatsProps) {
  const stats = useMemo<StatItem[]>(() => {
    const total = items.length;
    const disponibles = items.filter((i) => i.status === "DISPONIBLE").length;
    const asignados = items.filter((i) => i.status === "ASIGNADO").length;
    const enReparacion = items.filter((i) => i.status === "EN_REPARACION").length;
    const danadoPerdido = items.filter((i) => i.status === "PERDIDO" || i.status === "DANADO").length;

    return [
      {
        label: "Total",
        value: total,
        icon: Package,
        color: "border-blue-400",
        bgColor: "bg-blue-50 dark:bg-blue-900/20",
        iconBg: "bg-blue-100 dark:bg-blue-800",
        iconColor: "text-blue-600 dark:text-blue-400",
      },
      {
        label: "Disponible",
        value: disponibles,
        icon: CheckCircle2,
        color: "border-green-400",
        bgColor: "bg-green-50 dark:bg-green-900/20",
        iconBg: "bg-green-100 dark:bg-green-800",
        iconColor: "text-green-600 dark:text-green-400",
      },
      {
        label: "Asignado",
        value: asignados,
        icon: UserCheck,
        color: "border-purple-400",
        bgColor: "bg-purple-50 dark:bg-purple-900/20",
        iconBg: "bg-purple-100 dark:bg-purple-800",
        iconColor: "text-purple-600 dark:text-purple-400",
      },
      {
        label: "En reparación",
        value: enReparacion,
        icon: Wrench,
        color: "border-yellow-400",
        bgColor: "bg-yellow-50 dark:bg-yellow-900/20",
        iconBg: "bg-yellow-100 dark:bg-yellow-800",
        iconColor: "text-yellow-600 dark:text-yellow-400",
      },
      {
        label: "Dañado/Perdido",
        value: danadoPerdido,
        icon: AlertTriangle,
        color: "border-red-400",
        bgColor: "bg-red-50 dark:bg-red-900/20",
        iconBg: "bg-red-100 dark:bg-red-800",
        iconColor: "text-red-600 dark:text-red-400",
      },
    ];
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <LoadingSpinner size="sm" text="Cargando estadísticas..." />
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3", className)}>
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "rounded-xl border-t-4 p-3 transition-colors",
            stat.color,
            stat.bgColor
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
              {stat.label}
            </span>
            <div className={cn("p-1.5 rounded-lg", stat.iconBg, stat.iconColor)}>
              <stat.icon className="h-4 w-4" />
            </div>
          </div>
          <span className="text-xl font-bold text-gray-900 dark:text-white">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
