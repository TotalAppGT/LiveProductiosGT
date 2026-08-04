import { prisma } from "@/lib/prisma";
import { generateWhatsAppMessage } from "@/lib/deepseek";
import { normalizeGTPhone } from "@/lib/phone";

interface WhatsAppApiResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: { message: string; type: string; code: number };
}

interface TwilioApiResponse {
  sid: string;
  status: string;
  error_code?: string | null;
  error_message?: string | null;
}

async function getWhatsAppConfig() {
  const config = await prisma.whatsAppConfig.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  return config;
}

async function getProvider(): Promise<"META" | "TWILIO"> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: "whatsapp_provider" },
    });
    return (config?.value as "META" | "TWILIO") || "META";
  } catch {
    return "META";
  }
}

async function getTwilioConfig() {
  try {
    const [accountSidConfig, authTokenConfig, phoneConfig] = await Promise.all([
      prisma.systemConfig.findUnique({ where: { key: "twilio_account_sid" } }),
      prisma.systemConfig.findUnique({ where: { key: "twilio_auth_token" } }),
      prisma.systemConfig.findUnique({ where: { key: "twilio_phone" } }),
    ]);
    return {
      accountSid: accountSidConfig?.value || process.env.TWILIO_ACCOUNT_SID || "",
      authToken: authTokenConfig?.value || process.env.TWILIO_AUTH_TOKEN || "",
      phoneNumber: phoneConfig?.value || process.env.TWILIO_PHONE_NUMBER || "",
    };
  } catch {
    return {
      accountSid: process.env.TWILIO_ACCOUNT_SID || "",
      authToken: process.env.TWILIO_AUTH_TOKEN || "",
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || "",
    };
  }
}

async function sendMetaMessage(
  to: string,
  phoneNumberId: string,
  accessToken: string,
  message: string
): Promise<WhatsAppApiResponse | null> {
  const WHATSAPP_API_VERSION = "v22.0";

  try {
    const normalizedNumber = normalizeGTPhone(to).replace(/\D/g, "");

    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedNumber,
          type: "text",
          text: {
            preview_url: false,
            body: message,
          },
        }),
      }
    );

    const data: WhatsAppApiResponse = await response.json();

    if (!response.ok || data.error) {
      console.error("WhatsApp Meta send error:", data.error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("WhatsApp Meta fetch error:", error);
    return null;
  }
}

async function sendTwilioMessage(
  to: string,
  twilioConfig: { accountSid: string; authToken: string; phoneNumber: string },
  message: string
): Promise<WhatsAppApiResponse | null> {
  try {
    const normalizedNumber = to.replace(/[^0-9]/g, "");
    const credentials = Buffer.from(
      `${twilioConfig.accountSid}:${twilioConfig.authToken}`
    ).toString("base64");

    const formBody = new URLSearchParams({
      To: `whatsapp:+${normalizedNumber}`,
      From: `whatsapp:+${twilioConfig.phoneNumber.replace(/[^0-9]/g, "")}`,
      Body: message,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formBody.toString(),
      }
    );

    const data: TwilioApiResponse = await response.json();

    if (!response.ok || data.error_message) {
      console.error("WhatsApp Twilio send error:", data.error_message);
      return null;
    }

    return {
      messaging_product: "whatsapp",
      messages: [{ id: data.sid }],
    };
  } catch (error) {
    console.error("WhatsApp Twilio fetch error:", error);
    return null;
  }
}

async function sendMessage(
  to: string,
  message: string
): Promise<WhatsAppApiResponse | null> {
  const provider = await getProvider();

  if (provider === "TWILIO") {
    const twilioConfig = await getTwilioConfig();
    if (!twilioConfig.accountSid || !twilioConfig.authToken || !twilioConfig.phoneNumber) {
      console.warn("WhatsApp Twilio not configured: missing accountSid, authToken, or phoneNumber");
      return null;
    }
    return sendTwilioMessage(to, twilioConfig, message);
  }

  const config = await getWhatsAppConfig();
  const phoneNumberId = config?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const accessToken = config?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";

  if (!phoneNumberId || !accessToken) {
    console.warn("WhatsApp Meta not configured: missing phoneNumberId or accessToken");
    return null;
  }

  return sendMetaMessage(to, phoneNumberId, accessToken, message);
}

interface TemplateParameter {
  type: "text" | "currency" | "date_time";
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
}

async function sendTemplateMessage(
  to: string,
  templateName: string,
  params: TemplateParameter[]
): Promise<WhatsAppApiResponse | null> {
  const provider = await getProvider();

  if (provider === "TWILIO") {
    console.warn("Twilio does not support WhatsApp template messages via basic API. Use sendMessage instead.");
    return null;
  }

  const config = await getWhatsAppConfig();
  const phoneNumberId = config?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const accessToken = config?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";

  if (!phoneNumberId || !accessToken) {
    console.warn("WhatsApp Meta not configured");
    return null;
  }

  const WHATSAPP_API_VERSION = "v22.0";

  try {
    const normalizedNumber = normalizeGTPhone(to).replace(/\D/g, "");

    const components = params.length > 0
      ? [
          {
            type: "body",
            parameters: params.map((p) => ({
              type: p.type,
              text: p.text,
              currency: p.currency,
              date_time: p.date_time,
            })),
          },
        ]
      : [];

    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: normalizedNumber,
          type: "template",
          template: {
            name: templateName,
            language: { code: "es" },
            components,
          },
        }),
      }
    );

    const data: WhatsAppApiResponse = await response.json();

    if (!response.ok || data.error) {
      console.error("WhatsApp template error:", data.error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("WhatsApp template fetch error:", error);
    return null;
  }
}

interface UserWithWhatsApp {
  id: string;
  name: string;
  phone: string | null;
  whatsappNumber: string | null;
  role?: string;
}

interface TaskWithDetails {
  id?: string;
  title: string;
  description?: string | null;
  priority: string;
  dueDate: Date | null;
  status: string;
}

async function sendTaskReminder(
  user: UserWithWhatsApp,
  task: TaskWithDetails
): Promise<boolean> {
  const to = user.whatsappNumber || user.phone;
  if (!to) {
    console.warn(`No WhatsApp number for user ${user.name}`);
    return false;
  }

  const context = {
    recipientName: user.name,
    taskTitle: task.title,
    dueDate: task.dueDate?.toISOString().split("T")[0],
    priority: task.priority,
  };

  const message = await generateWhatsAppMessage(context, "reminder");
  const fullMessage = `🔔 *Recordatorio de Tarea*\n\n${message}`;
  const result = await sendMessage(to, fullMessage);

  if (result?.messages?.[0]?.id) {
    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        toNumber: to,
        message: fullMessage,
        type: "TASK_REMINDER",
        status: "SENT",
        relatedTaskId: task.id,
      },
    });
    return true;
  }

  await prisma.whatsAppMessage.create({
    data: {
      userId: user.id,
      toNumber: to,
      message: fullMessage,
      type: "TASK_REMINDER",
      status: "FAILED",
      relatedTaskId: task.id,
    },
  });

  return false;
}

async function sendDailySummary(
  user: UserWithWhatsApp,
  tasks: TaskWithDetails[]
): Promise<boolean> {
  const to = user.whatsappNumber || user.phone;
  if (!to) return false;

  const completedCount = tasks.filter((t) => t.status === "COMPLETADA").length;
  const pendingCount = tasks.filter((t) => t.status === "PENDIENTE").length;

  const context = {
    recipientName: user.name,
    taskCount: tasks.length,
    completedCount,
    pendingCount,
  };

  const message = await generateWhatsAppMessage(context, "summary");
  const fullMessage = `📊 *Resumen Diario*\n\n${message}`;

  const result = await sendMessage(to, fullMessage);

  if (result?.messages?.[0]?.id) {
    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        toNumber: to,
        message: fullMessage,
        type: "NOTIFICATION",
        status: "SENT",
      },
    });
    return true;
  }

  return false;
}

async function sendAlert(
  users: UserWithWhatsApp[],
  alertMessage: string
): Promise<string[]> {
  const sent: string[] = [];
  const failed: string[] = [];

  for (const user of users) {
    const to = user.whatsappNumber || user.phone;
    if (!to) {
      failed.push(user.id);
      continue;
    }

    const context = {
      recipientName: user.name,
      message: alertMessage,
    };

    await generateWhatsAppMessage(context, "alert");
    const fullMessage = `⚠️ *Alerta*\n\n${alertMessage}`;
    const result = await sendMessage(to, fullMessage);

    if (result?.messages?.[0]?.id) {
      sent.push(user.id);
      await prisma.whatsAppMessage.create({
        data: {
          userId: user.id,
          toNumber: to,
          message: fullMessage,
          type: "ALERT",
          status: "SENT",
        },
      });
    } else {
      failed.push(user.id);
    }
  }

  return sent;
}

interface EventWithDetails {
  id: string;
  name: string;
  date: Date;
  location?: string | null;
  clientName: string;
}

interface StaffMember {
  user: UserWithWhatsApp;
  role: string;
}

async function sendEventReminder(
  event: EventWithDetails,
  staff: StaffMember[]
): Promise<string[]> {
  const sent: string[] = [];

  for (const member of staff) {
    const to = member.user.whatsappNumber || member.user.phone;
    if (!to) continue;

    const context = {
      recipientName: member.user.name,
      eventName: event.name,
      eventDate: event.date.toISOString().split("T")[0],
      location: event.location || undefined,
      role: member.role,
    };

    const message = await generateWhatsAppMessage(context, "event");
    const fullMessage = `🎪 *Recordatorio de Evento*\n\n${message}`;
    const result = await sendMessage(to, fullMessage);

    if (result?.messages?.[0]?.id) {
      sent.push(member.user.id);
      await prisma.whatsAppMessage.create({
        data: {
          userId: member.user.id,
          toNumber: to,
          message: fullMessage,
          type: "EVENT_REMINDER",
          status: "SENT",
          relatedEventId: event.id,
        },
      });
    }
  }

  return sent;
}

interface AIAssistantContext {
  user: UserWithWhatsApp;
  pendingTasks: TaskWithDetails[];
  upcomingEvents: { name: string; clientName: string; date: Date }[];
  complianceRate: number;
}

async function sendAIAssistantReply(
  to: string,
  context: AIAssistantContext
): Promise<boolean> {
  const { user, pendingTasks, upcomingEvents, complianceRate } = context;

  const taskLines = pendingTasks
    .slice(0, 10)
    .map((t) => `${t.title} | Estado: ${t.status} | Prioridad: ${t.priority} | Vence: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString("es-GT") : "Sin fecha"}`)
    .join("\n");

  const eventLines = upcomingEvents
    .slice(0, 5)
    .map((e) => `${e.name} | Cliente: ${e.clientName} | Fecha: ${new Date(e.date).toLocaleDateString("es-GT")}`)
    .join("\n");

  const prompt = `Eres el asistente inteligente de WhatsApp de Live Productions. Genera un resumen proactivo para ${user.name} (rol: ${user.role || "Empleado"}).

Tareas pendientes: ${taskLines || "Ninguna"}
Próximos eventos: ${eventLines || "Ninguno"}
Cumplimiento 30d: ${complianceRate}%

Genera un mensaje motivador, conciso y profesional en español (máximo 3 párrafos) que incluya un resumen de sus tareas, eventos y cumplimiento.`;

  try {
    const { askAI } = await import("@/lib/ai-brain");
    const reply = await askAI(
      [{ role: "user", content: prompt }],
      { temperature: 0.7, maxTokens: 800 }
    );

    const fullMessage = `🤖 *Asistente Live Productions*\n\n${reply}`;
    const result = await sendMessage(to, fullMessage);

    if (result?.messages?.[0]?.id) {
      await prisma.whatsAppMessage.create({
        data: {
          userId: user.id,
          toNumber: to,
          message: fullMessage,
          type: "NOTIFICATION",
          status: "SENT",
        },
      });
      return true;
    }

    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        toNumber: to,
        message: fullMessage,
        type: "NOTIFICATION",
        status: "FAILED",
      },
    });
    return false;
  } catch (error) {
    console.error("sendAIAssistantReply error:", error);

    const fallback = `🤖 *Asistente Live Productions*\n\nHola ${user.name}, tienes ${pendingTasks.length} tareas pendientes y ${upcomingEvents.length} eventos próximos. Tu cumplimiento en los últimos 30 días es del ${complianceRate}%. ¡Sigue así! 💪`;
    await sendMessage(to, fallback).catch(() => {});
    return false;
  }
}

async function sendAutomatedReminder(
  user: UserWithWhatsApp,
  context: {
    trigger: "morning_briefing" | "evening_recap" | "overdue" | "inactivity";
    pendingTasks?: TaskWithDetails[];
    upcomingEvents?: { name: string; clientName: string; date: Date }[];
    completedToday?: number;
    complianceRate?: number;
  }
): Promise<boolean> {
  const to = user.whatsappNumber || user.phone;
  if (!to) {
    console.warn(`No WhatsApp number for user ${user.name}`);
    return false;
  }

  const tasks = context.pendingTasks || [];
  const events = context.upcomingEvents || [];

  const taskLines = tasks
    .map((t) => `• ${t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🟠" : "🔵"} ${t.title}${t.dueDate ? ` (${new Date(t.dueDate).toLocaleDateString("es-GT")})` : ""}`)
    .join("\n");

  const eventLines = events
    .map((e) => `• 🎪 ${e.name} - ${e.clientName} - ${new Date(e.date).toLocaleDateString("es-GT")}`)
    .join("\n");

  let aiPrompt = "";
  let title = "";

  if (context.trigger === "morning_briefing") {
    title = "☀️ *Briefing Matutino*";
    aiPrompt = `Genera un mensaje motivador de buenos días para ${user.name}. Tiene ${tasks.length} tareas pendientes y ${events.length} eventos. Sé breve, energético y profesional. Máximo 2 oraciones en español.`;
  } else if (context.trigger === "evening_recap") {
    title = "🌙 *Recap de la Tarde*";
    const completed = context.completedToday || 0;
    aiPrompt = `Genera un mensaje de cierre de jornada para ${user.name}. Completaste ${completed} tareas hoy. Quedan ${tasks.length} pendientes. Sé motivador y reconoce el esfuerzo. Máximo 2 oraciones en español.`;
  } else if (context.trigger === "overdue") {
    title = "⏰ *Tareas Vencidas*";
    aiPrompt = `Genera un mensaje de alerta para ${user.name} que tiene ${tasks.length} tareas vencidas. Sé urgente pero profesional. Máximo 2 oraciones en español.`;
  } else if (context.trigger === "inactivity") {
    title = "👋 *Te Extrañamos*";
    aiPrompt = `Genera un mensaje para motivar a ${user.name} que no ha accedido al sistema. Su tasa de cumplimiento es del ${context.complianceRate || 0}%. Sé amable y motivador. Máximo 2 oraciones en español.`;
  }

  let aiMessage = "";
  try {
    const { askAI } = await import("@/lib/ai-brain");
    aiMessage = await askAI(
      [{ role: "user", content: aiPrompt }],
      { temperature: 0.7, maxTokens: 300 }
    );
  } catch {
    aiMessage = "";
  }

  let fullMessage = title;

  if (context.trigger === "morning_briefing") {
    if (taskLines) fullMessage += `\n\n📋 *Tareas (${tasks.length})*\n${taskLines}`;
    if (eventLines) fullMessage += `\n\n🎪 *Eventos (${events.length})*\n${eventLines}`;
    if (aiMessage) fullMessage += `\n\n${aiMessage}`;
    if (!taskLines && !eventLines) fullMessage += `\n\n${aiMessage || "¡Que tengas un excelente día! 💪"}`;
  } else if (context.trigger === "evening_recap") {
    fullMessage += `\n\n✅ Completadas hoy: ${context.completedToday || 0}\n📋 Pendientes: ${tasks.length}`;
    if (taskLines) fullMessage += `\n\n${taskLines}`;
    if (aiMessage) fullMessage += `\n\n${aiMessage}`;
  } else if (context.trigger === "overdue") {
    fullMessage += `\n\n${taskLines}`;
    if (aiMessage) fullMessage += `\n\n${aiMessage}`;
  } else if (context.trigger === "inactivity") {
    fullMessage += `\n\nCumplimiento 30d: ${context.complianceRate || 0}%\nTareas pendientes: ${tasks.length}`;
    if (aiMessage) fullMessage += `\n\n${aiMessage}`;
  }

  try {
    const result = await sendMessage(to, fullMessage);
    const status = result?.messages?.[0]?.id ? "SENT" : "FAILED";

    await prisma.whatsAppMessage.create({
      data: {
        userId: user.id,
        toNumber: to,
        message: fullMessage,
        type: "NOTIFICATION",
        status,
      },
    });

    return status === "SENT";
  } catch (error) {
    console.error("sendAutomatedReminder error:", error);
    return false;
  }
}

async function sendTextMessage(
  to: string,
  message: string
): Promise<WhatsAppApiResponse | null> {
  return sendMessage(to, message);
}

export {
  sendMessage,
  sendTextMessage,
  sendTemplateMessage,
  sendTaskReminder,
  sendDailySummary,
  sendAlert,
  sendEventReminder,
  sendAIAssistantReply,
  sendAutomatedReminder,
};
export type {
  WhatsAppApiResponse,
  TemplateParameter,
  UserWithWhatsApp,
  TaskWithDetails,
  EventWithDetails,
  StaffMember,
};
