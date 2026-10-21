import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { eventId, role, quantity, startTime, endTime, notes } = await request.json();
    if (!eventId || !role) return NextResponse.json({ success: false, error: "Evento y rol requeridos" }, { status: 400 });

    const item = await prisma.eventCrewRequirement.create({
      data: {
        eventId,
        role,
        quantity: Math.max(1, Number(quantity) || 1),
        startTime: startTime || null,
        endTime: endTime || null,
        notes: notes || null,
      },
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("requirements POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { id, role, quantity, startTime, endTime, notes } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (role !== undefined) data.role = role;
    if (quantity !== undefined) data.quantity = Math.max(1, Number(quantity) || 1);
    if (startTime !== undefined) data.startTime = startTime || null;
    if (endTime !== undefined) data.endTime = endTime || null;
    if (notes !== undefined) data.notes = notes || null;
    const item = await prisma.eventCrewRequirement.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("requirements PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });
    await prisma.eventCrewRequirement.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("requirements DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
