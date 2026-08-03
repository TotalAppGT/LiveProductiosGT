"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Send,
  AlertTriangle,
  Users as UsersIcon,
  TrendingUp,
  Calendar,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { User as UserType, Task, ApiResponse } from "@/types";

interface StaffCompliance {
  userId: string;
  user: Pick<UserType, "id" | "name" | "avatar" | "role">;
  tasksAssigned: number;
  tasksCompleted: number;
  tasksPending: number;
  completionRate: number;
  lastAccess: string | null;
  pendingTasks: Task[];
}

interface ComplianceData {
  totalComplianceRate: number;
  activeUsers: number;
  inactiveUsers: number;
  totalPendingTasks: number;
  staff: StaffCompliance[];
}

type DateFilter = "today" | "yesterday" | "week" | "custom";

export default function CumplimientoPage() {
  const { user, token } = useAuth();
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [sendingReminder, setSendingReminder] = useState<Set<string>>(new Set());
  const [completingTask, setCompletingTask] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const canAccess = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const fetchCompliance = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("filter", dateFilter);
      if (dateFilter === "custom") {
        if (customFrom) params.set("from", customFrom);
        if (customTo) params.set("to", customTo);
      }
      const res = await fetch(`/api/cumplimiento?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar datos de cumplimiento");
      const json: ApiResponse<ComplianceData> = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        setData(null);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, dateFilter, customFrom, customTo]);

  useEffect(() => {
    if (canAccess) {
      fetchCompliance();
    }
  }, [canAccess, fetchCompliance]);

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function sendReminder(userId: string, userName: string) {
    if (!token) return;
    setSendingReminder((prev) => new Set(prev).add(userId));
    try {
      const res = await fetch("/api/whatsapp/send-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId, type: "COMPLIANCE_REMINDER" }),
      });
      if (!res.ok) throw new Error("Error al enviar recordatorio");
      toast.success(`Recordatorio enviado a ${userName}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al enviar recordatorio");
    } finally {
      setSendingReminder((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function completeTask(taskId: string, taskTitle: string) {
    if (!token) return;
    setCompletingTask((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "COMPLETADA" }),
      });
      if (!res.ok) throw new Error("Error al completar tarea");
      toast.success(`"${taskTitle}" completada`);
      fetchCompliance();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setCompletingTask((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }
  }

  function getLastAccessText(lastAccess: string | null): { text: string; urgent: boolean } {
    if (!lastAccess) return { text: "Nunca hoy", urgent: true };
    const date = new Date(lastAccess);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return { text: `Hace ${Math.floor(diffMs / (1000 * 60))} minutos`, urgent: false };
    if (diffHours < 6) return { text: `Hace ${diffHours} horas`, urgent: false };
    if (diffHours < 24) return { text: `Hace ${diffHours} horas`, urgent: true };
    return { text: `Hace ${Math.floor(diffHours / 24)} días`, urgent: true };
  }

  function getRateColor(rate: number): string {
    if (rate >= 80) return "bg-green-500";
    if (rate >= 50) return "bg-orange-400";
    return "bg-red-500";
  }

  function getRateTextColor(rate: number): string {
    if (rate >= 80) return "text-green-600 dark:text-green-400";
    if (rate >= 50) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={<ClipboardCheck className="h-16 w-16" />}
          title="Acceso restringido"
          description="Solo dueños, administradores y jefes pueden ver esta sección."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cumplimiento del Equipo</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Monitoreo de tareas y actividad del personal
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {([
            { value: "today", label: "Hoy" },
            { value: "yesterday", label: "Ayer" },
            { value: "week", label: "Esta semana" },
          ] as const).map((f) => (
            <button
              key={f.value}
              onClick={() => setDateFilter(f.value as DateFilter)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md font-medium transition-colors",
                dateFilter === f.value
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            onClick={() => setDateFilter("custom")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1",
              dateFilter === "custom"
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Personalizado
          </button>
        </div>
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <Button variant="primary" size="sm" onClick={fetchCompliance}>
              <Search className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando cumplimiento..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchCompliance}>Reintentar</Button>
        </div>
      ) : !data || data.staff.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-16 w-16" />}
          title="Sin datos"
          description="No se encontraron datos de cumplimiento para el período seleccionado."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card variant="bordered" className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Cumplimiento General</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {data.totalComplianceRate.toFixed(0)}%
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", getRateColor(data.totalComplianceRate))}
                  style={{ width: `${data.totalComplianceRate}%` }}
                />
              </div>
            </Card>
            <Card variant="bordered" className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <UsersIcon className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Usuarios Activos Hoy</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{data.activeUsers}</p>
                </div>
              </div>
            </Card>
            <Card variant="bordered" className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Sin Actividad Hoy</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{data.inactiveUsers}</p>
                </div>
              </div>
            </Card>
            <Card variant="bordered" className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tareas Pendientes</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{data.totalPendingTasks}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="space-y-3">
            {data.staff.map((member) => {
              const isExpanded = expandedUsers.has(member.userId);
              const lastAccess = getLastAccessText(member.lastAccess);
              return (
                <Card key={member.userId} variant="bordered">
                  <div className="p-4">
                    <div
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => toggleUser(member.userId)}
                    >
                      <Avatar name={member.user.name} src={member.user.avatar} size="md" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {member.user.name}
                          </p>
                          <Badge size="sm" color={member.user.role === "JEFE" ? "purple" : "blue"}>
                            {member.user.role === "JEFE" ? "Jefe" : member.user.role === "DUENO" ? "Dueño" : member.user.role === "ADMIN" ? "Admin" : "Empleado"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {member.tasksCompleted}/{member.tasksAssigned} completadas
                          </span>
                          <span className={cn("flex items-center gap-1", lastAccess.urgent && "text-red-500")}>
                            <Clock className="h-3 w-3" />
                            {lastAccess.text}
                          </span>
                        </div>
                      </div>

                      <div className="hidden sm:flex items-center gap-3">
                        <div className="w-24">
                          <div className="flex items-center justify-between mb-1">
                            <span className={cn("text-xs font-bold", getRateTextColor(member.completionRate))}>
                              {member.completionRate.toFixed(0)}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full transition-all", getRateColor(member.completionRate))}
                              style={{ width: `${member.completionRate}%` }}
                            />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            sendReminder(member.userId, member.user.name);
                          }}
                          isLoading={sendingReminder.has(member.userId)}
                        >
                          Recordatorio
                        </Button>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex sm:hidden items-center gap-3 mt-3">
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn("text-xs font-bold", getRateTextColor(member.completionRate))}>
                            {member.completionRate.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={cn("h-full rounded-full transition-all", getRateColor(member.completionRate))}
                            style={{ width: `${member.completionRate}%` }}
                          />
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          sendReminder(member.userId, member.user.name);
                        }}
                        isLoading={sendingReminder.has(member.userId)}
                      >
                        Nudge
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                          Tareas Pendientes ({member.pendingTasks.length})
                        </p>
                        {member.pendingTasks.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-500">
                            Sin tareas pendientes
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-80 overflow-y-auto">
                            {member.pendingTasks.map((task) => (
                              <div
                                key={task.id}
                                className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                      {task.title}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge
                                        size="sm"
                                        color={
                                          task.priority === "URGENTE"
                                            ? "red"
                                            : task.priority === "ALTA"
                                            ? "orange"
                                            : task.priority === "MEDIA"
                                            ? "yellow"
                                            : "gray"
                                        }
                                      >
                                        {task.priority === "URGENTE"
                                          ? "Urgente"
                                          : task.priority === "ALTA"
                                          ? "Alta"
                                          : task.priority === "MEDIA"
                                          ? "Media"
                                          : "Baja"}
                                      </Badge>
                                      {task.dueDate && (
                                        <span className="text-xs text-gray-400 flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {format(new Date(task.dueDate), "dd/MM/yyyy")}
                                        </span>
                                      )}
                                    </div>
                                    {task.comments && (
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                        {task.comments}
                                      </p>
                                    )}
                                  </div>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      completeTask(task.id, task.title);
                                    }}
                                    isLoading={completingTask.has(task.id)}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
