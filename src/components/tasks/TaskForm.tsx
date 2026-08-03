"use client";

import { useState, useMemo } from "react";
import { Search, X, Save, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type {
  TaskType,
  TaskFrequency,
  DayOfWeek,
  TaskPriority,
  TaskCategory,
  CreateTaskDTO,
  UpdateTaskDTO,
  User,
  Event,
} from "@/types";

interface TaskFormProps {
  initialData?: Partial<CreateTaskDTO & { id?: string }>;
  users: User[];
  events?: Event[];
  onSubmit: (data: CreateTaskDTO | UpdateTaskDTO) => void;
  onCancel: () => void;
  isLoading?: boolean;
  isEdit?: boolean;
}

const taskTypeOptions = [
  { value: "FIJA", label: "Fija" },
  { value: "DINAMICA", label: "Dinámica" },
];

const frequencyOptions = [
  { value: "DIARIA", label: "Diaria" },
  { value: "SEMANAL", label: "Semanal" },
  { value: "MENSUAL", label: "Mensual" },
];

const dayOptions: { value: DayOfWeek; label: string }[] = [
  { value: "LUNES", label: "Lunes" },
  { value: "MARTES", label: "Martes" },
  { value: "MIERCOLES", label: "Miércoles" },
  { value: "JUEVES", label: "Jueves" },
  { value: "VIERNES", label: "Viernes" },
  { value: "SABADO", label: "Sábado" },
  { value: "DOMINGO", label: "Domingo" },
];

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

export function TaskForm({
  initialData,
  users,
  events = [],
  onSubmit,
  onCancel,
  isLoading = false,
  isEdit = false,
}: TaskFormProps) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [type, setType] = useState<TaskType>(initialData?.type || "DINAMICA");
  const [frequency, setFrequency] = useState<TaskFrequency | "">(initialData?.frequency || "");
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(
    initialData?.dayOfWeek ? [initialData.dayOfWeek] : []
  );
  const [category, setCategory] = useState<TaskCategory | "">(initialData?.category || "");
  const [priority, setPriority] = useState<TaskPriority | "">(initialData?.priority || "");
  const [assignedToId, setAssignedToId] = useState(initialData?.assignedToId || "");
  const [dueDate, setDueDate] = useState(initialData?.dueDate?.split("T")[0] || "");
  const [dueTime, setDueTime] = useState(initialData?.dueDate?.split("T")[1]?.slice(0, 5) || "");
  const [requiresConfirmation, setRequiresConfirmation] = useState(
    initialData?.requiresConfirmation || false
  );
  const [eventId, setEventId] = useState(initialData?.eventId || "");
  const [userSearch, setUserSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users.slice(0, 10);
    const s = userSearch.toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
  }, [users, userSearch]);

  function toggleDay(day: DayOfWeek) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "El título es obligatorio";
    if (!category) errs.category = "Selecciona una categoría";
    if (!priority) errs.priority = "Selecciona una prioridad";
    if (!assignedToId) errs.assignedToId = "Selecciona un usuario para asignar";
    if (type === "FIJA" && !frequency) errs.frequency = "Selecciona una frecuencia";
    if (type === "FIJA" && frequency === "SEMANAL" && daysOfWeek.length === 0) {
      errs.daysOfWeek = "Selecciona al menos un día de la semana";
    }
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

    const data: CreateTaskDTO = {
      title: title.trim(),
      description: description.trim() || undefined,
      type,
      frequency: type === "FIJA" ? (frequency as TaskFrequency) || "DIARIA" : undefined,
      dayOfWeek: type === "FIJA" && frequency === "SEMANAL" ? daysOfWeek[0] : undefined,
      dueDate: fullDueDate,
      priority: priority as TaskPriority,
      category: category as TaskCategory,
      assignedToId: assignedToId || undefined,
      eventId: eventId || undefined,
      requiresConfirmation,
    };

    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Título"
        placeholder="Ej: Revisar equipo de sonido"
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
          placeholder="Detalles de la tarea..."
          className="block w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-y"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Tipo de tarea"
          value={type}
          onChange={(e) => {
            setType(e.target.value as TaskType);
            if (e.target.value === "DINAMICA") {
              setFrequency("");
              setDaysOfWeek([]);
            }
          }}
          options={taskTypeOptions}
          placeholder="Seleccionar tipo"
        />

        {type === "FIJA" && (
          <Select
            label="Frecuencia"
            value={frequency}
            onChange={(e) => {
              setFrequency(e.target.value as TaskFrequency);
              if (e.target.value !== "SEMANAL") setDaysOfWeek([]);
            }}
            options={frequencyOptions}
            error={errors.frequency}
            placeholder="Seleccionar frecuencia"
          />
        )}
      </div>

      {type === "FIJA" && frequency === "SEMANAL" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Días de la semana
          </label>
          <div className="flex flex-wrap gap-2">
            {dayOptions.map((day) => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDay(day.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                  daysOfWeek.includes(day.value)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
          {errors.daysOfWeek && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.daysOfWeek}</p>
          )}
        </div>
      )}

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

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Asignar a
        </label>
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar usuario..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div className="mt-1 max-h-32 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            {filteredUsers.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 p-2">Sin resultados</p>
            ) : (
              filteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    setAssignedToId(user.id);
                    setUserSearch("");
                  }}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    assignedToId === user.id
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                      "bg-" + (["blue", "green", "yellow", "purple", "pink", "indigo", "teal", "orange"][
                        user.name.charCodeAt(0) % 8
                      ]) + "-500"
                    }`}
                  >
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs text-gray-400">{user.email}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
        {assignedToId && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Asignado: {users.find((u) => u.id === assignedToId)?.name}
            </span>
            <button
              type="button"
              onClick={() => setAssignedToId("")}
              className="text-red-500 hover:text-red-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {errors.assignedToId && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.assignedToId}</p>
        )}
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

      <Select
        label="Vincular a evento (opcional)"
        value={eventId}
        onChange={(e) => setEventId(e.target.value)}
        options={[
          { value: "", label: "Sin evento" },
          ...events.map((ev) => ({
            value: ev.id,
            label: `${ev.name} - ${ev.clientName}`,
          })),
        ]}
        placeholder="Seleccionar evento"
      />

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={requiresConfirmation}
          onChange={(e) => setRequiresConfirmation(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Requiere confirmación del usuario
        </span>
      </label>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={isLoading} leftIcon={isEdit ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}>
          {isEdit ? "Guardar cambios" : "Crear tarea"}
        </Button>
      </div>
    </form>
  );
}
