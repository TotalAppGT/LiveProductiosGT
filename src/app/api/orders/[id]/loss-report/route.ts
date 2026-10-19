import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { createPdf, pdfHeader, drawTable, stampFooters, type Col } from "@/lib/pdf-utils";

const COND_LABELS: Record<string, string> = {
  BUENO: "Buen estado",
  DANADO: "Vino malo",
  PERDIDO: "No vino",
};

function money(n: number) {
  return `Q${(Number(n) || 0).toFixed(2)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const format = (new URL(request.url).searchParams.get("format") || "pdf").toLowerCase();

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        reintegros: { orderBy: { createdAt: "desc" } },
        charges: { include: { responsible: { select: { name: true } } } },
        approvalRequests: { where: { type: { in: ["PERDIDA", "TALLER"] } }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return NextResponse.json({ success: false, error: "Pedido no encontrado" }, { status: 404 });

    const userIds = Array.from(new Set(order.items.map((i) => i.responsibleId).filter((x): x is string => !!x)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userName = (uid?: string | null) => users.find((u) => u.id === uid)?.name || "—";

    const reintegro = order.reintegros[0];
    const rows = order.items.map((item) => {
      const cond = item.returnCondition || "BUENO";
      const qty = cond === "PERDIDO" ? item.lostQty ?? item.quantity : cond === "DANADO" ? item.damagedQty ?? item.quantity : item.okQty ?? item.quantity;
      const unit = Number(item.unitValue || 0);
      const amount = cond === "PERDIDO" ? qty * unit : 0;
      return { item, cond, qty, unit, amount, responsible: userName(item.responsibleId) };
    });

    const totalCharge = rows.reduce((s, r) => s + r.amount, 0);
    const totalLost = rows.filter((r) => r.cond === "PERDIDO").reduce((s, r) => s + r.qty, 0);
    const totalDamaged = rows.filter((r) => r.cond === "DANADO").reduce((s, r) => s + r.qty, 0);
    const totalOk = rows.filter((r) => r.cond === "BUENO").reduce((s, r) => s + r.qty, 0);
    const fecha = order.eventDate ? new Date(order.eventDate).toLocaleDateString("es-GT", { timeZone: "America/Guatemala" }) : "—";
    const bodega = reintegro?.destinationWarehouse || "—";
    const fileBase = `reintegro-${order.orderNumber}`;

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Reintegro y pérdidas del evento", `Cuadro #${order.orderNumber} · ${order.eventName} · ${fecha} · Bodega destino: ${bodega}`);
      doc.font("Helvetica").fontSize(9).fillColor("#111827").text(
        `Buen estado: ${totalOk} u · Vino malo: ${totalDamaged} u · No vino: ${totalLost} u · Total a cobrar: ${money(totalCharge)}`
      );
      doc.moveDown(0.5);
      const cols: Col[] = [
        { w: 180, t: "Ítem" },
        { w: 70, t: "Condición" },
        { w: 35, t: "Cant.", align: "right" },
        { w: 65, t: "Valor unit.", align: "right" },
        { w: 75, t: "A cobrar", align: "right" },
        { w: 107, t: "Responsable" },
      ];
      drawTable(doc, cols, rows.map((r) => [
        { v: r.item.name },
        { v: COND_LABELS[r.cond] || r.cond },
        { v: String(r.qty) },
        { v: money(r.unit) },
        { v: money(r.amount) },
        { v: r.cond === "PERDIDO" ? r.responsible : "—" },
      ]));
      doc.moveDown(0.6);
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c").text(`TOTAL A COBRAR: ${money(totalCharge)}`);
      if (reintegro) {
        doc.moveDown(0.4);
        doc.font("Helvetica").fontSize(8.5).fillColor("#374151").text(
          `Acta: entregó ${reintegro.deliveredById ? "el responsable del cuadro" : "—"} · recibió ${reintegro.receivedById ? "el encargado de bodega" : "pendiente"} · ${reintegro.receivedAt ? new Date(reintegro.receivedAt).toLocaleString("es-GT") : "pendiente de recepción"}`
        );
      }
      stampFooters(doc, "Reintegro y pérdidas — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"` },
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const ws = wb.addWorksheet("Reintegro");
    ws.columns = [
      { header: "Ítem", key: "item", width: 42 },
      { header: "Condición", key: "cond", width: 16 },
      { header: "Cantidad", key: "qty", width: 10 },
      { header: "Valor unitario", key: "unit", width: 15 },
      { header: "A cobrar", key: "amount", width: 15 },
      { header: "Responsable", key: "responsible", width: 24 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    for (const r of rows) {
      ws.addRow({
        item: r.item.name,
        cond: COND_LABELS[r.cond] || r.cond,
        qty: r.qty,
        unit: r.unit,
        amount: r.amount,
        responsible: r.cond === "PERDIDO" ? r.responsible : "",
      });
    }
    const totalRow = ws.addRow({ item: "TOTAL", amount: totalCharge });
    totalRow.font = { bold: true };
    ws.autoFilter = { from: "A1", to: "F1" };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error loss report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
