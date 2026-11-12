import PDFDocument from "pdfkit";
import type { CompareResult } from "@/lib/order-compare";
import { buildCompactTarget } from "@/lib/compare-report";
import { drawTable, stampFooters, type Cell, type Col } from "@/lib/pdf-utils";

export async function buildCompactPdf(data: CompareResult): Promise<{ buffer: Buffer; title: string }> {
  const compact = buildCompactTarget(data);
  const doc = new PDFDocument({ size: "LETTER", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111111").text(compact.title);
  doc.moveDown(0.5);
  const cols: Col[] = [
    { w: 445, t: "Equipo" },
    { w: 82, t: "Cantidad", align: "right" },
  ];
  const sectionSet = new Set(compact.sections);
  const rows: Cell[][] = compact.rows.slice(1).map((row, idx) => {
    const isSection = sectionSet.has(idx + 1);
    return [
      { v: String(row[0] ?? ""), bold: isSection, bg: isSection ? "#000000" : undefined, color: isSection ? "#ffffff" : undefined },
      { v: row[1] === undefined ? "" : String(row[1]), bg: isSection ? "#000000" : undefined, color: isSection ? "#ffffff" : undefined },
    ];
  });
  drawTable(doc, cols, rows);
  stampFooters(doc, "Live Productions GT · Trasiego");
  doc.end();
  const buffer = await done;
  return { buffer, title: compact.title };
}
