import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { askDeepSeek } from "@/lib/deepseek";
import type { DeepSeekMessage } from "@/lib/deepseek";

const BASE_SYSTEM_PROMPT = `Eres el asistente inteligente de Live Productions, una empresa guatemalteca de producción de eventos en vivo. 

ESTRUCTURA DE LA EMPRESA:
- Ciclo semanal: Lunes a Viernes planificación, fines de semana eventos
- Tareas pre-evento: confirmación de personal, revisión de equipo, comunicación con clientes
- Tareas post-evento: devolución de equipo, reportes de daños, pagos a staff
- Actividades fijas diarias: Lunes (facturación/cotizaciones), Martes (inventario/vehículos), Miércoles (pagos/músicos), Jueves (preparación de eventos), Viernes (eventos del fin de semana)

PERSONAL CLAVE:
- Jorge (Dueño): dirección general, decisiones estratégicas
- Diana y Brenda (Coordinación): planificación de eventos, cotizaciones, comunicación con clientes
- Abel (Logística): transporte, montaje/desmontaje, carga de equipo
- Selvin (Técnico): audio profesional, iluminación, mantenimiento de equipo
- Exequiel (Bodega/Inventario): control de inventario, limpieza, organización

TIPOS DE EVENTO:
- DJ COMPLETO: DJ + sonido + luces
- SAXOFONIC: saxofonista + DJ + sonido
- SUNDAY FUNDAY: evento dominical con múltiples artistas

EQUIPO DE AUDIO PRINCIPAL:
- Sistemas QSC (alta gama)
- T4/JBL (media gama)  
- Turbosound (media gama)

UBICACIONES DE BODEGAS: Bodega Elgin y Bodega PP

CICLO DE COBROS: depósitos pre-evento, saldo post-evento

ROLES: Dueño, Administrador, Jefe y Empleado. Cada uno con diferentes responsabilidades.

Responde siempre en español, de manera profesional y amigable. Sé conciso y directo.`;

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

    // Support both formats: legacy { messages } and client { message, context, systemPrompt }
    let messages: DeepSeekMessage[];
    let context: any = null;

    if (body.messages && Array.isArray(body.messages)) {
      messages = body.messages.map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }));
    } else if (body.message) {
      context = body.context || null;
      const contextText = context
        ? `\n\nCONTEXTO DEL SISTEMA:\n- Usuario: ${context.user?.name || "Desconocido"} (${context.user?.role || "EMPLEADO"})\n- Tareas de hoy (${(context.todayTasks || []).length}): ${(context.todayTasks || []).map((t: any) => `${t.title} [${t.status}]${t.assignedTo ? " -> " + t.assignedTo : ""}`).join("; ") || "Ninguna"}\n- Próximos eventos (${(context.upcomingEvents || []).length}): ${(context.upcomingEvents || []).map((e: any) => `${e.name} (${e.date}) [${e.status}]`).join("; ") || "Ninguno"}\n${context.compliance ? `- Cumplimiento del equipo hoy: ${context.compliance.totalComplianceRate?.toFixed(0) || 0}%, ${context.compliance.activeUsers || 0} usuarios activos, ${context.compliance.inactiveUsers || 0} inactivos` : ""}`
        : "";

      const systemPrompt = body.systemPrompt
        ? `${body.systemPrompt}\n\n---\n\n${BASE_SYSTEM_PROMPT}`
        : BASE_SYSTEM_PROMPT;

      messages = [
        { role: "system", content: systemPrompt + contextText },
        { role: "user", content: body.message },
      ];
    } else {
      return NextResponse.json(
        { success: false, error: "Se requiere 'messages' o 'message'" },
        { status: 400 }
      );
    }

    const response = await askDeepSeek(messages);

    return NextResponse.json(
      {
        success: true,
        data: {
          reply: response,
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
