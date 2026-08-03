import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { askDeepSeek } from "@/lib/deepseek";
import type { DeepSeekMessage } from "@/lib/deepseek";

const SYSTEM_PROMPT = `Eres un asistente virtual de Live Productions, una empresa guatemalteca dedicada a la producción de eventos en vivo. Tu objetivo es ayudar a los usuarios con:

1. Gestión de tareas operativas (montaje, desmontaje, cotizaciones, cobros, inventario, vehículos, personal, bodega, mantenimiento, administración)
2. Planificación y seguimiento de eventos
3. Gestión de inventario de equipos de audio, iluminación, instrumentos, cableado, mobiliario
4. Gestión de cobros y facturación
5. Asignación de personal a tareas y eventos
6. Reportes diarios y seguimiento de pendientes

Responde siempre en español, de manera profesional pero amigable. Sé conciso y directo. Si no tienes suficiente información, solicita los datos necesarios.

La empresa tiene roles: Dueño, Administrador, Jefe y Empleado. Cada uno tiene diferentes responsabilidades.

Equipos típicos: sistemas de audio profesional, iluminación escénica, instrumentos musicales, cableado, mobiliario para eventos.
Vehículos: camiones, paneles, pickups, motos y sedanes.
Bodegas: Elgin y PP.`;

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
    const { messages } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un arreglo de mensajes" },
        { status: 400 }
      );
    }

    const validMessages: DeepSeekMessage[] = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await askDeepSeek(validMessages, SYSTEM_PROMPT);

    return NextResponse.json(
      {
        success: true,
        data: {
          message: response,
          role: "assistant",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en chat AI:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
