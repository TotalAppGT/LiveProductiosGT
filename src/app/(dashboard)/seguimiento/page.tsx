"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Clock,
  CheckCircle2,
  TrendingUp,
  Eye,
  Search,
  MessageCircle,
  Plus,
  User,
  ClipboardList,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { isToday } from "date-fns";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, taskStatusLabel, taskPriorityColor, roleColor, roleLabel } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatDate } from "@/lib/utils";

interface AccessLogEntry {
  action: string;
  details: string;
  createdAt: string;
}

interface TaskEntry {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  dueDate?: string;
}

interface UserOption {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
}

interface SeguimientoData {
  user: {
    id: string;
    name: string;
    role: string;
    avatar: string | null;
    email: string;
    phone?: string | null;
    whatsappNumber?: string | null;
  };
  accessCount: number;
  accessLog: AccessLogEntry[];
  tasks: TaskEntry[];
  completedTasks: number;
  pendingTasks: number;
  complianceRate: number;
  bitacora: AccessLogEntry[];
  totalAssigned: number;
}

export default function SeguimientoPage() {
  const { user: currentUser, token } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [data, setData] = useState<SeguimientoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isManager = currentUser?.role === "DUENO" || currentUser?.role === "ADMIN" || currentUser?.role === "JEFE";
  const effectiveUserId = isManager ? selectedUserId : (currentUser?.id || "");
  const targetUserId = effectiveUserId;

  const fetchUsers = useCallback(async () => {
    if (!token || !isManager) return;
    try {
      const res = await fetch("/api/users?limit=100", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const userList = json.data.map((u: Record<string, unknown>) => ({
            id: u.id as string,
            name: u.name as string,
            role: u.role as string,
            avatar: (u.avatar as string) || null,
          }));
          setUsers(userList);
          if (!selectedUserId && userList.length > 0) {
            setSelectedUserId(userList[0].id);
          }
        }
      }
    } catch { /* */ }
  }, [token, isManager, selectedUserId]);

  useEffect(() => {
    if (isManager) fetchUsers();
  }, [isManager, fetchUsers]);

  const fetchSeguimiento = useCallback(async () => {
    if (!token || !targetUserId) return;
    setLoading(true);
    setError("");
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [activityRes, tasksRes, bitacoraRes] = await Promise.all([
        fetch(`/api/activity?userId=${targetUserId}&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/tasks?assignedToId=${targetUserId}&limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/activity?userId=${targetUserId}&limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      let accessCount = 0;
      let accessLog: AccessLogEntry[] = [];
      let bitacora: AccessLogEntry[] = [];
      let tasks: TaskEntry[] = [];
      let completedTasks = 0;
      let pendingTasks = 0;

      if (activityRes.ok) {
        const json = await activityRes.json();
        if (json.success && json.data) {
          const todayActivities = json.data.filter((a: AccessLogEntry) => {
            const d = new Date(a.createdAt);
            return d >= today;
          });
          accessCount = todayActivities.length;
          accessLog = todayActivities;
        }
      }

      if (tasksRes.ok) {
        const json = await tasksRes.json();
        if (json.success && json.data) {
          tasks = json.data;
          completedTasks = tasks.filter((t) => t.status === "COMPLETADA").length;
          pendingTasks = tasks.filter((t) => t.status !== "COMPLETADA" && t.status !== "CANCELADA").length;
        }
      }

      if (bitacoraRes.ok) {
        const json = await bitacoraRes.json();
        if (json.success && json.data) {
          bitacora = json.data.slice(0, 20);
        }
      }

      const totalAssigned = tasks.length;
      const complianceRate = totalAssigned > 0 ? Math.round((completedTasks / totalAssigned) * 100) : 100;

      const userInfo = isManager
        ? users.find((u) => u.id === targetUserId)
        : currentUser;

      setData({
        user: {
          id: targetUserId,
          name: userInfo?.name || currentUser?.name || "",
          role: userInfo?.role || currentUser?.role || "",
          avatar: userInfo?.avatar || currentUser?.avatar || null,
          email: currentUser?.email || "",
        },
        accessCount,
        accessLog,
        tasks,
        completedTasks,
        pendingTasks,
        complianceRate,
        bitacora,
        totalAssigned,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, targetUserId, isManager, currentUser, users]);

  useEffect(() => {
    if (targetUserId) fetchSeguimiento();
  }, [targetUserId, fetchSeguimiento]);

  async function handleSendReminder() {
    if (!data) return;
    setSendingReminder(true);
    try {
      const res = await fetch("/api/whatsapp/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: data.user.id, type: "reminder" }),
      });
      if (res.ok) toast.success(`Recordatorio enviado a ${data.user.name}`);
      else throw new Error("Error");
    } catch {
      toast.error("Error al enviar recordatorio");
    } finally {
      setSendingReminder(false);
    }
  }

  function getAccessColor(count: number): string {
    if (count >= 4) return "text-green-600 dark:text-green-400";
    if (count >= 1) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

  function getComplianceColor(rate: number): string {
    if (rate >= 80) return "bg-green-500";
    if (rate >= 50) return "bg-orange-400";
    return "bg-red-500";
  }

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isManager && loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Cargando seguimiento..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isManager ? "Seguimiento de Personal" : "Mi Seguimiento"}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {isManager ? "Consulta la actividad y cumplimiento de cada empleado" : "Tu actividad, tareas y cumplimiento personal"}
          </p>
        </div>
      </div>

      {isManager && (
        <Card variant="bordered" className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar empleado..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSelectedUserId(u.id); fetchSeguimiento(); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                  selectedUserId === u.id
                    ? "bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-400"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                )}
              >
                <Avatar name={u.name} src={u.avatar} size="xs" />
                <span className="truncate max-w-[100px]">{u.name.split(" ")[0]}</span>
                <Badge size="sm" color={roleColor(u.role)}>
                  {roleLabel(u.role).slice(0, 4)}
                </Badge>
              </button>
            ))}
            {filteredUsers.length === 0 && (
              <p className="text-sm text-gray-400 py-2">No se encontraron empleados</p>
            )}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <LoadingSpinner size="lg" text="Cargando datos..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchSeguimiento}>Reintentar</Button>
        </div>
      ) : !data ? (
        <EmptyState
          icon={<Activity className="h-16 w-16" />}
          title="Sin datos"
          description={isManager ? "Selecciona un empleado para ver su seguimiento." : "No hay datos de seguimiento disponibles."}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card variant="bordered" className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Accesos de hoy</span>
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Activity className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <p className={cn("text-xl font-bold", getAccessColor(data.accessCount))}>
                {data.accessCount} de 4
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Has ingresado {data.accessCount} de 4 veces requeridas hoy
              </p>
            </Card>
            <Card variant="bordered" className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Tareas</span>
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {data.completedTasks}/{data.totalAssigned}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {data.pendingTasks} pendientes
              </p>
            </Card>
            <Card variant="bordered" className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Cumplimiento</span>
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {data.complianceRate}%
              </p>
              <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", getComplianceColor(data.complianceRate))}
                  style={{ width: `${data.complianceRate}%` }}
                />
              </div>
            </Card>
            {isManager && (
              <Card variant="bordered" className="p-4">
                <div className="flex flex-col gap-2">
                  <Button
                    variant="warning"
                    size="sm"
                    leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
                    onClick={handleSendReminder}
                    isLoading={sendingReminder}
                  >
                    Enviar recordatorio WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Asignar tarea
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Eye className="h-3.5 w-3.5" />}
                  >
                    Ver bitácora completa
                  </Button>
                </div>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Registro de Accesos</h2>
              </div>
              {data.accessLog.length === 0 ? (
                <EmptyState
                  icon={<Activity className="h-12 w-12" />}
                  title="Sin accesos hoy"
                  description="No se ha registrado actividad para hoy."
                />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.accessLog.map((entry, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <span className="text-xs text-gray-400 font-mono whitespace-nowrap mt-0.5">
                        {new Date(entry.createdAt).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{entry.details || entry.action}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <ClipboardList className="h-5 w-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mis Tareas</h2>
              </div>
              {data.tasks.length === 0 ? (
                <EmptyState
                  title="Sin tareas"
                  description="No hay tareas asignadas."
                />
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "p-3 rounded-lg border-l-4 bg-gray-50 dark:bg-gray-800/50",
                        task.priority === "URGENTE" ? "border-l-red-500" :
                        task.priority === "ALTA" ? "border-l-orange-400" :
                        task.priority === "MEDIA" ? "border-l-yellow-400" :
                        "border-l-gray-400"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge size="sm" color={taskPriorityColor(task.priority)}>
                              {task.priority === "URGENTE" ? "Urgente" : task.priority === "ALTA" ? "Alta" : task.priority === "MEDIA" ? "Media" : "Baja"}
                            </Badge>
                            <Badge size="sm" color="gray">{taskStatusLabel(task.status)}</Badge>
                          </div>
                        </div>
                        {task.dueDate && (
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card variant="bordered" className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-5 w-5 text-orange-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Bitácora Personal</h2>
              <span className="text-xs text-gray-400 ml-auto">Últimas 20 actividades</span>
            </div>
            {data.bitacora.length === 0 ? (
              <EmptyState
                icon={<Activity className="h-12 w-12" />}
                title="Sin actividad registrada"
                description="No hay entradas en la bitácora."
              />
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {data.bitacora.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300">{entry.details || entry.action}</p>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        {isToday(new Date(entry.createdAt))
                          ? `Hoy, ${new Date(entry.createdAt).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`
                          : formatDate(entry.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
