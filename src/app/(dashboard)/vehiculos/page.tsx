"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Truck,
  AlertTriangle,
  Fuel,
  Gauge,
  Wrench,
  User,
  Pencil,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, vehicleStatusLabel, vehicleStatusColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { Vehicle, User as AppUser, ApiResponse, PaginatedResponse } from "@/types";

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  CAMION: "Camión",
  PANEL: "Panel",
  PICKUP: "Pickup",
  MOTO: "Moto",
  SEDAN: "Sedán",
  OTRO: "Otro",
};

export default function VehiculosPage() {
  const { user, token } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);

  const fetchVehicles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/vehicles?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar vehículos");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setVehicles(json.data);
      } else {
        setVehicles([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, search]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  async function quickStatusUpdate(vehicleId: string, status: string) {
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Estado actualizado");
        fetchVehicles();
      }
    } catch {
      toast.error("Error al actualizar");
    }
  }

  const maintenanceAlerts = vehicles.filter((v) => {
    if (v.status === "EN_MANTENIMIENTO" || v.status === "FUERA_SERVICIO") return true;
    return false;
  });

  const canManage = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Vehículos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona la flota de vehículos
          </p>
        </div>
        {canManage && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Agregar Vehículo
          </Button>
        )}
      </div>

      {maintenanceAlerts.length > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <h3 className="font-semibold text-yellow-700 dark:text-yellow-400">
              Alertas de Mantenimiento ({maintenanceAlerts.length})
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {maintenanceAlerts.map((v) => (
              <Badge key={v.id} size="sm" color="yellow">
                {v.name} ({v.plate}) - {vehicleStatusLabel(v.status)}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o placa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos los estados</option>
          <option value="DISPONIBLE">Disponible</option>
          <option value="EN_USO">En uso</option>
          <option value="EN_MANTENIMIENTO">En mantenimiento</option>
          <option value="FUERA_SERVICIO">Fuera de servicio</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando vehículos..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchVehicles}>Reintentar</Button>
        </div>
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-16 w-16" />}
          title="No hay vehículos"
          description="No se encontraron vehículos registrados."
          action={{ label: "Agregar Vehículo", onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {vehicles.map((vehicle) => (
            <Card key={vehicle.id} variant="bordered" className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {vehicle.name}
                  </h3>
                  <p className="text-xs text-gray-500">{vehicle.plate}</p>
                </div>
                <Badge size="sm" color={vehicleStatusColor(vehicle.status)} dot>
                  {vehicleStatusLabel(vehicle.status)}
                </Badge>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Tipo</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {VEHICLE_TYPE_LABELS[vehicle.type] || vehicle.type}
                  </span>
                </div>
                {vehicle.mileage !== null && vehicle.mileage !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Gauge className="h-3 w-3" /> Kilometraje
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {vehicle.mileage.toLocaleString()} km
                    </span>
                  </div>
                )}
                {vehicle.fuelLevel !== null && vehicle.fuelLevel !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Fuel className="h-3 w-3" /> Combustible
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {vehicle.fuelLevel}%
                    </span>
                  </div>
                )}
                {vehicle.assignedTo && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1">
                      <User className="h-3 w-3" /> Conductor
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {vehicle.assignedTo.name}
                    </span>
                  </div>
                )}
                {vehicle.lastMaintenanceAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Wrench className="h-3 w-3" /> Último mantenimiento
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 text-xs">
                      {formatDate(vehicle.lastMaintenanceAt)}
                    </span>
                  </div>
                )}
              </div>

              {canManage && (
                <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => setEditingVehicle(vehicle)}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <select
                    value={vehicle.status}
                    onChange={(e) => quickStatusUpdate(vehicle.id, e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="EN_USO">En uso</option>
                    <option value="EN_MANTENIMIENTO">En mantenimiento</option>
                    <option value="FUERA_SERVICIO">Fuera de servicio</option>
                  </select>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <VehicleFormModal
        key={editingVehicle?.id || "new"}
        isOpen={showAddModal || !!editingVehicle}
        onClose={() => {
          setShowAddModal(false);
          setEditingVehicle(null);
        }}
        token={token || ""}
        vehicle={editingVehicle}
        onSaved={fetchVehicles}
      />
    </div>
  );
}

function VehicleFormModal({
  isOpen,
  onClose,
  token,
  vehicle,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  vehicle: Vehicle | null;
  onSaved: () => void;
}) {
  const isEditing = !!vehicle;
  const [name, setName] = useState(vehicle?.name || "");
  const [plate, setPlate] = useState(vehicle?.plate || "");
  const [type, setType] = useState(vehicle?.type || "PANEL");
  const [status, setStatus] = useState(vehicle?.status || "DISPONIBLE");
  const [mileage, setMileage] = useState(vehicle?.mileage?.toString() || "");
  const [fuelLevel, setFuelLevel] = useState(vehicle?.fuelLevel?.toString() || "");
  const [notes, setNotes] = useState(vehicle?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !plate.trim()) return;
    setSaving(true);
    try {
      const url = isEditing ? `/api/vehicles/${vehicle.id}` : "/api/vehicles";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          plate: plate.trim().toUpperCase(),
          type,
          status,
          mileage: mileage ? parseInt(mileage) : undefined,
          fuelLevel: fuelLevel ? parseInt(fuelLevel) : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isEditing ? "Vehículo actualizado" : "Vehículo creado");
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
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Editar Vehículo" : "Agregar Vehículo"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Placa" value={plate} onChange={(e) => setPlate(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="DISPONIBLE">Disponible</option>
              <option value="EN_USO">En uso</option>
              <option value="EN_MANTENIMIENTO">En mantenimiento</option>
              <option value="FUERA_SERVICIO">Fuera de servicio</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Kilometraje" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} />
          <Input label="Nivel combustible (%)" type="number" min="0" max="100" value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas</label>
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
            {isEditing ? "Guardar Cambios" : "Agregar Vehículo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
