import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { askAI } from "@/lib/ai-brain";
import { sendMessage } from "@/lib/whatsapp";

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

async function formatTasksForUser(userId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: userId,
      status: { in: ["PENDIENTE", "EN_PROCESO"] },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 15,
  });
  return tasks
    .map(
      (t) =>
        `${t.title} | Estado: ${t.status} | Prioridad: ${t.priority} | Vence: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString("es-GT") : "Sin fecha"}`
    )
    .join("\n");
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
        `${e.name} | Cliente: ${e.clientName} | Fecha: ${new Date(e.date).toLocaleDateString("es-GT")}`
    )
    .join("\n");
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

  if (cmd === "tareas") {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `Hola ${user.name}, no tienes tareas pendientes. ¡Buen trabajo! 🎉`;
    return `📋 *Tus Tareas Pendientes - ${user.name}*\n\n${tasks}`;
  }

  if (cmd === "eventos") {
    const events = await formatEventsForUser(user.id);
    if (!events) return `Hola ${user.name}, no tienes eventos próximos registrados.`;
    return `🎪 *Tus Próximos Eventos - ${user.name}*\n\n${events}`;
  }

  if (cmd === "resumen") {
    const [tasks, events, compliance] = await Promise.all([
      formatTasksForUser(user.id),
      formatEventsForUser(user.id),
      getComplianceSummary(user.id),
    ]);
    const tasksStr = tasks || "Sin tareas pendientes";
    const eventsStr = events || "Sin eventos próximos";
    return `📊 *Resumen - ${user.name}*\n\n📋 *Tareas:*\n${tasksStr}\n\n🎪 *Eventos:*\n${eventsStr}\n\n📈 *Cumplimiento:*\n${compliance}`;
  }

  if (cmd === "ayuda") {
    return `🤖 *Asistente Live Productions*\n\nComandos disponibles:\n• *tareas* - Ver tus tareas pendientes\n• *eventos* - Ver tus próximos eventos\n• *resumen* - Resumen completo de tu actividad\n• *ayuda* - Mostrar esta ayuda\n\nTambién puedes escribir cualquier pregunta y te responderé con IA.`;
  }

  return null;
}

async function generateAIAssistantReply(
  user: { id: string; name: string; role: string },
  messageText: string
): Promise<string> {
  const [tasks, events, compliance] = await Promise.all([
    formatTasksForUser(user.id),
    formatEventsForUser(user.id),
    getComplianceSummary(user.id),
  ]);

  const prompt = `Eres el asistente inteligente de WhatsApp de Live Productions, una empresa guatemalteca de producción de eventos en vivo. Responde al usuario "${user.name}" (rol: ${user.role}) de forma concisa, profesional y en español.

Información del usuario:
- Tareas pendientes: ${tasks || "Ninguna"}
- Próximos eventos: ${events || "Ninguno"}
- Cumplimiento 30d: ${compliance}

Mensaje del usuario: "${messageText}"

Responde directamente al usuario con información útil basada en su contexto. Máximo 3 párrafos cortos.`;

  try {
    const response = await askAI(
      [{ role: "user", content: prompt }],
      { temperature: 0.7, maxTokens: 800 }
    );
    return response;
  } catch {
    return `¡Hola ${user.name}! Soy el asistente de Live Productions. Escribe *ayuda* para ver qué puedo hacer por ti.`;
  }
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
              const text = message.text?.body?.trim() || "";
              const contact = contacts.find(
                (c: any) => c.wa_id === fromNumber
              );
              const contactName = contact?.profile?.name || "Desconocido";

              console.log("Mensaje recibido de WhatsApp:", {
                from: fromNumber,
                contactName,
                text,
                type: message.type,
                timestamp: message.timestamp,
              });

              if (!text || message.type !== "text") continue;

              try {
                const normalizedFrom = fromNumber.replace(/[^0-9]/g, "");

                const user = await prisma.user.findFirst({
                  where: {
                    OR: [
                      { whatsappNumber: normalizedFrom },
                      { whatsappNumber: fromNumber },
                      { phone: normalizedFrom },
                      { phone: fromNumber },
                    ],
                  },
                  select: { id: true, name: true, role: true, whatsappNumber: true },
                });

                if (user) {
                  const commandResponse = await handleCommand(text, user);
                  const reply = commandResponse || await generateAIAssistantReply(user, text);

                  const sendResult = await sendMessage(fromNumber, reply);

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
                      message: `[RESPUESTA AI] ${reply}`,
                      type: "CHAT",
                      status: sendResult ? "SENT" : "FAILED",
                    },
                  });

                  await prisma.activity.create({
                    data: {
                      userId: user.id,
                      action: "WHATSAPP_AI_REPLY",
                      resource: "WHATSAPP",
                      details: `Mensaje de WhatsApp respondido con IA para ${user.name} (${fromNumber})`,
                    },
                  });
                } else {
                  const welcomeMsg =
                    "¡Hola! 👋 Soy el asistente virtual de *Live Productions*. " +
                    "Parece que tu número no está registrado en nuestro sistema. " +
                    "Por favor contacta a tu administrador para que te agregue con tu número de WhatsApp.\n\n" +
                    "📞 Teléfono: +502 3090-3172\n🌐 liveproductionsgt.com";

                  await sendMessage(fromNumber, welcomeMsg);

                  console.log(`Mensaje de bienvenida enviado a número no registrado: ${fromNumber}`);
                }
              } catch (err) {
                console.error("Error al procesar mensaje entrante:", err);
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
