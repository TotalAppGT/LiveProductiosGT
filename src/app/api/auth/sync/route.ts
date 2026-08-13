import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken, hashPassword, authenticateRequest } from "@/lib/auth";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firebaseUid, email, name, photoURL } = body;

    if (!firebaseUid || !email) {
      return NextResponse.json(
        { success: false, error: "Firebase UID y email son requeridos" },
        { status: 400 }
      );
    }

    try {
      await getAdminAuth().getUser(firebaseUid);
    } catch {
      return NextResponse.json(
        { success: false, error: "Firebase UID no válido" },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({
      where: { firebaseUid },
    });

    if (user) {
      if (!user.active) {
        return NextResponse.json(
          { success: false, error: "Cuenta desactivada" },
          { status: 403 }
        );
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          name: name || user.name,
          avatar: photoURL || user.avatar,
        },
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
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
          position: true,
          modules: true,
          tenantId: true,
          createdAt: true,
        },
      });

      const token = generateToken(user.id, user.role, user.tenantId);

      await prisma.activity.create({
        data: {
          userId: user.id,
          action: "SYNC",
          resource: "USER",
          resourceId: user.id,
          details: `Sincronización Firebase para ${user.name}`,
        },
      });

      return NextResponse.json(
        {
          success: true,
          data: { user: updatedUser, token, isNew: false },
          message: "Usuario sincronizado exitosamente",
        },
        { status: 200 }
      );
    }

    user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firebaseUid,
          name: name || user.name,
          avatar: photoURL || user.avatar,
        },
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
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
          position: true,
          modules: true,
          tenantId: true,
          createdAt: true,
        },
      });

      const token = generateToken(user.id, user.role, user.tenantId);

      return NextResponse.json(
        {
          success: true,
          data: { user: updatedUser, token, isNew: false },
          message: "Usuario vinculado con Firebase exitosamente",
        },
        { status: 200 }
      );
    }

    const randomPassword = Math.random().toString(36).slice(-12) + "A1!";
    const hashedPassword = await hashPassword(randomPassword);

    const newUser = await prisma.user.create({
      data: {
        email,
        name: name || email.split("@")[0],
        password: hashedPassword,
        firebaseUid,
        avatar: photoURL || null,
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
        avatar: true,
        active: true,
        position: true,
        modules: true,
        tenantId: true,
        createdAt: true,
      },
    });

    const token = generateToken(newUser.id, newUser.role);

    await prisma.activity.create({
      data: {
        userId: newUser.id,
        action: "REGISTRO",
        resource: "USER",
        resourceId: newUser.id,
        details: `Usuario ${newUser.name} creado mediante sincronización Firebase`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: { user: newUser, token, isNew: true },
        message: "Usuario creado y sincronizado exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en sync:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
