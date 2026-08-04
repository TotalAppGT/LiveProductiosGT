import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

export const LUNA_SYSTEM_PROMPT = `Eres LUNA, la asistente de inteligencia artificial de Live Productions, 
una empresa líder en producción de eventos en Guatemala. 

DATOS DE LA EMPRESA:
- Dirección: 16 avenida A 28-76 zona 13 Elgin 2, Guatemala
- Teléfono: +502 3090 3172
- Sitio: liveproductionsgt.com
- Dueño: Ing. Jorge Mérida Godoy

SERVICIOS PRINCIPALES:
- DJ COMPLETO, SAXOFONIC COMPLETO, SAXOFONIC CON AUDIO, SUNDAY FUNDAY COMPLETO A y B
- Audio profesional (QSC, T4/JBL, Turbosound)
- Iluminación profesional, pantallas LED, tarimas
- Músicos (Saxofonic, violinistas, percusionistas, etc.)
- Pirotecnia fría, pistola LED CO2, cañón de confeti
- Personajes cabezones animadores, batucada

EQUIPO / PERSONAL:
- Jorge Mérida (Dueño) - Dirección general
- Diana/Brenda (Coordinación) - Cotizaciones, cobros, clientes, redes
- Abel (Logística) - Vehículos, pilotos, combustible, bodega
- Selvin (Técnico) - Staff, cuadros de equipo, montajes
- Exequiel (Bodega) - Inventario, reparaciones, mantenimiento

PROCESO SEMANAL:
- LUNES: Cotizaciones, seguimiento bodega, inventario Elgin, vehículos
- MARTES: Llamada con Jorge, inventario consumibles, compras
- MIÉRCOLES: Cobros, pagos músicos/staff, mantenimiento
- JUEVES: Preparación eventos fin de semana, cuadros de equipo
- VIERNES-SÁBADO-DOMINGO: Montaje y ejecución de eventos

CICLO DE EVENTOS:
- PRE-EVENTO: Confirmar staff, equipo, cobros, logística
- MONTAJE: Estar pendiente, seguimiento staff, reglas de eventos
- POST-EVENTO: Revisión equipo, reportes daños, pagos, cobros pendientes

UBICACIONES DE BODEGA:
- Bodega Elgin (principal)
- Bodega PP (Piedra Parada)

TUS FUNCIONES:
- Recordar tareas diarias a cada persona
- Alertar sobre tareas vencidas o no completadas
- Dar seguimiento de cumplimiento del equipo
- Reportar eventos próximos
- Sugerir asignaciones de tareas
- Generar reportes de desempeño
- Responder preguntas sobre procesos de la empresa
- Ayudar con la planificación semanal

REGLAS:
- Sé concisa pero útil (máximo 3-4 oraciones en WhatsApp)
- Prioriza las tareas urgentes
- Usa español de Guatemala
- Los montos siempre en Quetzales (Q)
- Conoces a cada persona por su nombre`;

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

const PROVIDER_ORDER = ["DEEPSEEK", "OPENAI", "NVIDIA"] as const;

const PROVIDER_BASE_URLS: Record<string, string> = {
  DEEPSEEK: "https://api.deepseek.com/v1",
  OPENAI: "https://api.openai.com/v1",
  OPENROUTER: "https://openrouter.ai/api/v1",
  NVIDIA: "https://integrate.api.nvidia.com/v1",
};

const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  DEEPSEEK: "deepseek-chat",
  OPENAI: "gpt-4o-mini",
  OPENROUTER: "openai/gpt-4o",
  NVIDIA: "deepseek-ai/deepseek-v4-pro",
};

let cachedClient: OpenAI | null = null;
let cachedClientKey: string | null = null;

async function getAISettings() {
  const settings = await prisma.aISettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return settings;
}

function getCachedClient(settings: { apiKey: string; baseUrl: string }): OpenAI | null {
  const key = `${settings.apiKey}:${settings.baseUrl}`;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  return null;
}

function setCachedClient(settings: { apiKey: string; baseUrl: string }, client: OpenAI) {
  cachedClientKey = `${settings.apiKey}:${settings.baseUrl}`;
  cachedClient = client;
}

function invalidateCache() {
  cachedClient = null;
  cachedClientKey = null;
}

async function getOpenAIClient(settings: { apiKey: string; baseUrl: string }): Promise<OpenAI> {
  const cached = getCachedClient(settings);
  if (cached) return cached;

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });

  setCachedClient(settings, client);
  return client;
}

function getEnvApiKey(provider: string): string | undefined {
  const envMap: Record<string, string | undefined> = {
    DEEPSEEK: process.env.DEEPSEEK_API_KEY,
    OPENAI: process.env.OPENAI_API_KEY,
    OPENROUTER: process.env.OPENROUTER_API_KEY,
    NVIDIA: process.env.NVIDIA_API_KEY,
  };
  return envMap[provider];
}

async function resolveProviderFallback(
  dbSettings: Awaited<ReturnType<typeof getAISettings>>
): Promise<{
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}> {
  const primaryProvider = dbSettings?.provider || "DEEPSEEK";
  const primaryApiKey = dbSettings?.apiKey || getEnvApiKey(primaryProvider);

  if (primaryApiKey) {
    return {
      provider: primaryProvider,
      apiKey: primaryApiKey,
      baseUrl: dbSettings?.baseUrl || PROVIDER_BASE_URLS[primaryProvider] || "https://api.deepseek.com/v1",
      model: dbSettings?.model || PROVIDER_DEFAULT_MODELS[primaryProvider] || "deepseek-chat",
      temperature: dbSettings?.temperature ?? 0.7,
      maxTokens: dbSettings?.maxTokens ?? 2000,
    };
  }

  for (const fallbackProvider of PROVIDER_ORDER) {
    if (fallbackProvider === primaryProvider) continue;
    const fallbackApiKey = getEnvApiKey(fallbackProvider);
    if (fallbackApiKey) {
      console.warn(`[AI-Brain] ${primaryProvider} sin API key, usando fallback: ${fallbackProvider}`);
      return {
        provider: fallbackProvider,
        apiKey: fallbackApiKey,
        baseUrl: PROVIDER_BASE_URLS[fallbackProvider],
        model: PROVIDER_DEFAULT_MODELS[fallbackProvider],
        temperature: dbSettings?.temperature ?? 0.7,
        maxTokens: dbSettings?.maxTokens ?? 2000,
      };
    }
  }

  throw new Error(
    "No se pudo configurar ningún proveedor de IA. Verifique que al menos una API key (DEEPSEEK, OPENAI o NVIDIA) esté configurada en las variables de entorno o en Admin > IA & Modelos."
  );
}

export async function getAIClient(): Promise<{
  client: OpenAI;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  provider: string;
  topP: number;
}> {
  const settings = await getAISettings();
  const resolved = await resolveProviderFallback(settings);

  const systemPrompt = settings?.systemPrompt || LUNA_SYSTEM_PROMPT;
  const client = await getOpenAIClient({
    apiKey: resolved.apiKey,
    baseUrl: resolved.baseUrl,
  });

  return {
    client,
    model: resolved.model,
    systemPrompt,
    temperature: resolved.temperature,
    maxTokens: resolved.maxTokens,
    provider: resolved.provider,
    topP: 0.95,
  };
}

export async function askAI(
  messages: AIMessage[],
  options?: AIOptions
): Promise<string> {
  try {
    const { client, model, systemPrompt, temperature, maxTokens, provider, topP } =
      await getAIClient();

    const fullMessages: AIMessage[] =
      messages[0]?.role === "system"
        ? messages
        : [{ role: "system", content: systemPrompt }, ...messages];

    const baseParams: Record<string, unknown> = {
      model,
      messages: fullMessages,
      temperature: options?.temperature ?? temperature,
      top_p: topP,
      max_tokens: options?.maxTokens ?? maxTokens,
      stream: false as const,
    };

    if (provider === "NVIDIA") {
      baseParams.extra_body = { chat_template_kwargs: { thinking: false } };
    }

    if (options?.responseFormat === "json") {
      baseParams.response_format = { type: "json_object" as const };
    }

    const response = await client.chat.completions.create(
      baseParams as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
    );

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("askAI error:", error);
    invalidateCache();
    return "Lo siento, no pude procesar tu solicitud en este momento. Por favor intenta de nuevo.";
  }
}

async function formatTasksForAI(tasks: Record<string, unknown>[]) {
  return tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title} | Estado: ${t.status} | Prioridad: ${t.priority || "N/A"} | Vence: ${t.dueDate ? new Date(t.dueDate as string | Date).toISOString().split("T")[0] : "Sin fecha"} | Asignado a: ${(t.assignedTo as { name?: string } | undefined)?.name || "Nadie"}`
    )
    .join("\n");
}

async function formatEventsForAI(events: Record<string, unknown>[]) {
  return events
    .map(
      (e, i) =>
        `${i + 1}. ${e.name} | Cliente: ${e.clientName} | Fecha: ${new Date(e.date as string | Date).toISOString().split("T")[0]} | Estado: ${e.status}`
    )
    .join("\n");
}

export async function analyzeTaskContext(
  tasks: Record<string, unknown>[],
  events: Record<string, unknown>[],
  user: { name: string; role: string }
): Promise<{
  summary: string;
  suggestions: string[];
  criticalTasks: string[];
}> {
  try {
    const taskListText = await formatTasksForAI(tasks);
    const eventListText = await formatEventsForAI(events);

    const response = await askAI(
      [
        {
          role: "user",
          content: `Analiza el contexto de la empresa y proporciona recomendaciones. Responde SOLO en JSON sin markdown: { "summary": string, "suggestions": string[], "criticalTasks": string[] }\n\nUsuario actual: ${user.name} (${user.role})\n\nTAREAS:\n${taskListText || "Sin tareas"}\n\nEVENTOS:\n${eventListText || "Sin eventos"}`,
        },
      ],
      { responseFormat: "json", temperature: 0.3 }
    );

    const jsonStart = response.indexOf("{");
    const jsonEnd = response.lastIndexOf("}") + 1;
    return JSON.parse(response.slice(jsonStart, jsonEnd));
  } catch (error) {
    console.error("analyzeTaskContext error:", error);
    return {
      summary: "No se pudo analizar el contexto.",
      suggestions: [],
      criticalTasks: [],
    };
  }
}

export async function generateSmartAlert(context: {
  title: string;
  description?: string;
  priority?: string;
  assigneeName?: string;
  dueDate?: string;
  overdue?: boolean;
  alertType: "reminder" | "overdue" | "escalation" | "inactivity" | "assignment";
}): Promise<string> {
  try {
    const alertTypePrompts: Record<string, string> = {
      reminder:
        "Genera un mensaje de recordatorio motivador para una tarea pendiente.",
      overdue:
        "Genera un mensaje de alerta por tarea vencida. Sé urgente pero profesional.",
      escalation:
        "Genera un mensaje de escalación urgente para administradores sobre tareas vencidas.",
      inactivity:
        "Genera un mensaje para motivar a un usuario que no ha accedido al sistema.",
      assignment:
        "Genera un mensaje notificando nueva asignación de tarea.",
    };

    const response = await askAI(
      [
        {
          role: "user",
          content: `${alertTypePrompts[context.alertType] || alertTypePrompts.reminder}\n\nContexto: ${JSON.stringify(context)}\n\nResponde SOLO con el texto del mensaje, sin comillas ni formato adicional. Máximo 3 oraciones. En español.`,
        },
      ],
      { temperature: 0.7, maxTokens: 300 }
    );

    return response.trim();
  } catch (error) {
    console.error("generateSmartAlert error:", error);
    return context.alertType === "overdue"
      ? `La tarea "${context.title}" está vencida. Por favor atiéndela de inmediato.`
      : `Recordatorio: La tarea "${context.title}" requiere tu atención.`;
  }
}

export async function weeklyPerformanceReport(): Promise<string> {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [users, tasks, completedTasks, activities] = await Promise.all([
      prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true, _count: { select: { assignedTasks: true } } },
      }),
      prisma.task.findMany({
        where: { updatedAt: { gte: oneWeekAgo } },
        select: { id: true, title: true, status: true, assignedToId: true },
      }),
      prisma.task.findMany({
        where: { status: "COMPLETADA", updatedAt: { gte: oneWeekAgo } },
        select: { id: true, assignedToId: true },
      }),
      prisma.activity.findMany({
        where: { createdAt: { gte: oneWeekAgo } },
        select: { userId: true, action: true },
      }),
    ]);

    const perUser = users.map((u) => {
      const userTasks = tasks.filter((t) => t.assignedToId === u.id);
      const completed = completedTasks.filter((t) => t.assignedToId === u.id).length;
      const total = userTasks.length;
      const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      return `${u.name} (${u.role}): ${completed}/${total} completadas (${rate}%)`;
    });

    const response = await askAI(
      [
        {
          role: "user",
          content: `Genera un reporte semanal de desempeño del equipo para Live Productions Guatemala. Sé conciso pero detallado. En español.\n\nUsuarios:\n${perUser.join("\n")}\n\nTotal actividades: ${activities.length}`,
        },
      ],
      { temperature: 0.5, maxTokens: 1500 }
    );

    return response;
  } catch (error) {
    console.error("weeklyPerformanceReport error:", error);
    return "No se pudo generar el reporte semanal.";
  }
}

export async function detectAnomalies(): Promise<{
  anomalies: string[];
  severity: "low" | "medium" | "high";
}> {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const daysForPattern = new Date();
    daysForPattern.setDate(daysForPattern.getDate() - 7);

    const [overdueCount, inactiveUsers, tasksRescheduled, totalActiveUsers, recentCompleted] =
      await Promise.all([
        prisma.task.count({
          where: {
            status: { in: ["PENDIENTE", "EN_PROCESO"] },
            dueDate: { lt: new Date() },
          },
        }),
        prisma.user.findMany({
          where: {
            active: true,
            activities: { none: { createdAt: { gte: threeDaysAgo } } },
          },
          select: { name: true },
        }),
        prisma.task.count({
          where: {
            status: "REPROGRAMADA",
            updatedAt: { gte: daysForPattern },
          },
        }),
        prisma.user.count({ where: { active: true } }),
        prisma.task.count({
          where: {
            status: "COMPLETADA",
            updatedAt: { gte: threeDaysAgo },
          },
        }),
      ]);

    const anomalies: string[] = [];
    let severity: "low" | "medium" | "high" = "low";

    if (overdueCount > 10) {
      anomalies.push(`${overdueCount} tareas vencidas sin completar`);
      severity = "high";
    } else if (overdueCount > 5) {
      anomalies.push(`${overdueCount} tareas vencidas`);
      severity = "medium";
    }

    if (inactiveUsers.length > 0) {
      anomalies.push(
        `Usuarios inactivos (>3 días): ${inactiveUsers.map((u) => u.name).join(", ")}`
      );
      if (severity !== "high") severity = "medium";
    }

    if (tasksRescheduled > 3) {
      anomalies.push(
        `${tasksRescheduled} tareas reprogramadas en los últimos 7 días`
      );
    }

    if (recentCompleted === 0 && totalActiveUsers > 1) {
      anomalies.push("Ninguna tarea completada en los últimos 3 días");
      severity = "high";
    }

    if (anomalies.length === 0) {
      anomalies.push("No se detectaron anomalías significativas");
    }

    return { anomalies, severity };
  } catch (error) {
    console.error("detectAnomalies error:", error);
    return { anomalies: ["Error al detectar anomalías"], severity: "low" };
  }
}

export async function summarizeCompany(): Promise<string> {
  try {
    const [userCount, taskStats, eventStats, inventoryCount, vehicleCount, cobrosSum] =
      await Promise.all([
        prisma.user.count({ where: { active: true } }),
        prisma.task.groupBy({
          by: ["status"],
          _count: true,
        }),
        prisma.event.count({
          where: { status: { in: ["CONFIRMADO", "EN_PROGRESO"] } },
        }),
        prisma.inventoryItem.count(),
        prisma.vehicle.count(),
        prisma.cobro.aggregate({
          where: { status: { in: ["PENDIENTE", "PARCIAL"] } },
          _sum: { amount: true },
        }),
      ]);

    const statsText = `Usuarios activos: ${userCount}
Tareas por estado: ${taskStats.map((s) => `${s.status}: ${s._count}`).join(", ")}
Eventos activos: ${eventStats}
Items en inventario: ${inventoryCount}
Vehículos: ${vehicleCount}
Cobros pendientes: Q${cobrosSum._sum.amount || 0}`;

    const response = await askAI(
      [
        {
          role: "user",
          content: `Genera un resumen contextual de la empresa Live Productions Guatemala basado en estas estadísticas. Aporta insights útiles. En español, 2-3 párrafos.\n\n${statsText}`,
        },
      ],
      { temperature: 0.5, maxTokens: 800 }
    );

    return response;
  } catch (error) {
    console.error("summarizeCompany error:", error);
    return "No se pudo generar el resumen de la empresa.";
  }
}

interface UserContext {
  id: string;
  name: string;
  role: string;
  whatsappNumber?: string | null;
  phone?: string | null;
}

export async function getAIAssistantContext(userId: string): Promise<string> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });

    if (!user) return "";

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const now = new Date();

    const [pendingTasks, upcomingEvents, assignedCount, completedCount, recentActivity] =
      await Promise.all([
        prisma.task.findMany({
          where: {
            assignedToId: userId,
            status: { in: ["PENDIENTE", "EN_PROCESO"] },
          },
          orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
          take: 20,
        }),
        prisma.event.findMany({
          where: {
            date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) },
            status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
            OR: [{ plannerId: userId }, { responsibleId: userId }],
          },
          orderBy: { date: "asc" },
          take: 10,
        }),
        prisma.task.count({
          where: { assignedToId: userId, createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.task.count({
          where: { assignedToId: userId, status: "COMPLETADA", updatedAt: { gte: thirtyDaysAgo } },
        }),
        prisma.activity.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { action: true, resource: true, createdAt: true },
        }),
      ]);

    const complianceRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;

    const todayStr = now.toLocaleDateString("es-GT", { weekday: "long" }).toUpperCase();
    const taskLines = pendingTasks
      .map((t) => `${t.title} | ${t.status} | Prioridad: ${t.priority} | Vence: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString("es-GT") : "Sin fecha"}`)
      .join("; ");
    const eventLines = upcomingEvents
      .map((e) => `${e.name} | Cliente: ${e.clientName} | ${new Date(e.date).toLocaleDateString("es-GT")}`)
      .join("; ");
    const activityLines = recentActivity
      .map((a) => `${a.action} - ${new Date(a.createdAt).toLocaleDateString("es-GT")}`)
      .join("; ");

    return `USUARIO: ${user.name} (${user.role})
HOY ES: ${todayStr}
TAREAS PENDIENTES (${pendingTasks.length}): ${taskLines || "Ninguna"}
EVENTOS PRÓXIMOS (${upcomingEvents.length}): ${eventLines || "Ninguno"}
CUMPLIMIENTO 30 DÍAS: ${completedCount}/${assignedCount} (${complianceRate}%)
ACTIVIDAD RECIENTE: ${activityLines || "Sin actividad"}`;
  } catch (error) {
    console.error("getAIAssistantContext error:", error);
    return "";
  }
}

export async function handleWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<string> {
  try {
    const normalizedFrom = phoneNumber.replace(/[^0-9]/g, "");

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: normalizedFrom },
          { whatsappNumber: phoneNumber },
          { phone: normalizedFrom },
          { phone: phoneNumber },
        ],
      },
    });

    if (!user) {
      return "¡Hola! 👋 Soy LUNA, la asistente virtual de *Live Productions*. " +
        "Parece que tu número no está registrado en nuestro sistema. " +
        "Por favor contacta a tu administrador para que te agregue.\n\n" +
        "📞 Teléfono: +502 3090-3172\n🌐 liveproductionsgt.com";
    }

    const contextText = await getAIAssistantContext(user.id);

    const response = await askAI(
      [
        {
          role: "user",
          content: `El usuario ${user.name} (${user.role}) de Live Productions te ha enviado este mensaje por WhatsApp: "${message}"\n\nContexto actual del usuario:\n${contextText}\n\nResponde directamente al usuario de forma útil, concisa y profesional. Máximo 3-4 oraciones. Usa su nombre. En español de Guatemala.`,
        },
      ],
      { temperature: 0.7, maxTokens: 600 }
    );

    await prisma.activity.create({
      data: {
        userId: user.id,
        action: "WHATSAPP_AI_REPLY",
        resource: "WHATSAPP",
        details: `LUNA respondió a ${user.name} (${phoneNumber}): "${message.slice(0, 100)}"`,
      },
    });

    return response;
  } catch (error) {
    console.error("handleWhatsAppMessage error:", error);
    return "¡Hola! Soy LUNA, tu asistente de Live Productions. Lo siento, tuve un problema procesando tu mensaje. Por favor intenta de nuevo más tarde.";
  }
}

export async function generateTaskReminder(
  task: { title: string; priority: string; dueDate?: string | Date | null; status: string },
  user: { name: string; role: string },
  type: "morning" | "overdue" | "escalation"
): Promise<string> {
  try {
    const typePrompts: Record<string, string> = {
      morning:
        "Genera un recordatorio matutino sobre esta tarea. Motiva al usuario a completarla. Máximo 2 oraciones.",
      overdue:
        "Genera una alerta urgente porque esta tarea está vencida. Sé firme pero respetuoso. Máximo 2 oraciones.",
      escalation:
        "Genera un mensaje de escalación para el administrador. Esta tarea necesita atención urgente. Máximo 2 oraciones.",
    };

    const prompt = `${typePrompts[type] || typePrompts.morning}

Contexto:
- Tarea: ${task.title}
- Prioridad: ${task.priority}
- Estado: ${task.status}
- Vence: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString("es-GT") : "Sin fecha"}
- Asignado a: ${user.name} (${user.role})

Responde SOLO con el texto del recordatorio en español de Guatemala. Usa el nombre de la persona.`;

    const response = await askAI(
      [{ role: "user", content: prompt }],
      { temperature: 0.7, maxTokens: 200 }
    );

    return response.trim();
  } catch (error) {
    console.error("generateTaskReminder error:", error);
    if (type === "overdue") {
      return `⏰ ${user.name}, la tarea "${task.title}" está vencida. Por favor atiéndela lo antes posible.`;
    }
    return `📋 ${user.name}, recuerda completar la tarea "${task.title}". ¡Gracias!`;
  }
}

export { askAI as askDeepSeek };
