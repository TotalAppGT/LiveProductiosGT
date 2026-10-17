import { prisma } from "@/lib/prisma";
import { normName } from "@/lib/reconcile";

// Calcula faltantes por item para un conjunto de cuadros, comparando el pico
// simultáneo de demanda contra el inventario disponible.
export interface NeedItem {
  key: string;
  name: string;
  category: string;
  supply: number;
  peak: number;
  shortfall: number;
  peakDate: Date | null;
  events: { orderNumber: number; eventName: string; date: Date | null; needed: number }[];
  suggestedAction: "COMPRAR" | "RENTAR" | "CONSULTAR";
  action: string;
  comment: string;
  reviewed: boolean;
  weeks?: string[]; // semanas que cubre (listado consolidado)
}

export interface NeedWeek {
  start: Date;
  end: Date;
  label: string;
  items: NeedItem[];
}

const BUY_CATEGORIES = ["CONSUMIBLE", "CABLEADO", "HERRAMIENTA"];

type OrderRow = {
  orderNumber: number;
  eventName: string;
  eventDate: Date | null;
  eventEndDate: Date | null;
  items: { name: string; category: string; quantity: number }[];
};

async function loadContext(days: number | "all") {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = days === "all" ? null : new Date(start.getTime() + (days - 1) * 86400000);

  const [orders, inv, reviews] = await Promise.all([
    prisma.order.findMany({
      where: { status: { not: "CANCELADO" }, eventDate: { not: null, gte: start, ...(windowEnd ? { lte: windowEnd } : {}) } },
      select: { orderNumber: true, eventName: true, eventDate: true, eventEndDate: true, items: { select: { name: true, category: true, quantity: true } } },
    }),
    prisma.inventoryItem.findMany({ select: { name: true, category: true, quantity: true, status: true } }),
    prisma.inventoryNeedReview.findMany(),
  ]);

  const supply = new Map<string, number>();
  const catMap = new Map<string, string>();
  for (const i of inv) {
    const k = normName(i.name);
    if (!catMap.has(k)) catMap.set(k, i.category);
    if (i.status === "DISPONIBLE") supply.set(k, (supply.get(k) || 0) + i.quantity);
  }
  return { orders: orders as OrderRow[], supply, catMap, reviews };
}

function computeForOrders(
  orders: OrderRow[],
  supply: Map<string, number>,
  catMap: Map<string, string>,
  reviews: { itemKey: string; action: string; comment: string | null }[]
): NeedItem[] {
  type Rec = { key: string; name: string; category: string; intervals: { s: number; e: number; q: number }[]; events: NeedItem["events"] };
  const items = new Map<string, Rec>();
  for (const o of orders) {
    if (!o.eventDate) continue;
    const s = new Date(o.eventDate).getTime();
    const e = new Date(o.eventEndDate || o.eventDate).getTime();
    for (const it of o.items) {
      const k = normName(it.name);
      if (!k) continue;
      let rec = items.get(k);
      if (!rec) {
        rec = { key: k, name: it.name, category: catMap.get(k) || it.category || "OTRO", intervals: [], events: [] };
        items.set(k, rec);
      }
      rec.intervals.push({ s, e, q: it.quantity });
      rec.events.push({ orderNumber: o.orderNumber, eventName: o.eventName, date: o.eventDate, needed: it.quantity });
    }
  }

  const out: NeedItem[] = [];
  for (const rec of items.values()) {
    const s0 = Math.min(...rec.intervals.map((i) => i.s));
    const e0 = Math.max(...rec.intervals.map((i) => i.e));
    let peak = 0;
    let peakDay: number | null = null;
    for (let d = s0; d <= e0; d += 86400000) {
      let sum = 0;
      for (const iv of rec.intervals) if (iv.s <= d && d <= iv.e) sum += iv.q;
      if (sum > peak) { peak = sum; peakDay = d; }
    }
    const sup = supply.get(rec.key) || 0;
    const shortfall = Math.max(0, peak - sup);
    if (shortfall <= 0) continue;
    const inInventory = supply.has(rec.key) || catMap.has(rec.key);
    const cat = String(rec.category || "OTRO").toUpperCase();
    let suggested: NeedItem["suggestedAction"] = "RENTAR";
    if (!inInventory) suggested = "CONSULTAR";
    else if (BUY_CATEGORIES.includes(cat)) suggested = "COMPRAR";
    out.push({ key: rec.key, name: rec.name, category: rec.category, supply: sup, peak, shortfall, peakDate: peakDay ? new Date(peakDay) : null, events: rec.events, suggestedAction: suggested, action: suggested, comment: "", reviewed: false });
  }

  const rv = new Map(reviews.map((r) => [r.itemKey, r]));
  for (const it of out) {
    const r = rv.get(it.key);
    if (r) { it.action = r.action; it.comment = r.comment || ""; it.reviewed = true; }
  }
  out.sort((a, b) => b.shortfall - a.shortfall);
  return out;
}

// Lista plana (todos los cuadros del periodo) — usada por el cotejo/revisión.
export async function computeNeeds(days: number | "all"): Promise<{ days: number | "all"; items: NeedItem[] }> {
  const { orders, supply, catMap, reviews } = await loadContext(days);
  return { days, items: computeForOrders(orders, supply, catMap, reviews) };
}

function weekStartOf(d: Date): number {
  const x = new Date(d);
  const day = x.getDay(); // 0 domingo
  const diff = (day + 6) % 7; // lunes = 0
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

const fmtShort = (d: Date) => d.toLocaleDateString("es-GT", { day: "2-digit", month: "short" });
const fmtLong = (d: Date) => d.toLocaleDateString("es-GT", { weekday: "short", day: "numeric", month: "short" });

// Faltantes SEPARADOS POR SEMANA (lunes a domingo) + CONSOLIDADO.
// El consolidado toma el PICO de todo el periodo: si un ítem falta en varias
// semanas, se adquiere UNA sola vez la cantidad máxima y se reutiliza.
export async function computeNeedsByWeek(days: number | "all"): Promise<{ days: number | "all"; weeks: NeedWeek[]; consolidated: NeedItem[] }> {
  const { orders, supply, catMap, reviews } = await loadContext(days);
  const map = new Map<number, OrderRow[]>();
  for (const o of orders) {
    if (!o.eventDate) continue;
    const ws = weekStartOf(new Date(o.eventDate));
    if (!map.has(ws)) map.set(ws, []);
    map.get(ws)!.push(o);
  }
  const weeks: NeedWeek[] = [];
  for (const ws of Array.from(map.keys()).sort((a, b) => a - b)) {
    const start = new Date(ws);
    const end = new Date(ws + 6 * 86400000);
    const items = computeForOrders(map.get(ws)!, supply, catMap, reviews);
    if (items.length === 0) continue; // semanas sin faltantes no se listan
    weeks.push({ start, end, label: `Semana ${fmtLong(start)} al ${fmtLong(end)}`, items });
  }

  // Consolidado: pico de todo el periodo (una sola adquisición) + semanas que cubre.
  const consolidated = computeForOrders(orders, supply, catMap, reviews);
  const labelsByKey = new Map<string, string[]>();
  for (const w of weeks) {
    for (const it of w.items) {
      if (!labelsByKey.has(it.key)) labelsByKey.set(it.key, []);
      labelsByKey.get(it.key)!.push(fmtShort(w.start));
    }
  }
  for (const it of consolidated) it.weeks = labelsByKey.get(it.key) || [];

  return { days, weeks, consolidated };
}
