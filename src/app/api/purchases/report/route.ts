import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import ExcelJS from "exceljs";
import { createPdf, drawTable, pdfHeader, stampFooters, kpiRow, blockTitle, type Col } from "@/lib/pdf-utils";

const nf = (n: number) => n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const q = (n: number) => `Q${nf(n)}`;
const fmtDate = (d?: Date | string | null) => (d ? new Date(d).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "pdf").toLowerCase();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const statusParam = searchParams.get("status") || "ALL";

    const where: any = {};
    if (statusParam !== "ALL") where.status = statusParam;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59`);
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { select: { name: true } }, supplier: { select: { name: true } } },
    });

    const sum = (arr: any[]) => arr.reduce((s, p) => s + Number(p.amount || 0), 0);
    const total = sum(purchases);
    const byStatus = new Map<string, { n: number; total: number }>();
    const byCategory = new Map<string, { n: number; total: number }>();
    const bySupplier = new Map<string, { n: number; total: number }>();
    for (const p of purchases) {
      const s = byStatus.get(p.status) || { n: 0, total: 0 }; s.n++; s.total += Number(p.amount || 0); byStatus.set(p.status, s);
      const c = byCategory.get(p.category || "Sin categoría") || { n: 0, total: 0 }; c.n++; c.total += Number(p.amount || 0); byCategory.set(p.category || "Sin categoría", c);
      const sup = bySupplier.get(p.supplier?.name || p.provider || "Sin proveedor") || { n: 0, total: 0 }; sup.n++; sup.total += Number(p.amount || 0); bySupplier.set(p.supplier?.name || p.provider || "Sin proveedor", sup);
    }
    const rangeTxt = from || to ? `Periodo: ${from ? fmtDate(from) : "inicio"} — ${to ? fmtDate(to) : "hoy"}` : "Todo el historial";

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Reporte de Compras", `${rangeTxt} · ${purchases.length} compra(s)`);
      kpiRow(doc, [
        { label: "Total registrado", value: q(total) },
        { label: "Compras", value: nf(purchases.length) },
        { label: "Gastado (comprado)", value: q(sum(purchases.filter((p) => p.status === "COMPRADO"))) },
        { label: "Pendiente", value: q(sum(purchases.filter((p) => p.status === "PENDIENTE"))) },
      ]);
      const cols: Col[] = [{ w: 220, t: "" }, { w: 80, t: "Compras", align: "right" }, { w: 110, t: "Total", align: "right" }];
      const rows = (m: Map<string, { n: number; total: number }>) =>
        Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [{ v: k }, { v: nf(v.n) }, { v: q(v.total) }]);
      blockTitle(doc, "POR PROVEEDOR"); drawTable(doc, [{ w: 220, t: "Proveedor" }, ...cols.slice(1)], rows(bySupplier));
      blockTitle(doc, "POR CATEGORÍA"); drawTable(doc, [{ w: 220, t: "Categoría" }, ...cols.slice(1)], rows(byCategory));
      blockTitle(doc, "POR ESTADO"); drawTable(doc, [{ w: 220, t: "Estado" }, ...cols.slice(1)], rows(byStatus));
      blockTitle(doc, "DETALLE");
      const dcols: Col[] = [{ w: 80, t: "Fecha" }, { w: 170, t: "Título" }, { w: 110, t: "Proveedor" }, { w: 80, t: "Categoría" }, { w: 70, t: "Estado" }, { w: 80, t: "Monto", align: "right" }];
      drawTable(doc, dcols, purchases.map((p) => [
        { v: fmtDate(p.createdAt) }, { v: p.title }, { v: p.supplier?.name || p.provider || "—" }, { v: p.category || "—" }, { v: p.status }, { v: p.amount ? q(Number(p.amount)) : "—" },
      ]));
      stampFooters(doc, "Compras — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="compras.pdf"` } });
    }

    // Excel
    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const BRAND = "1E40AF";
    const headFill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + hex } });
    const border = { top: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, left: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, right: { style: "thin" as const, color: { argb: "FFD1D5DB" } } };

    const addGroupSheet = (name: string, m: Map<string, { n: number; total: number }>) => {
      const ws = wb.addWorksheet(name);
      ws.columns = [{ width: 34 }, { width: 12 }, { width: 16 }];
      [["Nombre", "Compras", "Total"]].forEach((h, ri) => h.forEach((v, i) => { const c = ws.getCell(ri + 1, i + 1); c.value = v; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill(BRAND); c.border = border; }));
      let r = 2;
      Array.from(m.entries()).sort((a, b) => b[1].total - a[1].total).forEach(([k, v]) => {
        ws.getCell(r, 1).value = k; ws.getCell(r, 2).value = v.n; ws.getCell(r, 3).value = v.total;
        ws.getCell(r, 3).numFmt = '"Q"#,##0.00';
        for (let i = 1; i <= 3; i++) ws.getCell(r, i).border = border;
        r++;
      });
      ws.getCell(r, 1).value = "TOTAL"; ws.getCell(r, 3).value = Array.from(m.values()).reduce((s, v) => s + v.total, 0);
      ws.getCell(r, 3).numFmt = '"Q"#,##0.00'; ws.getCell(r, 1).font = { bold: true }; ws.getCell(r, 3).font = { bold: true };
    };
    addGroupSheet("Por proveedor", bySupplier);
    addGroupSheet("Por categoría", byCategory);

    const ws = wb.addWorksheet("Detalle");
    ws.columns = [{ width: 13 }, { width: 34 }, { width: 22 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }];
    ["Fecha", "Título", "Proveedor", "Categoría", "Estado", "Factura", "Monto"].forEach((h, i) => { const c = ws.getCell(1, i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill(BRAND); c.border = border; });
    let r = 2;
    for (const p of purchases) {
      const vals: any[] = [fmtDate(p.createdAt), p.title, p.supplier?.name || p.provider || "", p.category || "", p.status, p.invoiceNumber || "", p.amount ? Number(p.amount) : null];
      vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v; c.border = border; if (i === 6) c.numFmt = '"Q"#,##0.00'; });
      r++;
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: r, column: 7 } };

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="compras.xlsx"` } });
  } catch (error) {
    console.error("Error reporte compras:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
