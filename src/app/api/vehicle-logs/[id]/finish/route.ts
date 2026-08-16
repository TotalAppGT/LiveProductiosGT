import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Finalizar bitácora: fotos de retorno + datos finales
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
    const { endKm, endWater, endOil, endPhotos, endComment } = body;

    if (!endKm) {
      return NextResponse.json({ success: false, error: "Kilometraje final requerido" }, { status: 400 });
    }
    if (!endPhotos || endPhotos.length < 4) {
      return NextResponse.json({ success: false, error: "Se requieren las 4 fotos de retorno" }, { status: 400 });
    }

    const log = await prisma.vehicleLog.update({
      where: { id },
      data: {
        status: "FINALIZADO",
        endKm: parseInt(endKm),
        endWater: endWater || null,
        endOil: endOil || null,
        endPhotos: endPhotos,
        endComment: endComment || null,
        endAt: new Date(),
      },
    });

    // Actualizar kilometraje del vehículo
    if (log.vehicleId) {
      await prisma.vehicle.update({
        where: { id: log.vehicleId },
        data: { mileage: parseInt(endKm) },
      });
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "FINALIZAR_BITACORA_VEHICULO",
        resource: "VEHICLE_LOG",
        resourceId: id,
        details: `Bitácora del vehículo ${log.plate} finalizada`,
      },
    });

    // Auto-generar reporte en el repositorio + guardar PDF
    let pdfBase64: string | null = null;
    try {
      const fullLog = await prisma.vehicleLog.findUnique({
        where: { id },
        include: { driver: { select: { name: true } }, fuelEntries: true },
      });
      if (fullLog) {
        const { generateVehicleLogPdf } = await import("@/lib/vehicle-log-pdf");
        const pdfBuffer = await generateVehicleLogPdf(fullLog);
        pdfBase64 = pdfBuffer.toString("base64");
      }
    } catch (e) {
      console.error("Error generando PDF en finish:", e);
    }

    const report = await prisma.report.create({
      data: {
        title: `Bitácora ${log.plate} - ${log.vehicleType}`,
        category: "USO_VEHICULOS",
        resourceType: "vehicle_log",
        resourceId: id,
        pdfData: pdfBase64,
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json({ success: true, data: log, reportId: report.id });
  } catch (error) {
    console.error("Error en finish:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
