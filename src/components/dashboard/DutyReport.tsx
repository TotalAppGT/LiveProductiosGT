"use client";

import { useState } from "react";
import {
  RefreshCw,
  Sparkles,
  AlertTriangle,
  Clock,
  Calendar,
  FileText,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Task, Event } from "@/types";

interface DutyReportProps {
  summary?: string | null;
  alerts?: string[];
  pendingCriticalTasks?: Task[];
  todayEvents?: Event[];
  isLoading?: boolean;
  onRefresh: () => void;
  className?: string;
}

export function DutyReport({
  summary,
  alerts = [],
  pendingCriticalTasks = [],
  todayEvents = [],
  isLoading = false,
  onRefresh,
  className,
}: DutyReportProps) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Reporte diario IA
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          isLoading={refreshing || isLoading}
          leftIcon={<RefreshCw className="h-4 w-4" />}
        >
          Regenerar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" text="Generando reporte..." />
        </div>
      ) : (
        <>
          {summary && (
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 uppercase">
                  Resumen generado por IA
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {summary}
              </p>
            </div>
          )}

          {alerts.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase">
                  Alertas importantes ({alerts.length})
                </span>
              </div>
              <ul className="space-y-2">
                {alerts.map((alert, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300"
                  >
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
                    {alert}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingCriticalTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Tareas críticas pendientes ({pendingCriticalTasks.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {pendingCriticalTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between text-sm p-2 bg-orange-50 dark:bg-orange-900/10 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-orange-500 flex-shrink-0" />
                      <span className="text-gray-700 dark:text-gray-300 truncate">
                        {task.title}
                      </span>
                    </div>
                    <Badge color="orange" size="sm">
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {todayEvents.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                  Agenda de hoy ({todayEvents.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {todayEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between text-sm p-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                      <div className="truncate">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {event.name}
                        </span>
                        {event.clientName && (
                          <span className="text-gray-500 dark:text-gray-400 ml-2">
                            - {event.clientName}
                          </span>
                        )}
                      </div>
                    </div>
                    {event.date && (
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {format(new Date(event.date), "HH:mm")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!summary && alerts.length === 0 && pendingCriticalTasks.length === 0 && todayEvents.length === 0 && (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500">
              <Sparkles className="h-10 w-10 mx-auto mb-2" />
              <p className="text-sm">
                Presiona &ldquo;Regenerar&rdquo; para obtener un reporte diario con IA.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
