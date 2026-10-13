import { prisma } from "@/lib/prisma";
import { analyzeCuadro } from "@/lib/inventory-availability";

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
