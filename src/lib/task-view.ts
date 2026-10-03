export function taskPhasePriority(t: { category?: string }): number {
  if (t.category === "PRE_EVENTO") return 0;
  if (t.category === "POST_EVENTO") return 1;
  return 2; // Actividades diarias (OTRO / resto)
}

export function orderTasksByDayHour(tasks: any[]): any[] {
  const dayStart = (ts: string | Date | null): number => {
    if (!ts) return Number.MAX_SAFE_INTEGER;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const timeOf = (ts: string | Date | null): number => {
    if (!ts) return 0;
    const d = new Date(ts);
    return d.getHours() * 60 + d.getMinutes();
  };
  return [...tasks].sort((a, b) => {
    // 1) Día cronológico
    const dayDiff = dayStart(a.dueDate) - dayStart(b.dueDate);
    if (dayDiff !== 0) return dayDiff;
    // 2) Fase: Pre Evento → Evento → Post Evento
    const phaseDiff = taskPhasePriority(a) - taskPhasePriority(b);
    if (phaseDiff !== 0) return phaseDiff;
    // 3) Fija antes que Variable
    const typeDiff = (a.type === "FIJA" ? 0 : 1) - (b.type === "FIJA" ? 0 : 1);
    if (typeDiff !== 0) return typeDiff;
    // 4) Hora del día
    return timeOf(a.dueDate) - timeOf(b.dueDate);
  });
}

export function formatTaskLine(t: any, num: number): string {
  const prio = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🔴" : t.priority === "MEDIA" ? "🟡" : "🟢";
  const status = t.status === "COMPLETADA" ? "✅" : t.status === "REPROGRAMADA" ? "🟣 Pospuesta" : t.status === "EN_PROCESO" ? "🔄 En proceso" : "📌";
  const phaseTag = t.category === "PRE_EVENTO" ? "🎪" : t.category === "POST_EVENTO" ? "🏁" : "";
  const typeTag = t.type === "FIJA" ? " 🔁" : "";
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

// ============================================================
// ESTRUCTURA JERÁRQUICA COMPARTIDA (a nivel sistema):
//   BLOQUE de frecuencia (Diarias / Semanales / Mensuales)
//     └ MÓDULO (Pre Eventos → Eventos → Post Eventos → Administración → Otro)
//         └ "Fijas" primero, "Variables" después
//             └ (solo Pre Eventos · Fijas) Esta / Próxima / 3ra semana
// ============================================================

export const FREQ_BLOCK_ORDER = ["DIARIA", "SEMANAL", "MENSUAL"] as const;
export const FREQ_BLOCK_LABELS: Record<string, string> = {
  DIARIA: "📋 ACTIVIDADES DIARIAS",
  SEMANAL: "🗓️ ACTIVIDADES SEMANALES",
  MENSUAL: "📆 ACTIVIDADES MENSUALES",
};

export const MODULE_ORDER = ["PRE_EVENTO", "EVENTO", "POST_EVENTO", "ADMINISTRACION", "OTRO"] as const;
export const MODULE_LABELS: Record<string, string> = {
  PRE_EVENTO: "🎪 PRE EVENTOS",
  EVENTO: "🎬 EVENTOS",
  POST_EVENTO: "🏁 POST EVENTOS",
  ADMINISTRACION: "🗂️ ADMINISTRACIÓN",
  OTRO: "📌 OTRO",
};

const PRE_EVENTO_CATS = ["PRE_EVENTO", "PRE_EVENTO_ESTA_SEMANA", "PRE_EVENTO_PROXIMA_SEMANA", "PRE_EVENTO_3RA_SEMANA"];
export const isPreEventoCategory = (c?: string | null) => !!c && PRE_EVENTO_CATS.includes(c);

// A qué módulo pertenece una tarea según su categoría (siempre uno de los 5)
export function moduleOfTask(category?: string | null): string {
  if (isPreEventoCategory(category)) return "PRE_EVENTO";
  if (category === "EVENTO") return "EVENTO";
  if (category === "POST_EVENTO") return "POST_EVENTO";
  if (category === "ADMINISTRACION") return "ADMINISTRACION";
  return "OTRO";
}

// Bloque de frecuencia de una tarea.
// REGLA ESPECIAL: Pre Eventos (con sus sub-niveles Esta/Próxima/3ra semana)
// SIEMPRE vive en el bloque DIARIO, aunque su frecuencia sea semanal/mensual.
// Las variables sin frecuencia también caen en Diarias.
export function blockOfTask(t: any): string {
  if (moduleOfTask(t.category) === "PRE_EVENTO") return "DIARIA";
  if (t.frequency === "SEMANAL") return "SEMANAL";
  if (t.frequency === "MENSUAL") return "MENSUAL";
  return "DIARIA";
}

// Sub-nivel temporal EXCLUSIVO de Pre Eventos → Fijas
export const PRE_EVENTO_SUBLEVELS: { key: string; label: string; cats: string[] }[] = [
  { key: "ESTA", label: "● Esta semana", cats: ["PRE_EVENTO", "PRE_EVENTO_ESTA_SEMANA"] },
  { key: "PROXIMA", label: "○ Próxima semana", cats: ["PRE_EVENTO_PROXIMA_SEMANA"] },
  { key: "3RA", label: "○ 3ra semana", cats: ["PRE_EVENTO_3RA_SEMANA"] },
];

function hourOf(t: any): number {
  if (!t?.dueDate) return Number.MAX_SAFE_INTEGER;
  const d = new Date(t.dueDate);
  const h = d.getHours();
  const m = d.getMinutes();
  if (isNaN(h)) return Number.MAX_SAFE_INTEGER;
  return h * 60 + m;
}

// Respeta el orden manual (sortOrder) y luego la hora del día
function sortByManualThenHour(a: any, b: any): number {
  const hasManual = (a.sortOrder || 0) > 0 || (b.sortOrder || 0) > 0;
  if (hasManual && a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
  return hourOf(a) - hourOf(b);
}

// Ordena las tareas EXACTAMENTE como se muestran en el listado jerárquico.
// Es la fuente del número que usan los comandos "hecho 1", "posponer 2", etc.
export function orderTasksHierarchical(tasks: any[]): any[] {
  const out: any[] = [];
  for (const block of FREQ_BLOCK_ORDER) {
    const blockTasks = tasks.filter((t) => blockOfTask(t) === block);
    if (blockTasks.length === 0) continue;
    for (const mod of MODULE_ORDER) {
      const modTasks = blockTasks.filter((t) => moduleOfTask(t.category) === mod);
      if (modTasks.length === 0) continue;
      const fijas = modTasks.filter((t) => t.type === "FIJA").sort(sortByManualThenHour);
      const variables = modTasks.filter((t) => t.type !== "FIJA").sort(sortByManualThenHour);
      if (fijas.length > 0) {
        if (mod === "PRE_EVENTO") {
          for (const sub of PRE_EVENTO_SUBLEVELS) {
            out.push(...fijas.filter((t) => sub.cats.includes(String(t.category))));
          }
        } else {
          out.push(...fijas);
        }
      }
      out.push(...variables);
    }
  }
  return out;
}

// Render profesional en listado jerárquico. Devuelve también el orden para numerar.
export function formatTaskHierarchy(tasks: any[], startNum = 1): { text: string; ordered: any[]; next: number } {
  const ordered = orderTasksHierarchical(tasks);
  if (ordered.length === 0) return { text: "", ordered: [], next: startNum };

  let num = startNum;
  const lines: string[] = [];
  const emit = (arr: any[], indent: string) => {
    for (const t of arr) lines.push(`${indent}${formatTaskLine(t, num++)}`);
  };

  for (const block of FREQ_BLOCK_ORDER) {
    const blockTasks = tasks.filter((t) => blockOfTask(t) === block);
    if (blockTasks.length === 0) continue;
    lines.push(`*${FREQ_BLOCK_LABELS[block]}*`);
    for (const mod of MODULE_ORDER) {
      const modTasks = blockTasks.filter((t) => moduleOfTask(t.category) === mod);
      if (modTasks.length === 0) continue;
      lines.push(`*${MODULE_LABELS[mod]}*`);
      const fijas = modTasks.filter((t) => t.type === "FIJA").sort(sortByManualThenHour);
      const variables = modTasks.filter((t) => t.type !== "FIJA").sort(sortByManualThenHour);
      if (fijas.length > 0) {
        lines.push("  🔁 *Fijas*");
        if (mod === "PRE_EVENTO") {
          for (const sub of PRE_EVENTO_SUBLEVELS) {
            const subTasks = fijas.filter((t) => sub.cats.includes(String(t.category)));
            if (subTasks.length === 0) continue;
            lines.push(`    ${sub.label}`);
            emit(subTasks, "      ");
          }
        } else {
          emit(fijas, "    ");
        }
      }
      if (variables.length > 0) {
        lines.push("  ⚡ *Variables*");
        emit(variables, "    ");
      }
    }
    lines.push("");
  }

  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text, ordered, next: num };
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
  return `🎪 *${e.name}* - Cliente: ${e.clientName || "—"} - ${new Date(e.date).toLocaleDateString("es-GT", { timeZone: "America/Guatemala",  weekday: "long", day: "numeric", month: "long" })} - ${e.location || "Sin ubicación"}`;
}
