"use client";

import { useState, useRef } from "react";
import { GripVertical, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, taskStatusColor, taskStatusLabel, taskPriorityColor, taskPriorityLabel } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Task, TaskStatus } from "@/types";

interface TaskKanbanProps {
  tasks: Task[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onTaskClick: (task: Task) => void;
  isLoading?: boolean;
  className?: string;
}

interface Column {
  status: TaskStatus;
  title: string;
  color: string;
  bgColor: string;
}

const columns: Column[] = [
  {
    status: "PENDIENTE",
    title: "Pendiente",
    color: "border-yellow-400",
    bgColor: "bg-yellow-50/50 dark:bg-yellow-900/5",
  },
  {
    status: "EN_PROCESO",
    title: "En Proceso",
    color: "border-blue-400",
    bgColor: "bg-blue-50/50 dark:bg-blue-900/5",
  },
  {
    status: "COMPLETADA",
    title: "Completadas",
    color: "border-green-400",
    bgColor: "bg-green-50/50 dark:bg-green-900/5",
  },
];

function KanbanCard({
  task,
  isDragging,
  onClick,
  onDragStart,
}: {
  task: Task;
  isDragging: boolean;
  onClick: (task: Task) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("[data-no-drag]")) {
          onClick(task);
        }
      }}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-md transition-all group",
        isDragging && "opacity-50 rotate-2 scale-95 shadow-lg"
      )}
    >
      <div className="flex items-start gap-2">
        <div data-no-drag className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {task.title}
          </h4>
          {task.description && (
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
              {task.description}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge color={taskPriorityColor(task.priority)} size="sm">
              {taskPriorityLabel(task.priority)}
            </Badge>
            {task.category && (
              <Badge color="purple" size="sm">
                {task.category.replace(/_/g, " ").charAt(0) + task.category.replace(/_/g, " ").slice(1).toLowerCase()}
              </Badge>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between">
            {task.assignedTo && (
              <div className="flex items-center gap-1.5">
                <Avatar name={task.assignedTo.name} src={task.assignedTo.avatar} size="xs" />
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[100px]">
                  {task.assignedTo.name}
                </span>
              </div>
            )}
            {task.dueDate && (
              <span className="text-xs text-gray-400">
                {new Date(task.dueDate).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TaskKanban({
  tasks,
  onStatusChange,
  onTaskClick,
  isLoading = false,
  className,
}: TaskKanbanProps) {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  function handleDragStart(e: React.DragEvent, task: Task) {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
  }

  function handleDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(status);
  }

  function handleDragLeave() {
    setDragOverColumn(null);
  }

  function handleDrop(e: React.DragEvent, newStatus: TaskStatus) {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedTask && draggedTask.status !== newStatus) {
      onStatusChange(draggedTask.id, newStatus);
    }
    setDraggedTask(null);
  }

  function handleDragEnd() {
    setDraggedTask(null);
    setDragOverColumn(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" text="Cargando tablero..." />
      </div>
    );
  }

  const tasksByStatus = columns.reduce(
    (acc, col) => {
      acc[col.status] = tasks.filter((t) => t.status === col.status);
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  );

  const totalTasks = tasks.length;

  if (totalTasks === 0) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-16 w-16" />}
        title="No hay tareas"
        description="Crea una nueva tarea para comenzar a usar el tablero Kanban."
      />
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="flex gap-4 min-w-[768px]">
        {columns.map((col) => {
          const colTasks = tasksByStatus[col.status] || [];
          return (
            <div
              key={col.status}
              className={cn(
                "flex-1 min-w-[250px] rounded-xl border-t-4 bg-gray-50 dark:bg-gray-800/30 p-4 transition-colors",
                col.color,
                col.bgColor,
                dragOverColumn === col.status && "ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50/30 dark:bg-blue-900/10"
              )}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {col.title}
                </h3>
                <Badge color={taskStatusColor(col.status)} size="sm">
                  {colTasks.length}
                </Badge>
              </div>

              <div className="space-y-2 min-h-[200px]">
                {colTasks.length === 0 ? (
                  <div className="flex items-center justify-center h-32 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg">
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      Soltar tareas aquí
                    </p>
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      isDragging={draggedTask?.id === task.id}
                      onClick={onTaskClick}
                      onDragStart={handleDragStart}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
