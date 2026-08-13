import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, comparePassword } from "@/lib/auth";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firebaseUid } = body;

    if (!email || (!password && !firebaseUid)) {
      return NextResponse.json(
        { success: false, error: "Email y contraseña o Firebase UID son requeridos" },
        { status: 400 }
      );
    }

    const userSelect = {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      firebaseUid: true,
      whatsappNumber: true,
      avatar: true,
      active: true,
      position: true,
      modules: true,
      tenantId: true,
      createdAt: true,
    };

    let user: {
      id: string;
      name: string;
      email: string;
      phone: string | null;
      role: import("@prisma/client").Role;
      firebaseUid: string | null;
      whatsappNumber: string | null;
      avatar: string | null;
      active: boolean;
      tenantId: string | null;
      createdAt: Date;
    };

    if (firebaseUid) {
      try {
        await getAdminAuth().getUser(firebaseUid);
      } catch {
        return NextResponse.json(
          { success: false, error: "Firebase UID no válido" },
          { status: 400 }
        );
      }

      const found = await prisma.user.findUnique({
        where: { firebaseUid },
        select: userSelect,
      });

      if (!found) {
        return NextResponse.json(
          { success: false, error: "Usuario no encontrado con ese Firebase UID" },
          { status: 404 }
        );
      }

      if (!found.active) {
        return NextResponse.json(
          { success: false, error: "Cuenta desactivada. Contacte al administrador" },
          { status: 403 }
        );
      }

      user = found;
    } else {
      const found = await prisma.user.findUnique({
        where: { email },
        select: { ...userSelect, password: true },
      });

      if (!found) {
        return NextResponse.json(
          { success: false, error: "Credenciales inválidas" },
          { status: 401 }
        );
      }

      if (!found.active) {
        return NextResponse.json(
          { success: false, error: "Cuenta desactivada. Contacte al administrador" },
          { status: 403 }
        );
      }

      const isPasswordValid = await comparePassword(password, found.password);
      if (!isPasswordValid) {
        return NextResponse.json(
          { success: false, error: "Credenciales inválidas" },
          { status: 401 }
        );
      }

      const { password: _, ...rest } = found;
      user = rest;
    }

    const token = generateToken(user.id, user.role, user.tenantId);

    await prisma.activity.create({
      data: {
        userId: user.id,
        action: "LOGIN",
        resource: "USER",
        resourceId: user.id,
        details: `Usuario ${user.name} inició sesión`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { user, token },
        message: "Inicio de sesión exitoso",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en login:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
