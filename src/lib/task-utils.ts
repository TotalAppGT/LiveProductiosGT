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

// Ahora mismo en Guatemala como un Date cuyo valor absoluto
// corresponde a la hora de pared de Guatemala (UTC-6).
export function gtNow(): Date {
  const w = getGuatemalaWallClock();
  return new Date(Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second));
}

// Medianoche de HOY en Guatemala (instante absoluto).
export function gtStartOfToday(): Date {
  const w = getGuatemalaWallClock();
  return new Date(Date.UTC(w.year, w.month - 1, w.day));
}

// Fin del día de HOY en Guatemala (23:59:59.999).
export function gtEndOfToday(): Date {
  const w = getGuatemalaWallClock();
  return new Date(Date.UTC(w.year, w.month - 1, w.day, 23, 59, 59, 999));
}

// Dado un día (instante absoluto cualquiera de ese día en Guatemala),
// devuelve el instante absoluto de ese MISMO día de Guatemala a las horas/minutos dados.
export function applyGuatemalaTime(date: Date, hours: number, minutes: number): Date {
  const w = getGuatemalaWallClock(date);
  return new Date(Date.UTC(w.year, w.month - 1, w.day, hours, minutes, 0));
}

export function guatemalaToday(): Date {
  // Medianoche de hoy en Guatemala, representada como Date UTC (componentes = fecha de Guatemala).
  const w = getGuatemalaWallClock();
  return new Date(Date.UTC(w.year, w.month - 1, w.day));
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
