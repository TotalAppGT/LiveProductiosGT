import { prisma } from "@/lib/prisma";

export async function carryOverUncompletedTasks() {
  // Mover a HOY todas las tareas vencidas no completadas (siguen corriendo hasta que se hagan)
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const overdue = await prisma.task.findMany({
    where: {
      dueDate: { lt: today },
      status: { in: ["PENDIENTE", "EN_PROCESO"] },
      // Solo dinámicas/variables y fijas sin regeneración pendiente
      OR: [{ type: "DINAMICA" }, { type: "FIJA" }],
    },
  });

  let carried = 0;
  for (const task of overdue) {
    // No mover si la tarea fija ya tiene su próxima ocurrencia futura (regenerada al completarse)
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
