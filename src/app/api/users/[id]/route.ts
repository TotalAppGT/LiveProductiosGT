import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { normalizeGTPhone } from "@/lib/phone";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
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
        updatedAt: true,
        _count: {
          select: {
            assignedTasks: true,
            cobros: true,
            inventoryItems: true,
            vehicles: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    if (!hasMinRole(auth.payload, "JEFE") && auth.payload.userId !== id) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para ver este usuario" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { success: true, data: user },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener usuario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    if (!hasMinRole(auth.payload, "ADMIN") && auth.payload.userId !== id) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para modificar este usuario" },
        { status: 403 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, email, phone, role, whatsappNumber, avatar, active, tenantId, firebaseUid } = body;

    if (role !== undefined && !hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden cambiar roles" },
        { status: 403 }
      );
    }

    if (email && email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists) {
        return NextResponse.json(
          { success: false, error: "El email ya está en uso" },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        email: email !== undefined ? email : undefined,
        phone: phone !== undefined ? (phone ? normalizeGTPhone(phone) : null) : undefined,
        role: role !== undefined ? role : undefined,
        whatsappNumber: whatsappNumber !== undefined ? (whatsappNumber ? normalizeGTPhone(whatsappNumber) : null) : undefined,
        avatar: avatar !== undefined ? avatar : undefined,
        active: active !== undefined ? active : undefined,
        tenantId: tenantId !== undefined ? tenantId : undefined,
        firebaseUid: firebaseUid !== undefined ? firebaseUid : undefined,
      },
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
        updatedAt: true,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ACTUALIZAR_USUARIO",
        resource: "USER",
        resourceId: id,
        details: `Usuario ${user.name} actualizado`,
      },
    });

    return NextResponse.json(
      { success: true, data: user, message: "Usuario actualizado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar usuario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden desactivar usuarios" },
        { status: 403 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { id } });
    if (!existingUser) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    await prisma.user.update({
      where: { id },
      data: { active: false },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "DESACTIVAR_USUARIO",
        resource: "USER",
        resourceId: id,
        details: `Usuario ${existingUser.name} desactivado`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Usuario desactivado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en desactivar usuario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
