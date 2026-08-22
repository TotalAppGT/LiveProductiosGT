import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppMessage, askAI, AI_ERROR_MESSAGE } from "@/lib/ai-brain";
import { sendMessage, sendInteractiveButtons } from "@/lib/whatsapp";
import { normalizeGTPhone } from "@/lib/phone";
import { taskPhasePriority, orderTasksByDayHour, formatTaskLine, groupTasksByDayText, formatTaskDigest } from "@/lib/task-view";
import { getGuatemalaWallClock, gtStartOfToday, gtEndOfToday, applyGuatemalaTime, guatemalaDate, isTaskDueOnDate, weekdayNameOf, nextFixedDueDate } from "@/lib/task-utils";
import { sendLUNAUpdateBroadcast } from "@/lib/broadcast";

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

  // Normalizar los minutos al múltiplo de 5 más cercano (00,05,10,...55)
  // para que las alertas del cron y los recordatorios se disparen bien.
  const roundToFive = (h: number, m: number): { hours: number; minutes: number } => {
    const rounded = Math.round(m / 5) * 5;
    if (rounded >= 60) {
      return { hours: (h + 1) % 24, minutes: 0 };
    }
    return { hours: h, minutes: rounded };
  };

  const time24 = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (time24) {
    const hours = parseInt(time24[1]);
    const minutes = parseInt(time24[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return roundToFive(hours, minutes);
    }
  }

  const time12 = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (time12) {
    let hours = parseInt(time12[1]);
    const minutes = time12[2] ? parseInt(time12[2]) : 0;
    const meridian = time12[3];
    if (/pm|p\.m\./i.test(meridian) && hours < 12) hours += 12;
    if (/am|a\.m\./i.test(meridian) && hours === 12) hours = 0;
    return roundToFive(hours, minutes);
  }

  if (/\ben la mañana\b|\btemprano\b/.test(t)) return { hours: 8, minutes: 0 };
  if (/\ben la tarde\b/.test(t)) return { hours: 15, minutes: 0 };
  if (/\ben la noche\b/.test(t)) return { hours: 19, minutes: 0 };
  if (/\bmedio\s*d[ií]a\b/.test(t)) return { hours: 12, minutes: 0 };

  // Número suelto con "a las"/"a la"/"para las": "a las 3", "a la 1", "para las 8", "a las 15"
  // Regla: 1-7 → PM (tarde), 8-12 → AM (mañana), 12 → mediodía, 13-23 → 24h directo.
  // Si viene seguido de "de la tarde/noche" → PM; "de la mañana" → AM.
  const bare = t.match(/(?:a\s+las?\s+|para\s+las?\s+|a\s+la\s+)(\d{1,2})\b/i);
  if (bare) {
    let hours = parseInt(bare[1]);
    if (hours >= 1 && hours <= 23) {
      const after = t.slice(bare.index! + bare[0].length);
      if (/de\s+la\s+(tarde|noche)/.test(after)) {
        if (hours < 12) hours += 12;
        return roundToFive(hours, 0);
      }
      if (/de\s+la\s+mañana/.test(after)) {
        if (hours === 12) hours = 0;
        return roundToFive(hours, 0);
      }
      // Número suelto sin especificar: 1-7 → PM (tarde), 8-12 → AM (mañana)
      if (hours <= 7) hours += 12;
      return roundToFive(hours, 0);
    }
  }

  return null;
}

// Redondear una fecha a los minutos en múltiplos de 5 (00,05,10,...55) — hora de Guatemala
function normalizeToFive(date: Date): Date {
  const d = new Date(date);
  const w = getGuatemalaWallClock(d);
  const rounded = Math.round(w.minute / 5) * 5;
  return applyGuatemalaTime(d, w.hour, rounded);
}

function parseRelativeDate(text: string, referenceDate: Date): Date | null {
  const t = text.toLowerCase().trim();
  const ref = new Date(referenceDate);

  // Componentes de fecha en hora de Guatemala (para que "mañana"/"lunes" caigan en el día correcto de Guatemala)
  const refGT = new Date(ref.getTime() - 6 * 60 * 60 * 1000);
  const base = Date.UTC(refGT.getUTCFullYear(), refGT.getUTCMonth(), refGT.getUTCDate());
  const refDay = new Date(base).getUTCDay();

  // Construir un Date a las 09:00 de Guatemala (instante absoluto correcto)
  const at9 = (dayUtc: number) => new Date(dayUtc + 9 * 60 * 60 * 1000 + 6 * 60 * 60 * 1000);

  if (/\bhoy\b/.test(t)) {
    return at9(base);
  }

  if (/\bpasado\s*mañana\b/.test(t)) {
    return at9(base + 2 * 24 * 60 * 60 * 1000);
  }

  if (/\bmañana\b/.test(t) && !/\ben la mañana\b/.test(t)) {
    return at9(base + 1 * 24 * 60 * 60 * 1000);
  }

  // Fechas más adelante: "dentro de N días" / "en N días" / "en N semanas" / "dentro de N semanas"
  const relDays = t.match(/\b(?:dentro\s+de|en)\s+(\d{1,3})\s+d[ií]as?\b/);
  if (relDays) {
    const n = parseInt(relDays[1], 10);
    if (!isNaN(n) && n > 0 && n <= 365) return at9(base + n * 24 * 60 * 60 * 1000);
  }
  const relWeeks = t.match(/\b(?:dentro\s+de|en)\s+(\d{1,2})\s+semanas?\b/);
  if (relWeeks) {
    const n = parseInt(relWeeks[1], 10);
    if (!isNaN(n) && n > 0 && n <= 52) return at9(base + n * 7 * 24 * 60 * 60 * 1000);
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
      let daysUntil = dayNum - refDay;
      if (daysUntil <= 0) daysUntil += 7;
      if (/\bpr[oó]ximo\b/.test(t)) {
        daysUntil += 7;
      }
      return at9(base + daysUntil * 24 * 60 * 60 * 1000);
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
      let date = parseRelativeDate(fullDateStr, now);

      if (date) {
        const time = parseTimeExpression(fullDateStr);
        if (time) {
          date = applyGuatemalaTime(date, time.hours, time.minutes);
        }
        const reason = afterDate.slice(consumedAfterDate).trim();
        return { newDate: date, reason: reason || "Sin razón especificada" };
      }
    }
  }

  return { newDate: null, reason: t || "Sin razón especificada" };
}

async function formatTasksForUser(userId: string, period?: string) {
  const w = getGuatemalaWallClock();
  const todayStart = gtStartOfToday();
  const todayEnd = gtEndOfToday();

  // Semana laboral (LUNES a SÁBADO) en hora de Guatemala
  const dayOfWeek = w.weekday; // 0=domingo
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(todayStart.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000 + (23 * 60 + 59) * 60 * 1000 + 999);

  const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextSunday = new Date(sunday.getTime() + 7 * 24 * 60 * 60 * 1000);

  const thirdMonday = new Date(monday.getTime() + 14 * 24 * 60 * 60 * 1000);
  const thirdSunday = new Date(sunday.getTime() + 14 * 24 * 60 * 60 * 1000);

  const allTasks = await prisma.task.findMany({
    where: { assignedToId: userId, status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] } },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take: 200,
  });

  const todayTasks = allTasks.filter(t => isTaskDueOnDate(t, todayStart));
  const thisWeekTasks = allTasks.filter(t => t.dueDate && new Date(t.dueDate) > todayEnd && new Date(t.dueDate) >= monday && new Date(t.dueDate) <= sunday);
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
    output = `📋 *HOY - ${todayStart.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday:"long",day:"numeric",month:"long" })}*\n\n`;
    const orderedToday = orderTasksForDisplay(todayTasks);
    output += formatTaskList(orderedToday);
    saveTaskView(userId, orderedToday);
    output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
    return output;
  }

  if (period === "semana") {
    output = `📅 *ESTA SEMANA* (${monday.toLocaleDateString("es-GT")} - ${sunday.toLocaleDateString("es-GT")})\n\n`;
    const weekAll = [...thisWeekTasks, ...todayTasks].filter((t, i, arr) => arr.indexOf(t) === i);
    if (weekAll.length > 0) output += groupTasksByDay(weekAll);
    output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
    return output || "No hay tareas esta semana.";
  }

  if (period === "semana2") {
    output = `📅 *PRÓXIMA SEMANA* (${nextMonday.toLocaleDateString("es-GT")} - ${nextSunday.toLocaleDateString("es-GT")})\n\n`;
    if (nextWeekTasks.length > 0) output += groupTasksByDay(nextWeekTasks);
    output += `\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
    return output || "No hay tareas para la próxima semana.";
  }

  output = `📋 *Tus Tareas*\n\n`;

  // Prioridad: semana a semana (esta → próxima → siguiente), agrupado por día
  // Números continuos para que los comandos (#) coincidan con lo mostrado
  const thisWeekAll = [...todayTasks, ...thisWeekTasks].filter((t, i, arr) => arr.indexOf(t) === i);
  const weekBlocks: { label: string; tasks: any[] }[] = [];
  if (thisWeekAll.length > 0) weekBlocks.push({ label: `ESTA SEMANA (${monday.toLocaleDateString("es-GT", { day: "numeric", month: "short" })} - ${sunday.toLocaleDateString("es-GT", { day: "numeric", month: "short" })})`, tasks: thisWeekAll });
  if (nextWeekTasks.length > 0) weekBlocks.push({ label: `PRÓXIMA SEMANA (${nextMonday.toLocaleDateString("es-GT", { day: "numeric", month: "short" })} - ${nextSunday.toLocaleDateString("es-GT", { day: "numeric", month: "short" })})`, tasks: nextWeekTasks });
  if (thirdWeekTasks.length > 0) weekBlocks.push({ label: `SIGUIENTE SEMANA (${thirdMonday.toLocaleDateString("es-GT", { day: "numeric", month: "short" })} - ${thirdSunday.toLocaleDateString("es-GT", { day: "numeric", month: "short" })})`, tasks: thirdWeekTasks });

  const blocks: string[] = [];
  let runningNum = 1;
  const orderedForView: any[] = [];
  for (const wb of weekBlocks) {
    const ordered = orderTasksForDisplay(wb.tasks);
    orderedForView.push(...ordered);
    blocks.push(`📅 *${wb.label}*\n${groupTasksByDay(ordered, runningNum)}`);
    runningNum += ordered.length;
  }
  if (blocks.length > 0) {
    output += blocks.join("\n\n") + "\n\n";
    // Guardar la lista para que los comandos por # operen sobre lo que el usuario vio
    saveTaskView(userId, orderedForView);
  }

  const hasFixed = Object.values(fixedByDay).some((arr) => arr.length > 0);
  if (hasFixed) {
    output += `📌 *ACTIVIDADES FIJAS*\n`;
    const fixedOrdered: any[] = [];
    for (const day of ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]) {
      if (fixedByDay[day] && fixedByDay[day].length > 0) {
        const od = orderTasksForDisplay(fixedByDay[day]);
        output += `${formatTaskList(od, runningNum)}\n`;
        fixedOrdered.push(...od);
        runningNum += od.length;
      }
    }
    if (fixedOrdered.length > 0) orderedForView.push(...fixedOrdered);
    output += "\n";
  }
  if (orderedForView.length > 0) saveTaskView(userId, orderedForView);

  output += `\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer mañana\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar\n\n📋 *Ver:* \`tareas hoy\` | \`tareas semana\` | \`tareas mes\` | \`ayuda\``;
  return output;
}

function orderTasksForDisplay(tasks: any[]): any[] {
  return orderTasksByDayHour(tasks);
}

function groupTasksByDay(tasks: any[], startNum: number = 1): string {
  return groupTasksByDayText(tasks, startNum);
}

function formatTaskList(tasks: any[], startNum: number = 1): string {
  return tasks.map((t, i) => formatTaskLine(t, startNum + i)).join("\n");
}

function parseReminderLocal(text: string, user: { id: string; name: string }) {
  const t = text.toLowerCase().trim();

  // Detectar a quién va asignado
  let assignToName: string | null = null;
  const assignMatch = t.match(/(?:recu[ée]rdale|recu[ée]rdale\s*a|m[aá]ndale|m[aá]ndale\s*un\s*mensaje\s*a|para|a)\s+([a-záéíóúñ]+)\b/i);
  const toMe = /(recu[ée]rdame|m[aá]ndame|av[íi]same|notif[íi]came|env[íi]ame|hazme|h[aá]zme|hacerme|ag[ée]ndame|creame|cr[ée]ame)/i.test(t);
  if (assignMatch && !toMe) {
    const candidate = assignMatch[1].replace(/^a\s+|^para\s+/i, "");
    if (!/mensaje|recordatorio|nota|alerta|aviso/i.test(candidate)) {
      assignToName = candidate;
    }
  }

  // Fecha/hora (todo en hora de Guatemala)
  const time = parseTimeExpression(t);
  let date = parseRelativeDate(t, new Date());

  if (!date) {
    // "a las 8 am mañana" → tiempo y mañana (base real en Guatemala)
    let base = gtStartOfToday();
    if (/\bpasado\s*mañana\b/.test(t)) base = new Date(base.getTime() + 2 * 24 * 60 * 60 * 1000);
    else if (/\bmañana\b/.test(t) && !/\ben la mañana\b/.test(t)) base = new Date(base.getTime() + 1 * 24 * 60 * 60 * 1000);
    date = applyGuatemalaTime(base, time?.hours ?? 9, time?.minutes ?? 0);
  } else if (time) {
    date = applyGuatemalaTime(date, time.hours, time.minutes);
  }

  // Título: quitar prefijos de comando y asignación
  let title = text
    .replace(/(recu[ée]rdame|recu[ée]rdale|m[aá]ndame\s+un\s+mensaje|m[aá]ndame|m[aá]ndale\s+un\s+mensaje|m[aá]ndale|av[íi]same|notif[íi]came|env[íi]ame|hazme\s*(un\s+)?|h[aá]zme\s*(un\s+)?|hacerme\s*(un\s+)?|ag[ée]ndame\s*(un\s+)?|creame\s*(un\s+)?|por\s+fa\s+)/gi, "")
    .replace(/\b(recordatorio|recordar|recu[ée]rdame|recordarme)\b/gi, "")
    .replace(/\b(para|a)\s+[a-záéíóúñ]+\b/gi, "")
    .replace(/\b(a\s+las\s+\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?|a\s+las|hoy|mañana|manana|pasado\s+mañana|en\s+la\s+mañana|en\s+la\s+tarde|en\s+la\s+noche|al\s+mediod[ií]a)\b/gi, "")
    .replace(/\b(a\s+las\s+)?\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/gi, "")
    .replace(/\botro\s+d[ií]a\b/gi, "")
    .replace(/[.,;]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!title) title = "Recordatorio";
  // Normalizar primera letra mayúscula
  title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, description: null, remindAt: date, assignToName };
}

async function parseReminderFromText(text: string, user: { id: string; name: string }) {
  try {
    let response = await askAI([{
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

    if (response === AI_ERROR_MESSAGE) {
      response = await askAI([{
        role: "user",
        content: `Extrae del texto "${text}" un recordatorio y devuelve SOLO JSON con: title, description, remindAt (YYYY-MM-DDTHH:mm:ss hora de Guatemala), assignToName (o null). Si dice "recuérdame"/"mándame" el asignado es null. Usuario: ${user.name}. Hoy en Guatemala: ${new Date().toLocaleString("es-GT", {timeZone:"America/Guatemala"})}. Si no hay hora usa 09:00. Sin markdown.`
      }], { responseFormat: "json", temperature: 0, maxTokens: 300 });
    }

    const json = JSON.parse(response.replace(/```json|```/g, "").trim());
    const remindAt = normalizeToFive(normalizeGuatemalaDate(json.remindAt));

    let assignToId: string | undefined;
    if (json.assignToName) {
      const target = await prisma.user.findFirst({
        where: { name: { contains: json.assignToName, mode: "insensitive" }, active: true },
      });
      assignToId = target?.id;
    }

    return { title: json.title, description: json.description, remindAt, assignToId };
  } catch {
    // Fallback local: parsear hora/fecha/título sin depender de la IA
    try {
      const parsed = parseReminderLocal(text, user);
      let assignToId: string | undefined;
      if (parsed.assignToName) {
        const target = await prisma.user.findFirst({
          where: { name: { contains: parsed.assignToName, mode: "insensitive" }, active: true },
        });
        assignToId = target?.id;
      }
      return { title: parsed.title, description: parsed.description, remindAt: parsed.remindAt, assignToId };
    } catch {
      return null;
    }
  }
}

async function parseTaskCreation(text: string, user: { id: string; name: string }) {
  try {
    let response = await askAI([{
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

    if (response === AI_ERROR_MESSAGE) {
      response = await askAI([{
        role: "user",
        content: `Crea una tarea a partir de "${text}" y devuelve SOLO JSON con: title, description, assignToName (o null), dueDate (YYYY-MM-DDTHH:mm:ss hora de Guatemala o null), priority (BAJA|MEDIA|ALTA|URGENTE), isFixed, frequency (DIARIA|SEMANAL|MENSUAL o null), dayOfWeek (o null). Usuario: ${user.name}. Hoy en Guatemala: ${new Date().toLocaleString("es-GT", {timeZone:"America/Guatemala"})}. Si no hay hora usa 09:00. Sin markdown.`
      }], { responseFormat: "json", temperature: 0, maxTokens: 400 });
    }

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
      dueDate: json.dueDate ? normalizeToFive(normalizeGuatemalaDate(json.dueDate)) : undefined,
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
  const w = getGuatemalaWallClock(now);
  const events = await prisma.event.findMany({
    where: {
      date: { gte: guatemalaDate(w.year, w.month, w.day - 1) },
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
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take: 30,
  });
}

// Guardar la lista que el usuario vio por última vez para que los comandos por # funcionen bien
const lastViewTasks = new Map<string, { ids: string[]; expires: number }>();

function saveTaskView(userId: string, tasks: { id: string }[]) {
  lastViewTasks.set(userId, { ids: tasks.map((t) => t.id), expires: Date.now() + 30 * 60 * 1000 });
}

// Digest ordenado de tareas próximas de un usuario (para notificaciones)
async function getOrderedTaskDigest(userId: string): Promise<string> {
  const today = gtStartOfToday();
  const end = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000 + (23 * 60 + 59) * 60 * 1000 + 999);
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: userId,
      status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] },
      dueDate: { gte: today, lte: end },
    },
    orderBy: { dueDate: "asc" },
    take: 15,
  });
  if (tasks.length === 0) return "";
  return formatTaskDigest(tasks);
}

// 🛒 COMPRAS
async function getMyPurchases(userId: string) {
  return prisma.purchase.findMany({
    where: { assignedToId: userId, status: "PENDIENTE" },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 20,
  });
}

async function listPurchases(userId: string): Promise<string> {
  const purchases = await prisma.purchase.findMany({
    where: { status: "PENDIENTE" },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    take: 30,
    include: { assignedTo: { select: { name: true } } },
  });

  if (purchases.length === 0) return "🛒 No hay compras pendientes. ¡Todo cubierto!";

  const lines = purchases.map((p, i) => {
    const prio = p.priority === "URGENTE" || p.priority === "ALTA" ? "🔴" : p.priority === "MEDIA" ? "🟡" : "🟢";
    const due = p.dueDate ? ` → ${new Date(p.dueDate).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "short", day: "numeric" })}` : "";
    const quien = p.assignedTo ? ` (${p.assignedTo.name.split(" ")[0]})` : "";
    const monto = p.amount ? ` - Q${Number(p.amount).toFixed(2)}` : "";
    return `${i + 1}. ${prio} 🛒 *${p.title}*${quien}${monto}${due}`;
  }).join("\n");

  return `🛒 *COMPRAS PENDIENTES*\n\n${lines}\n\n⚡ *Acciones:*\n*comprado 1* → marcar comprado\n*compra [qué] para [quién] [cuándo]* → nueva compra`;
}

async function createPurchaseFromText(details: string, user: { id: string; name: string; role: string }) {
  // Usar IA para extraer título, asignado, fecha, monto
  let parsed: { title: string; assignToName: string | null; dueDate: Date | null; amount: number | null } | null = null;
  try {
    const response = await askAI([{
      role: "user",
      content: `Extrae de este texto en español los datos de una COMPRA. Devuelve SOLO JSON:
{
  "title": "qué se va a comprar (corto)",
  "assignToName": "nombre de persona encargada de comprar o null",
  "dueDate": "YYYY-MM-DDTHH:mm:ss en hora LOCAL Guatemala o null",
  "amount": numero o null
}
Texto: "${details}"
Usuario: ${user.name}
Fecha/hora actual Guatemala: ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}
- "mañana" = día siguiente, "el viernes" = próximo viernes
- Si no especifica quién compra, assignToName = null
- La hora es de Guatemala, no convertir a UTC
Responde SOLO JSON sin markdown.`
    }], { responseFormat: "json", temperature: 0.1, maxTokens: 300 });
    const json = JSON.parse(response.replace(/```json|```/g, "").trim());
    parsed = {
      title: json.title || details,
      assignToName: json.assignToName || null,
      dueDate: json.dueDate ? normalizeGuatemalaDate(json.dueDate) : null,
      amount: json.amount ? Number(json.amount) : null,
    };
  } catch {
    parsed = null;
  }

  // Fallback local
  if (!parsed) {
    const time = parseTimeExpression(details);
    let date = parseRelativeDate(details, new Date());
    if (!date) {
      date = gtStartOfToday();
      if (time) date = applyGuatemalaTime(date, time.hours, time.minutes);
      else date = applyGuatemalaTime(date, 9, 0);
    } else if (time) {
      date = applyGuatemalaTime(date, time.hours, time.minutes);
    }
    let title = details.replace(/\b(a\s+las\s+)?\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/gi, "")
      .replace(/\b(hoy|mañana|manana|pasado\s+mañana|el\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/gi, "")
      .replace(/\bpara\s+[a-záéíóúñ]+\b/gi, "").replace(/[.,;]+$/, "").replace(/\s{2,}/g, " ").trim();
    if (!title) title = details;
    parsed = { title: title.charAt(0).toUpperCase() + title.slice(1), assignToName: null, dueDate: date, amount: null };
  }

  let assignToId: string | undefined;
  if (parsed.assignToName) {
    const target = await prisma.user.findFirst({
      where: { name: { contains: parsed.assignToName, mode: "insensitive" }, active: true },
    });
    assignToId = target?.id;
  }
  if (!assignToId) assignToId = user.id;

  const purchase = await prisma.purchase.create({
    data: {
      title: parsed.title,
      description: "",
      amount: parsed.amount,
      dueDate: parsed.dueDate,
      priority: "MEDIA",
      status: "PENDIENTE",
      assignedToId: assignToId,
      assignedById: user.id,
    },
    include: { assignedTo: { select: { id: true, name: true, whatsappNumber: true, phone: true } } },
  });

  const targetName = purchase.assignedTo ? purchase.assignedTo.name : user.name;
  const dateStr = purchase.dueDate
    ? `${purchase.dueDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })}${getGuatemalaWallClock(purchase.dueDate).hour !== 9 ? ` a las ${purchase.dueDate.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}` : ""}`
    : "Sin fecha";

  // Notificar si es para otra persona
  if (purchase.assignedTo && purchase.assignedTo.id !== user.id) {
    const to = purchase.assignedTo.whatsappNumber || purchase.assignedTo.phone;
    if (to) {
      await sendMessage(
        to,
        `🛒 *Nueva Compra Asignada*\n\n*${purchase.title}*\n👤 Asignada por: ${user.name}\n📅 ${dateStr}${purchase.amount ? `\n💵 Monto: Q${Number(purchase.amount).toFixed(2)}` : ""}\n\nCuando la compres escribe *comprado* para marcarla.`
      ).catch(() => {});
    }
  }

  return `🛒 Compra registrada para *${targetName}*: "${purchase.title}"\n📅 ${dateStr}${purchase.amount ? `\n💵 Q${Number(purchase.amount).toFixed(2)}` : ""}\n🔔 ${purchase.assignedTo && purchase.assignedTo.id !== user.id ? `Notificación enviada a *${targetName}*` : "Todo listo"}`;
}

async function resolveTaskByNumber(userId: string, num: number) {
  const view = lastViewTasks.get(userId);
  if (view && Date.now() < view.expires && num >= 1 && num <= view.ids.length) {
    const id = view.ids[num - 1];
    const t = await prisma.task.findUnique({ where: { id } });
    if (t) return t;
  }
  const tasks = await getPendingTasks(userId);
  if (num < 1 || num > tasks.length) return null;
  return tasks[num - 1];
}

// Extrae números de un texto como "1 2 3", "1, 2 y 3", "1 y 2", "hecho 1 hecho 2"
function extractNumbers(text: string): number[] {
  // Quitar palabras "y" y separadores, dejar solo números y espacios
  const cleaned = text
    .replace(/\b(y|e|hecho|hechos|completar|completado|completada|completadas|proceso|posponer|transferir|comentar|no)\b/gi, " ")
    .replace(/[,\/]/g, " ");
  const matches = cleaned.match(/\d+/g);
  if (!matches) return [];
  const nums = matches.map((m) => parseInt(m)).filter((n) => !isNaN(n) && n > 0);
  return Array.from(new Set(nums));
}

async function completeTask(taskId: string, user: { id: string; name: string }) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tarea no encontrada");

  // VARIABLES (Actividades diarias): se BORRAN al completarlas.
  // No vuelven la próxima semana; se agregan de nuevo si se necesitan.
  const isReminderTask = task.title.startsWith("🔔");
  const isVariable = task.type === "DINAMICA" && task.category === "OTRO" && !isReminderTask;
  if (isVariable) {
    await prisma.activity.create({
      data: { userId: user.id, action: "TASK_COMPLETED_WHATSAPP", resource: "TASK", resourceId: taskId, details: `Variable "${task.title}" completada y eliminada por ${user.name}` },
    });
    await prisma.task.delete({ where: { id: taskId } });
    return;
  }

  await prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETADA" } });
  await prisma.taskHistory.create({
    data: { taskId, userId: user.id, action: "COMPLETADA via WhatsApp", previousStatus: task.status, newStatus: "COMPLETADA" },
  });
  await prisma.activity.create({
    data: { userId: user.id, action: "TASK_COMPLETED_WHATSAPP", resource: "TASK", resourceId: taskId, details: `Tarea completada via WhatsApp por ${user.name}` },
  });

  // FIJAS: regenerar la próxima ocurrencia al completarlas
  if (task.type === "FIJA") {
    const nextDue = nextFixedDueDate(task);
    await prisma.task.create({
      data: {
        title: task.title,
        description: task.description,
        type: "FIJA",
        frequency: task.frequency,
        dayOfWeek: task.dayOfWeek,
        dueDate: nextDue,
        priority: task.priority,
        category: task.category,
        assignedToId: task.assignedToId,
        assignedById: task.assignedById || user.id,
        status: "PENDIENTE",
      },
    });
  }
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
  const w = getGuatemalaWallClock();
  const thirtyDaysAgo = new Date(Date.UTC(w.year, w.month - 1, w.day - 30));

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

// 📅 Reunión: crear recordatorio para varias personas por nombre y notificarlas
async function handleMeetingCommand(cmd: string, user: { id: string; name: string; role: string }) {
  // Extraer nombres: "reunión con Diana y Abel mañana a las 8 am" / "junta para Jorge, Diana y Abel el viernes 3pm"
  const nameRegex = /(?:con|para)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]+(?:\s+y\s+[a-záéíóúñA-ZÁÉÍÓÚÑ]+)*)/i;
  const nameMatch = cmd.match(nameRegex);
  if (!nameMatch) {
    return "Para crear una reunión necesito saber con quién. Ejemplo: *hacer reunión con Diana y Abel mañana a las 8am*";
  }

  // Separar nombres por "y" o ","
  const namesRaw = nameMatch[1].replace(/,\s*y\s+/gi, " y ").replace(/,\s+/gi, " y ").split(/\s+y\s+/i).map((n) => n.trim()).filter(Boolean);
  if (namesRaw.length === 0) return "No entendí los nombres. Ejemplo: *reunión con Diana y Abel mañana a las 8am*";

  // El nombre de la persona puede ser compuesto (ej: "Jorge Mérida") → intentar coincidir por nombre o apellido
  const allUsers = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, whatsappNumber: true, phone: true },
  });

  const targets: { id: string; name: string; to?: string | null }[] = [];
  for (const raw of namesRaw) {
    const normalized = raw.toLowerCase();
    const match = allUsers.find(
      (u) =>
        u.name.toLowerCase() === normalized ||
        u.name.toLowerCase().includes(normalized) ||
        normalized.includes(u.name.toLowerCase().split(" ")[0])
    );
    if (match) targets.push({ id: match.id, name: match.name, to: match.whatsappNumber || match.phone });
  }

  if (targets.length === 0) {
    return `No encontré a ninguna de esas personas. Usa *equipo* para ver los nombres registrados.`;
  }

  // Extraer fecha/hora (reutilizando parseadores locales) — todo en hora de Guatemala
  const time = parseTimeExpression(cmd);
  const gtTodayStart = gtStartOfToday();
  let meetDate: Date | null = null;

  if (/\bpasado\s*mañana\b/.test(cmd)) {
    meetDate = new Date(gtTodayStart.getTime() + 2 * 24 * 60 * 60 * 1000);
  } else if (/\bmañana\b/.test(cmd) && !/\ben la mañana\b/.test(cmd)) {
    meetDate = new Date(gtTodayStart.getTime() + 1 * 24 * 60 * 60 * 1000);
  } else if (/\bhoy\b/.test(cmd)) {
    meetDate = new Date(gtTodayStart);
  } else if (/\ben la tarde\b/.test(cmd) && !time) {
    meetDate = new Date(gtTodayStart);
  } else if (/\ben la noche\b/.test(cmd) && !time) {
    meetDate = new Date(gtTodayStart);
  } else {
    meetDate = parseRelativeDate(cmd, new Date());
  }

  if (!meetDate) meetDate = new Date(gtTodayStart);
  if (time) {
    meetDate = applyGuatemalaTime(meetDate, time.hours, time.minutes);
  } else if (!/en la (mañana|tarde|noche)/.test(cmd)) {
    meetDate = applyGuatemalaTime(meetDate, 9, 0);
  } else if (/en la mañana/.test(cmd)) {
    meetDate = applyGuatemalaTime(meetDate, 9, 0);
  } else if (/en la tarde/.test(cmd)) {
    meetDate = applyGuatemalaTime(meetDate, 15, 0);
  } else if (/en la noche/.test(cmd)) {
    meetDate = applyGuatemalaTime(meetDate, 19, 0);
  }

  const title = `📅 Reunión con ${targets.map((t) => t.name).join(" y ")}`;
  const dateStr = `${meetDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${meetDate.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;

  const created: string[] = [];
  for (const target of targets) {
    // Recordatorio para cada involucrado
    await prisma.reminder.create({
      data: {
        title,
        description: `Reunión agendada por ${user.name} para ${dateStr}.`,
        remindAt: meetDate,
        createdById: user.id,
        assignedToId: target.id,
      },
    });
    await prisma.task.create({
      data: {
        title: `🔔 ${title}`,
        description: `Reunión agendada por ${user.name} para ${dateStr}.`,
        assignedToId: target.id,
        assignedById: user.id,
        dueDate: meetDate,
        priority: "ALTA",
        category: "OTRO",
        type: "DINAMICA",
        frequency: "DIARIA",
        status: "PENDIENTE",
      },
    });
    // Notificar a cada persona
    if (target.to && target.id !== user.id) {
      await sendMessage(
        target.to,
        `📅 *Reunión Agendada*\n\n${title}\n👤 Agendada por: ${user.name}\n🕐 ${dateStr}\n\nTe avisaré 10 minutos antes.`
      ).catch(() => {});
    }
    created.push(target.name);
  }

  return `📅 *Reunión agendada*\n\n${title}\n🕐 ${dateStr}\n\n👥 Involucrados (${created.length}): ${created.join(", ")}\n🔔 Se les envió notificación a cada uno.\n_Te avisaré a todos 10 minutos antes._`;
}

async function handleCommand(
  command: string,
  user: { id: string; name: string; role: string },
  fromNumber?: string
): Promise<string | null> {
  const cmd = command.toLowerCase().trim().replace(/[áéíóúñ]/g, (c: string) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n" }[c] || c));

  // 🧭 Menú principal con botones interactivos
  if (cmd === "menu" || cmd === "menú" || cmd === "inicio" || cmd === "opciones") {
    if (fromNumber) {
      await sendInteractiveButtons(fromNumber, `👋 *¡Hola ${user.name}!* Soy LUNA 🌙\n¿Qué querés hacer hoy?`, [
        { id: "menu_reminder", title: "⏰ Recordatorio" },
        { id: "menu_task", title: "📝 Tarea" },
        { id: "menu_message", title: "💬 Mensaje" },
      ]);
    }
    return null;
  }

  // Respuestas de botones del menú
  if (command.trim() === "⏰ Recordatorio") {
    if (fromNumber) setConversation(fromNumber, "menu_reminder_title", {});
    return "⏰ *Nuevo Recordatorio*\n\nEscribí qué te recuerdo, con día y hora:\n\n• `llamar al proveedor mañana 9am`\n• `revisar bodega hoy 3pm`\n• `reunión con Jorge el viernes 10am`";
  }

  if (command.trim() === "📝 Tarea") {
    if (fromNumber) setConversation(fromNumber, "task_create_title", {});
    return "📝 *Nueva Tarea*\n\n¿Qué tarea querés crear? Escribí el título.\n\nEj: *revisar cotizaciones*";
  }

  if (command.trim() === "💬 Mensaje") {
    if (fromNumber) setConversation(fromNumber, "menu_message_to", {});
    return "💬 *Mensaje Programado*\n\n¿A quién se lo mando? Escribí el *número* (ej: `55551234`) o el *nombre* de alguien del equipo.";
  }

  // Botones de acción sobre tareas (aparecen después de "tareas")
  if (command.trim() === "✅ Completar") {
    if (fromNumber) setConversation(fromNumber, "action_complete", {});
    return "✅ Escribí el *número* de la tarea que completás.\n\n• Una: `1`\n• Varias: `1 2 3`\n\nSi no recordás los números, escribí *tareas*.";
  }

  if (command.trim() === "⏰ Posponer") {
    if (fromNumber) setConversation(fromNumber, "action_postpone", {});
    return "⏰ Escribí el *número* de la tarea que posponés (ej: `1`).\n\nSi no recordás los números, escribí *tareas*.";
  }

  if (command.trim() === "📋 Menú") {
    if (fromNumber) {
      await sendInteractiveButtons(fromNumber, `👋 *¡Hola ${user.name}!* Soy *LUNA* 🌙 · Asistente de Live Productions\n¿Qué querés hacer hoy?`, [
        { id: "menu_reminder", title: "⏰ Recordatorio" },
        { id: "menu_task", title: "📝 Tarea" },
        { id: "menu_message", title: "💬 Mensaje" },
      ]);
    }
    return null;
  }

  if (cmd.startsWith("completar ") || cmd.startsWith("hecho ") || cmd.startsWith("completado ") || cmd.startsWith("hechos ") || cmd.startsWith("completadas ")) {
    const numStr = cmd.replace(/^(completar|completado|completadas|hecho|hechos)\s+/i, "").trim();
    const nums = extractNumbers(numStr);
    if (nums.length === 0) return "¿Cuáles tareas? Ejemplo: *hecho 3* o *hecho 1 2 3* o *hechos 1 y 2*";
    const completed: string[] = [];
    const failed: string[] = [];
    for (const num of nums) {
      const task = await resolveTaskByNumber(user.id, num);
      if (!task) { failed.push(String(num)); continue; }
      if (task.status === "COMPLETADA") { failed.push(`${num} (ya estaba hecha)`); continue; }
      await completeTask(task.id, user);
      completed.push(task.title);
    }
    if (completed.length === 0) {
      return `⚠️ No pude completar: ${failed.join(", ")}. Escribí *tareas* para ver la lista actual.`;
    }
    let reply = `✅ *${completed.length} tarea${completed.length > 1 ? "s" : ""} completada${completed.length > 1 ? "s" : ""}:*\n${completed.map((t) => `• ${t}`).join("\n")}`;
    if (failed.length > 0) reply += `\n\n⚠️ No se pudo: ${failed.join(", ")}`;
    reply += `\n\n_Si fue un error, escribe *deshacer [número]*._`;
    return reply;
  }

  if (cmd === "deshacer" || cmd.startsWith("deshacer ") || cmd.startsWith("revertir ") || cmd.startsWith("deshacer la ")) {
    const numStr = cmd.replace(/^(deshacer\s+(la\s+)?|revertir\s+)/i, "").trim();
    const num = parseInt(numStr);
    if (isNaN(num)) return "¿Cuál tarea quieres revertir? Ejemplo: *deshacer 3*";
    const task = await resolveTaskByNumber(user.id, num);
    if (!task) return "No pude encontrar esa tarea. Escribí *tareas* para ver la lista actual.";
    if (task.status !== "COMPLETADA") return `La tarea *${task.title}* no está completada.`;
    await prisma.task.update({ where: { id: task.id }, data: { status: "PENDIENTE", confirmedAt: null } });
    await prisma.taskHistory.create({
      data: { taskId: task.id, userId: user.id, action: "DESHECHA via WhatsApp", previousStatus: "COMPLETADA", newStatus: "PENDIENTE" },
    });
    return `↩️ Tarea *${task.title}* deshecha: vuelve a estar pendiente.`;
  }

  // 🗑️ ELIMINAR tareas por número (una o varias)
  if (cmd.startsWith("eliminar ") || cmd.startsWith("borrar ") || cmd.startsWith("elimina ") || cmd.startsWith("borra ")) {
    const numStr = cmd.replace(/^(eliminar|borrar|elimina|borra)\s+/i, "").trim();
    const nums = extractNumbers(numStr);
    if (nums.length > 0) {
      const deleted: string[] = [];
      const failed: string[] = [];
      for (const num of nums) {
        const task = await resolveTaskByNumber(user.id, num);
        if (!task) { failed.push(String(num)); continue; }
        await prisma.task.delete({ where: { id: task.id } });
        deleted.push(task.title);
      }
      if (deleted.length === 0) return `⚠️ No pude eliminar: ${failed.join(", ")}. Escribí *tareas* para ver la lista.`;
      let reply = `🗑️ *${deleted.length} tarea${deleted.length > 1 ? "s" : ""} eliminada${deleted.length > 1 ? "s" : ""}:*\n${deleted.map((t) => `• ${t}`).join("\n")}`;
      if (failed.length > 0) reply += `\n\n⚠️ No se pudo: ${failed.join(", ")}`;
      return reply;
    }
    // "eliminar todo" / "borrar todo"
    if (/todo|todas|todos|masivo/i.test(numStr)) {
      const res = await prisma.task.deleteMany({
        where: { assignedToId: user.id, status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] } },
      });
      return `🗑️ Eliminaste ${res.count} tareas pendientes. Empezás de cero.`;
    }
    return "Formato: *eliminar 3* o *eliminar 1 2 3* o *eliminar todo*";
  }

  // 🧹 LIMPIAR tareas de un usuario (admin/jefe)
  if (cmd.startsWith("limpiar tareas de ") || cmd.startsWith("limpiar las tareas de ") || cmd.startsWith("borrar tareas de ")) {
    const isAdmin = user.role === "DUENO" || user.role === "ADMIN" || user.role === "JEFE";
    if (!isAdmin) return "Solo dueños, administradores o jefes pueden limpiar tareas de otros.";
    const name = cmd.replace(/^(limpiar tareas de |limpiar las tareas de |borrar tareas de )/i, "").trim();
    if (!name) return "¿De quién? Ejemplo: *limpiar tareas de Diana*";
    const target = await prisma.user.findFirst({ where: { name: { contains: name, mode: "insensitive" }, active: true } });
    if (!target) return `No encontré a "${name}". Usa *equipo* para ver los nombres.`;
    const res = await prisma.task.deleteMany({ where: { assignedToId: target.id } });
    return `🧹 Se eliminaron ${res.count} tareas de *${target.name}*.`;
  }

  if (cmd.startsWith("proceso ") || cmd.startsWith("iniciar ") || cmd.startsWith("en proceso ")) {
    const numStr = cmd.replace(/^(proceso|iniciar|en proceso)\s+/i, "").trim();
    const nums = extractNumbers(numStr);
    if (nums.length === 0) return "¿Cuáles tareas? Ejemplo: *proceso 3* o *proceso 1 2 3*";
    const done: string[] = [];
    const failed: string[] = [];
    for (const num of nums) {
      const task = await resolveTaskByNumber(user.id, num);
      if (!task) { failed.push(String(num)); continue; }
      await prisma.task.update({ where: { id: task.id }, data: { status: "EN_PROCESO" } });
      done.push(task.title);
    }
    if (done.length === 0) return `⚠️ No pude marcar: ${failed.join(", ")}. Escribí *tareas* para ver la lista.`;
    return `🔄 *${done.length} tarea${done.length > 1 ? "s" : ""} en proceso:*\n${done.map((t) => `• ${t}`).join("\n")}`;
  }

  if (cmd.startsWith("no ") && /^\d+$/.test(cmd.replace("no ", "").trim())) {
    const num = parseInt(cmd.replace("no ", "").trim());
    const task = await resolveTaskByNumber(user.id, num);
    if (!task) return "No pude encontrar esa tarea. Escribí *tareas* para ver la lista actual.";
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

    const task = await resolveTaskByNumber(user.id, num);
    if (!task) return "No pude encontrar esa tarea. Escribí *tareas* para ver la lista actual.";

    const afterNum = rest.slice(parts[0].length).trim();
    const { newDate, reason } = parsePostponeDetails(afterNum);

    const finalDate = newDate || applyGuatemalaTime(new Date(gtStartOfToday().getTime() + 24 * 60 * 60 * 1000), 9, 0);

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
    const task = await resolveTaskByNumber(user.id, num);
    if (!task) return "No pude encontrar esa tarea. Escribí *tareas* para ver la lista actual.";
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
    const task = await resolveTaskByNumber(user.id, num);
    if (!task) return "No pude encontrar esa tarea. Escribí *tareas* para ver la lista actual.";
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
    /(?:tareas|mis tareas|ver tareas|que tengo|que hay|que tengo para|dame)\b.*?(?:la proxima semana|la semana que viene|la siguiente semana|proxima semana|el proximo mes|el mes que viene|el siguiente mes|siguiente mes)/i.test(cmd) ||
    /(?:tareas|mis tareas|ver tareas|que tengo|que hay|que tengo para|dame|ver)\b.*?\b(pasado mañana|pasado manana|para mañana|para manana|mañana|manana|hoy|el lunes|lunes|el martes|martes|el miercoles|el miércoles|miercoles|miércoles|el jueves|jueves|el viernes|viernes|el sabado|el sábado|sabado|sábado|el domingo|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|\d{1,2})\b/i.test(cmd) ||
    /\b(\d{1,2})\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i.test(cmd);

  if (dynamicTaskMatch) {
    const w = getGuatemalaWallClock();
    const today = gtStartOfToday(); // medianoche real de Guatemala
    const dayOfWeek = w.weekday; // 0=domingo (fecha de Guatemala)
    const monday = new Date(today.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 24 * 60 * 60 * 1000);
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const nextSaturday = new Date(nextMonday.getTime() + 5 * 24 * 60 * 60 * 1000 + (23 * 60 + 59) * 60 * 1000 + 999);

    const dayMap: Record<string, number> = {
      lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5,
      sabado: 6, sábado: 6, domingo: 0,
    };
    const monthMap: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    };

    let title = "";
    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;
    let queriedDay: string | null = null;

    // 1) Próxima semana
    if (/la proxima semana|la semana que viene|la siguiente semana|proxima semana/i.test(cmd)) {
      title = "PRÓXIMA SEMANA";
      dateFrom = nextMonday;
      dateTo = nextSaturday;
    }
    // 2) Pasado mañana
    else if (/pasado mañana|pasado manana/i.test(cmd)) {
      const d = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);
      title = `PASADO MAÑANA - ${d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })}`;
      dateFrom = new Date(d);
      dateTo = new Date(d.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
    }
    // 4) Mañana
    else if (/mañana|manana/i.test(cmd)) {
      const d = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      title = `MAÑANA - ${d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })}`;
      dateFrom = new Date(d);
      dateTo = new Date(d.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
    }
    // 5) Hoy
    else if (/hoy/.test(cmd)) {
      title = `HOY - ${today.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })}`;
      dateFrom = new Date(today);
      dateTo = new Date(today.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
    }
    // 5.25) Fecha específica con número: "25 agosto", "25 de agosto", "viernes 28 agosto", "lunes 17"
    else if (/(\d{1,2})\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(cmd)) {
      const match = cmd.match(/(\d{1,2})\s*(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
      if (match) {
        const dayNum = parseInt(match[1]);
        const monthName = match[3].toLowerCase();
        const monthIdx = monthMap[monthName];
        let year = w.year;
        // Si la fecha ya pasó este año, usar el próximo año
        const candidate = guatemalaDate(year, monthIdx + 1, dayNum);
        if (candidate.getTime() < today.getTime()) year += 1;
        const targetDate = guatemalaDate(year, monthIdx + 1, dayNum);
        title = `${targetDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
        dateFrom = new Date(targetDate);
        dateTo = new Date(targetDate.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
      }
    }
    // 5.27) Día con número sin mes: "lunes 17", "tareas 17" (día del mes actual/próximo)
    else if (/\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)?\s*(\d{1,2})\b/i.test(cmd) && !/la proxima semana|el mes que viene|mañana|manana|pasado/i.test(cmd)) {
      const match = cmd.match(/\b(\d{1,2})\b/i);
      if (match) {
        const dayNum = parseInt(match[1]);
        let targetDate = guatemalaDate(w.year, w.month, dayNum);
        // Si ya pasó este mes, usar el próximo mes
        if (targetDate.getTime() < today.getTime()) {
          targetDate = guatemalaDate(w.year, w.month + 1, dayNum);
        }
        title = `${targetDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
        dateFrom = new Date(targetDate);
        dateTo = new Date(targetDate.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
      }
    }
    // 5.5) Sin vista de meses (solo por día o semana)
    else {
      return "📅 Solo puedo consultar por *día* o por *semana*. Probá: *tareas mañana*, *tareas del lunes*, *tareas de la próxima semana*.";
    }
    // 6) Día específico de la semana (lunes, martes, etc.)
    if (!dateFrom && !dateTo) {
      let targetDay: number | null = null;
      let targetName: string | null = null;
      for (const [name, idx] of Object.entries(dayMap)) {
        const lowerCmd = cmd.toLowerCase();
        if (lowerCmd.includes(name)) { targetDay = idx; targetName = name; break; }
      }
      if (targetDay !== null) {
        // Próxima ocurrencia de ese día (si hoy es el día pedido, va a la próxima semana)
        let delta = (targetDay - dayOfWeek + 7) % 7;
        if (delta === 0) delta = 7;
        const targetDate = new Date(today.getTime() + delta * 24 * 60 * 60 * 1000);
        title = `${targetDate.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })}`;
        dateFrom = new Date(targetDate);
        dateTo = new Date(targetDate.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
        queriedDay = targetName ? targetName.toUpperCase() : null;
      }
    }

    if (!dateFrom || !dateTo) {
      return "No entendí bien la fecha. Prueba: *tareas para mañana*, *tareas del lunes*, *tareas de la próxima semana*";
    }

    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: user.id,
        status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] },
        OR: queriedDay
          ? [
              { dueDate: { gte: dateFrom, lte: dateTo } },
              { type: "FIJA", frequency: "SEMANAL", dayOfWeek: queriedDay as any, dueDate: null },
            ]
          : [{ dueDate: { gte: dateFrom, lte: dateTo } }],
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
      take: 20,
    });

    if (tasks.length === 0) {
      return `${user.name}, no tienes tareas para *${title}*. ¡Bien! 🎉`;
    }

    // Determinar si es un solo día o varios días (comparación en hora de Guatemala)
    const d1 = getGuatemalaWallClock(dateFrom);
    const d2 = getGuatemalaWallClock(dateTo);
    const isSingleDay = d1.year === d2.year && d1.month === d2.month && d1.day === d2.day;

    let body: string;
    if (isSingleDay) {
      // Un solo día: lista plana ordenada por hora
      body = formatTaskList(tasks);
    } else {
      // Varios días (semana/mes): agrupar por día
      body = groupTasksByDay(tasks);
    }

    return `📅 *${title}*\n\n${body}\n\n⚡ *Acciones (usa el #):*\n#1 hecho 1 → Completada\n#2 proceso 1 → En proceso\n#3 posponer 1 → Posponer\n#4 transferir 1 a Diana → Transferir\n#5 comentar 1 texto → Comentar`;
  }

  // ➕ CREAR/ASIGNAR TAREA (antes de "ver tareas" para no confundirse)
  // "crea tarea X", "asigna tarea a Diana X", "agrega tarea para Jorge X", "ponle tarea a Abel X"
  const createTaskMatch = cmd.match(/^(crea|crear|asigna|asignar|agrega|agregar|ponle|ponele|pon|deja|dejale|d[ée]jale)\s+(una\s+)?tarea\b/i);
  if (createTaskMatch) {
    let details = cmd.replace(/^(crea|crear|asigna|asignar|agrega|agregar|ponle|ponele|pon|deja|dejale|d[ée]jale)\s+(una\s+)?tarea\b/i, "").trim();
    // Si empieza con "para X" o "a X", normalizar a "para X" para el parser
    details = details.replace(/^\s*(para|a)\s+/i, "para ");
    if (!details) {
      return "📝 *Nueva Tarea*\n\nEscribí todo junto: *asigna tarea para Diana revisar cotizaciones mañana 10am*";
    }
    return await handleCreateTask(details, user);
  }

  if (cmd.startsWith("nueva tarea")) {
    const details = cmd.replace(/^nueva\s+tarea\s*/i, "").trim();
    if (!details) {
      return "📝 *Nueva Tarea*\n\nEscribí todo junto: *crea tarea para Diana revisar cotizaciones mañana 10am*";
    }
    return await handleCreateTask(details, user);
  }

  if (
    cmd === "tareas" || cmd === "mis tareas" || cmd === "ver tareas" ||
    cmd === "muestrame mis tareas" || cmd === "muéstrame mis tareas" ||
    cmd === "quiero ver mis tareas" || cmd === "ver mis tareas" ||
    /^(ver|mostrar|muestra|muéstrame|dame|consultar|listar|revisar)\s+(mis\s+)?tareas/.test(cmd) ||
    (cmd.includes("tarea") && !cmd.startsWith("tareas hoy") && !cmd.startsWith("tareas semana") && !cmd.includes("crea") && !cmd.includes("crear") && !cmd.includes("nueva") && !cmd.includes("asigna") && !cmd.includes("asignar") && !cmd.includes("agrega") && !cmd.includes("agregar") && !cmd.includes("ponle") && !cmd.includes("deja"))
  ) {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `👋 *¡Hola ${user.name}!* Soy *LUNA* 🌙\n\nNo tienes tareas pendientes. ¡Excelente trabajo! 🎉`;
    if (fromNumber) {
      await sendMessage(fromNumber, tasks);
      await sendInteractiveButtons(fromNumber, "⚡ ¿Qué querés hacer con tus tareas?", [
        { id: "act_complete", title: "✅ Completar" },
        { id: "act_postpone", title: "⏰ Posponer" },
        { id: "act_menu", title: "📋 Menú" },
      ]);
      return null;
    }
    return tasks;
  }

  if (cmd === "pendientes") {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `${user.name}, no tienes tareas pendientes. ¡Todo al día! ✅`;
    return tasks;
  }

  // 💬 MENSAJE A CUALQUIER NÚMERO: "mándale un mensaje al 5555-1234 mañana a las 3pm que..."
  if (/^(m[aá]ndale|m[aá]nda|env[íi]a|env[íi]ale|mensaje|m[aá]ndame)\b/.test(cmd) && /\b(?:al\s+|para\s+el\s+)?\d{8}\b/.test(cmd)) {
    const phoneMatch = cmd.match(/\d{8}/);
    if (phoneMatch) {
      const rawNumber = phoneMatch[0];
      const targetNumber = normalizeGTPhone(rawNumber);
      // Extraer mensaje y fecha/hora (hora de Guatemala)
      const time = parseTimeExpression(cmd);
      let when = parseRelativeDate(cmd, new Date());
      if (!when) {
        when = gtStartOfToday();
        when = applyGuatemalaTime(when, time?.hours ?? 9, time?.minutes ?? 0);
      } else if (time) {
        when = applyGuatemalaTime(when, time.hours, time.minutes);
      }
      // Quitar el número, fecha/hora y prefijos del mensaje
      let msgText = cmd
        .replace(/\d{8}/, "")
        .replace(/^(m[aá]ndale|m[aá]nda|env[íi]a|env[íi]ale|m[aá]ndame)\s+(un\s+)?(mensaje|whats|sms)\b/i, "")
        .replace(/\b(al|para\s+el|a\s+las|al\s+numero|numero)\b/gi, "")
        .replace(/\b(mañana|manana|pasado\s+mañana|hoy|el\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/gi, "")
        .replace(/\b(a\s+las\s+)?\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?/gi, "")
        .replace(/[.,;]+$/, "").replace(/\s{2,}/g, " ").trim();
      if (!msgText) msgText = "Mensaje de Live Productions";

      await prisma.scheduledMessage.create({
        data: {
          toNumber: targetNumber,
          message: msgText,
          scheduledAt: normalizeToFive(when),
          createdById: user.id,
        },
      });

      const dateStr = `${when.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${when.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;
      return `💬 *Mensaje programado*\n\nPara: ${targetNumber}\n🕐 ${dateStr}\nTexto: "${msgText}"\n\nLo enviaré a esa hora.`;
    }
  }

  // 📅 REUNIÓN: "hacer reunión con Diana y Abel mañana a las 8am"
  if (/\b(reuni[oó]n|junta|meeting|sesi[oó]n)\b/.test(cmd) && /\b(con|para)\b/.test(cmd)) {
    return await handleMeetingCommand(cmd, user);
  }

  if ((cmd.startsWith("recuerda") || cmd.startsWith("recordar") || cmd.startsWith("recordatorio") ||
      /recordator|recu[ée]rdame|recuerdeme|recordarme/.test(cmd) ||
      /\b(hazme|haz|hacer|hacerme|agendame|ag[ée]ndame|creame|crea|programame|programar|ponme|pon)\s*(un\s+|una\s+|el\s+|la\s+)?(recordatorio|recordar|recordarme)\b/i.test(cmd) ||
      /\b(crea|creame|crear|agenda|programa|programar|pon|ponme|agendar|poner)\s+(un\s+|unos\s+|el\s+|una\s+|las\s+|los\s+)?recordatorio/i.test(cmd) ||
      /mand(a|ame|enme|ele)?\s+(un\s+)?(mensaje|alerta|aviso)/i.test(cmd) ||
      /(avisame|avisame|notifícame|notificame|avísame|avísame|av[íi]same)\b/i.test(cmd) ||
      /\b(ponme|pon|manda|mandame|env[íi]a|env[íi]ame)\s+(una|un)\s+(alerta|aviso|recordatorio|mensaje)\b/i.test(cmd)) &&
      !/\b(masivo|a los que no han completado|a todos)\b/.test(cmd)) {
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
        description: parsed.description || `Recordatorio programado para ${parsed.remindAt.toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`,
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

  // 🛒 COMPRAS
  if (cmd === "compras" || cmd === "compras pendientes" || cmd === "mis compras") {
    return await listPurchases(user.id);
  }
  if (cmd.startsWith("compra ") || cmd.startsWith("comprar ") || cmd.startsWith("agrega compra ") || cmd.startsWith("agregar compra ")) {
    const details = cmd.replace(/^(compra|comprar|agrega compra|agregar compra)\s+/i, "").trim();
    if (!details) return "Formato: *compra [qué comprar] [para quién] [cuándo]*\nEj: *compra pilas AA para Abel mañana* o *compra cinta ducto el viernes*";
    return await createPurchaseFromText(details, user);
  }
  if (cmd.startsWith("comprado ") || cmd.startsWith("compra hecha ")) {
    const numStr = cmd.replace(/^(comprado|compra hecha)\s+/i, "").trim();
    const num = parseInt(numStr);
    if (isNaN(num)) return "¿Cuál compra? Ejemplo: *comprado 2*";
    const purchases = await getMyPurchases(user.id);
    if (num < 1 || num > purchases.length) return `Solo tienes ${purchases.length} compras pendientes. Escribe *compras* para verlas.`;
    const p = purchases[num - 1];
    await prisma.purchase.update({ where: { id: p.id }, data: { status: "COMPRADO" } });
    return `🛒 Compra *${p.title}* marcada como *COMPRADO*. ¡Gracias!`;
  }

  // ⏰ RECORDATORIOS: ver y eliminar (por defecto muestra solo los de HOY)
  if (cmd === "recordatorios" || cmd === "mis recordatorios" || cmd === "ver recordatorios" || cmd.startsWith("recordatorios ")) {
    const period = cmd.replace(/^recordatorios\s*/i, "").trim();
    const today = gtStartOfToday();
    const endOfToday = gtEndOfToday();
    const endOfWeek = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000 + (23 * 60 + 59) * 60 * 1000 + 999);

    let where: any = { assignedToId: user.id, isCompleted: false };
    let title = "RECORDATORIOS DE HOY";
    if (period === "hoy") {
      where.remindAt = { gte: today, lte: endOfToday };
      title = "RECORDATORIOS DE HOY";
    } else if (period === "semana" || period === "esta semana") {
      where.remindAt = { gte: today, lte: endOfWeek };
      title = "RECORDATORIOS DE ESTA SEMANA";
    } else if (period === "todos" || period === "todas") {
      title = "TODOS TUS RECORDATORIOS";
    } else if (period) {
      // Si pide un día específico (ej. "recordatorios mañana"), intenta parsear
      const d = parseRelativeDate(period, new Date());
      if (d) {
        const w = getGuatemalaWallClock(d);
        const start = new Date(Date.UTC(w.year, w.month - 1, w.day));
        const end = new Date(start.getTime() + (23 * 60 + 59) * 60 * 1000 + 999);
        where.remindAt = { gte: start, lte: end };
        title = `RECORDATORIOS ${d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" }).toUpperCase()}`;
      }
    } else {
      // Por defecto: solo hoy
      where.remindAt = { gte: today, lte: endOfToday };
    }

    const reminders = await prisma.reminder.findMany({
      where,
      orderBy: { remindAt: "asc" },
      take: 30,
    });
    if (reminders.length === 0) return period ? `No tienes recordatorios para "${period}".` : "No tienes recordatorios para hoy.";

    const lines = reminders.map((r, i) => {
      const d = r.remindAt;
      const day = d.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "short", day: "numeric", month: "short" });
      const time = d.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" });
      return `${i + 1}. ⏰ *${r.title}* → ${day} ${time}`;
    }).join("\n");

    return `⏰ *${title}*\n\n${lines}\n\n⚡ Para eliminar: *eliminar recordatorio 2* o *eliminar recordatorios 1 2 3*\n📅 Ver más: *recordatorios semana* | *recordatorios todos*`;
  }

  if (cmd.startsWith("eliminar recordatorio") || cmd.startsWith("borrar recordatorio") || cmd.startsWith("eliminar recordatorios") || cmd.startsWith("borrar recordatorios")) {
    const numStr = cmd.replace(/^(eliminar|borrar)\s+recordatorios?\s*/i, "").trim();
    const nums = extractNumbers(numStr);
    if (nums.length === 0) return "¿Cuál recordatorio? Ejemplo: *eliminar recordatorio 2* o *eliminar recordatorios 1 2 3*";
    const reminders = await prisma.reminder.findMany({
      where: { assignedToId: user.id, isCompleted: false },
      orderBy: { remindAt: "asc" },
      take: 30,
    });
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const num of nums) {
      const r = reminders[num - 1];
      if (!r) { failed.push(String(num)); continue; }
      await prisma.reminder.delete({ where: { id: r.id } });
      deleted.push(r.title);
    }
    if (deleted.length === 0) return `⚠️ No pude eliminar: ${failed.join(", ")}. Escribí *recordatorios* para verlos.`;
    let reply = `🗑️ *${deleted.length} recordatorio${deleted.length > 1 ? "s" : ""} eliminado${deleted.length > 1 ? "s" : ""}:*\n${deleted.map((t) => `• ${t}`).join("\n")}`;
    if (failed.length > 0) reply += `\n\n⚠️ No se pudo: ${failed.join(", ")}`;
    return reply;
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
    return `🤖 *LUNA · Asistente de Live Productions*

🧭 *MENÚ CON BOTONES*
Escribí *menu* y tocá un botón (Recordatorio / Tarea / Mensaje).

📋 *VER TAREAS*
• *tareas* → toda la semana
• *tareas hoy* / *tareas mañana*
• *tareas del lunes* / *tareas 25 agosto*

⚡ *ACTUAR SOBRE TAREAS (usá el número)*
• *hecho 1* (o *hecho 1 2 3*) → completar
• *proceso 1* → en proceso
• *posponer 1* → cambiar de día
• *transferir 1 a Diana* → reasignar
• *comentar 1 texto* → agregar nota
• *deshacer 1* → revertir completada
• *eliminar 1* → borrar

➕ *CREAR*
• *crea tarea [qué] [día] [hora]* → ej: crea tarea revisar cotizaciones viernes 3pm
• *recuérdame [qué] mañana 9am* → recordatorio
• *recuérdale a Diana [qué] 3pm* → recordatorio a otro
• *mándale un mensaje al 55551234 mañana 3pm [texto]*
• *hacer reunión con Diana y Abel mañana 8am*
• *compra [artículo] para Abel mañana*

🔎 *CONSULTAR*
• *recordatorios* → los de hoy
• *compras* → pendientes
• *eventos* → próximos

📈 *REPORTES (jefes/dueños)*
• *resumen* · *ranking* · *cómo va el equipo*

🏢 *SISTEMA*
• *inventario* · *vehiculos* · *cobros* · *empleados*

📌 *CÓMO FUNCIONAN LAS TAREAS*
• 🔁 *Fijas*: se repiten (diarias o por día de semana).
• ⚡ *Variables*: si las completás se borran (agregás de nuevo); si no, siguen como prioridad hasta que las hagas.
• ⚠️ Los mensajes siempre empiezan con tus tareas *vencidas*.

🎨 🟢 Baja · 🟡 Media · 🔴 Alta/Urgente
📞 +502 3090-3172 · liveproductionsgt.com`;
  }

  // Broadcast de actualización (solo Dueño/Admin/Jefe)
  if (
    (user.role === "DUENO" || user.role === "ADMIN" || user.role === "JEFE") &&
    /enviar\s+(actualizaci|detalle|mejoras|aviso|informaci)|^broadcast|enviar\s+a\s+todos|avisar\s+a\s+todos/.test(cmd)
  ) {
    const result = await sendLUNAUpdateBroadcast(user.id);
    const meetingStr = result.meetingTime.toLocaleString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    return `📢 *Broadcast enviado*\n\n✅ Mensaje entregado a ${result.sent} ${result.sent === 1 ? "persona" : "personas"}${result.failed > 0 ? ` (${result.failed} fallidos)` : ""}.\n⏰ Se crearon ${result.remindersCreated} recordatorios de la reunión.\n\n📅 *Reunión: ${meetingStr}*`;
  }

  return null;
}

async function handleCreateTask(details: string, user: { id: string; name: string }) {
  const parsed = await parseTaskCreation(details, user);
  if (!parsed) return "No entendí. Ejemplo: *crea tarea para Diana revisar cotizaciones mañana 10am*";

  const dueDateVal = parsed.isFixed && parsed.dayOfWeek
    ? null
    : parsed.dueDate
      ? normalizeToFive(parsed.dueDate)
      : parsed.isFixed
        ? null
        : new Date();
  // Variables: su día ancla es el día de la semana de su fecha (se repiten cada ese día)
  const dayOfWeekVal = parsed.isFixed ? parsed.dayOfWeek : dueDateVal ? weekdayNameOf(dueDateVal) : null;

  const task = await prisma.task.create({
    data: {
      title: parsed.title,
      description: parsed.description || "",
      assignedToId: parsed.assignToId || user.id,
      assignedById: user.id,
      dueDate: dueDateVal,
      priority: parsed.priority || "MEDIA",
      category: "OTRO",
      type: parsed.isFixed ? "FIJA" : "DINAMICA",
      frequency: parsed.isFixed ? (parsed.frequency || "DIARIA") : "DIARIA",
      dayOfWeek: dayOfWeekVal,
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
      const digest = await getOrderedTaskDigest(targetUser.id);
      const digestBlock = digest ? `\n\n📋 *Tus próximas tareas (ordenadas)*\n${digest}` : "";
      await sendMessage(
        to,
        `📋 *Nueva Tarea Asignada*\n\n${prioIcon} *${task.title}*\n👤 Asignada por: ${user.name}\n📅 ${dateStr}${digestBlock}\n\nEscribí *tareas* para verlas todas.`
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
    const dueDate = applyGuatemalaTime(new Date(conv.data.dueDate), time.hours, time.minutes);
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

    const dueDate = applyGuatemalaTime(new Date(conv.data.dueDate), time.hours, time.minutes);

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
        const digest = await getOrderedTaskDigest(targetUser.id);
        const digestBlock = digest ? `\n\n📋 *Tus próximas tareas (ordenadas)*\n${digest}` : "";
        await sendMessage(
          to,
          `📋 *Nueva Tarea Asignada*\n\n${prioIcon} *${data.title}*\n👤 Asignada por: ${user.name}\n📅 ${dateStr}${digestBlock}\n\nEscribí *tareas* para verlas todas.`
        ).catch(() => {});
      }
    }

    return `✅ Tarea creada para *${targetName}*: "${data.title}"\n📅 ${dueDate.toLocaleDateString("es-GT", {timeZone:"America/Guatemala",weekday:"long",day:"numeric",month:"long"})} a las ${dueDate.toLocaleTimeString("es-GT", {timeZone:"America/Guatemala",hour:"2-digit",minute:"2-digit"})}\n🔵 Prioridad: ${priority}\n🔔 ${targetUser && targetUser.id !== user.id ? `Notificación enviada a *${targetName}*` : "Todo listo"}`;
  }

  // ── Wizard: Recordatorio (botón ⏰) ──────────────────────────────
  if (conv.state === "menu_reminder_title") {
    const parsed = await parseReminderFromText(text, user);
    if (!parsed || !parsed.remindAt) {
      return "🤔 No pude leer el día y la hora. Escribilo de nuevo con día y hora.\nEj: *llamar al proveedor mañana 9am*";
    }
    setConversation(fromNumber, "menu_reminder_who", {
      title: parsed.title,
      remindAt: parsed.remindAt.toISOString(),
      assignToId: parsed.assignToId,
    });
    const dateStr = `${parsed.remindAt.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${parsed.remindAt.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;
    return `⏰ *${parsed.title}*\n📅 ${dateStr}\n\n¿Para quién es?\n• Escribí *para mí*\n• O el nombre (ej: *Diana*)`;
  }

  if (conv.state === "menu_reminder_who") {
    const data = conv.data;
    let assignToId: string = data.assignToId || user.id;
    const isSelf = /(^|\s)(para\s+)?(mi|mí|yo)(\s|$)/.test(cmdLower);

    if (!isSelf) {
      const target = await prisma.user.findFirst({
        where: { name: { contains: cmdLower, mode: "insensitive" }, active: true },
      });
      if (!target) return `No encontré a "${text}". Escribí *para mí* o el nombre de alguien del equipo.`;
      assignToId = target.id;
    } else {
      assignToId = user.id;
    }

    conversations.delete(fromNumber);
    const remindAt = new Date(data.remindAt);

    await prisma.reminder.create({
      data: { title: data.title, description: "", remindAt, createdById: user.id, assignedToId: assignToId },
    });
    await prisma.task.create({
      data: {
        title: `🔔 ${data.title}`,
        description: "",
        assignedToId: assignToId,
        assignedById: user.id,
        dueDate: remindAt,
        priority: "ALTA",
        category: "OTRO",
        type: "DINAMICA",
        frequency: "DIARIA",
        status: "PENDIENTE",
      },
    });

    const targetUser = assignToId !== user.id ? await prisma.user.findUnique({ where: { id: assignToId } }) : null;
    const targetName = targetUser ? targetUser.name : "ti";
    const dateStr = `${remindAt.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${remindAt.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;

    if (targetUser && targetUser.id !== user.id) {
      const to = targetUser.whatsappNumber || targetUser.phone;
      if (to) {
        await sendMessage(
          to,
          `⏰ *Recordatorio asignado*\n\n${user.name} te dejó un recordatorio:\n*${data.title}*\n📅 ${dateStr}\n\nTe avisaré 10 minutos antes y a la hora exacta.`
        ).catch(() => {});
      }
      return `✅ Recordatorio creado para *${targetName}*: *${data.title}*\n📅 ${dateStr}\n🔔 Le avisé a *${targetName}*.`;
    }
    return `✅ Recordatorio creado para ti: *${data.title}*\n📅 ${dateStr}\n🔔 Te avisaré 10 minutos antes y a la hora exacta.`;
  }

  // ── Wizard: Mensaje programado (botón 💬) ────────────────────────
  if (conv.state === "menu_message_to") {
    let toNumber = "";
    let toName = "";
    const digits = text.replace(/\D/g, "");
    if (digits.length >= 8) {
      toNumber = normalizeGTPhone(digits.slice(-8));
    } else {
      const target = await prisma.user.findFirst({
        where: { name: { contains: text, mode: "insensitive" }, active: true },
      });
      if (target) {
        toNumber = target.whatsappNumber || target.phone || "";
        toName = target.name;
      }
      if (!toNumber) return "No encontré ese número ni esa persona. Escribí el *número* (ej: `55551234`) o un *nombre* del equipo.";
    }
    setConversation(fromNumber, "menu_message_text", { toNumber, toName });
    return `💬 Mensaje para *${toName || toNumber}*\n\n¿Qué le digo? Escribí el mensaje.`;
  }

  if (conv.state === "menu_message_text") {
    setConversation(fromNumber, "menu_message_when", { ...conv.data, message: text });
    return `📝 "${text}"\n\n¿Cuándo lo mando?\nEj: *mañana 3pm*, *hoy 8pm*, *el viernes 9am*`;
  }

  if (conv.state === "menu_message_when") {
    const time = parseTimeExpression(text);
    let when = parseRelativeDate(text, new Date());
    if (!when) {
      when = applyGuatemalaTime(gtStartOfToday(), time?.hours ?? 9, time?.minutes ?? 0);
    } else if (time) {
      when = applyGuatemalaTime(when, time.hours, time.minutes);
    }
    conversations.delete(fromNumber);

    const msgText = conv.data.message || "Mensaje de Live Productions";
    await prisma.scheduledMessage.create({
      data: {
        toNumber: conv.data.toNumber,
        message: msgText,
        scheduledAt: normalizeToFive(when),
        createdById: user.id,
      },
    });

    const ds = `${when.toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} a las ${when.toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}`;
    return `✅ *Mensaje programado*\n\nPara: ${conv.data.toName || conv.data.toNumber}\n🕐 ${ds}\nTexto: "${msgText}"\n\nLo enviaré a esa hora.`;
  }

  // ── Botón "✅ Completar": espera el número de tarea ─────────────
  if (conv.state === "action_complete") {
    conversations.delete(fromNumber);
    if (!/\d/.test(text)) {
      return "Escribí el *número* de la tarea. Ej: `1` (o varios: `1 2 3`).\n\nEscribí *tareas* para ver los números.";
    }
    return await handleCommand("hecho " + text, user, fromNumber);
  }

  // ── Botón "⏰ Posponer": espera el número de tarea ──────────────
  if (conv.state === "action_postpone") {
    conversations.delete(fromNumber);
    if (!/\d/.test(text)) {
      return "Escribí el *número* de la tarea. Ej: `1`.\n\nEscribí *tareas* para ver los números.";
    }
    return await handleCommand("posponer " + text, user, fromNumber);
  }

  return null;
}

/**
 * Cuando ningún comando matchea, detecta la intención de una frase natural
 * y sugiere el formato correcto. Retorna null para mensajes casuales (van al chat IA).
 */
function suggestCommand(text: string): string | null {
  const lower = text.toLowerCase().trim();

  if (/(recu[ée]rd|recordar|recordatorio|av[íi]s|notif[íi]came|m[aá]ndame\s+un\s+mensaje|m[aá]ndale\s+un\s+mensaje|hazme\s+un\s+recordatorio)/.test(lower)) {
    return (
      "⏰ *Para agendar un recordatorio* escribí en una sola línea:\n\n" +
      "`recuérdame [qué] [día] [hora]`\n\n" +
      "Ejemplos:\n" +
      "• `recuérdame llamar a Jorge mañana 9am`\n" +
      "• `recuérdale a Diana revisar cotizaciones el viernes 3pm`\n" +
      "• `mándame un mensaje mañana a las 8am`\n\n" +
      "También puedo recordarle a alguien: `recuérdale a Abel [tarea] [día] [hora]`."
    );
  }

  if (/(reunion|reunión|junta|meeting|juntar)/.test(lower)) {
    return (
      "🤝 *Para agendar una reunión* escribí:\n\n" +
      "`hacer reunión con [nombres] el [día] a las [hora]`\n\n" +
      "Ejemplos:\n" +
      "• `hacer reunión con Diana y Abel mañana a las 8am`\n" +
      "• `reunión con Jorge, Diana y Abel el viernes a las 3pm`"
    );
  }

  if (/(compra|comprar|compras|abastec)/.test(lower)) {
    return (
      "🛒 *Para registrar una compra* escribí:\n\n" +
      "`compra [artículo] para [persona] el [día]`\n\n" +
      "Ejemplos:\n" +
      "• `compra pilas AA para Abel mañana`\n" +
      "• `comprar cinta ducto el viernes`"
    );
  }

  if (/(crea|crear|creo|nueva\s+tarea|agregar\s+tarea|agrega\s+tarea|registra|anota|agenda|agendar|agregale|p[aá]sale\s+la\s+tarea|deja\s+una\s+tarea)/.test(lower)) {
    return (
      "📝 *Para crear una tarea* escribí en una sola línea:\n\n" +
      "`crea tarea [qué] [día] [hora]`\n\n" +
      "Ejemplos:\n" +
      "• `crea tarea revisar cotizaciones viernes 3pm`\n" +
      "• `crea tarea para Jorge llamar a Abel mañana 8am`\n" +
      "• `asigna tarea a Diana revisar bodega el lunes 10am`\n\n" +
      "Para tareas que se repiten: `crea tarea fija revisar inventario cada lunes 9am`."
    );
  }

  if (/(pospon|pospus|reprogram|mueve\s+la\s+tarea|para\s+despues|para\s+después)/.test(lower)) {
    return "⏰ *Para posponer una tarea* escribí:\n\n`posponer [número] para [día]`\n\nEj: `posponer 3 para mañana`. Primero escribí *tareas* para ver los números.";
  }

  if (/(complet|hech|finaliz|termin|list[oa]|hacer\s+la\s+tarea|acabar)/.test(lower)) {
    return "✅ *Para marcar una tarea como hecha* escribí:\n\n`hecho [número]` (pueden ser varios: `hecho 1 2 3`)\n\nPrimero escribí *tareas* para ver los números.";
  }

  if (/(elimin|borr|quitar\s+la\s+tarea|quitar\s+tarea|limpia|limpiar)/.test(lower)) {
    return "🗑️ *Para eliminar tareas* escribí:\n\n`eliminar [número]` (varios: `borrar 1 2 3`)\n\nPrimero escribí *tareas* para ver los números.";
  }

  if (/(tarea|tareas|pendiente)/.test(lower) && !/qué\s+tal|como\s+est[áa]s|hola|buenas|gracias/.test(lower)) {
    return "📋 *Para ver tareas* escribí:\n\n• `tareas` → las de hoy\n• `tareas mañana` → las de mañana\n• `tareas semana` / `tareas mes`\n• `resumen` → todo junto\n\nEj: `tareas del lunes`, `tareas de la próxima semana`.";
  }

  if (/(a\s+las\s+\d|:\d{2}\s*(am|pm)|mañana\s+a\s+las|el\s+\d{1,2}\s+de)/.test(lower) && !/hola|qué\s+tal|gracias|buenas/.test(lower)) {
    return "🤔 Veo que mencionás un día u hora, pero no tengo claro qué acción querés.\n\nProbá con:\n• `recuérdame [qué] [día] [hora]`\n• `crea tarea [qué] [día] [hora]`\n• `hacer reunión con [personas] [día] [hora]`\n\nEj: `recuérdame llamar a Jorge mañana 9am`";
  }

  return null;
}

function isKnownCommand(text: string): boolean {
  const knownCommands = [
    "tareas", "hoy", "semana", "completar", "hecho", "completado", "proceso", "iniciar", "en proceso", "posponer", "comentar",
    "deshacer", "revertir", "transferir", "crea tarea", "crear tarea", "nueva tarea",
    "reunion", "reunión", "junta", "meeting", "hacer reunion", "hacer reunión",
    "recuerda", "recordar", "recordatorio", "recordarme", "evento", "eventos",
    "hazme", "haz", "hacer", "hacerme", "agendame", "agéndame", "creame",
    "mandame", "mandame un mensaje", "mándame", "avisame", "avisame", "notificame", "notifícame", "enviame un mensaje", "envíame",
    "equipo", "pendientes", "resumen", "ayuda", "fijas", "mis tareas",
    "que tengo", "que tengo para", "que hay", "tareas para mañana", "tareas del lunes", "tareas de la proxima semana", "tareas de la semana que viene",
    "ranking", "no ",
    "inventario", "vehiculos", "vehículos", "cobros", "empleados", "personal",
    "compra", "comprar", "compras", "comprado", "agrega compra", "agregar compra",
    "asigna", "asignar", "agrega tarea", "agregar tarea", "ponle", "deja",
    "mandale", "mándale", "manda", "envia", "enviale", "envíale", "mensaje",
    "eliminar", "borrar", "elimina", "borra", "limpiar", "recordatorios",
    "enviar actualizacion", "enviar actualización", "enviar detalle", "enviar mejoras", "enviar aviso", "broadcast", "enviar a todos",
    "menu", "menú", "inicio", "opciones",
    "✅ completar", "⏰ posponer", "📋 menú", "⏰ recordatorio", "📝 tarea", "💬 mensaje",
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

              // Respuestas de botones/listas interactivas → se tratan como texto
              if (messageType === "interactive") {
                const interactive = (message as Record<string, any>).interactive;
                text = (interactive?.button_reply?.title || interactive?.list_reply?.title || "").trim();
              }

              console.log("Mensaje recibido de WhatsApp:", {
                from: fromNumber,
                contactName,
                type: messageType,
                hasText: !!text,
                timestamp: message.timestamp,
              });

              if (messageType && messageType !== "text" && messageType !== "interactive") {
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

                  const commandResponse = await handleCommand(text, user, fromNumber);

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
                    const suggestion = suggestCommand(text);
                    const aiReply = suggestion ?? (await handleWhatsAppMessage(fromNumber, text));

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
