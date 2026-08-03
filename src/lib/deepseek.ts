import { askAI, generateSmartAlert } from "@/lib/ai-brain";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function askDeepSeek(
  messages: DeepSeekMessage[],
  systemPrompt?: string
): Promise<string> {
  return askAI(
    systemPrompt
      ? [{ role: "system", content: systemPrompt }, ...messages]
      : messages
  );
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

    const response = await askAI([
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
    { temperature: 0.3, maxTokens: 1500 }
    );

    const jsonStart = response.indexOf("{");
    const jsonEnd = response.lastIndexOf("}") + 1;
    const jsonStr = response.slice(jsonStart, jsonEnd);

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("analyzeTaskProgress error:", error);
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
      .map((t) => `- ${t.title} (${t.status}, ${t.priority}, ${t.category})`)
      .join("\n");

    return askAI([
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
    { temperature: 0.5, maxTokens: 800 }
    );
  } catch (error) {
    console.error("generateDailySummary error:", error);
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

    const response = await askAI([
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
    { temperature: 0.3, maxTokens: 500 }
    );

    const jsonStart = response.indexOf("{");
    const jsonEnd = response.lastIndexOf("}") + 1;
    const jsonStr = response.slice(jsonStart, jsonEnd);

    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("suggestTaskAssignment error:", error);
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
  const alertTypeMap: Record<string, "reminder" | "assignment"> = {
    reminder: "reminder",
    summary: "reminder",
    alert: "reminder",
    event: "reminder",
    assignment: "assignment",
  };

  return generateSmartAlert({
    title: (context.taskTitle as string) || (context.eventName as string) || "Sin título",
    alertType: alertTypeMap[type] || "reminder",
    assigneeName: context.recipientName as string,
    dueDate: context.dueDate as string,
    priority: context.priority as string,
  });
}
