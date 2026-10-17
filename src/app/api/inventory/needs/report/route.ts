import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import ExcelJS from "exceljs";
import { createPdf, drawTable, pdfHeader, stampFooters, kpiRow, blockTitle, type Col } from "@/lib/pdf-utils";
import { computeNeeds } from "@/lib/needs";

const ACTIONS = [
  { key: "COMPRAR", label: "COMPRAR", color: "#b91c1c" },
  { key: "RENTAR", label: "RENTAR", color: "#b45309" },
  { key: "CONSULTAR", label: "CONSULTAR", color: "#1e40af" },
];

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const raw = (searchParams.get("days") || "30").toLowerCase();
    const days = raw === "all" ? "all" : Math.max(1, Math.min(365, parseInt(raw) || 30));
    const { items } = await computeNeeds(days);
    const rango = days === "all" ? "Todo el futuro" : `Próximos ${days} días`;
    const totalUnits = items.reduce((s, i) => s + i.shortfall, 0);

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Listado de faltantes (comprar / rentar / consultar)", `${rango} · ${items.length} ítem(s) · ${totalUnits} unidad(es)`);
      kpiRow(doc, [
        { label: "Comprar", value: String(items.filter((i) => i.action === "COMPRAR").length), color: "#b91c1c" },
        { label: "Rentar", value: String(items.filter((i) => i.action === "RENTAR").length), color: "#b45309" },
        { label: "Consultar", value: String(items.filter((i) => i.action === "CONSULTAR").length), color: "#1e40af" },
        { label: "Unidades", value: String(totalUnits) },
      ]);
      const cols: Col[] = [
        { w: 210, t: "Descripción" },
        { w: 55, t: "Cant.", align: "right" },
        { w: 80, t: "Disponible", align: "right" },
        { w: 75, t: "Faltan", align: "right" },
        { w: 120, t: "Comentario" },
      ];
      for (const a of ACTIONS) {
        const arr = items.filter((i) => i.action === a.key);
        if (arr.length === 0) continue;
        blockTitle(doc, `${a.label} (${arr.length})`, a.color);
        drawTable(doc, cols, arr.map((i) => [
          { v: i.name },
          { v: String(i.peak) },
          { v: String(i.supply) },
          { v: String(i.shortfall) },
          { v: i.comment || "—" },
        ]), { headColor: a.color });
      }
      if (items.length === 0) doc.font("Helvetica").fontSize(10).fillColor("#15803d").text("✅ No hay faltantes en el periodo.");
      stampFooters(doc, "Faltantes — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="faltantes-${days}.pdf"` } });
    }

    // Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const BRAND = "1E40AF";
    const headFill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + hex } });
    const border = { top: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, left: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, right: { style: "thin" as const, color: { argb: "FFD1D5DB" } } };
    const ws = wb.addWorksheet("Faltantes");
    ws.columns = [{ width: 46 }, { width: 11 }, { width: 12 }, { width: 12 }, { width: 46 }, { width: 40 }];
    let r = 1;
    const title = ws.getCell(r, 1);
    title.value = `LISTADO DE FALTANTES — ${rango}`;
    ws.mergeCells(r, 1, r, 6);
    title.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } }; title.fill = headFill(BRAND); ws.getRow(r).height = 24;
    r += 2;
    for (const a of ACTIONS) {
      const arr = items.filter((i) => i.action === a.key);
      if (arr.length === 0) continue;
      const h = ws.getCell(r, 1);
      h.value = `${a.label} (${arr.length})`;
      ws.mergeCells(r, 1, r, 6);
      h.font = { bold: true, color: { argb: "FFFFFFFF" } }; h.fill = headFill(a.color.replace("#", ""));
      h.alignment = { indent: 1, vertical: "middle" }; ws.getRow(r).height = 20;
      r++;
      ["Descripción", "Cantidad", "Disponible", "Faltan", "Comentario", "Cuadros"].forEach((t, i) => {
        const c = ws.getCell(r, i + 1); c.value = t; c.font = { bold: true }; c.fill = headFill("F3F4F6"); c.border = border;
      });
      r++;
      for (const i of arr) {
        const ev = i.events.map((e) => `#${e.orderNumber} ${e.eventName}`).join(", ");
        [i.name, i.peak, i.supply, i.shortfall, i.comment || "", ev].forEach((v, ci) => {
          const c = ws.getCell(r, ci + 1); c.value = v as any; c.border = border;
          if (ci >= 1 && ci <= 3) c.numFmt = "#,##0";
        });
        r++;
      }
      r++;
    }
    if (items.length === 0) { ws.getCell(r, 1).value = "✅ No hay faltantes en el periodo."; r++; }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, r - 1), column: 6 } };

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="faltantes-${days}.xlsx"` } });
  } catch (error) {
    console.error("Error needs report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
