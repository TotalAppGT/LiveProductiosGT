import { prisma } from "@/lib/prisma";

// Estados de cuadro que "comprometen" inventario (fuera o por salir).
const ACTIVE_ORDER_STATUSES = ["PREPARANDO", "LISTO", "EN_EVENTO"];

export interface AvailabilityRow {
  id: string;
  name: string;
  section: string | null;
  category: string;
  total: number;
  committed: number; // en otros cuadros activos que se solapan con el rango
  repair: number;    // en reparación / dañado / perdido
  available: number; // total - committed - repair
}

function overlap(
  o: { eventDate: Date | null; eventEndDate: Date | null },
  start?: Date | null,
  end?: Date | null
): boolean {
  if (!start || !end) return true; // sin fechas: cuenta todo lo activo
  const os = o.eventDate ? new Date(o.eventDate).getTime() : null;
  const oe = o.eventEndDate ? new Date(o.eventEndDate).getTime() : os;
  if (os === null) return true;
  return os <= end.getTime() && (oe ?? os) >= start.getTime();
}

// Disponibilidad por ítem para un rango de fechas (si no hay fechas, cuenta todo lo activo).
export async function computeAvailability(
  start?: Date | null,
  end?: Date | null,
  excludeOrderId?: string
): Promise<AvailabilityRow[]> {
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, name: true, section: true, category: true, quantity: true, status: true },
  });

  const orders = await prisma.order.findMany({
    where: { status: { in: ACTIVE_ORDER_STATUSES }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
    select: { eventDate: true, eventEndDate: true, items: { select: { inventoryItemId: true, quantity: true } } },
  });

  const committed = new Map<string, number>();
  for (const o of orders) {
    if (!overlap(o, start, end)) continue;
    for (const it of o.items) {
      if (it.inventoryItemId) committed.set(it.inventoryItemId, (committed.get(it.inventoryItemId) || 0) + it.quantity);
    }
  }

  return items.map((i) => {
    const repair = i.status === "EN_REPARACION" || i.status === "DANADO" || i.status === "PERDIDO" ? i.quantity : 0;
    const c = committed.get(i.id) || 0;
    return {
      id: i.id,
      name: i.name,
      section: i.section,
      category: i.category,
      total: i.quantity,
      committed: c,
      repair,
      available: Math.max(0, i.quantity - c - repair),
    };
  });
}

export interface CuadroAnalysisItem {
  name: string;
  section: string | null;
  needed: number;
  total: number;
  committed: number;
  available: number;
  shortfall: number;
  reusableFrom?: { orderNumber: number; eventName: string; date: Date | null }[];
}

export interface CuadroAnalysis {
  orderId: string;
  orderNumber: number;
  eventName: string;
  eventDate: Date | null;
  items: CuadroAnalysisItem[];
  ok: CuadroAnalysisItem[];
  missing: CuadroAnalysisItem[];
  reusable: CuadroAnalysisItem[];
  truck: { type: string; reason: string };
  extras: string[];
}

const HEAVY_SECTIONS = ["ESTRUCTURA LUCES", "ESTRUCTURA LUCES PEQUEÑA", "ESTRUCTURA DJ", "TARIMA Y PISTA"];

function recommendTruck(sections: Set<string>, totalUnits: number): { type: string; reason: string } {
  const heavy = HEAVY_SECTIONS.some((s) => sections.has(s));
  const hasAudio = sections.has("AUDIO") || sections.has("CONSOLAS") || sections.has("MICROFONIA");
  const hasIlum = sections.has("ILUMINACION");
  if (heavy) return { type: "Camión (3.5–5 toneladas)", reason: "Llevás estructura/tarima: volumen y peso alto." };
  if (hasAudio && hasIlum && totalUnits > 40) return { type: "Camión o panel grande", reason: "Audio + iluminación con volumen considerable." };
  if (totalUnits > 15) return { type: "Panel", reason: "Volumen medio de equipo." };
  return { type: "Pickup / van", reason: "Cuadro liviano." };
}

const EXTRA_RULES: { test: (s: Set<string>) => boolean; suggest: string[] }[] = [
  { test: (s) => s.has("AUDIO") || s.has("CONSOLAS") || s.has("MICROFONIA"), suggest: ["Cable XLR", "Extensión", "Cuadro de corriente", "Cable power spicon"] },
  { test: (s) => s.has("ILUMINACION"), suggest: ["Clamp para luces", "Base de clamp", "Cable power spicon"] },
  { test: (s) => HEAVY_SECTIONS.some((h) => s.has(h)), suggest: ["Pin", "Chiche", "Tensores", "Eslingas"] },
  { test: (s) => s.has("TARIMA Y PISTA"), suggest: ["Trabesaño", "Esquinero", "Caja de Calzas"] },
  { test: () => true, suggest: ["Extintor", "Bolsa de agua pura", "Duct tape", "Cinta de aislar Electrica PVC", "Caja de Herramienta"] },
];

function recommendExtras(sections: Set<string>, itemNames: Set<string>): string[] {
  const out = new Set<string>();
  for (const rule of EXTRA_RULES) {
    if (!rule.test(sections)) continue;
    for (const s of rule.suggest) {
      if (!itemNames.has(s.toLowerCase())) out.add(s);
    }
  }
  return Array.from(out);
}

// Analiza un cuadro: necesidad vs disponibilidad en las fechas del evento,
// faltantes (comprar/alquilar), trasiego (reutilizar) y recomendaciones.
export async function analyzeCuadro(orderId: string): Promise<CuadroAnalysis | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) return null;

  const start = order.eventDate;
  const end = order.eventEndDate || order.eventDate;
  const avail = await computeAvailability(start, end, orderId);
  const byId = new Map(avail.map((a) => [a.id, a]));
  const byName = new Map(avail.map((a) => [a.name.toLowerCase(), a]));

  const sections = new Set<string>();
  const itemNames = new Set<string>();
  let totalUnits = 0;

  const items: CuadroAnalysisItem[] = order.items.map((it) => {
    const a = (it.inventoryItemId && byId.get(it.inventoryItemId)) || byName.get(it.name.toLowerCase());
    const total = a?.total ?? 0;
    const committed = a?.committed ?? 0;
    const available = a?.available ?? 0;
    const shortfall = Math.max(0, it.quantity - available);
    if (a?.section) sections.add(a.section.toUpperCase());
    itemNames.add(it.name.toLowerCase());
    totalUnits += it.quantity;
    return { name: it.name, section: a?.section ?? null, needed: it.quantity, total, committed, available, shortfall };
  });

  // Trasiego: para los faltantes, ver cuadros activos que TERMINAN antes de que empiece este evento.
  if (start) {
    const others = await prisma.order.findMany({
      where: { status: { in: ACTIVE_ORDER_STATUSES }, id: { not: orderId } },
      select: {
        orderNumber: true, eventName: true, eventDate: true, eventEndDate: true,
        items: { select: { name: true } },
      },
    });
    for (const ci of items) {
      if (ci.shortfall <= 0) continue;
      const froms = others.filter((o) => {
        const oe = o.eventEndDate || o.eventDate;
        if (!oe) return false;
        return new Date(oe).getTime() < start.getTime();
      }).filter((o) => o.items.some((it) => it.name.toLowerCase() === ci.name.toLowerCase()));
      if (froms.length) {
        ci.reusableFrom = froms.map((o) => ({ orderNumber: o.orderNumber, eventName: o.eventName, date: o.eventEndDate || o.eventDate }));
      }
    }
  }

  const missing = items.filter((i) => i.shortfall > 0);
  const reusable = items.filter((i) => i.shortfall > 0 && (i.reusableFrom?.length || 0) > 0);
  const ok = items.filter((i) => i.shortfall <= 0);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    eventName: order.eventName,
    eventDate: order.eventDate,
    items,
    ok,
    missing,
    reusable,
    truck: recommendTruck(sections, totalUnits),
    extras: recommendExtras(sections, itemNames),
  };
}
