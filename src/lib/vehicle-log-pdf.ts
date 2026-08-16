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

export async function generateVehicleLogPdf(log: any): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 50, autoFirstPage: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
  });

  const safeArray = (arr: any): string[] => (Array.isArray(arr) ? arr : []);
  const pageW = doc.page.width;
  const contentW = pageW - 100;

  const drawInfoTable = (rows: [string, string][]) => {
    const labelW = 170;
    const lineH = 15;
    doc.fontSize(9);
    rows.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fillColor("#333333").text(label, doc.page.margins.left, doc.y, { width: labelW, lineBreak: false });
      doc.font("Helvetica").fillColor("#222222").text(value, doc.page.margins.left + labelW, doc.y, { width: contentW - labelW, lineBreak: true });
      doc.moveDown(lineH / 30);
    });
  };

  const drawSectionTitle = (title: string) => {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 120) doc.addPage();
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor("#1e40af").text(title);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(pageW - doc.page.margins.right, doc.y).stroke("#93c5fd");
    doc.moveDown(0.3);
  };

  const drawPhotoGrid = (photos: string[], labels: string[], size: number, perRow: number = 3) => {
    const gap = 12;
    const labelH = 12;
    const cellH = size + labelH;
    const x0 = doc.page.margins.left;
    const startY = doc.y;
    const cols = perRow;
    const cellW = (contentW - gap * (cols - 1)) / cols;
    const imgSize = Math.min(size, cellW);
    const rows = Math.ceil(photos.length / cols);
    for (let i = 0; i < photos.length; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = x0 + col * (cellW + gap);
      const y = startY + row * cellH;
      if (y + imgSize + labelH > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        doc.y = doc.page.margins.top;
        const remaining = photos.slice(i);
        const remLabels = labels.slice(i);
        for (let j = 0; j < remaining.length; j++) {
          const c = j % cols;
          const r = Math.floor(j / cols);
          const rx = x0 + c * (cellW + gap);
          const ry = doc.page.margins.top + r * cellH;
          doc.fontSize(7).fillColor("#555555").text(remLabels[j] || "Foto", rx, ry, { width: cellW, align: "center" });
          const b = dataUrlToBuffer(remaining[j]);
          if (b) {
            try { doc.image(b, rx + (cellW - imgSize) / 2, ry + 2, { width: imgSize, height: imgSize }); }
            catch { doc.rect(rx + (cellW - imgSize) / 2, ry + 2, imgSize, imgSize).stroke("#cccccc"); }
          } else {
            doc.rect(rx + (cellW - imgSize) / 2, ry + 2, imgSize, imgSize).stroke("#cccccc");
          }
        }
        doc.y = doc.page.margins.top + Math.ceil(remaining.length / cols) * cellH + 8;
        return;
      }
      doc.fontSize(7).fillColor("#555555").text(labels[i] || "Foto", x, y, { width: cellW, align: "center" });
      const buf = dataUrlToBuffer(photos[i]);
      if (buf) {
        try { doc.image(buf, x + (cellW - imgSize) / 2, y + 2, { width: imgSize, height: imgSize }); }
        catch { doc.rect(x + (cellW - imgSize) / 2, y + 2, imgSize, imgSize).stroke("#cccccc"); }
      } else {
        doc.rect(x + (cellW - imgSize) / 2, y + 2, imgSize, imgSize).stroke("#cccccc");
      }
    }
    doc.y = startY + rows * cellH + 8;
  };

  // Encabezado
  const logo = getLogoBuffer();
  const headerTop = doc.page.margins.top;
  if (logo) {
    try { doc.image(logo, doc.page.margins.left, headerTop, { width: 50, height: 50 }); } catch {}
  }
  const textX = doc.page.margins.left + 62;
  doc.fontSize(15).fillColor("#1e40af").text("LIVE PRODUCTIONS GT", textX, headerTop, { align: "left" });
  doc.fontSize(9).fillColor("#444444").text("Uso de Vehículo · Responsiva Digital", textX, headerTop + 18, { align: "left" });
  doc.fontSize(9).fillColor("#555555").text(`Vehículo: ${log.plate} — ${log.vehicleType}`, textX, headerTop + 30, { align: "left" });
  doc.moveTo(doc.page.margins.left, headerTop + 58).lineTo(pageW - doc.page.margins.right, headerTop + 58).stroke("#1e40af");
  doc.y = headerTop + 66;
  doc.fontSize(9).fillColor("#333333").text(`Conductor: ${log.driver?.name || "—"}    ·    Generado: ${new Date().toLocaleString("es-GT")}`);
  doc.moveDown(0.6);

  // 1. Salida
  drawSectionTitle("1. SALIDA DEL VEHÍCULO");
  const salidaRows: [string, string][] = [
    ["Fecha de salida", new Date(log.startAt).toLocaleString("es-GT")],
    ["Kilometraje inicial", `${log.startKm} km`],
    ["Nivel de agua", log.startWater || "—"],
    ["Nivel de aceite", log.startOil || "—"],
  ];
  if (log.startComment) salidaRows.push(["Comentario", log.startComment]);
  drawInfoTable(salidaRows);
  doc.moveDown(0.4);
  drawPhotoGrid(safeArray(log.startPhotos), ["Frontal", "Trasera", "Lateral Izq", "Lateral Der", "Tablero/KM", "Interior"], 100);

  // 2. Combustible
  const fuelEntries = Array.isArray(log.fuelEntries) ? log.fuelEntries : [];
  if (fuelEntries.length > 0) {
    drawSectionTitle(`2. CARGAS DE COMBUSTIBLE (${fuelEntries.length})`);
    for (const f of fuelEntries) {
      doc.fontSize(9).fillColor("#333333").text(`Carga · ${new Date(f.createdAt).toLocaleString("es-GT")}`);
      drawPhotoGrid(safeArray(f.photos), ["Tablero antes", "Bomba/Gasolinera", "Factura", "Tablero después"], 90, 4);
    }
  }

  // 3. Retorno
  if (log.status === "FINALIZADO" && log.endAt) {
    drawSectionTitle("3. ENTRADA / RETORNO DEL VEHÍCULO");
    const retornoRows: [string, string][] = [
      ["Fecha de retorno", new Date(log.endAt).toLocaleString("es-GT")],
      ["Kilometraje final", `${log.endKm} km`],
      ["Recorrido total", `${(log.endKm || 0) - log.startKm} km`],
      ["Nivel de agua", log.endWater || "—"],
      ["Nivel de aceite", log.endOil || "—"],
    ];
    if (log.endComment) retornoRows.push(["Comentario", log.endComment]);
    drawInfoTable(retornoRows);
    doc.moveDown(0.4);
    drawPhotoGrid(safeArray(log.endPhotos), ["Frontal", "Trasera", "Lateral Izq", "Lateral Der"], 100);
  }

  // Firmas
  doc.moveDown(1);
  if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
  const sigY = doc.y;
  doc.fontSize(9).fillColor("#333333");
  doc.text("____________________________________", doc.page.margins.left, sigY);
  doc.text("Firma del Conductor", doc.page.margins.left, sigY + 14);
  doc.text("____________________________________", doc.page.margins.left + 240, sigY);
  doc.text("Firma Encargado de Bodega", doc.page.margins.left + 240, sigY + 14);

  doc.moveDown(2);
  doc.fontSize(7).fillColor("#999999").text("Documento generado automáticamente por el sistema · Live Productions GT", { align: "center" });

  doc.end();
  return done;
}
