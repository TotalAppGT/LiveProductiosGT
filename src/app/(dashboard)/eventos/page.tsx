"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Calendar as CalendarIcon,
  List,
  MapPin,
  Phone,
  Mail,
  Users as UsersIcon,
  DollarSign,
  CheckSquare,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, eventStatusLabel, eventStatusColor } from "@/components/ui/Badge";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import type { Event, EventStatus, User, ApiResponse, PaginatedResponse } from "@/types";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function EventosPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const fetchEvents = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/events?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar eventos");
      const json: PaginatedResponse<Event> = await res.json();
      if (json.success) {
        setEvents(json.data);
      } else {
        setEvents([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, search]);

  const fetchUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setUsers(json.data);
      }
    } catch {
      // silent
    }
  }, [token]);

  useEffect(() => {
    fetchEvents();
    fetchUsers();
  }, [fetchEvents, fetchUsers]);

  async function deleteEvent(eventId: string) {
    if (!confirm("¿Estás seguro de eliminar este evento?")) return;
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Evento eliminado");
        fetchEvents();
      } else {
        throw new Error("Error al eliminar");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  }

  function getDaysInMonth(year: number, month: number): Date[] {
    const days: Date[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push(d);
    }
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }

  function getEventsForDate(date: Date): Event[] {
    const dateStr = date.toISOString().split("T")[0];
    return events.filter((e) => e.date?.startsWith(dateStr));
  }

  const calendarDays = getDaysInMonth(selectedYear, selectedDate);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Eventos</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona los eventos de producciones en vivo
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={viewMode === "calendar" ? <List className="h-4 w-4" /> : <CalendarIcon className="h-4 w-4" />}
            onClick={() => setViewMode(viewMode === "list" ? "calendar" : "list")}
            className="hidden sm:flex"
          >
            {viewMode === "calendar" ? "Lista" : "Calendario"}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Nuevo Evento
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar eventos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="">Todos los estados</option>
          <option value="COTIZACION">Cotización</option>
          <option value="CONFIRMADO">Confirmado</option>
          <option value="EN_PROGRESO">En progreso</option>
          <option value="COMPLETADO">Completado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando eventos..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchEvents}>Reintentar</Button>
        </div>
      ) : viewMode === "calendar" ? (
        <Card variant="bordered" className="p-4">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedDate === 0) {
                  setSelectedDate(11);
                  setSelectedYear(selectedYear - 1);
                } else {
                  setSelectedDate(selectedDate - 1);
                }
              }}
            >
              &larr;
            </Button>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {MONTHS[selectedDate]} {selectedYear}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (selectedDate === 11) {
                  setSelectedDate(0);
                  setSelectedYear(selectedYear + 1);
                } else {
                  setSelectedDate(selectedDate + 1);
                }
              }}
            >
              &rarr;
            </Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const dayEvents = getEventsForDate(day);
              const isCurrentMonth = day.getMonth() === selectedDate;
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[80px] p-1 rounded border border-transparent",
                    isCurrentMonth ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-800/30 opacity-50",
                    day.toDateString() === new Date().toDateString() && "border-blue-500"
                  )}
                >
                  <span className="text-xs text-gray-600 dark:text-gray-400">{day.getDate()}</span>
                  {dayEvents.map((ev) => (
                    <div
                      key={ev.id}
                      className="mt-0.5 px-1 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 truncate cursor-pointer"
                      title={ev.name}
                      onClick={() => router.push(`/eventos`)}
                    >
                      {ev.name}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </Card>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon className="h-16 w-16" />}
          title="No hay eventos"
          description="No se encontraron eventos con los filtros actuales."
          action={{ label: "Nuevo Evento", onClick: () => setShowCreateModal(true) }}
        />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id} variant="bordered">
              <div className="p-4">
                <div
                  className="flex items-start gap-4 cursor-pointer"
                  onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                >
                  <div className="flex-shrink-0 w-14 text-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {new Date(event.date).getDate()}
                    </p>
                    <p className="text-xs text-gray-500">{MONTHS[new Date(event.date).getMonth()].substring(0, 3)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {event.name}
                      </h3>
                      <Badge size="sm" color={eventStatusColor(event.status)}>
                        {eventStatusLabel(event.status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{event.clientName}</span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {event.location}
                        </span>
                      )}
                      {event.serviceType && <span>{event.serviceType}</span>}
                      {event.responsible && (
                        <span>{event.responsible.name}</span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    "h-5 w-5 text-gray-400 transition-transform",
                    expandedEvent === event.id && "rotate-90"
                  )} />
                </div>

                {expandedEvent === event.id && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {event.clientPhone && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <Phone className="h-4 w-4 text-gray-400" />
                          {event.clientPhone}
                        </div>
                      )}
                      {event.clientEmail && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <Mail className="h-4 w-4 text-gray-400" />
                          {event.clientEmail}
                        </div>
                      )}
                      {event.guestCount && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <UsersIcon className="h-4 w-4 text-gray-400" />
                          {event.guestCount} invitados
                        </div>
                      )}
                      {event.serviceType && (
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <span className="font-medium">Servicio:</span> {event.serviceType}
                        </div>
                      )}
                    </div>
                    {event.notes && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Notas</p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{event.notes}</p>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<DollarSign className="h-3 w-3" />}
                        onClick={() => router.push("/cobros")}
                      >
                        Ver Cobros
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<CheckSquare className="h-3 w-3" />}
                        onClick={() => router.push("/tareas")}
                      >
                        Ver Tareas
                      </Button>
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" onClick={() => deleteEvent(event.id)}>
                        Eliminar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateEventModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        token={token || ""}
        users={users}
        onCreated={fetchEvents}
      />
    </div>
  );
}

function CreateEventModal({
  isOpen,
  onClose,
  token,
  users,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  users: User[];
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [status, setStatus] = useState("CONFIRMADO");
  const [responsibleId, setResponsibleId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim() || !date) return;
    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim() || undefined,
          clientEmail: clientEmail.trim() || undefined,
          date,
          location: location.trim() || undefined,
          guestCount: guestCount ? parseInt(guestCount) : undefined,
          serviceType: serviceType.trim() || undefined,
          status,
          responsibleId: responsibleId || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Evento creado exitosamente");
        onCreated();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al crear evento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo Evento" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Nombre del evento"
            placeholder="Ej: Boda María & José"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Nombre del cliente"
            placeholder="Cliente"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Teléfono"
            type="tel"
            placeholder="+502 5555-5555"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
          />
          <Input
            label="Correo electrónico"
            type="email"
            placeholder="cliente@correo.com"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Input
            label="Fecha"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <Input
            label="Ubicación"
            placeholder="Lugar"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <Input
            label="Invitados"
            type="number"
            placeholder="0"
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tipo de servicio
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Seleccionar</option>
              <option value="DJ + AUDIO">DJ + Audio</option>
              <option value="DJ + AUDIO + ILUMINACION">DJ + Audio + Iluminación</option>
              <option value="SOLO AUDIO">Solo Audio</option>
              <option value="SOLO ILUMINACION">Solo Iluminación</option>
              <option value="COMPLETO">Completo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="COTIZACION">Cotización</option>
              <option value="CONFIRMADO">Confirmado</option>
              <option value="EN_PROGRESO">En progreso</option>
              <option value="COMPLETADO">Completado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Responsable
            </label>
            <select
              value={responsibleId}
              onChange={(e) => setResponsibleId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>Crear Evento</Button>
        </div>
      </form>
    </Modal>
  );
}
