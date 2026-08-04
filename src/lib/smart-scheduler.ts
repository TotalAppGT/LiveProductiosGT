import { prisma } from "@/lib/prisma";
import { sendMessage, sendAutomatedReminder } from "@/lib/whatsapp";
import { generateSmartAlert, detectAnomalies, summarizeCompany, weeklyPerformanceReport } from "@/lib/ai-brain";
import { startOfDay, endOfDay, subDays, addDays, differenceInHours } from "date-fns";

async function logActivity(
  action: string,
  resource: string,
  resourceId: string | null,
  details: string,
  userId: string = "system"
) {
  await prisma.activity.create({
    data: { userId, action, resource, resourceId, details },
  });
}

async function getAdmins() {
  return prisma.user.findMany({
    where: { role: { in: ["DUENO", "ADMIN", "JEFE"] }, active: true },
    select: { id: true, name: true, phone: true, whatsappNumber: true },
  });
}

export async function checkInactivity(): Promise<{
  inactiveUsers: number;
  alertsSent: number;
}> {
  try {
    const today = startOfDay(new Date());

    const activeUsers = await prisma.activity.findMany({
      where: { createdAt: { gte: today } },
      select: { userId: true },
      distinct: ["userId"],
    });

    const activeIds = activeUsers.map((a) => a.userId);
    const allUsers = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, phone: true, whatsappNumber: true },
    });

    const inactiveUsers = allUsers.filter((u) => !activeIds.includes(u.id));
    let alertsSent = 0;

    for (const user of inactiveUsers) {
      const alertMsg = await generateSmartAlert({
        title: "Inactividad detectada",
        alertType: "inactivity",
        assigneeName: user.name,
      });

      const to = user.whatsappNumber || user.phone;
      if (to) {
        await sendMessage(
          to,
          `👋 *¡Te extrañamos!*\n\n${alertMsg}`
        ).catch(() => {});
        alertsSent++;
      }

      await logActivity(
        "CHECK_INACTIVITY",
        "USER",
        user.id,
        `Alerta de inactividad enviada a ${user.name}`,
        "system"
      );
    }

    if (inactiveUsers.length > 0) {
      const admins = await getAdmins();
      for (const admin of admins) {
        const names = inactiveUsers.map((u) => u.name).join(", ");
        const to = admin.whatsappNumber || admin.phone;
        if (to) {
          await sendMessage(
            to,
            `⚠️ *Alerta de Inactividad*\n\nLos siguientes usuarios no han accedido hoy:\n${names}`
          ).catch(() => {});
        }
      }
    }

    return { inactiveUsers: inactiveUsers.length, alertsSent };
  } catch (error) {
    console.error("checkInactivity error:", error);
    return { inactiveUsers: 0, alertsSent: 0 };
  }
}

export async function checkOverdueTasks(): Promise<{
  overdueCount: number;
  escalatedCount: number;
}> {
  try {
    const now = new Date();
    const startToday = startOfDay(now);

    const overdueTasks = await prisma.task.findMany({
      where: {
        dueDate: { lt: startToday },
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
      },
    });

    let escalatedCount = 0;

    for (const task of overdueTasks) {
      const hoursOverdue = task.dueDate
        ? differenceInHours(now, task.dueDate)
        : 999;

      if (task.assignedTo) {
        let alertType: "overdue" | "escalation" = "overdue";
        let titlePrefix = "⏰";

        if (hoursOverdue >= 24) {
          alertType = "escalation";
          titlePrefix = "🚨";
        } else if (hoursOverdue >= 6) {
          titlePrefix = "⚠️";
        } else if (hoursOverdue >= 1) {
          titlePrefix = "🔔";
        }

        const alertMsg = await generateSmartAlert({
          title: task.title,
          priority: task.priority,
          assigneeName: task.assignedTo.name,
          dueDate: task.dueDate?.toISOString(),
          overdue: true,
          alertType,
        });

        const to = task.assignedTo.whatsappNumber || task.assignedTo.phone;
        if (to) {
          await sendMessage(
            to,
            `${titlePrefix} *Tarea Vencida*\n\n${alertMsg}\n\n_Vence hace ${hoursOverdue}h - Prioridad: ${task.priority}_`
          ).catch(() => {});
        }

        if (hoursOverdue >= 6) {
          const admins = await getAdmins();
          for (const admin of admins) {
            const adminTo = admin.whatsappNumber || admin.phone;
            if (adminTo) {
              await sendMessage(
                adminTo,
                `🚨 *Escalación de Tarea*\n\nTarea: ${task.title}\nAsignado a: ${task.assignedTo.name}\nVencida hace: ${hoursOverdue}h\n\nRequiere atención inmediata.`
              ).catch(() => {});
            }
          }
          escalatedCount++;
        }

        await logActivity(
          "CHECK_OVERDUE",
          "TASK",
          task.id,
          `Alerta de vencimiento (${hoursOverdue}h) enviada para tarea "${task.title}"`,
          "system"
        );
      }
    }

    return { overdueCount: overdueTasks.length, escalatedCount };
  } catch (error) {
    console.error("checkOverdueTasks error:", error);
    return { overdueCount: 0, escalatedCount: 0 };
  }
}

export async function generateDailyBriefing(): Promise<{
  briefingsSent: number;
}> {
  try {
    const today = startOfDay(new Date());
    const endToday = endOfDay(new Date());

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, phone: true, whatsappNumber: true },
    });

    let briefingsSent = 0;

    for (const user of users) {
      const [pendingTasks, upcomingEvents] = await Promise.all([
        prisma.task.findMany({
          where: {
            assignedToId: user.id,
            status: { in: ["PENDIENTE", "EN_PROCESO"] },
          },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: 10,
        }),
        prisma.event.findMany({
          where: {
            date: { gte: today, lte: endToday },
            OR: [
              { plannerId: user.id },
              { responsibleId: user.id },
            ],
          },
          select: { name: true, clientName: true, date: true },
        }),
      ]);

      if (pendingTasks.length === 0 && upcomingEvents.length === 0) continue;

      const taskLines = pendingTasks
        .map((t) => `• ${t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🟠" : "🔵"} ${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleDateString("es-GT")})` : ""}`)
        .join("\n");

      const eventLines = upcomingEvents
        .map((e) => `• 🎪 ${e.name} - ${e.clientName} - ${new Date(e.date).toLocaleDateString("es-GT")}`)
        .join("\n");

      let briefing = `☀️ *Briefing Diario - ${user.name}*\n\n`;

      if (pendingTasks.length > 0) {
        briefing += `📋 *Tareas Pendientes (${pendingTasks.length})*\n${taskLines}\n\n`;
      }

      if (upcomingEvents.length > 0) {
        briefing += `🎪 *Eventos de Hoy (${upcomingEvents.length})*\n${eventLines}\n\n`;
      }

      briefing += "💪 ¡A darle con todo!";

      const to = user.whatsappNumber || user.phone;
      if (to) {
        await sendMessage(to, briefing).catch(() => {});
        briefingsSent++;
      }

      await logActivity(
        "DAILY_BRIEFING",
        "USER",
        user.id,
        `Briefing diario enviado a ${user.name} (${pendingTasks.length} tareas, ${upcomingEvents.length} eventos)`,
        "system"
      );
    }

    return { briefingsSent };
  } catch (error) {
    console.error("generateDailyBriefing error:", error);
    return { briefingsSent: 0 };
  }
}

export async function detectFallingBehind(): Promise<{
  usersAtRisk: { userId: string; name: string; completionRate: number }[];
  alertsSent: number;
}> {
  try {
    const threeDaysAgo = subDays(new Date(), 3);

    const users = await prisma.user.findMany({
      where: { active: true, role: { not: "DUENO" } },
      select: { id: true, name: true, phone: true, whatsappNumber: true },
    });

    const usersAtRisk: { userId: string; name: string; completionRate: number }[] = [];
    let alertsSent = 0;

    for (const user of users) {
      const [assignedCount, completedCount] = await Promise.all([
        prisma.task.count({
          where: {
            assignedToId: user.id,
            createdAt: { gte: threeDaysAgo },
          },
        }),
        prisma.task.count({
          where: {
            assignedToId: user.id,
            status: "COMPLETADA",
            updatedAt: { gte: threeDaysAgo },
          },
        }),
      ]);

      if (assignedCount >= 3) {
        const completionRate = Math.round((completedCount / assignedCount) * 100);
        if (completionRate < 50) {
          usersAtRisk.push({ userId: user.id, name: user.name, completionRate });

          const alertMsg = await generateSmartAlert({
            title: "Rendimiento bajo detectado",
            alertType: "inactivity",
            assigneeName: user.name,
          });

          const to = user.whatsappNumber || user.phone;
          if (to) {
            await sendMessage(
              to,
              `📉 *Alerta de Rendimiento*\n\n${alertMsg}\n\nCompletaste solo ${completedCount} de ${assignedCount} tareas (${completionRate}%) en los últimos 3 días.`
            ).catch(() => {});
            alertsSent++;
          }

          await logActivity(
            "DETECT_FALLING_BEHIND",
            "USER",
            user.id,
            `Usuario ${user.name} con tasa de completación del ${completionRate}% en últimos 3 días`,
            "system"
          );
        }
      }
    }

    if (usersAtRisk.length > 0) {
      const admins = await getAdmins();
      for (const admin of admins) {
        const riskList = usersAtRisk
          .map((u) => `• ${u.name}: ${u.completionRate}%`)
          .join("\n");
        const to = admin.whatsappNumber || admin.phone;
        if (to) {
          await sendMessage(
            to,
            `⚠️ *Usuarios con Bajo Rendimiento*\n\n${riskList}`
          ).catch(() => {});
        }
      }
    }

    return { usersAtRisk, alertsSent };
  } catch (error) {
    console.error("detectFallingBehind error:", error);
    return { usersAtRisk: [], alertsSent: 0 };
  }
}

export async function weeklyComplianceReport(): Promise<{
  report: string;
  alertsSent: number;
}> {
  try {
    const report = await weeklyPerformanceReport();

    const admins = await getAdmins();
    let alertsSent = 0;

    for (const admin of admins) {
      const to = admin.whatsappNumber || admin.phone;
      if (to) {
        await sendMessage(
          to,
          `📊 *Reporte Semanal de Cumplimiento*\n\n${report}`
        ).catch(() => {});
        alertsSent++;
      }
    }

    await logActivity(
      "WEEKLY_COMPLIANCE",
      "SYSTEM",
      null,
      "Reporte semanal de cumplimiento generado",
      "system"
    );

    return { report, alertsSent };
  } catch (error) {
    console.error("weeklyComplianceReport error:", error);
    return { report: "Error al generar reporte", alertsSent: 0 };
  }
}

export async function triggerEventReminders(): Promise<{
  remindersSent: number;
  eventsProcessed: number;
}> {
  try {
    const today = startOfDay(new Date());
    const tomorrow = startOfDay(addDays(new Date(), 1));
    const weekFromNow = startOfDay(addDays(new Date(), 7));

    const upcomingEvents = await prisma.event.findMany({
      where: {
        date: { gte: today, lte: weekFromNow },
        status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
      },
      include: {
        planner: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
        responsible: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
        tasks: {
          include: {
            assignedTo: {
              select: { id: true, name: true, phone: true, whatsappNumber: true },
            },
          },
        },
      },
    });

    let remindersSent = 0;

    for (const event of upcomingEvents) {
      const daysUntil = Math.ceil(
        (event.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      const isTomorrow = daysUntil <= 1;

      const staffToNotify = new Set<string>();
      const staff: { id: string; name: string; phone: string | null; whatsappNumber: string | null; role: string }[] = [];

      if (event.planner) {
        const key = event.planner.id;
        if (!staffToNotify.has(key)) {
          staffToNotify.add(key);
          staff.push({ ...event.planner, role: "Planificador" });
        }
      }

      if (event.responsible) {
        const key = event.responsible.id;
        if (!staffToNotify.has(key)) {
          staffToNotify.add(key);
          staff.push({ ...event.responsible, role: "Responsable" });
        }
      }

      for (const task of event.tasks) {
        if (task.assignedTo) {
          const key = task.assignedTo.id;
          if (!staffToNotify.has(key)) {
            staffToNotify.add(key);
            staff.push({ ...task.assignedTo, role: `Tarea: ${task.title}` });
          }
        }
      }

      for (const member of staff) {
        const alertMsg = await generateSmartAlert({
          title: event.name,
          alertType: isTomorrow ? "escalation" : "reminder",
          assigneeName: member.name,
          dueDate: event.date.toISOString(),
        });

        const emoji = isTomorrow ? "🔴" : "📅";
        const to = member.whatsappNumber || member.phone;
        if (to) {
          await sendMessage(
            to,
            `${emoji} *Recordatorio de Evento*\n\nEvento: ${event.name}\nCliente: ${event.clientName}\nFecha: ${event.date.toLocaleDateString("es-GT")} (${daysUntil === 0 ? "HOY" : `${daysUntil} días`})\nTu rol: ${member.role}\n\n${alertMsg}`
          ).catch(() => {});
          remindersSent++;
        }
      }

      await logActivity(
        "EVENT_REMINDER",
        "EVENT",
        event.id,
        `Recordatorio enviado para evento "${event.name}" (${staff.length} personas notificadas)`,
        "system"
      );
    }

    return { remindersSent, eventsProcessed: upcomingEvents.length };
  } catch (error) {
    console.error("triggerEventReminders error:", error);
    return { remindersSent: 0, eventsProcessed: 0 };
  }
}

export async function runAllChecks(): Promise<Record<string, any>> {
  const results: Record<string, any> = {};

  try {
    results.inactivity = await checkInactivity();
    results.overdue = await checkOverdueTasks();
    results.fallingBehind = await detectFallingBehind();
    results.anomalies = await detectAnomalies();

    await logActivity(
      "RUN_ALL_CHECKS",
      "SYSTEM",
      null,
      `Chequeos automáticos ejecutados: ${JSON.stringify(results)}`,
      "system"
    );
  } catch (error) {
    console.error("runAllChecks error:", error);
  }

  return results;
}

export async function sendMorningBriefing(): Promise<{
  briefingsSent: number;
}> {
  try {
    const today = startOfDay(new Date());
    const endToday = endOfDay(new Date());

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, phone: true, whatsappNumber: true },
    });

    let briefingsSent = 0;

    for (const user of users) {
      const to = user.whatsappNumber || user.phone;
      if (!to) continue;

      const [pendingTasks, upcomingEvents] = await Promise.all([
        prisma.task.findMany({
          where: {
            assignedToId: user.id,
            status: { in: ["PENDIENTE", "EN_PROCESO"] },
          },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: 10,
          select: { title: true, status: true, priority: true, dueDate: true },
        }),
        prisma.event.findMany({
          where: {
            date: { gte: today, lte: endToday },
            OR: [{ plannerId: user.id }, { responsibleId: user.id }],
          },
          select: { name: true, clientName: true, date: true },
          take: 5,
        }),
      ]);

      const thirtyDaysAgo = subDays(new Date(), 30);
      const completedCount = await prisma.task.count({
        where: { assignedToId: user.id, status: "COMPLETADA", updatedAt: { gte: thirtyDaysAgo } },
      });
      const assignedCount = await prisma.task.count({
        where: { assignedToId: user.id, createdAt: { gte: thirtyDaysAgo } },
      });
      const complianceRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 100;

      const sent = await sendAutomatedReminder(user, {
        trigger: "morning_briefing",
        pendingTasks,
        upcomingEvents,
        complianceRate,
      });

      if (sent) briefingsSent++;

      await logActivity(
        "MORNING_BRIEFING",
        "USER",
        user.id,
        `Briefing matutino enviado a ${user.name} (${pendingTasks.length} tareas, ${upcomingEvents.length} eventos)`,
        "system"
      );
    }

    return { briefingsSent };
  } catch (error) {
    console.error("sendMorningBriefing error:", error);
    return { briefingsSent: 0 };
  }
}

export async function sendEveningRecap(): Promise<{
  recapsSent: number;
}> {
  try {
    const today = startOfDay(new Date());
    const endToday = endOfDay(new Date());

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, phone: true, whatsappNumber: true },
    });

    let recapsSent = 0;

    for (const user of users) {
      const to = user.whatsappNumber || user.phone;
      if (!to) continue;

      const [completedToday, pendingTasks] = await Promise.all([
        prisma.task.count({
          where: {
            assignedToId: user.id,
            status: "COMPLETADA",
            updatedAt: { gte: today, lte: endToday },
          },
        }),
        prisma.task.findMany({
          where: {
            assignedToId: user.id,
            status: { in: ["PENDIENTE", "EN_PROCESO"] },
          },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: 10,
          select: { title: true, status: true, priority: true, dueDate: true },
        }),
      ]);

      if (completedToday === 0 && pendingTasks.length === 0) continue;

      const sent = await sendAutomatedReminder(user, {
        trigger: "evening_recap",
        completedToday,
        pendingTasks,
      });

      if (sent) recapsSent++;

      await logActivity(
        "EVENING_RECAP",
        "USER",
        user.id,
        `Recap vespertino enviado a ${user.name} (${completedToday} completadas, ${pendingTasks.length} pendientes)`,
        "system"
      );
    }

    return { recapsSent };
  } catch (error) {
    console.error("sendEveningRecap error:", error);
    return { recapsSent: 0 };
  }
}

export function getSmartCronSchedule(): Record<string, string> {
  return {
    checkInactivity: "0 8 * * *",
    checkOverdueTasks: "0 */2 * * *",
    dailyBriefing: "0 6 * * *",
    morningBriefing: "0 7 * * *",
    eveningRecap: "0 18 * * *",
    detectFallingBehind: "0 10 * * *",
    weeklyCompliance: "0 8 * * 1",
    eventReminders: "0 7 * * *",
    runAllChecks: "0 12 * * *",
  };
}
