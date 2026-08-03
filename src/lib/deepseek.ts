import OpenAI from "openai";

const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: "https://api.deepseek.com/v1",
});

const DEFAULT_MODEL = "deepseek-chat";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function askDeepSeek(
  messages: DeepSeekMessage[],
  systemPrompt?: string
): Promise<string> {
  try {
    const fullMessages: DeepSeekMessage[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages;

    const response = await deepseekClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: fullMessages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("DeepSeek API error:", error);
    return "Lo siento, no pude procesar tu solicitud en este momento.";
  }
}

interface TaskForAnalysis {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | Date;
  category: string;
}

export async function analyzeTaskProgress(
  tasks: TaskForAnalysis[]
): Promise<{
  summary: string;
  suggestions: string[];
  priorityOrder: string[];
}> {
  try {
    const taskListText = tasks
      .map(
        (t, i) =>
          `${i + 1}. ${t.title} | Estado: ${t.status} | Prioridad: ${t.priority} | Categoría: ${t.category} | Vence: ${t.dueDate || "Sin fecha"}`
      )
      .join("\n");

    const response = await deepseekClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de gestión de tareas para una empresa de producción de eventos en vivo. Analiza las tareas y responde en formato JSON.",
        },
        {
          role: "user",
          content: `Analiza estas tareas y sugiere prioridades. Responde SOLO en JSON con el formato: { "summary": string, "suggestions": string[], "priorityOrder": string[] }.\n\nTareas:\n${taskListText}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}") + 1;
    const jsonStr = content.slice(jsonStart, jsonEnd);

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("DeepSeek analyzeTaskProgress error:", error);
    return {
      summary: "No se pudo analizar el progreso de las tareas.",
      suggestions: [],
      priorityOrder: tasks.map((t) => t.id),
    };
  }
}

interface DailySummary {
  completed: number;
  pending: number;
  inProgress: number;
  overdue: number;
  topTasks: string[];
}

export async function generateDailySummary(
  userId: string,
  tasks: TaskForAnalysis[],
  stats: DailySummary
): Promise<string> {
  try {
    const taskListText = tasks
      .map(
        (t) =>
          `- ${t.title} (${t.status}, ${t.priority}, ${t.category})`
      )
      .join("\n");

    const response = await deepseekClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente que genera resúmenes diarios de tareas para una empresa de producción de eventos en vivo. Sé conciso y motivador.",
        },
        {
          role: "user",
          content: `Genera un resumen diario de tareas para el usuario ${userId}. Estadísticas: ${stats.completed} completadas, ${stats.pending} pendientes, ${stats.inProgress} en progreso, ${stats.overdue} vencidas.\n\nTareas principales:\n${taskListText}\n\nResponde en español, en máximo 3 párrafos.`,
        },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    return response.choices[0]?.message?.content || "Resumen no disponible.";
  } catch (error) {
    console.error("DeepSeek generateDailySummary error:", error);
    return "No se pudo generar el resumen diario en este momento.";
  }
}

interface UserSuggestion {
  id: string;
  name: string;
  role: string;
  taskCount: number;
}

export async function suggestTaskAssignment(
  description: string,
  availableUsers: UserSuggestion[]
): Promise<{
  suggestedUserId: string | null;
  reasoning: string;
}> {
  try {
    const usersText = availableUsers
      .map(
        (u) =>
          `- ${u.id}: ${u.name} (${u.role}), tareas actuales: ${u.taskCount}`
      )
      .join("\n");

    const response = await deepseekClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Eres un asistente de asignación de tareas para una empresa de eventos. Responde SOLO en JSON.",
        },
        {
          role: "user",
          content: `Sugiere a quién asignar esta tarea:\n\nDescripción: ${description}\n\nUsuarios disponibles:\n${usersText}\n\nResponde con JSON: { "suggestedUserId": "id" | null, "reasoning": string }`,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonStart = content.indexOf("{");
    const jsonEnd = content.lastIndexOf("}") + 1;
    const jsonStr = content.slice(jsonStart, jsonEnd);

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("DeepSeek suggestTaskAssignment error:", error);
    return {
      suggestedUserId: null,
      reasoning: "No se pudo generar una sugerencia en este momento.",
    };
  }
}

export type WhatsAppMessageContext = {
  recipientName?: string;
  taskTitle?: string;
  dueDate?: string;
  priority?: string;
  eventName?: string;
  eventDate?: string;
  taskCount?: number;
  completedCount?: number;
  [key: string]: string | number | undefined;
};

export async function generateWhatsAppMessage(
  context: WhatsAppMessageContext,
  type: "reminder" | "summary" | "alert" | "event" | "assignment"
): Promise<string> {
  try {
    const contextStr = Object.entries(context)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const prompts: Record<string, string> = {
      reminder:
        "Genera un mensaje de WhatsApp amigable y motivador para recordar una tarea pendiente. Sé breve.",
      summary:
        "Genera un resumen diario de tareas para WhatsApp. Sé conciso y motivador.",
      alert:
        "Genera un mensaje de alerta urgente para WhatsApp sobre tareas o eventos. Sé directo.",
      event:
        "Genera un recordatorio de evento para WhatsApp. Incluye fecha y preparativos clave.",
      assignment:
        "Genera un mensaje de WhatsApp notificando a un usuario sobre una nueva tarea asignada.",
    };

    const response = await deepseekClient.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Eres un generador de mensajes de WhatsApp para una empresa de producción de eventos. Responde SOLO con el texto del mensaje, sin comillas ni formato adicional.",
        },
        {
          role: "user",
          content: `${prompts[type] || prompts.reminder}\n\nContexto: ${contextStr}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    return (
      response.choices[0]?.message?.content?.trim() || "Mensaje no disponible."
    );
  } catch (error) {
    console.error("DeepSeek generateWhatsAppMessage error:", error);
    return "Mensaje no disponible en este momento.";
  }
}
