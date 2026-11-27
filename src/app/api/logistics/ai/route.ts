import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { askDeepSeek } from "@/lib/deepseek";

const RECIPIENTS: Record<string, string> = {
  equipo: "piloto del transporte de equipo",
  staff: "piloto del transporte de staff",
  musicos: "piloto del transporte de músicos",
  proveedor: "proveedor del evento",
  general: "grupo general del staff",
};

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { order, plan, recipient, draft } = body || {};
    if (!order) return NextResponse.json({ success: false, error: "Cuadro requerido" }, { status: 400 });

    const fecha = order.eventDate
      ? new Date(order.eventDate).toLocaleDateString("es-GT", {
          timeZone: "America/Guatemala",
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "Sin fecha";

    const detalle = JSON.stringify(
      {
        evento: `#${order.orderNumber} ${order.eventName}`,
        fecha,
        lugar: order.eventLocation || "Sin lugar",
        servicios: order.contractNotes || "",
        plan: plan || {},
      },
      null,
      2
    );

    const text = await askDeepSeek(
      [
        {
          role: "user",
          content: `Revisá y mejorá este mensaje de logística para ${RECIPIENTS[recipient] || "un piloto"}.

Datos del evento:
${detalle}

Borrador actual:
"""
${draft || "Sin borrador"}
"""

Reglas:
- Español de Guatemala, tono profesional y directo, como se habla en una empresa de eventos.
- Es un mensaje de WhatsApp para copiar y pegar: usá emojis con moderación, viñetas y saltos de línea.
- Incluí solo la información del destinatario: horarios, punto de reunión, vehículo, piloto, carga y contactos.
- Si un dato falta, escribí "Pendiente" en vez de inventarlo.
- Cerrá pidiendo confirmación de recibido.
- Devolvé solo el mensaje final, sin explicaciones ni comillas.`,
        },
      ],
      "Sos el coordinador de logística de Live Productions GT. Escribís mensajes operativos claros, cortos y sin errores."
    );

    return NextResponse.json({ success: true, data: { text: String(text || "").trim() } });
  } catch (error) {
    console.error("logistics ai POST:", error);
    return NextResponse.json({ success: false, error: "No se pudo generar con IA" }, { status: 500 });
  }
}
