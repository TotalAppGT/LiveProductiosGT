import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);

    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        firebaseUid: true,
        whatsappNumber: true,
        avatar: true,
        active: true,
        tenantId: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { success: false, error: "Cuenta desactivada" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: true, data: user },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en me:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
