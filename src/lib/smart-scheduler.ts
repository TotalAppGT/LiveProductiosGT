import { prisma } from "@/lib/prisma";
import { sendMessage, sendAutomatedReminder } from "@/lib/whatsapp";
import { generateSmartAlert, detectAnomalies, summarizeCompany, weeklyPerformanceReport } from "@/lib/ai-brain";
import { subDays, differenceInHours } from "date-fns";
import { getGuatemalaWallClock, gtStartOfToday, gtEndOfToday, isTaskDueOnDate } from "@/lib/task-utils";

async function logActivity(
  action: string,
  resource: string,
  resourceId: string | null,
  details: string,
  userId: string = "system"
) {
  try {
    // "system" no es un usuario real; se registra con un id de usuario válido o se omite.
    await prisma.activity.create({
      data: { userId, action, resource, resourceId, details },
    });
  } catch (error) {
    console.error(`[logActivity ${action}]`, error);
  }
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
    const today = gtStartOfToday();

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
    const startToday = gtStartOfToday();

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
    const today = gtStartOfToday();
    const endToday = gtEndOfToday();

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
    const today = gtStartOfToday();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

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

export async function checkDailyAccessRequirement(): Promise<{
  usersChecked: number;
  belowThreshold: number;
  alertsSent: number;
  inactiveToday: number;
}> {
  try {
    const today = gtStartOfToday();
    let minDaily = 4;

    try {
      const config = await prisma.systemConfig.findUnique({ where: { key: "access.min_daily" } });
      if (config) minDaily = parseInt(config.value, 10) || 4;
    } catch {}

    const allUsers = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, phone: true, whatsappNumber: true },
    });

    const activities = await prisma.activity.findMany({
      where: { createdAt: { gte: today } },
      select: { userId: true },
    });

    const usersWithAccess = new Set<string>();
    const accessCounts = new Map<string, number>();

    for (const a of activities) {
      usersWithAccess.add(a.userId);
      accessCounts.set(a.userId, (accessCounts.get(a.userId) || 0) + 1);
    }

    let alertsSent = 0;
    let belowThreshold = 0;
    let inactiveToday = 0;
    const inactiveList: string[] = [];
    const lowAccessList: string[] = [];
    const goodList: string[] = [];

    for (const user of allUsers) {
      const count = accessCounts.get(user.id) || 0;

      if (count === 0) {
        inactiveToday++;
        inactiveList.push(user.name);
        // Each inactive user gets their personal alert
        const to = user.whatsappNumber || user.phone;
        if (to) {
          await sendMessage(
            to,
            `⚠️ *Alerta de Inactividad*\n\nNo has ingresado al sistema hoy. Se requieren al menos ${minDaily} accesos diarios para seguimiento de tareas. Por favor ingresa al sistema.`
          ).catch(() => {});
          alertsSent++;
        }
        await logActivity(
          "DAILY_ACCESS_CHECK",
          "USER",
          user.id,
          `Usuario ${user.name} marcado como INACTIVO_HOY (0 accesos)`,
          "system"
        );
      } else if (count < minDaily) {
        belowThreshold++;
        lowAccessList.push(`${user.name} (${count}/${minDaily})`);
        const to = user.whatsappNumber || user.phone;
        if (to) {
          await sendMessage(
            to,
            `⚠️ *Accesos Insuficientes*\n\nSolo has ingresado ${count} veces hoy. Se requieren al menos ${minDaily} accesos diarios. Ingresa más seguido para mantener el control de tus tareas.`
          ).catch(() => {});
          alertsSent++;
        }
        await logActivity(
          "DAILY_ACCESS_CHECK",
          "USER",
          user.id,
          `Usuario ${user.name} con solo ${count}/${minDaily} accesos hoy`,
          "system"
        );
      } else {
        goodList.push(user.name);
      }
    }

    // También obtener tareas pendientes para el reporte
    const overdueTasksCount = await prisma.task.count({
      where: { status: { in: ["PENDIENTE", "EN_PROCESO"] }, dueDate: { lt: new Date() } },
    });
    const pendingTodayCount = await prisma.task.count({
      where: { status: { in: ["PENDIENTE", "EN_PROCESO"] }, dueDate: { gte: today, lte: new Date() } },
    });

    // Send ONE consolidated report to all admins/dueños
    const admins = await getAdmins();
    if (admins.length > 0 && (inactiveToday > 0 || belowThreshold > 0 || goodList.length > 0)) {
      const dateStr = new Date().toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
      let adminMsg = `📊 *Reporte Diario - ${dateStr}*\n\n`;
      adminMsg += `👥 *Total usuarios:* ${allUsers.length}\n`;
      if (overdueTasksCount > 0) adminMsg += `⏰ *Tareas vencidas:* ${overdueTasksCount}\n`;
      if (pendingTodayCount > 0) adminMsg += `📋 *Pendientes hoy:* ${pendingTodayCount}\n`;
      adminMsg += `\n`;
      if (inactiveList.length > 0) {
        adminMsg += `🚫 *Sin acceso hoy (${inactiveList.length}):*\n${inactiveList.map(n => `• ${n}`).join("\n")}\n\n`;
      }
      if (lowAccessList.length > 0) {
        adminMsg += `⚠️ *Accesos insuficientes (${lowAccessList.length}):*\n${lowAccessList.map(n => `• ${n}`).join("\n")}\n\n`;
      }
      if (goodList.length > 0) {
        adminMsg += `✅ *Al día (${goodList.length}):* ${goodList.join(", ")}\n\n`;
      }
      adminMsg += `🔔 Mínimo: ${minDaily} accesos/persona/día. Recuerda revisar tareas y dar seguimiento al equipo.`;
      for (const admin of admins) {
        const adminTo = admin.whatsappNumber || admin.phone;
        if (adminTo) {
          await sendMessage(adminTo, adminMsg).catch(() => {});
        }
      }
    }

    await logActivity(
      "DAILY_ACCESS_CHECK",
      "SYSTEM",
      null,
      `Chequeo de accesos diarios: ${allUsers.length} usuarios, ${inactiveToday} inactivos, ${belowThreshold} bajo umbral`,
      "system"
    );

    return {
      usersChecked: allUsers.length,
      belowThreshold,
      alertsSent,
      inactiveToday,
    };
  } catch (error) {
    console.error("checkDailyAccessRequirement error:", error);
    return { usersChecked: 0, belowThreshold: 0, alertsSent: 0, inactiveToday: 0 };
  }
}

export async function sendEndOfDayAlerts(): Promise<{
  usersWithPending: number;
  tasksRescheduled: number;
  alertsSent: number;
}> {
  try {
    const today = gtStartOfToday();
    const endToday = gtEndOfToday();

    const pendingTasks = await prisma.task.findMany({
      where: {
        dueDate: { gte: today, lte: endToday },
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
      },
    });

    const byUser = new Map<string, { user: NonNullable<typeof pendingTasks[0]["assignedTo"]>; tasks: typeof pendingTasks }>();

    for (const task of pendingTasks) {
      if (!task.assignedTo) continue;
      const key = task.assignedTo.id;
      if (!byUser.has(key)) {
        byUser.set(key, { user: task.assignedTo, tasks: [] });
      }
      byUser.get(key)!.tasks.push(task);
    }

    let alertsSent = 0;
    let tasksRescheduled = 0;

    const tomorrow = new Date(gtStartOfToday().getTime() + 24 * 60 * 60 * 1000);

    for (const [, entry] of byUser) {
      const to = entry.user.whatsappNumber || entry.user.phone;
      if (to) {
        await sendMessage(
          to,
          `🌙 *Cierre de Jornada*\n\nAún tienes ${entry.tasks.length} tareas pendientes para hoy. Asegúrate de completarlas o posponerlas con razón.`
        ).catch(() => {});
        alertsSent++;
      }

      for (const task of entry.tasks) {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: "REPROGRAMADA",
            dueDate: tomorrow,
            rescheduledTo: tomorrow,
            postponeReason: "No completada al final del día",
            postponeCount: { increment: 1 },
          },
        });

        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            userId: "system",
            action: "REPROGRAMACIÓN_AUTOMATICA",
            previousStatus: task.status,
            newStatus: "REPROGRAMADA",
          },
        });

        tasksRescheduled++;
      }

      await logActivity(
        "END_OF_DAY_ALERT",
        "TASK",
        null,
        `Alerta fin del día enviada a ${entry.user.name} (${entry.tasks.length} tareas reprogramadas)`,
        "system"
      );
    }

    return { usersWithPending: byUser.size, tasksRescheduled, alertsSent };
  } catch (error) {
    console.error("sendEndOfDayAlerts error:", error);
    return { usersWithPending: 0, tasksRescheduled: 0, alertsSent: 0 };
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
    const today = gtStartOfToday();
    const endToday = gtEndOfToday();

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

      const thirtyDaysAgo = new Date(gtStartOfToday().getTime() - 30 * 24 * 60 * 60 * 1000);
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

export async function sendBihourlyReminders(): Promise<{
  usersReminded: number;
  totalPendingTasks: number;
}> {
  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, phone: true, whatsappNumber: true },
    });

    let usersReminded = 0;
    let totalPendingTasks = 0;

    for (const user of users) {
      const to = user.whatsappNumber || user.phone;
      if (!to) continue;

      const lastReminder = await prisma.whatsAppMessage.findFirst({
        where: {
          userId: user.id,
          type: "BIHOURLY_REMINDER",
          createdAt: { gte: twoHoursAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (lastReminder) continue;

      const todayStart = gtStartOfToday();

      // Todas las pendientes del usuario (para contar y clasificar)
      const allPending = await prisma.task.findMany({
        where: {
          assignedToId: user.id,
          status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] },
        },
        orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
        take: 200,
      });

      if (allPending.length === 0) continue;

      // Las de HOY (por fecha o por día fijo de la semana) — mismo criterio que "tareas de hoy"
      const todayTasks = allPending.filter((t) => isTaskDueOnDate(t, todayStart));
      // Vencidas de otros días (no reprogramadas a hoy)
      const overdueTasks = allPending.filter(
        (t) => t.dueDate && new Date(t.dueDate) < todayStart && !isTaskDueOnDate(t, todayStart)
      );
      const overdueOtherDays = overdueTasks.length;
      const upcoming = allPending.length - todayTasks.length - overdueOtherDays;

      let digest = "";
      try {
        const { orderTasksByDayHour, formatTaskLine } = await import("@/lib/task-view");
        // Primero las VENCIDAS, luego las de hoy
        if (overdueTasks.length > 0) {
          const od = orderTasksByDayHour(overdueTasks);
          digest += `\n\n⚠️ *Vencidas (${od.length})*\n${od.slice(0, 8).map((t: any, i: number) => formatTaskLine(t, i + 1)).join("\n")}`;
        }
        const ordered = orderTasksByDayHour(todayTasks);
        if (ordered.length > 0) {
          const start = overdueTasks.length > 0 ? Math.min(8, overdueTasks.length) + 1 : 1;
          digest += `\n\n${ordered.slice(0, 15).map((t: any, i: number) => formatTaskLine(t, start + i)).join("\n")}`;
        }
      } catch {
        // silencioso
      }

      let message: string;
      if (todayTasks.length > 0 || overdueTasks.length > 0) {
        message = `🔔 *Tus tareas*\n\n`;
        if (overdueTasks.length > 0) {
          message += `⚠️ Tienes ${overdueTasks.length} vencida${overdueTasks.length > 1 ? "s" : ""} que atender primero. `;
        }
        message += `${todayTasks.length} tarea${todayTasks.length === 1 ? "" : "s"} para hoy.`;
        if (digest) message += digest;
      } else {
        message = `🔔 *Tus tareas*\n\nNo tienes tareas programadas para HOY, pero tienes ${allPending.length} pendiente${allPending.length > 1 ? "s" : ""} en total`;
        if (upcoming > 0) message += ` (${upcoming} próxima${upcoming > 1 ? "s" : ""})`;
        message += `.\n\n📅 Escribí *tareas* para ver toda la semana.`;
      }
      message += `\n\n⚡ Para avanzar: *hecho 1* (o *hecho 1 2 3* para varias), *proceso 1*, *posponer 1*, *transferir 1 a [nombre]*.\n📅 Escribí *tareas* para ver toda la semana, o *recordatorios* para los recordatorios del día.`;

      await sendMessage(to, message).catch(() => {});

      await prisma.whatsAppMessage.create({
        data: {
          userId: user.id,
          toNumber: to,
          message: `[BIHOURLY] ${message}`,
          type: "BIHOURLY_REMINDER",
          status: "SENT",
        },
      });

      await logActivity(
        "BIHOURLY_REMINDER",
        "USER",
        user.id,
        `Recordatorio bi-horario enviado a ${user.name} (${todayTasks.length} para hoy, ${allPending.length} pendientes en total)`,
        "system"
      );

      usersReminded++;
      totalPendingTasks += todayTasks.length;
    }

    return { usersReminded, totalPendingTasks };
  } catch (error) {
    console.error("sendBihourlyReminders error:", error);
    return { usersReminded: 0, totalPendingTasks: 0 };
  }
}

export async function sendEveningRecap(): Promise<{
  recapsSent: number;
}> {
  try {
    const today = gtStartOfToday();
    const endToday = gtEndOfToday();

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
    checkDailyAccess: "0 15 * * *",
    endOfDayAlerts: "0 17 * * *",
    eveningAccessCheck: "0 18 * * *",
  };
}

export async function fireDueReminders(): Promise<{ fired: number; advanced: number }> {
  let fired = 0;
  let advanced = 0;
  try {
    const now = new Date();
    // Los recordatorios solo avisan dentro del horario de notificación:
    // de 7:00 a.m. en adelante. Los de madrugada no suenan a esa hora;
    // se envían cuando el reloj llegue a las 7:00 a.m.
    const w = getGuatemalaWallClock(now);
    if (w.hour < 7) return { fired: 0, advanced: 0 };
    const tenMinFromNow = new Date(now.getTime() + 10 * 60000);

    // 1) Advance notice: remindAt within next 10 minutes, not yet notified
    const upcoming = await prisma.reminder.findMany({
      where: {
        remindAt: { gte: now, lte: tenMinFromNow },
        isCompleted: false,
        notified: false,
        advanceNotified: false,
      },
      include: { assignedTo: { select: { id: true, name: true, whatsappNumber: true, phone: true } } },
    });

    for (const reminder of upcoming) {
      try {
        const to = reminder.assignedTo?.whatsappNumber || reminder.assignedTo?.phone;
        if (to) {
          await sendMessage(
            to,
            `⏰ *Recordatorio en unos minutos*\n\n${reminder.title}${reminder.description ? `\n_${reminder.description}_` : ""}\n\n🕐 Inicia a las ${reminder.remindAt.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}. Preparate y te aviso puntual.`
          );
          advanced++;
        }
        await prisma.reminder.update({ where: { id: reminder.id }, data: { advanceNotified: true } });
      } catch (e) {
        console.error(`Error on advance reminder ${reminder.id}:`, e);
      }
    }

    // 2) At-time notification: reminder time reached
    const dueReminders = await prisma.reminder.findMany({
      where: {
        remindAt: { lte: now },
        isCompleted: false,
        notified: false,
      },
      include: { assignedTo: { select: { id: true, name: true, whatsappNumber: true, phone: true } } },
    });

    for (const reminder of dueReminders) {
      try {
        const to = reminder.assignedTo?.whatsappNumber || reminder.assignedTo?.phone;
        if (to) {
          await sendMessage(
            to,
            `⏰ *RECORDATORIO*\n\n${reminder.title}${reminder.description ? `\n_${reminder.description}_` : ""}\n\n📅 Programado para: ${reminder.remindAt.toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`
          );
          fired++;
        }

        await prisma.reminder.update({
          where: { id: reminder.id },
          data: { notified: true, isCompleted: true, completedAt: new Date() },
        });

        // Also complete the associated task (title starts with 🔔)
        await prisma.task.updateMany({
          where: {
            title: `🔔 ${reminder.title}`,
            assignedToId: reminder.assignedToId,
            status: "PENDIENTE",
          },
          data: { status: "COMPLETADA" },
        });
      } catch (e) {
        console.error(`Error firing reminder ${reminder.id}:`, e);
      }
    }
  } catch (error) {
    console.error("fireDueReminders error:", error);
  }
  return { fired, advanced };
}

export async function getComplianceRanking(): Promise<{
  rankings: Array<{
    name: string;
    role: string;
    completedTasks: number;
    totalTasks: number;
    compliancePercent: number;
    accessCount: number;
    score: number;
  }>;
  totalUsers: number;
}> {
  const w = getGuatemalaWallClock();
  const monthStart = new Date(Date.UTC(w.year, w.month - 1, 1));
  const today = new Date(Date.UTC(w.year, w.month - 1, w.day));

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true, whatsappNumber: true, phone: true },
  });

  const rankings = await Promise.all(users.map(async (user) => {
    const [completedTasks, totalTasks, accessedToday] = await Promise.all([
      prisma.task.count({ where: { assignedToId: user.id, status: "COMPLETADA", updatedAt: { gte: monthStart } } }),
      prisma.task.count({ where: { assignedToId: user.id, createdAt: { gte: monthStart }, status: { not: "COMPLETADA" } } }),
      prisma.activity.count({ where: { userId: user.id, createdAt: { gte: today } } }),
    ]);

    const compliancePercent = (completedTasks + totalTasks) > 0
      ? Math.round((completedTasks / (completedTasks + totalTasks)) * 100)
      : 0;
    const accessScore = Math.min(accessedToday / 4, 1) * 100;
    const score = Math.round((compliancePercent * 0.6) + (accessScore * 0.4));

    return {
      name: user.name,
      role: user.role,
      completedTasks,
      totalTasks: completedTasks + totalTasks,
      compliancePercent,
      accessCount: accessedToday,
      score,
    };
  }));

  rankings.sort((a, b) => b.score - a.score);

  return { rankings, totalUsers: users.length };
}

export async function fireScheduledAlerts(): Promise<{ sent: number }> {
  let sent = 0;
  try {
    const now = new Date();
    const w = getGuatemalaWallClock();
    const currentDayStr = w.weekday.toString();
    const currentTime = `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;

    const alerts = await prisma.$queryRaw<Array<{
      id: string; title: string; message: string; groupId: string | null;
      targetUserId: string | null; frequency: string | null; sendCount: number;
    }>>`SELECT id, title, message, "groupId", "targetUserId", frequency, "sendCount"
      FROM "ScheduledAlert"
      WHERE "isActive" = true
      AND (("scheduledAt" IS NOT NULL AND "scheduledAt" <= ${now} AND frequency IS NULL)
        OR ("dayOfWeek" = ${currentDayStr} AND "time" = ${currentTime} AND "scheduledAt" IS NOT NULL))`;

    for (const alert of alerts) {
      const phones = new Set<string>();

      if (alert.groupId) {
        const members = await prisma.$queryRaw<Array<{ whatsappNumber: string | null; phone: string | null }>>`
          SELECT u."whatsappNumber", u.phone FROM "GroupMember" gm
          JOIN "User" u ON u.id = gm."userId"
          WHERE gm."groupId" = ${alert.groupId}`;
        for (const m of members) {
          if (m.whatsappNumber || m.phone) phones.add(m.whatsappNumber || m.phone!);
        }
      }
      if (alert.targetUserId) {
        const target = await prisma.user.findUnique({
          where: { id: alert.targetUserId },
          select: { whatsappNumber: true, phone: true },
        });
        if (target) {
          const p = target.whatsappNumber || target.phone;
          if (p) phones.add(p);
        }
      }

      for (const phone of phones) {
        await sendMessage(phone, alert.message).catch(() => {});
        sent++;
      }

      const nextFire = alert.frequency === "DIARIA"
        ? new Date(now.getTime() + 86400000)
        : alert.frequency === "SEMANAL"
        ? new Date(now.getTime() + 604800000)
        : null;

      await prisma.scheduledAlert.update({
        where: { id: alert.id },
        data: { lastSentAt: now, sendCount: { increment: 1 }, scheduledAt: nextFire ?? undefined },
      });
    }
  } catch (error) {
    console.error("fireScheduledAlerts error:", error);
  }
  return { sent };
}

// Enviar mensajes programados a números externos (ej. dueño -> esposa, proveedores)
export async function fireScheduledMessages(): Promise<{ sent: number }> {
  let sent = 0;
  try {
    const now = new Date();
    const due = await prisma.scheduledMessage.findMany({
      where: {
        status: "PENDIENTE",
        scheduledAt: { lte: now },
      },
      take: 50,
    });

    for (const sm of due) {
      try {
        await sendMessage(sm.toNumber, sm.message);
        await prisma.scheduledMessage.update({
          where: { id: sm.id },
          data: { status: "ENVIADO" },
        });
        sent++;
      } catch (e) {
        console.error(`Error enviando scheduled message ${sm.id}:`, e);
        await prisma.scheduledMessage.update({
          where: { id: sm.id },
          data: { status: "CANCELADO" },
        });
      }
    }
  } catch (error) {
    console.error("fireScheduledMessages error:", error);
  }
  return { sent };
}

