"use client";

import { useState, useMemo } from "react";
import {
  Search,
  X,
  Filter,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, taskStatusLabel, taskPriorityLabel } from "@/components/ui/Badge";
import type {
  TaskStatus,
  TaskPriority,
  TaskCategory,
  TaskType,
  TaskFilters as TaskFiltersType,
  User,
} from "@/types";

interface TaskFiltersProps {
  filters: TaskFiltersType;
  onFiltersChange: (filters: TaskFiltersType) => void;
  users?: User[];
  className?: string;
}

const statusOptions: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "Todos los estados" },
  { value: "PENDIENTE", label: "Pendiente" },
  { value: "EN_PROCESO", label: "En proceso" },
  { value: "COMPLETADA", label: "Completada" },
  { value: "REPROGRAMADA", label: "Reprogramada" },
  { value: "CANCELADA", label: "Cancelada" },
];

const categoryOptions: { value: TaskCategory | ""; label: string }[] = [
  { value: "", label: "Todas las categorías" },
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

const typeOptions: { value: TaskType | ""; label: string }[] = [
  { value: "", label: "Todos los tipos" },
  { value: "FIJA", label: "Fija" },
  { value: "DINAMICA", label: "Dinámica" },
];

const priorityOptions: { value: TaskPriority | ""; label: string }[] = [
  { value: "", label: "Todas las prioridades" },
  { value: "BAJA", label: "Baja" },
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
  { value: "URGENTE", label: "Urgente" },
];

const FILTER_LABELS: Record<string, string> = {
  PRE_EVENTO: "Pre-evento",
  POST_EVENTO: "Post-evento",
  COTIZACION: "Cotización",
  COBRO: "Cobro",
  INVENTARIO: "Inventario",
  VEHICULO: "Vehículo",
  PERSONAL: "Personal",
  BODEGA: "Bodega",
  MANTENIMIENTO: "Mantenimiento",
  ADMINISTRACION: "Administración",
  OTRO: "Otro",
};

export function TaskFilters({
  filters,
  onFiltersChange,
  users = [],
  className,
}: TaskFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search || "");
  const [expanded, setExpanded] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.category) count++;
    if (filters.type) count++;
    if (filters.priority) count++;
    if (filters.assignedToId) count++;
    if (filters.dueDateFrom || filters.dueDateTo) count++;
    if (filters.search) count++;
    return count;
  }, [filters]);

  function update(key: keyof TaskFiltersType, value: string | undefined) {
    onFiltersChange({ ...filters, [key]: value || undefined });
  }

  function clearAll() {
    setSearchValue("");
    onFiltersChange({});
  }

  function handleSearchSubmit() {
    update("search", searchValue || undefined);
  }

  const selectedUser = users.find((u) => u.id === filters.assignedToId);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar tareas..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchSubmit()}
            onBlur={handleSearchSubmit}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
          {searchValue && (
            <button
              onClick={() => {
                setSearchValue("");
                update("search", undefined);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors",
            expanded
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
              : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          )}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge color="blue" size="sm">
              {activeFilterCount}
            </Badge>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={clearAll}
            className="text-sm text-red-600 dark:text-red-400 hover:underline whitespace-nowrap"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Estado
            </label>
            <select
              value={filters.status || ""}
              onChange={(e) => update("status", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Categoría
            </label>
            <select
              value={filters.category || ""}
              onChange={(e) => update("category", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Tipo
            </label>
            <select
              value={filters.type || ""}
              onChange={(e) => update("type", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Prioridad
            </label>
            <select
              value={filters.priority || ""}
              onChange={(e) => update("priority", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {priorityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Usuario asignado
            </label>
            <select
              value={filters.assignedToId || ""}
              onChange={(e) => update("assignedToId", e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Fecha desde
            </label>
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={filters.dueDateFrom || ""}
                onChange={(e) => update("dueDateFrom", e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-7 pr-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Fecha hasta
            </label>
            <div className="relative">
              <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="date"
                value={filters.dueDateTo || ""}
                onChange={(e) => update("dueDateTo", e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-7 pr-2 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {activeFilterCount > 0 && !expanded && (
        <div className="flex flex-wrap gap-1.5">
          {filters.status && (
            <Badge color="yellow" size="sm" removable onRemove={() => update("status", undefined)}>
              {taskStatusLabel(filters.status)}
            </Badge>
          )}
          {filters.category && (
            <Badge color="purple" size="sm" removable onRemove={() => update("category", undefined)}>
              {FILTER_LABELS[filters.category] || filters.category}
            </Badge>
          )}
          {filters.type && (
            <Badge color="teal" size="sm" removable onRemove={() => update("type", undefined)}>
              {filters.type === "FIJA" ? "Fija" : "Dinámica"}
            </Badge>
          )}
          {filters.priority && (
            <Badge color="orange" size="sm" removable onRemove={() => update("priority", undefined)}>
              {taskPriorityLabel(filters.priority)}
            </Badge>
          )}
          {selectedUser && (
            <Badge color="blue" size="sm" removable onRemove={() => update("assignedToId", undefined)}>
              {selectedUser.name}
            </Badge>
          )}
          {(filters.dueDateFrom || filters.dueDateTo) && (
            <Badge color="indigo" size="sm" removable onRemove={() => {
              update("dueDateFrom", undefined);
              update("dueDateTo", undefined);
            }}>
              Rango de fechas
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
