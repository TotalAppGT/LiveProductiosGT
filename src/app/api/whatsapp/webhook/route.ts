import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppMessage, askAI } from "@/lib/ai-brain";
import { sendMessage } from "@/lib/whatsapp";
import { normalizeGTPhone } from "@/lib/phone";

async function transcribeAudio(mediaId: string): Promise<string | null> {
  try {
    const config = await prisma.whatsAppConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (!config?.accessToken) return null;

    const mediaRes = await fetch(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${config.accessToken}` } }
    );
    const mediaData = await mediaRes.json() as { url?: string; error?: { message: string } };
    if (!mediaData.url) {
      console.error("WhatsApp media URL error:", mediaData.error?.message);
      return null;
    }

    const audioRes = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${config.accessToken}` },
    });
    const audioBuffer = await audioRes.arrayBuffer();

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: "audio/ogg" });
    formData.append("file", blob, "audio.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", "es");

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return null;

    const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });

    const whisperData = await whisperRes.json() as { text?: string; error?: { message: string } };
    if (whisperData.error) {
      console.error("Whisper error:", whisperData.error.message);
      return null;
    }

    return whisperData.text || null;
  } catch (error) {
    console.error("transcribeAudio error:", error);
    return null;
  }
}

async function getVerifyToken(): Promise<string> {
  const config = await prisma.whatsAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  return config?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "live-productions-webhook-token";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    const verifyToken = await getVerifyToken();

    if (mode === "subscribe" && token === verifyToken) {
      console.log("Webhook de WhatsApp verificado exitosamente");
      return new NextResponse(challenge, { status: 200 });
    }

    console.warn(`Verificación webhook fallida: token recibido "${token}", esperado "${verifyToken}"`);
    return NextResponse.json(
      { success: false, error: "Token de verificación inválido" },
      { status: 403 }
    );
  } catch (error) {
    console.error("Error en verificación webhook:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

function esGTDate(date: Date): string {
  return date.toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short" });
}

async function formatTasksForUser(userId: string, period?: string) {
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfToday = new Date(today); endOfToday.setHours(23,59,59);

  const dayOfWeek = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59);

  const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
  const nextSunday = new Date(sunday); nextSunday.setDate(sunday.getDate() + 7);

  const thirdMonday = new Date(monday); thirdMonday.setDate(monday.getDate() + 14);
  const thirdSunday = new Date(sunday); thirdSunday.setDate(sunday.getDate() + 14);

  const allTasks = await prisma.task.findMany({
    where: { assignedToId: userId, status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 30,
  });

  const todayTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) >= today && new Date(t.dueDate) <= endOfToday);
  const thisWeekTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) > endOfToday && new Date(t.dueDate) >= monday && new Date(t.dueDate) <= sunday);
  const nextWeekTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) >= nextMonday && new Date(t.dueDate) <= nextSunday);
  const thirdWeekTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) >= thirdMonday && new Date(t.dueDate) <= thirdSunday);

  const fixedTasks = allTasks.filter(t => t.type === "FIJA");
  const dayNames = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const fixedByDay: Record<string, typeof allTasks> = {};
  dayNames.forEach(d => fixedByDay[d] = []);
  fixedTasks.forEach(t => {
    if (t.dayOfWeek) {
      if (!fixedByDay[t.dayOfWeek]) fixedByDay[t.dayOfWeek] = [];
      fixedByDay[t.dayOfWeek].push(t);
    }
  });

  let output = "";

  if (period === "hoy") {
    if (todayTasks.length === 0) return "✅ No tienes tareas para hoy.";
    output = `📋 *HOY - ${today.toLocaleDateString("es-GT", {weekday:"long",day:"numeric",month:"long"})}*\n\n`;
    output += formatTaskList(todayTasks);
    return output;
  }

  if (period === "semana") {
    output = `📅 *ESTA SEMANA* (${monday.toLocaleDateString("es-GT")} - ${sunday.toLocaleDateString("es-GT")})\n\n`;
    if (thisWeekTasks.length > 0) output += formatTaskList(thisWeekTasks);
    if (todayTasks.length > 0) output += `\n📌 *Hoy:*\n${formatTaskList(todayTasks)}`;
    return output || "No hay tareas esta semana.";
  }

  if (period === "semana2") {
    output = `📅 *PRÓXIMA SEMANA* (${nextMonday.toLocaleDateString("es-GT")} - ${nextSunday.toLocaleDateString("es-GT")})\n\n`;
    if (nextWeekTasks.length > 0) output += formatTaskList(nextWeekTasks);
    return output || "No hay tareas para la próxima semana.";
  }

  output = `📋 *Tareas - ${today.toLocaleDateString("es-GT", {weekday:"long",day:"numeric",month:"long"})}*\n\n`;

  if (todayTasks.length > 0) {
    output += `📌 *HOY (${todayTasks.length})*\n${formatTaskList(todayTasks)}\n\n`;
  }
  if (thisWeekTasks.length > 0) {
    output += `📅 *ESTA SEMANA (${thisWeekTasks.length})*\n${formatTaskList(thisWeekTasks)}\n\n`;
  }
  if (nextWeekTasks.length > 0) {
    output += `📅 *PRÓXIMA SEMANA (${nextWeekTasks.length})*\n${formatTaskList(nextWeekTasks)}\n\n`;
  }
  if (thirdWeekTasks.length > 0) {
    output += `📅 *3RA SEMANA (${thirdWeekTasks.length})*\n${formatTaskList(thirdWeekTasks)}\n\n`;
  }

  for (const day of ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]) {
    if (fixedByDay[day] && fixedByDay[day].length > 0) {
      output += `📌 *ACTIVIDADES FIJAS ${day.toUpperCase()} (${fixedByDay[day].length})*\n${formatTaskList(fixedByDay[day])}\n\n`;
    }
  }

  output += `\n⚡ Comandos: \`tareas hoy\` | \`tareas semana\` | \`tareas semana 2\` | \`fijas lunes\` | \`ayuda\``;
  return output;
}

function formatTaskList(tasks: any[]): string {
  return tasks.map((t) => {
    const prio = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🟠" : t.priority === "MEDIA" ? "🔵" : "⚪";
    const status = t.status === "REPROGRAMADA" ? "⏰ Reprogramada" : t.status === "EN_PROCESO" ? "🔄 En proceso" : "📌 Pendiente";
    const due = t.dueDate ? `${new Date(t.dueDate).toLocaleDateString("es-GT", {weekday:"short",day:"numeric"})}` : "";
    return `  ${prio} *${t.title}* - ${status}${due ? ` → ${due}` : ""}`;
  }).join("\n");
}

async function parseReminderFromText(text: string, user: { id: string; name: string }) {
  try {
    const response = await askAI([{
      role: "user",
      content: `Extrae de este texto en español un recordatorio. Devuelve SOLO JSON:
{
  "title": "título corto de la tarea/recordatorio",
  "description": "descripción o null",
  "remindAt": "fecha ISO 8601 en timezone America/Guatemala",
  "assignToName": "nombre de persona a asignar o null"
}

Texto: "${text}"
Usuario actual: ${user.name}

Fecha actual en Guatemala: ${new Date().toLocaleString("es-GT", {timeZone:"America/Guatemala"})}
Reglas:
- "mañana" = día siguiente
- "pasado mañana" = en 2 días
- "el lunes" = próximo lunes
- Si no se especifica hora, usa 9:00 AM
- Si menciona un nombre de persona (Diana, Jorge, Abel, Selvin, Exequiel, Javier, Brenda, Daniel), asígnalo

Responde SOLO el JSON, sin markdown.`
    }], { responseFormat: "json", temperature: 0.1, maxTokens: 300 });

    const json = JSON.parse(response.replace(/```json|```/g, "").trim());
    const remindAt = new Date(json.remindAt);

    let assignToId: string | undefined;
    if (json.assignToName) {
      const target = await prisma.user.findFirst({
        where: { name: { contains: json.assignToName, mode: "insensitive" }, active: true },
      });
      assignToId = target?.id;
    }

    return { title: json.title, description: json.description, remindAt, assignToId };
  } catch {
    return null;
  }
}

async function parseTaskCreation(text: string, user: { id: string; name: string }) {
  try {
    const response = await askAI([{
      role: "user",
      content: `Extrae de este texto en español los datos para crear una tarea. Devuelve SOLO JSON:
{
  "title": "título corto de la tarea",
  "description": "descripción o null",
  "assignToName": "nombre de la persona asignada o null",
  "dueDate": "fecha ISO 8601 en timezone America/Guatemala o null",
  "priority": "BAJA|MEDIA|ALTA|URGENTE (default MEDIA)",
  "isFixed": true or false,
  "frequency": "DIARIA|SEMANAL|MENSUAL o null",
  "dayOfWeek": "LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO o null"
}

Texto: "${text}"
Usuario actual: ${user.name}

Fecha actual en Guatemala: ${new Date().toLocaleString("es-GT", {timeZone:"America/Guatemala"})}

Reglas:
- "mañana" = día siguiente
- "pasado mañana" = en 2 días
- "el viernes" = próximo viernes
- Si no se especifica hora, usa 9:00 AM
- Si menciona un nombre de persona (Diana, Jorge, Abel, Selvin, Exequiel, Javier, Brenda, Daniel), asígnalo
- Si dice "todos los lunes" o "cada martes", isFixed=true con frequency=SEMANAL
- Solo es FIJA si explícitamente dice "fija" o "recurrente" o "todos los" o "cada"

Responde SOLO el JSON, sin markdown.`
    }], { responseFormat: "json", temperature: 0.1, maxTokens: 400 });

    const json = JSON.parse(response.replace(/```json|```/g, "").trim());

    let assignToId: string | undefined;
    if (json.assignToName) {
      const target = await prisma.user.findFirst({
        where: { name: { contains: json.assignToName, mode: "insensitive" }, active: true },
      });
      assignToId = target?.id;
    }

    return {
      title: json.title,
      description: json.description,
      assignToId,
      dueDate: json.dueDate ? new Date(json.dueDate) : undefined,
      priority: json.priority || "MEDIA",
      isFixed: json.isFixed || false,
      frequency: json.frequency,
      dayOfWeek: json.dayOfWeek,
    };
  } catch {
    return null;
  }
}

async function formatEventsForUser(userId: string) {
  const now = new Date();
  const events = await prisma.event.findMany({
    where: {
      date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) },
      status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
      OR: [
        { plannerId: userId },
        { responsibleId: userId },
      ],
    },
    orderBy: { date: "asc" },
    take: 10,
  });
  return events
    .map(
      (e) =>
        `• 🎪 *${e.name}* - Cliente: ${e.clientName} - ${new Date(e.date).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })} - ${e.location || "Sin ubicación"}`
    )
    .join("\n");
}

async function getPendingTasks(userId: string) {
  return prisma.task.findMany({
    where: { assignedToId: userId, status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 20,
  });
}

async function completeTask(taskId: string, user: { id: string; name: string }) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tarea no encontrada");
  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETADA" } });
  await prisma.taskHistory.create({
    data: { taskId, userId: user.id, action: "COMPLETADA via WhatsApp", previousStatus: task.status, newStatus: "COMPLETADA" },
  });
  await prisma.activity.create({
    data: { userId: user.id, action: "TASK_COMPLETED_WHATSAPP", resource: "TASK", resourceId: taskId, details: `Tarea completada via WhatsApp por ${user.name}` },
  });
}

async function postponeTask(taskId: string, newDate: Date, reason: string, user: { id: string; name: string }) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tarea no encontrada");
  await prisma.task.update({
    where: { id: taskId },
    data: { status: "REPROGRAMADA", postponeReason: reason, postponeCount: { increment: 1 }, rescheduledTo: newDate, dueDate: newDate },
  });
  await prisma.taskHistory.create({
    data: { taskId, userId: user.id, action: `REPROGRAMADA via WhatsApp: ${reason}`, previousStatus: task.status, newStatus: "REPROGRAMADA" },
  });
}

async function addTaskComment(taskId: string, userId: string, content: string) {
  await prisma.taskComment.create({ data: { taskId, userId, content } });
}

async function delegateTask(taskId: string, newUserId: string, reason: string, fromUser: { id: string; name: string }) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignedTo: { select: { name: true } } } });
  if (!task) throw new Error("Tarea no encontrada");
  await prisma.task.update({ where: { id: taskId }, data: { assignedToId: newUserId, postponeReason: `Transferida por ${fromUser.name}: ${reason}` } });
  await prisma.taskHistory.create({
    data: { taskId, userId: fromUser.id, action: `TRANSFERIDA a ${newUserId} via WhatsApp`, previousStatus: task.status, newStatus: task.status },
  });
  const newUser = await prisma.user.findUnique({ where: { id: newUserId } });
  if (newUser?.whatsappNumber) {
    await sendMessage(newUser.whatsappNumber, `📩 ${fromUser.name} te ha transferido la tarea *${task.title}*\nRazón: ${reason}\n\nAccede al sistema: https://liveproductiosgt-production.up.railway.app`);
  }
}

async function getComplianceSummary(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [assignedCount, completedCount] = await Promise.all([
    prisma.task.count({ where: { assignedToId: userId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.task.count({ where: { assignedToId: userId, status: "COMPLETADA", updatedAt: { gte: thirtyDaysAgo } } }),
  ]);

  const rate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;
  return `${completedCount} de ${assignedCount} tareas completadas (${rate}%) en los últimos 30 días`;
}

async function handleCommand(
  command: string,
  user: { id: string; name: string; role: string }
): Promise<string | null> {
  const cmd = command.toLowerCase().trim();

  // Task interaction commands
  if (cmd.startsWith("completar ")) {
    const num = parseInt(cmd.replace("completar ", "").trim());
    if (isNaN(num)) return "¿Cuál tarea? Ejemplo: *completar 3*";
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas. Elige un número del 1 al ${tasks.length}.`;
    const task = tasks[num - 1];
    await completeTask(task.id, user);
    return `✅ Tarea *${task.title}* completada. ¡Buen trabajo ${user.name}!`;
  }

  if (cmd.startsWith("posponer ")) {
    const parts = cmd.replace("posponer ", "").trim().split(" ");
    const num = parseInt(parts[0]);
    if (isNaN(num)) return "Formato: *posponer 3 mañana* o *posponer 3 razón aquí*";
    const reason = parts.slice(1).join(" ") || "Sin razón especificada";
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas.`;
    const task = tasks[num - 1];
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(0,0,0,0);
    await postponeTask(task.id, tomorrow, reason, user);
    return `⏰ Tarea *${task.title}* pospuesta para mañana. Razón: ${reason}\n_Se notificará al administrador._`;
  }

  if (cmd.startsWith("comentar ")) {
    const parts = cmd.replace("comentar ", "").trim().split(" ");
    const num = parseInt(parts[0]);
    if (isNaN(num)) return "Formato: *comentar 3 el cliente no contestó*";
    const comment = parts.slice(1).join(" ") || "Sin comentario";
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas.`;
    const task = tasks[num - 1];
    await addTaskComment(task.id, user.id, comment);
    return `💬 Comentario agregado a *${task.title}*: "${comment}"`;
  }

  if (cmd.startsWith("transferir ")) {
    const parts = cmd.replace("transferir ", "").trim().split(" ");
    const num = parseInt(parts[0]);
    if (isNaN(num)) return "Formato: *transferir 3 a Diana*";
    const toIndex = parts.indexOf("a");
    let targetName: string;
    let reason: string;
    if (toIndex > 0) {
      targetName = parts.slice(toIndex + 1).join(" ");
      reason = parts.slice(1, toIndex).join(" ") || "Transferida";
    } else {
      targetName = parts.slice(1).join(" ");
      reason = "Transferida";
    }
    if (!targetName) return "¿A quién? Ejemplo: *transferir 3 a Diana*";
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas.`;
    const task = tasks[num - 1];
    const targetUser = await prisma.user.findFirst({
      where: { name: { contains: targetName, mode: "insensitive" }, active: true },
    });
    if (!targetUser) return `No encontré a "${targetName}". Usuarios disponibles: usa *equipo* para ver la lista.`;
    await delegateTask(task.id, targetUser.id, reason, user);
    return `📤 Tarea *${task.title}* transferida a *${targetUser.name}*. Se le notificará de inmediato.`;
  }

  if (cmd === "equipo") {
    const allUsers = await prisma.user.findMany({ where: { active: true }, select: { name: true, role: true, phone: true }, take: 20 });
    const list = allUsers.map(u => `• ${u.name} (${u.role})${u.phone ? ` - ${u.phone.slice(-8)}` : ""}`).join("\n");
    return `👥 *Equipo Live Productions*\n\n${list}\n\n_Para transferir una tarea: *transferir 2 a [nombre]*_`;
  }

  if (cmd === "tareas hoy" || cmd === "hoy") {
    const tasks = await formatTasksForUser(user.id, "hoy");
    return tasks;
  }
  if (cmd === "tareas semana" || cmd === "semana") {
    const tasks = await formatTasksForUser(user.id, "semana");
    return tasks;
  }
  if (cmd === "tareas semana 2" || cmd === "semana 2") {
    const tasks = await formatTasksForUser(user.id, "semana2");
    return tasks;
  }

  const fixedDayMatch = cmd.match(/^fijas?\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)$/i);
  if (fixedDayMatch) {
    const dayMap: Record<string, string> = {
      "lunes":"LUNES","martes":"MARTES","miércoles":"MIERCOLES","miercoles":"MIERCOLES",
      "jueves":"JUEVES","viernes":"VIERNES","sábado":"SABADO","sabado":"SABADO","domingo":"DOMINGO"
    };
    const day = dayMap[fixedDayMatch[1].toLowerCase()];
    const tasks = await prisma.task.findMany({
      where: { assignedToId: user.id, type: "FIJA", dayOfWeek: day as any, status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      orderBy: { priority: "desc" },
      take: 15,
    });
    if (tasks.length === 0) return `No tienes actividades fijas para ${day}.`;
    return `📌 *Actividades Fijas ${day}*\n\n${formatTaskList(tasks)}`;
  }

  if (cmd === "tareas" || cmd === "mis tareas" || (cmd.includes("tarea") && !cmd.startsWith("tareas hoy") && !cmd.startsWith("tareas semana") && !cmd.includes("crea") && !cmd.includes("crear") && !cmd.includes("nueva"))) {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `Hola ${user.name}, no tienes tareas pendientes. ¡Excelente trabajo! 🎉`;
    return tasks;
  }

  if (cmd === "pendientes") {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `${user.name}, no tienes tareas pendientes. ¡Todo al día! ✅`;
    return tasks;
  }

  if (cmd.startsWith("recuerda") || cmd.startsWith("recordar") || cmd.startsWith("recordatorio")) {
    const parsed = await parseReminderFromText(cmd, user);
    if (!parsed) return "No pude entender la fecha/hora. Ejemplo: *recuérdame llamar a Juan mañana a las 3pm*";

    const reminder = await prisma.reminder.create({
      data: {
        title: parsed.title,
        description: parsed.description || "",
        remindAt: parsed.remindAt,
        createdById: user.id,
        assignedToId: parsed.assignToId || user.id,
      },
    });

    const targetUser = parsed.assignToId ? await prisma.user.findUnique({ where: { id: parsed.assignToId } }) : null;
    const targetName = targetUser ? targetUser.name : "ti";

    return `⏰ Recordatorio creado para ${targetName}: *${parsed.title}*\n📅 ${parsed.remindAt.toLocaleDateString("es-GT", {weekday:"long",day:"numeric",month:"long"})} a las ${parsed.remindAt.toLocaleTimeString("es-GT", {hour:"2-digit",minute:"2-digit"})}`;
  }

  if (cmd.startsWith("crea tarea") || cmd.startsWith("crear tarea") || cmd.startsWith("nueva tarea")) {
    const parsed = await parseTaskCreation(cmd, user);
    if (!parsed) return "No entendí. Ejemplo: *crea tarea para Diana revisar cotizaciones mañana 10am*";

    const task = await prisma.task.create({
      data: {
        title: parsed.title,
        description: parsed.description || "",
        assignedToId: parsed.assignToId || user.id,
        assignedById: user.id,
        dueDate: parsed.dueDate || new Date(),
        priority: parsed.priority || "MEDIA",
        category: "OTRO",
        type: parsed.isFixed ? "FIJA" : "DINAMICA",
        frequency: parsed.isFixed ? (parsed.frequency || "DIARIA") : "DIARIA",
        dayOfWeek: parsed.dayOfWeek,
        status: "PENDIENTE",
      },
    });

    const targetUser = parsed.assignToId ? await prisma.user.findUnique({ where: { id: parsed.assignToId } }) : null;
    const targetName = targetUser ? targetUser.name : user.name;

    return `✅ Tarea creada para *${targetName}*: "${parsed.title}"\n📅 ${task.dueDate ? new Date(task.dueDate).toLocaleDateString("es-GT", {weekday:"long",day:"numeric",month:"long"}) : "Sin fecha"}`;
  }

  if (cmd === "eventos") {
    const events = await formatEventsForUser(user.id);
    if (!events) return `Hola ${user.name}, no tienes eventos próximos registrados.`;
    return `🎪 *Próximos Eventos - ${user.name}*\n\n${events}`;
  }

  if (cmd.startsWith("evento ")) {
    const eventName = cmd.replace("evento ", "").trim();
    if (!eventName) return "Por favor especifica el nombre del evento. Ejemplo: *evento Boda Pérez*";

    const events = await prisma.event.findMany({
      where: {
        name: { contains: eventName, mode: "insensitive" },
        OR: [
          { plannerId: user.id },
          { responsibleId: user.id },
        ],
      },
      orderBy: { date: "desc" },
      take: 5,
      include: {
        planner: { select: { name: true } },
        responsible: { select: { name: true } },
        tasks: {
          where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } },
          select: { title: true, status: true, assignedTo: { select: { name: true } } },
          take: 10,
        },
      },
    });

    if (events.length === 0) {
      return `No encontré ningún evento con "${eventName}" asignado a ti. Verifica el nombre e intenta de nuevo.`;
    }

    const lines = events.map((e) => {
      const taskLines = e.tasks
        .map((t) => `  • ${t.title} [${t.status}] -> ${t.assignedTo?.name || "Sin asignar"}`)
        .join("\n");
      return `🎪 *${e.name}*\n📅 ${new Date(e.date).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}\n📍 ${e.location || "Sin ubicación"}\n👤 Cliente: ${e.clientName}\n📊 Estado: ${e.status}\n👥 Planner: ${e.planner?.name || "N/A"} | Responsable: ${e.responsible?.name || "N/A"}\n📋 Tareas (${e.tasks.length}):\n${taskLines || "  Ninguna pendiente"}`;
    });

    return lines.join("\n\n---\n\n");
  }

  if (cmd === "resumen") {
    const [tasks, events, compliance] = await Promise.all([
      formatTasksForUser(user.id),
      formatEventsForUser(user.id),
      getComplianceSummary(user.id),
    ]);
    const tasksStr = tasks || "Sin tareas pendientes";
    const eventsStr = events || "Sin eventos próximos";
    return `📊 *Resumen de ${user.name}*\n\n📋 *Tareas:*\n${tasksStr}\n\n🎪 *Eventos:*\n${eventsStr}\n\n📈 *Cumplimiento:*\n${compliance}`;
  }

  if (cmd === "ayuda") {
    return `🤖 *LUNA - Asistente Live Productions*

📊 *Prioridades:* 🔴 URGENTE | 🟠 ALTA | 🔵 MEDIA | ⚪ BAJA

📋 *Ver tareas:*
tareas - Vista general
tareas hoy - Solo las de hoy
tareas semana - Esta semana
tareas semana 2 - Próxima semana
fijas lunes - Actividades fijas del lunes

⚡ *Acciones:*
completar 3 - Marcar tarea #3 como hecha
posponer 3 razón - Posponer con motivo
comentar 3 texto - Agregar comentario
transferir 3 a Diana - Pasar tarea a otro

➕ *Crear:*
crea tarea revisar bodega mañana 10am
crea tarea para Diana cotizar evento viernes

⏰ *Recordatorios:*
recuérdame llamar cliente mañana 3pm
recuérdame revisar inventario el lunes 9am

👥 equipo - Ver compañeros
🎪 eventos - Próximos eventos
📊 resumen - Tu resumen

🔗 sistema: liveproductiosgt.up.railway.app`;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === "messages") {
            const value = change.value;
            const messages = value?.messages || [];
            const contacts = value?.contacts || [];

            for (const message of messages) {
              const fromNumber = message.from;
              const contact = contacts.find(
                (c: unknown) => (c as Record<string, unknown>).wa_id === fromNumber
              );
              const contactName =
                (contact as unknown as { profile?: { name?: string } })?.profile?.name ||
                "Desconocido";

              const messageType = message.type;
              let text = message.text?.body?.trim() || "";

              console.log("Mensaje recibido de WhatsApp:", {
                from: fromNumber,
                contactName,
                type: messageType,
                hasText: !!text,
                timestamp: message.timestamp,
              });

              if (messageType && messageType !== "text") {
                // Handle audio with speech-to-text via OpenAI Whisper
                if (messageType === "audio" && message.audio?.id) {
                  try {
                    text = await transcribeAudio(message.audio.id);
                    if (!text) {
                      await sendMessage(fromNumber, "🎤 No pude entender el audio. ¿Podrías escribirlo?").catch(() => {});
                      continue;
                    }
                  } catch {
                    await sendMessage(fromNumber, "🎤 Lo siento, no pude procesar tu audio en este momento. Escríbeme por texto.").catch(() => {});
                    continue;
                  }
                } else {
                  const mediaTypeLabels: Record<string, string> = {
                    audio: "audio",
                    image: "imagen",
                    video: "video",
                    document: "documento",
                    sticker: "sticker",
                    location: "ubicación",
                  };
                  const mediaLabel = mediaTypeLabels[messageType] || messageType;
                  const mediaMsg = `¡Hola! 📱 Soy LUNA, tu asistente de Live Productions. Por el momento no puedo procesar mensajes de *${mediaLabel}*.\n\nEnvíame un mensaje de *texto* y con gusto te ayudaré con:\n• Tus tareas pendientes\n• Próximos eventos\n• Resúmenes de actividad\n• Preguntas sobre procesos de la empresa\n\nEscribe *ayuda* para ver todos los comandos disponibles.`;

                  await sendMessage(fromNumber, mediaMsg).catch(() => {});

                  await prisma.whatsAppMessage.create({
                    data: {
                      userId: "system",
                      toNumber: fromNumber,
                      message: `[RECIBIDO ${messageType.toUpperCase()}] No procesable`,
                      type: "CHAT",
                      status: "DELIVERED",
                    },
                  }).catch(() => {});

                  continue;
                }
              }

              if (!text) continue;

              // Check if message is from a WhatsApp group
              const isGroupMessage = !!(message as Record<string, unknown>)?.context;
              if (isGroupMessage) {
                await sendMessage(
                  fromNumber,
                  "LUNA no puede procesar mensajes de grupo aún. Para interactuar, escríbeme por mensaje privado."
                ).catch(() => {});
                continue;
              }

              try {
                const normalizedFrom = normalizeGTPhone(fromNumber);
                const normalizedFromDigits = normalizedFrom.replace(/\D/g, "");

                const user = await prisma.user.findFirst({
                  where: {
                    OR: [
                      { whatsappNumber: normalizedFrom },
                      { whatsappNumber: normalizedFromDigits },
                      { whatsappNumber: fromNumber },
                      { phone: normalizedFrom },
                      { phone: normalizedFromDigits },
                      { phone: fromNumber },
                    ],
                  },
                  select: { id: true, name: true, role: true, whatsappNumber: true },
                });

                if (user) {
                  console.log(`[WhatsApp] Usuario encontrado: ${user.name} (${user.role}) id=${user.id}`);
                  const commandResponse = await handleCommand(text, user);

                  if (commandResponse) {
                    const sendResult = await sendMessage(fromNumber, commandResponse);

                    await prisma.whatsAppMessage.create({
                      data: {
                        userId: user.id,
                        toNumber: fromNumber,
                        message: `[RECIBIDO] ${text}`,
                        type: "CHAT",
                        status: "DELIVERED",
                      },
                    });

                    await prisma.whatsAppMessage.create({
                      data: {
                        userId: user.id,
                        toNumber: fromNumber,
                        message: `[RESPUESTA COMANDO] ${commandResponse.slice(0, 500)}`,
                        type: "CHAT",
                        status: sendResult ? "SENT" : "FAILED",
                      },
                    });

                    await prisma.activity.create({
                      data: {
                        userId: user.id,
                        action: "WHATSAPP_COMMAND",
                        resource: "WHATSAPP",
                        details: `Comando "${text}" ejecutado por ${user.name} (${fromNumber})`,
                      },
                    });
                  } else {
                    const aiReply = await handleWhatsAppMessage(fromNumber, text);

                    const sendResult = await sendMessage(fromNumber, aiReply);

                    await prisma.whatsAppMessage.create({
                      data: {
                        userId: user.id,
                        toNumber: fromNumber,
                        message: `[RECIBIDO] ${text}`,
                        type: "CHAT",
                        status: "DELIVERED",
                      },
                    });

                    await prisma.whatsAppMessage.create({
                      data: {
                        userId: user.id,
                        toNumber: fromNumber,
                        message: `[RESPUESTA LUNA] ${aiReply.slice(0, 500)}`,
                        type: "CHAT",
                        status: sendResult ? "SENT" : "FAILED",
                      },
                    });

                    await prisma.activity.create({
                      data: {
                        userId: user.id,
                        action: "WHATSAPP_AI_REPLY",
                        resource: "WHATSAPP",
                        details: `LUNA respondió a ${user.name} (${fromNumber}): "${text.slice(0, 100)}"`,
                      },
                    });
                  }
                } else {
                  const welcomeMsg =
                    "¡Hola! 👋 Soy *LUNA*, la asistente virtual de Live Productions. " +
                    "Tu número no está registrado en nuestro sistema.\n\n" +
                    "Si eres parte del equipo, por favor pide a tu administrador que registre tu número de WhatsApp.\n\n" +
                    "📞 Teléfono: +502 3090-3172\n🌐 liveproductionsgt.com\n🔗 Accede al sistema: https://liveproductiosgt-production.up.railway.app\n📍 16 avenida A 28-76 zona 13 Elgin 2, Guatemala";

                  await sendMessage(fromNumber, welcomeMsg);

                  console.log(`Mensaje de bienvenida enviado a número no registrado: ${fromNumber}`);
                }
              } catch (err) {
                console.error("Error al procesar mensaje entrante:", err);

                try {
                  await sendMessage(
                    fromNumber,
                    "Lo siento, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo más tarde. Si el problema persiste, contáctanos al +502 3090-3172."
                  );
                } catch { /* */ }
              }
            }
          }
        }
      }
    }

    return NextResponse.json(
      { success: true, message: "Webhook procesado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en webhook WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
