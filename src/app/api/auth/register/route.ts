import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, hashPassword } from "@/lib/auth";
import { getAdminAuth } from "@/lib/firebase-admin";
import { normalizeGTPhone } from "@/lib/phone";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, whatsappNumber, firebaseUid } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { success: false, error: "Nombre, email y contraseña son requeridos" },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "El email ya está registrado" },
        { status: 400 }
      );
    }

    if (firebaseUid) {
      try {
        await getAdminAuth().getUser(firebaseUid);
      } catch {
        return NextResponse.json(
          { success: false, error: "Firebase UID no válido" },
          { status: 400 }
        );
      }

      const firebaseUser = await prisma.user.findUnique({
        where: { firebaseUid },
      });
      if (firebaseUser) {
        return NextResponse.json(
          { success: false, error: "Este usuario de Firebase ya está vinculado" },
          { status: 400 }
        );
      }
    }

    const hashedPassword = await hashPassword(password);

    const normalizedPhone = phone ? normalizeGTPhone(phone) : null;
    const normalizedWhatsapp = whatsappNumber ? normalizeGTPhone(whatsappNumber) : null;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: normalizedPhone,
        whatsappNumber: normalizedWhatsapp,
        firebaseUid: firebaseUid || null,
        role: "EMPLEADO",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        firebaseUid: true,
        whatsappNumber: true,
        active: true,
        createdAt: true,
      },
    });

    const token = generateToken(user.id, user.role);

    await prisma.activity.create({
      data: {
        userId: user.id,
        action: "REGISTRO",
        resource: "USER",
        resourceId: user.id,
        details: `Usuario ${user.name} registrado`,
      },
    });

    return NextResponse.json(
      { success: true, data: { user, token }, message: "Usuario registrado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en registro:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
