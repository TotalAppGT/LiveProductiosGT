import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import ExcelJS from "exceljs";
import { createPdf, drawTable, pdfHeader, stampFooters, blockTitle, type Col } from "@/lib/pdf-utils";
import { computeNeedsByWeek, type NeedWeek } from "@/lib/needs";

const ACTIONS = [
  { key: "COMPRAR", label: "COMPRAR", color: "#b91c1c" },
  { key: "RENTAR", label: "RENTAR", color: "#b45309" },
  { key: "CONSULTAR", label: "CONSULTAR", color: "#1e40af" },
];

const fmt = (d: Date) => d.toLocaleDateString("es-GT", { day: "2-digit", month: "short" });
const weekTitle = (w: NeedWeek) => `Semana ${fmt(w.start)} al ${fmt(w.end)}`;
const safeSheet = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const raw = (searchParams.get("days") || "30").toLowerCase();
    const days = raw === "all" ? "all" : Math.max(1, Math.min(365, parseInt(raw) || 30));
    const { weeks } = await computeNeedsByWeek(days);
    const rango = days === "all" ? "Todo el futuro" : `Próximos ${days} días`;
    const totalItems = weeks.reduce((s, w) => s + w.items.length, 0);
    const totalUnits = weeks.reduce((s, w) => s + w.items.reduce((a, i) => a + i.shortfall, 0), 0);

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Faltantes por semana (comprar / rentar / consultar)", `${rango} · ${weeks.length} semana(s) · ${totalItems} ítem(s) · ${totalUnits} unidad(es)`);
      if (weeks.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor("#15803d").text("✅ No hay faltantes en el periodo.");
      }
      const cols: Col[] = [
        { w: 200, t: "Descripción" },
        { w: 50, t: "Cant.", align: "right" },
        { w: 70, t: "Disponible", align: "right" },
        { w: 65, t: "Faltan", align: "right" },
        { w: 120, t: "Comentario" },
      ];
      for (const w of weeks) {
        doc.moveDown(0.4);
        blockTitle(doc, `${weekTitle(w).toUpperCase()} — ${w.items.length} ítem(s)`, "#1e40af");
        for (const a of ACTIONS) {
          const arr = w.items.filter((i) => i.action === a.key);
          if (arr.length === 0) continue;
          doc.font("Helvetica-Bold").fontSize(9).fillColor(a.color).text(`${a.label} (${arr.length})`);
          drawTable(doc, cols, arr.map((i) => [
            { v: i.name }, { v: String(i.peak) }, { v: String(i.supply) }, { v: String(i.shortfall) }, { v: i.comment || "—" },
          ]), { headColor: a.color });
        }
      }
      stampFooters(doc, "Faltantes por semana — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="faltantes-semanas-${days}.pdf"` } });
    }

    // Excel: hoja Resumen + una hoja por semana.
    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const BRAND = "1E40AF";
    const headFill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + hex } });
    const border = { top: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, left: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, right: { style: "thin" as const, color: { argb: "FFD1D5DB" } } };

    // Resumen
    const rs = wb.addWorksheet("Resumen");
    rs.columns = [{ width: 34 }, { width: 13 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }];
    rs.mergeCells("A1:G1");
    rs.getCell("A1").value = `FALTANTES POR SEMANA — ${rango}`;
    rs.getCell("A1").font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    rs.getCell("A1").fill = headFill(BRAND);
    rs.getRow(1).height = 24;
    ["Semana", "Rango", "Ítems", "Comprar", "Rentar", "Consultar", "Unidades"].forEach((h, i) => {
      const c = rs.getCell(3, i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill("334155"); c.border = border;
    });
    let rr = 4;
    for (const w of weeks) {
      const vals: any[] = [weekTitle(w), `${fmt(w.start)} - ${fmt(w.end)}`, w.items.length,
        w.items.filter((i) => i.action === "COMPRAR").length,
        w.items.filter((i) => i.action === "RENTAR").length,
        w.items.filter((i) => i.action === "CONSULTAR").length,
        w.items.reduce((a, i) => a + i.shortfall, 0)];
      vals.forEach((v, i) => { const c = rs.getCell(rr, i + 1); c.value = v; c.border = border; if (i >= 2) c.numFmt = "#,##0"; });
      rr++;
    }
    if (weeks.length === 0) { rs.getCell(rr, 1).value = "✅ No hay faltantes en el periodo."; }

    // Una hoja por semana
    for (const w of weeks) {
      const ws = wb.addWorksheet(safeSheet(`Sem ${fmt(w.start)}-${fmt(w.end)}`));
      ws.columns = [{ width: 44 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 40 }, { width: 40 }];
      let r = 1;
      const title = ws.getCell(r, 1);
      title.value = `${weekTitle(w).toUpperCase()} — ${w.items.length} ítem(s)`;
      ws.mergeCells(r, 1, r, 6);
      title.font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } }; title.fill = headFill(BRAND); ws.getRow(r).height = 22;
      r += 2;
      for (const a of ACTIONS) {
        const arr = w.items.filter((i) => i.action === a.key);
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
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, r - 1), column: 6 } };
    }

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="faltantes-semanas-${days}.xlsx"` } });
  } catch (error) {
    console.error("Error needs report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
