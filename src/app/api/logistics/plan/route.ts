import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

const STATUSES = ["PENDIENTE", "CONFIRMADO", "EN_RUTA", "COMPLETADO"];

function text(v: unknown) {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function time(v: unknown) {
  if (typeof v !== "string" || !v.trim()) return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const { orderId } = body;
    if (!orderId) return NextResponse.json({ success: false, error: "Cuadro requerido" }, { status: 400 });

    const data = {
      reunionAt: time(body.reunionAt),
      departureAt: time(body.departureAt),
      arrivalAt: time(body.arrivalAt),
      montageAt: time(body.montageAt),
      soundcheckAt: time(body.soundcheckAt),
      eventStartAt: time(body.eventStartAt),
      eventEndAt: time(body.eventEndAt),
      showAt: time(body.showAt),
      showEndAt: time(body.showEndAt),
      dismantleAt: time(body.dismantleAt),
      dismantleEndAt: time(body.dismantleEndAt),
      vehicleId: text(body.vehicleId),
      vehicleLabel: text(body.vehicleLabel),
      driverId: text(body.driverId),
      driverName: text(body.driverName),
      staffVehicleId: text(body.staffVehicleId),
      staffVehicleLabel: text(body.staffVehicleLabel),
      staffDriverId: text(body.staffDriverId),
      staffDriverName: text(body.staffDriverName),
      staffPickup: text(body.staffPickup),
      staffPickupAt: time(body.staffPickupAt),
      musicianMeetPoint: text(body.musicianMeetPoint),
      musicianDepartureAt: time(body.musicianDepartureAt),
      musicianVehicleId: text(body.musicianVehicleId),
      musicianVehicleLabel: text(body.musicianVehicleLabel),
      musicianDriverId: text(body.musicianDriverId),
      musicianDriverName: text(body.musicianDriverName),
      providers: text(body.providers),
      notes: text(body.notes),
      questions: text(body.questions),
      status: STATUSES.includes(body.status) ? body.status : "PENDIENTE",
    };

    const plan = await prisma.logisticsPlan.upsert({
      where: { orderId },
      create: { orderId, ...data },
      update: data,
    });

    return NextResponse.json({ success: true, data: plan });
  } catch (error) {
    console.error("logistics plan PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
