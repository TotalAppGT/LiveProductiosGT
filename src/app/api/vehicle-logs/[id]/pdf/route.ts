import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  try {
    if (!dataUrl || typeof dataUrl !== "string") return null;
    if (!dataUrl.startsWith("data:")) return null;
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
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));
    });

    // Encabezado
    doc.fontSize(16).fillColor("#2563eb").text("LIVE PRODUCTIONS GT", { align: "center" });
    doc.fontSize(10).fillColor("#666666").text("Informe de Uso de Vehículos", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#222222").text(`Vehículo ${log.plate} — ${log.vehicleType}`, { align: "center" });
    doc.fontSize(9).fillColor("#555555").text(`Conductor: ${log.driver?.name} · Generado: ${new Date().toLocaleString("es-GT")}`, { align: "center" });
    doc.moveDown(1);

    const drawPhotos = (photos: string[], labels: string[], size: number) => {
      const perRow = 3;
      const gap = 10;
      const x0 = doc.page.margins.left;
      for (let i = 0; i < photos.length; i++) {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const x = x0 + col * (size + gap);
        const y = doc.y + row * (size + 16);
        if (y + size > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          doc.y = doc.page.margins.top;
          const col2 = i % perRow;
          const x2 = x0 + col2 * (size + gap);
          drawPhotoSingle(photos[i], labels[i], x2, doc.y, size);
        } else {
          drawPhotoSingle(photos[i], labels[i], x, y, size);
        }
      }
      doc.y += Math.ceil(photos.length / perRow) * (size + 16) + 10;
    };

    const drawPhotoSingle = (photo: string, label: string, x: number, y: number, size: number) => {
      doc.fontSize(7).fillColor("#555555").text(label, x, y, { width: size, align: "center" });
      const buf = dataUrlToBuffer(photo);
      if (buf) {
        try {
          doc.image(buf, x, y + 12, { width: size, height: size });
        } catch {
          doc.rect(x, y + 12, size, size).stroke("#cccccc");
        }
      } else {
        doc.rect(x, y + 12, size, size).stroke("#cccccc");
      }
    };

    // Salida
    doc.fontSize(11).fillColor("#2563eb").text("INFORMACIÓN DE SALIDA");
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#333333");
    doc.text(`Fecha de salida: ${new Date(log.startAt).toLocaleString("es-GT")}`);
    doc.text(`Kilometraje inicial: ${log.startKm} km`);
    doc.text(`Nivel de agua: ${log.startWater || "—"}    Nivel de aceite: ${log.startOil || "—"}`);
    if (log.startComment) doc.text(`Comentario: ${log.startComment}`);
    doc.moveDown(0.5);

    const startLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der", "Tablero/KM", "Interior"];
    drawPhotos(log.startPhotos, startLabels, 150);

    // Combustible
    if (log.fuelEntries.length > 0) {
      doc.fontSize(11).fillColor("#2563eb").text(`CARGAS DE COMBUSTIBLE (${log.fuelEntries.length})`);
      doc.moveDown(0.3);
      for (const f of log.fuelEntries) {
        doc.fontSize(9).fillColor("#333333").text(`Carga · ${new Date(f.createdAt).toLocaleString("es-GT")}`);
        drawPhotos(f.photos || [], ["Tablero antes", "Bomba/Gasolinera", "Factura", "Tablero después"], 120);
      }
    }

    // Retorno
    if (log.status === "FINALIZADO") {
      doc.fontSize(11).fillColor("#2563eb").text("INFORMACIÓN DE RETORNO");
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("#333333");
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
    doc.fontSize(7).fillColor("#999999").text("Documento generado automáticamente por el sistema · Live Productions GT", { align: "center" });

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
