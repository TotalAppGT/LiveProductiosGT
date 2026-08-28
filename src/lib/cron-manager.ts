import { prisma } from "@/lib/prisma";
import { askAI, AI_ERROR_MESSAGE } from "@/lib/ai-brain";
import { sendMessage } from "@/lib/whatsapp";
import { checkDailyAccessRequirement, sendEndOfDayAlerts, sendBihourlyReminders, fireDueReminders, fireScheduledAlerts, fireScheduledMessages } from "@/lib/smart-scheduler";
import { carryOverUncompletedTasks, getGuatemalaWallClock, gtStartOfToday, gtEndOfToday, gtNow, isTaskDueOnDate } from "@/lib/task-utils";

interface CronJob {
  name: string;
  schedule: { hour: number; minute: number };
  timezone: string;
  handler: () => Promise<void>;
  // Los mensajes AUTOMÁTICOS (briefings, bihorarios, cierres, accesos) se
  // desactivan el DOMINGO. Los recordatorios explícitos del usuario siguen.
  skipOnSunday?: boolean;
  // Días de la semana (0=domingo ... 6=sábado) en los que NO corre este job.
  skipWeekdays?: number[];
}

interface JobState {
  lastRun: Date | null;
  isRunning: boolean;
  runCount: number;
  errorCount: number;
}

const jobStates: Map<string, JobState> = new Map();

function getJobState(name: string): JobState {
  if (!jobStates.has(name)) {
    jobStates.set(name, { lastRun: null, isRunning: false, runCount: 0, errorCount: 0 });
  }
  return jobStates.get(name)!;
}

function getGuatemalaTime(): Date {
  // Instante real actual. Para obtener la hora de Guatemala usar getGuatemalaWallClock().
  return new Date();
}

function aiSucceeded(msg: string): boolean {
  return !!msg && !msg.includes("no pude procesar tu solicitud");
}

async function logActivity(userId: string, action: string, details: string) {
  try {
    await prisma.activity.create({
      data: { userId, action, resource: "CRON", details },
    });
  } catch (error) {
    console.error(`[Cron] Error logging activity:`, error);
  }
}

async function getActiveUsersWithWhatsApp() {
  return prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { whatsappNumber: { not: null } },
        { phone: { not: null } },
      ],
    },
    select: { id: true, name: true, role: true, whatsappNumber: true, phone: true },
  });
}

async function getAdminUsers() {
  return prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["DUENO", "ADMIN", "JEFE"] },
      OR: [
        { whatsappNumber: { not: null } },
        { phone: { not: null } },
      ],
    },
    select: { id: true, name: true, role: true, whatsappNumber: true, phone: true },
  });
}

async function morningBriefing() {
  console.log("[Cron] Ejecutando morning briefing (7:00 AM)");

  // Primero migrar las tareas vencidas a HOY (para que el mensaje las muestre
  // como pendientes de hoy, no con fechas viejas).
  try {
    const carried = await carryOverUncompletedTasks();
    if (carried > 0) console.log(`[Cron] Tareas vencidas migradas a hoy: ${carried}`);
  } catch (err) {
    console.error("[Cron] Error migrando tareas vencidas:", err);
  }

  const users = await getActiveUsersWithWhatsApp();

  for (const user of users) {
    try {
      const wNow = getGuatemalaWallClock();
      const startOfToday = gtStartOfToday();
      const endOfToday = gtEndOfToday();

      const tasks = (await prisma.task.findMany({
        where: {
          assignedToId: user.id,
          status: { in: ["PENDIENTE", "EN_PROCESO"] },
        },
        orderBy: [{ dueDate: "asc" }],
        take: 100,
      })).filter((t) => !t.title.startsWith("🔔"));

      const events = await prisma.event.findMany({
        where: {
          date: { gte: new Date(Date.UTC(wNow.year, wNow.month - 1, wNow.day - 1)) },
          status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
          OR: [{ plannerId: user.id }, { responsibleId: user.id }],
        },
        orderBy: { date: "asc" },
        take: 5,
      });

      const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      const dayName = dayNames[wNow.weekday];

      const { orderTasksByDayHour, groupTasksByDayText } = await import("@/lib/task-view");

      // Mensaje diario = SOLO lo de HOY: primero pendientes/vencidas, luego tareas de hoy.
      // La semana y próximas semanas se ven con `tareas`.
      const todayTasks = tasks.filter((t) => isTaskDueOnDate(t, startOfToday));
      const stillOverdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < startOfToday && !isTaskDueOnDate(t, startOfToday));
      let taskLines = "";
      if (stillOverdue.length > 0) {
        taskLines += `⚠️ *Vencidas / Prioridad (${stillOverdue.length})*\n${groupTasksByDayText(orderTasksByDayHour(stillOverdue))}\n\n`;
      }
      if (todayTasks.length > 0) {
        const todayLabel = startOfToday.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "short" });
        taskLines += `📌 *HOY — ${todayLabel}*\n${groupTasksByDayText(orderTasksByDayHour(todayTasks))}\n\n`;
      }
      taskLines = taskLines.trim();

      const todayCount = todayTasks.length;

      const aiPrompt = `Eres LUNA de Live Productions GT. Genera un mensaje corto de buenos días para ${user.name} (${user.role}). Hoy es ${dayName}. Para HOY tiene ${todayCount} tareas${stillOverdue.length > 0 ? ` y ${stillOverdue.length} vencidas que atender primero` : ""}, ${events.length} eventos próximos. Sé cálida y motivadora, mencioná por dónde empezar (las vencidas o la más urgente). Máximo 2 oraciones. Español de Guatemala. NO te presentes (ya hay un encabezado).`;

      let aiMessage = "";
      try {
        aiMessage = await askAI(
          [{ role: "user", content: aiPrompt }],
          { temperature: 0.7, maxTokens: 250 }
        );
      } catch {
        aiMessage = "";
      }
      if (!aiSucceeded(aiMessage)) {
        aiMessage = `Hoy tienes ${todayCount} tareas${stillOverdue.length ? ` y ${stillOverdue.length} vencidas que debemos atender primero` : ""}. ¡A darle con todo! 💪`;
      }

      const eventLines = events
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((e) => `🎪 ${e.name} - ${new Date(e.date).toLocaleDateString("es-GT")}`)
        .join("\n");

      // ⏰ Recordatorios de HOY (se muestran en el mensaje del día; avisan a su hora)
      let remindersLines = "";
      try {
        const todayReminders = await prisma.reminder.findMany({
          where: {
            assignedToId: user.id,
            isCompleted: false,
            remindAt: { gte: startOfToday, lte: endOfToday },
          },
          orderBy: { remindAt: "asc" },
          take: 8,
        });
        if (todayReminders.length > 0) {
          remindersLines = `\n\n⏰ *Recordatorios de hoy (${todayReminders.length})*\n${todayReminders
            .map((r) => `• ${r.title} — ${new Date(r.remindAt).toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`)
            .join("\n")}`;
        }
      } catch {
        // silencioso
      }

      // 🛒 Compras de HOY
      let purchasesLines = "";
      try {
        const todayPurchases = await prisma.purchase.findMany({
          where: {
            assignedToId: user.id,
            status: "PENDIENTE",
            dueDate: { gte: startOfToday, lte: endOfToday },
          },
          orderBy: { dueDate: "asc" },
          take: 8,
        });
        if (todayPurchases.length > 0) {
          purchasesLines = `\n\n🛒 *Compras de hoy (${todayPurchases.length})*\n${todayPurchases
            .map((p) => `• ${p.title}${p.amount ? ` — Q${Number(p.amount).toFixed(2)}` : ""}`)
            .join("\n")}`;
        }
      } catch {
        // silencioso
      }

      let fullMessage = `👋 *¡Hola ${user.name}!*\nSoy *LUNA* 🌙 · Asistente de Live Productions\n📅 ${dayName}\n\n☀️ ${aiMessage}`;
      if (taskLines) fullMessage += `\n\n${taskLines}`;
      if (remindersLines) fullMessage += `\n\n${remindersLines}`;
      if (purchasesLines) fullMessage += `\n\n${purchasesLines}`;
      if (eventLines) fullMessage += `\n\n🎪 *Eventos (${events.length})*\n${eventLines}`;
      fullMessage += `\n\n_Escribí *menu* para ver las opciones con botones, o *tareas* para actuar._`;

      // WhatsApp limita a 4096 caracteres: si el mensaje es muy largo, se recorta.
      if (fullMessage.length > 3950) {
        fullMessage = fullMessage.slice(0, 3950) + "\n… (recortado — escribí *tareas* para ver todo)";
      }

      const to = user.whatsappNumber || user.phone;
      if (to) {
        await sendMessage(to, fullMessage);
        await logActivity(user.id, "CRON_MORNING_BRIEFING", `Briefing matutino enviado a ${user.name}`);
      }
    } catch (error) {
      console.error(`[Cron] Error morning briefing for ${user.name}:`, error);
    }
  }
}

async function dailyDigest() {
  console.log("[Cron] Ejecutando daily digest (8:00 AM)");
  const admins = await getAdminUsers();

  try {
    const now = getGuatemalaTime();
    const w = getGuatemalaWallClock();
    const startOfDay = gtStartOfToday();

    const [pendingTasks, overdueTasks, todayEvents, activeUsers, inactiveUsers] = await Promise.all([
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } } }),
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO"] }, dueDate: { lt: now } } }),
      prisma.event.findMany({
        where: {
          date: { gte: startOfDay, lte: new Date(Date.UTC(w.year, w.month - 1, w.day + 7, 23, 59, 59, 999) + 6 * 60 * 60 * 1000) },
          status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
        },
        orderBy: { date: "asc" },
        take: 15,
      }),
      prisma.user.count({ where: { active: true } }),
      prisma.user.findMany({
        where: { active: true, activities: { none: { createdAt: { gte: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } } } },
        select: { name: true },
      }),
    ]);

    const cobrosSum = await prisma.cobro.aggregate({
      where: { status: { in: ["PENDIENTE", "PARCIAL"] } },
      _sum: { amount: true },
    });

    const eventLines = todayEvents
      .map((e) => `• ${new Date(e.date).toLocaleDateString("es-GT")} - ${e.name} (${e.clientName})`)
      .join("\n");

    const aiPrompt = `Genera un resumen diario para el equipo directivo de Live Productions Guatemala. Sé ejecutivo y claro. Incluye: tareas pendientes, tareas vencidas, eventos próximos, usuarios inactivos, cobros pendientes. Máximo 1 párrafo por tema. Español de Guatemala.`;

    const contextText = `Tareas pendientes totales: ${pendingTasks}
Tareas vencidas: ${overdueTasks}
Usuarios activos: ${activeUsers}
Usuarios inactivos (>3 días): ${inactiveUsers.map(u => u.name).join(", ") || "Ninguno"}
Cobros pendientes: Q ${cobrosSum._sum.amount ? Number(cobrosSum._sum.amount).toLocaleString("es-GT", { minimumFractionDigits: 2 }) : "0.00"}
Próximos eventos:\n${eventLines || "Ninguno"}`;

    let aiDigest = "";
    try {
      aiDigest = await askAI(
        [{ role: "user", content: `${aiPrompt}\n\n${contextText}` }],
        { temperature: 0.5, maxTokens: 800 }
      );
    } catch {
      aiDigest = "";
    }
    if (!aiSucceeded(aiDigest)) {
      aiDigest = `Resumen del día: ${pendingTasks} tareas pendientes, ${overdueTasks} vencidas, ${activeUsers} usuarios activos.`;
    }

    for (const admin of admins) {
      try {
        const msg = `📊 *Resumen Diario - ${new Date().toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })}*\n\n${aiDigest}\n\n📋 *Tareas:* ${pendingTasks} pendientes | ⏰ ${overdueTasks} vencidas\n👥 *Equipo:* ${activeUsers} activos | 😴 ${inactiveUsers.length} inactivos\n💰 *Cobros pendientes:* Q ${cobrosSum._sum.amount ? Number(cobrosSum._sum.amount).toLocaleString("es-GT", { minimumFractionDigits: 2 }) : "0.00"}\n🎪 *Eventos próximos:* ${todayEvents.length}`;

        const to = admin.whatsappNumber || admin.phone;
        if (to) {
          await sendMessage(to, msg);
          await logActivity(admin.id, "CRON_DAILY_DIGEST", `Digest diario enviado a ${admin.name}`);
        }
      } catch (error) {
        console.error(`[Cron] Error daily digest for ${admin.name}:`, error);
      }
    }
  } catch (error) {
    console.error("[Cron] Error daily digest:", error);
  }
}

async function middayCheck() {
  console.log("[Cron] Ejecutando midday check (12:00 PM)");
  const admins = await getAdminUsers();

  try {
    const startOfDay = gtStartOfToday();

    const usersWithoutActivity = await prisma.user.findMany({
      where: {
        active: true,
        activities: { none: { createdAt: { gte: startOfDay } } },
      },
      select: { name: true, role: true },
    });

    const tasksCompletedToday = await prisma.task.count({
      where: { status: "COMPLETADA", updatedAt: { gte: startOfDay } },
    });

    if (usersWithoutActivity.length === 0 && tasksCompletedToday > 0) {
      console.log("[Cron] Midday check: todos activos, no se envía alerta");
      return;
    }

    const noActivityNames = usersWithoutActivity.map((u) => u.name).join(", ");
    const noActivityStr = usersWithoutActivity.length > 0
      ? `Los siguientes usuarios no han registrado actividad hoy: ${noActivityNames}`
      : "Todos los usuarios han registrado actividad hoy.";

    const aiPrompt = `Genera una alerta de mediodía para el equipo directivo de Live Productions. Usuarios sin actividad hoy: ${noActivityStr}. Tareas completadas hoy: ${tasksCompletedToday}. Sé directo pero constructivo. Máximo 2 oraciones. Español de Guatemala.`;

    let aiMessage = "";
    try {
      aiMessage = await askAI(
        [{ role: "user", content: aiPrompt }],
        { temperature: 0.5, maxTokens: 200 }
      );
    } catch {
      aiMessage = `Al mediodía, ${usersWithoutActivity.length} usuarios aún no registran actividad.`;
    }

    for (const admin of admins) {
      try {
        const msg = `🕛 *Chequeo de Mediodía*\n\n${aiMessage}\n\n👥 Sin actividad hoy: ${usersWithoutActivity.length > 0 ? noActivityNames : "Todos activos ✅"}\n✅ Completadas hoy: ${tasksCompletedToday}`;

        const to = admin.whatsappNumber || admin.phone;
        if (to) {
          await sendMessage(to, msg);
          await logActivity(admin.id, "CRON_MIDDAY_CHECK", `Chequeo de mediodía enviado a ${admin.name}`);
        }
      } catch (error) {
        console.error(`[Cron] Error midday check for ${admin.name}:`, error);
      }
    }
  } catch (error) {
    console.error("[Cron] Error midday check:", error);
  }
}

async function eveningRecap() {
  console.log("[Cron] Ejecutando evening recap (6:00 PM)");
  const admins = await getAdminUsers();

  try {
    const startOfDay = gtStartOfToday();

    const [completedToday, pendingCount, usersWithActivity] = await Promise.all([
      prisma.task.count({ where: { status: "COMPLETADA", updatedAt: { gte: startOfDay } } }),
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } } }),
      prisma.user.findMany({
        where: {
          active: true,
          activities: { some: { createdAt: { gte: startOfDay } } },
        },
        select: { id: true, name: true },
      }),
    ]);

    const perUserStats: string[] = [];

    for (const user of usersWithActivity) {
      const userCompleted = await prisma.task.count({
        where: { assignedToId: user.id, status: "COMPLETADA", updatedAt: { gte: startOfDay } },
      });
      const userPending = await prisma.task.count({
        where: { assignedToId: user.id, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      });
      if (userCompleted > 0 || userPending > 0) {
        perUserStats.push(`${user.name}: ${userCompleted} completadas, ${userPending} pendientes`);
      }
    }

    const aiPrompt = `Genera un resumen de cierre de jornada para el equipo directivo de Live Productions. Hoy se completaron ${completedToday} tareas. Quedan ${pendingCount} pendientes. Resumen por persona:\n${perUserStats.join("\n")}\n\nSé positivo y motivador. Destaca logros del día. Máximo 3 oraciones. Español de Guatemala.`;

    let aiMessage = "";
    try {
      aiMessage = await askAI(
        [{ role: "user", content: aiPrompt }],
        { temperature: 0.7, maxTokens: 300 }
      );
    } catch {
      aiMessage = `Finalizó la jornada con ${completedToday} tareas completadas. ¡Buen trabajo equipo!`;
    }

    for (const admin of admins) {
      try {
        const msg = `🌙 *Cierre de Jornada*\n\n${aiMessage}\n\n✅ Completadas hoy: ${completedToday}\n📋 Pendientes: ${pendingCount}`;

        if (perUserStats.length > 0) {
          const maxShow = 8;
          const shown = perUserStats.slice(0, maxShow).join("\n");
          const suffix = perUserStats.length > maxShow ? `\n... y ${perUserStats.length - maxShow} más` : "";
          const finalMsg = msg + `\n\n📊 *Por persona:*\n${shown}${suffix}`;

          const to = admin.whatsappNumber || admin.phone;
          if (to) {
            await sendMessage(to, finalMsg);
            await logActivity(admin.id, "CRON_EVENING_RECAP", `Recap de tarde enviado a ${admin.name}`);
          }
        } else if (admin.whatsappNumber || admin.phone) {
          const to = admin.whatsappNumber || admin.phone;
          if (to) {
            await sendMessage(to, msg);
          }
        }
      } catch (error) {
        console.error(`[Cron] Error evening recap for ${admin.name}:`, error);
      }
    }
  } catch (error) {
    console.error("[Cron] Error evening recap:", error);
  }
}

async function checkOverdueTasks() {
  console.log("[Cron] Verificando tareas vencidas");
  const now = new Date();

  try {
    const overdueTasks = await prisma.task.findMany({
      where: {
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
        dueDate: { lt: now },
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, role: true, whatsappNumber: true, phone: true },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });

    if (overdueTasks.length === 0) {
      console.log("[Cron] No hay tareas vencidas");
      return;
    }

    const byUser = new Map<string, { user: typeof overdueTasks[0]["assignedTo"]; tasks: typeof overdueTasks }>();
    for (const task of overdueTasks) {
      if (!task.assignedTo) continue;
      const key = task.assignedTo.id;
      if (!byUser.has(key)) {
        byUser.set(key, { user: task.assignedTo, tasks: [] });
      }
      byUser.get(key)!.tasks.push(task);
    }

    for (const [, entry] of byUser) {
      if (!entry.user) continue;
      const to = entry.user.whatsappNumber || entry.user.phone;
      if (!to) continue;

      const taskList = entry.tasks
        .map((t) => {
          const daysOverdue = Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
          return `🔴 *${t.title}* - Vencida hace ${daysOverdue} día(s) - ${t.priority}`;
        })
        .join("\n");

      const aiPrompt = `Genera un recordatorio urgente para ${entry.user.name} que tiene ${entry.tasks.length} tareas vencidas en Live Productions. Sé firme pero respetuoso. Máximo 2 oraciones. Español de Guatemala.`;

      let aiMessage = "";
      try {
        aiMessage = await askAI(
          [{ role: "user", content: aiPrompt }],
          { temperature: 0.5, maxTokens: 150 }
        );
      } catch {
        aiMessage = `${entry.user.name}, tienes ${entry.tasks.length} tareas vencidas. Por favor atiéndelas lo antes posible.`;
      }

      const msg = `⏰ *Tareas Vencidas - ${entry.user.name}*\n\n${aiMessage}\n\n${taskList}`;

      try {
        await sendMessage(to, msg);
        await logActivity(entry.user.id, "CRON_OVERDUE_ALERT", `${entry.tasks.length} tareas vencidas notificadas a ${entry.user.name}`);
      } catch (error) {
        console.error(`[Cron] Error overdue alert for ${entry.user.name}:`, error);
      }
    }

    if (byUser.size > 0) {
      const admins = await getAdminUsers();
      const escalationMsg = `⚠️ *Alerta de Escalación*\n\n${byUser.size} usuarios tienen ${overdueTasks.length} tareas vencidas en total.\n\nUsuarios con tareas vencidas: ${Array.from(byUser.values()).map(e => `${e.user?.name} (${e.tasks.length})`).join(", ")}`;

      for (const admin of admins) {
        const to = admin.whatsappNumber || admin.phone;
        if (to) {
          await sendMessage(to, escalationMsg).catch(() => {});
        }
      }

      await logActivity("system", "CRON_OVERDUE_ESCALATION", `${overdueTasks.length} tareas vencidas escaladas a administradores`);
    }
  } catch (error) {
    console.error("[Cron] Error checkOverdueTasks:", error);
  }
}

async function afternoonAccessCheck() {
  console.log("[Cron] Ejecutando chequeo de accesos de media tarde (4:00 PM)");
  try {
    const result = await checkDailyAccessRequirement();
    console.log(`[Cron] Chequeo de accesos: ${result.usersChecked} usuarios, ${result.belowThreshold} bajo umbral, ${result.inactiveToday} inactivos`);
    await logActivity("system", "CRON_AFTERNOON_ACCESS", `Chequeo de accesos: ${result.inactiveToday} inactivos, ${result.belowThreshold} bajo umbral`);
  } catch (error) {
    console.error("[Cron] Error afternoonAccessCheck:", error);
  }
}

async function eveningAccessCheck() {
  console.log("[Cron] Ejecutando chequeo de accesos vespertino (6:00 PM)");
  try {
    const result = await checkDailyAccessRequirement();

    const admins = await getAdminUsers();
    for (const admin of admins) {
      const to = admin.whatsappNumber || admin.phone;
      if (to) {
        const msg = `🌆 *Cierre de Accesos - 6:00 PM*\n\n👥 Usuarios revisados: ${result.usersChecked}\n⚠️ Bajo el umbral: ${result.belowThreshold}\n🚫 Sin accesos hoy: ${result.inactiveToday}\n\nLos usuarios sin accesos han sido notificados.`;
        await sendMessage(to, msg).catch(() => {});
      }
    }

    await logActivity("system", "CRON_EVENING_ACCESS", `Cierre de accesos: ${result.inactiveToday} sin accesos hoy`);
  } catch (error) {
    console.error("[Cron] Error eveningAccessCheck:", error);
  }
}

async function endOfDayTaskCheck() {
  console.log("[Cron] Ejecutando cierre de jornada (5:00 PM)");
  try {
    const endResult = await sendEndOfDayAlerts();
    const startOfDay = gtStartOfToday();
    console.log(`[Cron] Fin de día: ${endResult.usersWithPending} usuarios con pendientes, ${endResult.tasksRescheduled} tareas reprogramadas`);

    const [completedToday, pendingCount] = await Promise.all([
      prisma.task.count({ where: { status: "COMPLETADA", updatedAt: { gte: startOfDay } } }),
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] } } }),
    ]);

    const msg = `🌙 *Cierre de Jornada - 5:00 PM*

✅ *Completadas hoy:* ${completedToday}
🔄 *Pendientes de hoy pasadas a mañana:* ${endResult.tasksRescheduled}
📋 *Pendientes en general (seguimiento):* ${pendingCount}

Las tareas de hoy que no se completaron fueron reprogramadas automáticamente para mañana.`;


    const admins = await getAdminUsers();
    for (const admin of admins) {
      const to = admin.whatsappNumber || admin.phone;
      if (to) await sendMessage(to, msg).catch(() => {});
    }

    await logActivity("system", "CRON_END_OF_DAY", `${endResult.tasksRescheduled} tareas reprogramadas al final del día`);
  } catch (error) {
    console.error("[Cron] Error endOfDayTaskCheck:", error);
  }
}

async function bihourlyReminder(hour: number) {
  console.log(`[Cron] Ejecutando recordatorio bi-horario (${hour}:00)`);
  try {
    const result = await sendBihourlyReminders();
    console.log(`[Cron] Recordatorio bi-horario: ${result.usersReminded} usuarios recordados, ${result.totalPendingTasks} tareas pendientes`);

    await logActivity("system", "CRON_BIHOURLY", `Bi-horario ${hour}h: ${result.usersReminded} usuarios, ${result.totalPendingTasks} tareas`);
  } catch (error) {
    console.error(`[Cron] Error bihourlyReminder (${hour}):`, error);
  }
}

const jobs: CronJob[] = [
  { name: "morningBriefing", schedule: { hour: 7, minute: 0 }, timezone: "America/Guatemala", handler: morningBriefing, skipOnSunday: true },
  { name: "middayCheck", schedule: { hour: 12, minute: 0 }, timezone: "America/Guatemala", handler: middayCheck, skipOnSunday: true },
  { name: "afternoonAccessCheck", schedule: { hour: 16, minute: 0 }, timezone: "America/Guatemala", handler: afternoonAccessCheck, skipOnSunday: true },
  { name: "endOfDayTaskCheck", schedule: { hour: 17, minute: 0 }, timezone: "America/Guatemala", handler: endOfDayTaskCheck, skipOnSunday: true },
  { name: "bihourly11", schedule: { hour: 11, minute: 0 }, timezone: "America/Guatemala", handler: () => bihourlyReminder(11), skipOnSunday: true },
  { name: "bihourly14", schedule: { hour: 14, minute: 0 }, timezone: "America/Guatemala", handler: () => bihourlyReminder(14), skipOnSunday: true, skipWeekdays: [6] },
];

// Usar globalThis para que el cron sea UN SOLO singleton entre todas las instancias del módulo
const g = globalThis as any;
if (!g.__cronInitialized) g.__cronInitialized = false;
let cronInterval: ReturnType<typeof setInterval> | null = g.__cronInterval || null;
let initialized = g.__cronInitialized;

async function shouldRunJob(job: CronJob): Promise<boolean> {
  const w = getGuatemalaWallClock();
  const now = new Date();
  const key = `cron:${job.name}:${w.year}-${String(w.month).padStart(2,'0')}-${String(w.day).padStart(2,'0')}-${job.schedule.hour}`;
  try {
    // Chequea antes de crear para evitar el spam de errores P2002 (dedup silencioso)
    const existing = await prisma.systemConfig.findUnique({ where: { key } });
    if (existing) return false; // ya se ejecutó en esta hora
    await prisma.systemConfig.create({
      data: { key, value: now.toISOString(), description: `Last run of ${job.name}` },
    });
    return true;
  } catch (error) {
    console.error(`[Cron] shouldRunJob ${job.name}:`, error);
    return false;
  }
}

async function runJobIfScheduled(job: CronJob) {
  const state = getJobState(job.name);

  if (state.isRunning) return;

  // In-memory dedup: if this job ran in the last 10 minutes, skip
  if (state.lastRun && Date.now() - state.lastRun.getTime() < 10 * 60 * 1000) return;

  const w = getGuatemalaWallClock();

  // DOMINGO: los mensajes automáticos están desactivados (solo corren los
  // recordatorios/alertas/mensajes explícitos que pidió el usuario).
  if (w.weekday === 0 && job.skipOnSunday) {
    console.log(`[Cron] ${job.name}: domingo, mensaje automático desactivado.`);
    return;
  }

  // Días específicos a saltar (ej: el 14h no corre sábado)
  if (job.skipWeekdays?.includes(w.weekday)) {
    console.log(`[Cron] ${job.name}: día ${w.weekday} desactivado.`);
    return;
  }

  const hourDiff = w.hour - job.schedule.hour;

  // Future jobs: skip. Past jobs beyond 1 hour: skip.
  if (hourDiff < 0 || hourDiff > 1) return;
  // Catch-up from previous hour: only in first 10 minutes
  if (hourDiff === 1 && w.minute >= 10) return;

  if (!(await shouldRunJob(job))) {
    console.log(`[Cron] ${job.name}: ya se ejecutó en esta hora, saltando (DB dedup)`);
    return;
  }

  state.isRunning = true;
  console.log(`[Cron] ${job.name}: iniciando ejecución`);

  try {
    await job.handler();
    state.lastRun = new Date();
    state.runCount++;
    console.log(`[Cron] ${job.name}: ejecución completada`);
  } catch (error) {
    state.errorCount++;
    console.error(`[Cron] ${job.name}: error en ejecución:`, error);
  } finally {
    state.isRunning = false;
  }
}

export function startCronManager(): void {
  if (initialized) {
    console.log("[Cron] Cron manager ya está inicializado");
    return;
  }

  initialized = true;
  g.__cronInitialized = true;

  const overallState = getJobState("__overall__");
  overallState.lastRun = new Date();

  async function runAllJobChecks() {
    try {
      await Promise.all(jobs.map((job) => runJobIfScheduled(job)));
      await fireDueReminders();
      await fireScheduledAlerts();
      await fireScheduledMessages();
    } catch (error) {
      console.error("[Cron] Error en ciclo de verificación:", error);
    }
  }

  cronInterval = setInterval(runAllJobChecks, 60 * 1000); // Cada 1 minuto para precisión
  g.__cronInterval = cronInterval;

  console.log(`[Cron] Cron manager iniciado con ${jobs.length} trabajos. Verificando cada 1 minuto.`);

  const now = getGuatemalaTime();
  console.log(`[Cron] Hora actual en Guatemala: ${now.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala" })}`);

  // Immediate first check
  runAllJobChecks().catch((err) => console.error("[Cron] Error en verificación inicial:", err));
}

export function stopCronManager(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    g.__cronInterval = null;
    initialized = false;
    g.__cronInitialized = false;
    console.log("[Cron] Cron manager detenido");
  }
}

export function getCronStatus(): Record<string, JobState> {
  const status: Record<string, JobState> = {};
  for (const [name, state] of jobStates.entries()) {
    status[name] = { ...state };
  }
  return status;
}

export { getGuatemalaTime };
