import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "live-productions-webhook-token";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook de WhatsApp verificado exitosamente");
      return new NextResponse(challenge, { status: 200 });
    }

    return NextResponse.json(
      { success: false, error: "Token de verificación inválido" },
      { status: 403 }
    );
  } catch (error) {
    console.error("Error en verificación webhook:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.object === "whatsapp_business_account") {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === "messages") {
            const value = change.value;
            const messages = value?.messages || [];
            const contacts = value?.contacts || [];

            for (const message of messages) {
              const contact = contacts.find(
                (c: any) => c.wa_id === message.from
              );

              console.log("Mensaje recibido de WhatsApp:", {
                from: message.from,
                contactName: contact?.profile?.name || "Desconocido",
                text: message.text?.body || "",
                type: message.type,
                timestamp: message.timestamp,
              });

              try {
                const user = await prisma.user.findFirst({
                  where: {
                    OR: [
                      { phone: message.from },
                      { whatsappNumber: message.from },
                    ],
                  },
                  select: { id: true },
                });

                if (user) {
                  await prisma.whatsAppMessage.create({
                    data: {
                      userId: user.id,
                      toNumber: message.from,
                      message: message.text?.body || "[Mensaje no textual]",
                      type: "CHAT",
                      status: "DELIVERED",
                    },
                  });

                  await prisma.activity.create({
                    data: {
                      userId: user.id,
                      action: "WHATSAPP_RECIBIDO",
                      resource: "WHATSAPP",
                      details: `Mensaje recibido de ${contact?.profile?.name || message.from}`,
                    },
                  });
                }
              } catch (err) {
                console.error("Error al registrar mensaje entrante:", err);
              }
            }
          }
        }
      }
    }

    return NextResponse.json(
      { success: true, message: "Webhook procesado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en webhook WhatsApp:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
