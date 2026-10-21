import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const staff = await prisma.staffProfile.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { user: { select: { id: true, name: true, phone: true, whatsappNumber: true } } },
    });
    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("operations staff GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const { name, phone, roles, userId, notes } = body;
    if (!name?.trim()) return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });

    const staff = await prisma.staffProfile.create({
      data: {
        name: name.trim(),
        phone: phone?.trim() || null,
        roles: Array.isArray(roles) ? roles : [],
        userId: userId || null,
        notes: notes || null,
      },
    });
    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("operations staff POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const { id, name, phone, roles, userId, active, notes } = body;
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone || null;
    if (roles !== undefined) data.roles = roles;
    if (userId !== undefined) data.userId = userId || null;
    if (active !== undefined) data.active = !!active;
    if (notes !== undefined) data.notes = notes || null;

    const staff = await prisma.staffProfile.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: staff });
  } catch (error) {
    console.error("operations staff PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
