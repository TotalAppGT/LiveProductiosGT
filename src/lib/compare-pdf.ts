import PDFDocument from "pdfkit";
import type { CompareResult } from "@/lib/order-compare";
import { buildReportTabs } from "@/lib/compare-report";
import { drawTable, pdfHeader, kpiRow, blockTitle, stampFooters, type Cell, type Col } from "@/lib/pdf-utils";

const shortName = (eventName: string) => {
  let t = String(eventName || "").trim();
  t = t.replace(/^cuadro\s+\d{1,2}\/\d{1,2}\/\d{4}\s*[—–-]\s*/i, "");
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length > 1) t = parts[parts.length - 1];
  return t.split(/\s+/)[0] || t || "Evento";
};

const ddmmyy = (iso: string | null) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const NUMERIC = /CANTIDAD|NECESITA|INVENTARIO|TRASIEGO|RENTA|REGENSA|FALTANTE|BODEGA|REPARACI|CUBRE|COBERTURA|UNIDADES|%/i;

export async function buildComparisonPdf(data: CompareResult): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", layout: "landscape", margin: 36, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const subtitle =
    data.mode === "pair"
      ? `#${data.source.orderNumber} ${shortName(data.source.eventName)} (${data.source.eventDate || ""}) → #${data.target.orderNumber} ${shortName(data.target.eventName)} (${data.target.eventDate || ""})`
      : `${data.events.length} cuadros · ${ddmmyy(data.events[0]?.eventDate || null)} → ${ddmmyy(data.events[data.events.length - 1]?.eventDate || null)} · ${data.events
          .map((e) => `#${e.orderNumber} ${shortName(e.eventName)}`)
          .join(" · ")}`;
  pdfHeader(doc, "Comparativa / Trasiego entre cuadros", subtitle);

  if (data.mode === "pair") {
    const t = data.totals;
    kpiRow(doc, [
      { label: "Origen", value: `${t.source}` },
      { label: "Destino", value: `${t.target}` },
      { label: "Trasiego", value: `${t.transfer}` },
      { label: "Bodega destino", value: `${t.targetFromStock}` },
      { label: "Faltante destino", value: `${t.targetShort}` },
      { label: "Regresa origen", value: `${t.returnQty}` },
    ]);
  } else {
    const t = data.totals;
    kpiRow(doc, [
      { label: "Cuadros", value: `${data.events.length}` },
      { label: "Necesita", value: `${t.need}` },
      { label: "Inventario", value: `${t.fromStock} (${t.pctFromStock}%)` },
      { label: "Trasiego", value: `${t.reuse} (${t.pctReuse}%)` },
      { label: "Renta / compra", value: `${t.short} (${t.pctShort}%)` },
      { label: "Cobertura", value: `${t.coverage}%` },
    ]);
  }

  const tabs = buildReportTabs(data).filter((t) => t.key !== "detalle" && t.key !== "multi-detalle");
  for (const tab of tabs) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 80) doc.addPage();
    blockTitle(doc, tab.name);
    if (tab.rows.length <= 1) {
      doc.font("Helvetica").fontSize(8.5).fillColor("#666").text("Sin registros.");
      doc.moveDown(0.8);
      continue;
    }
    const header = (tab.rows[0] || []).map((c) => String(c ?? ""));
    const body = tab.rows.slice(1);
    const totalChars = tab.widths.reduce((s, w) => s + w, 0) || 1;
    const avail = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const widths = tab.widths.map((w) => Math.max(26, (w / totalChars) * avail));
    const cols: Col[] = header.map((title, i) => ({
      w: widths[i],
      t: title,
      align: i > 0 && NUMERIC.test(title) ? "right" : "left",
    }));
    const sectionSet = new Set(tab.sectionRows);
    const rows: Cell[][] = body.map((row, idx) => {
      const isSection = sectionSet.has(idx + 1);
      return row.map((v) => ({
        v: String(v ?? ""),
        bold: isSection,
        bg: isSection ? "#e5e7eb" : undefined,
      }));
    });
    drawTable(doc, cols, rows);
    doc.moveDown(0.4);
  }

  doc.font("Helvetica").fontSize(7.5).fillColor("#6b7280").text("El detalle completo por ítem/evento está en la hoja de Google y en el Excel.", { lineBreak: false });
  stampFooters(doc, "Live Productions GT · Trasiego / Comparativa");
  doc.end();
  return done;
}
