import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleWhatsAppMessage } from "@/lib/ai-brain";
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

async function formatTasksForUser(userId: string) {
  const tasks = await prisma.task.findMany({
    where: {
      assignedToId: userId,
      status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] },
    },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 15,
  });
  console.log(`[Tasks] userId=${userId}, found=${tasks.length}`);
  return tasks
    .map(
      (t, i) => {
        const prio = t.priority === "URGENTE" ? "🔴" : t.priority === "ALTA" ? "🟠" : t.priority === "MEDIA" ? "🔵" : "⚪";
        const statusText = t.status === "REPROGRAMADA" 
          ? `Reprogramada → ${t.rescheduledTo ? new Date(t.rescheduledTo).toLocaleDateString("es-GT") : new Date(t.dueDate!).toLocaleDateString("es-GT")}`
          : t.status === "EN_PROCESO" ? "En proceso" : "Pendiente";
        const reason = t.status === "REPROGRAMADA" && t.postponeReason ? `\n   _Razón: ${t.postponeReason}_` : "";
        return `${i + 1}. ${prio} *${t.title}* - ${statusText}${t.dueDate && t.status !== "REPROGRAMADA" ? ` - Vence: ${new Date(t.dueDate).toLocaleDateString("es-GT")}` : ""}${reason}`;
      }
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

  if (cmd === "tareas" || cmd === "mis tareas" || cmd.includes("tarea") || cmd.includes("pendiente")) {
    const tasks = await formatTasksForUser(user.id);
    if (!tasks) return `Hola ${user.name}, no tienes tareas pendientes. ¡Excelente trabajo! 🎉`;
    return `📋 *Tareas Pendientes - ${user.name}*\n\n${tasks}\n\n⚡ *Acciones rápidas:*\n• \`completar 3\` - Marcar tarea #3 como hecha\n• \`posponer 5 mañana razón\` - Posponer #5\n• \`comentar 4 texto\` - Agregar comentario\n• \`transferir 2 a Diana\` - Pasar tarea a otro\n• \`equipo\` - Ver compañeros disponibles`;
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
    return `🤖 *LUNA - Asistente Live Productions*\n\n📊 *Prioridades:*\n🔴 URGENTE | 🟠 ALTA | 🔵 MEDIA | ⚪ BAJA\n\n*Comandos:*\n• *tareas* - Ver tus tareas pendientes\n• *completar 3* - Completar tarea #3\n• *posponer 3 razón* - Posponer tarea #3\n• *comentar 3 texto* - Agregar comentario\n• *transferir 3 a Diana* - Pasar tarea a otro\n• *equipo* - Ver compañeros\n• *eventos* - Ver tus próximos eventos\n• *evento [nombre]* - Buscar un evento\n• *resumen* - Resumen completo\n• *ayuda* - Mostrar esta ayuda\n\nTambién puedes escribir cualquier pregunta y LUNA te responderá con IA.\n\n📞 +502 3090-3172\n🌐 liveproductionsgt.com\n\nAccede al sistema: https://liveproductiosgt-production.up.railway.app`;
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
