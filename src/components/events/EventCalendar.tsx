"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, eventStatusColor } from "@/components/ui/Badge";
import type { Event } from "@/types";

interface EventCalendarProps {
  events: Event[];
  onDayClick: (date: Date, events: Event[]) => void;
  onEventClick?: (event: Event) => void;
  className?: string;
}

export function EventCalendar({
  events,
  onDayClick,
  onEventClick,
  className,
}: EventCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((event) => {
      if (event.date) {
        const key = format(new Date(event.date), "yyyy-MM-dd");
        const existing = map.get(key) || [];
        existing.push(event);
        map.set(key, existing);
      }
    });
    return map;
  }, [events]);

  const weekLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function handlePrevMonth() {
    setCurrentMonth(subMonths(currentMonth, 1));
  }

  function handleNextMonth() {
    setCurrentMonth(addMonths(currentMonth, 1));
  }

  function handleToday() {
    setCurrentMonth(new Date());
  }

  function handleDayClick(date: Date) {
    const key = format(date, "yyyy-MM-dd");
    const dayEvents = eventsByDate.get(key) || [];
    setSelectedDate(date);
    onDayClick(date, dayEvents);
  }

  const selectedDateKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : null;
  const selectedDayEvents = selectedDateKey ? eventsByDate.get(selectedDateKey) || [] : [];

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: es })}
          </h2>
          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-400"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={handleToday}>
          Hoy
        </Button>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7">
          {weekLabels.map((label) => (
            <div
              key={label}
              className="px-2 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 uppercase"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDate.get(key) || [];
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);

            return (
              <button
                key={key}
                onClick={() => handleDayClick(day)}
                className={cn(
                  "min-h-[80px] p-1.5 text-sm border-b border-r border-gray-100 dark:border-gray-700 transition-colors hover:bg-blue-50 dark:hover:bg-blue-900/10 group",
                  !isCurrentMonth && "opacity-30",
                  isSelected && "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-500",
                  isTodayDate && !isSelected && "bg-yellow-50 dark:bg-yellow-900/10"
                )}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium mb-1",
                    isTodayDate && "bg-blue-600 text-white",
                    !isTodayDate && "text-gray-700 dark:text-gray-300"
                  )}
                >
                  {format(day, "d")}
                </span>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 2).map((event) => (
                    <div
                      key={event.id}
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer group-hover:opacity-80",
                        eventStatusColor(event.status),
                        "bg-opacity-100 dark:bg-opacity-100"
                      )}
                      style={{
                        backgroundColor:
                          event.status === "CONFIRMADO"
                            ? "#dbeafe"
                            : event.status === "EN_PROGRESO"
                            ? "#e0e7ff"
                            : event.status === "COMPLETADO"
                            ? "#dcfce7"
                            : event.status === "COTIZACION"
                            ? "#fef9c3"
                            : event.status === "CANCELADO"
                            ? "#fee2e2"
                            : "#f3f4f6",
                        color:
                          event.status === "CONFIRMADO"
                            ? "#1d4ed8"
                            : event.status === "EN_PROGRESO"
                            ? "#4338ca"
                            : event.status === "COMPLETADO"
                            ? "#15803d"
                            : event.status === "COTIZACION"
                            ? "#a16207"
                            : event.status === "CANCELADO"
                            ? "#dc2626"
                            : "#374151",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEventClick?.(event);
                      }}
                    >
                      {event.name}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 pl-1">
                      +{dayEvents.length - 2} más
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDayEvents.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
            Eventos del {selectedDate && format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </h4>
          <div className="space-y-2">
            {selectedDayEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => onEventClick?.(event)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {event.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {event.clientName}
                    {event.location && ` - ${event.location}`}
                  </p>
                </div>
                <Badge color={eventStatusColor(event.status)} size="sm">
                  {event.status.replace(/_/g, " ").charAt(0) + event.status.replace(/_/g, " ").slice(1).toLowerCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
