import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const logs = await prisma.vehicleLog.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        driver: { select: { name: true } },
        fuelEntries: true,
      },
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error) {
    console.error("Error en vehicle-logs GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { vehicleId, plate, vehicleType, startKm, startWater, startOil, startPhotos, startComment } = body;

    if (!plate || !vehicleType || !startKm) {
      return NextResponse.json({ success: false, error: "Placa, vehículo y kilometraje son requeridos" }, { status: 400 });
    }

    // Un vehículo no puede tener dos usos abiertos a la vez.
    if (vehicleId) {
      const openLog = await prisma.vehicleLog.findFirst({
        where: { vehicleId, status: "EN_USO" },
        select: { id: true, driver: { select: { name: true } } },
      });
      if (openLog) {
        return NextResponse.json(
          { success: false, error: `Ese vehículo ya tiene un uso abierto (${openLog.driver?.name || "otro conductor"}). Finalizá esa bitácora primero.` },
          { status: 409 }
        );
      }
    }

    const log = await prisma.vehicleLog.create({
      data: {
        vehicleId: vehicleId || null,
        plate,
        vehicleType,
        driverId: auth.payload.userId,
        startKm: parseInt(startKm),
        startWater: startWater || "",
        startOil: startOil || "",
        startPhotos: startPhotos || [],
        startComment: startComment || null,
      },
    });

    // El vehículo pasa a EN_USO automáticamente.
    if (vehicleId) {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { status: "EN_USO" } }).catch(() => {});
    }

    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("Error en vehicle-log POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
