"use client";

import { useState, useMemo } from "react";
import {
  Users,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { User } from "@/types";

interface TeamMemberStats {
  user: User;
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number;
  lastActiveAt?: string | null;
  isOnline: boolean;
}

interface TeamOverviewProps {
  members: TeamMemberStats[];
  isLoading?: boolean;
  className?: string;
}

type SortKey = "tasksAssigned" | "completionRate" | "lastActive";

export function TeamOverview({
  members,
  isLoading = false,
  className,
}: TeamOverviewProps) {
  const [sortKey, setSortKey] = useState<SortKey>("completionRate");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedMembers = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      let valA: number;
      let valB: number;
      if (sortKey === "lastActive") {
        valA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        valB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
      } else {
        valA = a[sortKey];
        valB = b[sortKey];
      }
      return sortAsc ? valA - valB : valB - valA;
    });
    return sorted;
  }, [members, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner size="md" text="Cargando equipo..." />
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-16 w-16" />}
        title="Sin miembros del equipo"
        description="Agrega miembros al equipo para ver su rendimiento aquí."
      />
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => handleSort("completionRate")}
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-full border transition-colors flex items-center gap-1",
            sortKey === "completionRate"
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          )}
        >
          Rendimiento
          {sortKey === "completionRate" && (
            <ArrowUpDown className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={() => handleSort("tasksAssigned")}
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-full border transition-colors flex items-center gap-1",
            sortKey === "tasksAssigned"
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          )}
        >
          Tareas
          {sortKey === "tasksAssigned" && (
            <ArrowUpDown className="h-3 w-3" />
          )}
        </button>
        <button
          onClick={() => handleSort("lastActive")}
          className={cn(
            "text-xs font-medium px-2 py-1 rounded-full border transition-colors flex items-center gap-1",
            sortKey === "lastActive"
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
          )}
        >
          Actividad
          {sortKey === "lastActive" && (
            <ArrowUpDown className="h-3 w-3" />
          )}
        </button>
      </div>

      <div className="space-y-2">
        {sortedMembers.map((member) => (
          <div
            key={member.user.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
          >
            <Avatar
              name={member.user.name}
              src={member.user.avatar}
              size="md"
              status={member.isOnline ? "online" : "offline"}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {member.user.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {member.lastActiveAt
                      ? formatDistanceToNow(new Date(member.lastActiveAt), {
                          locale: es,
                          addSuffix: true,
                        })
                      : "Sin actividad"}
                  </p>
                </div>
                <Badge
                  color={member.isOnline ? "green" : "gray"}
                  size="sm"
                  dot
                >
                  {member.isOnline ? "En línea" : "Desconectado"}
                </Badge>
              </div>

              <div className="mt-2 flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Tareas:</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {member.tasksAssigned}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-2 rounded-full transition-all duration-500",
                          member.completionRate >= 80
                            ? "bg-green-500"
                            : member.completionRate >= 50
                            ? "bg-yellow-500"
                            : "bg-red-500"
                        )}
                        style={{ width: `${member.completionRate}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10 text-right">
                      {member.completionRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
