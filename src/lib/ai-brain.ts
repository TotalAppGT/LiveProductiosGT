import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIOptions {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

let cachedClient: OpenAI | null = null;
let cachedClientKey: string | null = null;

async function getAISettings() {
  const settings = await prisma.aISettings.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  return settings;
}

function getCachedClient(settings: {
  apiKey: string;
  baseUrl: string;
}): OpenAI | null {
  const key = `${settings.apiKey}:${settings.baseUrl}`;
  if (cachedClient && cachedClientKey === key) return cachedClient;
  return null;
}

function setCachedClient(settings: {
  apiKey: string;
  baseUrl: string;
}, client: OpenAI) {
  cachedClientKey = `${settings.apiKey}:${settings.baseUrl}`;
  cachedClient = client;
}

async function getOpenAIClient(settings: {
  apiKey: string;
  baseUrl: string;
}): Promise<OpenAI> {
  const cached = getCachedClient(settings);
  if (cached) return cached;

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
  });

  setCachedClient(settings, client);
  return client;
}

export async function getAIClient(): Promise<{
  client: OpenAI;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
}> {
  const settings = await getAISettings();
  const provider = settings?.provider || "DEEPSEEK";

  const envApiKeys: Record<string, string | undefined> = {
    DEEPSEEK: process.env.DEEPSEEK_API_KEY,
    OPENAI: process.env.OPENAI_API_KEY,
    OPENROUTER: process.env.OPENROUTER_API_KEY,
    NVIDIA: process.env.NVIDIA_API_KEY,
  };

  const apiKey =
    settings?.apiKey ||
    envApiKeys[provider] ||
    envApiKeys["DEEPSEEK"] ||
    process.env.DEEPSEEK_API_KEY ||
    "";

  if (!apiKey) {
    throw new Error("No se encontró API Key para IA. Configure una en Admin > IA & Modelos.");
  }

  const baseUrls: Record<string, string> = {
    DEEPSEEK: "https://api.deepseek.com/v1",
    OPENAI: "https://api.openai.com/v1",
    OPENROUTER: "https://openrouter.ai/api/v1",
    NVIDIA: "https://integrate.api.nvidia.com/v1",
  };
  const baseUrl = settings?.baseUrl || baseUrls[provider] || "https://api.deepseek.com/v1";

  const defaultModels: Record<string, string> = {
    DEEPSEEK: "deepseek-chat",
    OPENAI: "gpt-4o",
    OPENROUTER: "openai/gpt-4o",
    NVIDIA: "meta/llama-3.3-70b-instruct",
  };

  const client = await getOpenAIClient({ apiKey, baseUrl });
  const model = settings?.model || defaultModels[provider] || "deepseek-chat";
  const systemPrompt =
    settings?.systemPrompt ||
    "Eres el asistente de Live Productions Guatemala...";
  const temperature = settings?.temperature ?? 0.7;
  const maxTokens = settings?.maxTokens ?? 2000;

  return { client, model, systemPrompt, temperature, maxTokens };
}

export async function askAI(
  messages: AIMessage[],
  options?: AIOptions
): Promise<string> {
  try {
    const { client, model, systemPrompt, temperature, maxTokens } =
      await getAIClient();

    const fullMessages: AIMessage[] =
      messages[0]?.role === "system"
        ? messages
        : [{ role: "system", content: systemPrompt }, ...messages];

    const response = await client.chat.completions.create({
      model,
      messages: fullMessages,
      temperature: options?.temperature ?? temperature,
      max_tokens: options?.maxTokens ?? maxTokens,
      ...(options?.responseFormat === "json"
        ? { response_format: { type: "json_object" } }
        : {}),
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("askAI error:", error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
  }
}

async function formatTasksForAI(tasks: any[]) {
  return tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.title} | Estado: ${t.status} | Prioridad: ${t.priority || "N/A"} | Vence: ${t.dueDate ? new Date(t.dueDate).toISOString().split("T")[0] : "Sin fecha"} | Asignado a: ${t.assignedTo?.name || "Nadie"}`
    )
    .join("\n");
}

async function formatEventsForAI(events: any[]) {
  return events
    .map(
      (e, i) =>
        `${i + 1}. ${e.name} | Cliente: ${e.clientName} | Fecha: ${new Date(e.date).toISOString().split("T")[0]} | Estado: ${e.status}`
    )
    .join("\n");
}

export async function analyzeTaskContext(
  tasks: any[],
  events: any[],
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
            activities: {
              none: { createdAt: { gte: threeDaysAgo } },
            },
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

// Backward compatibility re-export
export { askAI as askDeepSeek };
