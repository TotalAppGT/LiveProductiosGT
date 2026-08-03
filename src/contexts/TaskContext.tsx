"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import type {
  Task,
  TaskFilters,
  TaskStatus,
  CreateTaskDTO,
  UpdateTaskDTO,
  PaginatedResponse,
  ApiResponse,
} from "@/types";

const POLL_INTERVAL = 30000;

interface TaskContextValue {
  tasks: Task[];
  filteredTasks: Task[];
  loading: boolean;
  error: string | null;
  filters: TaskFilters;
  setFilters: (filters: TaskFilters) => void;
  clearFilters: () => void;
  createTask: (data: CreateTaskDTO) => Promise<Task>;
  updateTask: (id: string, data: UpdateTaskDTO) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  completeTask: (id: string) => Promise<Task>;
  cancelTask: (id: string, comments?: string) => Promise<Task>;
  rescheduleTask: (id: string, newDate: string) => Promise<Task>;
  assignTask: (id: string, userId: string) => Promise<Task>;
  startTask: (id: string) => Promise<Task>;
  refreshTasks: () => Promise<void>;
  isPolling: boolean;
  setPolling: (enabled: boolean) => void;
}

const TaskContext = createContext<TaskContextValue | undefined>(undefined);

function applyFilters(tasks: Task[], filters: TaskFilters): Task[] {
  return tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.category && task.category !== filters.category) return false;
    if (filters.type && task.type !== filters.type) return false;
    if (filters.assignedToId && task.assignedToId !== filters.assignedToId)
      return false;
    if (filters.assignedById && task.assignedById !== filters.assignedById)
      return false;
    if (filters.eventId && task.eventId !== filters.eventId) return false;
    if (filters.dueDateFrom && task.dueDate && task.dueDate < filters.dueDateFrom)
      return false;
    if (filters.dueDateTo && task.dueDate && task.dueDate > filters.dueDateTo)
      return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(q);
      const descMatch = task.description?.toLowerCase().includes(q) ?? false;
      if (!titleMatch && !descMatch) return false;
    }
    return true;
  });
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<TaskFilters>({});
  const [isPolling, setPolling] = useState(true);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/tasks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch tasks");
      const result: PaginatedResponse<Task> = await response.json();
      setTasks(result.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching tasks");
    }
  }, [token]);

  const refreshTasks = useCallback(async () => {
    setLoading(true);
    await fetchTasks();
    setLoading(false);
  }, [fetchTasks]);

  useEffect(() => {
    if (user) {
      refreshTasks();
    }
  }, [user, refreshTasks]);

  useEffect(() => {
    setFilteredTasks(applyFilters(tasks, filters));
  }, [tasks, filters]);

  useEffect(() => {
    if (!isPolling || !token) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      fetchTasks();
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isPolling, token, fetchTasks]);

  const createTask = useCallback(
    async (data: CreateTaskDTO): Promise<Task> => {
      if (!token) throw new Error("Not authenticated");
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create task");
      const result: ApiResponse<Task> = await response.json();
      if (!result.success || !result.data) throw new Error(result.error);
      setTasks((prev) => [result.data, ...prev]);
      return result.data;
    },
    [token]
  );

  const updateTask = useCallback(
    async (id: string, data: UpdateTaskDTO): Promise<Task> => {
      if (!token) throw new Error("Not authenticated");
      const response = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update task");
      const result: ApiResponse<Task> = await response.json();
      if (!result.success || !result.data) throw new Error(result.error);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? result.data : t))
      );
      return result.data;
    },
    [token]
  );

  const deleteTask = useCallback(
    async (id: string): Promise<void> => {
      if (!token) throw new Error("Not authenticated");
      const response = await fetch(`/api/tasks/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to delete task");
      setTasks((prev) => prev.filter((t) => t.id !== id));
    },
    [token]
  );

  const completeTask = useCallback(
    async (id: string): Promise<Task> => {
      return updateTask(id, { status: "COMPLETADA", confirmedAt: new Date().toISOString() });
    },
    [updateTask]
  );

  const cancelTask = useCallback(
    async (id: string, comments?: string): Promise<Task> => {
      return updateTask(id, { status: "CANCELADA", ...(comments ? { comments } : {}) });
    },
    [updateTask]
  );

  const rescheduleTask = useCallback(
    async (id: string, newDate: string): Promise<Task> => {
      return updateTask(id, {
        status: "REPROGRAMADA",
        dueDate: newDate,
        rescheduledTo: newDate,
      });
    },
    [updateTask]
  );

  const assignTask = useCallback(
    async (id: string, userId: string): Promise<Task> => {
      return updateTask(id, { assignedToId: userId });
    },
    [updateTask]
  );

  const startTask = useCallback(
    async (id: string): Promise<Task> => {
      return updateTask(id, { status: "EN_PROCESO" });
    },
    [updateTask]
  );

  const setFilters = useCallback((newFilters: TaskFilters) => {
    setFiltersState(newFilters);
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  return (
    <TaskContext.Provider
      value={{
        tasks,
        filteredTasks,
        loading,
        error,
        filters,
        setFilters,
        clearFilters,
        createTask,
        updateTask,
        deleteTask,
        completeTask,
        cancelTask,
        rescheduleTask,
        assignTask,
        startTask,
        refreshTasks,
        isPolling,
        setPolling,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}

export function useTasks(): TaskContextValue {
  const context = useContext(TaskContext);
  if (context === undefined) {
    throw new Error("useTasks must be used within a TaskProvider");
  }
  return context;
}
