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
  ChevronDown,
  ChevronUp,
  Bell,
  BellOff,
  MessageCircle,
  Clock,
  X,
  AlertTriangle,
  Package,
} from "lucide-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, eventStatusLabel, eventStatusColor } from "@/components/ui/Badge";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/Tabs";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatCurrency, cn } from "@/lib/utils";
import type { Event, EventStatus, User, ApiResponse, PaginatedResponse } from "@/types";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function EventosPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
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
  const [reminders, setReminders] = useState<Set<string>>(new Set());
  const [sendingNotification, setSendingNotification] = useState<Set<string>>(new Set());
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);

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

  const fetchUpcomingEvents = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/events/upcoming?limit=5", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) setUpcomingEvents(json.data);
      }
    } catch {
      // silent
    }
  }, [token]);

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
    fetchUpcomingEvents();
    fetchUsers();
  }, [fetchEvents, fetchUpcomingEvents, fetchUsers]);

  useEffect(() => {
    const stored = localStorage.getItem("lp_event_reminders");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setReminders(new Set(parsed));
      } catch {
        // ignore
      }
    }
  }, []);

  function toggleReminder(eventId: string) {
    setReminders((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
        toast.success("Recordatorio desactivado");
      } else {
        next.add(eventId);
        toast.success("Recordatorio activado");
      }
      localStorage.setItem("lp_event_reminders", JSON.stringify([...next]));
      return next;
    });
  }

  async function sendWhatsAppNotification(event: Event) {
    if (!token) return;
    setSendingNotification((prev) => new Set(prev).add(event.id));
    try {
      const res = await fetch("/api/whatsapp/send-event-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId: event.id }),
      });
      if (!res.ok) throw new Error("Error al enviar notificación");
      toast.success(`Notificación enviada para "${event.name}"`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    } finally {
      setSendingNotification((prev) => {
        const next = new Set(prev);
        next.delete(event.id);
        return next;
      });
    }
  }

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

  async function fetchEventDetail(eventId: string) {
    if (!token) return;
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json: ApiResponse<Event> = await res.json();
        if (json.success && json.data) {
          setDetailEvent(json.data);
        }
      }
    } catch {
      toast.error("Error al cargar detalle del evento");
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

  function isThisWeek(dateStr: string): boolean {
    const d = new Date(dateStr);
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    return d >= startOfWeek && d <= endOfWeek;
  }

  function getDaysUntil(dateStr: string): number {
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  const calendarDays = getDaysInMonth(selectedYear, selectedDate);
  const staffAssignedEvents = users.filter((u) =>
    events.some((e) => e.responsibleId === u.id)
  );

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

      {upcomingEvents.length > 0 && (
        <Card variant="bordered" className="p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarIcon className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Próximos Eventos
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {upcomingEvents.slice(0, 5).map((event) => {
              const daysUntil = getDaysUntil(event.date);
              return (
                <div
                  key={event.id}
                  className="relative bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => {
                    fetchEventDetail(event.id);
                  }}
                >
                  {isThisWeek(event.date) && (
                    <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {daysUntil === 0
                        ? "HOY"
                        : daysUntil === 1
                        ? "MAÑANA"
                        : `${daysUntil} DÍAS`}
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {event.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {event.clientName}
                      </p>
                    </div>
                    <Badge size="sm" color={eventStatusColor(event.status)}>
                      {eventStatusLabel(event.status)}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <CalendarIcon className="h-3 w-3" />
                    <span>{formatDate(event.date)}</span>
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{event.location}</span>
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleReminder(event.id);
                      }}
                      className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        reminders.has(event.id)
                          ? "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20"
                          : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                      )}
                      title={reminders.has(event.id) ? "Desactivar recordatorio" : "Activar recordatorio"}
                    >
                      {reminders.has(event.id) ? (
                        <Bell className="h-3.5 w-3.5" />
                      ) : (
                        <BellOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendWhatsAppNotification(event);
                      }}
                      disabled={sendingNotification.has(event.id)}
                      className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 transition-colors"
                      title="Enviar notificación WhatsApp"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
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
                          onClick={() => fetchEventDetail(ev.id)}
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
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Evento</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fecha</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">Recordatorio</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase">WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {events.map((event) => (
                    <tr
                      key={event.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                      onClick={() => fetchEventDetail(event.id)}
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {event.name}
                          </p>
                          <p className="text-xs text-gray-500">{event.serviceType || "—"}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {event.clientName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {isThisWeek(event.date) && (
                            <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.5 rounded-full">
                              {getDaysUntil(event.date) === 0 ? "HOY" : `${getDaysUntil(event.date)}d`}
                            </span>
                          )}
                          {formatDate(event.date)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 max-w-[150px] truncate">
                        {event.location || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge size="sm" color={eventStatusColor(event.status)}>
                          {eventStatusLabel(event.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleReminder(event.id);
                          }}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            reminders.has(event.id)
                              ? "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20"
                              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                          )}
                        >
                          {reminders.has(event.id) ? (
                            <Bell className="h-4 w-4" />
                          ) : (
                            <BellOff className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sendWhatsAppNotification(event);
                          }}
                          disabled={sendingNotification.has(event.id)}
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 transition-colors"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {viewMode === "list" && events.length > 0 && (
            <div className="sm:hidden space-y-3">
              {events.map((event) => (
                <Card key={event.id} variant="bordered">
                  <div className="p-4">
                    <div
                      className="flex items-start gap-4 cursor-pointer"
                      onClick={() => fetchEventDetail(event.id)}
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
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{event.clientName}</span>
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {event.location}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleReminder(event.id);
                            }}
                            className={cn(
                              "p-1 rounded transition-colors",
                              reminders.has(event.id)
                                ? "text-yellow-600"
                                : "text-gray-400"
                            )}
                          >
                            {reminders.has(event.id) ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              sendWhatsAppNotification(event);
                            }}
                            disabled={sendingNotification.has(event.id)}
                            className="p-1 rounded text-green-600"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </button>
                          {isThisWeek(event.date) && (
                            <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-bold px-1.5 py-0.5 rounded-full">
                              {getDaysUntil(event.date) === 0 ? "HOY" : `${getDaysUntil(event.date)} DÍAS`}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className="h-5 w-5 text-gray-400 flex-shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedEvent(expandedEvent === event.id ? null : event.id);
                          if (expandedEvent !== event.id) fetchEventDetail(event.id);
                        }}
                      />
                    </div>

                    {expandedEvent === event.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          {event.clientPhone && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <Phone className="h-3 w-3" /> {event.clientPhone}
                            </span>
                          )}
                          {event.clientEmail && (
                            <span className="flex items-center gap-1 text-gray-500">
                              <Mail className="h-3 w-3" /> {event.clientEmail}
                            </span>
                          )}
                        </div>
                        {event.notes && (
                          <p className="text-xs text-gray-500">{event.notes}</p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" size="sm" leftIcon={<DollarSign className="h-3 w-3" />} onClick={() => router.push("/cobros")}>
                            Cobros
                          </Button>
                          <Button variant="outline" size="sm" leftIcon={<CheckSquare className="h-3 w-3" />} onClick={() => router.push("/tareas")}>
                            Tareas
                          </Button>
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
        </div>

        <div className="space-y-4">
          <Card variant="bordered" className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <UsersIcon className="h-5 w-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
                Personal Asignado
              </h3>
            </div>
            {staffAssignedEvents.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Sin personal asignado a eventos
              </p>
            ) : (
              <div className="space-y-2">
                {staffAssignedEvents.map((u) => {
                  const userEvents = events.filter((e) => e.responsibleId === u.id);
                  return (
                    <div key={u.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                      <Avatar name={u.name} src={u.avatar} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {u.name}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {userEvents.length} evento{userEvents.length !== 1 && "s"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      <EventDetailModal
        isOpen={!!detailEvent}
        onClose={() => setDetailEvent(null)}
        event={detailEvent}
        token={token || ""}
        users={users}
        onUpdate={fetchEvents}
      />

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

function EventDetailModal({
  isOpen,
  onClose,
  event,
  token,
  users,
  onUpdate,
}: {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
  token: string;
  users: User[];
  onUpdate: () => void;
}) {
  if (!event) return null;

  const assignedStaff = users.filter((u) => u.id === event.responsibleId);
  const daysUntil = Math.ceil(
    (new Date(event.date).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle del Evento" size="lg">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{event.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{event.clientName}</p>
          </div>
          <Badge size="md" color={eventStatusColor(event.status)}>
            {eventStatusLabel(event.status)}
          </Badge>
        </div>

        {isThisWeekLocal(event.date) && (
          <div className={cn(
            "rounded-lg p-3 flex items-center gap-2",
            daysUntil <= 1 ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" : "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
          )}>
            <Clock className={cn("h-5 w-5", daysUntil <= 1 ? "text-red-500" : "text-yellow-500")} />
            <span className={cn("text-sm font-medium", daysUntil <= 1 ? "text-red-700 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400")}>
              {daysUntil === 0 ? "Este evento es HOY" : daysUntil === 1 ? "Este evento es MAÑANA" : `Faltan ${daysUntil} días para este evento`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 mb-1">Fecha</p>
            <p className="text-gray-900 dark:text-white font-medium">{formatDate(event.date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Ubicación</p>
            <p className="text-gray-900 dark:text-white font-medium">{event.location || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Tipo de servicio</p>
            <p className="text-gray-900 dark:text-white font-medium">{event.serviceType || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Invitados</p>
            <p className="text-gray-900 dark:text-white font-medium">{event.guestCount || "—"}</p>
          </div>
          {event.clientPhone && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Teléfono</p>
              <p className="text-gray-900 dark:text-white font-medium">{event.clientPhone}</p>
            </div>
          )}
          {event.clientEmail && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Email</p>
              <p className="text-gray-900 dark:text-white font-medium">{event.clientEmail}</p>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
            Personal Asignado
          </h4>
          {assignedStaff.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">Sin personal asignado</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignedStaff.map((u) => (
                <div key={u.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                  <Avatar name={u.name} src={u.avatar} size="sm" />
                  <span className="text-sm text-gray-900 dark:text-white">{u.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {event.tasks && event.tasks.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Tareas Vinculadas ({event.tasks.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {event.tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-2 text-sm p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <CheckSquare className="h-4 w-4 text-gray-400" />
                  <span className="flex-1 text-gray-700 dark:text-gray-300">{task.title}</span>
                  <Badge size="sm" color={task.status === "COMPLETADA" ? "green" : task.status === "PENDIENTE" ? "yellow" : "blue"}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {event.cobros && event.cobros.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
              Estado de Cobros
            </h4>
            <div className="space-y-2">
              {event.cobros.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <span className="text-gray-700 dark:text-gray-300">{c.clientName}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-900 dark:text-white font-medium">
                      {formatCurrency(Number(c.amount))}
                    </span>
                    <Badge size="sm" color={c.status === "COMPLETADO" ? "green" : c.status === "PARCIAL" ? "orange" : "yellow"}>
                      {c.status === "COMPLETADO" ? "Completado" : c.status === "PARCIAL" ? "Parcial" : "Pendiente"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {event.notes && (
          <div>
            <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">Notas</h4>
            <p className="text-sm text-gray-700 dark:text-gray-300">{event.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function isThisWeekLocal(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  return d >= startOfWeek && d <= endOfWeek;
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
