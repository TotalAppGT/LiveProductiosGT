"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Download,
  Pencil,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, inventoryStatusLabel, inventoryStatusColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { InventoryItem, ApiResponse, PaginatedResponse } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  AUDIO: "Audio",
  ILUMINACION: "Iluminación",
  INSTRUMENTO: "Instrumento",
  CABLEADO: "Cableado",
  MOBILIARIO: "Mobiliario",
  HERRAMIENTA: "Herramienta",
  CONSUMIBLE: "Consumible",
  OTRO: "Otro",
};

const LOCATION_LABELS: Record<string, string> = {
  BODEGA_ELGIN: "Bodega Elgin",
  BODEGA_PP: "Bodega PP",
  EN_EVENTO: "En Evento",
  EN_RENTA: "En Renta",
};

export default function InventarioPage() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (locationFilter) params.set("location", locationFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/inventory?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar inventario");
      const json: PaginatedResponse<InventoryItem> = await res.json();
      if (json.success) {
        setItems(json.data);
      } else {
        setItems([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, categoryFilter, statusFilter, locationFilter, search]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const stats = {
    total: items.length,
    disponible: items.filter((i) => i.status === "DISPONIBLE").length,
    asignado: items.filter((i) => i.status === "ASIGNADO").length,
    reparacion: items.filter((i) => i.status === "EN_REPARACION").length,
    danado: items.filter((i) => i.status === "DANADO" || i.status === "PERDIDO").length,
  };

  const damagedItems = items.filter(
    (i) => i.status === "DANADO" || i.status === "PERDIDO"
  );

  async function deleteItem(id: string) {
    if (!confirm("¿Estás seguro de eliminar este ítem?")) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Ítem eliminado");
        fetchItems();
      }
    } catch {
      toast.error("Error al eliminar");
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventario</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona el equipo y materiales
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />}>
            Exportar
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Agregar Ítem
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "bg-blue-500/10 text-blue-400" },
          { label: "Disponibles", value: stats.disponible, color: "bg-green-500/10 text-green-400" },
          { label: "Asignados", value: stats.asignado, color: "bg-yellow-500/10 text-yellow-400" },
          { label: "En Reparación", value: stats.reparacion, color: "bg-purple-500/10 text-purple-400" },
          { label: "Dañados/Perdidos", value: stats.danado, color: "bg-red-500/10 text-red-400" },
        ].map((stat) => (
          <Card key={stat.label} variant="bordered" className="p-3 text-center">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>

      {damagedItems.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="font-semibold text-red-700 dark:text-red-400">
              Alertas de Equipo ({damagedItems.length})
            </h3>
          </div>
          <div className="space-y-2">
            {damagedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-red-600 dark:text-red-300">
                  {item.name} - {inventoryStatusLabel(item.status)}
                </span>
                <Badge size="sm" color={inventoryStatusColor(item.status)}>
                  {inventoryStatusLabel(item.status)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar ítems..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las categorías</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="ASIGNADO">Asignado</option>
          <option value="EN_REPARACION">En Reparación</option>
          <option value="DANADO">Dañado</option>
          <option value="PERDIDO">Perdido</option>
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas las ubicaciones</option>
          {Object.entries(LOCATION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando inventario..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchItems}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-16 w-16" />}
          title="Inventario vacío"
          description="No hay ítems registrados en el inventario."
          action={{ label: "Agregar Ítem", onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <Card variant="bordered" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cant.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Asignado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {items.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                      (item.status === "DANADO" || item.status === "PERDIDO") &&
                        "bg-red-50/50 dark:bg-red-900/5"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </p>
                        {item.serialNumber && (
                          <p className="text-xs text-gray-400">SN: {item.serialNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900 dark:text-white font-medium">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" color={inventoryStatusColor(item.status)}>
                        {inventoryStatusLabel(item.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {LOCATION_LABELS[item.location] || item.location}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {item.assignedTo?.name || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingItem(item)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteItem(item.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <InventoryFormModal
        isOpen={showAddModal || !!editingItem}
        onClose={() => {
          setShowAddModal(false);
          setEditingItem(null);
        }}
        token={token || ""}
        item={editingItem}
        onSaved={fetchItems}
      />
    </div>
  );
}

function InventoryFormModal({
  isOpen,
  onClose,
  token,
  item,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  item: InventoryItem | null;
  onSaved: () => void;
}) {
  const isEditing = !!item;
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "AUDIO");
  const [quantity, setQuantity] = useState(String(item?.quantity || 1));
  const [status, setStatus] = useState(item?.status || "DISPONIBLE");
  const [location, setLocation] = useState(item?.location || "BODEGA_ELGIN");
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const url = isEditing ? `/api/inventory/${item.id}` : "/api/inventory";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          category,
          quantity: parseInt(quantity) || 1,
          status,
          location,
          serialNumber: serialNumber.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isEditing ? "Ítem actualizado" : "Ítem creado");
        onSaved();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Editar Ítem" : "Agregar Ítem"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Input
            label="Cantidad"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="DISPONIBLE">Disponible</option>
              <option value="ASIGNADO">Asignado</option>
              <option value="EN_REPARACION">En Reparación</option>
              <option value="DANADO">Dañado</option>
              <option value="PERDIDO">Perdido</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Ubicación
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(LOCATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <Input
          label="Número de serie"
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            {isEditing ? "Guardar Cambios" : "Agregar Ítem"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
