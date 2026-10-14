import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface ReportRow {
  name: string;
  section: string | null;
  needed: number;
  stock: number;
  repair: number;
  available: number;
  faltante: number;
}

export interface CuadroReport {
  kind: "cuadro";
  orderNumber: number;
  eventName: string;
  clientName: string | null;
  eventLocation: string | null;
  eventDate: string | null;
  guestCount: number | null;
  contractNotes: string | null;
  status: string;
  rows: ReportRow[];
  faltantes: ReportRow[];
  totalNeeded: number;
  totalRows: number;
}

export interface GeneralReport {
  kind: "general";
  generatedAt: string;
  orders: { orderNumber: number; eventName: string; eventDate: string | null; location: string | null; items: number; faltantes: number }[];
  rows: ReportRow[];
  faltantes: ReportRow[];
}

// Carga inventario indexado por id y por nombre normalizado.
async function getInventoryIndex() {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, section: true, quantity: true, status: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map(items.map((i) => [norm(i.name), i]));
  return { items, byId, byName };
}

function aggregateOrderItems(orderItems: { name: string; quantity: number; inventoryItemId: string | null }[], byId: Map<string, any>, byName: Map<string, any>) {
  const agg = new Map<string, { name: string; inv: any; needed: number }>();
  for (const it of orderItems) {
    const inv = (it.inventoryItemId && byId.get(it.inventoryItemId)) || byName.get(norm(it.name)) || null;
    const key = inv ? `id:${inv.id}` : `name:${norm(it.name)}`;
    const cur = agg.get(key) || { name: inv?.name || it.name, inv, needed: 0 };
    cur.needed += it.quantity;
    agg.set(key, cur);
  }
  return Array.from(agg.values());
}

function toRow(name: string, section: string | null, inv: any, needed: number): ReportRow {
  const stock = inv?.quantity ?? 0;
  const repair = inv && (inv.status === "EN_REPARACION" || inv.status === "DANADO" || inv.status === "PERDIDO") ? inv.quantity : 0;
  const available = Math.max(0, stock - repair);
  return { name, section, needed, stock, repair, available, faltante: Math.max(0, needed - available) };
}

export async function buildCuadroReport(orderId: string): Promise<CuadroReport | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;
  const { byId, byName } = await getInventoryIndex();
  const aggregated = aggregateOrderItems(order.items, byId, byName);
  const rows = aggregated
    .map((a) => toRow(a.name, a.inv?.section ?? null, a.inv, a.needed))
    .sort((x, y) => y.faltante - x.faltante || x.name.localeCompare(y.name));
  const faltantes = rows.filter((r) => r.faltante > 0);
  const totalNeeded = rows.reduce((s, r) => s + r.needed, 0);
  return {
    kind: "cuadro",
    orderNumber: order.orderNumber,
    eventName: order.eventName,
    clientName: (order as any).clientName ?? null,
    eventLocation: (order as any).eventLocation ?? null,
    eventDate: (order as any).eventDate ? new Date((order as any).eventDate).toISOString() : null,
    guestCount: (order as any).guestCount ?? null,
    contractNotes: (order as any).contractNotes ?? null,
    status: order.status,
    rows,
    faltantes,
    totalNeeded,
    totalRows: rows.length,
  };
}

export async function buildGeneralReport(ids?: string[]): Promise<GeneralReport | null> {
  const orders = await prisma.order.findMany({
    where: ids && ids.length ? { id: { in: ids } } : {},
    orderBy: { eventDate: "asc" },
    include: { items: true },
  });
  if (orders.length === 0) return null;
  const { byId, byName } = await getInventoryIndex();

  // Demanda total por ítem (sumando todos los cuadros).
  const total = new Map<string, { name: string; inv: any; needed: number }>();
  const orderSummaries: GeneralReport["orders"] = [];
  for (const o of orders) {
    const aggregated = aggregateOrderItems(o.items, byId, byName);
    const falt = aggregated.filter((a) => {
      const stock = a.inv?.quantity ?? 0;
      const repair = a.inv && (a.inv.status === "EN_REPARACION" || a.inv.status === "DANADO" || a.inv.status === "PERDIDO") ? a.inv.quantity : 0;
      return a.needed > Math.max(0, stock - repair);
    }).length;
    orderSummaries.push({
      orderNumber: o.orderNumber,
      eventName: o.eventName,
      eventDate: (o as any).eventDate ? new Date((o as any).eventDate).toISOString() : null,
      location: (o as any).eventLocation ?? null,
      items: aggregated.length,
      faltantes: falt,
    });
    for (const a of aggregated) {
      const key = a.inv ? `id:${a.inv.id}` : `name:${norm(a.name)}`;
      const cur = total.get(key) || { name: a.name, inv: a.inv, needed: 0 };
      cur.needed += a.needed;
      total.set(key, cur);
    }
  }

  const rows = Array.from(total.values())
    .map((a) => toRow(a.name, a.inv?.section ?? null, a.inv, a.needed))
    .sort((x, y) => y.faltante - x.faltante || x.name.localeCompare(y.name));
  const faltantes = rows.filter((r) => r.faltante > 0);

  return { kind: "general", generatedAt: new Date().toISOString(), orders: orderSummaries, rows, faltantes };
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "long", year: "numeric" }) : "—");

// ---------- PDF ----------
function pdfFromRows(title: string, subtitle: string, rows: ReportRow[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => { doc.on("end", () => res(Buffer.concat(chunks))); doc.on("error", rej); });

  doc.font("Helvetica-Bold").fontSize(16).fillColor("#1e40af").text("Live Productions GT");
  doc.fontSize(13).fillColor("#111").text(title);
  doc.fontSize(9).fillColor("#555").text(subtitle);
  doc.moveDown(0.6);

  const cols = [
    { w: 250, t: "Item" }, { w: 55, t: "Nec." }, { w: 55, t: "Stock" }, { w: 65, t: "Disp." }, { w: 60, t: "Faltan" },
  ];
  const startX = doc.page.margins.left;
  const drawHead = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#fff");
    doc.rect(x, doc.y - 2, cols.reduce((s, c) => s + c.w, 0), 16).fill("#1e40af");
    let x2 = startX + 4;
    const y = doc.y + 1;
    for (const c of cols) { doc.fillColor("#fff").text(c.t, x2, y, { width: c.w - 6, lineBreak: false }); x2 += c.w; }
    doc.moveDown(1.1);
  };
  drawHead();

  doc.font("Helvetica").fontSize(8.5);
  for (const r of rows) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 20) { doc.addPage(); drawHead(); doc.font("Helvetica").fontSize(8.5); }
    const y = doc.y;
    let x = startX + 4;
    const vals = [r.name, String(r.needed), String(r.stock), String(r.available), String(r.faltante)];
    vals.forEach((v, i) => {
      doc.fillColor(i === 4 && r.faltante > 0 ? "#b91c1c" : "#222").font(i === 4 && r.faltante > 0 ? "Helvetica-Bold" : "Helvetica");
      doc.text(v, x, y, { width: cols[i].w - 6, lineBreak: false, ellipsis: true });
      x += cols[i].w;
    });
    doc.moveDown(0.9);
  }

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(8).fillColor("#888").text(`Generado ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })} · Live Productions GT`, startX, doc.page.height - 50, { width: doc.page.width - 80, align: "center" });
  doc.end();
  return done;
}

export async function reportPdf(report: CuadroReport | GeneralReport): Promise<Buffer> {
  if (report.kind === "cuadro") {
    const subtitle = [report.clientName, report.eventLocation, fmtDate(report.eventDate), report.guestCount ? `${report.guestCount} invitados` : null].filter(Boolean).join(" · ");
    return pdfFromRows(`Cuadro #${report.orderNumber} — ${report.eventName}`, subtitle, report.rows);
  }
  const subtitle = `${report.orders.length} cuadros · ${report.rows.length} ítems · ${report.faltantes.length} con faltante`;
  return pdfFromRows("Reporte general de cuadros", subtitle, report.rows);
}

// ---------- Excel ----------
export function reportXlsx(report: CuadroReport | GeneralReport): Buffer {
  const wb = XLSX.utils.book_new();

  const detailRows = report.rows.map((r) => ({
    Ítem: r.name, Sección: r.section || "", Necesito: r.needed, Stock: r.stock, Disponible: r.available, Falta: r.faltante,
  }));

  if (report.kind === "cuadro") {
    const info = [
      ["Cuadro #", report.orderNumber],
      ["Evento", report.eventName],
      ["Cliente", report.clientName || ""],
      ["Lugar", report.eventLocation || ""],
      ["Fecha", fmtDate(report.eventDate)],
      ["Invitados", report.guestCount || ""],
      ["Equipo contratado", report.contractNotes || ""],
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet([["Reporte de Cuadro"], [], ...info]);
    XLSX.utils.book_append_sheet(wb, wsInfo, "Evento");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Detalle");
    const falt = report.faltantes.map((r) => ({ Ítem: r.name, Necesito: r.needed, Disponible: r.available, Falta: r.faltante }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(falt.length ? falt : [{ Ítem: "— sin faltantes —" }]), "Faltantes");
  } else {
    const wsOrders = XLSX.utils.json_to_sheet(report.orders.map((o) => ({
      Cuadro: o.orderNumber, Evento: o.eventName, Fecha: fmtDate(o.eventDate), Lugar: o.location || "", Ítems: o.items, Faltantes: o.faltantes,
    })));
    XLSX.utils.book_append_sheet(wb, wsOrders, "Cuadros");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Demanda vs Stock");
    const falt = report.faltantes.map((r) => ({ Ítem: r.name, Necesito: r.needed, Disponible: r.available, Falta: r.faltante }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(falt.length ? falt : [{ Ítem: "— sin faltantes —" }]), "Faltantes");
  }

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
