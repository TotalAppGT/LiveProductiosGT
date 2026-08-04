"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Users,
  UserCheck,
  UserX,
  Pencil,
  Shield,
  MessageCircle,
  Phone,
  UserPlus,
  DollarSign,
  TrendingUp,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Contact,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, roleLabel, roleColor } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatCurrency } from "@/lib/utils";
import { normalizeGTPhone } from "@/lib/phone";
import type { User, ApiResponse, PaginatedResponse, UserRole } from "@/types";

interface WorkerStats {
  completedTasks: number;
  pendingTasks: number;
  complianceRate: number;
  tasksThisWeek: number;
  income: number;
  lastAccess: string | null;
  accessCount: number;
}

export default function PersonalPage() {
  const { user: currentUser, token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  const [workerStats, setWorkerStats] = useState<Record<string, WorkerStats>>({});
  const [sendingWhatsApp, setSendingWhatsApp] = useState<Set<string>>(new Set());

  const canManage = currentUser?.role === "DUENO" || currentUser?.role === "ADMIN";

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar usuarios");
      const json: PaginatedResponse<User> = await res.json();
      if (json.success) {
        setUsers(json.data);
      } else {
        setUsers([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, search]);

  const fetchWorkerStats = useCallback(async () => {
    if (!token || !canManage) return;
    try {
      const res = await fetch("/api/users/stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const statsMap: Record<string, WorkerStats> = {};
          (json.data as Array<{ userId: string } & WorkerStats>).forEach((s) => {
            statsMap[s.userId] = {
              completedTasks: s.completedTasks || 0,
              pendingTasks: s.pendingTasks || 0,
              complianceRate: s.complianceRate || 0,
              tasksThisWeek: s.tasksThisWeek || 0,
              income: s.income || 0,
              lastAccess: s.lastAccess || null,
              accessCount: s.accessCount || 0,
            };
          });
          setWorkerStats(statsMap);
        }
      }
    } catch { /* */ }
  }, [token, canManage]);

  useEffect(() => {
    fetchUsers();
    fetchWorkerStats();
  }, [fetchUsers, fetchWorkerStats]);

  async function toggleActive(user: User) {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !user.active }),
      });
      const json: ApiResponse<User> = await res.json();
      if (json.success) {
        toast.success(user.active ? "Usuario desactivado" : "Usuario activado");
        fetchUsers();
      }
    } catch {
      toast.error("Error al actualizar usuario");
    }
  }

  async function updateRole(user: User, role: UserRole) {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role }),
      });
      const json: ApiResponse<User> = await res.json();
      if (json.success) {
        toast.success("Rol actualizado");
        fetchUsers();
      }
    } catch {
      toast.error("Error al actualizar rol");
    }
  }

  async function sendWhatsAppInvitation(user: User) {
    const phone = user.whatsappNumber || user.phone;
    if (!phone) {
      toast.error("Este usuario no tiene número de WhatsApp");
      return;
    }
    setSendingWhatsApp((prev) => new Set(prev).add(user.id));
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          toNumber: phone,
          message: `Hola ${user.name}, bienvenido a Live Productions! Tu cuenta ha sido creada. Ingresa a la plataforma para ver tus tareas y eventos asignados. - LUNA`,
          type: "NOTIFICATION",
        }),
      });
      if (res.ok) {
        toast.success(`Invitación enviada a ${user.name}`);
      } else {
        const json = await res.json();
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al enviar WhatsApp");
    } finally {
      setSendingWhatsApp((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  }

  function toggleExpand(userId: string) {
    setExpandedWorkers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <EmptyState
          icon={<Shield className="h-16 w-16" />}
          title="Acceso restringido"
          description="No tienes permisos para gestionar el personal."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Personal</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona los miembros del equipo
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Contact className="h-4 w-4" />}
            onClick={() => toast.success("Próximamente: importación desde contactos", { duration: 3000 })}
          >
            Importar Contactos
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Agregar Trabajador
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total", value: users.length, icon: Users, color: "text-blue-400" },
          {
            label: "Activos",
            value: users.filter((u) => u.active).length,
            icon: UserCheck,
            color: "text-green-400",
          },
          {
            label: "Inactivos",
            value: users.filter((u) => !u.active).length,
            icon: UserX,
            color: "text-gray-400",
          },
          {
            label: "Dueños/Admins",
            value: users.filter((u) => u.role === "DUENO" || u.role === "ADMIN").length,
            icon: Shield,
            color: "text-purple-400",
          },
        ].map((stat) => (
          <Card key={stat.label} variant="bordered" className="p-3">
            <div className="flex items-center gap-2">
              <stat.icon className={cn("h-5 w-5", stat.color)} />
              <div>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
        <Input
          placeholder="Buscar por nombre o correo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando personal..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchUsers}>Reintentar</Button>
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-16 w-16" />}
          title="Sin personal"
          description="No hay usuarios registrados."
          action={{ label: "Agregar Trabajador", onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <>
          <Card variant="bordered" className="overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Trabajador</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rol</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">WhatsApp</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {users.map((u) => {
                    const stats = workerStats[u.id];
                    return (
                      <tr
                        key={u.id}
                        className={cn(
                          "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                          !u.active && "opacity-50"
                        )}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.name} src={u.avatar} size="sm" />
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">
                                {u.name}
                              </p>
                              <p className="text-xs text-gray-500">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={u.role}
                            onChange={(e) => updateRole(u, e.target.value as UserRole)}
                            className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            disabled={u.id === currentUser?.id}
                          >
                            <option value="DUENO">Dueño</option>
                            <option value="ADMIN">Administrador</option>
                            <option value="JEFE">Jefe</option>
                            <option value="EMPLEADO">Empleado</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {(u.whatsappNumber || u.phone) ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                              <MessageCircle className="h-4 w-4" />
                              {u.whatsappNumber || u.phone}
                            </span>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge size="sm" color={u.active ? "green" : "red"} dot>
                            {u.active ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingUser(u)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => sendWhatsAppInvitation(u)}
                              isLoading={sendingWhatsApp.has(u.id)}
                              title="Enviar invitación WhatsApp"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            {u.id !== currentUser?.id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => toggleActive(u)}
                                title={u.active ? "Desactivar" : "Activar"}
                              >
                                {u.active ? (
                                  <UserX className="h-4 w-4 text-red-500" />
                                ) : (
                                  <UserCheck className="h-4 w-4 text-green-500" />
                                )}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="md:hidden space-y-3">
            {users.map((u) => {
              const stats = workerStats[u.id];
              const isExpanded = expandedWorkers.has(u.id);
              return (
                <Card key={u.id} variant="bordered" className={cn("p-4", !u.active && "opacity-50")}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} src={u.avatar} size="md" />
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{u.name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge size="sm" color={roleColor(u.role)}>
                            {roleLabel(u.role)}
                          </Badge>
                          {stats && (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              {stats.complianceRate}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge size="sm" color={u.active ? "green" : "red"} dot>
                      {u.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm mb-3">
                    {(u.whatsappNumber || u.phone) && (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <MessageCircle className="h-4 w-4" />
                        <span className="font-medium">{u.whatsappNumber || u.phone}</span>
                      </div>
                    )}
                    {stats && (
                      <>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                            <p className="text-gray-500 dark:text-gray-400">Completadas</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{stats.completedTasks}</p>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                            <p className="text-gray-500 dark:text-gray-400">Pendientes</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{stats.pendingTasks}</p>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                            <p className="text-gray-500 dark:text-gray-400">Tareas semana</p>
                            <p className="font-semibold text-gray-900 dark:text-white">{stats.tasksThisWeek}</p>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                            <p className="text-gray-500 dark:text-gray-400">Ingresos</p>
                            <p className="font-semibold text-green-600 dark:text-green-400">{formatCurrency(stats.income || 0)}</p>
                          </div>
                        </div>
                        {stats.lastAccess && (
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3 w-3" />
                            <span>Último acceso: {formatDistanceToNow(new Date(stats.lastAccess), { locale: es, addSuffix: true })}</span>
                          </div>
                        )}
                        <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              stats.complianceRate >= 80
                                ? "bg-green-500"
                                : stats.complianceRate >= 50
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            )}
                            style={{ width: `${stats.complianceRate}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => sendWhatsAppInvitation(u)}
                      isLoading={sendingWhatsApp.has(u.id)}
                      className="text-green-600"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingUser(u)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleExpand(u.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    {u.id !== currentUser?.id && (
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                        {u.active ? <UserX className="h-4 w-4 text-red-500" /> : <UserCheck className="h-4 w-4 text-green-500" />}
                      </Button>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">Rol</span>
                        <select
                          value={u.role}
                          onChange={(e) => updateRole(u, e.target.value as UserRole)}
                          className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                          disabled={u.id === currentUser?.id}
                        >
                          <option value="DUENO">Dueño</option>
                          <option value="ADMIN">Administrador</option>
                          <option value="JEFE">Jefe</option>
                          <option value="EMPLEADO">Empleado</option>
                        </select>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-sm">Correo</span>
                        <span className="text-gray-700 dark:text-gray-300 text-sm">{u.email}</span>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      <AddWorkerModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        token={token || ""}
        onCreated={fetchUsers}
      />

      {editingUser && (
        <EditUserModal
          isOpen={!!editingUser}
          onClose={() => setEditingUser(null)}
          token={token || ""}
          user={editingUser}
          onSaved={fetchUsers}
        />
      )}
    </div>
  );
}

function AddWorkerModal({
  isOpen,
  onClose,
  token,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("EMPLEADO");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) return;
    setSaving(true);
    try {
      const normalizedPhone = phone.trim() ? normalizeGTPhone(phone.trim()) : undefined;
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          phone: normalizedPhone,
          whatsappNumber: normalizedPhone,
          role,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Trabajador creado exitosamente");
        onCreated();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear trabajador");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar Trabajador" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Teléfono (WhatsApp)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Solo los 8 dígitos, sin guiones" />
        <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="DUENO">Dueño</option>
            <option value="ADMIN">Administrador</option>
            <option value="JEFE">Jefe</option>
            <option value="EMPLEADO">Empleado</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>Crear Trabajador</Button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-2">
          El trabajador recibirá una invitación por WhatsApp al número proporcionado.
        </p>
      </form>
    </Modal>
  );
}

function EditUserModal({
  isOpen,
  onClose,
  token,
  user,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  user: User;
  onSaved: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || user.whatsappNumber || "");
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const normalizedPhone = phone.trim() ? normalizeGTPhone(phone.trim()) : undefined;
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: normalizedPhone,
          whatsappNumber: normalizedPhone,
          role,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Trabajador actualizado");
        onSaved();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Trabajador" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="WhatsApp" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Solo los 8 dígitos, sin guiones" />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="DUENO">Dueño</option>
            <option value="ADMIN">Administrador</option>
            <option value="JEFE">Jefe</option>
            <option value="EMPLEADO">Empleado</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>Guardar Cambios</Button>
        </div>
      </form>
    </Modal>
  );
}
