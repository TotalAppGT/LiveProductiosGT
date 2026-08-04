"use client";

import { useState, useRef, useEffect } from "react";
import {
  CheckCircle2,
  Play,
  CalendarClock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  ExternalLink,
  UserPlus,
  Clock4,
  Paperclip,
  AlertTriangle,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge, taskStatusColor, taskStatusLabel, taskPriorityColor, taskPriorityLabel } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { Task, TaskStatus, TaskCategory } from "@/types";

interface TaskCardProps {
  task: Task;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onReschedule: (task: Task) => void;
  onComment: (task: Task) => void;
  onClick: (task: Task) => void;
  onDelegate?: (task: Task) => void;
  onPostpone?: (task: Task) => void;
  showDelegate?: boolean;
  className?: string;
}

const priorityBorderColors: Record<string, string> = {
  BAJA: "border-l-gray-300 dark:border-l-gray-600",
  MEDIA: "border-l-blue-400",
  ALTA: "border-l-orange-400",
  URGENTE: "border-l-red-500",
};

const categoryLabels: Record<TaskCategory, string> = {
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

function formatDueDate(dateStr: string | null | undefined): { text: string; urgent: boolean } {
  if (!dateStr) return { text: "Sin fecha", urgent: false };
  const date = new Date(dateStr);
  if (isToday(date)) return { text: "Hoy", urgent: true };
  if (isTomorrow(date)) return { text: "Mañana", urgent: false };
  if (isPast(date)) {
    return {
      text: `Hace ${formatDistanceToNow(date, { locale: es })}`,
      urgent: true,
    };
  }
  return {
    text: `En ${formatDistanceToNow(date, { locale: es })}`,
    urgent: false,
  };
}

export function TaskCard({
  task,
  onStatusChange,
  onReschedule,
  onComment,
  onClick,
  onDelegate,
  onPostpone,
  showDelegate = false,
  className,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(expanded ? contentRef.current.scrollHeight : 0);
    }
  }, [expanded]);

  const dueDate = formatDueDate(task.dueDate);
  const isCompleted = task.status === "COMPLETADA";
  const isCancelled = task.status === "CANCELADA";
  const postponeCount = task.history?.filter((h) => h.action?.includes("Posponida")).length || 0;
  const lastPostponeEntry = task.history
    ?.filter((h) => h.action?.includes("Posponida"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-4 shadow-sm hover:shadow-md transition-all cursor-pointer",
        priorityBorderColors[task.priority] || "border-l-gray-300",
        isCompleted && "opacity-75",
        isCancelled && "opacity-60",
        className
      )}
      onClick={() => onClick(task)}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3
              className={cn(
                "text-sm font-semibold text-gray-900 dark:text-white truncate",
                isCompleted && "line-through"
              )}
            >
              {task.title}
            </h3>
            {task.description && (
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          {task.assignedTo && (
            <Avatar
              name={task.assignedTo.name}
              src={task.assignedTo.avatar}
              size="sm"
              className="flex-shrink-0"
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge color={taskStatusColor(task.status)} size="sm" dot>
            {taskStatusLabel(task.status)}
          </Badge>
          <Badge color={taskPriorityColor(task.priority)} size="sm">
            {taskPriorityLabel(task.priority)}
          </Badge>
          <Badge color="purple" size="sm">
            {categoryLabels[task.category] || task.category}
          </Badge>
          {task.type === "FIJA" && (
            <Badge color="teal" size="sm">
              {task.frequency ? task.frequency.charAt(0) + task.frequency.slice(1).toLowerCase() : "Fija"}
            </Badge>
          )}
          {postponeCount > 1 && (
            <Badge color="red" size="sm">
              {postponeCount}x
            </Badge>
          )}
        </div>

        {postponeCount > 0 && lastPostponeEntry && (
          <div className="mt-2 flex items-center gap-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">
            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              Posponida {postponeCount}x{lastPostponeEntry.action ? ` - ${lastPostponeEntry.action.replace("Tarea posponida: ", "")}` : ""}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <Clock className="h-3 w-3" />
            <span className={cn(dueDate.urgent && !isCompleted && "text-red-600 dark:text-red-400 font-medium")}>
              {dueDate.text}
            </span>
          </div>

          <div className="flex items-center gap-0.5">
            {task.status === "PENDIENTE" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task.id, "EN_PROCESO");
                }}
                className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 transition-colors"
                title="Iniciar tarea"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
            {task.status === "EN_PROCESO" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(task.id, "COMPLETADA");
                }}
                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 transition-colors"
                title="Completar tarea"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </button>
            )}
            {!isCompleted && !isCancelled && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReschedule(task);
                  }}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
                  title="Reprogramar"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                </button>
                {onPostpone && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onPostpone(task);
                    }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      postponeCount > 1
                        ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        : "text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                    )}
                    title="Posponer"
                  >
                    <Clock4 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onComment(task);
              }}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors relative"
              title="Comentarios"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {task.commentsList && task.commentsList.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center leading-none">
                  {task.commentsList.length}
                </span>
              )}
            </button>
            {showDelegate && onDelegate && !isCompleted && !isCancelled && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelegate(task);
                }}
                className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20 transition-colors"
                title="Pasar a otro usuario"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={expanded ? "Colapsar" : "Expandir"}
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{ maxHeight: `${contentHeight}px` }}
      >
        <div ref={contentRef}>
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3 space-y-3">
            {task.description && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                  Descripción
                </h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {task.description}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500">Asignado por</span>
                <p className="text-gray-700 dark:text-gray-300">
                  {task.assignedBy?.name || "\u2014"}
                </p>
              </div>
              <div>
                <span className="text-xs text-gray-400 dark:text-gray-500">Evento</span>
                <p className="text-gray-700 dark:text-gray-300">
                  {task.event ? (
                    <a
                      href={`/events/${task.event.id}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {task.event.name}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "\u2014"
                  )}
                </p>
              </div>
            </div>

            {task.commentsList && task.commentsList.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Comentarios ({task.commentsList.length})
                </h4>
                <div className="space-y-2 max-h-36 overflow-y-auto">
                  {task.commentsList.slice(0, 5).map((comment) => (
                    <div
                      key={comment.id}
                      className="flex gap-2 text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2"
                    >
                      <Avatar name={comment.user?.name} size="xs" className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white text-xs">
                            {comment.user?.name || "Usuario"}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {format(new Date(comment.createdAt), "dd/MM/yy HH:mm")}
                          </span>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 text-xs mt-0.5">
                          {comment.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {task.history && task.history.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Historial
                </h4>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {task.history.slice(0, 5).map((entry) => (
                    <div key={entry.id} className="flex items-center gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-400">
                        {entry.action}
                      </span>
                      {entry.previousStatus && entry.newStatus && (
                        <>
                          <Badge color={taskStatusColor(entry.previousStatus)} size="sm">
                            {taskStatusLabel(entry.previousStatus)}
                          </Badge>
                          <span className="text-gray-400">&rarr;</span>
                          <Badge color={taskStatusColor(entry.newStatus)} size="sm">
                            {taskStatusLabel(entry.newStatus)}
                          </Badge>
                        </>
                      )}
                      <span className="text-gray-400 ml-auto">
                        {format(new Date(entry.createdAt), "dd/MM HH:mm")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
