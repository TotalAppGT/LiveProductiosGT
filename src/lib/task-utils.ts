import { prisma } from "@/lib/prisma";

export async function carryOverUncompletedTasks() {
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0,0,0,0);
  const yesterdayEnd = new Date(yesterday); yesterdayEnd.setHours(23,59,59);

  const uncompleted = await prisma.task.findMany({
    where: {
      dueDate: { gte: yesterday, lte: yesterdayEnd },
      status: { in: ["PENDIENTE", "EN_PROCESO"] },
    },
  });

  const today = new Date(); today.setHours(0,0,0,0);

  for (const task of uncompleted) {
    await prisma.task.update({
      where: { id: task.id },
      data: {
        dueDate: today,
        postponeReason: "No completada ayer - reprogramada automáticamente",
        postponeCount: { increment: 1 },
      },
    });
  }

  return uncompleted.length;
}
