import { prisma } from "@/lib/prisma";
import { generateWhatsAppMessage } from "@/lib/deepseek";

const WHATSAPP_API_VERSION = "v22.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";

interface WhatsAppApiResponse {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
  error?: { message: string; type: string; code: number };
}

async function sendMessage(
  to: string,
  message: string
): Promise<WhatsAppApiResponse | null> {
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn("WhatsApp not configured: missing PHONE_NUMBER_ID or ACCESS_TOKEN");
    return null;
  }

  try {
    const normalizedNumber = to.replace(/[^0-9]/g, "");

    const response = await fetch(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
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
      console.error("WhatsApp send error:", data.error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("WhatsApp fetch error:", error);
    return null;
  }
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
  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    console.warn("WhatsApp not configured");
    return null;
  }

  try {
    const normalizedNumber = to.replace(/[^0-9]/g, "");

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
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
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
}

interface TaskWithDetails {
  id: string;
  title: string;
  description: string | null;
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

    const message = await generateWhatsAppMessage(context, "alert");
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

export {
  sendMessage,
  sendTemplateMessage,
  sendTaskReminder,
  sendDailySummary,
  sendAlert,
  sendEventReminder,
};
export type {
  WhatsAppApiResponse,
  TemplateParameter,
  UserWithWhatsApp,
  TaskWithDetails,
  EventWithDetails,
  StaffMember,
};
