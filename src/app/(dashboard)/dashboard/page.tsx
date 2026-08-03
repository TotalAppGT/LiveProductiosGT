"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  CalendarCheck,
  Calendar,
  DollarSign,
  AlertTriangle,
  Plus,
  Brain,
  Clock,
  User,
  TrendingUp,
  ArrowUpRight,
  Users as UsersIcon,
  ClipboardCheck,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, taskStatusLabel, taskPriorityLabel, taskPriorityColor, taskStatusColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatCurrency, getDayName, cn } from "@/lib/utils";
import type { Task, Activity, Event } from "@/types";

interface DashboardData {
  stats: {
    pendingTasks: number;
    completedTasksToday: number;
    eventsThisWeek: number;
    pendingCobros: number;
    damagedEquipment: number;
    cobrosAmount: number;
  };
  dailyReport: string;
  recentActivity: Array<{
    id: string;
    user: { name: string; avatar: string | null };
    action: string;
    details: string;
    createdAt: string;
  }>;
  tasksDueToday: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    category: string;
    dueDate?: string;
    assignedTo: { name: string } | null;
  }>;
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compliance, setCompliance] = useState<{
    totalComplianceRate: number;
    activeUsers: number;
    inactiveUsers: number;
    totalPendingTasks: number;
  } | null>(null);

  const today = new Date();
  const formattedDate = `${getDayName(today)}, ${formatDate(today)}`;

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar el dashboard");
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else {
        throw new Error(json.error || "Error al cargar datos");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const isAdminOrOwner = user?.role === "DUENO" || user?.role === "ADMIN";

  useEffect(() => {
    const fetchCompliance = async () => {
      if (!token || !isAdminOrOwner) return;
      try {
        const res = await fetch("/api/cumplimiento?filter=today", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setCompliance({
              totalComplianceRate: json.data.totalComplianceRate,
              activeUsers: json.data.activeUsers,
              inactiveUsers: json.data.inactiveUsers,
              totalPendingTasks: json.data.totalPendingTasks,
            });
          }
        }
      } catch { /* */ }
    };
    if (!loading) fetchCompliance();
  }, [token, loading, isAdminOrOwner]);

  const chartData = [
    { name: "Pendiente", value: data?.stats.pendingTasks || 0, fill: "#eab308" },
    { name: "Hoy", value: data?.stats.completedTasksToday || 0, fill: "#22c55e" },
    { name: "Eventos", value: data?.stats.eventsThisWeek || 0, fill: "#3b82f6" },
    { name: "Cobros", value: data?.stats.pendingCobros || 0, fill: "#f97316" },
  ];

  const statCards = [
    {
      label: "Tareas Pendientes",
      value: data?.stats.pendingTasks ?? 0,
      icon: CheckSquare,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      href: "/tareas",
    },
    {
      label: "Tareas Completadas Hoy",
      value: data?.stats.completedTasksToday ?? 0,
      icon: CalendarCheck,
      color: "text-green-400",
      bg: "bg-green-500/10",
      href: "/tareas",
    },
    {
      label: "Eventos Esta Semana",
      value: data?.stats.eventsThisWeek ?? 0,
      icon: Calendar,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      href: "/eventos",
    },
    {
      label: "Cobros Pendientes",
      value: formatCurrency(data?.stats.cobrosAmount ?? 0),
      icon: DollarSign,
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      href: "/cobros",
    },
    {
      label: "Equipo Dañado",
      value: data?.stats.damagedEquipment ?? 0,
      icon: AlertTriangle,
      color: "text-red-400",
      bg: "bg-red-500/10",
      href: "/inventario",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Cargando dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchDashboard}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Bienvenido, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {formattedDate}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => router.push("/tareas")}
          >
            Nueva Tarea
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Calendar className="h-4 w-4" />}
            onClick={() => router.push("/eventos")}
          >
            Nuevo Evento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {statCards.map((card) => (
          <Card
            key={card.label}
            variant="bordered"
            className="p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => router.push(card.href)}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {card.label}
              </span>
              <div className={cn("p-2 rounded-lg", card.bg)}>
                <card.icon className={cn("h-4 w-4", card.color)} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {card.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card variant="bordered" className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Resumen de Actividad
              </h2>
            </div>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1f2937",
                      border: "1px solid #374151",
                      borderRadius: "0.5rem",
                      color: "#f9fafb",
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} fill="var(--bar-fill, #3b82f6)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card variant="bordered" className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Tareas para Hoy
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => router.push("/tareas")}>
                Ver todas <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>

            {(!data?.tasksDueToday || data.tasksDueToday.length === 0) ? (
              <EmptyState
                title="Sin tareas para hoy"
                description="No hay tareas programadas para el día de hoy."
              />
            ) : (
              <div className="space-y-3">
                {data.tasksDueToday.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                    onClick={() => router.push("/tareas")}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "h-2 w-2 rounded-full flex-shrink-0",
                        task.priority === "MEDIA" && "bg-yellow-400",
                        task.priority === "ALTA" && "bg-orange-400",
                        task.priority === "URGENTE" && "bg-red-400",
                        task.priority === "BAJA" && "bg-gray-400",
                      )} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge
                            size="sm"
                            color={taskStatusColor(task.status)}
                          >
                            {taskStatusLabel(task.status)}
                          </Badge>
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assignedTo?.name || "Sin asignar"}
                          </span>
                        </div>
                      </div>
                    </div>
                    {task.dueDate && (
                      <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card variant="bordered" className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-purple-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Resumen Diario IA
              </h2>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
              {data?.dailyReport || "Generando resumen con inteligencia artificial..."}
            </p>
          </Card>

          <Card variant="bordered" className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Actividad Reciente
              </h2>
            </div>

            {(!data?.recentActivity || data.recentActivity.length === 0) ? (
              <EmptyState
                title="Sin actividad reciente"
                description="No hay actividad registrada aún."
              />
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {data.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex gap-3">
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-gray-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="font-medium">{activity.user?.name || "Usuario"}</span>{" "}
                        {activity.action}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatDate(activity.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {isAdminOrOwner && compliance && (
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Cumplimiento del Equipo Hoy
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push("/cumplimiento")}>
              Ver detalle <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {compliance.totalComplianceRate.toFixed(0)}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Cumplimiento General</p>
              <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    compliance.totalComplianceRate >= 80
                      ? "bg-green-500"
                      : compliance.totalComplianceRate >= 50
                      ? "bg-orange-400"
                      : "bg-red-500"
                  )}
                  style={{ width: `${compliance.totalComplianceRate}%` }}
                />
              </div>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {compliance.activeUsers}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Usuarios Activos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {compliance.inactiveUsers}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Sin Actividad</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {compliance.totalPendingTasks}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tareas Pendientes</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
