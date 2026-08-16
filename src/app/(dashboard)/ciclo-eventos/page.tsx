"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, ClipboardList, CalendarClock, Flag, CheckCircle2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";

const PHASE_STYLES: Record<string, string> = {
  PRE_EVENTO: "bg-blue-100 text-blue-700",
  EVENTO: "bg-purple-100 text-purple-700",
  POST_EVENTO: "bg-green-100 text-green-700",
};

function taskPrio(p: string): string {
  return p === "URGENTE" || p === "ALTA" ? "🔴" : p === "MEDIA" ? "🟡" : "🟢";
}

export default function CicloEventosPage() {
  const { user, token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/event-cycle", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch {
      toast.error("Error al cargar ciclo de eventos");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const renderTasks = (tasks: any[]) =>
    tasks.length === 0 ? (
      <p className="text-xs text-gray-400">Sin tareas</p>
    ) : (
      tasks.map((t) => (
        <div key={t.id} className="flex items-center justify-between py-1 text-xs">
          <span className="flex items-center gap-1 flex-1">
            <span>{taskPrio(t.priority)}</span>
            <span className="truncate">{t.title}</span>
          </span>
          <span className="text-gray-400 shrink-0 ml-2">
            {t.assignedTo?.name || "—"}
            {t.dueDate ? ` · ${new Date(t.dueDate).toLocaleDateString("es-GT", { day: "numeric", month: "short" })}` : ""}
          </span>
        </div>
      ))
    );

  if (loading) return <div className="p-8 text-center text-gray-500 flex items-center justify-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Cargando...</div>;

  const events = data?.events || [];
  const phaseTasks = data?.phaseTasks || [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <CalendarClock className="w-6 h-6" /> Ciclo de Eventos
      </h1>
      <p className="text-sm text-gray-500 mb-6">Tareas que se corren según la fase del evento: Pre Evento → Evento → Post Evento.</p>

      {events.length === 0 && (
        <p className="text-center text-gray-400 py-8">No hay eventos próximos (7 días atrás a 3 semanas adelante).</p>
      )}

      <div className="space-y-5">
        {events.map((event: any) => {
          const phaseStyle = PHASE_STYLES[event.phase] || "bg-gray-100 text-gray-700";
          return (
            <Card key={event.id} className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-500" /> {event.name}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {event.clientName} · {new Date(event.date).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    {event.planner ? ` · Planner: ${event.planner}` : ""}
                    {event.responsible ? ` · Responsable: ${event.responsible}` : ""}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${phaseStyle}`}>
                  {event.phaseLabel}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border rounded-lg p-3 bg-blue-50/50">
                  <p className="text-sm font-bold text-blue-700 mb-2 flex items-center gap-1"><Flag className="w-4 h-4" /> Pre Evento ({event.pre.length})</p>
                  {renderTasks(event.pre)}
                </div>
                <div className="border rounded-lg p-3 bg-purple-50/50">
                  <p className="text-sm font-bold text-purple-700 mb-2 flex items-center gap-1"><CalendarClock className="w-4 h-4" /> Durante ({event.durante.length})</p>
                  {renderTasks(event.durante)}
                </div>
                <div className="border rounded-lg p-3 bg-green-50/50">
                  <p className="text-sm font-bold text-green-700 mb-2 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Post Evento ({event.post.length})</p>
                  {renderTasks(event.post)}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {phaseTasks.length > 0 && (
        <Card className="p-5 mt-6">
          <h3 className="font-bold flex items-center gap-2 mb-3"><ClipboardList className="w-5 h-5 text-gray-500" /> Tareas de fase sin evento asignado ({phaseTasks.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["PRE_EVENTO", "EVENTO", "POST_EVENTO"].map((cat) => {
              const tasks = phaseTasks.filter((t: any) => t.category === cat);
              return (
                <div key={cat} className="border rounded-lg p-3 bg-gray-50/50">
                  <p className="text-sm font-bold text-gray-600 mb-2">{cat === "PRE_EVENTO" ? "Pre Evento" : cat === "EVENTO" ? "Evento" : "Post Evento"} ({tasks.length})</p>
                  {renderTasks(tasks)}
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
