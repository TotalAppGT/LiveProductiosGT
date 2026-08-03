"use client";

import { useState, useMemo } from "react";
import {
  Search,
  ChevronDown,
  Wrench,
  MapPin,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, inventoryStatusColor, inventoryStatusLabel } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import type { InventoryItem, InventoryStatus, InventoryCategory, InventoryLocation } from "@/types";

interface InventoryTableProps {
  items: InventoryItem[];
  isLoading?: boolean;
  onRowClick?: (item: InventoryItem) => void;
  onStatusChange?: (itemId: string, newStatus: InventoryStatus) => void;
  className?: string;
}

const categoryLabels: Record<InventoryCategory, string> = {
  AUDIO: "Audio",
  ILUMINACION: "Iluminación",
  INSTRUMENTO: "Instrumento",
  CABLEADO: "Cableado",
  MOBILIARIO: "Mobiliario",
  HERRAMIENTA: "Herramienta",
  CONSUMIBLE: "Consumible",
  OTRO: "Otro",
};

const locationLabels: Record<InventoryLocation, string> = {
  BODEGA_ELGIN: "Bodega Elgin",
  BODEGA_PP: "Bodega PP",
  EN_EVENTO: "En evento",
  EN_RENTA: "En renta",
};

const quickStatusOptions: InventoryStatus[] = [
  "DISPONIBLE",
  "ASIGNADO",
  "EN_REPARACION",
  "PERDIDO",
  "DANADO",
];

export function InventoryTable({
  items,
  isLoading = false,
  onRowClick,
  onStatusChange,
  className,
}: InventoryTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InventoryStatus | "">("");
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | "">("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchSearch =
        !search ||
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        (item.serialNumber && item.serialNumber.toLowerCase().includes(search.toLowerCase()));
      const matchStatus = !statusFilter || item.status === statusFilter;
      const matchCategory = !categoryFilter || item.category === categoryFilter;
      return matchSearch && matchStatus && matchCategory;
    });
  }, [items, search, statusFilter, categoryFilter]);

  function handleStatusClick(itemId: string, newStatus: InventoryStatus) {
    onStatusChange?.(itemId, newStatus);
    setOpenDropdownId(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" text="Cargando inventario..." />
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o serie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as InventoryCategory | "")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las categorías</option>
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InventoryStatus | "")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          {quickStatusOptions.map((status) => (
            <option key={status} value={status}>{inventoryStatusLabel(status)}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Nombre
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Categoría
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Cantidad
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Estado
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Ubicación
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Asignado a
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">
                  {items.length === 0 ? "No hay ítems en el inventario" : "Sin resultados para los filtros aplicados"}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50",
                    onRowClick && "cursor-pointer",
                    (item.status === "DANADO" || item.status === "PERDIDO") &&
                      "bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20"
                  )}
                  onClick={() => onRowClick?.(item)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {item.name}
                      </span>
                      {item.serialNumber && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          S/N: {item.serialNumber}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color="purple" size="sm">
                      {categoryLabels[item.category] || item.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300 font-medium">
                    {item.quantity}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={inventoryStatusColor(item.status)} size="sm" dot>
                      {inventoryStatusLabel(item.status)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-sm">{locationLabels[item.location] || item.location}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.assignedTo ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={item.assignedTo.name} src={item.assignedTo.avatar} size="xs" />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {item.assignedTo.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenDropdownId(openDropdownId === item.id ? null : item.id)
                        }
                        className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cambiar
                        <ChevronDown className={cn("h-4 w-4 transition-transform", openDropdownId === item.id && "rotate-180")} />
                      </button>
                      {openDropdownId === item.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 w-44 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                          {quickStatusOptions
                            .filter((s) => s !== item.status)
                            .map((status) => (
                              <button
                                key={status}
                                onClick={() => handleStatusClick(item.id, status)}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors"
                              >
                                <span
                                  className={cn(
                                    "h-2 w-2 rounded-full",
                                    inventoryStatusColor(status) === "green" && "bg-green-500",
                                    inventoryStatusColor(status) === "blue" && "bg-blue-500",
                                    inventoryStatusColor(status) === "yellow" && "bg-yellow-500",
                                    inventoryStatusColor(status) === "red" && "bg-red-500",
                                    inventoryStatusColor(status) === "orange" && "bg-orange-500"
                                  )}
                                />
                                {inventoryStatusLabel(status)}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
