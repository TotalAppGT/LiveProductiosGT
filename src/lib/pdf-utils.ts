import PDFDocument from "pdfkit";

export function createPdf() {
  const doc = new PDFDocument({ size: "LETTER", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => {
    doc.on("end", () => res(Buffer.concat(chunks)));
    doc.on("error", rej);
  });
  return { doc, done };
}

// Recorta el texto al ancho disponible (evita que se encime con otra columna).
export function fitText(doc: any, text: unknown, maxW: number): string {
  const s = String(text ?? "");
  if (!s) return "";
  if (doc.widthOfString(s) <= maxW) return s;
  let t = s;
  while (t.length > 1 && doc.widthOfString(t + "…") > maxW) t = t.slice(0, -1);
  return t + "…";
}

export interface Cell { v: string; color?: string; bold?: boolean; }
export interface Col { w: number; t: string; align?: "left" | "right" | "center"; }

// Tabla con encabezado azul, filas de alto dinámico (muestra todo el texto) y líneas de guía.
export function drawTable(doc: any, cols: Col[], rows: Cell[][]) {
  const x0 = doc.page.margins.left;
  const pad = 7;
  const minRowH = 14;
  const totalW = cols.reduce((s, c) => s + c.w, 0);

  const headLine = () => doc.moveTo(x0, doc.y).lineTo(x0 + totalW, doc.y).lineWidth(0.8).strokeColor("#1e40af").stroke();
  const drawHead = () => {
    const y = doc.y;
    doc.rect(x0, y, totalW, 16).fill("#1e40af");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff");
    let x = x0;
    for (const c of cols) {
      doc.text(fitText(doc, c.t, c.w - pad * 2), x + pad, y + 4, { width: c.w - pad * 2, align: c.align || "left", lineBreak: false });
      x += c.w;
    }
    doc.y = y + 16;
    headLine();
  };
  drawHead();

  let alt = false;
  for (const row of rows) {
    doc.font("Helvetica").fontSize(8.5);
    const lh = doc.currentLineHeight();
    let lines = 1;
    for (let i = 0; i < row.length; i++) {
      const h = doc.heightOfString(String(row[i]?.v ?? ""), { width: cols[i].w - pad * 2 });
      lines = Math.max(lines, Math.max(1, Math.round(h / lh)));
    }
    const rowH = Math.max(minRowH, lines * lh + 5);

    if (doc.y > doc.page.height - doc.page.margins.bottom - rowH - 4) {
      doc.addPage();
      drawHead();
      alt = false;
    }
    const y = doc.y;
    if (alt) doc.rect(x0, y + 0.6, totalW, rowH - 1.2).fill("#f3f4f6");
    alt = !alt;
    let x = x0;
    row.forEach((cell, i) => {
      const c = cols[i];
      doc.fillColor(cell.color || "#222").font(cell.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      doc.text(String(cell.v ?? ""), x + pad, y + 3, { width: c.w - pad * 2, align: c.align || "left" });
      x += c.w;
    });
    doc.moveTo(x0, y + rowH).lineTo(x0 + totalW, y + rowH).lineWidth(0.6).strokeColor("#9ca3af").stroke();
    doc.y = y + rowH;
  }
  doc.y += 6;
}

export function pdfHeader(doc: any, title: string, subtitle?: string) {
  doc.font("Helvetica-Bold").fontSize(16).fillColor("#1e40af").text("Live Productions GT");
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111").text(title);
  if (subtitle) doc.font("Helvetica").fontSize(8).fillColor("#666").text(subtitle);
  doc.font("Helvetica").fontSize(7.5).fillColor("#999").text(`Generado ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`);
  doc.moveDown(0.5);
}
