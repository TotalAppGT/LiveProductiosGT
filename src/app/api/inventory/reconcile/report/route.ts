import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import ExcelJS from "exceljs";
import { createPdf, drawTable, pdfHeader, stampFooters, blockTitle, type Col } from "@/lib/pdf-utils";
import { reconcileOrdersWithInventory } from "@/lib/reconcile";

const STATUS_LABEL: Record<string, string> = { missing: "No está en inventario", similar: "Parecido", different: "Descripción diferente" };

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const format = (new URL(request.url).searchParams.get("format") || "xlsx").toLowerCase();
    const { discrepancies, counts } = await reconcileOrdersWithInventory();

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Cotejo: Cuadros vs Inventario", `No existe: ${counts.missing} · Parecidos: ${counts.similar} · Descripción diferente: ${counts.different} · OK: ${counts.exact}`);
      blockTitle(doc, "DISCREPANCIAS");
      if (discrepancies.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor("#15803d").text("✅ Todo coincide.");
      } else {
        const cols: Col[] = [
          { w: 150, t: "Ítem en cuadro" },
          { w: 70, t: "Estado" },
          { w: 40, t: "Cant.", align: "right" },
          { w: 150, t: "Cuadros" },
          { w: 140, t: "Sugerencia (inventario)" },
        ];
        drawTable(doc, cols, discrepancies.map((d) => [
          { v: d.name },
          { v: STATUS_LABEL[d.status] || d.status, color: d.status === "missing" ? "#b91c1c" : "#b45309" },
          { v: String(d.quantity) },
          { v: d.orders.slice(0, 3).join(", ") + (d.orders.length > 3 ? ` +${d.orders.length - 3}` : "") },
          { v: d.suggestions.length ? d.suggestions.map((s) => `${s.name} (${Math.round(s.score * 100)}%)`).join(" / ") : "—" },
        ]));
      }
      stampFooters(doc, "Cotejo inventario — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="cotejo-inventario.pdf"` } });
    }

    // Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const BRAND = "1E40AF";
    const headFill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + hex } });
    const border = { top: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, left: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, right: { style: "thin" as const, color: { argb: "FFD1D5DB" } } };
    const ws = wb.addWorksheet("Discrepancias");
    ws.columns = [{ width: 42 }, { width: 22 }, { width: 10 }, { width: 42 }, { width: 46 }, { width: 12 }];
    ["Ítem en cuadro", "Estado", "Cantidad", "Categoría", "Cuadros", "Sugerencia (inventario)"].forEach((h, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill(BRAND); c.border = border;
    });
    let r = 2;
    for (const d of discrepancies) {
      const vals: any[] = [d.name, STATUS_LABEL[d.status] || d.status, d.quantity, d.category, d.orders.join(", "), d.suggestions.map((s) => `${s.name} (${Math.round(s.score * 100)}%)`).join(" / ") || ""];
      vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = border; if (d.status === "missing") c.font = { color: { argb: "FFB91C1C" } }; });
      r++;
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: r, column: 6 } };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="cotejo-inventario.xlsx"` },
    });
  } catch (error) {
    console.error("Error reconcile report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
