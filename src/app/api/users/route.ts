import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import type { Role } from "@prisma/client";
import { normalizeGTPhone } from "@/lib/phone";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para ver usuarios" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const role = searchParams.get("role") as Role | null;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    if (role && ["DUENO", "ADMIN", "JEFE", "EMPLEADO"].includes(role)) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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
          _count: { select: { assignedTasks: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar usuarios:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
        { success: false, error: "Solo administradores pueden crear usuarios" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, email, password, phone, role, whatsappNumber, tenantId, firebaseUid } = body;

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

    const { hashPassword } = await import("@/lib/auth");
    const hashedPassword = await hashPassword(password);

    const normalizedPhone = phone ? normalizeGTPhone(phone) : null;
    const normalizedWhatsapp = whatsappNumber ? normalizeGTPhone(whatsappNumber) : null;

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone: normalizedPhone,
        role: role || "EMPLEADO",
        whatsappNumber: normalizedWhatsapp,
        tenantId: tenantId || null,
        firebaseUid: firebaseUid || null,
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
        tenantId: true,
        createdAt: true,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_USUARIO",
        resource: "USER",
        resourceId: user.id,
        details: `Usuario ${user.name} creado por administrador`,
      },
    });

    return NextResponse.json(
      { success: true, data: user, message: "Usuario creado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear usuario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
