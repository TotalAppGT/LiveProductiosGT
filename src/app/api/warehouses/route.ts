import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
      include: { manager: { select: { id: true, name: true, phone: true } } },
    });
    return NextResponse.json({ success: true, data: warehouses });
  } catch (error) {
    console.error("Error warehouses GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasRole(auth.payload, "ADMIN", "DUENO")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { name, managerId, address, notes } = await request.json();
    if (!name) return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });

    const warehouse = await prisma.warehouse.create({
      data: { name, managerId: managerId || null, address: address || null, notes: notes || null },
    });
    return NextResponse.json({ success: true, data: warehouse });
  } catch (error) {
    console.error("Error warehouses POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasRole(auth.payload, "ADMIN", "DUENO")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { id, name, managerId, address, notes, active } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (managerId !== undefined) data.managerId = managerId || null;
    if (address !== undefined) data.address = address || null;
    if (notes !== undefined) data.notes = notes || null;
    if (active !== undefined) data.active = !!active;

    const warehouse = await prisma.warehouse.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: warehouse });
  } catch (error) {
    console.error("Error warehouses PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
