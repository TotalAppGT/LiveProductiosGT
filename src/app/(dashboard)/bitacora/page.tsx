"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Filter,
  Calendar,
  User,
  FileText,
  Clock,
  Activity,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Users,
  Eye,
  Zap,
  ArrowRightLeft,
  CheckSquare,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge, roleLabel, roleColor } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

interface ActivityEntry {
  id: string;
  userId: string;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    role: string;
    avatar: string | null;
  };
}

interface UserSummary {
  id: string;
  name: string;
  role: string;
  avatar: string | null;
}

interface DailySummaryEntry {
  date: string;
  accessCount: number;
  tasksViewed: number;
  tasksCompleted: number;
  transfersMade: number;
  transfersReceived: number;
}

interface UserActivityData {
  user: UserSummary;
  activities: ActivityEntry[];
  summary: {
    today: {
      accessCount: number;
      tasksViewed: number;
      tasksCompleted: number;
      transfersMade: number;
      transfersReceived: number;
    };
    daily: DailySummaryEntry[];
  };
}

const actionLabels: Record<string, { label: string; color: string; bg: string }> = {
  LOGIN: { label: "Inicio de sesión", color: "text-blue-400", bg: "bg-blue-500/10" },
  ACCESS: { label: "Acceso", color: "text-blue-400", bg: "bg-blue-500/10" },
  VIEW_DASHBOARD: { label: "Ver Dashboard", color: "text-purple-400", bg: "bg-purple-500/10" },
  VER_TAREA: { label: "Ver tarea", color: "text-indigo-400", bg: "bg-indigo-500/10" },
  ACTUALIZAR_TAREA: { label: "Actualizar tarea", color: "text-orange-400", bg: "bg-orange-500/10" },
  CAMBIAR_ESTADO_TAREA: { label: "Cambiar estado", color: "text-green-400", bg: "bg-green-500/10" },
  DELEGAR_TAREA: { label: "Delegar tarea", color: "text-pink-400", bg: "bg-pink-500/10" },
  CREAR_TAREA: { label: "Crear tarea", color: "text-emerald-400", bg: "bg-emerald-500/10" },
  ELIMINAR_TAREA: { label: "Eliminar tarea", color: "text-red-400", bg: "bg-red-500/10" },
  CREAR_USUARIO: { label: "Crear usuario", color: "text-teal-400", bg: "bg-teal-500/10" },
  CHECK_INACTIVITY: { label: "Chequeo inactividad", color: "text-yellow-400", bg: "bg-yellow-500/10" },
  CHECK_OVERDUE: { label: "Chequeo vencidos", color: "text-red-400", bg: "bg-red-500/10" },
  DAILY_BRIEFING: { label: "Briefing diario", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  MORNING_BRIEFING: { label: "Briefing matutino", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  EVENING_RECAP: { label: "Recap vespertino", color: "text-violet-400", bg: "bg-violet-500/10" },
  SYNC_USER: { label: "Sincronización", color: "text-gray-400", bg: "bg-gray-500/10" },
  TASK_DELEGATED: { label: "Tarea delegada", color: "text-pink-400", bg: "bg-pink-500/10" },
  ACTIVITY_ALERT: { label: "Alerta actividad", color: "text-red-400", bg: "bg-red-500/10" },
  WHATSAPP_AI_REPLY: { label: "LUNA WhatsApp", color: "text-violet-400", bg: "bg-violet-500/10" },
  END_OF_DAY_ALERT: { label: "Alerta fin de día", color: "text-amber-400", bg: "bg-amber-500/10" },
  DAILY_ACCESS_CHECK: { label: "Chequeo accesos", color: "text-orange-400", bg: "bg-orange-500/10" },
};

function getActionStyle(action: string) {
  for (const [key, style] of Object.entries(actionLabels)) {
    if (action.includes(key)) return style;
  }
  return { label: action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, " ").toLowerCase(), color: "text-gray-400", bg: "bg-gray-500/10" };
}

function getActionColor(action: string): BadgeColor {
  const map: Record<string, BadgeColor> = {
    LOGIN: "blue",
    ACCESS: "blue",
    VER_TAREA: "indigo",
    ACTUALIZAR_TAREA: "orange",
    CAMBIAR_ESTADO_TAREA: "green",
    DELEGAR_TAREA: "pink",
    CREAR_TAREA: "teal",
    ELIMINAR_TAREA: "red",
    CREAR_USUARIO: "teal",
    CHECK_INACTIVITY: "yellow",
    CHECK_OVERDUE: "red",
    DAILY_BRIEFING: "blue",
    MORNING_BRIEFING: "blue",
    EVENING_RECAP: "purple",
    TASK_DELEGATED: "pink",
    ACTIVITY_ALERT: "red",
    END_OF_DAY_ALERT: "yellow",
    DAILY_ACCESS_CHECK: "orange",
  };
  for (const [key, color] of Object.entries(map)) {
    if (action.includes(key)) return color;
  }
  return "gray";
}

type BadgeColor = "gray" | "blue" | "green" | "red" | "yellow" | "purple" | "orange" | "pink" | "indigo" | "teal";

export default function BitacoraPage() {
  const { user: currentUser, token } = useAuth();
  const [activeTab, setActiveTab] = useState("general");

  const canAccess = currentUser?.role === "DUENO" || currentUser?.role === "ADMIN" || currentUser?.role === "JEFE";

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={<Activity className="h-16 w-16" />}
          title="Acceso restringido"
          description="Solo Dueño, Administrador o Jefe pueden ver la bitácora."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Bitácora</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Registro de actividades del equipo
        </p>
      </div>

      <Tabs defaultValue="general" value={activeTab} onValueChange={setActiveTab}>
        <TabList>
          <Tab value="general">
            <FileText className="h-4 w-4 mr-1.5" />
            General
          </Tab>
          <Tab value="perPersona">
            <Users className="h-4 w-4 mr-1.5" />
            Por Persona
          </Tab>
        </TabList>

        <TabPanel value="general">
          <GeneralTab token={token} />
        </TabPanel>

        <TabPanel value="perPersona">
          <PerPersonaTab token={token} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

function GeneralTab({ token }: { token: string | null }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchAction, setSearchAction] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const limit = 20;

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", limit.toString());
      if (searchAction) params.set("action", searchAction);
      if (resourceFilter) params.set("resource", resourceFilter);
      if (userFilter) params.set("userId", userFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/bitacora?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar");
      const json = await res.json();
      if (json.success) {
        setActivities(json.data);
        setTotalPages(json.totalPages);
        setTotal(json.total);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [token, page, searchAction, resourceFilter, userFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => { if (Array.isArray(json)) setUsers(json); })
      .catch(() => {});
  }, [token]);

  function handleSearch() {
    setPage(1);
    fetchData();
  }

  if (loading && activities.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <LoadingSpinner size="lg" text="Cargando bitácora..." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card variant="bordered" className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
          >
            <option value="">Todas las personas</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name} ({u.position || u.role})</option>
            ))}
          </select>
          <Input
            placeholder="Filtrar por acción..."
            value={searchAction}
            onChange={(e) => setSearchAction(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
            className="flex-1"
          />
          <Input
            placeholder="Filtrar por recurso..."
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="flex-1"
          />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-auto"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-auto"
          />
          <Button
            variant="primary"
            size="md"
            onClick={handleSearch}
            leftIcon={<Filter className="h-4 w-4" />}
          >
            Filtrar
          </Button>
        </div>
      </Card>

      {error && (
        <div className="text-center py-8">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchData} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Reintentar
          </Button>
        </div>
      )}

      {!error && activities.length === 0 && (
        <EmptyState
          icon={<FileText className="h-16 w-16" />}
          title="Sin actividades"
          description="No se encontraron registros con los filtros actuales."
        />
      )}

      {!error && activities.length > 0 && (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {total} registros encontrados
          </p>

          <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Usuario</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Acción</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Recurso</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Detalles</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-300">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {activities.map((a) => {
                  const style = getActionStyle(a.action);
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Avatar name={a.user.name} src={a.user.avatar} size="sm" />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-xs">{a.user.name}</p>
                            <p className="text-xs text-gray-500">{roleLabel(a.user.role)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge size="sm" color={getActionColor(a.action)}>
                          {style.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                        {a.resource || "-"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate">
                        {a.details || "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                        {format(new Date(a.createdAt), "dd/MM/yyyy HH:mm")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-3">
            {activities.map((a) => {
              const style = getActionStyle(a.action);
              return (
                <Card key={a.id} variant="bordered" className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar name={a.user.name} src={a.user.avatar} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{a.user.name}</p>
                      <p className="text-xs text-gray-500">{roleLabel(a.user.role)}</p>
                    </div>
                    <Badge size="sm" color={getActionColor(a.action)}>
                      {style.label}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {a.resource && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium">Recurso:</span> {a.resource}
                      </p>
                    )}
                    {a.details && (
                      <p className="text-xs text-gray-600 dark:text-gray-400">{a.details}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {format(new Date(a.createdAt), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Página {page} de {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                leftIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                rightIcon={<ChevronRight className="h-4 w-4" />}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PerPersonaTab({ token }: { token: string | null }) {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userData, setUserData] = useState<UserActivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUsers() {
      if (!token) return;
      try {
        const res = await fetch("/api/users?limit=100", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success) {
          setUsers(json.data);
        }
      } catch {
        // ignore
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, [token]);

  async function loadUserActivity() {
    if (!token || !selectedUserId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/bitacora/${selectedUserId}?days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) {
        setUserData(json.data);
      } else {
        setError(json.error || "Error");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <div className="space-y-4">
      <Card variant="bordered" className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Seleccionar persona
            </label>
            <Select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              options={[
                { value: "", label: "Selecciona un usuario..." },
                ...users.map((u) => ({ value: u.id, label: `${u.name} (${roleLabel(u.role)})` })),
              ]}
              placeholder=""
            />
          </div>
          <Button
            variant="primary"
            onClick={loadUserActivity}
            disabled={!selectedUserId}
            leftIcon={<Eye className="h-4 w-4" />}
          >
            Ver Bitácora
          </Button>
        </div>
      </Card>

      {loading && (
        <div className="flex items-center justify-center min-h-[30vh]">
          <LoadingSpinner size="lg" text="Cargando actividades..." />
        </div>
      )}

      {error && (
        <div className="text-center py-8">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {userData && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar name={userData.user.name} src={userData.user.avatar} size="lg" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{userData.user.name}</h2>
              <Badge color={roleColor(userData.user.role)} size="md">
                {roleLabel(userData.user.role)}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card variant="bordered" className="p-3 text-center">
              <Zap className="h-5 w-5 text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{userData.summary.today.accessCount}</p>
              <p className="text-xs text-gray-500">Accesos hoy</p>
            </Card>
            <Card variant="bordered" className="p-3 text-center">
              <Eye className="h-5 w-5 text-purple-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{userData.summary.today.tasksViewed}</p>
              <p className="text-xs text-gray-500">Tareas vistas</p>
            </Card>
            <Card variant="bordered" className="p-3 text-center">
              <CheckSquare className="h-5 w-5 text-green-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{userData.summary.today.tasksCompleted}</p>
              <p className="text-xs text-gray-500">Completadas</p>
            </Card>
            <Card variant="bordered" className="p-3 text-center">
              <ArrowRightLeft className="h-5 w-5 text-pink-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{userData.summary.today.transfersMade}</p>
              <p className="text-xs text-gray-500">Transferencias</p>
            </Card>
            <Card variant="bordered" className="p-3 text-center">
              <BarChart3 className="h-5 w-5 text-orange-400 mx-auto mb-1" />
              <p className="text-lg font-bold text-gray-900 dark:text-white">{userData.summary.today.transfersReceived}</p>
              <p className="text-xs text-gray-500">Recibidas</p>
            </Card>
          </div>

          <Card variant="bordered" className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              Resumen Diario (30 días)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Fecha</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Accesos</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Tareas vistas</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Completadas</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Transferencias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {userData.summary.daily.slice(0, 30).map((d) => (
                    <tr key={d.date} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-3 py-2 text-xs font-medium text-gray-900 dark:text-white">
                        {format(new Date(d.date + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
                      </td>
                      <td className="px-3 py-2 text-center text-xs">
                        <span className={cn("font-medium", d.accessCount >= 4 ? "text-green-600" : d.accessCount === 0 ? "text-red-500" : "text-yellow-600")}>
                          {d.accessCount}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">{d.tasksViewed}</td>
                      <td className="px-3 py-2 text-center text-xs">
                        <span className="font-medium text-green-600">{d.tasksCompleted}</span>
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-gray-600 dark:text-gray-400">
                        {d.transfersMade}/{d.transfersReceived}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              Actividad Reciente
            </h3>
            <div className="hidden sm:block overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Acción</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Recurso</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Detalles</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-600 dark:text-gray-300">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {userData.activities.slice(0, 50).map((a) => {
                    const style = getActionStyle(a.action);
                    return (
                      <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                        <td className="px-4 py-2 whitespace-nowrap">
                          <Badge size="sm" color={getActionColor(a.action)}>
                            {style.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{a.resource || "-"}</td>
                        <td className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate">{a.details || "-"}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-xs text-gray-500">
                          {format(new Date(a.createdAt), "dd/MM/yyyy HH:mm")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sm:hidden space-y-2">
              {userData.activities.slice(0, 30).map((a) => {
                const style = getActionStyle(a.action);
                return (
                  <Card key={a.id} variant="bordered" className="p-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge size="sm" color={getActionColor(a.action)}>{style.label}</Badge>
                      <span className="text-xs text-gray-400">{format(new Date(a.createdAt), "HH:mm")}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{a.details || a.resource || "-"}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
