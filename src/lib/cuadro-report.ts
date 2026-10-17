import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import { recommendTruck } from "@/lib/inventory-availability";
import { INVENTORY_SECTIONS } from "@/lib/inventory";
import { computeNeedsByWeek, type NeedItem, type NeedWeek } from "@/lib/needs";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric" }) : "—";

// Secciones que típicamente se ALQUILAN (equipo mayor). El resto → COMPRAR.
const RENT_SECTIONS = new Set([
  "CONSOLAS", "AUDIO", "PEDESTALES", "MICROFONIA", "ILUMINACION", "VIDEO",
  "INSTRUMENTOS", "ESTRUCTURA DJ", "ESTRUCTURA LUCES", "ESTRUCTURA LUCES PEQUEÑA", "TARIMA Y PISTA",
]);
const actionFor = (section: string | null) => (RENT_SECTIONS.has((section || "").toUpperCase()) ? "Alquilar" : "Comprar");

const SECTION_ORDER: string[] = INVENTORY_SECTIONS as unknown as string[];
const sectionRank = (s: string | null) => {
  const i = SECTION_ORDER.indexOf((s || "").toUpperCase());
  return i === -1 ? 999 : i;
};

export interface ReportRow {
  name: string;
  section: string | null;
  needed: number;
  stock: number;
  repair: number;
  available: number;
  faltante: number;
  action: string;
}

export interface EventSummary {
  orderId: string;
  orderNumber: number;
  eventName: string;
  eventDate: string | null;
  location: string | null;
  guests: number | null;
  itemCount: number;
  faltantes: number;
  coverage: number;
  truck: string;
}

export interface MatrixRow {
  name: string;
  section: string | null;
  perEvent: Record<string, number>;
  total: number;
  stock: number;
  repair: number;
  faltante: number;
  saldo: number;
  action: string;
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
  truck: string;
  totalNeeded: number;
  totalRows: number;
}

export interface GeneralReport {
  kind: "general";
  generatedAt: string;
  events: EventSummary[];
  items: MatrixRow[];
  faltantes: MatrixRow[];
  warehouseStock: { warehouse: string; items: number; units: number; available: number; repair: number }[];
  totals: { orders: number; items: number; demand: number; faltantes: number; comprar: number; alquilar: number };
  weeks?: NeedWeek[];
  consolidated?: NeedItem[];
}

async function getInventoryIndex() {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, section: true, quantity: true, status: true, warehouse: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const byName = new Map(items.map((i) => [norm(i.name), i]));
  return { items, byId, byName };
}

function aggregate(orderItems: { name: string; quantity: number; inventoryItemId: string | null }[], byId: Map<string, any>, byName: Map<string, any>) {
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

function row(name: string, section: string | null, inv: any, needed: number): ReportRow {
  const stock = inv?.quantity ?? 0;
  const repair = inv && (inv.status === "EN_REPARACION" || inv.status === "DANADO" || inv.status === "PERDIDO") ? inv.quantity : 0;
  const available = Math.max(0, stock - repair);
  const faltante = Math.max(0, needed - available);
  return { name, section, needed, stock, repair, available, faltante, action: faltante > 0 ? actionFor(section) : "—" };
}

function truckForEvent(aggregated: { inv: any; needed: number }[]) {
  const sections = new Set<string>();
  let totalUnits = 0;
  for (const a of aggregated) {
    if (a.inv?.section) sections.add(a.inv.section.toUpperCase());
    totalUnits += a.needed;
  }
  return recommendTruck(sections, totalUnits).type;
}

export async function buildCuadroReport(orderId: string): Promise<CuadroReport | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;
  const { byId, byName } = await getInventoryIndex();
  const aggregated = aggregate(order.items, byId, byName);
  const rows = aggregated
    .map((a) => row(a.name, a.inv?.section ?? null, a.inv, a.needed))
    .sort((x, y) => sectionRank(x.section) - sectionRank(y.section) || x.name.localeCompare(y.name));
  const faltantes = rows.filter((r) => r.faltante > 0);
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
    truck: truckForEvent(aggregated),
    totalNeeded: rows.reduce((s, r) => s + r.needed, 0),
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
  const { items: invItems, byId, byName } = await getInventoryIndex();

  // Stock por bodega (de todo el inventario)
  const wmap = new Map<string, { warehouse: string; items: number; units: number; available: number; repair: number }>();
  for (const it of invItems) {
    const w = (it as any).warehouse || "Sin bodega";
    const cur = wmap.get(w) || { warehouse: w, items: 0, units: 0, available: 0, repair: 0 };
    const rep = it.status === "EN_REPARACION" || it.status === "DANADO" || it.status === "PERDIDO";
    cur.items++;
    cur.units += it.quantity;
    if (rep) cur.repair += it.quantity; else cur.available += it.quantity;
    wmap.set(w, cur);
  }
  const warehouseStock = Array.from(wmap.values()).sort((a, b) => b.units - a.units);

  const events: EventSummary[] = [];
  const matrix = new Map<string, MatrixRow>();

  for (const o of orders) {
    const aggregated = aggregate(o.items, byId, byName);
    let falt = 0;
    for (const a of aggregated) {
      const r = row(a.name, a.inv?.section ?? null, a.inv, a.needed);
      if (r.faltante > 0) falt++;
      const key = a.inv ? `id:${a.inv.id}` : `name:${norm(a.name)}`;
      const cur: MatrixRow = matrix.get(key) || {
        name: a.name, section: a.inv?.section ?? null, perEvent: {}, total: 0,
        stock: r.stock, repair: r.repair, faltante: 0, saldo: 0, action: actionFor(a.inv?.section ?? null),
      };
      cur.perEvent[String(o.orderNumber)] = (cur.perEvent[String(o.orderNumber)] || 0) + a.needed;
      cur.total += a.needed;
      matrix.set(key, cur);
    }
    events.push({
      orderId: o.id,
      orderNumber: o.orderNumber,
      eventName: o.eventName,
      eventDate: (o as any).eventDate ? new Date((o as any).eventDate).toISOString() : null,
      location: (o as any).eventLocation ?? null,
      guests: (o as any).guestCount ?? null,
      itemCount: aggregated.length,
      faltantes: falt,
      coverage: aggregated.length ? Math.round(((aggregated.length - falt) / aggregated.length) * 100) : 100,
      truck: truckForEvent(aggregated),
    });
  }

  const items = Array.from(matrix.values())
    .map((m) => {
      const available = Math.max(0, m.stock - m.repair);
      m.faltante = Math.max(0, m.total - available);
      m.saldo = available - m.total;
      return m;
    })
    .sort((a, b) => sectionRank(a.section) - sectionRank(b.section) || a.name.localeCompare(b.name));

  const faltantes = items.filter((m) => m.faltante > 0);
  const totals = {
    orders: events.length,
    items: items.length,
    demand: items.reduce((s, m) => s + m.total, 0),
    faltantes: faltantes.length,
    comprar: faltantes.filter((m) => m.action === "Comprar").length,
    alquilar: faltantes.filter((m) => m.action === "Alquilar").length,
  };

  // Faltantes por semana + consolidado (una sola adquisición).
  let weeks: NeedWeek[] = [];
  let consolidated: NeedItem[] = [];
  try {
    const w = await computeNeedsByWeek("all", ids);
    weeks = w.weeks;
    consolidated = w.consolidated;
  } catch {
    // si falla el cálculo por semana, el reporte general sigue funcionando
  }

  return { kind: "general", generatedAt: new Date().toISOString(), events, items, faltantes, warehouseStock, totals, weeks, consolidated };
}

// ================= PDF =================
function newDoc() {
  const doc = new PDFDocument({ size: "LETTER", margin: 40 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => { doc.on("end", () => res(Buffer.concat(chunks))); doc.on("error", rej); });
  return { doc, done };
}

// Recorta el texto al ancho disponible (evita que se encime con la otra columna).
function fitText(doc: any, text: any, maxW: number): string {
  const s = String(text ?? "");
  if (!s) return "";
  if (doc.widthOfString(s) <= maxW) return s;
  let t = s;
  while (t.length > 1 && doc.widthOfString(t + "…") > maxW) t = t.slice(0, -1);
  return t + "…";
}

interface Cell { v: string; color?: string; bold?: boolean; }
interface Col { w: number; t: string; align?: "left" | "right" | "center"; }

function drawTable(doc: any, cols: Col[], rows: Cell[][]) {
  const x0 = doc.page.margins.left;
  const pad = 7;
  const minRowH = 14;
  const totalW = cols.reduce((s, c) => s + c.w, 0);

  const headLine = () => doc.moveTo(x0, doc.y).lineTo(x0 + totalW, doc.y).lineWidth(0.8).strokeColor("#1e40af").stroke();
  const drawHead = () => {
    const y = doc.y;
    doc.rect(x0, y, totalW, 16).fill("#1e40af");
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff");
    let x = x0;
    for (const c of cols) {
      doc.text(fitText(doc, c.t, c.w - pad * 2), x + pad, y + 4, { width: c.w - pad * 2, align: c.align || "left", lineBreak: false });
      x += c.w;
    }
    doc.y = y + 16;
    headLine();
  };
  drawHead();

  let alt = false;
  for (const row of rows) {
    // Alto de fila según el texto más largo → se ve TODO el texto (con salto de línea)
    doc.font("Helvetica").fontSize(8.5);
    const lh = doc.currentLineHeight();
    let lines = 1;
    for (let i = 0; i < row.length; i++) {
      const w = cols[i].w - pad * 2;
      const h = doc.heightOfString(String(row[i]?.v ?? ""), { width: w });
      lines = Math.max(lines, Math.max(1, Math.round(h / lh)));
    }
    const rowH = Math.max(minRowH, lines * lh + 5);

    if (doc.y > doc.page.height - doc.page.margins.bottom - rowH - 4) { doc.addPage(); drawHead(); alt = false; }
    const y = doc.y;
    if (alt) doc.rect(x0, y + 0.6, totalW, rowH - 1.2).fill("#f3f4f6");
    alt = !alt;
    let x = x0;
    row.forEach((cell, i) => {
      const c = cols[i];
      doc.fillColor(cell.color || "#222").font(cell.bold ? "Helvetica-Bold" : "Helvetica").fontSize(8.5);
      doc.text(String(cell.v ?? ""), x + pad, y + 3, { width: c.w - pad * 2, align: c.align || "left" });
      x += c.w;
    });
    // Línea de guía al pie de cada fila
    doc.moveTo(x0, y + rowH).lineTo(x0 + totalW, y + rowH).lineWidth(0.6).strokeColor("#9ca3af").stroke();
    doc.y = y + rowH;
  }
  doc.y += 6;
}

export async function reportPdf(report: CuadroReport | GeneralReport): Promise<Buffer> {
  const { doc, done } = newDoc();
  const blue = "#1e40af";
  doc.font("Helvetica-Bold").fontSize(16).fillColor(blue).text("Live Productions GT");
  doc.font("Helvetica").fontSize(8).fillColor("#888").text(`Generado ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`);

  if (report.kind === "cuadro") {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#111").text(`Cuadro #${report.orderNumber} — ${report.eventName}`);
    doc.font("Helvetica").fontSize(9).fillColor("#555")
      .text([report.clientName, report.eventLocation, fmtDate(report.eventDate), report.guestCount ? `${report.guestCount} invitados` : null].filter(Boolean).join(" · "));
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#111").text(`Ítems: ${report.totalRows} · Faltantes: ${report.faltantes.length} · Camión: ${report.truck}`);
    doc.moveDown(0.6);
    const cols: Col[] = [{ w: 205, t: "Ítem" }, { w: 48, t: "Nec.", align: "right" }, { w: 48, t: "Stock", align: "right" }, { w: 55, t: "Disp.", align: "right" }, { w: 52, t: "Faltan", align: "right" }, { w: 70, t: "Acción" }];
    drawTable(doc, cols, report.rows.map((r) => ([
      { v: r.name },
      { v: String(r.needed) },
      { v: String(r.stock) },
      { v: String(r.available) },
      { v: String(r.faltante), color: r.faltante > 0 ? "#b91c1c" : "#222", bold: r.faltante > 0 },
      { v: r.faltante > 0 ? r.action : "" },
    ])));
    doc.end();
    return done;
  }

  // GENERAL
  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text("Reporte general de cuadros");
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(blue).text("RESUMEN GENERAL");
  doc.font("Helvetica").fontSize(9).fillColor("#222");
  doc.text(`Cuadros: ${report.totals.orders}   ·   Ítems distintos: ${report.totals.items}   ·   Demanda total: ${report.totals.demand} unidades`);
  doc.text(`A comprar: ${report.totals.comprar} ítems   ·   A alquilar: ${report.totals.alquilar} ítems   ·   Total faltantes: ${report.totals.faltantes}`);
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(10).fillColor(blue).text("POR EVENTO");
  const evCols: Col[] = [{ w: 148, t: "Evento" }, { w: 55, t: "Fecha" }, { w: 104, t: "Lugar" }, { w: 42, t: "Inv.", align: "right" }, { w: 46, t: "Ítems", align: "right" }, { w: 52, t: "Faltan", align: "right" }, { w: 72, t: "Camión" }];
  drawTable(doc, evCols, report.events.map((e) => ([
    { v: `#${e.orderNumber} ${e.eventName}` },
    { v: fmtDate(e.eventDate) },
    { v: e.location || "—" },
    { v: String(e.guests ?? "—") },
    { v: String(e.itemCount) },
    { v: String(e.faltantes), color: e.faltantes > 0 ? "#b91c1c" : "#222", bold: e.faltantes > 0 },
    { v: e.truck },
  ])));

  const weeks = report.weeks || [];
  const consolidated = report.consolidated || [];
  doc.moveDown(0.6);
  if (consolidated.length) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f766e").text("CONSOLIDADO — adquirir UNA sola vez (cubre todas las semanas)");
    const cCols: Col[] = [{ w: 210, t: "Equipo" }, { w: 48, t: "Cant.", align: "right" }, { w: 62, t: "Inventario", align: "right" }, { w: 52, t: "Faltan", align: "right" }, { w: 90, t: "Semanas" }];
    drawTable(doc, cCols, consolidated.map((m) => ([
      { v: m.name }, { v: String(m.peak) }, { v: String(m.supply) }, { v: String(m.shortfall), color: "#b91c1c", bold: true }, { v: (m.weeks || []).join(", ") || "—" },
    ])));
    doc.moveDown(0.4);
  }
  for (const w of weeks) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c").text(`RENTA / COMPRA — SEMANA ${fmtDate(w.start.toISOString())} al ${fmtDate(w.end.toISOString())} (${w.items.length})`);
    const rcCols: Col[] = [{ w: 220, t: "Equipo" }, { w: 50, t: "Cant.", align: "right" }, { w: 62, t: "Inventario", align: "right" }, { w: 52, t: "Faltan", align: "right" }, { w: 70, t: "Acción" }];
    drawTable(doc, rcCols, w.items.map((m) => ([
      { v: m.name }, { v: String(m.peak) }, { v: String(m.supply) }, { v: String(m.shortfall), color: "#b91c1c", bold: true }, { v: m.action },
    ])));
    doc.moveDown(0.4);
  }
  if (!consolidated.length && !weeks.length) {
    doc.font("Helvetica").fontSize(9).fillColor("#15803d").text("Sin faltantes en las fechas futuras.");
  }

  if (report.warehouseStock && report.warehouseStock.length > 0) {
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(blue).text("STOCK POR BODEGA");
    const wCols: Col[] = [{ w: 180, t: "Bodega" }, { w: 70, t: "Ítems", align: "right" }, { w: 82, t: "Unidades", align: "right" }, { w: 95, t: "Disponibles", align: "right" }, { w: 95, t: "Reparación", align: "right" }];
    drawTable(doc, wCols, report.warehouseStock.map((w) => ([
      { v: w.warehouse },
      { v: String(w.items) },
      { v: String(w.units) },
      { v: String(w.available) },
      { v: String(w.repair) },
    ])));
  }

  doc.end();
  return done;
}

// ================= Excel =================
export function reportXlsx(report: CuadroReport | GeneralReport): Buffer {
  const wb = XLSX.utils.book_new();

  if (report.kind === "cuadro") {
    const info = [
      ["REPORTE DE CUADRO — Live Productions GT"], [],
      ["Cuadro #", report.orderNumber], ["Evento", report.eventName], ["Cliente", report.clientName || ""],
      ["Lugar", report.eventLocation || ""], ["Fecha", fmtDate(report.eventDate)], ["Invitados", report.guestCount || ""],
      ["Camión recomendado", report.truck], ["Faltantes", report.faltantes.length], ["Equipo contratado", report.contractNotes || ""],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(info), "Resumen");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(report.rows.map((r) => ({
      Ítem: r.name, Sección: r.section || "", Necesito: r.needed, Stock: r.stock, Disponible: r.available, Falta: r.faltante,
      "Acción": r.faltante > 0 ? r.action : "",
    }))), "Detalle");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  // Resumen
  const resumen: any[][] = [
    ["REPORTE GENERAL DE CUADROS — Live Productions GT"],
    [`Generado: ${new Date(report.generatedAt).toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`],
    [],
    ["RESUMEN GENERAL"],
    ["Cuadros", report.totals.orders],
    ["Ítems distintos", report.totals.items],
    ["Demanda total (unidades)", report.totals.demand],
    ["Ítems a comprar", report.totals.comprar],
    ["Ítems a alquilar", report.totals.alquilar],
    ["Total faltantes", report.totals.faltantes],
    [],
    ["POR EVENTO"],
    ["Cuadro", "Evento", "Fecha", "Lugar", "Invitados", "Ítems", "Faltantes", "Cobertura %", "Camión recomendado"],
    ...report.events.map((e) => [`#${e.orderNumber}`, e.eventName, fmtDate(e.eventDate), e.location || "", e.guests || "", e.itemCount, e.faltantes, e.coverage, e.truck]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  // Resumen de Equipo (matriz)
  const eventCols = report.events.map((e) => `#${e.orderNumber} ${e.eventName}`);
  const header = ["Equipo", "Sección", ...eventCols, "Total semanal", "Inventario", "Faltante", "Saldo", "Acción"];
  const matrix: any[][] = [["RESUMEN DE EQUIPO"], [], header];
  let lastSection = "";
  for (const m of report.items) {
    const sec = (m.section || "OTRO").toUpperCase();
    if (sec !== lastSection) { matrix.push([sec]); lastSection = sec; }
    matrix.push([
      m.name, sec,
      ...report.events.map((e) => m.perEvent[String(e.orderNumber)] || ""),
      m.total, m.stock, m.faltante > 0 ? `Falta ${m.faltante}` : "Completo", m.saldo, m.faltante > 0 ? m.action : "—",
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(matrix), "Resumen de Equipo");

  // Renta / Compra — POR SEMANA + CONSOLIDADO
  const rc: any[][] = [
    ["RESUMEN DE RENTA / COMPRA — POR SEMANA"],
    ["Solo equipos que no alcanzan en inventario."],
    [],
  ];
  const consolidated = report.consolidated || [];
  const weeks = report.weeks || [];
  if (consolidated.length) {
    rc.push(["CONSOLIDADO — adquirir UNA sola vez (cubre todas las semanas)"]);
    rc.push(["Equipo", "Sección", "Cantidad", "Inventario", "Faltan", "Acción", "Semanas"]);
    for (const m of consolidated) rc.push([m.name, m.section || "", m.peak, m.supply, m.shortfall, m.action, (m.weeks || []).join(", ")]);
    rc.push([]);
  }
  for (const w of weeks) {
    rc.push([`SEMANA ${fmtDate(w.start.toISOString())} al ${fmtDate(w.end.toISOString())}`]);
    rc.push(["Equipo", "Sección", "Cantidad", "Inventario", "Faltan", "Acción", "Cuadros"]);
    for (const m of w.items) rc.push([m.name, m.section || "", m.peak, m.supply, m.shortfall, m.action, m.events.map((e) => `#${e.orderNumber} ${e.eventName}`).join(", ")]);
    rc.push([]);
  }
  if (!consolidated.length && !weeks.length) {
    rc.push(["Sin faltantes en las fechas futuras."]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rc), "Renta-Compra");

  // Stock por bodega
  const wsStock: any[][] = [
    ["STOCK POR BODEGA"], [],
    ["Bodega", "Ítems", "Unidades", "Disponibles", "En reparación"],
    ...report.warehouseStock.map((w) => [w.warehouse, w.items, w.units, w.available, w.repair]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(wsStock), "Stock por bodega");

  // Detalle por evento (desde perEvent de cada ítem)
  const detalle: any[][] = [["Evento", "Fecha", "Ítem", "Sección", "Cantidad", "Inventario"]];
  for (const m of report.items) {
    for (const e of report.events) {
      const q = m.perEvent[String(e.orderNumber)];
      if (q) detalle.push([`#${e.orderNumber} ${e.eventName}`, fmtDate(e.eventDate), m.name, m.section || "", q, m.stock]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalle), "Detalle");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
