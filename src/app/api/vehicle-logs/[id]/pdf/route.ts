import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    const base64 = dataUrl.split(",")[1];
    if (!base64) return null;
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const log = await prisma.vehicleLog.findUnique({
      where: { id },
      include: { driver: { select: { name: true } }, fuelEntries: true },
    });

    if (!log) {
      return NextResponse.json({ error: "Bitácora no encontrada" }, { status: 404 });
    }

    const doc = new PDFDocument({ size: "LETTER", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Encabezado
    doc.fontSize(16).fillColor("#2563eb").text("LIVE PRODUCTIONS GT", { align: "center" });
    doc.fontSize(10).fillColor("#666").text("Informe de Uso de Vehículos", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#222").text(`Vehículo ${log.plate} — ${log.vehicleType}`, { align: "center" });
    doc.fontSize(9).fillColor("#555").text(`Conductor: ${log.driver?.name} · Generado: ${new Date().toLocaleString("es-GT")}`, { align: "center" });
    doc.moveDown(1);

    const drawPhotos = (photos: string[], labels: string[], size: number) => {
      const perRow = 3;
      const gap = 10;
      const x0 = doc.page.margins.left;
      const startY = doc.y;
      photos.forEach((p, i) => {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const x = x0 + col * (size + gap);
        const y = startY + row * (size + 20);
        if (y + size > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          drawPhotos(photos.slice(i), labels.slice(i), size);
          return;
        }
        doc.fontSize(7).fillColor("#555").text(labels[i] || "Foto", x, y, { width: size, align: "center" });
        const buf = dataUrlToBuffer(p);
        if (buf) {
          doc.image(buf, x, y + 10, { width: size, height: size, fit: [size, size] });
        } else {
          doc.rect(x, y + 10, size, size).stroke("#ddd");
        }
      });
      doc.y = startY + Math.ceil(photos.length / perRow) * (size + 20) + 10;
    };

    // Salida
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#2563eb").text("INFORMACIÓN DE SALIDA");
    doc.fontSize(9).fillColor("#333");
    doc.text(`Fecha de salida: ${new Date(log.startAt).toLocaleString("es-GT")}`);
    doc.text(`Kilometraje inicial: ${log.startKm} km`);
    doc.text(`Nivel de agua: ${log.startWater || "—"}    Nivel de aceite: ${log.startOil || "—"}`);
    if (log.startComment) doc.text(`Comentario: ${log.startComment}`);
    doc.moveDown(0.5);

    const startLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der", "Tablero/KM", "Interior"];
    drawPhotos(log.startPhotos, startLabels, 150);

    // Combustible
    if (log.fuelEntries.length > 0) {
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#2563eb").text(`CARGAS DE COMBUSTIBLE (${log.fuelEntries.length})`);
      for (const f of log.fuelEntries) {
        doc.fontSize(9).fillColor("#333").text(`Carga · ${new Date(f.createdAt).toLocaleString("es-GT")}`);
        drawPhotos(f.photos || [], ["Tablero antes", "Bomba/Gasolinera", "Factura", "Tablero después"], 120);
      }
    }

    // Retorno
    if (log.status === "FINALIZADO") {
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#2563eb").text("INFORMACIÓN DE RETORNO");
      doc.fontSize(9).fillColor("#333");
      doc.text(`Fecha de retorno: ${new Date(log.endAt!).toLocaleString("es-GT")}`);
      doc.text(`Kilometraje final: ${log.endKm} km    Recorrido total: ${(log.endKm || 0) - log.startKm} km`);
      doc.text(`Nivel de agua: ${log.endWater || "—"}    Nivel de aceite: ${log.endOil || "—"}`);
      if (log.endComment) doc.text(`Comentario: ${log.endComment}`);
      doc.moveDown(0.5);
      const endLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der"];
      drawPhotos(log.endPhotos, endLabels, 150);
    }

    // Pie
    doc.moveDown(1);
    doc.fontSize(7).fillColor("#999").text("Documento generado automáticamente por el sistema · Live Productions GT", { align: "center" });

    doc.end();
    const buffer = await done;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="uso-vehiculo-${log.plate}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando PDF:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
