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
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, roleLabel, roleColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { User, ApiResponse, PaginatedResponse, UserRole } from "@/types";

export default function PersonalPage() {
  const { user: currentUser, token } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const canManage = currentUser?.role === "DUEÑO" || currentUser?.role === "ADMIN";

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

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function toggleActive(user: User) {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
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
        method: "PATCH",
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
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowAddModal(true)}
        >
          Agregar Usuario
        </Button>
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
            value: users.filter((u) => u.role === "DUEÑO" || u.role === "ADMIN").length,
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
          action={{ label: "Agregar Usuario", onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <Card variant="bordered" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Rol</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                      !u.active && "opacity-50"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-700 dark:text-gray-300">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
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
                        <option value="DUEÑO">Dueño</option>
                        <option value="ADMIN">Administrador</option>
                        <option value="JEFE">Jefe</option>
                        <option value="EMPLEADO">Empleado</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {u.phone || u.whatsappNumber || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        size="sm"
                        color={u.active ? "green" : "red"}
                        dot
                      >
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
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AddUserModal
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

function AddUserModal({
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
          phone: phone.trim() || undefined,
          whatsappNumber: phone.trim() || undefined,
          role,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Usuario creado exitosamente");
        onCreated();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear usuario");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agregar Usuario" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Input label="Teléfono (WhatsApp)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="DUEÑO">Dueño</option>
            <option value="ADMIN">Administrador</option>
            <option value="JEFE">Jefe</option>
            <option value="EMPLEADO">Empleado</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>Guardar Cambios</Button>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>Crear Usuario</Button>
        </div>
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
  const [phone, setPhone] = useState(user.phone || "");
  const [role, setRole] = useState(user.role);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          whatsappNumber: phone.trim() || undefined,
          role,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Usuario actualizado");
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
    <Modal isOpen={isOpen} onClose={onClose} title="Editar Usuario" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input label="Nombre completo" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input label="Correo electrónico" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input label="Teléfono" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="DUEÑO">Dueño</option>
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
