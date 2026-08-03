"use client";

import { useState } from "react";
import {
  MapPin,
  Calendar,
  Users,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { format, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge, eventStatusColor, eventStatusLabel } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import type { Event, User as UserType } from "@/types";

interface EventCardProps {
  event: Event;
  onClick?: (event: Event) => void;
  className?: string;
}

const serviceTypeLabels: Record<string, string> = {
  "DJ COMPLETO": "DJ Completo",
  SAXOFONIC: "Saxofonic",
  "SUNDAY FUNDAY": "Sunday Funday",
};

export function EventCard({ event, onClick, className }: EventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const isPastEvent = event.date ? isPast(new Date(event.date)) : false;

  const staffAvatars: (UserType | null | undefined)[] = [
    event.planner,
    event.responsible,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all",
        onClick && "cursor-pointer",
        className
      )}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest("[data-no-click]")) {
          onClick?.(event);
        }
      }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {event.name}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {event.clientName}
            </p>
          </div>
          <Badge color={eventStatusColor(event.status)} size="sm" dot>
            {eventStatusLabel(event.status)}
          </Badge>
        </div>

        <div className="mt-3 space-y-1.5">
          {event.date && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Calendar className="h-3.5 w-3.5 flex-shrink-0" />
              <span className={cn(isPastEvent && "text-red-500 dark:text-red-400")}>
                {format(new Date(event.date), "EEEE d 'de' MMMM, HH:mm", { locale: es })}
              </span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.guestCount != null && event.guestCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Users className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{event.guestCount} invitados</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge color="purple" size="sm">
              {serviceTypeLabels[event.serviceType || ""] || event.serviceType || "Sin tipo"}
            </Badge>
            {event.tasks && event.tasks.length > 0 && (
              <Badge color="blue" size="sm">
                <CheckCircle2 className="h-3 w-3" />{" "}
                {event.tasks.length} {event.tasks.length === 1 ? "tarea" : "tareas"}
              </Badge>
            )}
          </div>

          {staffAvatars.length > 0 && (
            <div className="flex items-center" data-no-click>
              {staffAvatars.slice(0, 3).map((user, i) => (
                <Avatar
                  key={user?.id || i}
                  name={user?.name}
                  src={user?.avatar}
                  size="xs"
                  className={cn(i > 0 && "-ml-1.5 ring-2 ring-white dark:ring-gray-800")}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            {event.clientPhone && (
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500">Teléfono</span>
                <p className="text-gray-700 dark:text-gray-300">{event.clientPhone}</p>
              </div>
            )}
            {event.clientEmail && (
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500">Email</span>
                <p className="text-gray-700 dark:text-gray-300">{event.clientEmail}</p>
              </div>
            )}
            {event.audioType && (
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500">Audio</span>
                <p className="text-gray-700 dark:text-gray-300">{event.audioType}</p>
              </div>
            )}
            {event.planner && (
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500">Planificador</span>
                <p className="text-gray-700 dark:text-gray-300">{event.planner.name}</p>
              </div>
            )}
          </div>
          {event.notes && (
            <div>
              <span className="text-xs text-gray-400 dark:text-gray-500">Notas</span>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">{event.notes}</p>
            </div>
          )}
        </div>
      )}

      <button
        data-no-click
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="w-full px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors rounded-b-xl"
      >
        {expanded ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" />
            Menos información
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" />
            Más información
          </>
        )}
      </button>
    </div>
  );
}
