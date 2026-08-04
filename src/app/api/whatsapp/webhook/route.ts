import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppMessage } from "@/lib/ai-brain";
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
        `• ${t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🟠" : t.priority === "MEDIA" ? "🔵" : "⚪"} *${t.title}* - ${t.status === "PENDIENTE" ? "Pendiente" : "En proceso"}${t.dueDate ? ` - Vence: ${new Date(t.dueDate).toLocaleDateString("es-GT")}` : ""}`
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
        `• 🎪 *${e.name}* - Cliente: ${e.clientName} - ${new Date(e.date).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })} - ${e.location || "Sin ubicación"}`
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
    if (!tasks) return `Hola ${user.name}, no tienes tareas pendientes. ¡Excelente trabajo! 🎉`;
    return `📋 *Tareas Pendientes - ${user.name}*\n\n${tasks}\n\n_Responde directamente para hablar con LUNA, tu asistente IA._`;
  }

  if (cmd === "pendientes") {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `${user.name}, no tienes tareas pendientes. ¡Todo al día! ✅`;
    return `📋 *Tareas Pendientes - ${user.name}*\n\n${tasks}`;
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
    return `🤖 *LUNA - Asistente Live Productions*\n\n*Comandos disponibles:*\n• *tareas* - Ver tus tareas pendientes\n• *pendientes* - Ver tus tareas pendientes (versión compacta)\n• *eventos* - Ver tus próximos eventos\n• *evento [nombre]* - Buscar un evento específico\n• *resumen* - Resumen completo de tu actividad\n• *ayuda* - Mostrar esta ayuda\n\nTambién puedes escribir cualquier pregunta en lenguaje natural y LUNA te responderá con inteligencia artificial.\n\n📞 +502 3090-3172\n🌐 liveproductionsgt.com`;
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
              const text = message.text?.body?.trim() || "";

              console.log("Mensaje recibido de WhatsApp:", {
                from: fromNumber,
                contactName,
                type: messageType,
                hasText: !!text,
                timestamp: message.timestamp,
              });

              if (messageType && messageType !== "text") {
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

              if (!text) continue;

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
                    "📞 Teléfono: +502 3090-3172\n🌐 liveproductionsgt.com\n📍 16 avenida A 28-76 zona 13 Elgin 2, Guatemala";

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
