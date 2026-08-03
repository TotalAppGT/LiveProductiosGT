import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { sendMessage } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json({ success: false, error: "Solo administradores pueden enviar mensajes de prueba" }, { status: 403 });
    }

    const body = await request.json();
    const { message } = body;

    if (!message || !message.trim()) {
      return NextResponse.json({ success: false, error: "El mensaje es requerido" }, { status: 400 });
    }

    const config = await prisma.whatsAppConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    const businessPhone = config?.businessPhone || process.env.WHATSAPP_BUSINESS_PHONE || "";

    if (!businessPhone) {
      return NextResponse.json({ success: false, error: "No hay número de negocio configurado. Configure un número en la pestaña WhatsApp." }, { status: 400 });
    }

    const result = await sendMessage(businessPhone, `🧪 *Prueba de WhatsApp*\n\n${message.trim()}`);

    if (result?.messages?.[0]?.id) {
      return NextResponse.json({ success: true, data: { messageId: result.messages[0].id }, message: "Mensaje de prueba enviado exitosamente" });
    }

    return NextResponse.json({ success: false, error: "Error al enviar el mensaje. Verifique las credenciales." }, { status: 500 });
  } catch (error) {
    console.error("Error en whatsapp-test:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
