import { prisma } from "@/lib/prisma";

// ─────────────────────────────────────────────
// Hora de Guatemala (UTC-6) — helpers ROBUSTOS
// Usan Intl con timeZone "America/Guatemala" para
// no depender de la zona horaria del servidor.
// ─────────────────────────────────────────────

export function getGuatemalaWallClock(d: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10) % 24,
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

// Ahora mismo (instante real). Para leer la hora de Guatemala usar getGuatemalaWallClock().
export function gtNow(): Date {
  return new Date();
}

// Medianoche de HOY en Guatemala (instante absoluto real = componentes de Guatemala + 6h UTC).
export function gtStartOfToday(): Date {
  const w = getGuatemalaWallClock();
  return new Date(Date.UTC(w.year, w.month - 1, w.day) + 6 * 60 * 60 * 1000);
}

// Fin del día de HOY en Guatemala (23:59:59.999) como instante absoluto real.
export function gtEndOfToday(): Date {
  const w = getGuatemalaWallClock();
  return new Date(Date.UTC(w.year, w.month - 1, w.day, 23, 59, 59, 999) + 6 * 60 * 60 * 1000);
}

// Dado un instante (o un día de Guatemala), devuelve el instante absoluto REAL
// de ese MISMO día de Guatemala a las horas/minutos dados (hora de pared + 6h UTC).
export function applyGuatemalaTime(date: Date, hours: number, minutes: number): Date {
  const w = getGuatemalaWallClock(date);
  return new Date(Date.UTC(w.year, w.month - 1, w.day, hours, minutes, 0) + 6 * 60 * 60 * 1000);
}

// Medianoche de un día específico de Guatemala (instante absoluto real).
export function guatemalaDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) + 6 * 60 * 60 * 1000);
}

export function guatemalaToday(): Date {
  return gtStartOfToday();
}

// Interpreta un valor de fecha/hora proveniente del cliente/admin:
//  - "YYYY-MM-DD" → medianoche de Guatemala
//  - "YYYY-MM-DDTHH:mm(:ss)" sin zona → hora LOCAL de Guatemala (UTC-6)
//  - Con zona (Z/+hh:mm) → instante absoluto directo
export function parseGTInputDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  const s = input.trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return guatemalaDate(y, m, d);
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}T\d{1,2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s + "-06:00");
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Próxima ocurrencia de una tarea FIJA, preservando la hora de Guatemala de la original
export function nextRecurrenceDueDate(base: Date, frequency: string | null): Date {
  const w = getGuatemalaWallClock(base);
  let day: Date;
  if (frequency === "SEMANAL") {
    day = guatemalaDate(w.year, w.month, w.day + 7);
  } else if (frequency === "MENSUAL") {
    const daysInNext = new Date(Date.UTC(w.year, w.month + 1, 0)).getUTCDate();
    day = guatemalaDate(w.year, w.month + 1, Math.min(w.day, daysInNext));
  } else {
    day = guatemalaDate(w.year, w.month, w.day + 1);
  }
  return applyGuatemalaTime(day, w.hour, w.minute);
}

const WEEKDAY_MAP: Record<string, number> = {
  DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6,
};

// ¿La tarea está programada para un día de Guatemala específico?
// Incluye: dueDate dentro de ese día + tareas FIJA (DIARIA todos los días,
// SEMANAL según su dayOfWeek).
export function isTaskDueOnDate(
  task: { dueDate: Date | string | null; type?: string | null; frequency?: string | null; dayOfWeek?: string | null },
  gtDate: Date
): boolean {
  const w = getGuatemalaWallClock(gtDate);
  const dayStart = guatemalaDate(w.year, w.month, w.day);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (task.dueDate) {
    const d = new Date(task.dueDate);
    if (!isNaN(d.getTime()) && d >= dayStart && d <= dayEnd) return true;
  }

  if (task.type === "FIJA") {
    if (task.frequency === "DIARIA") return true;
    if (task.frequency === "SEMANAL" && task.dayOfWeek) {
      const target = WEEKDAY_MAP[String(task.dayOfWeek).toUpperCase()];
      if (target !== undefined && target === w.weekday) return true;
    }
  }

  return false;
}

// Próxima fecha de una tarea FIJA al completarse:
// - SEMANAL con dayOfWeek → próximo día de la semana indicado (no depende de la fecha actual)
// - Si no, reusa la lógica genérica basada en la fecha original
export function nextFixedDueDate(
  task: { dueDate?: Date | string | null; type?: string | null; frequency?: string | null; dayOfWeek?: string | null }
): Date {
  if (task.type === "FIJA" && task.frequency === "SEMANAL" && task.dayOfWeek) {
    const base = task.dueDate ? new Date(task.dueDate) : new Date();
    const w = getGuatemalaWallClock(base);
    const target = WEEKDAY_MAP[String(task.dayOfWeek).toUpperCase()];
    let delta = target !== undefined ? (target - w.weekday + 7) % 7 : 7;
    if (delta === 0) delta = 7;
    const day = guatemalaDate(w.year, w.month, w.day + delta);
    return applyGuatemalaTime(day, w.hour, w.minute);
  }
  return nextRecurrenceDueDate(task.dueDate ? new Date(task.dueDate) : new Date(), task.frequency ?? null);
}

export async function carryOverUncompletedTasks() {
  // Mover a HOY todas las tareas vencidas no completadas (siguen corriendo hasta que se hagan)
  const today = guatemalaToday();

  const overdue = await prisma.task.findMany({
    where: {
      dueDate: { lt: today },
      status: { in: ["PENDIENTE", "EN_PROCESO"] },
      OR: [{ type: "DINAMICA" }, { type: "FIJA" }],
    },
  });

  let carried = 0;
  for (const task of overdue) {
    if (task.type === "FIJA") {
      const nextOccurrence = await prisma.task.findFirst({
        where: {
          title: task.title,
          type: "FIJA",
          dueDate: { gte: today },
          id: { not: task.id },
        },
      });
      if (nextOccurrence) continue;
    }

    await prisma.task.update({
      where: { id: task.id },
      data: {
        dueDate: today,
        postponeReason: "No completada - reprogramada automáticamente para hoy",
        postponeCount: { increment: 1 },
      },
    });
    carried++;
  }

  return carried;
}
