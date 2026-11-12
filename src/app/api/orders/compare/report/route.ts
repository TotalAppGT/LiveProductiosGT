import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { compareOrders } from "@/lib/order-compare";
import { buildReportTabs } from "@/lib/compare-report";
import ExcelJS from "exceljs";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length < 2) return NextResponse.json({ success: false, error: "Seleccioná al menos 2 cuadros" }, { status: 400 });

    const options = {
      sourceId: body?.sourceId ? String(body.sourceId) : undefined,
      targetId: body?.targetId ? String(body.targetId) : undefined,
      targetMode: body?.targetMode === "largest" ? ("largest" as const) : undefined,
    };
    const data = await compareOrders(ids, options);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    for (const tab of buildReportTabs(data)) {
      const ws = wb.addWorksheet(tab.name, { properties: { defaultRowHeight: 17 } });
      ws.columns = tab.widths.map((width) => ({ width }));
      tab.rows.forEach((row) => ws.addRow(row));
      const lastCol = Math.max(1, (tab.rows[0] || []).length);
      const headerRow = ws.getRow(1);
      headerRow.height = 20;
      for (let c = 1; c <= lastCol; c++) {
        const cell = headerRow.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      }
      for (const sectionRow of tab.sectionRows) {
        const rowNumber = sectionRow + 1;
        if (lastCol > 1) ws.mergeCells(rowNumber, 1, rowNumber, lastCol);
        const row = ws.getRow(rowNumber);
        row.height = 20;
        for (let c = 1; c <= lastCol; c++) {
          const cell = row.getCell(c);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
          cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
          cell.alignment = { vertical: "middle", horizontal: "left" };
        }
      }
    }
    const buf = Buffer.from(await wb.xlsx.writeBuffer());

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="comparativa-${data.source.orderNumber}-${data.target.orderNumber}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error generando comparativa:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
