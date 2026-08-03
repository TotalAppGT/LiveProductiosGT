import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { askDeepSeek } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const body = await request.json();
    const { context } = body;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        role: true,
        _count: { select: { assignedTasks: true } },
      },
    });

    const pendingTasks = await prisma.task.findMany({
      where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } },
      select: { id: true, title: true, status: true, priority: true, category: true, dueDate: true },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 20,
    });

    const upcomingEvents = await prisma.event.findMany({
      where: {
        date: { gte: today },
        status: { in: ["COTIZACION", "CONFIRMADO"] },
      },
      select: { id: true, name: true, date: true, status: true, clientName: true },
      orderBy: { date: "asc" },
      take: 10,
    });

    const inventoryAlerts = await prisma.inventoryItem.findMany({
      where: { status: { in: ["DANADO", "PERDIDO", "EN_REPARACION"] } },
      select: { id: true, name: true, status: true, category: true },
      take: 10,
    });

    const usersText = users
      .map((u) => `${u.id}: ${u.name} (${u.role}) - ${u._count.assignedTasks} tareas`)
      .join("\n");

    const tasksText = pendingTasks
      .map((t) => `• ${t.title} [${t.priority}, ${t.status}, ${t.category}] ${t.dueDate ? `Vence: ${t.dueDate}` : "Sin fecha"}`)
      .join("\n");

    const eventsText = upcomingEvents
      .map((e) => `• ${e.name} - ${e.clientName} | ${new Date(e.date).toLocaleDateString("es-GT")} [${e.status}]`)
      .join("\n");

    const inventoryText = inventoryAlerts
      .map((i) => `• ${i.name} [${i.status}] ${i.category}`)
      .join("\n");

    const systemPrompt = `Eres un asistente de inteligencia artificial para Live Productions, empresa de eventos en vivo. Analiza los datos proporcionados y genera sugerencias en formato JSON estrictamente válido.`;

    const userPrompt = `Contexto adicional: ${context || "Análisis general"}

DATOS:

USUARIOS DISPONIBLES:
${usersText}

TAREAS PENDIENTES (top 20):
${tasksText}

EVENTOS PRÓXIMOS:
${eventsText}

INVENTARIO CON ALERTAS:
${inventoryText}

Analiza los datos y responde SOLO en JSON con este formato exacto:
{
  "sugerenciasAsignacion": [{"tarea": "descripción", "usuarioSugerido": "nombre", "razon": "razón breve"}],
  "sugerenciasPrioridad": [{"accion": "descripción", "urgencia": "ALTA/MEDIA/BAJA"}],
  "alertas": ["alerta 1", "alerta 2"],
  "resumen": "resumen general en español"
}

Máximo 3 sugerencias de asignación, 3 de prioridad y 3 alertas.`;

    const response = await askDeepSeek(
      [{ role: "user", content: userPrompt }],
      systemPrompt
    );

    let parsedResponse;
    try {
      const jsonStart = response.indexOf("{");
      const jsonEnd = response.lastIndexOf("}") + 1;
      const jsonStr = response.slice(jsonStart, jsonEnd);
      parsedResponse = JSON.parse(jsonStr);
    } catch {
      parsedResponse = {
        sugerenciasAsignacion: [],
        sugerenciasPrioridad: [],
        alertas: ["No se pudieron generar sugerencias en este momento."],
        resumen: response,
      };
    }

    return NextResponse.json(
      { success: true, data: parsedResponse },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en sugerencias AI:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
