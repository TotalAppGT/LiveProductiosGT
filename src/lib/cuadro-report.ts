import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { recommendTruck } from "@/lib/inventory-availability";
import { INVENTORY_SECTIONS } from "@/lib/inventory";
import { computeDemandAll, computeNeedsByWeek, type NeedItem, type NeedWeek } from "@/lib/needs";
import { normName } from "@/lib/reconcile";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const actionLabel = (a: string) => a === "COMPRAR" ? "Comprar" : a === "RENTAR" ? "Alquilar" : a === "CONSULTAR" ? "Consultar" : (a || "—");
const fmtDateOnly = (s: string) => s === "sin-fecha" ? "—" : new Date(`${s}T12:00:00`).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric" }) : "—";
// Día corto SIN convertir zona (las semanas ya vienen como medianoche local).
const fmtDay = (d: Date) => d.toLocaleDateString("es-GT", { day: "2-digit", month: "short" });

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
  demand: number;
  faltantes: number;
  comprar: number;
  alquilar: number;
  resumen: { name: string; qty: number; action: string; shortfall: number; dayShortfall: number }[];
  coverage: number;
  truck: string;
}

export interface MatrixRow {
  name: string;
  section: string | null;
  perEvent: Record<string, number>;
  total: number;
  peak: number;
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
  rangeLabel?: string;
  events: EventSummary[];
  items: MatrixRow[];
  faltantes: MatrixRow[];
  warehouseStock: { warehouse: string; items: number; units: number; available: number; repair: number }[];
  totals: { orders: number; items: number; demand: number; faltantes: number; comprar: number; alquilar: number };
  dates: { date: string; orders: number; demand: number; faltantes: number; comprar: number; alquilar: number; resumen: { name: string; shortfall: number; action: string }[] }[];
  dateDetail: { date: string; name: string; section: string | null; need: number; supply: number; repair: number; shortfall: number; action: string; orders: string }[];
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

  // Demanda real: pico simultáneo (considera montaje D-1) + inventario agregado.
  const demandAll = await computeDemandAll("all", ids);
  const needByKey = new Map(demandAll.map((d) => [d.key, d]));

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

  // Faltante por DÍA (para que al filtrar el Excel por fecha se vea el día real).
  const ordersByDate = new Map<string, string[]>();
  for (const o of orders) {
    const dk = (o as any).eventDate ? new Date((o as any).eventDate).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" }) : "sin-fecha";
    if (!ordersByDate.has(dk)) ordersByDate.set(dk, []);
    ordersByDate.get(dk)!.push(o.id);
  }
  const dayNeeds = new Map<string, Map<string, NeedItem>>();
  for (const [dk, dayOrderIds] of ordersByDate) {
    const arr = await computeDemandAll("all", dayOrderIds);
    dayNeeds.set(dk, new Map(arr.map((d) => [d.key, d])));
  }

  const events: EventSummary[] = [];
  const matrix = new Map<string, MatrixRow>();

  for (const o of orders) {
    const aggregated = aggregate(o.items, byId, byName);
    const resumen: { name: string; qty: number; action: string; shortfall: number; dayShortfall: number }[] = [];
    const demandTotal = aggregated.reduce((s, a) => s + a.needed, 0);
    const dk = (o as any).eventDate ? new Date((o as any).eventDate).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" }) : "sin-fecha";
    const dayMap = dayNeeds.get(dk);

    for (const a of aggregated) {
      const need = needByKey.get(normName(a.name));
      const dayNeed = dayMap?.get(normName(a.name));
      if (dayNeed && dayNeed.shortfall > 0) {
        resumen.push({
          name: dayNeed.name || a.name,
          qty: a.needed,
          action: actionLabel(dayNeed.action),
          shortfall: dayNeed.shortfall,
          dayShortfall: dayNeed.shortfall,
        });
      }
      const key = need?.key || `name:${normName(a.name)}`;
      const cur: MatrixRow = matrix.get(key) || {
        name: need?.name || a.name,
        section: need?.section || a.inv?.section || null,
        perEvent: {},
        total: 0,
        peak: need?.peak ?? 0,
        stock: need?.supply ?? 0,
        repair: need?.repair ?? 0,
        faltante: need?.shortfall ?? 0,
        saldo: (need?.supply ?? 0) - (need?.peak ?? 0),
        action: need ? actionLabel(need.action) : "—",
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
      demand: demandTotal,
      faltantes: resumen.length,
      comprar: resumen.filter((x) => x.action === "Comprar").length,
      alquilar: resumen.filter((x) => x.action === "Alquilar").length,
      resumen,
      coverage: aggregated.length ? Math.round(((aggregated.length - resumen.length) / aggregated.length) * 100) : 100,
      truck: truckForEvent(aggregated),
    });
  }

  const items = Array.from(matrix.values())
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

  // Datos generales por fecha (eventos agrupados por día).
  const dateMap = new Map<string, { date: string; orders: number; demand: number; resumen: Map<string, { name: string; shortfall: number; action: string }> }>();
  for (const e of events) {
    const dk = e.eventDate ? new Date(e.eventDate).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" }) : "sin-fecha";
    const rec = dateMap.get(dk) || { date: dk, orders: 0, demand: 0, resumen: new Map() };
    rec.orders++;
    rec.demand += e.demand;
    for (const r of e.resumen) rec.resumen.set(normName(r.name), { name: r.name, shortfall: r.shortfall, action: r.action });
    dateMap.set(dk, rec);
  }
  const dates = Array.from(dateMap.values()).map((r) => {
    const res = Array.from(r.resumen.values());
    return {
      date: r.date,
      orders: r.orders,
      demand: r.demand,
      faltantes: res.length,
      comprar: res.filter((x) => x.action === "Comprar").length,
      alquilar: res.filter((x) => x.action === "Alquilar").length,
      resumen: res,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  // Detalle por FECHA: suma de todos los cuadros de ese día, un ítem por fila.
  const dateDetail: GeneralReport["dateDetail"] = [];
  for (const dk of Array.from(ordersByDate.keys()).sort()) {
    const needs = Array.from(dayNeeds.get(dk)?.values() || []);
    for (const d of needs) {
      dateDetail.push({
        date: dk,
        name: d.name,
        section: d.section,
        need: d.peak,
        supply: d.supply,
        repair: d.repair,
        shortfall: d.shortfall,
        action: d.shortfall > 0 ? actionLabel(d.action) : "—",
        orders: Array.from(new Set(d.events.map((e) => `#${e.orderNumber}`))).join(", "),
      });
    }
  }
  dateDetail.sort((a, b) => a.date.localeCompare(b.date) || sectionRank(a.section) - sectionRank(b.section) || a.name.localeCompare(b.name));

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

  return { kind: "general", generatedAt: new Date().toISOString(), events, items, faltantes, warehouseStock, totals, dates, dateDetail, weeks, consolidated };
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
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#111").text(`Reporte general de cuadros${report.rangeLabel ? ` — ${report.rangeLabel}` : ""}`);
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(blue).text("RESUMEN GENERAL");
  doc.font("Helvetica").fontSize(9).fillColor("#222");
  doc.text(`Cuadros: ${report.totals.orders}   ·   Ítems distintos: ${report.totals.items}   ·   Demanda total: ${report.totals.demand} unidades`);
  doc.text(`A comprar: ${report.totals.comprar} ítems   ·   A alquilar: ${report.totals.alquilar} ítems   ·   Total faltantes: ${report.totals.faltantes}`);
  doc.moveDown(0.6);

  doc.font("Helvetica-Bold").fontSize(10).fillColor(blue).text("POR EVENTO");
  const evCols: Col[] = [
    { w: 120, t: "Evento" }, { w: 50, t: "Fecha" }, { w: 75, t: "Lugar" },
    { w: 35, t: "Inv.", align: "right" }, { w: 42, t: "Demanda", align: "right" },
    { w: 45, t: "Con falta", align: "right" }, { w: 45, t: "Comprar", align: "right" },
    { w: 45, t: "Alquilar", align: "right" }, { w: 53, t: "Camión" },
  ];
  drawTable(doc, evCols, report.events.map((e) => ([
    { v: `#${e.orderNumber} ${e.eventName}` },
    { v: fmtDate(e.eventDate) },
    { v: e.location || "—" },
    { v: String(e.guests ?? "—") },
    { v: String(e.demand) },
    { v: String(e.faltantes), color: e.faltantes > 0 ? "#b91c1c" : "#222", bold: e.faltantes > 0 },
    { v: String(e.comprar), color: e.comprar > 0 ? "#b91c1c" : "#222", bold: e.comprar > 0 },
    { v: String(e.alquilar), color: e.alquilar > 0 ? "#c2410c" : "#222", bold: e.alquilar > 0 },
    { v: e.truck },
  ])));

  const conResumen = report.events.filter((e) => (e.resumen || []).length > 0);
  if (conResumen.length) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c").text("RESUMEN POR EVENTO — COMPRAR / ALQUILAR");
    for (const e of conResumen) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111").text(`${e.eventName} — ${fmtDate(e.eventDate)} (${e.comprar} comprar · ${e.alquilar} alquilar)`);
      doc.font("Helvetica").fontSize(8).fillColor("#374151").text(e.resumen.map((x) => `${x.action}: ${x.name} (necesita ${x.qty}, faltan ${x.shortfall})`).join(" · "));
      doc.moveDown(0.2);
    }
  }

  if (report.dates?.length) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(blue).text("RESUMEN POR FECHA");
    const dCols: Col[] = [
      { w: 70, t: "Fecha" }, { w: 45, t: "Eventos", align: "right" }, { w: 65, t: "Demanda", align: "right" },
      { w: 60, t: "Con falta", align: "right" }, { w: 55, t: "Comprar", align: "right" }, { w: 55, t: "Alquilar", align: "right" },
      { w: 182, t: "Resumen" },
    ];
    drawTable(doc, dCols, report.dates.map((d) => [
      { v: fmtDateOnly(d.date) },
      { v: String(d.orders) },
      { v: String(d.demand) },
      { v: String(d.faltantes), color: d.faltantes > 0 ? "#b91c1c" : "#222", bold: d.faltantes > 0 },
      { v: String(d.comprar) },
      { v: String(d.alquilar) },
      { v: (d.resumen || []).map((x) => `${x.action}: ${x.name} (faltan ${x.shortfall})`).join(" · ") || "—" },
    ]));
  }

  const weeks = report.weeks || [];
  const consolidated = report.consolidated || [];
  doc.moveDown(0.6);
  if (consolidated.length) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f766e").text("CONSOLIDADO — adquirir UNA sola vez (cubre todas las semanas)");
    const cCols: Col[] = [{ w: 180, t: "Equipo" }, { w: 44, t: "Cant.", align: "right" }, { w: 55, t: "Disponible", align: "right" }, { w: 58, t: "Reparación", align: "right" }, { w: 48, t: "Faltan", align: "right" }, { w: 85, t: "Semanas" }];
    drawTable(doc, cCols, consolidated.map((m) => ([
      { v: m.name }, { v: String(m.peak) }, { v: String(m.supply) }, { v: String(m.repair) }, { v: String(m.shortfall), color: "#b91c1c", bold: true }, { v: (m.weeks || []).join(", ") || "—" },
    ])));
    doc.moveDown(0.4);
  }
  for (const w of weeks) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#b91c1c").text(`RENTA / COMPRA — SEMANA ${fmtDay(w.start)} al ${fmtDay(w.end)} (${w.items.length})`);
    const rcCols: Col[] = [{ w: 190, t: "Equipo" }, { w: 46, t: "Cant.", align: "right" }, { w: 58, t: "Disponible", align: "right" }, { w: 58, t: "Reparación", align: "right" }, { w: 48, t: "Faltan", align: "right" }, { w: 65, t: "Acción" }];
    drawTable(doc, rcCols, w.items.map((m) => ([
      { v: m.name }, { v: String(m.peak) }, { v: String(m.supply) }, { v: String(m.repair) }, { v: String(m.shortfall), color: "#b91c1c", bold: true }, { v: actionLabel(m.action) },
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
export async function reportXlsx(report: CuadroReport | GeneralReport): Promise<Buffer> {
  if (report.kind === "cuadro") {
    const wb = XLSX.utils.book_new();
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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Live Productions GT";
  const BRAND = "1E40AF";
  const headFill = (hex: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + hex } });
  const thin = { style: "thin" as const, color: { argb: "FFD1D5DB" } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };
  const headerRow = (ws: any, row: number, labels: string[], fill = BRAND) => {
    labels.forEach((t, i) => {
      const c = ws.getCell(row, i + 1);
      c.value = t;
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      c.fill = headFill(fill);
      c.border = border;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    ws.getRow(row).height = 26;
  };
  const title = (ws: any, row: number, text: string, lastCol: number, fill = BRAND) => {
    ws.mergeCells(row, 1, row, lastCol);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    c.fill = headFill(fill);
    c.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(row).height = 26;
  };

  // ---------- RESUMEN ----------
  const rs = wb.addWorksheet("Resumen", { properties: { defaultRowHeight: 18 } });
  rs.columns = [11, 34, 14, 24, 10, 10, 10, 11, 12, 12, 12, 26, 60].map((w) => ({ width: w }));
  title(rs, 1, "REPORTE GENERAL DE CUADROS — Live Productions GT", 13);
  rs.mergeCells("A2:M2");
  rs.getCell("A2").value = `Generado: ${new Date(report.generatedAt).toLocaleString("es-GT", { timeZone: "America/Guatemala" })}${report.rangeLabel ? ` · ${report.rangeLabel}` : ""}`;
  rs.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  const kpis: [string, number][] = [
    ["Cuadros", report.totals.orders], ["Ítems", report.totals.items], ["Demanda (u)", report.totals.demand],
    ["Faltantes", report.totals.faltantes], ["Comprar", report.totals.comprar], ["Alquilar", report.totals.alquilar],
  ];
  kpis.forEach(([label, val], i) => {
    const lc = rs.getCell(4, i + 1); lc.value = label; lc.font = { bold: true, size: 8, color: { argb: "FF6B7280" } }; lc.fill = headFill("F3F4F6"); lc.border = border; lc.alignment = center;
    const vc = rs.getCell(5, i + 1); vc.value = val; vc.font = { bold: true, size: 13 }; vc.fill = headFill("F3F4F6"); vc.border = border; vc.alignment = center;
  });
  const evHeader = 7;
  rs.mergeCells(evHeader, 1, evHeader, 13);
  rs.getCell(evHeader, 1).value = "POR EVENTO — DEMANDA, COMPRAR / ALQUILAR";
  rs.getCell(evHeader, 1).font = { bold: true, size: 11, color: { argb: "FF" + BRAND } };
  rs.getRow(evHeader).height = 20;
  headerRow(rs, evHeader + 1, ["Cuadro", "Evento", "Fecha", "Lugar", "Invitados", "Ítems", "Demanda (u)", "Ítems c/falta", "Comprar", "Alquilar", "Cobertura %", "Camión", "Resumen (comprar / alquilar)"]);
  let r = evHeader + 2;
  for (const e of report.events) {
    const vals: any[] = [
      `#${e.orderNumber}`, e.eventName, fmtDate(e.eventDate), e.location || "", e.guests || "",
      e.itemCount, e.demand, e.faltantes, e.comprar, e.alquilar, e.coverage, e.truck,
      e.resumen.map((x) => `${x.action}: ${x.name} (necesita ${x.qty}, faltan ${x.shortfall})`).join(" · "),
    ];
    vals.forEach((v, i) => {
      const c = rs.getCell(r, i + 1); c.value = v; c.border = border; c.font = { size: 9 };
      c.alignment = i === 12 ? { vertical: "middle", wrapText: true } : i >= 4 && i <= 10 ? center : { vertical: "middle", wrapText: true };
    });
    if (e.faltantes > 0) rs.getCell(r, 8).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
    if (e.comprar > 0) rs.getCell(r, 9).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
    if (e.alquilar > 0) rs.getCell(r, 10).font = { bold: true, color: { argb: "FFC2410C" }, size: 9 };
    r++;
  }
  rs.autoFilter = { from: { row: evHeader + 1, column: 1 }, to: { row: r - 1, column: 13 } };
  rs.views = [{ state: "frozen", ySplit: evHeader + 1 }];

  // ---------- NECESIDAD POR FECHA (un ítem por día, suma de cuadros) ----------
  const nf = wb.addWorksheet("Necesidad por fecha", { properties: { defaultRowHeight: 17 } });
  nf.columns = [12, 38, 17, 10, 11, 11, 10, 12, 22].map((w) => ({ width: w }));
  title(nf, 1, "NECESIDAD POR FECHA — SUMA DE TODOS LOS CUADROS DEL DÍA", 9);
  nf.mergeCells("A2:I2");
  nf.getCell("A2").value = "Cada ítem aparece una sola vez por fecha, sumando todos los cuadros de ese día. Faltante = Necesito − Disponible. Para compra/alquiler consolidada ver Renta-Compra.";
  nf.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  headerRow(nf, 3, ["Fecha", "Equipo", "Sección", "Necesito", "Disponible", "Reparación", "Faltante", "Acción", "Cuadros"]);
  let rn = 4;
  for (const d of report.dateDetail) {
    const vals: any[] = [fmtDateOnly(d.date), d.name, d.section || "", d.need, d.supply, d.repair, d.shortfall, d.action, d.orders];
    vals.forEach((v, i) => {
      const c = nf.getCell(rn, i + 1); c.value = v; c.border = border; c.font = { size: 9 };
      c.alignment = i >= 3 && i <= 6 ? center : { vertical: "middle", wrapText: true };
    });
    if (d.shortfall > 0) nf.getCell(rn, 7).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
    if (d.action === "Comprar") nf.getCell(rn, 8).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
    if (d.action === "Alquilar") nf.getCell(rn, 8).font = { bold: true, color: { argb: "FFC2410C" }, size: 9 };
    rn++;
  }
  nf.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, rn - 1), column: 9 } };
  nf.views = [{ state: "frozen", ySplit: 3 }];

  // ---------- RESUMEN POR FECHA ----------
  const df = wb.addWorksheet("Por fecha", { properties: { defaultRowHeight: 18 } });
  df.columns = [14, 10, 14, 14, 10, 10, 60].map((w) => ({ width: w }));
  title(df, 1, "RESUMEN POR FECHA — DEMANDA Y COMPRAR / ALQUILAR", 7);
  df.mergeCells("A2:G2");
  df.getCell("A2").value = "Demanda = suma de los eventos del día · Con faltante = ítems que no cubre el inventario.";
  df.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  headerRow(df, 3, ["Fecha", "Eventos", "Demanda (u)", "Ítems con faltante", "Comprar", "Alquilar", "Resumen"]);
  let rd = 4;
  for (const d of report.dates) {
    const vals: any[] = [fmtDateOnly(d.date), d.orders, d.demand, d.faltantes, d.comprar, d.alquilar, d.resumen.map((x) => `${x.action}: ${x.name} (faltan ${x.shortfall})`).join(" · ")];
    vals.forEach((v, i) => {
      const c = df.getCell(rd, i + 1); c.value = v; c.border = border; c.font = { size: 9 };
      c.alignment = i >= 1 && i <= 5 ? center : { vertical: "middle", wrapText: true };
    });
    if (d.faltantes > 0) df.getCell(rd, 4).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
    rd++;
  }
  df.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, rd - 1), column: 7 } };
  df.views = [{ state: "frozen", ySplit: 3 }];

  // ---------- RESUMEN DE EQUIPO ----------
  const re = wb.addWorksheet("Resumen de Equipo", { properties: { defaultRowHeight: 17 } });
  const evCols = report.events.map((e) => `#${e.orderNumber}`);
  re.columns = [{ width: 40 }, { width: 16 }, ...evCols.map(() => ({ width: 9 })), { width: 10 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 12 }, { width: 11 }];
  title(re, 1, "RESUMEN DE EQUIPO (por evento)", re.columns.length);
  headerRow(re, 2, ["Equipo", "Sección", ...evCols, "Total", "Pico", "Inventario", "Reparación", "Disponible", "Faltante", "Saldo", "Utilización %", "Acción"]);
  const faltanteCol = report.events.length + 8;
  let lastSec = "";
  r = 3;
  for (const m of report.items) {
    const sec = (m.section || "OTRO").toUpperCase();
    if (sec !== lastSec) {
      re.mergeCells(r, 1, r, re.columns.length);
      const sc = re.getCell(r, 1);
      sc.value = sec; sc.font = { bold: true, size: 9, color: { argb: "FF" + BRAND } }; sc.fill = headFill("EEF2FF"); sc.border = border; sc.alignment = { indent: 1, vertical: "middle" };
      re.getRow(r).height = 18;
      r++; lastSec = sec;
    }
    const available = m.stock;
    const utilization = m.stock > 0 ? Math.round((m.peak / m.stock) * 100) : 0;
    const vals: any[] = [m.name, sec, ...report.events.map((e) => m.perEvent[String(e.orderNumber)] || ""), m.total, m.peak, m.stock, m.repair, available, m.faltante, m.saldo, `${utilization}%`, m.faltante > 0 ? m.action : "—"];
    vals.forEach((v, i) => {
      const c = re.getCell(r, i + 1); c.value = v; c.border = border; c.font = { size: 9 };
      c.alignment = i >= 2 ? center : { vertical: "middle", wrapText: true };
    });
    if (m.faltante > 0) re.getCell(r, faltanteCol).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
    r++;
  }
  re.autoFilter = { from: { row: 2, column: 1 }, to: { row: r - 1, column: re.columns.length } };
  re.views = [{ state: "frozen", ySplit: 2, xSplit: 2 }];

  // ---------- RENTA / COMPRA ----------
  const rc = wb.addWorksheet("Renta-Compra", { properties: { defaultRowHeight: 17 } });
  rc.columns = [{ width: 42 }, { width: 16 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 10 }, { width: 11 }, { width: 30 }];
  title(rc, 1, "RESUMEN DE RENTA / COMPRA — POR SEMANA", 8);
  rc.mergeCells("A2:H2");
  rc.getCell("A2").value = "Solo equipos que no alcanzan en inventario. Reparación = cantidad en reparación según el sistema.";
  rc.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  const consolidated = report.consolidated || [];
  const weeks = report.weeks || [];
  const rcLabels = ["Equipo", "Sección", "Cantidad", "Disponible", "Reparación", "Faltan", "Acción", "Semanas / Cuadros"];
  r = 4;
  if (consolidated.length) {
    rc.mergeCells(r, 1, r, 8);
    const h = rc.getCell(r, 1); h.value = "CONSOLIDADO — adquirir UNA sola vez (cubre todas las semanas)"; h.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } }; h.fill = headFill("0F766E"); h.alignment = { indent: 1, vertical: "middle" }; rc.getRow(r).height = 20;
    r++;
    headerRow(rc, r, rcLabels, "0F766E");
    r++;
    for (const m of consolidated) {
      const vals: any[] = [m.name, m.section || "", m.peak, m.supply, m.repair, m.shortfall, actionLabel(m.action), (m.weeks || []).join(", ")];
      vals.forEach((v, i) => { const c = rc.getCell(r, i + 1); c.value = v; c.border = border; c.font = { size: 9 }; c.alignment = i >= 2 && i <= 6 ? center : { vertical: "middle", wrapText: true }; });
      rc.getCell(r, 6).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
      r++;
    }
    r++;
  }
  for (const w of weeks) {
    rc.mergeCells(r, 1, r, 8);
    const h = rc.getCell(r, 1); h.value = `SEMANA ${fmtDay(w.start)} al ${fmtDay(w.end)}`; h.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } }; h.fill = headFill(BRAND); h.alignment = { indent: 1, vertical: "middle" }; rc.getRow(r).height = 20;
    r++;
    headerRow(rc, r, rcLabels);
    r++;
    for (const m of w.items) {
      const vals: any[] = [m.name, m.section || "", m.peak, m.supply, m.repair, m.shortfall, actionLabel(m.action), m.events.map((e) => `#${e.orderNumber} ${e.eventName}`).join(", ")];
      vals.forEach((v, i) => { const c = rc.getCell(r, i + 1); c.value = v; c.border = border; c.font = { size: 9 }; c.alignment = i >= 2 && i <= 6 ? center : { vertical: "middle", wrapText: true }; });
      rc.getCell(r, 6).font = { bold: true, color: { argb: "FFB91C1C" }, size: 9 };
      r++;
    }
    r++;
  }
  if (!consolidated.length && !weeks.length) {
    rc.mergeCells(r, 1, r, 8);
    rc.getCell(r, 1).value = "Sin faltantes en las fechas futuras.";
    rc.getCell(r, 1).font = { italic: true, size: 9, color: { argb: "FF15803D" } };
  }

  // ---------- STOCK POR BODEGA ----------
  const st = wb.addWorksheet("Stock por bodega", { properties: { defaultRowHeight: 18 } });
  st.columns = [{ width: 26 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 13 }];
  title(st, 1, "STOCK POR BODEGA", 5);
  headerRow(st, 2, ["Bodega", "Ítems", "Unidades", "Disponibles", "En reparación"]);
  r = 3;
  for (const w of report.warehouseStock) {
    [w.warehouse, w.items, w.units, w.available, w.repair].forEach((v, i) => {
      const c = st.getCell(r, i + 1); c.value = v as any; c.border = border; c.font = { size: 9 };
      c.alignment = i >= 1 ? center : { vertical: "middle" };
    });
    r++;
  }
  st.autoFilter = { from: { row: 2, column: 1 }, to: { row: r - 1, column: 5 } };

  // ---------- DETALLE ----------
  const det = wb.addWorksheet("Detalle", { properties: { defaultRowHeight: 17 } });
  det.columns = [{ width: 11 }, { width: 32 }, { width: 13 }, { width: 40 }, { width: 16 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }];
  title(det, 1, "DETALLE POR EVENTO", 9);
  headerRow(det, 2, ["Cuadro", "Evento", "Fecha", "Ítem", "Sección", "Cantidad", "Inventario", "Reparación", "Disponible"]);
  r = 3;
  for (const m of report.items) {
    for (const e of report.events) {
      const q = m.perEvent[String(e.orderNumber)];
      if (!q) continue;
      const available = Math.max(0, m.stock - m.repair);
      const vals: any[] = [`#${e.orderNumber}`, e.eventName, fmtDate(e.eventDate), m.name, m.section || "", q, m.stock, m.repair, available];
      vals.forEach((v, i) => {
        const c = det.getCell(r, i + 1); c.value = v; c.border = border; c.font = { size: 9 };
        c.alignment = i >= 5 ? center : { vertical: "middle", wrapText: true };
      });
      r++;
    }
  }
  det.autoFilter = { from: { row: 2, column: 1 }, to: { row: r - 1, column: 9 } };
  det.views = [{ state: "frozen", ySplit: 2 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
