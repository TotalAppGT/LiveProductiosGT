"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Play,
  CalendarClock,
  MessageSquare,
  MoreHorizontal,
  LayoutList,
  Columns3,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  Clock4,
  Paperclip,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, taskStatusLabel, taskStatusColor, taskPriorityLabel, taskPriorityColor } from "@/components/ui/Badge";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn, getWeekDay } from "@/lib/utils";
import type { Task, TaskStatus, User, ApiResponse, PaginatedResponse } from "@/types";

const STATUS_TABS = [
  { value: "MIS_TAREAS", label: "Mis Tareas" },
  { value: "TODAS", label: "Todas" },
  { value: "PENDIENTE", label: "Pendientes" },
  { value: "EN_PROCESO", label: "En Proceso" },
  { value: "COMPLETADA", label: "Completadas" },
  { value: "HOY", label: "Hoy" },
  { value: "SEMANA", label: "Esta Semana" },
  { value: "MES", label: "Este Mes" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Todas las categorías" },
  { value: "PRE_EVENTO", label: "🎪 Pre Evento" },
  { value: "EVENTO", label: "🚀 Evento" },
  { value: "POST_EVENTO", label: "🏁 Post Evento" },
  { value: "COTIZACION", label: "Cotización" },
  { value: "COBRO", label: "Cobro" },
  { value: "INVENTARIO", label: "Inventario" },
  { value: "VEHICULO", label: "Vehículo" },
  { value: "PERSONAL", label: "Personal" },
  { value: "BODEGA", label: "Bodega" },
  { value: "MANTENIMIENTO", label: "Mantenimiento" },
  { value: "ADMINISTRACION", label: "Administración" },
  { value: "OTRO", label: "Otro" },
];

export default function TareasPage() {
  const { user, token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("MIS_TAREAS");
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "sheet">("sheet");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assignedFilter, setAssignedFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [quickTitle, setQuickTitle] = useState("");
  const [quickCategory, setQuickCategory] = useState("PRE_EVENTO");
  const [commentModal, setCommentModal] = useState<{ open: boolean; taskId: string; taskTitle: string }>({ open: false, taskId: "", taskTitle: "" });
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const isAdminOrJefe = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (activeTab === "MIS_TAREAS") {
        if (user?.id) params.set("assignedToId", user.id);
      } else if (activeTab !== "TODAS" && activeTab !== "HOY" && activeTab !== "SEMANA" && activeTab !== "MES") {
        params.set("status", activeTab);
      }
      if (categoryFilter) params.set("category", categoryFilter);
      if (assignedFilter && activeTab !== "MIS_TAREAS") params.set("assignedToId", assignedFilter);
      if (typeFilter) params.set("type", typeFilter);
      if (search) params.set("search", search);
      if (activeTab === "HOY") {
        const today = new Date().toISOString().split("T")[0];
        params.set("dueDate", today);
      }
      if (activeTab === "SEMANA") {
        const now = new Date();
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        params.set("dueDateFrom", monday.toISOString().split("T")[0]);
        params.set("dueDateTo", sunday.toISOString().split("T")[0]);
      }
      if (activeTab === "MES") {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        params.set("dueDateFrom", first.toISOString().split("T")[0]);
        params.set("dueDateTo", last.toISOString().split("T")[0]);
      }

      const res = await fetch(`/api/tasks?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar tareas");
      const json: PaginatedResponse<Task> = await res.json();
      if (json.success) {
        setTasks(json.data);
      } else {
        setTasks([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, activeTab, categoryFilter, assignedFilter, typeFilter, search, user?.id]);

  const fetchUsers = useCallback(async () => {
    if (!token || !isAdminOrJefe) return;
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setUsers(json.data);
      }
    } catch {
      // silent
    }
  }, [token, isAdminOrJefe]);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  async function updateTaskStatus(taskId: string, status: TaskStatus) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const json: ApiResponse<Task> = await res.json();
      if (json.success) {
        toast.success("Tarea actualizada");
        fetchTasks();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  }

  async function batchUpdateStatus(status: TaskStatus) {
    if (selectedTasks.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedTasks).map((id) => updateTaskStatus(id, status))
      );
      setSelectedTasks(new Set());
      toast.success(`${selectedTasks.size} tareas actualizadas`);
    } catch {
      toast.error("Error en actualización masiva");
    }
  }

  async function quickAddTask() {
    const title = quickTitle.trim();
    if (!title) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description: "",
          priority: "MEDIA",
          category: quickCategory,
          type: "DINAMICA",
          frequency: "DIARIA",
          assignedToId: user?.id,
          dueDate: new Date(),
        }),
      });
      const json: ApiResponse<Task> = await res.json();
      if (json.success) {
        toast.success("Tarea agregada");
        setQuickTitle("");
        fetchTasks();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch {
      toast.error("Error al agregar tarea");
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("¿Seguro que deseas eliminar esta tarea? Esta acción no se puede deshacer.")) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: ApiResponse<Task> = await res.json();
      if (json.success) {
        toast.success("Tarea eliminada");
        fetchTasks();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
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
        setCommentText("");
        fetchTasks();
      } else throw new Error("Error");
    } catch {
      toast.error("Error al agregar comentario");
    } finally {
      setSubmittingComment(false);
    }
  }

  function toggleExpand(taskId: string) {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function toggleSelect(taskId: string) {
    setSelectedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  const filteredTasks = tasks.filter((task) => {
    if (activeTab === "HOY") {
      const today = new Date().toISOString().split("T")[0];
      return task.dueDate?.startsWith(today);
    }
    if (activeTab === "SEMANA") {
      const now = new Date();
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + (7 - now.getDay()));
      return task.dueDate && new Date(task.dueDate) <= weekEnd && new Date(task.dueDate) >= now;
    }
    return true;
  });

  const kanbanColumns: Record<TaskStatus, Task[]> = {
    PENDIENTE: [],
    EN_PROCESO: [],
    COMPLETADA: [],
    REPROGRAMADA: [],
    CANCELADA: [],
  };

  filteredTasks.forEach((task) => {
    if (kanbanColumns[task.status]) {
      kanbanColumns[task.status].push(task);
    }
  });

  // Ordenar cada columna cronológicamente por fecha/hora
  Object.values(kanbanColumns).forEach((col) => {
    col.sort((a, b) => {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      return da - db;
    });
  });

  // Agrupación tipo hoja de cálculo: Pre Evento → Evento → Post Evento → Otros
  // Dentro de cada fase: Fijas primero, luego Variables; todo ordenado por día y hora
  // Las completadas se quitan del listado (salvo en la pestaña Completadas)
  const sheetOrder = [
    { key: "PRE_EVENTO", label: "🎪 Pre Evento", bg: "bg-blue-600" },
    { key: "EVENTO", label: "🚀 Evento", bg: "bg-purple-600" },
    { key: "POST_EVENTO", label: "🏁 Post Evento", bg: "bg-emerald-600" },
    { key: "OTRO", label: "Otras tareas", bg: "bg-gray-600" },
  ];
  const sortByDayHour = (a: Task, b: Task) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    if (da !== db) return da - db;
    const pa = a.priority === "URGENTE" || a.priority === "ALTA" ? 1 : 0;
    const pb = b.priority === "URGENTE" || b.priority === "ALTA" ? 1 : 0;
    return pb - pa;
  };
  const visibleTasks = activeTab === "COMPLETADA"
    ? filteredTasks.filter((t) => t.status === "COMPLETADA")
    : filteredTasks.filter((t) => t.status !== "COMPLETADA" && t.status !== "CANCELADA");
  const sheetGroups = sheetOrder.flatMap((g) => {
    const phaseTasks = visibleTasks.filter((t) => g.key === "OTRO" ? !["PRE_EVENTO", "EVENTO", "POST_EVENTO"].includes(t.category) : t.category === g.key);
    const fijas = phaseTasks.filter((t) => t.type === "FIJA").sort(sortByDayHour);
    const variables = phaseTasks.filter((t) => t.type !== "FIJA").sort(sortByDayHour);
    const groups: { key: string; label: string; bg: string; tasks: Task[] }[] = [];
    if (fijas.length > 0) groups.push({ ...g, label: `${g.label} · 🔁 Fijas`, tasks: fijas });
    if (variables.length > 0) groups.push({ ...g, label: `${g.label} · Variables`, tasks: variables });
    return groups;
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tareas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona y asigna tareas al equipo
          </p>
        </div>
        <div className="flex gap-2">
          {isAdminOrJefe && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Users className="h-4 w-4" />}
              onClick={() => setShowBulkAssign(true)}
            >
              Asignación Masiva
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Nueva Tarea
          </Button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              try {
                const res = await fetch("/api/tasks/template", {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) {
                  const json = await res.json().catch(() => ({}));
                  toast.error(json.error || "Error al descargar plantilla");
                  return;
                }
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "plantilla-tareas.xlsx";
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
              } catch {
                toast.error("Error al descargar plantilla");
              }
            }}
            className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            📥 Plantilla XLSX
          </button>
          <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
            📤 Cargar masiva
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append("file", file);
                try {
                  const res = await fetch("/api/tasks/bulk", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                  });
                  const json = await res.json();
                  if (json.success) {
                    toast.success(json.message || `${json.created} tareas creadas`);
                    fetchTasks();
                  } else toast.error(json.error || "Error");
                } catch {
                  toast.error("Error al cargar");
                }
              }}
            />
          </label>
        </div>
      </div>

      {selectedTasks.size > 0 && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            {selectedTasks.size} seleccionada{selectedTasks.size > 1 ? "s" : ""}
          </span>
          <div className="flex gap-1 ml-auto">
            <Button variant="success" size="sm" onClick={() => batchUpdateStatus("COMPLETADA")}>
              Completar
            </Button>
            <Button variant="outline" size="sm" onClick={() => batchUpdateStatus("PENDIENTE")}>
              Pendiente
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTasks(new Set())}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <select
          value={activeTab === "MIS_TAREAS" ? "" : assignedFilter}
          onChange={(e) => {
            setAssignedFilter(e.target.value);
            if (e.target.value) setActiveTab("TODAS");
            else setActiveTab("MIS_TAREAS");
          }}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white sm:w-48"
        >
          <option value="">👤 Ver: Mis Tareas</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>👤 {u.name}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar tareas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Filter className="h-4 w-4" />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filtros
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={viewMode === "kanban" ? <LayoutList className="h-4 w-4" /> : <Columns3 className="h-4 w-4" />}
            onClick={() => setViewMode(viewMode === "sheet" ? "kanban" : "sheet")}
          >
            {viewMode === "sheet" ? "Kanban" : "Hoja"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { value: "", label: "Todas" },
          { value: "PRE_EVENTO", label: "🎪 Pre Evento", color: "border-blue-300 text-blue-700 bg-blue-50" },
          { value: "EVENTO", label: "🚀 Evento", color: "border-purple-300 text-purple-700 bg-purple-50" },
          { value: "POST_EVENTO", label: "🏁 Post Evento", color: "border-green-300 text-green-700 bg-green-50" },
        ].map((chip) => (
          <button
            key={chip.value}
            onClick={() => setCategoryFilter(chip.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              categoryFilter === chip.value
                ? chip.color || "border-blue-500 text-blue-700 bg-blue-50"
                : "border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Categoría
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Asignado a
            </label>
            <select
              value={assignedFilter}
              onChange={(e) => setAssignedFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Todos</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Tipo
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Todos</option>
              <option value="FIJA">Fija</option>
              <option value="DINAMICA">Dinámica</option>
            </select>
          </div>
        </div>
      )}

      <Tabs defaultValue="TODAS" value={activeTab} onValueChange={setActiveTab}>
        <TabList className="overflow-x-auto">
          {STATUS_TABS.map((tab) => (
            <Tab key={tab.value} value={tab.value}>{tab.label}</Tab>
          ))}
        </TabList>

        {STATUS_TABS.map((tab) => (
          <TabPanel key={tab.value} value={tab.value}>
            {loading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner text="Cargando tareas..." />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-500 mb-4">{error}</p>
                <Button variant="outline" onClick={fetchTasks}>Reintentar</Button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <EmptyState
                title="No hay tareas"
                description="No se encontraron tareas con los filtros actuales."
                action={{ label: "Nueva Tarea", onClick: () => setShowCreateModal(true) }}
              />
            ) : viewMode === "kanban" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:overflow-x-auto">
                {Object.entries(kanbanColumns).map(([status, columnTasks]) => (
                  <div key={status} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        {taskStatusLabel(status)}
                      </h3>
                      <Badge size="sm" color={taskStatusColor(status)}>
                        {columnTasks.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {columnTasks.map((task) => (
                        <div
                          key={task.id}
                          className={`border-l-4 rounded-lg cursor-pointer hover:shadow-md transition-shadow bg-white dark:bg-gray-800 border-y border-r border-gray-200 dark:border-gray-700 ${
                            task.priority === "URGENTE" || task.priority === "ALTA"
                              ? "border-l-red-500"
                              : task.priority === "MEDIA"
                              ? "border-l-yellow-400"
                              : "border-l-green-500"
                          }`}
                          onClick={() => toggleExpand(task.id)}
                        >
                          <div className="p-3">
                            <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                              {task.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              <Badge size="sm" color={taskPriorityColor(task.priority)}>
                                {taskPriorityLabel(task.priority)}
                              </Badge>
                              {task.type === "FIJA" && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium">
                                  🔁 {task.frequency === "SEMANAL" ? "Semanal" : task.frequency === "MENSUAL" ? "Mensual" : "Diaria"}
                                </span>
                              )}
                              {task.assignedTo && (
                                <span className="text-xs text-gray-500">
                                  {task.assignedTo.name}
                                </span>
                              )}
                            </div>
                            {task.dueDate && (
                              <p className="text-xs text-gray-400 mt-1">
                                📅 {new Date(task.dueDate).toLocaleDateString("es-GT", {weekday:"short",day:"numeric",month:"short"})} · {new Date(task.dueDate).toLocaleTimeString("es-GT", {hour:"2-digit",minute:"2-digit"})}
                              </p>
                            )}
                            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                              {task.status !== "COMPLETADA" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, "COMPLETADA"); }}
                                  className="flex-1 text-[11px] font-bold bg-green-100 hover:bg-green-200 text-green-700 rounded px-1.5 py-1"
                                  title="Completar"
                                >
                                  ✅ Hecho
                                </button>
                              )}
                              {task.status === "PENDIENTE" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, "EN_PROCESO"); }}
                                  className="flex-1 text-[11px] font-bold bg-blue-100 hover:bg-blue-200 text-blue-700 rounded px-1.5 py-1"
                                  title="En proceso"
                                >
                                  🔄 Proceso
                                </button>
                              )}
                              {task.status !== "COMPLETADA" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, "REPROGRAMADA"); }}
                                  className="flex-1 text-[11px] font-bold bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded px-1.5 py-1"
                                  title="Posponer"
                                >
                                  ⏰ Posponer
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === "sheet" ? (
              <div className="space-y-2">
                {/* Fila rápida: agregar tarea como en Excel */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
                  <select
                    value={quickCategory}
                    onChange={(e) => setQuickCategory(e.target.value)}
                    className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white"
                    title="Categoría"
                  >
                    <option value="PRE_EVENTO">🎪 Pre Evento</option>
                    <option value="EVENTO">🚀 Evento</option>
                    <option value="POST_EVENTO">🏁 Post Evento</option>
                    <option value="COTIZACION">Cotización</option>
                    <option value="INVENTARIO">Inventario</option>
                    <option value="OTRO">Otro</option>
                  </select>
                  <input
                    value={quickTitle}
                    onChange={(e) => setQuickTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && quickTitle.trim()) quickAddTask(); }}
                    placeholder="➕ Agregar tarea y presionar Enter (ej: Confirmar staff para evento sábado)"
                    className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none"
                  />
                  <Button variant="primary" size="sm" onClick={quickAddTask} disabled={!quickTitle.trim()}>
                    Agregar
                  </Button>
                </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Cabecera de hoja de cálculo */}
                <div className="grid grid-cols-12 gap-1.5 px-2 py-1.5 bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 min-w-[1000px] sticky top-0 z-10">
                  <div className="col-span-1 text-center">#</div>
                  <div className="col-span-3">Tarea</div>
                  <div className="col-span-2">Categoría</div>
                  <div className="col-span-1 text-center">Tipo</div>
                  <div className="col-span-2">Día / Hora</div>
                  <div className="col-span-1">Asignado</div>
                  <div className="col-span-1 text-center">Prio</div>
                  <div className="col-span-1 text-right">Acciones</div>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[1000px]">
                    {sheetGroups.map((group, gi) => (
                      <div key={group.key + gi}>
                        {/* Fila de fase: Pre / Evento / Post */}
                        <div className={`px-2 py-1 text-[11px] font-bold text-white ${group.bg} flex items-center justify-between sticky left-0`}>
                          <span>{group.label}</span>
                          <span className="bg-white/25 rounded-full px-2 py-0.5 text-[10px] font-semibold">{group.tasks.length}</span>
                        </div>
                        {group.tasks.map((task, idx) => (
                          <div
                            key={task.id}
                            className={`grid grid-cols-12 gap-1.5 px-2 py-1 text-[13px] items-center border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                              task.status === "COMPLETADA" ? "bg-green-50/50 dark:bg-green-900/10" : idx % 2 === 1 ? "bg-gray-50/60 dark:bg-gray-800/30" : ""
                            }`}
                          >
                            <div className="col-span-1 text-center text-[11px] text-gray-400 font-mono">{idx + 1}</div>
                            <div className="col-span-3 flex items-center gap-1.5 min-w-0">
                              <button
                                onClick={() => updateTaskStatus(task.id, task.status === "COMPLETADA" ? "PENDIENTE" : "COMPLETADA")}
                                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                  task.status === "COMPLETADA"
                                    ? "bg-green-500 border-green-500 text-white"
                                    : "border-gray-300 hover:border-green-400 hover:bg-green-50"
                                }`}
                                title={task.status === "COMPLETADA" ? "Desmarcar (volver a pendiente)" : "Marcar realizado"}
                              >
                                {task.status === "COMPLETADA" && <CheckCircle2 className="w-2.5 h-2.5" />}
                              </button>
                              <span className={`truncate ${task.status === "COMPLETADA" ? "line-through text-gray-400" : "text-gray-900 dark:text-white"}`}>
                                {task.title}
                              </span>
                            </div>
                            <div className="col-span-2 flex items-center gap-1 text-[10px]">
                              {task.category === "PRE_EVENTO" ? (
                                <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold">🎪 Pre</span>
                              ) : task.category === "EVENTO" ? (
                                <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-semibold">🚀 Evento</span>
                              ) : task.category === "POST_EVENTO" ? (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">🏁 Post</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">•</span>
                              )}
                              <span className={`text-[10px] font-semibold ${task.type === "FIJA" ? "text-indigo-600 dark:text-indigo-400" : "text-gray-400"}`}>
                                {task.type === "FIJA" ? "🔁 Fija" : "Var"}
                              </span>
                            </div>
                            <div className="col-span-2 text-[11px] text-gray-600 dark:text-gray-300 truncate">
                              {task.dueDate ? (
                                <>
                                  <span className="font-medium">{new Date(task.dueDate).toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short" })}</span>
                                  <span className="text-gray-400"> · {new Date(task.dueDate).toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}</span>
                                </>
                              ) : "—"}
                            </div>
                            <div className="col-span-1 text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {task.assignedTo?.name?.split(" ")[0] || "—"}
                            </div>
                            <div className="col-span-1 flex items-center justify-center gap-0.5">
                              <span
                                className="inline-block w-2 h-2 rounded-full"
                                style={{ backgroundColor: task.priority === "URGENTE" || task.priority === "ALTA" ? "#ef4444" : task.priority === "MEDIA" ? "#eab308" : "#22c55e" }}
                                title={task.priority}
                              />
                              {task.status === "REPROGRAMADA" && <span className="text-[9px]" title="Pospuesta">🟣</span>}
                              {task.status === "EN_PROCESO" && <span className="text-[9px]" title="En proceso">🔄</span>}
                            </div>
                            <div className="col-span-1 flex items-center justify-end gap-0.5">
                              {task.status !== "COMPLETADA" && (
                                <button
                                  onClick={() => updateTaskStatus(task.id, "EN_PROCESO")}
                                  className="p-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-500"
                                  title="En proceso"
                                >
                                  <Play className="w-3 h-3" />
                                </button>
                              )}
                              {task.status !== "COMPLETADA" && (
                                <button
                                  onClick={() => updateTaskStatus(task.id, "REPROGRAMADA")}
                                  className="p-0.5 rounded hover:bg-yellow-50 dark:hover:bg-yellow-900/30 text-yellow-600"
                                  title="Posponer"
                                >
                                  <CalendarClock className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => { setCommentModal({ open: true, taskId: task.id, taskTitle: task.title }); setCommentText(""); }}
                                className="p-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                                title="Comentar"
                              >
                                <MessageSquare className="w-3 h-3" />
                              </button>
                              {(user?.role === "DUENO" || user?.role === "ADMIN") && (
                                <button
                                  onClick={() => deleteTask(task.id)}
                                  className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-400"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <Card key={task.id} variant="bordered" className="overflow-visible">
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        {selectedTasks.size > 0 && (
                          <input
                            type="checkbox"
                            checked={selectedTasks.has(task.id)}
                            onChange={() => toggleSelect(task.id)}
                            className="mt-1 rounded border-gray-300"
                          />
                        )}
                        {task.status !== "COMPLETADA" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); updateTaskStatus(task.id, "COMPLETADA"); }}
                            className="mt-0.5 w-6 h-6 rounded-full border-2 border-green-400 hover:bg-green-100 flex items-center justify-center text-green-500 shrink-0"
                            title="Marcar realizado (OK)"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {task.status === "COMPLETADA" && (
                          <CheckCircle2 className="mt-1 w-6 h-6 text-green-500 shrink-0" />
                        )}
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => toggleExpand(task.id)}
                        >
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                              {task.title}
                            </h3>
                            <Badge size="sm" color={taskPriorityColor(task.priority)}>
                              {taskPriorityLabel(task.priority)}
                            </Badge>
                            <Badge size="sm" color={taskStatusColor(task.status)}>
                              {taskStatusLabel(task.status)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {task.assignedTo && (
                              <span>Asignado: {task.assignedTo.name}</span>
                            )}
                            {task.dueDate && (
                              <span>Vence: {formatDate(task.dueDate)}</span>
                            )}
                            {task.category && (
                              <span>
                                {CATEGORY_OPTIONS.find((c) => c.value === task.category)?.label || task.category}
                              </span>
                            )}
                            {task.commentsList && task.commentsList.length > 0 && (
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                {task.commentsList.length}
                              </span>
                            )}
                            {(task.history?.filter((h) => h.action?.includes("Posponida")).length || 0) > 0 && (
                              <span className="flex items-center gap-1 text-red-500">
                                <AlertTriangle className="h-3 w-3" />
                                {task.history!.filter((h) => h.action?.includes("Posponida")).length}x
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Completar"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateTaskStatus(task.id, "COMPLETADA");
                            }}
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          </Button>
                          {task.status === "PENDIENTE" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Iniciar"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskStatus(task.id, "EN_PROCESO");
                              }}
                            >
                              <Play className="h-4 w-4 text-blue-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}>
                            {expandedTasks.has(task.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      {expandedTasks.has(task.id) && (
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                          {task.description && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Descripción</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {task.description}
                              </p>
                            </div>
                          )}
                          {task.comments && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1">Comentarios</p>
                              <p className="text-sm text-gray-700 dark:text-gray-300">
                                {task.comments}
                              </p>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<CheckCircle2 className="h-3 w-3" />}
                              onClick={() => updateTaskStatus(task.id, "COMPLETADA")}
                            >
                              Completar
                            </Button>
                            {task.status === "PENDIENTE" && (
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<Play className="h-3 w-3" />}
                                onClick={() => updateTaskStatus(task.id, "EN_PROCESO")}
                              >
                                Iniciar
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<CalendarClock className="h-3 w-3" />}
                              onClick={() => updateTaskStatus(task.id, "REPROGRAMADA")}
                            >
                              Reprogramar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<Clock4 className="h-3 w-3 text-orange-500" />}
                              onClick={() => updateTaskStatus(task.id, "REPROGRAMADA")}
                            >
                              Posponer
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              leftIcon={<MessageSquare className="h-3 w-3" />}
                              onClick={() => { setCommentModal({ open: true, taskId: task.id, taskTitle: task.title }); setCommentText(""); }}
                            >
                              Comentar
                            </Button>
                            {(user?.role === "DUENO" || user?.role === "ADMIN") && (
                              <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<Trash2 className="h-3 w-3 text-red-500" />}
                                onClick={() => deleteTask(task.id)}
                              >
                                Eliminar
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabPanel>
        ))}
      </Tabs>

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

      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        token={token || ""}
        users={users}
        onCreated={fetchTasks}
      />
    </div>
  );
}

function CreateTaskModal({
  isOpen,
  onClose,
  token,
  users,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  users: User[];
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIA");
  const [category, setCategory] = useState("PRE_EVENTO");
  const [type, setType] = useState("DINAMICA");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [frequency, setFrequency] = useState("DIARIA");
  const [dayOfWeek, setDayOfWeek] = useState("LUNES");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      let finalDueDate: string | undefined;
      if (dueDate) {
        // Si no hay hora, guardar a medianoche (00:00) para indicar "sin hora"
        const d = new Date(`${dueDate}T${dueTime || "00:00"}`);
        finalDueDate = d.toISOString();
      }
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          category: category || undefined,
          type,
          assignedToId: assignedToId || undefined,
          dueDate: finalDueDate,
          frequency: type === "FIJA" ? frequency : undefined,
          dayOfWeek: type === "FIJA" && frequency === "SEMANAL" ? dayOfWeek : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Tarea creada exitosamente");
        onCreated();
        onClose();
        setTitle("");
        setDescription("");
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear tarea");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nueva Tarea" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Categoría
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="PRE_EVENTO">Pre Evento</option>
            <option value="EVENTO">Evento</option>
            <option value="POST_EVENTO">Post Evento</option>
          </select>
        </div>
        <Input
          label="Evento"
          placeholder="Nombre del evento o tarea"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Descripción <span className="text-gray-400 text-xs">(máx. 100 caracteres)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 100))}
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            rows={2}
            placeholder="Descripción breve (opcional)"
          />
          <p className="text-right text-xs text-gray-400 mt-1">{description.length}/100</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Prioridad
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="BAJA">Baja</option>
              <option value="MEDIA">Media</option>
              <option value="ALTA">Alta</option>
              <option value="URGENTE">Urgente</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tipo
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="DINAMICA">Dinámica</option>
              <option value="FIJA">Fija</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Asignar a
            </label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Fecha de entrega"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <Input
            label="Hora"
            type="time"
            step="300"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
        <p className="text-xs text-gray-400 -mt-2">Los minutos se redondean a múltiplos de 5. Si no pones hora, la tarea queda sin horario (solo fecha).</p>
        {type === "FIJA" && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Frecuencia
              </label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="DIARIA">Diaria</option>
                <option value="SEMANAL">Semanal</option>
                <option value="MENSUAL">Mensual</option>
              </select>
            </div>
            {frequency === "SEMANAL" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Día de la semana
                </label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="LUNES">Lunes</option>
                  <option value="MARTES">Martes</option>
                  <option value="MIERCOLES">Miércoles</option>
                  <option value="JUEVES">Jueves</option>
                  <option value="VIERNES">Viernes</option>
                  <option value="SABADO">Sábado</option>
                </select>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancelar
          </Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            Crear Tarea
          </Button>
        </div>
      </form>
    </Modal>
  );
}
