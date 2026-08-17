"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Clock,
  Calendar,
  CalendarClock,
  MessageSquare,
  User,
  Link,
  ArrowRight,
  Phone,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Play,
  Ban,
  CalendarPlus,
  UserPlus,
  Clock4,
  Paperclip,
} from "lucide-react";
import { format, formatDistanceToNow, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge, taskStatusColor, taskStatusLabel, taskPriorityColor, taskPriorityLabel } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FileUpload } from "@/components/ui/FileUpload";
import type { Task, TaskStatus, TaskCategory, TaskHistory, TaskComment, User as UserType, FileAttachment } from "@/types";

interface TaskDetailProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onAddComment: (taskId: string, content: string) => void;
  onReschedule: (taskId: string, newDate: string, reason: string) => void;
  onDelegate?: (taskId: string, userId: string, reason: string) => Promise<void>;
  onPostpone?: (taskId: string, newDate: string, reason: string) => void;
  onUploadFiles?: (taskId: string, files: File[]) => Promise<FileAttachment[]>;
  onDeleteFile?: (taskId: string, fileId: string) => Promise<void>;
  isLoading?: boolean;
  token?: string;
}

const categoryLabels: Record<TaskCategory, string> = {
  PRE_EVENTO: "Pre-evento",
  EVENTO: "Evento",
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

const statusChangeOptions: { status: TaskStatus; label: string; icon: typeof CheckCircle2; color: string }[] = [
  { status: "PENDIENTE", label: "Marcar pendiente", icon: RotateCcw, color: "text-yellow-600" },
  { status: "EN_PROCESO", label: "Iniciar tarea", icon: Play, color: "text-blue-600" },
  { status: "COMPLETADA", label: "Completar tarea", icon: CheckCircle2, color: "text-green-600" },
  { status: "CANCELADA", label: "Cancelar tarea", icon: Ban, color: "text-red-600" },
];

const POSTPONE_REASONS = [
  { label: "Cliente no atendió", value: "Cliente no atendió" },
  { label: "Falta equipo", value: "Falta equipo" },
  { label: "Personal no disponible", value: "Personal no disponible" },
  { label: "Otro", value: "Otro" },
];

const QUICK_POSTPONE_OPTIONS = [
  { label: "Mañana", days: 1 },
  { label: "Lunes próximo", days: 7 - new Date().getDay() + 1, adjust: true },
  { label: "En 3 días", days: 3 },
];

function getNextMonday(): Date {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(12, 0, 0, 0);
  return monday;
}

export function TaskDetail({
  task,
  isOpen,
  onClose,
  onStatusChange,
  onAddComment,
  onReschedule,
  onDelegate,
  onPostpone,
  onUploadFiles,
  onDeleteFile,
  isLoading = false,
  token,
}: TaskDetailProps) {
  const [comment, setComment] = useState("");
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [showConfirmStatus, setShowConfirmStatus] = useState<TaskStatus | null>(null);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [delegateUserId, setDelegateUserId] = useState("");
  const [delegateReason, setDelegateReason] = useState("");
  const [delegating, setDelegating] = useState(false);
  const [showPostponeModal, setShowPostponeModal] = useState(false);
  const [postponeDate, setPostponeDate] = useState("");
  const [postponeReason, setPostponeReason] = useState("");
  const [postponeCustomReason, setPostponeCustomReason] = useState("");
  const [postponing, setPostponing] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [attachmentsCount, setAttachmentsCount] = useState(0);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (task) {
      setComment("");
      setShowReschedule(false);
      setShowConfirmStatus(null);
      setShowPostponeModal(false);
      setShowAttachments(false);
    }
  }, [task?.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [task?.commentsList?.length]);

  useEffect(() => {
    const fetchAttachments = async () => {
      if (!task || !token) return;
      try {
        const res = await fetch(`/api/tasks/${task.id}/attachments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setAttachments(json.data);
            setAttachmentsCount(json.data.length || 0);
          }
        }
      } catch { /* */ }
    };
    fetchAttachments();
  }, [task?.id, token]);

  if (!task) return null;

  const t = task;
  const isCompleted = t.status === "COMPLETADA";
  const isCancelled = t.status === "CANCELADA";

  const postponeCount = task.history?.filter((h) => h.action?.includes("Posponida")).length || 0;

  function handleAddComment() {
    if (!comment.trim()) return;
    onAddComment(t.id, comment.trim());
    setComment("");
  }

  function handleReschedule() {
    if (!rescheduleDate) return;
    const fullDate = rescheduleTime
      ? `${rescheduleDate}T${rescheduleTime}:00`
      : `${rescheduleDate}T23:59:00`;
    onReschedule(t.id, fullDate, rescheduleReason.trim());
    setShowReschedule(false);
    setRescheduleDate("");
    setRescheduleTime("");
    setRescheduleReason("");
  }

  function handleStatusChange(status: TaskStatus) {
    onStatusChange(t.id, status);
    setShowConfirmStatus(null);
  }

  async function handleDelegate() {
    if (!onDelegate || !delegateUserId) return;
    setDelegating(true);
    try {
      await onDelegate(t.id, delegateUserId, delegateReason.trim());
      setShowDelegateModal(false);
      setDelegateUserId("");
      setDelegateReason("");
    } finally {
      setDelegating(false);
    }
  }

  function handleQuickPostpone(days: number, adjust?: boolean) {
    let targetDate: Date;
    if (adjust) {
      targetDate = getNextMonday();
    } else {
      targetDate = addDays(new Date(), days);
    }
    setPostponeDate(format(targetDate, "yyyy-MM-dd"));
  }

  async function handlePostpone() {
    if (!postponeDate || !onPostpone) return;
    const reason = postponeReason === "Otro" ? postponeCustomReason.trim() : postponeReason;
    if (!reason.trim()) return;
    setPostponing(true);
    try {
      onPostpone(t.id, `${postponeDate}T12:00:00`, reason.trim());
      setShowPostponeModal(false);
      setPostponeDate("");
      setPostponeReason("");
      setPostponeCustomReason("");
    } finally {
      setPostponing(false);
    }
  }

  async function handleFileUpload(files: File[]): Promise<FileAttachment[]> {
    if (!onUploadFiles) return [];
    const result = await onUploadFiles(t.id, files);
    setAttachmentsCount((prev) => prev + files.length);
    return result;
  }

  async function handleFileDelete(fileId: string) {
    if (!onDeleteFile) return;
    await onDeleteFile(t.id, fileId);
    setAttachmentsCount((prev) => Math.max(0, prev - 1));
  }

  const whatsappPreview = `Hola ${task.assignedTo?.name || "usuario"}, tienes una tarea "${task.title}" ${task.dueDate ? `para el ${format(new Date(task.dueDate), "dd/MM/yyyy")}` : ""}. Prioridad: ${taskPriorityLabel(task.priority)}.`;

  const lastPostponeEntry = task.history
    ?.filter((h) => h.action?.includes("Posponida"))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Detalle de tarea" size="xl">
      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {task.title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge color={taskStatusColor(task.status)} size="md" dot>
                  {taskStatusLabel(task.status)}
                </Badge>
                <Badge color={taskPriorityColor(task.priority)} size="md">
                  {taskPriorityLabel(task.priority)}
                </Badge>
                <Badge color="purple" size="md">
                  {categoryLabels[task.category]}
                </Badge>
                {task.type === "FIJA" && (
                  <Badge color="teal" size="md">
                    {task.frequency
                      ? task.frequency.charAt(0) + task.frequency.slice(1).toLowerCase()
                      : "Fija"}
                  </Badge>
                )}
                {attachmentsCount > 0 && (
                  <Badge color="gray" size="md">
                    <Paperclip className="h-3 w-3 inline mr-0.5" />
                    {attachmentsCount}
                  </Badge>
                )}
                {postponeCount > 1 && (
                  <Badge color="red" size="md">
                    Posponida {postponeCount}x
                  </Badge>
                )}
              </div>
            </div>
            {task.assignedTo && (
              <div className="flex flex-col items-center gap-1">
                <Avatar name={task.assignedTo.name} src={task.assignedTo.avatar} size="lg" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{task.assignedTo.name}</span>
              </div>
            )}
          </div>

          {postponeCount > 0 && lastPostponeEntry && (
            <div className="flex items-center gap-2 text-sm bg-red-50 dark:bg-red-900/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span className="text-red-700 dark:text-red-300">
                Posponida {postponeCount} vez{postponeCount > 1 ? "ces" : ""}
                {lastPostponeEntry.action ? ` - Última razón: ${lastPostponeEntry.action.replace("Tarea posponida: ", "")}` : ""}
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-400">Fecha de entrega</div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">
                  {task.dueDate ? format(new Date(task.dueDate), "dd/MM/yyyy HH:mm") : "Sin fecha"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-400">Asignado por</div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">
                  {task.assignedBy?.name || "\u2014"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <div>
                <div className="text-xs text-gray-400">Creada</div>
                <div className="text-gray-700 dark:text-gray-300 font-medium">
                  {format(new Date(task.createdAt), "dd/MM/yyyy")}
                </div>
              </div>
            </div>
          </div>

          {task.description && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                Descripción
              </h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                {task.description}
              </p>
            </div>
          )}

          {task.event && (
            <div className="flex items-center gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
              <Link className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-gray-600 dark:text-gray-400">Evento:</span>
              <a
                href={`/events/${task.event.id}`}
                className="text-blue-600 dark:text-blue-400 font-medium hover:underline"
              >
                {task.event.name} - {task.event.clientName}
              </a>
            </div>
          )}

          {task.rescheduledTo && (
            <div className="flex items-center gap-2 text-sm bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
              <CalendarClock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span className="text-gray-600 dark:text-gray-400">Reprogramada para:</span>
              <span className="text-purple-700 dark:text-purple-300 font-medium">
                {format(new Date(task.rescheduledTo), "dd/MM/yyyy HH:mm")}
              </span>
            </div>
          )}

          {!isCompleted && !isCancelled && (
            <>
              <div>
                <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                  Cambiar estado
                </h4>
                <div className="flex flex-wrap gap-2">
                  {statusChangeOptions
                    .filter((opt) => opt.status !== task.status)
                    .map((opt) => (
                      <Button
                        key={opt.status}
                        variant="outline"
                        size="sm"
                        leftIcon={<opt.icon className={cn("h-4 w-4", opt.color)} />}
                        onClick={() => setShowConfirmStatus(opt.status)}
                        disabled={isLoading}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  {onDelegate && (
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<UserPlus className="h-4 w-4 text-indigo-600" />}
                      onClick={() => setShowDelegateModal(true)}
                      disabled={isLoading}
                    >
                      Pasar a otro usuario
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Clock4 className="h-4 w-4 text-orange-600" />}
                    onClick={() => setShowPostponeModal(true)}
                    disabled={isLoading}
                  >
                    Posponer
                  </Button>
                </div>
              </div>

              <div>
                <button
                  onClick={() => setShowReschedule(!showReschedule)}
                  className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <CalendarPlus className="h-4 w-4" />
                  {showReschedule ? "Cancelar reprogramación" : "Reprogramar tarea"}
                </button>

                {showReschedule && (
                  <div className="mt-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Nueva fecha
                        </label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Nueva hora
                        </label>
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Motivo de reprogramación
                      </label>
                      <input
                        type="text"
                        value={rescheduleReason}
                        onChange={(e) => setRescheduleReason(e.target.value)}
                        placeholder="Ej: Cliente solicitó cambio de fecha"
                        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={handleReschedule}
                        disabled={!rescheduleDate || isLoading}
                        leftIcon={<CalendarClock className="h-4 w-4" />}
                      >
                        Reprogramar
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <button
                  onClick={() => setShowAttachments(!showAttachments)}
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:underline"
                >
                  <Paperclip className="h-4 w-4" />
                  Adjuntos ({attachmentsCount})
                </button>

                {showAttachments && onUploadFiles && (
                  <div className="mt-3">
                    <FileUpload
                      onUpload={handleFileUpload}
                      existingFiles={attachments}
                      onDelete={onDeleteFile ? handleFileDelete : undefined}
                      maxFiles={10}
                      maxSizeMB={20}
                      disabled={isLoading}
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {task.assignedTo?.whatsappNumber && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Notificación WhatsApp
              </h4>
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-xs text-green-700 dark:text-green-300 font-medium">
                    Vista previa del mensaje
                  </span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-600">
                  {whatsappPreview}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Comentarios
            {task.commentsList && task.commentsList.length > 0 && (
              <Badge color="blue" size="sm">{task.commentsList.length}</Badge>
            )}
          </h4>

          <div className="space-y-3 max-h-60 overflow-y-auto mb-3">
            {!task.commentsList || task.commentsList.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                Sin comentarios aún
              </p>
            ) : (
              task.commentsList.map((c) => (
                <div key={c.id} className="flex gap-3">
                  <Avatar name={c.user?.name} src={c.user?.avatar} size="sm" className="mt-1" />
                  <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {c.user?.name || "Usuario"}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(c.createdAt), { locale: es, addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{c.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={commentsEndRef} />
          </div>

          {!isCompleted && !isCancelled && (
            <div className="flex gap-2">
              <input
                type="text"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddComment()}
                placeholder="Escribe un comentario..."
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button
                size="md"
                onClick={handleAddComment}
                disabled={!comment.trim() || isLoading}
                leftIcon={<Send className="h-4 w-4" />}
              >
                Enviar
              </Button>
            </div>
          )}
        </div>

        {task.history && task.history.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Historial de cambios
            </h4>
            <div className="space-y-3 relative before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-200 dark:before:bg-gray-700">
              {task.history.map((entry) => (
                <div key={entry.id} className="flex gap-3 relative">
                  <div className="w-[22px] h-[22px] rounded-full bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500 flex items-center justify-center flex-shrink-0 z-10">
                    <ArrowRight className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 pb-3">
                    <div className="text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{entry.action}</span>
                      {entry.previousStatus && entry.newStatus && (
                        <span className="ml-2 inline-flex items-center gap-1">
                          <Badge color={taskStatusColor(entry.previousStatus)} size="sm">
                            {taskStatusLabel(entry.previousStatus)}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-gray-400" />
                          <Badge color={taskStatusColor(entry.newStatus)} size="sm">
                            {taskStatusLabel(entry.newStatus)}
                          </Badge>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {entry.user && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          por {entry.user.name}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm")}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!showConfirmStatus}
        onClose={() => setShowConfirmStatus(null)}
        onConfirm={() => showConfirmStatus && handleStatusChange(showConfirmStatus)}
        title="Cambiar estado"
        message={`¿Estás seguro de cambiar el estado de esta tarea a "${showConfirmStatus ? taskStatusLabel(showConfirmStatus) : ""}"?`}
        confirmLabel="Confirmar cambio"
        variant={showConfirmStatus === "CANCELADA" ? "danger" : "info"}
        loading={isLoading}
      />

      {onDelegate && (
        <Modal isOpen={showDelegateModal} onClose={() => setShowDelegateModal(false)} title="Pasar tarea a otro usuario" size="md">
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selecciona el usuario al que deseas transferir la tarea <strong>{task.title}</strong>.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nuevo responsable
              </label>
              <select
                value={delegateUserId}
                onChange={(e) => setDelegateUserId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">Seleccionar usuario</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Motivo (opcional)
              </label>
              <input
                type="text"
                value={delegateReason}
                onChange={(e) => setDelegateReason(e.target.value)}
                placeholder="Ej: Reasignación de carga de trabajo"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setShowDelegateModal(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={handleDelegate}
                isLoading={delegating}
                disabled={!delegateUserId}
              >
                Transferir tarea
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <Modal isOpen={showPostponeModal} onClose={() => setShowPostponeModal(false)} title="Posponer tarea" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Estás posponiendo la tarea <strong>{task.title}</strong>.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Posponer rápido
            </label>
            <div className="flex flex-wrap gap-2">
              {QUICK_POSTPONE_OPTIONS.map((opt) => (
                <Button
                  key={opt.label}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickPostpone(opt.days, opt.adjust)}
                  className={postponeDate === format(opt.adjust ? getNextMonday() : addDays(new Date(), opt.days), "yyyy-MM-dd") ? "ring-2 ring-blue-500" : ""}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Nueva fecha
            </label>
            <input
              type="date"
              value={postponeDate}
              onChange={(e) => setPostponeDate(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Motivo (requerido)
            </label>
            <div className="flex flex-wrap gap-2">
              {POSTPONE_REASONS.map((r) => (
                <Button
                  key={r.value}
                  variant="outline"
                  size="sm"
                  onClick={() => setPostponeReason(r.value)}
                  className={postponeReason === r.value ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""}
                >
                  {r.label}
                </Button>
              ))}
            </div>
          </div>

          {postponeReason === "Otro" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Especifica el motivo
              </label>
              <textarea
                value={postponeCustomReason}
                onChange={(e) => setPostponeCustomReason(e.target.value)}
                placeholder="Describe el motivo..."
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={2}
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowPostponeModal(false)}>Cancelar</Button>
            <Button
              variant="warning"
              onClick={handlePostpone}
              isLoading={postponing}
              disabled={!postponeDate || (!postponeReason.trim()) || (postponeReason === "Otro" && !postponeCustomReason.trim())}
              leftIcon={<Clock4 className="h-4 w-4" />}
            >
              Posponer
            </Button>
          </div>
        </div>
      </Modal>
    </Modal>
  );
}
