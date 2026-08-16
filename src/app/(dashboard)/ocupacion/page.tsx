"use client";

import { useState, useEffect, useCallback } from "react";
import { Users, Calendar, Clock, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";

// Tiempo estimado por prioridad (minutos)
const PRIORITY_TIME: Record<string, number> = { URGENTE: 120, ALTA: 90, MEDIA: 45, BAJA: 20 };

export default function OcupacionPage() {
  const { user, token } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [period, setPeriod] = useState<"HOY" | "SEMANA" | "MES">("HOY");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [uRes, tRes] = await Promise.all([
        fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/tasks?limit=500", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const uJson = await uRes.json();
      const tJson = await tRes.json();
      if (Array.isArray(uJson)) setUsers(uJson);
      if (tJson.success) setTasks(tJson.data);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Calcular rango de fechas según período
  function getRange(): { from: Date; to: Date } {
    const now = new Date();
    if (period === "HOY") {
      const s = new Date(now); s.setHours(0, 0, 0, 0);
      const e = new Date(now); e.setHours(23, 59, 59, 999);
      return { from: s, to: e };
    }
    if (period === "SEMANA") {
      const day = now.getDay();
      const monday = new Date(now); monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1)); monday.setHours(0, 0, 0, 0);
      const saturday = new Date(monday); saturday.setDate(monday.getDate() + 5); saturday.setHours(23, 59, 59, 999);
      return { from: monday, to: saturday };
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0); last.setHours(23, 59, 59, 999);
    return { from: first, to: last };
  }

  const { from, to } = getRange();
  const activeTasks = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= from && d <= to && t.status !== "COMPLETADA";
  });

  // Ocupación por persona
  const byUser = users.map((u) => {
    const userTasks = activeTasks.filter((t) => t.assignedToId === u.id);
    const count = userTasks.length;
    const totalMinutes = userTasks.reduce((sum, t) => sum + (PRIORITY_TIME[t.priority] || 30), 0);
    return {
      ...u,
      count,
      totalMinutes,
      urgentes: userTasks.filter((t) => t.priority === "URGENTE" || t.priority === "ALTA").length,
      completadas: tasks.filter((t) => t.assignedToId === u.id && t.status === "COMPLETADA" && new Date(t.updatedAt) >= from && new Date(t.updatedAt) <= to).length,
    };
  });

  const sorted = [...byUser].sort((a, b) => b.totalMinutes - a.totalMinutes);
  const totalMinutesAll = sorted.reduce((s, u) => s + u.totalMinutes, 0);
  const maxMinutes = Math.max(...sorted.map((u) => u.totalMinutes), 1);

  const periodLabel = period === "HOY" ? "Hoy" : period === "SEMANA" ? "Esta Semana" : "Este Mes";

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="w-6 h-6" /> Ocupación Efectiva
        </h1>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {["HOY", "SEMANA", "MES"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p as any)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium ${period === p ? "bg-white shadow" : "text-gray-600"}`}
            >
              {p === "HOY" ? "Hoy" : p === "SEMANA" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-4">
          <p className="text-xs text-gray-500">Tareas activas ({periodLabel.toLowerCase()})</p>
          <p className="text-2xl font-bold text-blue-600">{activeTasks.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Tiempo estimado total</p>
          <p className="text-2xl font-bold text-indigo-600">{Math.round(totalMinutesAll / 60)} h {totalMinutesAll % 60} m</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Personas con carga</p>
          <p className="text-2xl font-bold text-green-600">{sorted.filter((u) => u.count > 0).length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Urgentes/Altas</p>
          <p className="text-2xl font-bold text-red-600">{sorted.reduce((s, u) => s + u.urgentes, 0)}</p>
        </Card>
      </div>

      <div className="space-y-3">
        {sorted.map((u) => (
          <Card key={u.id} className="p-4">
            <div className="flex items-center gap-3">
              <Avatar name={u.name} size="md" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{u.name}</p>
                  <span className="text-xs text-gray-400">{u.position || u.role}</span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {u.count} tareas</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {Math.round(u.totalMinutes / 60)}h {u.totalMinutes % 60}m</span>
                  <span className="flex items-center gap-1 text-red-500">🔴 {u.urgentes} urgentes</span>
                  <span className="flex items-center gap-1 text-green-600">✅ {u.completadas} completadas</span>
                </div>
              </div>
            </div>
            <div className="mt-2 h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${u.urgentes > 0 ? "bg-red-500" : "bg-blue-500"}`}
                style={{ width: `${(u.totalMinutes / maxMinutes) * 100}%` }}
              />
            </div>
            <p className="text-right text-xs text-gray-400 mt-1">
              {Math.round((u.totalMinutes / Math.max(totalMinutesAll, 1)) * 100)}% de la carga
            </p>
          </Card>
        ))}
        {sorted.length === 0 && <p className="text-center text-gray-400 py-8">No hay datos de ocupación.</p>}
      </div>
    </div>
  );
}
