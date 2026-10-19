import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { BITACORA_LABELS, parseRange } from "@/lib/bitacora";
import { createPdf, pdfHeader, drawTable, stampFooters, type Col } from "@/lib/pdf-utils";

function fmt(d: Date) {
  return d.toLocaleString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtShort(d: Date) {
  return d.toLocaleDateString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function periodRange(period?: string | null) {
  const now = new Date();
  if (period === "day") {
    const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return { from: d, to: d };
  }
  if (period === "week") {
    const day = now.getDay() || 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day - 1));
    const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { from: f(monday), to: f(now) };
  }
  if (period === "month") {
    const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { from: f(new Date(now.getFullYear(), now.getMonth(), 1)), to: f(now) };
  }
  return { from: null, to: null };
}

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const format = (params.get("format") || "xlsx").toLowerCase();
    const quick = periodRange(params.get("period"));
    const from = params.get("from") || quick.from;
    const to = params.get("to") || quick.to;
    const { start, end } = parseRange(from, to);
    const type = params.get("type") || undefined;

    const where: Record<string, unknown> = { createdAt: { gte: start, lte: end } };
    if (type) where.type = type;

    const rows = await prisma.bitacoraEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5000,
      include: {
        user: { select: { name: true } },
        inventoryItem: { select: { name: true, section: true } },
        workshopItem: { select: { itemName: true } },
      },
    });

    const rango = `${fmtShort(start)} — ${fmtShort(end)}`;
    const fileBase = `bitacora-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}`;

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Bitácora de inventario y taller", `${rango} · ${rows.length} movimiento(s)`);
      if (rows.length === 0) {
        doc.font("Helvetica").fontSize(10).fillColor("#15803d").text("Sin movimientos en el periodo.");
      }
      const cols: Col[] = [
        { w: 58, t: "Fecha" },
        { w: 72, t: "Tipo" },
        { w: 138, t: "Ítem" },
        { w: 28, t: "Cant.", align: "right" },
        { w: 62, t: "De → A" },
        { w: 62, t: "Usuario" },
        { w: 112, t: "Notas" },
      ];
      drawTable(doc, cols, rows.map((r) => [
        { v: fmt(r.createdAt) },
        { v: BITACORA_LABELS[r.type] || r.type },
        { v: r.itemName },
        { v: String(r.quantity || 0) },
        { v: [r.fromWarehouse, r.toWarehouse].filter(Boolean).join(" → ") || "—" },
        { v: r.user?.name || "—" },
        { v: r.notes || "—" },
      ]));
      stampFooters(doc, "Bitácora — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"` },
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const ws = wb.addWorksheet("Bitácora");
    ws.columns = [
      { header: "Fecha", key: "fecha", width: 20 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Ítem", key: "item", width: 42 },
      { header: "Cantidad", key: "qty", width: 10 },
      { header: "De", key: "from", width: 20 },
      { header: "A", key: "to", width: 20 },
      { header: "Usuario", key: "user", width: 22 },
      { header: "Notas", key: "notes", width: 50 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of rows) {
      ws.addRow({
        fecha: fmt(r.createdAt),
        tipo: BITACORA_LABELS[r.type] || r.type,
        item: r.itemName,
        qty: r.quantity || 0,
        from: r.fromWarehouse || "",
        to: r.toWarehouse || "",
        user: r.user?.name || "",
        notes: r.notes || "",
      });
    }
    ws.autoFilter = { from: "A1", to: "H1" };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error bitacora report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
