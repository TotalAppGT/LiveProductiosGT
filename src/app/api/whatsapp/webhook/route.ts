import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppMessage, askAI } from "@/lib/ai-brain";
import { sendMessage } from "@/lib/whatsapp";
import { normalizeGTPhone } from "@/lib/phone";

const conversations = new Map<string, { state: string; data: any; expires: number }>();

function normalizeGuatemalaDate(input: string): Date {
  const trimmed = input.trim();
  // Si ya trae zona horaria (Z o +hh:mm), parsea directo
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }
  // Hora sin zona: interpretarla como hora local de Guatemala (UTC-6)
  return new Date(trimmed + "-06:00");
}

function getConversation(phone: string) {
  const conv = conversations.get(phone);
  if (conv && Date.now() > conv.expires) {
    conversations.delete(phone);
    return null;
  }
  return conv;
}

function setConversation(phone: string, state: string, data: any) {
  conversations.set(phone, { state, data, expires: Date.now() + 300000 });
}

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

function parseTimeExpression(text: string): { hours: number; minutes: number } | null {
  const t = text.toLowerCase().trim();

  const time24 = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (time24) {
    const hours = parseInt(time24[1]);
    const minutes = parseInt(time24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  const time12 = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (time12) {
    let hours = parseInt(time12[1]);
    const minutes = time12[2] ? parseInt(time12[2]) : 0;
    const meridian = time12[3];
    if (/pm|p\.m\./i.test(meridian) && hours < 12) hours += 12;
    if (/am|a\.m\./i.test(meridian) && hours === 12) hours = 0;
    return { hours, minutes };
  }

  if (/\ben la mañana\b|\btemprano\b/.test(t)) return { hours: 8, minutes: 0 };
  if (/\ben la tarde\b/.test(t)) return { hours: 15, minutes: 0 };
  if (/\ben la noche\b/.test(t)) return { hours: 19, minutes: 0 };
  if (/\bmedio\s*d[ií]a\b/.test(t)) return { hours: 12, minutes: 0 };

  return null;
}

function parseRelativeDate(text: string, referenceDate: Date): Date | null {
  const t = text.toLowerCase().trim();
  const ref = new Date(referenceDate);

  if (/\bhoy\b/.test(t)) {
    const result = new Date(ref);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  if (/\bpasado\s*mañana\b/.test(t)) {
    const result = new Date(ref);
    result.setDate(result.getDate() + 2);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  if (/\bmañana\b/.test(t) && !/\ben la mañana\b/.test(t)) {
    const result = new Date(ref);
    result.setDate(result.getDate() + 1);
    result.setHours(9, 0, 0, 0);
    return result;
  }

  const days: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    "miércoles": 3,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    "sábado": 6,
    sabado: 6,
  };

  for (const [dayName, dayNum] of Object.entries(days)) {
    const regex = new RegExp(`\\b${dayName}\\b`, "i");
    if (regex.test(t)) {
      const currentDay = ref.getDay();
      let daysUntil = dayNum - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (/\bpr[oó]ximo\b/.test(t)) {
        daysUntil += 7;
      }
      const result = new Date(ref);
      result.setDate(result.getDate() + daysUntil);
      result.setHours(9, 0, 0, 0);
      return result;
    }
  }

  return null;
}

function parsePostponeDetails(text: string): { newDate: Date | null; reason: string } {
  const t = text.trim();
  const now = new Date();

  if (/^para\s/i.test(t)) {
    const afterPara = t.replace(/^para\s+/i, "");

    const datePattern = /^(el\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|mañana|pasado\s*mañana|hoy)(\s+pr[oó]ximo)?/i;
    const m = afterPara.match(datePattern);

    if (m) {
      const dateStart = m[0];
      const afterDate = afterPara.slice(m[0].length);

      let timeStr = "";
      let consumedAfterDate = 0;

      const timePrefixMatch = afterDate.match(/^(\s+a\s+las?\s+)/i);
      if (timePrefixMatch) {
        const afterPrefix = afterDate.slice(timePrefixMatch[0].length);
        const timeWordMatch = afterPrefix.match(/^(\S+)/);
        if (timeWordMatch) {
          const candidate = timePrefixMatch[0] + timeWordMatch[0];
          if (parseTimeExpression(candidate)) {
            timeStr = candidate;
            consumedAfterDate = timePrefixMatch[0].length + timeWordMatch[0].length;
          }
        }
      } else {
        const rawTimeMatch = afterDate.match(/^(\s*\S+)/);
        if (rawTimeMatch) {
          const candidate = rawTimeMatch[0];
          if (parseTimeExpression(candidate)) {
            timeStr = candidate;
            consumedAfterDate = rawTimeMatch[0].length;
          }
        }
      }

      const fullDateStr = dateStart + timeStr;
      const date = parseRelativeDate(fullDateStr, now);

      if (date) {
        const time = parseTimeExpression(fullDateStr);
        if (time) {
          date.setHours(time.hours, time.minutes, 0, 0);
        }
        const reason = afterDate.slice(consumedAfterDate).trim();
        return { newDate: date, reason: reason || "Sin razón especificada" };
      }
    }
  }

  return { newDate: null, reason: t || "Sin razón especificada" };
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
    output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
    return output;
  }

  if (period === "semana") {
    output = `📅 *ESTA SEMANA* (${monday.toLocaleDateString("es-GT")} - ${sunday.toLocaleDateString("es-GT")})\n\n`;
    if (thisWeekTasks.length > 0) output += formatTaskList(thisWeekTasks);
    if (todayTasks.length > 0) output += `\n📌 *Hoy:*\n${formatTaskList(todayTasks)}`;
    output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
    return output || "No hay tareas esta semana.";
  }

  if (period === "semana2") {
    output = `📅 *PRÓXIMA SEMANA* (${nextMonday.toLocaleDateString("es-GT")} - ${nextSunday.toLocaleDateString("es-GT")})\n\n`;
    if (nextWeekTasks.length > 0) output += formatTaskList(nextWeekTasks);
    output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
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

  output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar\n\n📋 *Ver:* \`tareas hoy\` | \`tareas semana\` | \`ayuda\``;
  return output;
}

function formatTaskList(tasks: any[], startNum: number = 1): string {
  return tasks.map((t, i) => {
    const num = startNum + i;
    const prio = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🔴" : t.priority === "MEDIA" ? "🟡" : "🟢";
    const status = t.status === "COMPLETADA" ? "✅" : t.status === "REPROGRAMADA" ? "🟣 Pospuesta" : t.status === "EN_PROCESO" ? "🔄 En proceso" : "📌";
    let due = "";
    if (t.dueDate) {
      const d = new Date(t.dueDate);
      const datePart = d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "short", day: "numeric", month: "short" });
      const timePart = d.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" });
      due = ` ${datePart} ${timePart}`;
    }
    return `${num}. ${prio} *${t.title}* ${status}${due}`;
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
  "remindAt": "fecha y hora como YYYY-MM-DDTHH:mm:ss en hora LOCAL de Guatemala (sin Z ni offset)",
  "assignToName": "nombre de persona a asignar o null"
}

Texto: "${text}"
Usuario actual: ${user.name}

Fecha y hora actual en Guatemala: ${new Date().toLocaleString("es-GT", {timeZone:"America/Guatemala"})}

Reglas IMPORTANTES:
- La hora que dice el usuario ES la hora de Guatemala. NO la conviertas a UTC ni a otra zona.
- Si el usuario dice "9:15 am", remindAt debe tener "09:15", NUNCA "15:15".
- "mañana" = día siguiente
- "pasado mañana" = en 2 días
- "el lunes" = próximo lunes
- Si no se especifica hora, usa 09:00
- assignToName = la persona que RECIBIRÁ el recordatorio.
  * Si dice "recuérdame", "mándame", "avísame" → assignToName = null (es él mismo)
  * Si dice "recuérdale a Diana", "mándale un mensaje a Diana", "para Diana" → assignToName = "Diana"
  * El nombre de la tarea (ej: "llamar a Juan") NO es el asignado. Juan es parte de la tarea, no quien recibe.

Responde SOLO el JSON, sin markdown.`
    }], { responseFormat: "json", temperature: 0.1, maxTokens: 300 });

    const json = JSON.parse(response.replace(/```json|```/g, "").trim());
    const remindAt = normalizeGuatemalaDate(json.remindAt);

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
  "dueDate": "fecha y hora como YYYY-MM-DDTHH:mm:ss en hora LOCAL de Guatemala o null",
  "priority": "BAJA|MEDIA|ALTA|URGENTE (default MEDIA)",
  "isFixed": true or false,
  "frequency": "DIARIA|SEMANAL|MENSUAL o null",
  "dayOfWeek": "LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO o null"
}

Texto: "${text}"
Usuario actual: ${user.name}

Fecha y hora actual en Guatemala: ${new Date().toLocaleString("es-GT", {timeZone:"America/Guatemala"})}

Reglas IMPORTANTES:
- La hora que dice el usuario ES la hora de Guatemala. NO la conviertas a UTC ni a otra zona.
- "mañana" = día siguiente
- "pasado mañana" = en 2 días
- "el viernes" = próximo viernes
- Si no se especifica hora, usa 09:00
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
      dueDate: json.dueDate ? normalizeGuatemalaDate(json.dueDate) : undefined,
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
    await sendMessage(newUser.whatsappNumber, `📩 ${fromUser.name} te ha transferido la tarea *${task.title}*\nRazón: ${reason}\n\nAccede al sistema: https://admin.liveproductionsgt.com`);
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

async function listTasksForSelection(userId: string): Promise<string> {
  const tasks = await getPendingTasks(userId);
  if (tasks.length === 0) return "No tienes tareas pendientes.";
  return tasks.map((t, i) => {
    const prio = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🔴" : t.priority === "MEDIA" ? "🟡" : "🟢";
    const status = t.status === "REPROGRAMADA" ? "🟣 Pospuesta" : t.status === "EN_PROCESO" ? "🔄 En proceso" : "📌";
    const due = t.dueDate ? ` → ${new Date(t.dueDate).toLocaleDateString("es-GT", {weekday:"short",day:"numeric"})}` : "";
    return `${i + 1}. ${prio} *${t.title}* ${status}${due}`;
  }).join("\n");
}

async function handleCommand(
  command: string,
  user: { id: string; name: string; role: string }
): Promise<string | null> {
  const cmd = command.toLowerCase().trim().replace(/[áéíóúñ]/g, (c: string) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n" }[c] || c));

  if (cmd.startsWith("completar ") || cmd.startsWith("hecho ") || cmd.startsWith("completado ")) {
    const numStr = cmd.replace(/^(completar|hecho|completado)\s+/i, "").trim();
    const num = parseInt(numStr);
    if (isNaN(num)) return "¿Cuál tarea? Ejemplo: *hecho 3* o *completar 5*";
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas. Elige un número del 1 al ${tasks.length}.`;
    const task = tasks[num - 1];
    await completeTask(task.id, user);
    return `✅ Tarea *${task.title}* completada. ¡Buen trabajo ${user.name}!`;
  }

  if (cmd.startsWith("proceso ") || cmd.startsWith("iniciar ") || cmd.startsWith("en proceso ")) {
    const numStr = cmd.replace(/^(proceso|iniciar|en proceso)\s+/i, "").trim();
    const num = parseInt(numStr);
    if (isNaN(num)) return "¿Cuál tarea? Ejemplo: *proceso 3*";
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas. Elige un número del 1 al ${tasks.length}.`;
    const task = tasks[num - 1];
    await prisma.task.update({ where: { id: task.id }, data: { status: "EN_PROCESO" } });
    return `🔄 Tarea *${task.title}* marcada en proceso.`;
  }

  if (cmd.startsWith("no ") && /^\d+$/.test(cmd.replace("no ", "").trim())) {
    const num = parseInt(cmd.replace("no ", "").trim());
    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas.`;
    const task = tasks[num - 1];
    const reason = "No realizada - sin motivo especificado";
    await prisma.task.update({
      where: { id: task.id },
      data: { status: "REPROGRAMADA", postponeCount: { increment: 1 }, postponeReason: reason },
    });
    await prisma.taskHistory.create({
      data: { taskId: task.id, userId: user.id, action: "NO_REALIZADA", previousStatus: task.status, newStatus: "REPROGRAMADA" },
    });
    const admins = await prisma.user.findMany({ where: { role: { in: ["DUENO", "ADMIN"] } }, select: { name: true, whatsappNumber: true, phone: true } });
    for (const admin of admins) {
      const to = admin.whatsappNumber || admin.phone;
      if (to) {
        const { sendMessage: sendMsg } = await import("@/lib/whatsapp");
        await sendMsg(to, `⚠️ *Tarea No Realizada*\n\n${user.name} marcó como NO realizada la tarea:\n"${task.title}"\n\nMotivo: ${reason}\nSe reprogramó automáticamente.`).catch(() => {});
      }
    }
    return `⚠️ Tarea *${task.title}* marcada como no realizada. Se notificó al administrador. Para dar un motivo usa: *comentar ${num} [motivo]*`;
  }

  if (cmd === "posponer") {
    const tasks = await getPendingTasks(user.id);
    if (tasks.length === 0) return "No tienes tareas pendientes para posponer. ¡Excelente! 🎉";
    const list = await listTasksForSelection(user.id);
    return `¿Cuál tarea quieres posponer? Responde con el número:\n\n${list}\n\nO escribe: *posponer 2 para mañana*`;
  }

  if (cmd.startsWith("posponer ")) {
    const rest = cmd.replace("posponer ", "").trim();
    const parts = rest.split(/\s+/);
    const num = parseInt(parts[0]);
    if (isNaN(num)) return "Formato: *posponer 3* o *posponer 3 para mañana* o *posponer 3 para el viernes a las 3pm el cliente no contestó*";

    const tasks = await getPendingTasks(user.id);
    if (num < 1 || num > tasks.length) return `Solo tienes ${tasks.length} tareas. Elige un número del 1 al ${tasks.length}.`;
    const task = tasks[num - 1];

    const afterNum = rest.slice(parts[0].length).trim();
    const { newDate, reason } = parsePostponeDetails(afterNum);

    const finalDate = newDate || (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d; })();

    await postponeTask(task.id, finalDate, reason, user);

    const dateStr = finalDate.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = finalDate.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
    return `⏰ Tarea *${task.title}* pospuesta para *${dateStr} a las ${timeStr}*.\nRazón: ${reason}\n_Se notificará al administrador._`;
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

  if (cmd === "tareas hoy" || cmd === "hoy" || cmd === "tareas de hoy" || cmd === "tareas para hoy") {
    const tasks = await formatTasksForUser(user.id, "hoy");
    return tasks;
  }
  if (cmd === "tareas semana" || cmd === "semana" || cmd === "tareas esta semana" || cmd === "esta semana" || cmd === "tareas de esta semana") {
    const tasks = await formatTasksForUser(user.id, "semana");
    return tasks;
  }
  if (cmd === "tareas semana 2" || cmd === "semana 2" || cmd === "tareas la proxima semana" || cmd === "tareas la próxima semana" || cmd === "tareas de la proxima semana" || cmd === "tareas de la próxima semana") {
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

  // Consulta dinámica de tareas por fechas (lunes-sábado semana laboral)
  const dynamicTaskMatch =
    /(?:tareas|mis tareas|ver tareas|que tengo|que hay|que tengo para|dame)\b.*?(?:la proxima semana|la semana que viene|la siguiente semana|proxima semana|el proximo mes|el mes que viene)/i.test(cmd) ||
    /(?:tareas|mis tareas|ver tareas|que tengo|que hay|que tengo para)\b.*?\b(para mañana|mañana|el (lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|hoy))\b/i.test(cmd);

  if (dynamicTaskMatch) {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay(); // 0=domingo
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const saturday = new Date(monday); saturday.setDate(monday.getDate() + 5); saturday.setHours(23, 59, 59);
    const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7);
    const nextSaturday = new Date(nextMonday); nextSaturday.setDate(nextMonday.getDate() + 5); nextSaturday.setHours(23, 59, 59);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1); tomorrow.setHours(23, 59, 59);

    const dayNames: Record<string, number> = {
      lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 0,
    };

    let title = "";
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;

    if (/la proxima semana|la semana que viene|la siguiente semana|proxima semana/i.test(cmd)) {
      title = "PRÓXIMA SEMANA";
      dateFrom = nextMonday;
      dateTo = nextSaturday;
    } else if (/el proximo mes|el mes que viene/i.test(cmd)) {
      title = "PRÓXIMO MES";
      dateFrom = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      dateTo = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    } else if (/para mañana|mañana\b/i.test(cmd) && !/el (lunes|martes|...)/i.test(cmd)) {
      title = `MAÑANA - ${tomorrow.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })}`;
      dateFrom = new Date(today); dateFrom.setDate(today.getDate() + 1); dateFrom.setHours(0, 0, 0, 0);
      dateTo = new Date(dateFrom); dateTo.setHours(23, 59, 59);
    } else {
      // Día específico: "el lunes", "el sábado", "hoy"
      let targetDay: number | null = null;
      if (/el lunes/.test(cmd)) targetDay = 1;
      else if (/el martes/.test(cmd)) targetDay = 2;
      else if (/el miercoles|el miércoles/.test(cmd)) targetDay = 3;
      else if (/el jueves/.test(cmd)) targetDay = 4;
      else if (/el viernes/.test(cmd)) targetDay = 5;
      else if (/el sabado|el sábado/.test(cmd)) targetDay = 6;
      else if (/el domingo/.test(cmd)) targetDay = 0;
      else if (/hoy/.test(cmd)) targetDay = dayOfWeek;

      if (targetDay !== null) {
        // Buscar el próximo día de la semana (si hoy es domingo y pide lunes, es mañana)
        let delta = (targetDay - dayOfWeek + 7) % 7;
        if (delta === 0) delta = 7; // si pide el mismo día de hoy, ir a la próxima semana? No - "hoy" es hoy
        if (/hoy/.test(cmd)) delta = 0;
        const targetDate = new Date(today);
        targetDate.setDate(today.getDate() + delta);
        targetDate.setHours(0, 0, 0, 0);
        title = `${targetDate.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })}`;
        dateFrom = new Date(targetDate); dateFrom.setHours(0, 0, 0, 0);
        dateTo = new Date(targetDate); dateTo.setHours(23, 59, 59);
      }
    }

    if (!dateFrom || !dateTo) {
      return "No entendí bien la fecha. Prueba: *tareas para mañana*, *tareas del lunes*, *tareas de la próxima semana*";
    }

    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: user.id,
        status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] },
        dueDate: { gte: dateFrom, lte: dateTo },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    });

    if (tasks.length === 0) {
      return `${user.name}, no tienes tareas para *${title}*. ¡Bien! 🎉`;
    }

    return `📅 *${title}*\n\n${formatTaskList(tasks)}\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
  }

  if (
    cmd === "tareas" || cmd === "mis tareas" || cmd === "ver tareas" ||
    cmd === "muestrame mis tareas" || cmd === "muéstrame mis tareas" ||
    cmd === "quiero ver mis tareas" || cmd === "ver mis tareas" ||
    /^(ver|mostrar|muestra|muéstrame|dame|consultar|listar|revisar)\s+(mis\s+)?tareas/.test(cmd) ||
    (cmd.includes("tarea") && !cmd.startsWith("tareas hoy") && !cmd.startsWith("tareas semana") && !cmd.includes("crea") && !cmd.includes("crear") && !cmd.includes("nueva"))
  ) {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `Hola ${user.name}, no tienes tareas pendientes. ¡Excelente trabajo! 🎉`;
    return tasks;
  }

  if (cmd === "pendientes") {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `${user.name}, no tienes tareas pendientes. ¡Todo al día! ✅`;
    return tasks;
  }

  if (cmd.startsWith("recuerda") || cmd.startsWith("recordar") || cmd.startsWith("recordatorio") ||
      /\b(crea|creame|crear|agenda|programa|programar|pon|ponme|agendar|poner)\s+(un\s+|unos\s+|el\s+|una\s+|las\s+|los\s+)?recordatorio/i.test(cmd) ||
      /mand(a|ame|enme|ele)?\s+(un\s+)?(mensaje|alerta|aviso)/i.test(cmd) ||
      /(avisame|avisame|notifícame|notificame|avísame|avísame)\b/i.test(cmd) ||
      /\b(ponme|pon|manda|mandame)\s+(una|un)\s+(alerta|aviso|recordatorio)\b/i.test(cmd)) {
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

    // Also create as a task so it appears in the system
    await prisma.task.create({
      data: {
        title: `🔔 ${parsed.title}`,
        description: parsed.description || `Recordatorio programado para ${parsed.remindAt.toLocaleString("es-GT")}`,
        assignedToId: parsed.assignToId || user.id,
        assignedById: user.id,
        dueDate: parsed.remindAt,
        priority: "ALTA",
        category: "OTRO",
        type: "DINAMICA",
        frequency: "DIARIA",
        status: "PENDIENTE",
      },
    });

    const targetUser = parsed.assignToId ? await prisma.user.findUnique({ where: { id: parsed.assignToId } }) : null;
    const targetName = targetUser ? targetUser.name : "ti";

    // Notificar a la persona asignada si no es el creador
    if (targetUser && targetUser.id !== user.id) {
      const to = targetUser.whatsappNumber || targetUser.phone;
      if (to) {
        const dateStr = `${parsed.remindAt.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${parsed.remindAt.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;
        await sendMessage(
          to,
          `⏰ *Recordatorio asignado*\n\n${user.name} te dejó un recordatorio:\n*${parsed.title}*\n${parsed.description ? `📝 ${parsed.description}\n` : ""}📅 ${dateStr}\n\nTe avisaré 10 minutos antes y a la hora exacta.`
        ).catch(() => {});
      }
    }

    const dateStr = `${parsed.remindAt.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${parsed.remindAt.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;

    return targetUser && targetUser.id !== user.id
      ? `⏰ Recordatorio creado para *${targetName}*: *${parsed.title}*\n📅 ${dateStr}\n🔔 Notificación enviada a *${targetName}*.\n_Te avisará 10 minutos antes y a la hora exacta._`
      : `⏰ Recordatorio creado para ti: *${parsed.title}*\n📅 ${dateStr}\n🔔 Te avisaré 10 minutos antes y a la hora exacta.`;
  }

  if (cmd.startsWith("crea tarea") || cmd.startsWith("crear tarea")) {
    const details = cmd.replace(/^crea(r)?\s+tarea\s*/i, "").trim();
    if (!details) {
      return "📝 *Nueva Tarea* - Paso 1/5\n¿Qué título le pongo a la tarea?\n\nO escribe todo junto: *crea tarea para Diana revisar cotizaciones mañana 10am*";
    }
    return await handleCreateTask(details, user);
  }

  if (cmd.startsWith("nueva tarea")) {
    const details = cmd.replace(/^nueva\s+tarea\s*/i, "").trim();
    if (!details) {
      return "📝 *Nueva Tarea* - Paso 1/5\n¿Qué título le pongo a la tarea?\n\nO escribe todo junto: *crea tarea para Diana revisar cotizaciones mañana 10am*";
    }
    return await handleCreateTask(details, user);
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

  if (cmd === "inventario" || cmd.startsWith("inventario ")) {
    const isAdmin = user.role === "DUENO" || user.role === "ADMIN" || user.role === "JEFE";
    if (!isAdmin) return "El inventario solo está disponible para dueños, administradores y jefes.";

    const filter = cmd.replace("inventario", "").trim().toLowerCase();
    const categoryMap: Record<string, string> = {
      sonido: "AUDIO", audio: "AUDIO", bocina: "AUDIO", parlante: "AUDIO", microfono: "AUDIO", micro: "AUDIO",
      iluminacion: "ILUMINACION", luz: "ILUMINACION", luces: "ILUMINACION", lampara: "ILUMINACION", led: "ILUMINACION",
      instrumento: "INSTRUMENTO", instrumentos: "INSTRUMENTO", guitarra: "INSTRUMENTO", teclado: "INSTRUMENTO", bateria: "INSTRUMENTO", bajo: "INSTRUMENTO",
      cableado: "CABLEADO", cable: "CABLEADO", cables: "CABLEADO",
      mobiliario: "MOBILIARIO", mesa: "MOBILIARIO", silla: "MOBILIARIO", tarima: "MOBILIARIO", escenario: "MOBILIARIO",
      herramienta: "HERRAMIENTA", herramientas: "HERRAMIENTA",
    };
    const where: any = filter ? { category: categoryMap[filter] || filter.toUpperCase().replace(/[ÁÉÍÓÚ]/g, (c: string) => ({ Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U" }[c] || c)) } : {};

    const items = await prisma.inventoryItem.findMany({
      where,
      orderBy: { category: "asc" },
      take: 30,
      select: { name: true, category: true, quantity: true, status: true, location: true },
    });

    if (items.length === 0) return `No encontré items ${filter ? `de categoría "${filter}"` : "en inventario"}.`;

    const byCategory = new Map<string, any[]>();
    for (const item of items) {
      if (!byCategory.has(item.category)) byCategory.set(item.category, []);
      byCategory.get(item.category)!.push(item);
    }

    let msg = `📦 *Inventario Live Productions*\n\n`;
    let total = 0;
    for (const [cat, catItems] of byCategory) {
      const catQty = catItems.reduce((s: number, i: any) => s + i.quantity, 0);
      total += catQty;
      msg += `*${cat} (${catItems.length} tipos, ${catQty} unidades):*\n`;
      msg += catItems.slice(0, 8).map((i: any) => {
        const s = i.status === "DANADO" ? "⚠️" : i.status === "ASIGNADO" ? "📌" : i.status === "EN_REPARACION" ? "🔧" : "✅";
        return `  ${s} ${i.name} x${i.quantity} (${i.location})`;
      }).join("\n");
      if (catItems.length > 8) msg += `\n  ... y ${catItems.length - 8} más`;
      msg += "\n\n";
    }
    msg += `📊 Total: ${total} items`;
    return msg;
  }

  if (cmd === "vehiculos" || cmd === "vehículos") {
    const isAdmin = user.role === "DUENO" || user.role === "ADMIN" || user.role === "JEFE";
    if (!isAdmin) return "Los vehículos solo están disponibles para dueños, administradores y jefes.";

    const vehicles = await prisma.vehicle.findMany({
      orderBy: { name: "asc" },
      select: { name: true, plate: true, type: true, status: true, fuelLevel: true, assignedTo: { select: { name: true } } },
    });
    if (vehicles.length === 0) return "No hay vehículos registrados.";
    return `🚛 *Vehículos (${vehicles.length})*\n\n${vehicles.map(v => {
      const s = v.status === "DISPONIBLE" ? "✅" : v.status === "EN_USO" ? "🔄" : v.status === "EN_MANTENIMIENTO" ? "🔧" : "⚠️";
      return `${s} *${v.name}* - ${v.plate} (${v.type})${v.fuelLevel ? ` ⛽${v.fuelLevel}%` : ""}${v.assignedTo ? ` → ${v.assignedTo.name}` : ""}`;
    }).join("\n")}`;
  }

  if (cmd === "cobros" || cmd.startsWith("cobros ")) {
    const isAdmin = user.role === "DUENO" || user.role === "ADMIN" || user.role === "JEFE";
    if (!isAdmin) return "Los cobros solo están disponibles para dueños, administradores y jefes.";

    const cobros = await prisma.cobro.findMany({
      where: { status: "PENDIENTE" },
      orderBy: { dueDate: "asc" },
      take: 15,
      select: { clientName: true, amount: true, status: true, dueDate: true, assignedTo: { select: { name: true } }, event: { select: { name: true } } },
    });
    if (cobros.length === 0) return "✅ No hay cobros pendientes. ¡Todo al día!";
    const total = cobros.reduce((s, c) => s + Number(c.amount), 0);
    return `💰 *Cobros Pendientes (${cobros.length})*\n\n${cobros.map(c =>
      `• ${c.clientName}: *Q${Number(c.amount).toFixed(2)}*${c.dueDate ? ` → ${new Date(c.dueDate).toLocaleDateString("es-GT")}` : ""}${c.event ? ` (${c.event.name})` : ""}${c.assignedTo ? ` | ${c.assignedTo.name}` : ""}`
    ).join("\n")}\n\n💵 *Total: Q${total.toFixed(2)}*`;
  }

  if (cmd === "empleados" || cmd === "personal") {
    const empleados = await prisma.user.findMany({
      where: { active: true },
      select: { name: true, role: true, phone: true, email: true },
      orderBy: { name: "asc" },
    });
    return `👥 *Equipo Live Productions (${empleados.length})*\n\n${empleados.map(e =>
      `• *${e.name}* (${e.role})${e.phone ? ` 📞${e.phone.slice(-8)}` : ""}${e.email ? ` 📧${e.email}` : ""}`
    ).join("\n")}`;
  }

  if (cmd === "ranking") {
    const { getComplianceRanking } = await import("@/lib/smart-scheduler");
    const data = await getComplianceRanking();
    const lines = data.rankings.slice(0, 10).map((r, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
      return `${medal} *${r.name}* (${r.role})\n  ✅ ${r.completedTasks}/${r.totalTasks} tareas (${r.compliancePercent}%) | Accesos hoy: ${r.accessCount} | Score: ${r.score}`;
    });
    return `🏆 *Ranking de Cumplimiento*\n\n${lines.join("\n\n")}`;
  }

  if (cmd === "ayuda") {
    return `🤖 *LUNA - Tu Controladora Administrativa*

📊 *Ver tareas:*
tareas
tareas hoy
tareas semana

⚡ *Acciones de tareas (usa el #):*
#1 Completada → hecho 1
#2 En proceso → proceso 1
#3 Posponer para mañana → posponer 1
#4 Transferir → transferir 1 a Diana
#5 Comentar → comentar 1 texto

➕ *Crear tareas:*
crea tarea [título] mañana 10am

⏰ *Recordatorios:*
recuérdame [tarea] mañana 3pm

📈 *Reportes (dueños/gerentes):*
resumen
ranking
cómo va el equipo

🏢 *Sistema:*
inventario
vehiculos
cobros
empleados

🎨 *Colores:*
🟢 Baja | 🟡 Media | 🔴 Alta/Urgente

📞 *Contacto:* +502 3090-3172
🌐 liveproductionsgt.com`;
  }

  return null;
}

async function handleCreateTask(details: string, user: { id: string; name: string }) {
  const parsed = await parseTaskCreation(details, user);
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

  // Notificar al asignado si NO es el mismo que creó
  if (targetUser && targetUser.id !== user.id) {
    const to = targetUser.whatsappNumber || targetUser.phone;
    if (to) {
      const dateStr = task.dueDate
        ? `${task.dueDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${task.dueDate.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`
        : "Sin fecha";
      const prioIcon = task.priority === "URGENTE" ? "🔴" : task.priority === "ALTA" ? "🔴" : task.priority === "MEDIA" ? "🟡" : "🟢";
      await sendMessage(
        to,
        `📋 *Nueva Tarea Asignada*\n\n${prioIcon} *${task.title}*\n👤 Asignada por: ${user.name}\n📅 ${dateStr}\n\nEscribí *tareas* para verla.`
      ).catch(() => {});
    }
  }

  const dateStr = task.dueDate
    ? `${task.dueDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${task.dueDate.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`
    : "Sin fecha";
  const prioIcon = task.priority === "URGENTE" ? "🔴" : task.priority === "ALTA" ? "🔴" : task.priority === "MEDIA" ? "🟡" : "🟢";

  return `✅ Tarea creada para *${targetName}*: "${parsed.title}"\n${prioIcon} Prioridad: ${task.priority}\n📅 ${dateStr}\n🔔 ${targetUser && targetUser.id !== user.id ? `Notificación enviada a *${targetName}*` : "Todo listo"}`;
}

async function handleConversationStep(
  fromNumber: string,
  text: string,
  user: { id: string; name: string; role: string }
): Promise<string | null> {
  const conv = getConversation(fromNumber);
  if (!conv) return null;

  const cmdLower = text.toLowerCase().trim();
  const isBareNumber = /^\d+$/.test(cmdLower);

  if (conv.state === "waiting_postpone" && isBareNumber) {
    conversations.delete(fromNumber);
    const postponeText = "posponer " + text;
    return await handleCommand(postponeText, user);
  }

  if (conv.state === "waiting_postpone") {
    conversations.delete(fromNumber);
    const postponeText = "posponer " + text;
    return await handleCommand(postponeText, user);
  }

  if (conv.state === "postpone_date") {
    const now = new Date();
    const date = parseRelativeDate(text, now);
    if (!date) {
      return "No entendí la fecha. Usa: *mañana*, *viernes*, *lunes próximo*, *el 20 de agosto*.\n\n⏰ *Posponer Tarea*\n¿Para qué día?";
    }
    setConversation(fromNumber, "postpone_time", { ...conv.data, dueDate: date.toISOString() });
    return `⏰ *Posponer Tarea*\n\nDía: ${date.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })}\n\n¿A qué hora?\nEj: *9am*, *3pm*, *en la tarde*`;
  }

  if (conv.state === "postpone_time") {
    let time = parseTimeExpression(text);
    if (!time && /default/i.test(cmdLower)) {
      time = { hours: 9, minutes: 0 };
    }
    if (!time) {
      return "No entendí la hora. Usa: *9am*, *3pm*, *15:00*, o escribe *default*.\n\n⏰ *Posponer Tarea*\n¿A qué hora?";
    }
    const dueDate = new Date(conv.data.dueDate);
    dueDate.setHours(time.hours, time.minutes, 0, 0);
    setConversation(fromNumber, "postpone_reason", { ...conv.data, dueDate: dueDate.toISOString() });
    return `⏰ *Posponer Tarea*\n\nHora: ${time.hours}:${String(time.minutes).padStart(2, "0")}\n\n¿Por qué la pospones? (comentario)\nO escribe *sin motivo*`;
  }

  if (conv.state === "postpone_reason") {
    const reason = /sin\s+motivo/i.test(cmdLower) ? "Sin motivo especificado" : text;
    const dueDate = new Date(conv.data.dueDate);
    await postponeTask(conv.data.taskId, dueDate, reason, user);
    conversations.delete(fromNumber);
    const dateStr = dueDate.toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = dueDate.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
    return `✅ Tarea *${conv.data.taskTitle}* pospuesta para *${dateStr} a las ${timeStr}*.\nMotivo: ${reason}\n_Se notificará al administrador._`;
  }

  if (conv.state === "task_create_title") {
    setConversation(fromNumber, "task_create_person", { title: text });
    return `📝 *Nueva Tarea* - Paso 2/5\n¿Para quién es la tarea? (Ej: Diana, Jorge, Abel...)\nO escribe *para mi* si es para ti.`;
  }

  if (conv.state === "task_create_person") {
    const assignToName = /^para\s+mi$/i.test(cmdLower) ? user.name : text;
    setConversation(fromNumber, "task_create_date", { ...conv.data, assignToName });
    return `📝 *Nueva Tarea* - Paso 3/5\n¿Para qué fecha? (Ej: *mañana*, *viernes*, *lunes próximo*)\n_La hora por defecto será 9:00 AM._`;
  }

  if (conv.state === "task_create_date") {
    const now = new Date();
    const date = parseRelativeDate(text, now);
    if (!date) {
      return "No entendí la fecha. Usa: *mañana*, *viernes*, *lunes próximo*, *el 15 de agosto*, etc.\n\n📝 *Nueva Tarea* - Paso 3/5\n¿Para qué fecha?";
    }
    setConversation(fromNumber, "task_create_time", { ...conv.data, dueDate: date.toISOString() });
    return `📝 *Nueva Tarea* - Paso 4/5\n¿A qué hora? (Ej: *9am*, *3pm*, *en la tarde*)\nO responde *default* para 9:00 AM.`;
  }

  if (conv.state === "task_create_time") {
    let time = parseTimeExpression(text);
    if (!time && /default/i.test(cmdLower)) {
      time = { hours: 9, minutes: 0 };
    }
    if (!time) {
      return "No entendí la hora. Usa: *9am*, *3pm*, *en la mañana*, *en la tarde*, *15:00*, o escribe *default*.\n\n📝 *Nueva Tarea* - Paso 4/5\n¿A qué hora?";
    }

    const dueDate = new Date(conv.data.dueDate);
    dueDate.setHours(time.hours, time.minutes, 0, 0);

    setConversation(fromNumber, "task_create_priority", {
      ...conv.data,
      dueDate: dueDate.toISOString(),
      timeSet: true,
    });
    return `📝 *Nueva Tarea* - Paso 5/5\n¿Prioridad? (ALTA, MEDIA, BAJA)\n_Default: MEDIA_\n\nResponde la prioridad o *crear* para usar MEDIA.`;
  }

  if (conv.state === "task_create_priority") {
    let priority: string = "MEDIA";
    const up = cmdLower.toUpperCase();
    if (up === "ALTA" || up === "BAJA" || up === "MEDIA" || up === "URGENTE") {
      priority = up;
    }

    const data = conv.data;
    conversations.delete(fromNumber);

    let assignToId: string | undefined;
    if (data.assignToName && data.assignToName !== user.name) {
      const target = await prisma.user.findFirst({
        where: { name: { contains: data.assignToName, mode: "insensitive" }, active: true },
      });
      assignToId = target?.id;
    }
    if (!assignToId) assignToId = user.id;

    const dueDate = new Date(data.dueDate);

    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: "",
        assignedToId: assignToId,
        assignedById: user.id,
        dueDate,
        priority: priority as "BAJA" | "MEDIA" | "ALTA" | "URGENTE",
        category: "OTRO",
        type: "DINAMICA",
        frequency: "DIARIA",
        status: "PENDIENTE",
      },
    });

    const targetUser = assignToId !== user.id ? await prisma.user.findUnique({ where: { id: assignToId } }) : null;
    const targetName = targetUser ? targetUser.name : user.name;

    // Notificar al asignado si no es el mismo creador
    if (targetUser && targetUser.id !== user.id) {
      const to = targetUser.whatsappNumber || targetUser.phone;
      if (to) {
        const prioIcon = priority === "URGENTE" || priority === "ALTA" ? "🔴" : priority === "MEDIA" ? "🟡" : "🟢";
        const dateStr = `${dueDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${dueDate.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;
        await sendMessage(
          to,
          `📋 *Nueva Tarea Asignada*\n\n${prioIcon} *${data.title}*\n👤 Asignada por: ${user.name}\n📅 ${dateStr}\n\nEscribí *tareas* para verla.`
        ).catch(() => {});
      }
    }

    return `✅ Tarea creada para *${targetName}*: "${data.title}"\n📅 ${dueDate.toLocaleDateString("es-GT", {timeZone:"America/Guatemala",weekday:"long",day:"numeric",month:"long"})} a las ${dueDate.toLocaleTimeString("es-GT", {timeZone:"America/Guatemala",hour:"2-digit",minute:"2-digit"})}\n🔵 Prioridad: ${priority}\n🔔 ${targetUser && targetUser.id !== user.id ? `Notificación enviada a *${targetName}*` : "Todo listo"}`;
  }

  return null;
}

function isKnownCommand(text: string): boolean {
  const knownCommands = [
    "tareas", "hoy", "semana", "completar", "hecho", "completado", "proceso", "iniciar", "en proceso", "posponer", "comentar",
    "transferir", "crea tarea", "crear tarea", "nueva tarea",
    "recuerda", "recordar", "recordatorio", "evento", "eventos",
    "mandame", "mandame un mensaje", "mándame", "avisame", "avisame", "notificame", "notifícame",
    "equipo", "pendientes", "resumen", "ayuda", "fijas", "mis tareas",
    "que tengo", "que tengo para", "que hay", "tareas para mañana", "tareas del lunes", "tareas de la proxima semana", "tareas de la semana que viene",
    "ranking", "no ",
    "inventario", "vehiculos", "vehículos", "cobros", "empleados", "personal",
  ];
  const lower = text.toLowerCase().trim();
  return knownCommands.some(k => lower.startsWith(k));
}

let cronStarted = false;

export async function POST(request: NextRequest) {
  if (!cronStarted) {
    cronStarted = true;
    const { startCronManager } = await import("@/lib/cron-manager");
    startCronManager();
    console.log("[Webhook] Cron manager iniciado desde webhook");
  }

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

                  const conv = getConversation(normalizedFrom);
                  const isBareNumber = /^\d+$/.test(text.toLowerCase().trim());

                  if (conv && isKnownCommand(text) && !isBareNumber) {
                    conversations.delete(normalizedFrom);
                  }

                  if (conv && !(isKnownCommand(text) && !isBareNumber)) {
                    const convResponse = await handleConversationStep(normalizedFrom, text, user);
                    if (convResponse) {
                      const sendResult = await sendMessage(fromNumber, convResponse);

                      await prisma.whatsAppMessage.create({
                        data: {
                          userId: user.id,
                          toNumber: fromNumber,
                          message: `[RECIBIDO CONV] ${text}`,
                          type: "CHAT",
                          status: "DELIVERED",
                        },
                      });

                      await prisma.whatsAppMessage.create({
                        data: {
                          userId: user.id,
                          toNumber: fromNumber,
                          message: `[RESPUESTA CONV] ${convResponse.slice(0, 500)}`,
                          type: "CHAT",
                          status: sendResult ? "SENT" : "FAILED",
                        },
                      });

                      await prisma.activity.create({
                        data: {
                          userId: user.id,
                          action: "WHATSAPP_COMMAND",
                          resource: "WHATSAPP",
                          details: `Conversación interactiva: "${text}" por ${user.name} (${fromNumber})`,
                        },
                      });

                      return NextResponse.json(
                        { success: true, message: "Webhook procesado exitosamente" },
                        { status: 200 }
                      );
                    }
                  }

                  // Posponer interactivo: "posponer N" sin fecha → wizard
                  const postponeBare = text.toLowerCase().trim().match(/^posponer\s+(\d+)$/i);
                  if (postponeBare) {
                    const tasks = await getPendingTasks(user.id);
                    const num = parseInt(postponeBare[1]);
                    if (num >= 1 && num <= tasks.length) {
                      const task = tasks[num - 1];
                      setConversation(normalizedFrom, "postpone_date", { taskId: task.id, taskTitle: task.title });
                      const msg = `⏰ *Posponer Tarea #${num}*\n\n*${task.title}*\n\n¿Para qué día quieres posponerla?\nEj: *mañana*, *viernes*, *lunes próximo*, *el 20 de agosto*`;
                      await sendMessage(fromNumber, msg);
                      return NextResponse.json({ success: true, message: "Wizard posponer iniciado" });
                    }
                  }

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

                    const cmdLower = text.toLowerCase().trim();
                    if (cmdLower === "posponer") {
                      setConversation(normalizedFrom, "waiting_postpone", {});
                    } else if (["crea tarea", "crear tarea", "nueva tarea"].includes(cmdLower)) {
                      setConversation(normalizedFrom, "task_create_title", {});
                    }
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
