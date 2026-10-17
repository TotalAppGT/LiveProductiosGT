import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

const norm = (s: string) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,()"']/g, "");
const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1));
const numbers = (s: string) => (norm(s).match(/\d+(\.\d+)?/g) || []).join(",");

function score(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Coteja los ítems de los CUADROS contra el INVENTARIO.
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const [orders, inventory] = await Promise.all([
      prisma.order.findMany({
        where: { status: { not: "CANCELADO" } },
        select: {
          orderNumber: true,
          eventName: true,
          status: true,
          items: { select: { id: true, name: true, quantity: true, inventoryItemId: true } },
        },
      }),
      prisma.inventoryItem.findMany({ select: { id: true, name: true, section: true, status: true, quantity: true } }),
    ]);

    // Índice del inventario (preferir DISPONIBLE para coincidencias exactas).
    const byNorm = new Map<string, typeof inventory[number]>();
    for (const inv of inventory) {
      const k = norm(inv.name);
      if (!byNorm.has(k) || inv.status === "DISPONIBLE") byNorm.set(k, inv);
    }
    const invById = new Map(inventory.map((i) => [i.id, i]));

    // Agrupar ítems de cuadros por descripción normalizada.
    type Grp = {
      key: string;
      name: string;
      quantity: number;
      orders: string[];
      orderItemIds: string[];
      linkedIds: Set<string>;
    };
    const groups = new Map<string, Grp>();
    for (const o of orders) {
      for (const it of o.items) {
        const k = norm(it.name);
        if (!k) continue;
        let g = groups.get(k);
        if (!g) {
          g = { key: k, name: it.name.trim(), quantity: 0, orders: [], orderItemIds: [], linkedIds: new Set() };
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
    const discrepancies: any[] = [];
    for (const g of groups.values()) {
      const exactInv = byNorm.get(g.key);
      const linked = Array.from(g.linkedIds).map((id) => invById.get(id)).filter(Boolean);
      const linkedDifferent = linked.filter((i) => norm(i!.name) !== g.key);

      if (exactInv && linkedDifferent.length === 0) {
        exact++;
        continue; // existe con el mismo nombre → OK
      }

      let status: "different" | "similar" | "missing" = "missing";
      let suggestions: any[] = [];

      if (linkedDifferent.length > 0) {
        status = "different";
        suggestions = linkedDifferent.map((i) => ({ id: i!.id, name: i!.name, section: i!.section, status: i!.status, quantity: i!.quantity, score: 1 }));
      } else {
        // Buscar parecidos en el inventario (mismos números para no confundir medidas).
        const scored = inventory
          .map((i) => ({ i, s: score(g.name, i.name) }))
          .filter((x) => x.s >= 0.6 && numbers(g.name) === numbers(x.i.name))
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
          .map((x) => ({ id: x.i.id, name: x.i.name, section: x.i.section, status: x.i.status, quantity: x.i.quantity, score: Math.round(x.s * 100) / 100 }));
        suggestions = scored;
        status = scored.length > 0 ? "similar" : "missing";
      }

      discrepancies.push({
        key: g.key,
        name: g.name,
        quantity: g.quantity,
        orders: g.orders,
        orderItemIds: g.orderItemIds,
        status,
        linked: linkedDifferent.map((i) => ({ id: i!.id, name: i!.name })),
        suggestions,
      });
    }

    discrepancies.sort((a, b) => (a.status === "missing" ? -1 : b.status === "missing" ? 1 : b.quantity - a.quantity));
    return NextResponse.json({
      success: true,
      data: {
        discrepancies,
        counts: {
          exact,
          missing: discrepancies.filter((d) => d.status === "missing").length,
          similar: discrepancies.filter((d) => d.status === "similar").length,
          different: discrepancies.filter((d) => d.status === "different").length,
          totalOrderItems: Array.from(groups.values()).reduce((s, g) => s + g.quantity, 0),
        },
      },
    });
  } catch (error) {
    console.error("Error reconcile:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Vincula los ítems de cuadro (por descripción) a un ítem del inventario.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const { orderItemName, inventoryItemId, rename } = body || {};
    if (!orderItemName || !inventoryItemId) {
      return NextResponse.json({ success: false, error: "Datos incompletos" }, { status: 400 });
    }
    const inv = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { id: true, name: true } });
    if (!inv) return NextResponse.json({ success: false, error: "Ítem de inventario no encontrado" }, { status: 404 });

    const all = await prisma.orderItem.findMany({ select: { id: true, name: true } });
    const target = norm(orderItemName);
    const ids = all.filter((i) => norm(i.name) === target).map((i) => i.id);
    if (ids.length === 0) return NextResponse.json({ success: false, error: "Sin ítems de cuadro que coincidan" }, { status: 404 });

    await prisma.orderItem.updateMany({
      where: { id: { in: ids } },
      data: { inventoryItemId, ...(rename ? { name: inv.name } : {}) },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "RECONCILIAR_INVENTARIO",
        resource: "INVENTORY",
        resourceId: inventoryItemId,
        details: `Cotejo: ${ids.length} ítem(s) de cuadro "${orderItemName}" → inventario "${inv.name}"${rename ? " (renombrado)" : ""}`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, updated: ids.length, name: inv.name });
  } catch (error) {
    console.error("Error reconcile POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
