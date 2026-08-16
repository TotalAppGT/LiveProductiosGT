"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Users,
  CheckSquare,
  TrendingUp,
  MessageCircle,
  Eye,
  DollarSign,
  AlertTriangle,
  Send,
  Clock,
  UserCheck,
  UserX,
} from "lucide-react";
import { format, formatDistanceToNow, isToday } from "date-fns";
import { es } from "date-fns/locale";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, roleLabel, roleColor } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

interface UserAccess {
  userId: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  lastAccess: string | null;
  accessCount: number;
  completedTasks: number;
  assignedTasks: number;
  complianceRate: number;
  income: number;
}

interface MonitoringData {
  activeUsersToday: number;
  totalAccesses: number;
  tasksCompletedToday: number;
  overallCompliance: number;
  users: UserAccess[];
}

export default function MonitoreoPage() {
  const { user: currentUser, token } = useAuth();
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("HOY");
  const [sendingReminder, setSendingReminder] = useState<Set<string>>(new Set());
  const [sendingMassReminder, setSendingMassReminder] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);

  const canAccess = currentUser?.role === "DUENO" || currentUser?.role === "ADMIN" || currentUser?.role === "JEFE";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      let filter = "today";
      if (activeTab === "SEMANA") filter = "week";
      else if (activeTab === "MES") filter = "month";

      const res = await fetch(`/api/compliance?filter=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar datos");
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        setData({
          activeUsersToday: d.activeUsers || 0,
          totalAccesses: d.totalAccesses || 0,
          tasksCompletedToday: d.tasksCompletedToday || d.completedTasks || 0,
          overallCompliance: d.totalComplianceRate || 0,
          users: (d.users || d.userDetails || []).map((u: Record<string, unknown>) => ({
            userId: u.userId || u.id,
            name: u.name || u.userName,
            email: u.email || "",
            role: u.role || "EMPLEADO",
            avatar: u.avatar || null,
            lastAccess: u.lastAccess || null,
            accessCount: u.accessCount || u.accesses || 0,
            completedTasks: u.completedTasks || 0,
            assignedTasks: u.assignedTasks || u.pendingTasks || 0,
            complianceRate: u.complianceRate || u.compliance || 0,
            income: u.income || 0,
          })),
        });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, activeTab]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function sendReminder(user: UserAccess) {
    setSendingReminder((prev) => new Set(prev).add(user.userId));
    try {
      const res = await fetch("/api/whatsapp/send-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user.userId, type: "reminder" }),
      });
      if (res.ok) {
        toast.success(`Recordatorio enviado a ${user.name}`);
      } else {
        throw new Error("Error");
      }
    } catch {
      toast.error("Error al enviar recordatorio");
    } finally {
      setSendingReminder((prev) => {
        const next = new Set(prev);
        next.delete(user.userId);
        return next;
      });
    }
  }

  async function sendMassReminder() {
    if (!data) return;
    const inactiveUsers = data.users.filter((u) => !u.lastAccess || !isToday(new Date(u.lastAccess)));
    if (inactiveUsers.length === 0) {
      toast.success("Todos los usuarios han accedido hoy");
      return;
    }
    setSendingMassReminder(true);
    try {
      const res = await fetch("/api/whatsapp/send-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userIds: inactiveUsers.map((u) => u.userId),
          type: "mass-reminder",
        }),
      });
      if (res.ok) {
        toast.success(`Recordatorios enviados a ${inactiveUsers.length} usuarios`);
      } else {
        throw new Error("Error");
      }
    } catch {
      toast.error("Error al enviar recordatorios");
    } finally {
      setSendingMassReminder(false);
    }
  }

  function formatRelativeTime(dateStr: string | null): { text: string; highlight: boolean } {
    if (!dateStr) return { text: "No ha entrado hoy", highlight: true };
    const date = new Date(dateStr);
    if (isToday(date)) {
      return { text: `Hace ${formatDistanceToNow(date, { locale: es })}`, highlight: false };
    }
    return { text: format(date, "dd/MM/yyyy HH:mm"), highlight: true };
  }

  function getComplianceBarColor(rate: number): string {
    if (rate >= 80) return "bg-green-500";
    if (rate >= 50) return "bg-yellow-500";
    return "bg-red-500";
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={<Activity className="h-16 w-16" />}
          title="Acceso restringido"
          description="Solo Dueño, Administrador o Jefe pueden ver el monitoreo."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner size="lg" text="Cargando monitoreo..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-500 mb-4">{error}</p>
        <Button variant="outline" onClick={fetchData}>Reintentar</Button>
      </div>
    );
  }

  const inactiveUsers = data?.users.filter((u) => !u.lastAccess || !isToday(new Date(u.lastAccess))) || [];

  const headerStats = [
    { label: "Usuarios activos hoy", value: data?.activeUsersToday ?? 0, icon: UserCheck, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Total accesos", value: data?.totalAccesses ?? 0, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Tareas completadas", value: data?.tasksCompletedToday ?? 0, icon: CheckSquare, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Cumplimiento general", value: `${(data?.overallCompliance ?? 0).toFixed(0)}%`, icon: TrendingUp, color: "text-orange-400", bg: "bg-orange-500/10" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Monitoreo</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Actividad y acceso del personal
          </p>
        </div>
        <Button
          variant="warning"
          size="sm"
          leftIcon={<Send className="h-4 w-4" />}
          onClick={sendMassReminder}
          isLoading={sendingMassReminder}
          disabled={inactiveUsers.length === 0}
        >
          Enviar recordatorio masivo {inactiveUsers.length > 0 && `(${inactiveUsers.length})`}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {headerStats.map((stat) => (
          <Card key={stat.label} variant="bordered" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</span>
              <div className={cn("p-2 rounded-lg", stat.bg)}>
                <stat.icon className={cn("h-4 w-4", stat.color)} />
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="HOY" value={activeTab} onValueChange={setActiveTab}>
        <TabList>
          <Tab value="HOY">Hoy</Tab>
          <Tab value="SEMANA">Esta semana</Tab>
          <Tab value="MES">Este mes</Tab>
        </TabList>

        {["HOY", "SEMANA", "MES"].map((tab) => (
          <TabPanel key={tab} value={tab}>
            {!data || data.users.length === 0 ? (
              <EmptyState
                icon={<Users className="h-16 w-16" />}
                title="Sin datos"
                description="No hay información de acceso para este período."
              />
            ) : (
              <div className="space-y-3">
                {data.users.map((u) => {
                  const relativeTime = formatRelativeTime(u.lastAccess);
                  return (
                    <Card
                      key={u.userId}
                      variant="bordered"
                      className={cn(
                        "p-4 cursor-pointer hover:border-blue-400 transition-colors",
                        relativeTime.highlight && "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/5"
                      )}
                      onClick={() => setSelectedUser(u)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar name={u.name} src={u.avatar} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {u.name}
                              </p>
                              <Badge size="sm" color={roleColor(u.role)}>
                                {roleLabel(u.role)}
                              </Badge>
                              {relativeTime.highlight && (
                                <Badge size="sm" color="red" dot>
                                  No ha entrado hoy
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                              <span className={cn("flex items-center gap-1", relativeTime.highlight && "text-red-600 dark:text-red-400 font-medium")}>
                                <Clock className="h-3 w-3" />
                                {relativeTime.text}
                              </span>
                              <span>Accesos hoy: {u.accessCount}</span>
                              <span className="flex items-center gap-1">
                                <CheckSquare className="h-3 w-3" />
                                {u.completedTasks}/{u.assignedTasks + u.completedTasks} tareas
                              </span>
                              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                                <DollarSign className="h-3 w-3" />
                                Q {u.income.toLocaleString("es-GT", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[200px]">
                                <div
                                  className={cn("h-full rounded-full transition-all", getComplianceBarColor(u.complianceRate))}
                                  style={{ width: `${Math.min(100, u.complianceRate)}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                {u.complianceRate.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {relativeTime.highlight && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => sendReminder(u)}
                              isLoading={sendingReminder.has(u.userId)}
                              leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
                            >
                              Recordatorio
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<Eye className="h-3.5 w-3.5" />}
                            onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }}
                            title="Ver tareas"
                          >
                            Tareas
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={<DollarSign className="h-3.5 w-3.5" />}
                            onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }}
                            title="Ver ingresos"
                          >
                            Ingresos
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabPanel>
        ))}
      </Tabs>
    </div>
  );
}
