"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  CheckSquare,
  CalendarCheck,
  Calendar,
  TrendingUp,
  AlertTriangle,
  MessageCircle,
  Brain,
  RefreshCw,
  Send,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, taskStatusLabel, taskPriorityColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate, getDayName, cn } from "@/lib/utils";

interface DashboardStats {
  pendingTasks: number;
  urgentTasks: number;
  completedTasksToday: number;
  totalTasksToday: number;
  eventsThisWeek: number;
  personalCompliance: number;
}

interface AccessUser {
  userId: string;
  name: string;
  role: string;
  avatar: string | null;
  accessCount: number;
  active: boolean;
}

interface TaskDueToday {
  id: string;
  title: string;
  priority: string;
  status: string;
  category: string;
  dueDate?: string;
  assignedTo?: { name: string } | null;
}

interface ComplianceMember {
  userId: string;
  user: { id: string; name: string; avatar: string | null; role: string };
  tasksCompleted: number;
  tasksPending: number;
  completionRate: number;
  accessCount?: number;
}

interface AIInsight {
  summary: string;
  suggestions: string[];
  criticalTasks: string[];
}

interface CommentModalState {
  open: boolean;
  taskId: string;
  taskTitle: string;
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [todayTasks, setTodayTasks] = useState<TaskDueToday[]>([]);
  const [compliance, setCompliance] = useState<ComplianceMember[]>([]);
  const [aiInsight, setAIInsight] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [welcomeGreeting, setWelcomeGreeting] = useState("");
  const [formattedDate, setFormattedDate] = useState("");
  const [sendingAlert, setSendingAlert] = useState<Set<string>>(new Set());
  const [sendingMass, setSendingMass] = useState(false);
  const [postponingTask, setPostponingTask] = useState<Set<string>>(new Set());
  const [completingTask, setCompletingTask] = useState<Set<string>>(new Set());
  const [commentModal, setCommentModal] = useState<CommentModalState>({ open: false, taskId: "", taskTitle: "" });
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [refreshingAI, setRefreshingAI] = useState(false);

  const isAdminOrOwner = user?.role === "DUENO" || user?.role === "ADMIN";
  const isManager = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  useEffect(() => {
    const now = new Date();
    const hour = now.getHours();
    if (hour < 12) setWelcomeGreeting("Buenos días");
    else if (hour < 18) setWelcomeGreeting("Buenas tardes");
    else setWelcomeGreeting("Buenas noches");
    setFormattedDate(`${getDayName(now)} ${now.getDate()} de ${now.toLocaleDateString("es-GT", { month: "long" })}, ${now.getFullYear()}`);
  }, []);

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const [dashRes, accessRes, tasksRes, complianceRes] = await Promise.all([
        fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/access?filter=today", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/tasks/daily", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/compliance?filter=today", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (dashRes.ok) {
        const json = await dashRes.json();
        if (json.success && json.data) {
          const d = json.data;
          const totalToday = d.tasksDueToday?.length || 0;
          const completedToday = d.stats.completedTasksToday || 0;
          const urgentCount = d.tasksDueToday?.filter((t: TaskDueToday) => t.priority === "URGENTE").length || 0;
          setTodayTasks(d.tasksDueToday || []);
          setStats({
            pendingTasks: d.stats.pendingTasks || 0,
            urgentTasks: urgentCount,
            completedTasksToday: completedToday,
            totalTasksToday: totalToday,
            eventsThisWeek: d.stats.eventsThisWeek || 0,
            personalCompliance: totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 100,
          });
        }
      }

      if (accessRes.ok) {
        const json = await accessRes.json();
        if (json.success && json.data) {
          setAccessUsers(json.data || []);
        }
      }

      if (tasksRes.ok) {
        const json = await tasksRes.json();
        if (json.success && json.data) {
          const flat: TaskDueToday[] = [];
          const tasksObj = json.data.tasks || {};
          for (const cat of Object.keys(tasksObj)) {
            for (const t of tasksObj[cat]) {
              flat.push(t);
            }
          }
          if (flat.length > 0) setTodayTasks(flat);
        }
      }

      if (complianceRes.ok) {
        const json = await complianceRes.json();
        if (json.success && json.data) {
          const staff = json.data.staff || [];
          const enriched = staff.map((m: ComplianceMember) => {
            const accessUser = accessUsers.find((a) => a.userId === m.userId);
            return { ...m, accessCount: accessUser?.accessCount || 0 };
          });
          setCompliance(enriched);
        }
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

  const fetchAIInsight = useCallback(async () => {
    if (!token) return;
    setRefreshingAI(true);
    try {
      const res = await fetch("/api/ai/suggest", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setAIInsight(json.data);
        }
      }
    } catch { /* */ } finally {
      setRefreshingAI(false);
    }
  }, [token]);

  useEffect(() => {
    if (!loading) fetchAIInsight();
  }, [loading, fetchAIInsight]);

  async function sendAlert(userId: string, userName: string) {
    setSendingAlert((prev) => new Set(prev).add(userId));
    try {
      const res = await fetch("/api/whatsapp/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, type: "reminder" }),
      });
      if (res.ok) toast.success(`Alerta enviada a ${userName}`);
      else throw new Error("Error");
    } catch {
      toast.error("Error al enviar alerta");
    } finally {
      setSendingAlert((prev) => { const n = new Set(prev); n.delete(userId); return n; });
    }
  }

  async function sendMassAlert() {
    const nonCompliant = compliance.filter((m) => m.completionRate < 50);
    if (nonCompliant.length === 0) { toast.success("Todos están cumpliendo bien"); return; }
    setSendingMass(true);
    try {
      const res = await fetch("/api/whatsapp/send-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userIds: nonCompliant.map((m) => m.userId), type: "mass-reminder" }),
      });
      if (res.ok) toast.success(`Alertas enviadas a ${nonCompliant.length} usuarios`);
      else throw new Error("Error");
    } catch {
      toast.error("Error al enviar alertas masivas");
    } finally {
      setSendingMass(false);
    }
  }

  async function handleComplete(taskId: string) {
    setCompletingTask((prev) => new Set(prev).add(taskId));
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "COMPLETADA" }),
      });
      if (res.ok) {
        toast.success("Tarea completada");
        fetchDashboard();
      } else throw new Error("Error");
    } catch {
      toast.error("Error al completar tarea");
    } finally {
      setCompletingTask((prev) => { const n = new Set(prev); n.delete(taskId); return n; });
    }
  }

  async function handlePostpone(taskId: string) {
    setPostponingTask((prev) => new Set(prev).add(taskId));
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "REPROGRAMADA", rescheduledTo: tomorrow.toISOString(), dueDate: tomorrow.toISOString() }),
      });
      if (res.ok) {
        toast.success("Tarea pospuesta para mañana");
        fetchDashboard();
      } else throw new Error("Error");
    } catch {
      toast.error("Error al posponer tarea");
    } finally {
      setPostponingTask((prev) => { const n = new Set(prev); n.delete(taskId); return n; });
    }
  }

  function openCommentModal(taskId: string, taskTitle: string) {
    setCommentModal({ open: true, taskId, taskTitle });
    setCommentText("");
  }

  async function submitComment() {
    if (!commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/tasks/${commentModal.taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        toast.success("Comentario agregado");
        setCommentModal({ open: false, taskId: "", taskTitle: "" });
      } else throw new Error("Error");
    } catch {
      toast.error("Error al agregar comentario");
    } finally {
      setSubmittingComment(false);
    }
  }

  function getPriorityBorder(priority: string): string {
    const map: Record<string, string> = {
      URGENTE: "border-l-red-500",
      ALTA: "border-l-orange-400",
      MEDIA: "border-l-yellow-400",
      BAJA: "border-l-gray-400",
    };
    return map[priority] || "border-l-gray-300";
  }

  function getAccessColor(count: number): string {
    if (count >= 4) return "bg-green-500/10 border-green-200 dark:border-green-800";
    if (count >= 1) return "bg-yellow-500/10 border-yellow-200 dark:border-yellow-800";
    return "bg-red-500/10 border-red-200 dark:border-red-800";
  }

  function getAccessTextColor(count: number): string {
    if (count >= 4) return "text-green-600 dark:text-green-400";
    if (count >= 1) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  }

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
          <Button variant="outline" onClick={fetchDashboard}>Reintentar</Button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Tareas Pendientes",
      value: stats?.pendingTasks ?? 0,
      icon: CheckSquare,
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      badge: stats?.urgentTasks && stats.urgentTasks > 0 ? `${stats.urgentTasks} urgentes` : undefined,
      badgeColor: "red" as const,
    },
    {
      label: "Tareas Completadas Hoy",
      value: stats ? `${stats.completedTasksToday}/${stats.totalTasksToday}` : "0/0",
      icon: CalendarCheck,
      color: "text-green-400",
      bg: "bg-green-500/10",
      subText: stats ? `${stats.personalCompliance}% del total` : "0% del total",
    },
    {
      label: "Eventos Esta Semana",
      value: stats?.eventsThisWeek ?? 0,
      icon: Calendar,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Mi Cumplimiento",
      value: `${stats?.personalCompliance ?? 100}%`,
      icon: TrendingUp,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      progress: stats?.personalCompliance ?? 100,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {welcomeGreeting}, {user?.name?.split(" ")[0]}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{formattedDate}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => (
          <Card key={card.label} variant="bordered" className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</span>
              <div className={cn("p-2 rounded-lg", card.bg)}>
                <card.icon className={cn("h-4 w-4", card.color)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xl font-bold text-gray-900 dark:text-white">{card.value}</p>
              {card.badge && (
                <Badge size="sm" color={card.badgeColor}>{card.badge}</Badge>
              )}
            </div>
            {card.subText && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.subText}</p>
            )}
            {card.progress !== undefined && (
              <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    card.progress >= 80 ? "bg-green-500" : card.progress >= 50 ? "bg-orange-400" : "bg-red-500"
                  )}
                  style={{ width: `${card.progress}%` }}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      {isAdminOrOwner && (
        <Card variant="bordered" className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Control de Accesos</h2>
            <span className="text-xs text-gray-400 ml-auto">{accessUsers.length} usuarios</span>
          </div>
          {accessUsers.length === 0 ? (
            <EmptyState title="Sin datos de acceso" description="No hay registros de acceso para hoy." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {accessUsers.map((au) => (
                <Card
                  key={au.userId}
                  variant="bordered"
                  className={cn("p-3", getAccessColor(au.accessCount))}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={au.name} src={au.avatar} size="sm" />
                    <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{au.name.split(" ")[0]}</span>
                  </div>
                  <p className={cn("text-lg font-bold", getAccessTextColor(au.accessCount))}>
                    {au.accessCount} acceso{au.accessCount !== 1 ? "s" : ""}
                  </p>
                  {au.accessCount < 4 && (
                    <Button
                      variant="warning"
                      size="sm"
                      className="mt-2 w-full text-xs"
                      onClick={() => sendAlert(au.userId, au.name)}
                      isLoading={sendingAlert.has(au.userId)}
                      leftIcon={<MessageCircle className="h-3 w-3" />}
                    >
                      Enviar alerta
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card variant="bordered" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Mis Tareas de Hoy</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/tareas")}>
            Ver todas
          </Button>
        </div>
        {todayTasks.length === 0 ? (
          <EmptyState
            title="No tienes tareas para hoy"
            description="¡Buen trabajo! No tienes tareas pendientes programadas para el día de hoy."
          />
        ) : (
          <div className="space-y-3">
            {todayTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/50 border-l-4 border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-shadow",
                  getPriorityBorder(task.priority)
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge size="sm" color={taskPriorityColor(task.priority)}>
                      {task.priority === "URGENTE" ? "Urgente" : task.priority === "ALTA" ? "Alta" : task.priority === "MEDIA" ? "Media" : "Baja"}
                    </Badge>
                    <Badge size="sm" color="gray">
                      {taskStatusLabel(task.status)}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => handleComplete(task.id)}
                    isLoading={completingTask.has(task.id)}
                    leftIcon={<CheckSquare className="h-3.5 w-3.5" />}
                  >
                    Completar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePostpone(task.id)}
                    isLoading={postponingTask.has(task.id)}
                  >
                    Posponer
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openCommentModal(task.id, task.title)}
                    leftIcon={<MessageCircle className="h-3.5 w-3.5" />}
                  >
                    Comentar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isManager && (
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Cumplimiento del Equipo</h2>
            </div>
            <Button variant="warning" size="sm" onClick={sendMassAlert} isLoading={sendingMass} leftIcon={<Send className="h-4 w-4" />}>
              Alerta masiva
            </Button>
          </div>
          {compliance.length === 0 ? (
            <EmptyState title="Sin datos de cumplimiento" description="No hay información de cumplimiento para hoy." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Usuario</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Accesos hoy</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Tareas</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Cumplimiento</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Alerta</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.map((m) => (
                    <tr key={m.userId} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={m.user.name} src={m.user.avatar} size="xs" />
                          <span className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{m.user.name}</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <span className={cn("font-bold", getAccessTextColor(m.accessCount || 0))}>{m.accessCount || 0}</span>
                      </td>
                      <td className="text-center py-2.5 px-3 text-gray-700 dark:text-gray-300">
                        {m.tasksCompleted}/{m.tasksCompleted + m.tasksPending}
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="h-1.5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                m.completionRate >= 80 ? "bg-green-500" : m.completionRate >= 50 ? "bg-orange-400" : "bg-red-500"
                              )}
                              style={{ width: `${m.completionRate}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{m.completionRate}%</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => sendAlert(m.userId, m.user.name)}
                          isLoading={sendingAlert.has(m.userId)}
                          leftIcon={<MessageCircle className="h-3 w-3" />}
                        >
                          {m.completionRate < 50 ? "Alerta" : "Recordar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Card variant="bordered" className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Insights de LUNA</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchAIInsight} isLoading={refreshingAI} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Actualizar
          </Button>
        </div>
        {aiInsight ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{aiInsight.summary}</p>
            {aiInsight.suggestions.length > 0 && (
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">Sugerencias</p>
                <ul className="space-y-1">
                  {aiInsight.suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-purple-600 dark:text-purple-400 flex items-start gap-1.5">
                      <span className="mt-0.5">-</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            icon={<Brain className="h-12 w-12" />}
            title="Sin insights aún"
            description="LUNA está analizando los datos del día. Haz clic en Actualizar para obtener insights."
          />
        )}
      </Card>

      <Modal
        isOpen={commentModal.open}
        onClose={() => setCommentModal({ open: false, taskId: "", taskTitle: "" })}
        title={`Comentar: ${commentModal.taskTitle}`}
      >
        <div className="space-y-4 p-1">
          <textarea
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            rows={3}
            placeholder="Escribe tu comentario..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCommentModal({ open: false, taskId: "", taskTitle: "" })}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submitComment}
              isLoading={submittingComment}
              disabled={!commentText.trim()}
            >
              Enviar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
