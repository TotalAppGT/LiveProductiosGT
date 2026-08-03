import { prisma } from "@/lib/prisma";
import { sendTaskReminder, sendAlert, sendDailySummary } from "@/lib/whatsapp";
import { startOfDay, endOfDay, subDays, isBefore, isAfter, addDays } from "date-fns";
import { es } from "date-fns/locale";
import { format } from "date-fns";

export async function checkAndSendReminders(): Promise<{
  remindersSent: number;
  errors: number;
}> {
  let remindersSent = 0;
  let errors = 0;

  try {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    const tasksDueToday = await prisma.task.findMany({
      where: {
        dueDate: { gte: start, lte: end },
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
      },
      include: {
        assignedTo: true,
      },
    });

    for (const task of tasksDueToday) {
      if (!task.assignedTo) continue;

      try {
        const success = await sendTaskReminder(task.assignedTo, {
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          status: task.status,
        });

        if (success) {
          remindersSent++;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }
  } catch (error) {
    console.error("checkAndSendReminders error:", error);
    errors++;
  }

  return { remindersSent, errors };
}

export async function reprocessOverdueTasks(): Promise<{
  tasksReprocessed: number;
  alertsSent: number;
}> {
  let tasksReprocessed = 0;
  let alertsSent = 0;

  try {
    const today = new Date();
    const startToday = startOfDay(today);

    const overdueTasks = await prisma.task.findMany({
      where: {
        dueDate: { lt: startToday },
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
      },
      include: {
        assignedTo: true,
      },
    });

    for (const task of overdueTasks) {
      try {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: "REPROGRAMADA",
            rescheduledTo: addDays(today, 1),
          },
        });

        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            userId: task.assignedToId || task.assignedById || "",
            action: "Tarea vencida reprogramada automáticamente",
            previousStatus: task.status,
            newStatus: "REPROGRAMADA",
          },
        });

        tasksReprocessed++;

        if (task.assignedTo) {
          const alertMsg = `La tarea "${task.title}" ha vencido y fue reprogramada para ${format(addDays(today, 1), "PPP", { locale: es })}.`;
          const sent = await sendAlert([task.assignedTo], alertMsg);
          if (sent.length > 0) alertsSent++;
        }
      } catch {
        console.error(`Failed to reprocess task ${task.id}`);
      }
    }
  } catch (error) {
    console.error("reprocessOverdueTasks error:", error);
  }

  return { tasksReprocessed, alertsSent };
}

export async function sendDailyDigest(): Promise<{
  summariesSent: number;
  errors: number;
}> {
  let summariesSent = 0;
  let errors = 0;

  try {
    const today = new Date();
    const start = startOfDay(today);
    const end = endOfDay(today);

    const managersAndOwners = await prisma.user.findMany({
      where: {
        role: { in: ["DUENO", "ADMIN"] },
        active: true,
      },
    });

    for (const manager of managersAndOwners) {
      try {
        const tasksToday = await prisma.task.findMany({
          where: {
            dueDate: { gte: start, lte: end },
          },
          orderBy: { priority: "desc" },
        });

        const tasksFormatted = tasksToday.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          priority: t.priority,
          dueDate: t.dueDate,
          status: t.status,
        }));

        if (tasksFormatted.length > 0) {
          const success = await sendDailySummary(manager, tasksFormatted);
          if (success) summariesSent++;
          else errors++;
        }
      } catch {
        errors++;
      }
    }
  } catch (error) {
    console.error("sendDailyDigest error:", error);
    errors++;
  }

  return { summariesSent, errors };
}

export async function trackUserActivity(): Promise<{
  inactiveUsers: number;
  activeUsers: number;
}> {
  let inactiveUsers = 0;
  let activeUsers = 0;

  try {
    const threeDaysAgo = subDays(new Date(), 3);

    const recentActivities = await prisma.activity.findMany({
      where: {
        createdAt: { gte: threeDaysAgo },
      },
      select: { userId: true },
      distinct: ["userId"],
    });

    const activeUserIds = recentActivities.map((a) => a.userId);

    const allUsers = await prisma.user.findMany({
      where: { active: true },
    });

    const inactiveUserList = allUsers.filter(
      (u) => !activeUserIds.includes(u.id)
    );

    inactiveUsers = inactiveUserList.length;
    activeUsers = activeUserIds.length;

    if (inactiveUserList.length > 0) {
      await sendAlert(
        inactiveUserList.map((u) => ({
          id: u.id,
          name: u.name,
          phone: u.phone,
          whatsappNumber: u.whatsappNumber,
        })),
        "No has accedido al sistema en los últimos 3 días. Por favor revisa tus tareas pendientes."
      );
    }
  } catch (error) {
    console.error("trackUserActivity error:", error);
  }

  return { inactiveUsers, activeUsers };
}

export function getCronSchedule(): Record<string, string> {
  return {
    checkReminders: "0 7 * * *",
    reprocessOverdue: "30 6 * * *",
    dailyDigest: "0 8 * * *",
    trackActivity: "0 9 * * *",
  };
}
