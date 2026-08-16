import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateVehicleLogPdf } from "@/lib/vehicle-log-pdf";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const report = await prisma.report.findUnique({ where: { id } });

    if (!report) {
      return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
    }

    // Si el PDF ya está guardado, devolverlo
    if (report.pdfData) {
      const buffer = Buffer.from(report.pdfData, "base64");
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="reporte-${report.id}.pdf"`,
        },
      });
    }

    // Si no está guardado, generarlo on-demand (vehicle log)
    if (report.resourceType === "vehicle_log") {
      const log = await prisma.vehicleLog.findUnique({
        where: { id: report.resourceId },
        include: { driver: { select: { name: true } }, fuelEntries: true },
      });
      if (log) {
        const buffer = await generateVehicleLogPdf(log);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="uso-vehiculo-${log.plate}.pdf"`,
          },
        });
      }
    }

    return NextResponse.json({ error: "No se pudo generar el PDF" }, { status: 400 });
  } catch (error) {
    console.error("Error en report pdf:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
