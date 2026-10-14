import { prisma } from "@/lib/prisma";
import { analyzeCuadro } from "@/lib/inventory-availability";
import { findSimilarGroups } from "@/lib/inventory";

export interface UpcomingCuadroInsight {
  orderId: string;
  orderNumber: number;
  eventName: string;
  eventDate: Date | null;
  missingCount: number;
  missing: { name: string; needed: number; available: number; shortfall: number; reusable: boolean }[];
  truck: { type: string; reason: string };
}

// Proyección: analiza los cuadros con fecha en los próximos N días.
export async function getUpcomingCuadroInsights(days = 14): Promise<UpcomingCuadroInsight[]> {
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["BORRADOR", "PREPARANDO", "LISTO", "EN_EVENTO"] },
      eventDate: { gte: now, lte: until },
    },
    orderBy: { eventDate: "asc" },
    select: { id: true },
  });

  const out: UpcomingCuadroInsight[] = [];
  for (const o of orders) {
    const a = await analyzeCuadro(o.id);
    if (!a) continue;
    out.push({
      orderId: a.orderId,
      orderNumber: a.orderNumber,
      eventName: a.eventName,
      eventDate: a.eventDate,
      missingCount: a.missing.length,
      missing: a.missing.map((m) => ({
        name: m.name,
        needed: m.needed,
        available: m.available,
        shortfall: m.shortfall,
        reusable: (m.reusableFrom?.length || 0) > 0,
      })),
      truck: a.truck,
    });
  }
  return out;
}

export async function getInventoryHealth() {
  const [repair, damaged, lost, zero] = await Promise.all([
    prisma.inventoryItem.findMany({ where: { status: "EN_REPARACION" }, select: { name: true, quantity: true } }),
    prisma.inventoryItem.findMany({ where: { status: "DANADO" }, select: { name: true, quantity: true } }),
    prisma.inventoryItem.findMany({ where: { status: "PERDIDO" }, select: { name: true, quantity: true } }),
    prisma.inventoryItem.findMany({ where: { quantity: { lte: 0 } }, select: { name: true } }),
  ]);
  return { repair, damaged, lost, zero };
}

const fmtDate = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "short", day: "numeric", month: "short" }) : "s/f";

// Texto de proyección para LUNA (briefing y respuestas).
export async function buildLogisticsSummary(days = 14): Promise<string> {
  const [insights, health] = await Promise.all([getUpcomingCuadroInsights(days), getInventoryHealth()]);
  const lines: string[] = [];

  if (insights.length === 0) {
    lines.push(`Sin cuadros con fecha en los próximos ${days} días.`);
  } else {
    lines.push(`📦 *Proyección de eventos (${insights.length})*`);
    for (const c of insights) {
      if (c.missingCount === 0) {
        lines.push(`• ${fmtDate(c.eventDate)} — *${c.eventName}*: ✅ alcanza`);
      } else {
        const det = c.missing.map((m) => `${m.name} (faltan ${m.shortfall}${m.reusable ? ", ♻️ reutilizable" : ", comprar/alquilar"})`).join("; ");
        lines.push(`• ${fmtDate(c.eventDate)} — *${c.eventName}*: ⚠️ faltan ${c.missingCount} → ${det}`);
      }
    }
  }

  if (health.repair.length || health.damaged.length || health.lost.length) {
    lines.push(`\n🔧 *Inventario en problema:* ${health.repair.length} en reparación, ${health.damaged.length} dañados, ${health.lost.length} perdidos.`);
  }
  if (health.zero.length) {
    lines.push(`🛒 *Por comprar (0 unidades):* ${health.zero.map((z) => z.name).join(", ")}.`);
  }
  return lines.join("\n");
}

// Stock resumido por bodega.
export async function buildWarehouseSummary(): Promise<string> {
  const items = await prisma.inventoryItem.findMany({ select: { quantity: true, warehouse: true, status: true } });
  const map = new Map<string, { items: number; units: number; available: number; repair: number }>();
  for (const it of items) {
    const w = it.warehouse || "Sin bodega";
    const cur = map.get(w) || { items: 0, units: 0, available: 0, repair: 0 };
    const rep = it.status === "EN_REPARACION" || it.status === "DANADO" || it.status === "PERDIDO";
    cur.items++;
    cur.units += it.quantity;
    if (rep) cur.repair += it.quantity; else cur.available += it.quantity;
    map.set(w, cur);
  }
  const lines = Array.from(map.entries())
    .sort((a, b) => b[1].units - a[1].units)
    .map(([w, c]) => `• *${w}*: ${c.units} unidades — ${c.items} ítems · ✅ ${c.available} disp · 🔧 ${c.repair}`);
  return `🏢 *Stock por bodega*\n${lines.join("\n")}`;
}

export async function buildMovementsSummary(limit = 12): Promise<string> {
  const mv = await prisma.inventoryMovement.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  if (!mv.length) return "🚚 Sin movimientos registrados todavía.";
  return `🚚 *Últimos movimientos*\n${mv
    .map((m) => `• ${m.type} *${m.itemName}*${m.toWarehouse ? ` (${m.fromWarehouse || "—"} → ${m.toWarehouse})` : ""} · ${m.quantity}`)
    .join("\n")}`;
}

export async function buildDuplicatesSummary(): Promise<string> {
  const items = await prisma.inventoryItem.findMany({ select: { id: true, name: true, quantity: true, section: true } });
  const groups = findSimilarGroups(items, 0.6);
  if (!groups.length) return "✅ No hay descripciones duplicadas ni desalineadas.";
  const lines = groups.slice(0, 8).map((g, i) => `${i + 1}. ${g.length} parecidos: ${g.map((x) => `"${x.name}"`).join(" · ")}`);
  return `🔎 *Descripciones a alinear (${groups.length} grupos)*\n${lines.join("\n")}\n\n_Revisalos en Inventario → 🔎 Alinear._`;
}
