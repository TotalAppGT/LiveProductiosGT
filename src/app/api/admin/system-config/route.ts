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
        { success: false, error: "Solo administradores pueden acceder a configuraciones del sistema" },
        { status: 403 }
      );
    }

    const configs = await prisma.systemConfig.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(
      { success: true, data: configs },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener system configs:", error);
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
        { success: false, error: "Solo administradores pueden modificar configuraciones del sistema" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { key, value, description } = body;

    if (!key) {
      return NextResponse.json(
        { success: false, error: "La clave (key) es requerida" },
        { status: 400 }
      );
    }

    if (value === undefined) {
      return NextResponse.json(
        { success: false, error: "El valor (value) es requerido" },
        { status: 400 }
      );
    }

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: {
        value,
        description: description !== undefined ? description : undefined,
      },
      create: {
        key,
        value,
        description: description || "",
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "UPDATE_SYSTEM_CONFIG",
        resource: "SYSTEM_CONFIG",
        resourceId: config.id,
        details: `Configuración del sistema actualizada: ${key}`,
      },
    });

    return NextResponse.json(
      { success: true, data: config, message: `Configuración "${key}" actualizada` },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar system config:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
        { success: false, error: "Solo administradores pueden eliminar configuraciones del sistema" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { success: false, error: "La clave (key) es requerida" },
        { status: 400 }
      );
    }

    const existing = await prisma.systemConfig.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Configuración no encontrada" },
        { status: 404 }
      );
    }

    await prisma.systemConfig.delete({ where: { key } });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "DELETE_SYSTEM_CONFIG",
        resource: "SYSTEM_CONFIG",
        resourceId: existing.id,
        details: `Configuración del sistema eliminada: ${key}`,
      },
    });

    return NextResponse.json(
      { success: true, message: `Configuración "${key}" eliminada` },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en eliminar system config:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
