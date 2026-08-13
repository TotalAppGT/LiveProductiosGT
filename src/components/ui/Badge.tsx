"use client";

import { cn } from "@/lib/utils";
import type { ReactNode, HTMLAttributes } from "react";

type BadgeColor =
  | "gray"
  | "blue"
  | "green"
  | "red"
  | "yellow"
  | "purple"
  | "orange"
  | "pink"
  | "indigo"
  | "teal";

type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  color?: BadgeColor;
  size?: BadgeSize;
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
}

const colorStyles: Record<BadgeColor, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600",
  blue: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  green:
    "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  red: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  yellow:
    "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800",
  purple:
    "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  orange:
    "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  pink: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800",
  indigo:
    "bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800",
  teal: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800",
};

const dotColorStyles: Record<BadgeColor, string> = {
  gray: "bg-gray-500",
  blue: "bg-blue-500",
  green: "bg-green-500",
  red: "bg-red-500",
  yellow: "bg-yellow-500",
  purple: "bg-purple-500",
  orange: "bg-orange-500",
  pink: "bg-pink-500",
  indigo: "bg-indigo-500",
  teal: "bg-teal-500",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-1.5 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-xs",
  lg: "px-3 py-1 text-sm",
};

const dotSizeStyles: Record<BadgeSize, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

export function taskStatusColor(status: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    PENDIENTE: "yellow",
    EN_PROCESO: "blue",
    COMPLETADA: "green",
    CANCELADA: "red",
    REPROGRAMADA: "purple",
  };
  return map[status] || "gray";
}

export function taskPriorityColor(priority: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    BAJA: "green",
    MEDIA: "yellow",
    ALTA: "red",
    URGENTE: "red",
  };
  return map[priority] || "gray";
}

export function eventStatusColor(status: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    COTIZACION: "yellow",
    CONFIRMADO: "blue",
    EN_PROGRESO: "indigo",
    COMPLETADO: "green",
    CANCELADO: "red",
  };
  return map[status] || "gray";
}

export function inventoryStatusColor(status: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    DISPONIBLE: "green",
    ASIGNADO: "blue",
    EN_REPARACION: "yellow",
    PERDIDO: "red",
    DANADO: "orange",
  };
  return map[status] || "gray";
}

export function vehicleStatusColor(status: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    DISPONIBLE: "green",
    EN_USO: "blue",
    EN_MANTENIMIENTO: "yellow",
    FUERA_SERVICIO: "red",
  };
  return map[status] || "gray";
}

export function cobroStatusColor(status: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    PENDIENTE: "yellow",
    PARCIAL: "orange",
    COMPLETADO: "green",
  };
  return map[status] || "gray";
}

export function taskStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDIENTE: "Pendiente",
    EN_PROCESO: "En proceso",
    COMPLETADA: "Completada",
    CANCELADA: "Cancelada",
    REPROGRAMADA: "Reprogramada",
  };
  return map[status] || status;
}

export function taskPriorityLabel(priority: string): string {
  const map: Record<string, string> = {
    BAJA: "Baja",
    MEDIA: "Media",
    ALTA: "Alta",
    URGENTE: "Urgente",
  };
  return map[priority] || priority;
}

export function eventStatusLabel(status: string): string {
  const map: Record<string, string> = {
    COTIZACION: "Cotización",
    CONFIRMADO: "Confirmado",
    EN_PROGRESO: "En progreso",
    COMPLETADO: "Completado",
    CANCELADO: "Cancelado",
  };
  return map[status] || status;
}

export function inventoryStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DISPONIBLE: "Disponible",
    ASIGNADO: "Asignado",
    EN_REPARACION: "En reparación",
    PERDIDO: "Perdido",
    DANADO: "Dañado",
  };
  return map[status] || status;
}

export function vehicleStatusLabel(status: string): string {
  const map: Record<string, string> = {
    DISPONIBLE: "Disponible",
    EN_USO: "En uso",
    EN_MANTENIMIENTO: "En mantenimiento",
    FUERA_SERVICIO: "Fuera de servicio",
  };
  return map[status] || status;
}

export function cobroStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDIENTE: "Pendiente",
    PARCIAL: "Parcial",
    COMPLETADO: "Completado",
  };
  return map[status] || status;
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    DUENO: "Dueño",
    ADMIN: "Administrador",
    JEFE: "Jefe",
    EMPLEADO: "Empleado",
  };
  return map[role] || role;
}

export function roleColor(role: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    DUENO: "purple",
    ADMIN: "indigo",
    JEFE: "blue",
    EMPLEADO: "gray",
  };
  return map[role] || "gray";
}

function Badge({
  children,
  color = "gray",
  size = "md",
  dot = false,
  removable = false,
  onRemove,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        colorStyles[color],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "rounded-full flex-shrink-0",
            dotColorStyles[color],
            dotSizeStyles[size]
          )}
        />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

export { Badge };
export type { BadgeProps, BadgeColor, BadgeSize };
