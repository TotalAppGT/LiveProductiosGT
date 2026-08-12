"use client";

import { useState } from "react";
import { Save, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type {
  InventoryCategory,
  InventoryStatus,
  InventoryLocation,
  CreateInventoryItemDTO,
  UpdateInventoryItemDTO,
  User,
} from "@/types";

interface InventoryFormProps {
  initialData?: Partial<CreateInventoryItemDTO & { id?: string }>;
  users?: User[];
  onSubmit: (data: CreateInventoryItemDTO | UpdateInventoryItemDTO) => void;
  onCancel: () => void;
  isLoading?: boolean;
  isEdit?: boolean;
}

const categoryOptions: { value: InventoryCategory; label: string }[] = [
  { value: "AUDIO", label: "Audio" },
  { value: "ILUMINACION", label: "Iluminación" },
  { value: "INSTRUMENTO", label: "Instrumento" },
  { value: "CABLEADO", label: "Cableado" },
  { value: "MOBILIARIO", label: "Mobiliario" },
  { value: "HERRAMIENTA", label: "Herramienta" },
  { value: "CONSUMIBLE", label: "Consumible" },
  { value: "OTRO", label: "Otro" },
];

const statusOptions: { value: InventoryStatus; label: string }[] = [
  { value: "DISPONIBLE", label: "Disponible" },
  { value: "ASIGNADO", label: "Asignado" },
  { value: "EN_REPARACION", label: "En reparación" },
  { value: "PERDIDO", label: "Perdido" },
  { value: "DANADO", label: "Dañado" },
];

export function InventoryForm({
  initialData,
  users = [],
  onSubmit,
  onCancel,
  isLoading = false,
  isEdit = false,
}: InventoryFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [category, setCategory] = useState<InventoryCategory | "">(initialData?.category || "");
  const [quantity, setQuantity] = useState(initialData?.quantity?.toString() || "1");
  const [status, setStatus] = useState<InventoryStatus | "">(initialData?.status || "");
  const [location, setLocation] = useState<InventoryLocation | "">(initialData?.location || "");
  const [assignedToId, setAssignedToId] = useState(initialData?.assignedToId || "");
  const [serialNumber, setSerialNumber] = useState(initialData?.serialNumber || "");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "El nombre es obligatorio";
    if (!category) errs.category = "Selecciona una categoría";
    if (!quantity || parseInt(quantity) < 0) errs.quantity = "Cantidad inválida";
    if (!status) errs.status = "Selecciona un estado";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const data: CreateInventoryItemDTO = {
      name: name.trim(),
      category: category as InventoryCategory,
      quantity: parseInt(quantity) || 1,
      status: status as InventoryStatus,
      location: location as InventoryLocation,
      assignedToId: assignedToId || undefined,
      serialNumber: serialNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    onSubmit(data);
  }

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Nombre del ítem"
        placeholder="Ej: Parlante JBL PRX 835"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        required
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Categoría"
          value={category}
          onChange={(e) => setCategory(e.target.value as InventoryCategory)}
          options={categoryOptions}
          error={errors.category}
          placeholder="Seleccionar categoría"
        />
        <Input
          label="Cantidad"
          type="number"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          error={errors.quantity}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value as InventoryStatus)}
          options={statusOptions}
          error={errors.status}
          placeholder="Seleccionar estado"
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Ubicación
          </label>
          <input
            list="location-options"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Ej: Bodega Elgin, Bodega PP..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <datalist id="location-options">
            <option value="Bodega Elgin" />
            <option value="Bodega PP" />
            <option value="En evento" />
            <option value="En renta" />
          </datalist>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Asignado a"
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          options={[{ value: "", label: "Sin asignar" }, ...userOptions]}
          placeholder="Seleccionar usuario"
        />
        <Input
          label="Número de serie"
          placeholder="Opcional"
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notas
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Notas u observaciones..."
          className="block w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors resize-y"
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <Button variant="ghost" type="button" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button
          type="submit"
          isLoading={isLoading}
          leftIcon={isEdit ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        >
          {isEdit ? "Guardar cambios" : "Agregar ítem"}
        </Button>
      </div>
    </form>
  );
}
