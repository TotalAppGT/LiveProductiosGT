import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { normalizeGTPhone } from "@/lib/phone";
import { sendMessage } from "@/lib/whatsapp";

export const LUNA_SYSTEM_PROMPT = `Eres LUNA, la asistente de inteligencia artificial y Controladora Administrativa de Live Productions, 
una empresa líder en producción de eventos en Guatemala. 

Cuando respondas por WhatsApp, PRESÉNTATE como LUNA al inicio si es la primera interacción del día. Tus mensajes deben sonar como de una controladora administrativa profesional: firme pero amable, exacta y con autoridad para dar seguimiento. Usa el nombre de la persona. Incluye el número de tarea cuando hables de una tarea específica. Ejemplo: "¡Hola Daniel! Soy LUNA, tu Controladora Administrativa. Hoy traigo novedades:"

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
- Javier Perez (Empleado) - Staff de apoyo, montajes
- Daniel (Administrador) - Sistema, tecnología, monitoreo

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

SEGUIMIENTO DE INGRESOS:
- Puedes consultar los ingresos de cada persona (cobros, comisiones, bonos)
- Tipos de ingreso: COBRO, COMISION, BONO, OTRO
- Para ver ingresos usa el contexto proporcionado

UBICACIONES DE BODEGA:
- Bodega Elgin (principal)
- Bodega PP (Piedra Parada)

TUS FUNCIONES COMO CONTROLADORA ADMINISTRATIVA:
- Recordar tareas diarias a cada persona
- Alertar sobre tareas vencidas o no completadas
- Dar seguimiento de cumplimiento del equipo
- Reportar eventos próximos
- Sugerir asignaciones de tareas
- Generar reportes de desempeño
- Responder preguntas sobre procesos de la empresa
- Ayudar con la planificación semanal
- Procesar lenguaje natural para acciones del sistema
- Monitorear accesos diarios del equipo (mínimo 4 accesos/día)
- Generar resumen de cumplimiento del equipo
- Identificar usuarios inactivos y alertar
- Enviar recordatorios masivos cuando se solicite

CONSULTAS ADMINISTRATIVAS QUE PUEDES RESPONDER:
- "¿cómo va el equipo hoy?" → Resumen de cumplimiento, accesos y tareas
- "¿quién no ha entrado?" → Lista de usuarios sin actividad hoy
- "alerta a los que no han completado sus tareas" → Disparar recordatorio masivo

ACCIONES QUE PUEDES SUGERIR:
- POSTPONE: Reprogramar una tarea para otra fecha
- CREATE_TASK: Crear una nueva tarea
- QUERY_INCOME: Consultar ingresos del equipo
- DELEGATE: Reasignar una tarea a otra persona
- STATUS: Cambiar el estado de una tarea
- ADMIN_OVERVIEW: Resumen administrativo del día

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

export async function getAdminOverview(): Promise<{
  summary: string;
  compliance: number;
  pendingTasks: number;
  overdueTasks: number;
  inactiveUsers: string[];
  actionItems: string[];
}> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const minDaily = 4;

    const [
      allUsers,
      pendingCount,
      overdueCount,
      activities,
      completedToday,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true },
      }),
      prisma.task.count({ where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } } }),
      prisma.task.count({
        where: {
          status: { in: ["PENDIENTE", "EN_PROCESO"] },
          dueDate: { lt: today },
        },
      }),
      prisma.activity.findMany({
        where: { createdAt: { gte: today } },
        select: { userId: true },
      }),
      prisma.task.count({
        where: { status: "COMPLETADA", updatedAt: { gte: today } },
      }),
    ]);

    const accessCounts = new Map<string, number>();
    for (const a of activities) {
      accessCounts.set(a.userId, (accessCounts.get(a.userId) || 0) + 1);
    }

    const inactiveUsers: string[] = [];
    const compliantUsers: string[] = [];
    const nonCompliantUsers: string[] = [];

    for (const user of allUsers) {
      const count = accessCounts.get(user.id) || 0;
      if (count === 0) {
        inactiveUsers.push(user.name);
      } else if (count < minDaily) {
        nonCompliantUsers.push(`${user.name} (${count}/${minDaily})`);
      } else {
        compliantUsers.push(user.name);
      }
    }

    const totalWithAccess = allUsers.length - inactiveUsers.length;
    const compliance = allUsers.length > 0 ? Math.round((compliantUsers.length / allUsers.length) * 100) : 0;

    const actionItems: string[] = [];
    if (inactiveUsers.length > 0) {
      actionItems.push(`Contactar a usuarios inactivos: ${inactiveUsers.join(", ")}`);
    }
    if (overdueCount > 0) {
      actionItems.push(`Revisar ${overdueCount} tareas vencidas`);
    }
    if (nonCompliantUsers.length > 0) {
      actionItems.push(`Dar seguimiento a usuarios con pocos accesos: ${nonCompliantUsers.join(", ")}`);
    }
    if (pendingCount > 10) {
      actionItems.push(`Hay ${pendingCount} tareas pendientes acumuladas - considerar redistribución`);
    }

    const summaryLines = [
      `👥 Equipo: ${totalWithAccess}/${allUsers.length} activos hoy (${compliance}% cumplimiento de accesos)`,
      inactiveUsers.length > 0 ? `🚫 Sin acceso hoy: ${inactiveUsers.join(", ")}` : null,
      `📋 Tareas pendientes: ${pendingCount} | ⏰ Vencidas: ${overdueCount}`,
      `✅ Completadas hoy: ${completedToday}`,
      nonCompliantUsers.length > 0 ? `⚠️ Bajo el mínimo de accesos: ${nonCompliantUsers.join(", ")}` : null,
      actionItems.length > 0 ? `\n📌 *Acciones sugeridas:*\n${actionItems.map((a) => `• ${a}`).join("\n")}` : null,
    ].filter(Boolean).join("\n");

    return {
      summary: summaryLines,
      compliance,
      pendingTasks: pendingCount,
      overdueTasks: overdueCount,
      inactiveUsers,
      actionItems,
    };
  } catch (error) {
    console.error("getAdminOverview error:", error);
    return {
      summary: "Error al generar resumen administrativo",
      compliance: 0,
      pendingTasks: 0,
      overdueTasks: 0,
      inactiveUsers: [],
      actionItems: [],
    };
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
    const normalizedFrom = normalizeGTPhone(phoneNumber);
    const normalizedFromDigits = normalizedFrom.replace(/\D/g, "");

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { whatsappNumber: normalizedFrom },
          { whatsappNumber: normalizedFromDigits },
          { whatsappNumber: phoneNumber },
          { phone: normalizedFrom },
          { phone: normalizedFromDigits },
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

    const lowerMsg = message.toLowerCase();
    const isAdminQuery =
      user.role === "DUENO" || user.role === "ADMIN" || user.role === "JEFE";

    if (isAdminQuery && (
      lowerMsg.includes("cómo va el equipo") ||
      lowerMsg.includes("como va el equipo") ||
      lowerMsg.includes("resumen del equipo") ||
      lowerMsg.includes("cómo está el equipo")
    )) {
      const overview = await getAdminOverview();

      await prisma.activity.create({
        data: {
          userId: user.id,
          action: "WHATSAPP_AI_REPLY",
          resource: "WHATSAPP",
          details: `LUNA respondió resumen administrativo a ${user.name}`,
        },
      });

      return `📊 *Resumen del Equipo - ${new Date().toLocaleDateString("es-GT")}*\n\n${overview.summary}`;
    }

    if (isAdminQuery && (
      lowerMsg.includes("quién no ha entrado") ||
      lowerMsg.includes("quien no ha entrado") ||
      lowerMsg.includes("inactivos")
    )) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const activities = await prisma.activity.findMany({
        where: { createdAt: { gte: today } },
        select: { userId: true },
      });

      const activeIds = new Set(activities.map((a) => a.userId));
      const allUsers = await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
      });

      const inactive = allUsers.filter((u) => !activeIds.has(u.id));

      await prisma.activity.create({
        data: {
          userId: user.id,
          action: "WHATSAPP_AI_REPLY",
          resource: "WHATSAPP",
          details: `LUNA respondió consulta de inactivos a ${user.name}`,
        },
      });

      if (inactive.length === 0) {
        return "✅ *Todos los usuarios han ingresado al sistema hoy.* ¡Excelente trabajo equipo!";
      }

      const inactiveNames = inactive.map((u) => u.name).join(", ");
      return `🚫 *Usuarios sin acceso hoy (${inactive.length}):*\n\n${inactiveNames}\n\nSe recomienda contactarlos para verificar su estado.`;
    }

    if (isAdminQuery && (
      lowerMsg.includes("alerta a los que no han completado") ||
      lowerMsg.includes("recordatorio masivo") ||
      lowerMsg.includes("manda recordatorio")
    )) {
      const pendingToday = await prisma.task.findMany({
        where: {
          dueDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
          status: { in: ["PENDIENTE", "EN_PROCESO"] },
        },
        include: {
          assignedTo: {
            select: { id: true, name: true, phone: true, whatsappNumber: true },
          },
        },
      });

      const byUser = new Map<string, { name: string; phone: string | null; whatsappNumber: string | null; count: number }>();
      for (const t of pendingToday) {
        if (!t.assignedTo) continue;
        const key = t.assignedTo.id;
        if (!byUser.has(key)) {
          byUser.set(key, {
            name: t.assignedTo.name,
            phone: t.assignedTo.phone,
            whatsappNumber: t.assignedTo.whatsappNumber,
            count: 0,
          });
        }
        byUser.get(key)!.count++;
      }

      let sent = 0;
      for (const [, entry] of byUser) {
        const to = entry.whatsappNumber || entry.phone;
        if (to) {
          await sendMessage(
            to,
            `🔔 *Recordatorio de LUNA*\n\nAún tienes ${entry.count} tareas pendientes para hoy. Por favor complétalas o posponlas con razón. ¡Gracias!`
          ).catch(() => {});
          sent++;
        }
      }

      await prisma.activity.create({
        data: {
          userId: user.id,
          action: "WHATSAPP_AI_REPLY",
          resource: "WHATSAPP",
          details: `LUNA envió recordatorio masivo a ${sent} usuarios (solicitado por ${user.name})`,
        },
      });

      return `✅ *Recordatorio enviado*\n\nSe enviaron recordatorios a ${sent} usuarios con tareas pendientes para hoy.`;
    }

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

export async function getUserContext(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const now = new Date();

  const [
    user,
    pendingTasks,
    upcomingEvents,
    assignedCount,
    completedCount,
    recentActivity,
    incomeRecords,
    totalIncome,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        email: true,
        phone: true,
        whatsappNumber: true,
        active: true,
        _count: {
          select: {
            assignedTasks: true,
            inventoryItems: true,
            vehicles: true,
            cobros: true,
          },
        },
      },
    }),
    prisma.task.findMany({
      where: {
        assignedToId: userId,
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        dueDate: true,
        postponeCount: true,
        postponeReason: true,
      },
    }),
    prisma.event.findMany({
      where: {
        date: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) },
        status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
        OR: [{ plannerId: userId }, { responsibleId: userId }],
      },
      orderBy: { date: "asc" },
      take: 10,
      select: { id: true, name: true, clientName: true, date: true, location: true, status: true },
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
      take: 10,
      select: { action: true, resource: true, resourceId: true, details: true, createdAt: true },
    }),
    prisma.incomeRecord.findMany({
      where: { userId, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      select: { id: true, amount: true, description: true, type: true, createdAt: true, event: { select: { name: true } } },
    }),
    prisma.incomeRecord.aggregate({
      where: { userId },
      _sum: { amount: true },
    }),
  ]);

  if (!user) return null;

  const complianceRate = assignedCount > 0 ? Math.round((completedCount / assignedCount) * 100) : 0;

  return {
    ...user,
    pendingTasks,
    upcomingEvents,
    assignedCount,
    completedCount,
    complianceRate,
    recentActivity,
    incomeRecords,
    totalIncome: totalIncome._sum.amount || 0,
    inventoryCount: user._count.inventoryItems,
    vehicleCount: user._count.vehicles,
    cobroCount: user._count.cobros,
  };
}

export interface NLUResult {
  intent: "POSTPONE" | "CREATE_TASK" | "QUERY_INCOME" | "DELEGATE" | "STATUS" | "CHAT";
  confidence: number;
  data: {
    taskTitle?: string;
    taskDescription?: string;
    assignedTo?: string;
    reason?: string;
    newDate?: string;
    newStatus?: string;
    query?: string;
    targetUserId?: string;
    taskId?: string;
  };
  explanation: string;
  suggestedAction?: string;
}

export async function processNaturalLanguage(
  userId: string,
  message: string
): Promise<NLUResult> {
  try {
    const userContext = await getUserContext(userId);
    if (!userContext) {
      return {
        intent: "CHAT",
        confidence: 0,
        data: {},
        explanation: "Usuario no encontrado",
      };
    }

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
    });

    const usersList = users.map((u) => `${u.id}: ${u.name} (${u.role})`).join("\n");

    const pendingTasksStr = userContext.pendingTasks
      .map((t) => `${t.id}: "${t.title}" | Prioridad: ${t.priority} | Estado: ${t.status}`)
      .join("\n");

    const incomeStr = userContext.incomeRecords
      .map((i) => `Q${i.amount} - ${i.type}: ${i.description} (${new Date(i.createdAt).toLocaleDateString("es-GT")})`)
      .join("\n");

    const prompt = `Analiza este mensaje de ${userContext.name} (${userContext.role}) y determina qué acción quiere realizar. Responde SOLO con JSON.

UNIVERSO DE DISCURSO:
- Usuarios disponibles:\n${usersList}
- Tareas pendientes del usuario:\n${pendingTasksStr || "Ninguna"}
- Ingresos recientes:\n${incomeStr || "Ninguno"}
- Total de ingresos: Q${userContext.totalIncome}
- Tasa de cumplimiento: ${userContext.complianceRate}%

INTENCIONES POSIBLES:
1. POSTPONE: El usuario quiere reprogramar/postergar una tarea. Ejemplos: "no pude llamar al cliente, pasalo para mañana", "reprograma la tarea de inventario para el viernes", "no alcancé a hacerlo, lo hago el lunes"
2. CREATE_TASK: El usuario quiere crear una tarea. Ejemplos: "crea una tarea para Javier de revisar bodega mañana", "agrega nueva tarea de cotización"
3. QUERY_INCOME: El usuario quiere consultar ingresos. Ejemplos: "¿cuánto hemos cobrado esta semana?", "¿cuáles son mis ingresos del mes?", "¿quién ha generado más ingresos?"
4. DELEGATE: El usuario quiere delegar/reasignar una tarea. Ejemplos: "pasa esta tarea a Diana", "que lo haga Abel mejor"
5. STATUS: El usuario quiere marcar una tarea. Ejemplos: "marca como completada la tarea de cotización", "ya terminé el montaje"
6. CHAT: Es una conversación normal, pregunta o consulta general.

MENSAJE DEL USUARIO: "${message}"

Formato JSON de respuesta:
{
  "intent": "POSTPONE" | "CREATE_TASK" | "QUERY_INCOME" | "DELEGATE" | "STATUS" | "CHAT",
  "confidence": 0.0 a 1.0,
  "data": {
    "taskTitle": "título de la tarea",
    "taskDescription": "descripción",
    "assignedTo": "nombre de la persona",
    "reason": "razón",
    "newDate": "fecha ISO o 'mañana' o 'viernes'",
    "newStatus": "COMPLETADA" | "EN_PROCESO" | etc,
    "query": "consulta extraída",
    "targetUserId": "id del usuario destino",
    "taskId": "id de la tarea referenciada"
  },
  "explanation": "Explicación breve de lo que se entendió",
  "suggestedAction": "Acción concreta sugerida para el sistema"
}`;

    const response = await askAI(
      [{ role: "user", content: prompt }],
      { responseFormat: "json", temperature: 0.3, maxTokens: 1000 }
    );

    const jsonStart = response.indexOf("{");
    const jsonEnd = response.lastIndexOf("}") + 1;
    const result = JSON.parse(response.slice(jsonStart, jsonEnd)) as NLUResult;

    if (result.data && result.data.assignedTo && !result.data.targetUserId) {
      const matchedUser = users.find(
        (u) => u.name.toLowerCase().includes(result.data.assignedTo!.toLowerCase())
      );
      if (matchedUser) {
        result.data.targetUserId = matchedUser.id;
      }
    }

    if ((result.intent === "POSTPONE" || result.intent === "DELEGATE") && result.data.taskTitle && !result.data.taskId) {
      const matchedTask = userContext.pendingTasks.find(
        (t) => t.title.toLowerCase().includes(result.data.taskTitle!.toLowerCase())
      );
      if (matchedTask) {
        result.data.taskId = matchedTask.id;
      }
    }

    return result;
  } catch (error) {
    console.error("processNaturalLanguage error:", error);
    return {
      intent: "CHAT",
      confidence: 0,
      data: {},
      explanation: "Error al procesar el mensaje",
    };
  }
}

export async function getProactiveSuggestions(userId: string): Promise<string[]> {
  try {
    const context = await getUserContext(userId);
    if (!context) return [];

    const suggestions: string[] = [];
    const now = new Date();
    const todayStr = now.toLocaleDateString("es-GT", { weekday: "long" });

    const urgentTasks = context.pendingTasks.filter((t) => t.priority === "URGENTE" || t.priority === "ALTA");
    if (urgentTasks.length > 0) {
      suggestions.push(`Tienes ${urgentTasks.length} tareas urgentes/de alta prioridad pendientes`);
    }

    const overdue = context.pendingTasks.filter(
      (t) => t.dueDate && new Date(t.dueDate) < now
    );
    if (overdue.length > 0) {
      suggestions.push(`Tienes ${overdue.length} tareas vencidas que requieren atención`);
    }

    if (context.upcomingEvents.length > 0) {
      const nextEvent = context.upcomingEvents[0];
      const eventDate = new Date(nextEvent.date);
      suggestions.push(`Próximo evento: ${nextEvent.name} el ${eventDate.toLocaleDateString("es-GT")}`);
    }

    if (context.complianceRate < 50 && context.assignedCount > 5) {
      suggestions.push(`Tu cumplimiento mensual es del ${context.complianceRate}%. Considera priorizar tus tareas.`);
    }

    const postponedTasks = context.pendingTasks.filter((t) => t.postponeCount > 0);
    if (postponedTasks.length > 0) {
      suggestions.push(`Tienes ${postponedTasks.length} tareas que han sido reprogramadas anteriormente`);
    }

    if (context.totalIncome > 0) {
      suggestions.push(`Tus ingresos registrados totales: Q${context.totalIncome.toLocaleString("es-GT")}`);
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const recentIncomes = context.incomeRecords.filter(
      (i) => new Date(i.createdAt) > yesterday
    );
    if (recentIncomes.length > 0) {
      const total = recentIncomes.reduce((sum, i) => sum + i.amount, 0);
      suggestions.push(`Ingresos registrados recientemente: Q${total.toLocaleString("es-GT")}`);
    }

    if (suggestions.length === 0) {
      suggestions.push("¡Todo está en orden! No hay acciones urgentes pendientes.");
    }

    return suggestions;
  } catch (error) {
    console.error("getProactiveSuggestions error:", error);
    return [];
  }
}

export async function executeNLUAction(
  result: NLUResult,
  userId: string
): Promise<{ success: boolean; message: string; data?: Record<string, unknown> }> {
  try {
    switch (result.intent) {
      case "POSTPONE": {
        const taskId = result.data.taskId;
        if (!taskId) {
          return { success: false, message: "No se pudo identificar qué tarea reprogramar" };
        }

        let newDueDate = result.data.newDate
          ? new Date(result.data.newDate)
          : new Date(Date.now() + 86400000);

        if (result.data.newDate === "mañana") {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          newDueDate = tomorrow;
        } else if (result.data.newDate === "pasado mañana") {
          const dayAfter = new Date();
          dayAfter.setDate(dayAfter.getDate() + 2);
          newDueDate = dayAfter;
        }

        const task = await prisma.task.update({
          where: { id: taskId },
          data: {
            status: "REPROGRAMADA",
            postponeReason: result.data.reason || "Reprogramada vía IA",
            postponeCount: { increment: 1 },
            rescheduledTo: newDueDate,
            dueDate: newDueDate,
          },
          include: { assignedTo: { select: { id: true, name: true } } },
        });

        await prisma.taskHistory.create({
          data: {
            taskId,
            userId,
            action: "REPROGRAMACIÓN",
            previousStatus: "PENDIENTE",
            newStatus: "REPROGRAMADA",
          },
        });

        return {
          success: true,
          message: `Tarea "${task.title}" reprogramada para ${newDueDate.toLocaleDateString("es-GT")}`,
          data: { task },
        };
      }

      case "CREATE_TASK": {
        if (!result.data.taskTitle) {
          return { success: false, message: "No se pudo identificar el título de la tarea" };
        }

        let dueDate = result.data.newDate
          ? new Date(result.data.newDate)
          : undefined;

        if (result.data.newDate === "mañana") {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          dueDate = tomorrow;
        }

        const newTask = await prisma.task.create({
          data: {
            title: result.data.taskTitle,
            description: result.data.taskDescription || null,
            assignedToId: result.data.targetUserId || null,
            assignedById: userId,
            dueDate: dueDate || null,
            type: "DINAMICA",
            priority: "MEDIA",
            category: "OTRO",
          },
          include: { assignedTo: { select: { id: true, name: true } } },
        });

        await prisma.taskHistory.create({
          data: {
            taskId: newTask.id,
            userId,
            action: "CREACIÓN",
            previousStatus: null,
            newStatus: newTask.status,
          },
        });

        return {
          success: true,
          message: `Tarea "${newTask.title}" creada exitosamente`,
          data: { task: newTask },
        };
      }

      case "QUERY_INCOME": {
        const incomeContext = await getUserContext(userId);
        return {
          success: true,
          message: `Tus ingresos totales registrados son Q${(incomeContext?.totalIncome || 0).toLocaleString("es-GT")}`,
          data: {
            totalIncome: incomeContext?.totalIncome,
            incomeRecords: incomeContext?.incomeRecords,
          },
        };
      }

      case "DELEGATE": {
        if (!result.data.taskId) {
          return { success: false, message: "No se pudo identificar qué tarea delegar" };
        }
        if (!result.data.targetUserId) {
          return { success: false, message: "No se pudo identificar a quién delegar la tarea" };
        }

        const delegatedTask = await prisma.task.update({
          where: { id: result.data.taskId },
          data: {
            assignedToId: result.data.targetUserId,
            assignedById: userId,
          },
          include: {
            assignedTo: { select: { id: true, name: true } },
          },
        });

        await prisma.taskHistory.create({
          data: {
            taskId: result.data.taskId,
            userId,
            action: "DELEGACIÓN",
            newStatus: delegatedTask.status,
          },
        });

        return {
          success: true,
          message: `Tarea "${delegatedTask.title}" delegada a ${delegatedTask.assignedTo?.name}`,
          data: { task: delegatedTask },
        };
      }

      case "STATUS": {
        if (!result.data.taskId) {
          return { success: false, message: "No se pudo identificar qué tarea actualizar" };
        }
        if (!result.data.newStatus) {
          return { success: false, message: "No se pudo identificar el nuevo estado" };
        }

        const updatedTask = await prisma.task.update({
          where: { id: result.data.taskId },
          data: {
            status: result.data.newStatus as "PENDIENTE" | "EN_PROCESO" | "COMPLETADA" | "CANCELADA",
            confirmedAt: result.data.newStatus === "COMPLETADA" ? new Date() : undefined,
          },
        });

        return {
          success: true,
          message: `Tarea "${updatedTask.title}" marcada como ${result.data.newStatus}`,
          data: { task: updatedTask },
        };
      }

      default: {
        return {
          success: true,
          message: "Procesado como consulta general",
        };
      }
    }
  } catch (error) {
    console.error("executeNLUAction error:", error);
    return { success: false, message: "Error al ejecutar la acción" };
  }
}

export { askAI as askDeepSeek };
