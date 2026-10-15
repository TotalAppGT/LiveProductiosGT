import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import * as XLSX from "xlsx";
import { createPdf, drawTable, pdfHeader, type Col } from "@/lib/pdf-utils";

const GROUPS: Record<string, { label: string; statuses: string[] }> = {
  DISPONIBLE: { label: "Disponible", statuses: ["DISPONIBLE"] },
  ASIGNADO: { label: "Asignado", statuses: ["ASIGNADO"] },
  REPARACION: { label: "En reparación", statuses: ["EN_REPARACION"] },
  DANADO: { label: "Dañado / Perdido", statuses: ["DANADO", "PERDIDO"] },
};

const mapItem = (i: any) => ({
  "Ítem": i.name,
  "Sección": i.section || "",
  "Categoría": i.category,
  "Cantidad": i.quantity,
  "Bodega": i.warehouse || i.location || "",
  "Estado": i.status,
  "Serie": i.serialNumber || "",
});

// Excel no permite ciertos caracteres en el nombre de hoja ( \ / ? * [ ] : ). Los reemplaza.
const safeSheet = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const statusParam = (searchParams.get("status") || "ALL").toUpperCase();

    const all = await prisma.inventoryItem.findMany({ orderBy: [{ section: "asc" }, { name: "asc" }] });

    const groups = statusParam !== "ALL" && GROUPS[statusParam] ? { [statusParam]: GROUPS[statusParam] } : GROUPS;

    const sumUnits = (arr: any[]) => arr.reduce((s, i) => s + i.quantity, 0);
    const byStatus = new Map<string, { items: number; units: number }>();
    const byBodega = new Map<string, { items: number; units: number }>();
    for (const i of all) {
      const s = byStatus.get(i.status) || { items: 0, units: 0 };
      s.items++; s.units += i.quantity; byStatus.set(i.status, s);
      const b = i.warehouse || i.location || "Sin bodega";
      const bv = byBodega.get(b) || { items: 0, units: 0 };
      bv.items++; bv.units += i.quantity; byBodega.set(b, bv);
    }

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Reporte de Inventario", `Total: ${all.length} ítems · ${sumUnits(all)} unidades`);

      doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e40af").text("RESUMEN POR ESTADO");
      const sumCols: Col[] = [{ w: 160, t: "Estado" }, { w: 90, t: "Ítems", align: "right" }, { w: 90, t: "Unidades", align: "right" }];
      drawTable(doc, sumCols, Array.from(byStatus.entries()).map(([k, v]) => [{ v: k }, { v: String(v.items) }, { v: String(v.units) }]));

      doc.moveDown(0.4);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e40af").text("RESUMEN POR BODEGA");
      drawTable(doc, sumCols, Array.from(byBodega.entries()).map(([k, v]) => [{ v: k }, { v: String(v.items) }, { v: String(v.units) }]));

      const cols: Col[] = [{ w: 200, t: "Ítem" }, { w: 95, t: "Sección" }, { w: 70, t: "Categoría" }, { w: 45, t: "Cant.", align: "right" }, { w: 90, t: "Bodega" }];
      for (const [key, g] of Object.entries(groups)) {
        const arr = all.filter((i) => g.statuses.includes(i.status));
        doc.moveDown(0.6);
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c").text(`${g.label.toUpperCase()} (${arr.length} ítems · ${sumUnits(arr)} u)`);
        if (arr.length === 0) {
          doc.font("Helvetica").fontSize(9).fillColor("#666").text("Sin ítems.");
          continue;
        }
        drawTable(doc, cols, arr.map((i) => [
          { v: i.name }, { v: i.section || "" }, { v: i.category }, { v: String(i.quantity) }, { v: i.warehouse || i.location || "" },
        ]));
      }
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="inventario-${statusParam.toLowerCase()}.pdf"` },
      });
    }

    // Excel
    const wb = XLSX.utils.book_new();
    const resumen: any[][] = [
      ["REPORTE DE INVENTARIO — Live Productions GT"],
      [`Generado: ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`],
      [],
      ["RESUMEN POR ESTADO"],
      ["Estado", "Ítems", "Unidades"],
      ...Array.from(byStatus.entries()).map(([k, v]) => [k, v.items, v.units]),
      [],
      ["RESUMEN POR BODEGA"],
      ["Bodega", "Ítems", "Unidades"],
      ...Array.from(byBodega.entries()).map(([k, v]) => [k, v.items, v.units]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

    for (const [, g] of Object.entries(groups)) {
      const arr = all.filter((i) => g.statuses.includes(i.status));
      const sheet = XLSX.utils.json_to_sheet(arr.length ? arr.map(mapItem) : [{ "Ítem": "— sin ítems —" }]);
      // nombre de hoja válido (sin caracteres prohibidos, máx 31)
      XLSX.utils.book_append_sheet(wb, sheet, safeSheet(g.label));
    }
    if (statusParam === "ALL") XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(all.map(mapItem)), "Todo");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="inventario-${statusParam.toLowerCase()}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error inventory report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
