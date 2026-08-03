"use client";

import { useState, useMemo } from "react";
import { Search, X, Plus, Phone, Users } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import type {
  User,
  TaskPriority,
  TaskCategory,
  CreateTaskDTO,
} from "@/types";

interface BatchTaskFormProps {
  users: User[];
  onSubmit: (data: CreateTaskDTO[], notifyWhatsApp: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const categoryOptions: { value: TaskCategory; label: string }[] = [
  { value: "PRE_EVENTO", label: "Pre-evento" },
  { value: "POST_EVENTO", label: "Post-evento" },
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

const priorityOptions: { value: TaskPriority; label: string }[] = [
  { value: "BAJA", label: "Baja" },
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
  { value: "URGENTE", label: "Urgente" },
];

export function BatchTaskForm({
  users,
  onSubmit,
  onCancel,
  isLoading = false,
}: BatchTaskFormProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "">("");
  const [category, setCategory] = useState<TaskCategory | "">("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users.slice(0, 15);
    const s = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)
    );
  }, [users, userSearch]);

  function toggleUser(userId: string) {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  function selectAllUsers() {
    setSelectedUsers(users.map((u) => u.id));
  }

  function deselectAllUsers() {
    setSelectedUsers([]);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "El título es obligatorio";
    if (!category) errs.category = "Selecciona una categoría";
    if (!priority) errs.priority = "Selecciona una prioridad";
    if (selectedUsers.length === 0) errs.users = "Selecciona al menos un usuario";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const fullDueDate = dueDate
      ? dueTime
        ? `${dueDate}T${dueTime}:00`
        : `${dueDate}T23:59:00`
      : undefined;

    const tasks: CreateTaskDTO[] = selectedUsers.map((userId) => ({
      title: title.trim(),
      description: description.trim() || undefined,
      type: "DINAMICA",
      priority: priority as TaskPriority,
      category: category as TaskCategory,
      assignedToId: userId,
      dueDate: fullDueDate,
    }));

    onSubmit(tasks, notifyWhatsApp);
  }

  const selectedUserObjects = users.filter((u) => selectedUsers.includes(u.id));
  const canNotifyWhatsApp = selectedUserObjects.some((u) => u.whatsappNumber);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
            Creación de tareas en lote
          </h3>
        </div>
        <p className="text-sm text-blue-600 dark:text-blue-400">
          Se creará la misma tarea para todos los usuarios seleccionados.
        </p>
      </div>

      <Input
        label="Título de la tarea"
        placeholder="Ej: Revisar inventario semanal"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        error={errors.title}
        required
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Descripción
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Descripción común para todos..."
          className="block w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-y"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value as TaskCategory)}
          options={categoryOptions}
          error={errors.category}
          placeholder="Seleccionar categoría"
        />
        <Select
          label="Prioridad"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          options={priorityOptions}
          error={errors.priority}
          placeholder="Seleccionar prioridad"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Fecha de entrega"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        <Input
          label="Hora de entrega"
          type="time"
          value={dueTime}
          onChange={(e) => setDueTime(e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Seleccionar usuarios ({selectedUsers.length})
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={selectAllUsers}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Seleccionar todos
            </button>
            <button
              type="button"
              onClick={deselectAllUsers}
              className="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              Deseleccionar todos
            </button>
          </div>
        </div>

        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedUserObjects.map((user) => (
              <Badge
                key={user.id}
                color="blue"
                size="sm"
                removable
                onRemove={() => toggleUser(user.id)}
              >
                {user.name}
              </Badge>
            ))}
          </div>
        )}

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar usuario..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>

        <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 p-3 text-center">
              Sin resultados
            </p>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => toggleUser(user.id)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  selectedUsers.includes(user.id)
                    ? "bg-blue-50 dark:bg-blue-900/20"
                    : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <Avatar name={user.name} src={user.avatar} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {user.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{user.email}</div>
                </div>
                {user.whatsappNumber && (
                  <Phone className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
        {errors.users && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.users}</p>
        )}
      </div>

      {canNotifyWhatsApp && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyWhatsApp}
            onChange={(e) => setNotifyWhatsApp(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
            <Phone className="h-4 w-4 text-green-600" />
            Notificar por WhatsApp a los usuarios que tengan número registrado
          </span>
        </label>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {selectedUsers.length > 0
            ? `Se crearán ${selectedUsers.length} ${selectedUsers.length === 1 ? "tarea" : "tareas"}`
            : "Selecciona usuarios para crear tareas"}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="ghost" type="button" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            type="submit"
            isLoading={isLoading}
            disabled={selectedUsers.length === 0}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Crear tareas
          </Button>
        </div>
      </div>
    </form>
  );
}
