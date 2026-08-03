"use client";

import { useState } from "react";
import { Save, Plus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type { EventStatus, CreateEventDTO, UpdateEventDTO, User } from "@/types";

interface EventFormProps {
  initialData?: Partial<CreateEventDTO & { id?: string }>;
  users?: User[];
  onSubmit: (data: CreateEventDTO | UpdateEventDTO) => void;
  onCancel: () => void;
  isLoading?: boolean;
  isEdit?: boolean;
}

const serviceTypeOptions = [
  { value: "DJ COMPLETO", label: "DJ Completo" },
  { value: "SAXOFONIC", label: "Saxofonic" },
  { value: "SUNDAY FUNDAY", label: "Sunday Funday" },
  { value: "DJ + SAXO", label: "DJ + Saxo" },
  { value: "SONIDO", label: "Sonido" },
  { value: "ILUMINACION", label: "Iluminación" },
  { value: "OTRO", label: "Otro" },
];

const audioTypeOptions = [
  { value: "LINE ARRAY", label: "Line Array" },
  { value: "D&B", label: "D&B" },
  { value: "JBL PRX", label: "JBL PRX" },
  { value: "YAMAHA DXR", label: "Yamaha DXR" },
  { value: "EV ZLX", label: "EV ZLX" },
  { value: "BASICO", label: "Básico" },
  { value: "OTRO", label: "Otro" },
];

const statusOptions: { value: EventStatus; label: string }[] = [
  { value: "COTIZACION", label: "Cotización" },
  { value: "CONFIRMADO", label: "Confirmado" },
  { value: "EN_PROGRESO", label: "En progreso" },
  { value: "COMPLETADO", label: "Completado" },
  { value: "CANCELADO", label: "Cancelado" },
];

export function EventForm({
  initialData,
  users = [],
  onSubmit,
  onCancel,
  isLoading = false,
  isEdit = false,
}: EventFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [clientName, setClientName] = useState(initialData?.clientName || "");
  const [clientPhone, setClientPhone] = useState(initialData?.clientPhone || "");
  const [clientEmail, setClientEmail] = useState(initialData?.clientEmail || "");
  const [date, setDate] = useState(initialData?.date?.split("T")[0] || "");
  const [eventTime, setEventTime] = useState(initialData?.date?.split("T")[1]?.slice(0, 5) || "");
  const [location, setLocation] = useState(initialData?.location || "");
  const [guestCount, setGuestCount] = useState(initialData?.guestCount?.toString() || "");
  const [serviceType, setServiceType] = useState(initialData?.serviceType || "");
  const [audioType, setAudioType] = useState(initialData?.audioType || "");
  const [plannerId, setPlannerId] = useState(initialData?.plannerId || "");
  const [responsibleId, setResponsibleId] = useState(initialData?.responsibleId || "");
  const [status, setStatus] = useState<EventStatus>(initialData?.status || "COTIZACION");
  const [notes, setNotes] = useState(initialData?.notes || "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "El nombre del evento es obligatorio";
    if (!clientName.trim()) errs.clientName = "El nombre del cliente es obligatorio";
    if (!date) errs.date = "La fecha es obligatoria";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    const fullDate = date
      ? eventTime
        ? `${date}T${eventTime}:00`
        : `${date}T00:00:00`
      : undefined;

    const data: CreateEventDTO = {
      name: name.trim(),
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim() || undefined,
      clientEmail: clientEmail.trim() || undefined,
      date: fullDate || new Date().toISOString(),
      location: location.trim() || undefined,
      guestCount: guestCount ? parseInt(guestCount) : undefined,
      serviceType: serviceType || undefined,
      audioType: audioType || undefined,
      plannerId: plannerId || undefined,
      responsibleId: responsibleId || undefined,
      status: isEdit ? status : "COTIZACION",
      notes: notes.trim() || undefined,
    };

    onSubmit(data);
  }

  const userOptions = users.map((u) => ({ value: u.id, label: u.name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nombre del evento"
          placeholder="Ej: Boda Martínez - García"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          required
        />
        <Input
          label="Cliente"
          placeholder="Nombre del cliente"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          error={errors.clientName}
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Teléfono"
          type="tel"
          placeholder="+56 9..."
          value={clientPhone}
          onChange={(e) => setClientPhone(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          placeholder="cliente@email.com"
          value={clientEmail}
          onChange={(e) => setClientEmail(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Fecha"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={errors.date}
          required
        />
        <Input
          label="Hora"
          type="time"
          value={eventTime}
          onChange={(e) => setEventTime(e.target.value)}
        />
        <Input
          label="Invitados"
          type="number"
          placeholder="0"
          value={guestCount}
          onChange={(e) => setGuestCount(e.target.value)}
        />
      </div>

      <Input
        label="Ubicación"
        placeholder="Dirección del evento"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Tipo de servicio"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value)}
          options={serviceTypeOptions}
          placeholder="Seleccionar tipo"
        />
        <Select
          label="Tipo de audio"
          value={audioType}
          onChange={(e) => setAudioType(e.target.value)}
          options={audioTypeOptions}
          placeholder="Seleccionar audio"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Planificador"
          value={plannerId}
          onChange={(e) => setPlannerId(e.target.value)}
          options={[{ value: "", label: "Sin planificador" }, ...userOptions]}
          placeholder="Seleccionar planificador"
        />
        <Select
          label="Responsable"
          value={responsibleId}
          onChange={(e) => setResponsibleId(e.target.value)}
          options={[{ value: "", label: "Sin responsable" }, ...userOptions]}
          placeholder="Seleccionar responsable"
        />
      </div>

      {isEdit && (
        <Select
          label="Estado"
          value={status}
          onChange={(e) => setStatus(e.target.value as EventStatus)}
          options={statusOptions}
        />
      )}

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
          {isEdit ? "Guardar cambios" : "Crear evento"}
        </Button>
      </div>
    </form>
  );
}
