import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { eventId, vehicleId, driverId, cargoNotes, cargoM3, cargoKg, departureAt, returnAt } = await request.json();
    if (!eventId || !vehicleId) return NextResponse.json({ success: false, error: "Evento y vehículo requeridos" }, { status: 400 });

    const item = await prisma.eventVehicle.create({
      data: {
        eventId,
        vehicleId,
        driverId: driverId || null,
        cargoNotes: cargoNotes || null,
        cargoM3: cargoM3 !== undefined && cargoM3 !== "" ? Number(cargoM3) : null,
        cargoKg: cargoKg !== undefined && cargoKg !== "" ? Number(cargoKg) : null,
        departureAt: departureAt ? new Date(departureAt) : null,
        returnAt: returnAt ? new Date(returnAt) : null,
      },
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("ops vehicles POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { id, driverId, cargoNotes, cargoM3, cargoKg, departureAt, returnAt } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (driverId !== undefined) data.driverId = driverId || null;
    if (cargoNotes !== undefined) data.cargoNotes = cargoNotes || null;
    if (cargoM3 !== undefined) data.cargoM3 = cargoM3 === "" ? null : Number(cargoM3);
    if (cargoKg !== undefined) data.cargoKg = cargoKg === "" ? null : Number(cargoKg);
    if (departureAt !== undefined) data.departureAt = departureAt ? new Date(departureAt) : null;
    if (returnAt !== undefined) data.returnAt = returnAt ? new Date(returnAt) : null;
    const item = await prisma.eventVehicle.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("ops vehicles PUT:", error);
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
    await prisma.eventVehicle.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ops vehicles DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
