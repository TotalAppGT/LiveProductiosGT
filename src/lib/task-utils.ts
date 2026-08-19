import { prisma } from "@/lib/prisma";

function guatemalaToday(): Date {
  // Guatemala es UTC-6. Obtener la medianoche (00:00) de hoy en hora UTC ajustada.
  const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
  // now ya está "corrido" -6h; su fecha (getFullYear/getMonth/getDate) es la de Guatemala.
  // Crear Date UTC a medianoche con esos componentes.
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
