import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { sendMessage } from "@/lib/whatsapp";

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
    const { to, message, type, relatedTaskId, relatedEventId } = body;

    if (!to) {
      return NextResponse.json(
        { success: false, error: "El número de destino es requerido" },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: "El mensaje es requerido" },
        { status: 400 }
      );
    }

    const result = await sendMessage(to, message);

    if (!result || result.error) {
      await prisma.whatsAppMessage.create({
        data: {
          userId: auth.payload.userId,
          toNumber: to,
          message,
          type: type || "NOTIFICATION",
          status: "FAILED",
          relatedTaskId: relatedTaskId || null,
          relatedEventId: relatedEventId || null,
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: result?.error?.message || "Error al enviar mensaje de WhatsApp",
        },
        { status: 500 }
      );
    }

    const whatsappMessage = await prisma.whatsAppMessage.create({
      data: {
        userId: auth.payload.userId,
        toNumber: to,
        message,
        type: type || "NOTIFICATION",
        status: "SENT",
        relatedTaskId: relatedTaskId || null,
        relatedEventId: relatedEventId || null,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ENVIAR_WHATSAPP",
        resource: "WHATSAPP",
        resourceId: whatsappMessage.id,
        details: `WhatsApp enviado a ${to}`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: whatsappMessage.id,
          status: "SENT",
          messageId: result.messages?.[0]?.id,
        },
        message: "Mensaje enviado exitosamente",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en enviar WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
