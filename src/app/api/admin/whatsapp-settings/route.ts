import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden acceder a configuración de WhatsApp" },
        { status: 403 }
      );
    }

    const config = await prisma.whatsAppConfig.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(
      {
        success: true,
        data: config || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener WhatsApp config:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar configuración de WhatsApp" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      id,
      phoneNumberId,
      accessToken,
      verifyToken,
      businessPhone,
      webhookUrl,
      qrCodeUrl,
      isActive,
    } = body;

    let config;

    if (id) {
      const existing = await prisma.whatsAppConfig.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Configuración no encontrada" },
          { status: 404 }
        );
      }

      config = await prisma.whatsAppConfig.update({
        where: { id },
        data: {
          phoneNumberId: phoneNumberId !== undefined ? phoneNumberId : undefined,
          accessToken: accessToken !== undefined ? accessToken : undefined,
          verifyToken: verifyToken !== undefined ? verifyToken : undefined,
          businessPhone: businessPhone !== undefined ? businessPhone : undefined,
          webhookUrl: webhookUrl !== undefined ? webhookUrl : undefined,
          qrCodeUrl: qrCodeUrl !== undefined ? qrCodeUrl : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
        },
      });
    } else {
      config = await prisma.whatsAppConfig.create({
        data: {
          phoneNumberId: phoneNumberId || "",
          accessToken: accessToken || "",
          verifyToken: verifyToken || "",
          businessPhone: businessPhone || "",
          webhookUrl: webhookUrl || "",
          qrCodeUrl: qrCodeUrl || "",
          isActive: isActive ?? false,
        },
      });
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "UPDATE_WHATSAPP_CONFIG",
        resource: "WHATSAPP_CONFIG",
        resourceId: config.id,
        details: `Configuración de WhatsApp actualizada (isActive: ${config.isActive})`,
      },
    });

    return NextResponse.json(
      { success: true, data: config, message: "Configuración de WhatsApp actualizada" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar WhatsApp config:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
