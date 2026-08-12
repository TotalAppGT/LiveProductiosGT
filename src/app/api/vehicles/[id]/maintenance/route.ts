import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const records = await prisma.vehicleMaintenance.findMany({
      where: { vehicleId: id },
      orderBy: { date: "desc" },
      include: { doneBy: { select: { name: true } } },
    });

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("Error obteniendo mantenimiento:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { type, description, cost, date, mileage, notes } = body;

    const record = await prisma.vehicleMaintenance.create({
      data: {
        vehicleId: id,
        type: type || "OTRO",
        description: description || null,
        cost: cost !== undefined && cost !== "" ? parseFloat(cost) : null,
        date: date ? new Date(date) : new Date(),
        mileage: mileage !== undefined && mileage !== "" ? parseInt(mileage) : null,
        notes: notes || null,
        doneById: auth.payload.userId,
      },
    });

    await prisma.vehicle.update({
      where: { id },
      data: {
        lastMaintenanceAt: date ? new Date(date) : new Date(),
        mileage: mileage !== undefined && mileage !== "" ? parseInt(mileage) : undefined,
      },
    });

    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    console.error("Error creando mantenimiento:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { recordId } = body;

    if (!recordId) {
      return NextResponse.json({ success: false, error: "recordId requerido" }, { status: 400 });
    }

    await prisma.vehicleMaintenance.delete({ where: { id: recordId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando mantenimiento:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
