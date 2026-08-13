import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

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

function getLogoBuffer(): Buffer | null {
  try {
    const logoPath = path.join(process.cwd(), "public", "logo.png");
    if (fs.existsSync(logoPath)) return fs.readFileSync(logoPath);
    return null;
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

    const doc = new PDFDocument({ size: "LETTER", margin: 40, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));
    });

    const safeArray = (arr: any): string[] => (Array.isArray(arr) ? arr : []);

    const drawSectionTitle = (title: string) => {
      doc.fontSize(11).fillColor("#1e40af").text(title, { align: "left" });
      doc.moveDown(0.2);
    };

    const drawPhotoGrid = (photos: string[], labels: string[], size: number, perRow: number = 3) => {
      const gap = 8;
      const labelH = 12;
      const cellH = size + labelH;
      const x0 = doc.page.margins.left;
      const startY = doc.y;
      const rows = Math.ceil(photos.length / perRow);
      for (let i = 0; i < photos.length; i++) {
        const col = i % perRow;
        const row = Math.floor(i / perRow);
        const x = x0 + col * (size + gap);
        const y = startY + row * cellH;
        if (y + size + labelH > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          doc.y = doc.page.margins.top;
          const remaining = photos.slice(i);
          const remLabels = labels.slice(i);
          for (let j = 0; j < remaining.length; j++) {
            const c = j % perRow;
            const r = Math.floor(j / perRow);
            const rx = x0 + c * (size + gap);
            const ry = doc.page.margins.top + r * cellH;
            doc.fontSize(7).fillColor("#555555").text(remLabels[j] || "Foto", rx, ry, { width: size, align: "center" });
            const b = dataUrlToBuffer(remaining[j]);
            if (b) {
              try { doc.image(b, rx, ry + 2, { width: size, height: size }); }
              catch { doc.rect(rx, ry + 2, size, size).stroke("#cccccc"); }
            } else {
              doc.rect(rx, ry + 2, size, size).stroke("#cccccc");
            }
          }
          doc.y = doc.page.margins.top + Math.ceil(remaining.length / perRow) * cellH + 6;
          return;
        }
        doc.fontSize(7).fillColor("#555555").text(labels[i] || "Foto", x, y, { width: size, align: "center" });
        const buf = dataUrlToBuffer(photos[i]);
        if (buf) {
          try { doc.image(buf, x, y + 2, { width: size, height: size }); }
          catch { doc.rect(x, y + 2, size, size).stroke("#cccccc"); }
        } else {
          doc.rect(x, y + 2, size, size).stroke("#cccccc");
        }
      }
      doc.y = startY + rows * cellH + 8;
    };

    // ===== ENCABEZADO (membrete con logo en esquina) =====
    const logo = getLogoBuffer();
    if (logo) {
      try {
        doc.image(logo, doc.page.margins.left, doc.page.margins.top, { width: 55, height: 55 });
      } catch {}
    }
    const textX = doc.page.margins.left + 65;
    doc.fontSize(16).fillColor("#1e40af").text("LIVE PRODUCTIONS GT", textX, doc.page.margins.top + 2, { align: "left" });
    doc.fontSize(9).fillColor("#666666").text("Informe de Uso de Vehículos", textX, doc.page.margins.top + 22, { align: "left" });
    doc.fontSize(9).fillColor("#555555").text(`Vehículo: ${log.plate} — ${log.vehicleType}`, textX, doc.page.margins.top + 34, { align: "left" });
    // Línea divisoria
    doc.moveTo(doc.page.margins.left, doc.page.margins.top + 62).lineTo(doc.page.width - doc.page.margins.right, doc.page.margins.top + 62).stroke("#1e40af");
    doc.y = doc.page.margins.top + 70;

    doc.fontSize(9).fillColor("#333333").text(`Conductor: ${log.driver?.name || "—"}    ·    Generado: ${new Date().toLocaleString("es-GT")}`, { align: "left" });
    doc.moveDown(0.8);

    // ===== SALIDA =====
    drawSectionTitle("INFORMACIÓN DE SALIDA");
    doc.fontSize(9).fillColor("#333333");
    doc.text(`Fecha de salida: ${new Date(log.startAt).toLocaleString("es-GT")}`, { align: "left" });
    doc.text(`Kilometraje inicial: ${log.startKm} km`, { align: "left" });
    doc.text(`Nivel de agua: ${log.startWater || "—"}    Nivel de aceite: ${log.startOil || "—"}`, { align: "left" });
    if (log.startComment) doc.text(`Comentario: ${log.startComment}`, { align: "left" });
    doc.moveDown(0.4);

    const startLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der", "Tablero/KM", "Interior"];
    drawPhotoGrid(safeArray(log.startPhotos), startLabels, 135);

    // ===== COMBUSTIBLE (nueva página si hay) =====
    const fuelEntries = Array.isArray(log.fuelEntries) ? log.fuelEntries : [];
    if (fuelEntries.length > 0) {
      doc.addPage();
      drawSectionTitle(`CARGAS DE COMBUSTIBLE (${fuelEntries.length})`);
      for (const f of fuelEntries) {
        doc.fontSize(9).fillColor("#333333").text(`Carga · ${new Date(f.createdAt).toLocaleString("es-GT")}`, { align: "left" });
        drawPhotoGrid(safeArray(f.photos), ["Tablero antes", "Bomba/Gasolinera", "Factura", "Tablero después"], 110, 4);
      }
    }

    // ===== RETORNO (nueva página) =====
    if (log.status === "FINALIZADO" && log.endAt) {
      doc.addPage();
      drawSectionTitle("INFORMACIÓN DE RETORNO");
      doc.fontSize(9).fillColor("#333333");
      doc.text(`Fecha de retorno: ${new Date(log.endAt).toLocaleString("es-GT")}`, { align: "left" });
      doc.text(`Kilometraje final: ${log.endKm} km    Recorrido total: ${(log.endKm || 0) - log.startKm} km`, { align: "left" });
      doc.text(`Nivel de agua: ${log.endWater || "—"}    Nivel de aceite: ${log.endOil || "—"}`, { align: "left" });
      if (log.endComment) doc.text(`Comentario: ${log.endComment}`, { align: "left" });
      doc.moveDown(0.4);
      const endLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der"];
      drawPhotoGrid(safeArray(log.endPhotos), endLabels, 135);
    }

    doc.moveDown(0.8);
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
    return NextResponse.json({ error: "Error interno: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
