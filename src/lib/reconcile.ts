import { prisma } from "@/lib/prisma";

export const normName = (s: string) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,()"']/g, "");
const tokens = (s: string) => new Set(normName(s).split(" ").filter((w) => w.length > 1));
export const numbersOf = (s: string) => (normName(s).match(/\d+(\.\d+)?/g) || []).join(",");

export function nameScore(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface ReconcileSuggestion {
  id: string; name: string; section: string | null; status: string; quantity: number; score: number;
}
export interface ReconcileRow {
  key: string;
  name: string;
  category: string;
  quantity: number;
  orders: string[];
  orderItemIds: string[];
  status: "missing" | "similar" | "different";
  linked: { id: string; name: string }[];
  suggestions: ReconcileSuggestion[];
}
export interface ReconcileResult {
  discrepancies: ReconcileRow[];
  counts: { exact: number; missing: number; similar: number; different: number; totalOrderItems: number };
}

// Compara ítems de cuadros vs inventario y devuelve las discrepancias.
export async function reconcileOrdersWithInventory(): Promise<ReconcileResult> {
  const [orders, inventory] = await Promise.all([
    prisma.order.findMany({
      where: { status: { not: "CANCELADO" } },
      select: {
        orderNumber: true,
        eventName: true,
        status: true,
        items: { select: { id: true, name: true, category: true, quantity: true, inventoryItemId: true } },
      },
    }),
    prisma.inventoryItem.findMany({ select: { id: true, name: true, section: true, status: true, quantity: true } }),
  ]);

  const byNorm = new Map<string, typeof inventory[number]>();
  for (const inv of inventory) {
    const k = normName(inv.name);
    if (!byNorm.has(k) || inv.status === "DISPONIBLE") byNorm.set(k, inv);
  }
  const invById = new Map(inventory.map((i) => [i.id, i]));

  type Grp = { key: string; name: string; category: string; quantity: number; orders: string[]; orderItemIds: string[]; linkedIds: Set<string> };
  const groups = new Map<string, Grp>();
  for (const o of orders) {
    for (const it of o.items) {
      const k = normName(it.name);
      if (!k) continue;
      let g = groups.get(k);
      if (!g) {
        g = { key: k, name: it.name.trim(), category: it.category || "AUDIO", quantity: 0, orders: [], orderItemIds: [], linkedIds: new Set() };
        groups.set(k, g);
      }
      g.quantity += it.quantity;
      g.orderItemIds.push(it.id);
      if (it.inventoryItemId) g.linkedIds.add(it.inventoryItemId);
      const label = `#${o.orderNumber} ${o.eventName}`;
      if (!g.orders.includes(label)) g.orders.push(label);
    }
  }

  let exact = 0;
  const discrepancies: ReconcileRow[] = [];
  for (const g of groups.values()) {
    const exactInv = byNorm.get(g.key);
    const linked = Array.from(g.linkedIds).map((id) => invById.get(id)).filter(Boolean);
    const linkedDifferent = linked.filter((i) => normName(i!.name) !== g.key);

    if (exactInv && linkedDifferent.length === 0) { exact++; continue; }

    let status: ReconcileRow["status"] = "missing";
    let suggestions: ReconcileSuggestion[] = [];

    if (linkedDifferent.length > 0) {
      status = "different";
      suggestions = linkedDifferent.map((i) => ({ id: i!.id, name: i!.name, section: i!.section, status: i!.status, quantity: i!.quantity, score: 1 }));
    } else {
      const scored = inventory
        .map((i) => ({ i, s: nameScore(g.name, i.name) }))
        .filter((x) => x.s >= 0.6 && numbersOf(g.name) === numbersOf(x.i.name))
        .sort((a, b) => b.s - a.s)
        .slice(0, 3)
        .map((x) => ({ id: x.i.id, name: x.i.name, section: x.i.section, status: x.i.status, quantity: x.i.quantity, score: Math.round(x.s * 100) / 100 }));
      suggestions = scored;
      status = scored.length > 0 ? "similar" : "missing";
    }

    discrepancies.push({
      key: g.key, name: g.name, category: g.category, quantity: g.quantity, orders: g.orders,
      orderItemIds: g.orderItemIds, status,
      linked: linkedDifferent.map((i) => ({ id: i!.id, name: i!.name })),
      suggestions,
    });
  }

  discrepancies.sort((a, b) => (a.status === "missing" ? -1 : b.status === "missing" ? 1 : b.quantity - a.quantity));
  return {
    discrepancies,
    counts: {
      exact,
      missing: discrepancies.filter((d) => d.status === "missing").length,
      similar: discrepancies.filter((d) => d.status === "similar").length,
      different: discrepancies.filter((d) => d.status === "different").length,
      totalOrderItems: Array.from(groups.values()).reduce((s, g) => s + g.quantity, 0),
    },
  };
}
