export function taskPhasePriority(t: { category?: string }): number {
  if (t.category === "PRE_EVENTO") return 0;
  if (t.category === "EVENTO") return 1;
  if (t.category === "POST_EVENTO") return 2;
  return 3;
}

export function orderTasksByDayHour(tasks: any[]): any[] {
  return [...tasks].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    if (da !== db) return da - db;
    const phaseDiff = taskPhasePriority(a) - taskPhasePriority(b);
    if (phaseDiff !== 0) return phaseDiff;
    const typeDiff = (a.type === "FIJA" ? 0 : 1) - (b.type === "FIJA" ? 0 : 1);
    if (typeDiff !== 0) return typeDiff;
    return 0;
  });
}

export function formatTaskLine(t: any, num: number): string {
  const prio = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🔴" : t.priority === "MEDIA" ? "🟡" : "🟢";
  const status = t.status === "COMPLETADA" ? "✅" : t.status === "REPROGRAMADA" ? "🟣 Pospuesta" : t.status === "EN_PROCESO" ? "🔄 En proceso" : "📌";
  const phaseTag = t.category === "PRE_EVENTO" ? "🎪" : t.category === "POST_EVENTO" ? "🏁" : "";
  const typeTag = t.type === "FIJA"
    ? ` 🔁${t.frequency === "SEMANAL" ? " Semanal" : t.frequency === "MENSUAL" ? " Mensual" : " Diaria"}`
    : "";
  let due = "";
  if (t.dueDate) {
    const d = new Date(t.dueDate);
    const datePart = d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "short", day: "numeric", month: "short" });
    const hours = d.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit", hour12: false });
    if (hours === "00:00") {
      due = ` ${datePart}`;
    } else {
      const timePart = d.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" });
      due = ` ${datePart} ${timePart}`;
    }
  }
  return `${num}. ${prio} ${phaseTag} *${t.title}* ${status}${typeTag}${due}`;
}

// Devuelve texto de tareas ordenadas cronológicamente por día y hora, agrupadas por día
export function groupTasksByDayText(tasks: any[], startNum: number = 1): string {
  const days = new Map<string, any[]>();
  tasks.forEach((t) => {
    if (!t.dueDate) return;
    const d = new Date(t.dueDate);
    const key = d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" });
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(t);
  });

  const sortedDays = Array.from(days.entries()).sort((a, b) => {
    const da = new Date(a[1][0].dueDate);
    const db = new Date(b[1][0].dueDate);
    return da.getTime() - db.getTime();
  });

  return sortedDays.map(([dayLabel, dayTasks]) => {
    const ordered = orderTasksByDayHour(dayTasks);
    const block = `📅 *${dayLabel}*\n${ordered.map((t, i) => formatTaskLine(t, startNum + i)).join("\n")}`;
    startNum += ordered.length;
    return block;
  }).join("\n\n");
}

// Devuelve la lista numerada completa (semana a semana) para notificaciones
export function formatTaskDigest(tasks: any[]): string {
  const ordered = orderTasksByDayHour(tasks);
  if (ordered.length === 0) return "";
  return groupTasksByDayText(ordered);
}

export function orderEventsChronologically<T extends { date: Date | string }>(events: T[]): T[] {
  return [...events].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Formato compacto de evento para notificaciones
export function formatEventLine(e: { name: string; clientName?: string | null; date: Date | string; location?: string | null }): string {
  return `🎪 *${e.name}* - Cliente: ${e.clientName || "—"} - ${new Date(e.date).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })} - ${e.location || "Sin ubicación"}`;
}
