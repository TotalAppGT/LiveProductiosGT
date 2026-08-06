import { prisma } from "@/lib/prisma";
import { askAI } from "@/lib/ai-brain";
import { sendMessage } from "@/lib/whatsapp";
import { checkDailyAccessRequirement, sendEndOfDayAlerts, sendBihourlyReminders, fireDueReminders, fireScheduledAlerts } from "@/lib/smart-scheduler";
import { carryOverUncompletedTasks } from "@/lib/task-utils";

interface CronJob {
  name: string;
  schedule: { hour: number; minute: number };
  timezone: string;
  handler: () => Promise<void>;
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
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guatemala" }));
}

function isTimeMatch(date: Date, hour: number, minute: number): boolean {
  return date.getHours() === hour && date.getMinutes() >= minute && date.getMinutes() < minute + 5;
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
  console.log("[Cron] Ejecutando morning briefing (8:00 AM)");

  try {
    const carried = await carryOverUncompletedTasks();
    console.log(`[Cron] Tareas arrastradas del día anterior: ${carried}`);
  } catch (err) {
    console.error("[Cron] Error cargando tareas de ayer:", err);
  }

  const users = await getActiveUsersWithWhatsApp();

  for (const user of users) {
    try {
      const now = getGuatemalaTime();
      const tasks = await prisma.task.findMany({
        where: {
          assignedToId: user.id,
          status: { in: ["PENDIENTE", "EN_PROCESO"] },
        },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        take: 10,
      });

      const events = await prisma.event.findMany({
        where: {
          date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) },
          status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
          OR: [{ plannerId: user.id }, { responsibleId: user.id }],
        },
        orderBy: { date: "asc" },
        take: 5,
      });

      const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      const dayName = dayNames[now.getDay()];

      const aiPrompt = `Genera un breve mensaje de buenos días para ${user.name} de Live Productions. Hoy es ${dayName}. Tiene ${tasks.length} tareas pendientes y ${events.length} eventos próximos. Sé motivador y menciona sus prioridades del día. Máximo 3 oraciones. Español de Guatemala.`;

      let aiMessage = "";
      try {
        aiMessage = await askAI(
          [{ role: "user", content: aiPrompt }],
          { temperature: 0.7, maxTokens: 250 }
        );
      } catch {
        aiMessage = `¡Buenos días ${user.name}! Hoy tienes ${tasks.length} tareas pendientes. ¡A darle con todo! 💪`;
      }

      const taskLines = tasks
        .map((t) => {
          const priorityEmoji = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🟠" : "🔵";
          const dueDate = t.dueDate ? ` (${new Date(t.dueDate).toLocaleDateString("es-GT")})` : "";
          return `${priorityEmoji} ${t.title}${dueDate}`;
        })
        .join("\n");

      const eventLines = events
        .map((e) => `🎪 ${e.name} - ${new Date(e.date).toLocaleDateString("es-GT")}`)
        .join("\n");

      let fullMessage = `☀️ *Buenos días, ${user.name}*\n${dayName}\n\n${aiMessage}`;
      if (taskLines) fullMessage += `\n\n📋 *Tareas (${tasks.length})*\n${taskLines}`;
      if (eventLines) fullMessage += `\n\n🎪 *Eventos (${events.length})*\n${eventLines}`;

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
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [pendingTasks, overdueTasks, todayEvents, activeUsers, inactiveUsers] = await Promise.all([
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } } }),
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO"] }, dueDate: { lt: now } } }),
      prisma.event.findMany({
        where: {
          date: { gte: startOfDay, lte: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7) },
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
      aiDigest = `Resumen del día: ${pendingTasks} tareas pendientes, ${overdueTasks} vencidas, ${activeUsers} usuarios activos.`;
    }

    for (const admin of admins) {
      try {
        const msg = `📊 *Resumen Diario - ${new Date().toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })}*\n\n${aiDigest}\n\n📋 *Tareas:* ${pendingTasks} pendientes | ⏰ ${overdueTasks} vencidas\n👥 *Equipo:* ${activeUsers} activos | 😴 ${inactiveUsers.length} inactivos\n💰 *Cobros pendientes:* Q ${cobrosSum._sum.amount ? Number(cobrosSum._sum.amount).toLocaleString("es-GT", { minimumFractionDigits: 2 }) : "0.00"}\n🎪 *Eventos próximos:* ${todayEvents.length}`;

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
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

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
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

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
  console.log("[Cron] Ejecutando alertas de fin de día (5:00 PM)");
  try {
    const result = await sendEndOfDayAlerts();
    console.log(`[Cron] Fin de día: ${result.usersWithPending} usuarios con pendientes, ${result.tasksRescheduled} tareas reprogramadas`);

    const admins = await getAdminUsers();
    for (const admin of admins) {
      const to = admin.whatsappNumber || admin.phone;
      if (to) {
        const msg = `🌙 *Cierre de Tareas - 5:00 PM*\n\n📋 Usuarios con pendientes: ${result.usersWithPending}\n🔄 Tareas reprogramadas para mañana: ${result.tasksRescheduled}\n\nLas tareas no completadas fueron reprogramadas automáticamente.`;
        await sendMessage(to, msg).catch(() => {});
      }
    }

    await logActivity("system", "CRON_END_OF_DAY", `${result.tasksRescheduled} tareas reprogramadas al final del día`);
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
  { name: "morningBriefing", schedule: { hour: 8, minute: 0 }, timezone: "America/Guatemala", handler: morningBriefing },
  { name: "middayCheck", schedule: { hour: 12, minute: 0 }, timezone: "America/Guatemala", handler: middayCheck },
  { name: "afternoonAccessCheck", schedule: { hour: 16, minute: 0 }, timezone: "America/Guatemala", handler: afternoonAccessCheck },
  { name: "endOfDayTaskCheck", schedule: { hour: 17, minute: 0 }, timezone: "America/Guatemala", handler: endOfDayTaskCheck },
  { name: "eveningRecap", schedule: { hour: 17, minute: 0 }, timezone: "America/Guatemala", handler: eveningRecap },
  { name: "checkOverdueTasks", schedule: { hour: 0, minute: 0 }, timezone: "America/Guatemala", handler: checkOverdueTasks },
  { name: "bihourly10", schedule: { hour: 10, minute: 0 }, timezone: "America/Guatemala", handler: () => bihourlyReminder(10) },
  { name: "bihourly12", schedule: { hour: 12, minute: 0 }, timezone: "America/Guatemala", handler: () => bihourlyReminder(12) },
  { name: "bihourly14", schedule: { hour: 14, minute: 0 }, timezone: "America/Guatemala", handler: () => bihourlyReminder(14) },
  { name: "bihourly16", schedule: { hour: 16, minute: 0 }, timezone: "America/Guatemala", handler: () => bihourlyReminder(16) },
];

let cronInterval: ReturnType<typeof setInterval> | null = null;
let initialized = false;

async function shouldRunJob(job: CronJob): Promise<boolean> {
  const now = getGuatemalaTime();
  const key = `cron:${job.name}:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${job.schedule.hour}`;
  try {
    const existing = await prisma.systemConfig.findUnique({ where: { key } });
    if (existing) return false;
    await prisma.systemConfig.create({
      data: { key, value: new Date().toISOString(), description: `Last run of ${job.name}` },
    });
    return true;
  } catch {
    return false;
  }
}

async function runJobIfScheduled(job: CronJob) {
  const state = getJobState(job.name);

  if (state.isRunning) {
    console.log(`[Cron] ${job.name}: ya está ejecutándose, saltando`);
    return;
  }

  const now = getGuatemalaTime();
  if (!isTimeMatch(now, job.schedule.hour, job.schedule.minute)) return;

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

  const overallState = getJobState("__overall__");
  overallState.lastRun = new Date();

  cronInterval = setInterval(async () => {
    try {
      await Promise.all(jobs.map((job) => runJobIfScheduled(job)));
      await fireDueReminders(); // Check reminders every 5 minutes
      await fireScheduledAlerts(); // Fire scheduled group/individual alerts
    } catch (error) {
      console.error("[Cron] Error en ciclo de verificación:", error);
    }
  }, 5 * 60 * 1000);

  console.log(`[Cron] Cron manager iniciado con ${jobs.length} trabajos. Verificando cada 5 minutos.`);

  const now = getGuatemalaTime();
  console.log(`[Cron] Hora actual en Guatemala: ${now.toLocaleTimeString("es-GT")}`);
}

export function stopCronManager(): void {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    initialized = false;
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
