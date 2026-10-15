import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import ExcelJS from "exceljs";
import { createPdf, drawTable, pdfHeader, stampFooters, kpiRow, blockTitle, type Col } from "@/lib/pdf-utils";

// Agrupaciones de estado usadas por los filtros de la UI.
const GROUPS: Record<string, { label: string; statuses: string[]; color: string }> = {
  DISPONIBLE: { label: "Disponible", statuses: ["DISPONIBLE"], color: "#15803d" },
  ASIGNADO: { label: "Asignado", statuses: ["ASIGNADO"], color: "#b45309" },
  REPARACION: { label: "En reparación", statuses: ["EN_REPARACION"], color: "#c2410c" },
  DANADO: { label: "Dañado / Perdido", statuses: ["DANADO", "PERDIDO"], color: "#b91c1c" },
};

const STATUS_LABEL: Record<string, string> = {
  DISPONIBLE: "Disponible",
  ASIGNADO: "Asignado",
  EN_REPARACION: "En reparación",
  DANADO: "Dañado",
  PERDIDO: "Perdido",
  MANTENIMIENTO: "Mantenimiento",
};

const nf = (n: number) => n.toLocaleString("es-GT");
const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "2-digit", year: "numeric" }) : "";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    const statusParam = (searchParams.get("status") || "ALL").toUpperCase();
    const warehouseParam = searchParams.get("warehouse") || "";
    const sectionParam = searchParams.get("section") || "";

    const where: any = {};
    if (statusParam !== "ALL" && GROUPS[statusParam]) where.status = { in: GROUPS[statusParam].statuses };
    if (warehouseParam) where.warehouse = warehouseParam;
    if (sectionParam) where.section = sectionParam;

    const all = await prisma.inventoryItem.findMany({ where, orderBy: [{ section: "asc" }, { name: "asc" }] });

    // ---- Agregaciones ----
    const sumUnits = (arr: any[]) => arr.reduce((s, i) => s + i.quantity, 0);
    const totalUnits = sumUnits(all);

    const tally = (arr: any[], keyFn: (i: any) => string) => {
      const m = new Map<string, { items: number; units: number }>();
      for (const i of arr) {
        const k = keyFn(i) || "—";
        const v = m.get(k) || { items: 0, units: 0 };
        v.items++; v.units += i.quantity; m.set(k, v);
      }
      return m;
    };
    const whOf = (i: any) => i.warehouse || i.location || "Sin bodega";
    const byStatus = tally(all, (i) => STATUS_LABEL[i.status] || i.status);
    const byWarehouse = tally(all, whOf);
    const bySection = tally(all, (i) => i.section || "Sin sección");

    const groups = statusParam !== "ALL" && GROUPS[statusParam] ? { [statusParam]: GROUPS[statusParam] } : GROUPS;
    const groupArr = (g: { statuses: string[] }) => all.filter((i) => g.statuses.includes(i.status));
    const filtroTxt = [warehouseParam && `Bodega: ${warehouseParam}`, sectionParam && `Sección: ${sectionParam}`].filter(Boolean).join("  ·  ");

    // ================= PDF =================
    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Reporte de Inventario", `Total: ${nf(all.length)} ítems · ${nf(totalUnits)} unidades${filtroTxt ? "  ·  " + filtroTxt : ""}`);

      // KPI ejecutivo
      kpiRow(doc, [
        { label: "Ítems", value: nf(all.length) },
        { label: "Unidades", value: nf(totalUnits) },
        { label: "Disponible", value: nf(groupArr(GROUPS.DISPONIBLE).reduce((s, i) => s + i.quantity, 0)), color: "#15803d" },
        { label: "En reparación", value: nf(groupArr(GROUPS.REPARACION).reduce((s, i) => s + i.quantity, 0)), color: "#c2410c" },
        { label: "Dañado / Perdido", value: nf(groupArr(GROUPS.DANADO).reduce((s, i) => s + i.quantity, 0)), color: "#b91c1c" },
      ]);

      // Resúmenes
      const sumCols: Col[] = [
        { w: 220, t: "" },
        { w: 80, t: "Ítems", align: "right" },
        { w: 90, t: "Unidades", align: "right" },
        { w: 70, t: "% unid.", align: "right" },
      ];
      const sumRows = (m: Map<string, { items: number; units: number }>) =>
        Array.from(m.entries())
          .sort((a, b) => b[1].units - a[1].units)
          .map(([k, v]) => [
            { v: k },
            { v: nf(v.items) },
            { v: nf(v.units) },
            { v: totalUnits ? ((v.units / totalUnits) * 100).toFixed(1) + "%" : "0%" },
          ]);

      blockTitle(doc, "RESUMEN POR ESTADO");
      drawTable(doc, [{ w: 220, t: "Estado" }, ...sumCols.slice(1)], sumRows(byStatus));
      blockTitle(doc, "RESUMEN POR BODEGA");
      drawTable(doc, [{ w: 220, t: "Bodega" }, ...sumCols.slice(1)], sumRows(byWarehouse));
      blockTitle(doc, "RESUMEN POR SECCIÓN");
      drawTable(doc, [{ w: 220, t: "Sección" }, ...sumCols.slice(1)], sumRows(bySection));

      // Detalle segmentado por estado → sección
      const cols: Col[] = [
        { w: 78, t: "Sección" },
        { w: 195, t: "Ítem" },
        { w: 66, t: "Categoría" },
        { w: 44, t: "Cant.", align: "right" },
        { w: 92, t: "Bodega" },
      ];
      for (const [, g] of Object.entries(groups)) {
        const arr = groupArr(g);
        doc.moveDown(0.5);
        blockTitle(doc, `${g.label.toUpperCase()} · ${nf(arr.length)} ítems · ${nf(sumUnits(arr))} u`, g.color);
        if (arr.length === 0) {
          doc.font("Helvetica").fontSize(9).fillColor("#666").text("Sin ítems.");
          continue;
        }
        const bySec = new Map<string, any[]>();
        for (const i of arr) {
          const k = i.section || "Sin sección";
          if (!bySec.has(k)) bySec.set(k, []);
          bySec.get(k)!.push(i);
        }
        const rows: any[][] = [];
        for (const [sec, items] of Array.from(bySec.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          for (const i of items) {
            rows.push([
              { v: sec },
              { v: i.name },
              { v: i.category },
              { v: nf(i.quantity) },
              { v: whOf(i) },
            ]);
          }
          rows.push([
            { v: `Subtotal ${sec}`, bold: true, bg: "#eef2ff" },
            { v: "", bg: "#eef2ff" },
            { v: "", bg: "#eef2ff" },
            { v: nf(sumUnits(items)), bold: true, bg: "#eef2ff" },
            { v: "", bg: "#eef2ff" },
          ]);
        }
        rows.push([
          { v: `TOTAL ${g.label}`, bold: true, bg: "#dbeafe", color: g.color },
          { v: "", bg: "#dbeafe" },
          { v: `${nf(arr.length)} ítems`, bg: "#dbeafe", bold: true },
          { v: nf(sumUnits(arr)), bold: true, bg: "#dbeafe", color: g.color },
          { v: "", bg: "#dbeafe" },
        ]);
        drawTable(doc, cols, rows, { headColor: g.color });
      }

      stampFooters(doc, `Inventario · ${statusParam === "ALL" ? "General" : GROUPS[statusParam]?.label || statusParam}`);
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="inventario-${statusParam.toLowerCase()}.pdf"` },
      });
    }

    // ================= Excel (exceljs, con estilos) =================
    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    wb.created = new Date();

    const BRAND = "1E40AF";
    const headFill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + hex } });
    const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    // ---- Hoja Resumen ----
    const rs = wb.addWorksheet("Resumen", { properties: { defaultRowHeight: 18 } });
    rs.columns = [{ width: 34 }, { width: 14 }, { width: 14 }, { width: 14 }];
    rs.mergeCells("A1:D1");
    rs.getCell("A1").value = "REPORTE DE INVENTARIO — Live Productions GT";
    rs.getCell("A1").font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } };
    rs.getCell("A1").fill = headFill(BRAND);
    rs.getCell("A1").alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    rs.getRow(1).height = 30;
    rs.mergeCells("A2:D2");
    rs.getCell("A2").value = `Generado: ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}${filtroTxt ? "   ·   " + filtroTxt : ""}`;
    rs.getCell("A2").font = { size: 10, italic: true, color: { argb: "FF6B7280" } };

    let rr = 4;
    const kpiRowExcel = (title: string, value: string, col: number) => {
      const c1 = rs.getCell(rr, col);
      c1.value = title; c1.font = { size: 9, color: { argb: "FF6B7280" } }; c1.fill = headFill("F3F4F6"); c1.border = border; c1.alignment = { horizontal: "center" };
      const c2 = rs.getCell(rr + 1, col);
      c2.value = value; c2.font = { size: 14, bold: true }; c2.fill = headFill("F3F4F6"); c2.border = border; c2.alignment = { horizontal: "center" };
      rs.getRow(rr).height = 18; rs.getRow(rr + 1).height = 22;
    };
    kpiRowExcel("ÍTEMS", nf(all.length), 1);
    kpiRowExcel("UNIDADES", nf(totalUnits), 2);
    kpiRowExcel("DISPONIBLE", nf(groupArr(GROUPS.DISPONIBLE).reduce((s, i) => s + i.quantity, 0)), 3);
    kpiRowExcel("REPARACIÓN", nf(groupArr(GROUPS.REPARACION).reduce((s, i) => s + i.quantity, 0)), 4);
    rr += 3;

    const tableBlock = (title: string, m: Map<string, { items: number; units: number }>, firstColLabel: string) => {
      rs.mergeCells(`A${rr}:D${rr}`);
      rs.getCell(`A${rr}`).value = title;
      rs.getCell(`A${rr}`).font = { bold: true, size: 11, color: { argb: "FF" + BRAND } };
      rs.getRow(rr).height = 20;
      rr++;
      const hdr = [firstColLabel, "Ítems", "Unidades", "% unid."];
      hdr.forEach((h, i) => {
        const c = rs.getCell(rr, i + 1);
        c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill(BRAND); c.border = border;
        c.alignment = { horizontal: i === 0 ? "left" : "right", indent: i === 0 ? 1 : 0 };
      });
      rr++;
      Array.from(m.entries()).sort((a, b) => b[1].units - a[1].units).forEach(([k, v]) => {
        const vals = [k, v.items, v.units, totalUnits ? Math.round((v.units / totalUnits) * 1000) / 10 : 0];
        vals.forEach((val, i) => {
          const c = rs.getCell(rr, i + 1);
          c.value = val as any; c.border = border;
          if (i === 3) c.numFmt = '0.0"%"'; else if (i > 0) c.numFmt = "#,##0";
          c.alignment = { horizontal: i === 0 ? "left" : "right", indent: i === 0 ? 1 : 0 };
        });
        rr++;
      });
      rr++;
    };
    tableBlock("RESUMEN POR ESTADO", byStatus, "Estado");
    tableBlock("RESUMEN POR BODEGA", byWarehouse, "Bodega");
    tableBlock("RESUMEN POR SECCIÓN", bySection, "Sección");

    // ---- Hoja de detalle por estado ----
    const addDetailSheet = (name: string, arr: any[], color: string) => {
      const ws = wb.addWorksheet(safeSheet(name), { views: [{ state: "frozen", ySplit: 3 }], properties: { defaultRowHeight: 16 } });
      ws.columns = [
        { width: 30 }, // Sección
        { width: 42 }, // Ítem
        { width: 16 }, // Categoría
        { width: 10 }, // Cantidad
        { width: 18 }, // Bodega
        { width: 16 }, // Serie
        { width: 24 }, // Notas
        { width: 13 }, // Últ. revisión
      ];
      const lastCol = ws.columns.length;
      ws.mergeCells(1, 1, 1, lastCol);
      ws.getCell(1, 1).value = `INVENTARIO — ${name}`;
      ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
      ws.getCell(1, 1).fill = headFill(color.replace("#", ""));
      ws.getCell(1, 1).alignment = { vertical: "middle", indent: 1 };
      ws.getRow(1).height = 26;
      ws.mergeCells(2, 1, 2, lastCol);
      ws.getCell(2, 1).value = `${nf(arr.length)} ítems · ${nf(sumUnits(arr))} unidades`;
      ws.getCell(2, 1).font = { size: 10, italic: true, color: { argb: "FF6B7280" } };
      ws.getCell(2, 1).alignment = { indent: 1 };

      const headers = ["Sección", "Ítem", "Categoría", "Cantidad", "Bodega", "Serie", "Notas", "Últ. revisión"];
      headers.forEach((h, i) => {
        const c = ws.getCell(3, i + 1);
        c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill(color.replace("#", "")); c.border = border;
        c.alignment = { horizontal: i === 3 ? "right" : "left", indent: i === 3 ? 0 : 1, vertical: "middle" };
      });
      ws.getRow(3).height = 18;

      if (arr.length === 0) {
        ws.mergeCells(4, 1, 4, lastCol);
        ws.getCell(4, 1).value = "Sin ítems."; ws.getCell(4, 1).font = { italic: true, color: { argb: "FF6B7280" } };
        return;
      }

      const bySec = new Map<string, any[]>();
      for (const i of arr) { const k = i.section || "Sin sección"; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k)!.push(i); }
      let r = 4;
      for (const [sec, items] of Array.from(bySec.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
        // Encabezado de sección
        ws.mergeCells(r, 1, r, lastCol);
        const sc = ws.getCell(r, 1);
        sc.value = `${sec.toUpperCase()}  ·  ${items.length} ítems  ·  ${nf(sumUnits(items))} u`;
        sc.font = { bold: true, size: 10, color: { argb: "FF" + BRAND } };
        sc.fill = headFill("EEF2FF"); sc.border = border; sc.alignment = { indent: 1, vertical: "middle" };
        ws.getRow(r).height = 18;
        r++;
        for (const it of items) {
          const vals = [sec, it.name, it.category, it.quantity, whOf(it), it.serialNumber || "", it.notes || "", fmtDate(it.lastCheckedAt)];
          vals.forEach((val, i) => {
            const c = ws.getCell(r, i + 1);
            c.value = val as any; c.border = border;
            if (i === 3) { c.numFmt = "#,##0"; c.alignment = { horizontal: "right" }; }
          });
          r++;
        }
        const st = ws.getCell(r, 1);
        st.value = `Subtotal ${sec}`;
        ws.mergeCells(r, 1, r, 3);
        st.font = { bold: true }; st.fill = headFill("F3F4F6"); st.border = border; st.alignment = { indent: 1 };
        const stq = ws.getCell(r, 4);
        stq.value = sumUnits(items); stq.numFmt = "#,##0"; stq.font = { bold: true }; stq.fill = headFill("F3F4F6"); stq.border = border; stq.alignment = { horizontal: "right" };
        for (let i = 5; i <= lastCol; i++) { ws.getCell(r, i).fill = headFill("F3F4F6"); ws.getCell(r, i).border = border; }
        r++;
      }
      // Total
      const tc = ws.getCell(r, 1);
      tc.value = `TOTAL ${name}`; ws.mergeCells(r, 1, r, 3);
      tc.font = { bold: true, color: { argb: "FFFFFFFF" } }; tc.fill = headFill("1E40AF"); tc.border = border; tc.alignment = { indent: 1 };
      const tq = ws.getCell(r, 4);
      tq.value = sumUnits(arr); tq.numFmt = "#,##0"; tq.font = { bold: true, color: { argb: "FFFFFFFF" } }; tq.fill = headFill("1E40AF"); tq.border = border; tq.alignment = { horizontal: "right" };
      for (let i = 5; i <= lastCol; i++) { ws.getCell(r, i).fill = headFill("1E40AF"); ws.getCell(r, i).border = border; }
      ws.getRow(r).height = 18;

      if (arr.length > 0) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: r, column: lastCol } };
    };

    for (const [key, g] of Object.entries(groups)) {
      addDetailSheet(g.label, groupArr(g), g.color);
    }
    if (statusParam === "ALL") addDetailSheet("Todo el inventario", all, "#1e40af");

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
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

// Excel no permite ciertos caracteres en el nombre de hoja ( \ / ? * [ ] : ). Los reemplaza.
const safeSheet = (s: string) => s.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
