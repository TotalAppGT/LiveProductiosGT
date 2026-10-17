import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { reconcileOrdersWithInventory, normName } from "@/lib/reconcile";

// Coteja los ítems de los CUADROS contra el INVENTARIO.
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const data = await reconcileOrdersWithInventory();
    return NextResponse.json({ success: true, data });
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
    const target = normName(orderItemName);
    const ids = all.filter((i) => normName(i.name) === target).map((i) => i.id);
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
