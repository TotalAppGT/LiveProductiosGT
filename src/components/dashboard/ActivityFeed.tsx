"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Calendar,
  MessageSquare,
  Package,
  DollarSign,
  Car,
  User,
  type LucideIcon,
  ChevronDown,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Activity } from "@/types";

interface ActivityFeedProps {
  activities: Activity[];
  isLoading?: boolean;
  onViewMore?: () => void;
  hasMore?: boolean;
  className?: string;
}

const activityIcons: Record<string, LucideIcon> = {
  tarea: CheckCircle2,
  evento: Calendar,
  comentario: MessageSquare,
  inventario: Package,
  cobro: DollarSign,
  vehiculo: Car,
  usuario: User,
};

function getActivityIcon(action: string): LucideIcon {
  const lower = action.toLowerCase();
  if (lower.includes("tarea")) return activityIcons.tarea;
  if (lower.includes("event")) return activityIcons.evento;
  if (lower.includes("coment")) return activityIcons.comentario;
  if (lower.includes("inventario") || lower.includes("equipo")) return activityIcons.inventario;
  if (lower.includes("cobro") || lower.includes("pago")) return activityIcons.cobro;
  if (lower.includes("vehiculo") || lower.includes("vehículo")) return activityIcons.vehiculo;
  return activityIcons.usuario;
}

function formatDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Hoy";
  if (isYesterday(date)) return "Ayer";
  return format(date, "EEEE d 'de' MMMM", { locale: es }).replace(/^\w/, (c) => c.toUpperCase());
}

export function ActivityFeed({
  activities,
  isLoading = false,
  onViewMore,
  hasMore = false,
  className,
}: ActivityFeedProps) {
  const [showAll, setShowAll] = useState(false);
  const displayCount = showAll ? activities.length : Math.min(activities.length, 10);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner size="md" text="Cargando actividades..." />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="h-16 w-16" />}
        title="Sin actividad reciente"
        description="Las actividades de los usuarios aparecerán aquí."
      />
    );
  }

  const displayedActivities = activities.slice(0, displayCount);

  const groupedByDate = displayedActivities.reduce(
    (groups, activity) => {
      const key = formatDateGroup(activity.createdAt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(activity);
      return groups;
    },
    {} as Record<string, Activity[]>
  );

  return (
    <div className={cn("space-y-4", className)}>
      {Object.entries(groupedByDate).map(([dateLabel, acts]) => (
        <div key={dateLabel}>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2 sticky top-0 bg-white dark:bg-gray-800 py-1">
            {dateLabel}
          </h4>
          <div className="space-y-2">
            {acts.map((activity) => {
              const Icon = getActivityIcon(activity.action);
              return (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Avatar
                    name={activity.user?.name}
                    src={activity.user?.avatar}
                    size="sm"
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">{activity.user?.name || "Usuario"}</span>{" "}
                        {activity.action}
                        {activity.details && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {" "}- {activity.details}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDistanceToNow(new Date(activity.createdAt), {
                        locale: es,
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="flex justify-center pt-2">
        {activities.length > 10 && !showAll && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
          >
            Ver más ({activities.length - 10} restantes)
          </Button>
        )}
        {hasMore && onViewMore && (
          <Button variant="outline" size="sm" onClick={onViewMore}>
            Cargar más actividades
          </Button>
        )}
      </div>
    </div>
  );
}
