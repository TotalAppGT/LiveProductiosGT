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

// Alinea: elige un nombre final y lo aplica al INVENTARIO y a los CUADROS a la vez.
// - inventoryItemId: ítem del inventario a usar (o crear con `create: true`).
// - newName: nombre final (si se omite, se usa el del inventario).
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const { orderItemName, inventoryItemId, newName, create, category, section, quantity } = body || {};
    if (!orderItemName) return NextResponse.json({ success: false, error: "Falta el nombre del ítem de cuadro" }, { status: 400 });

    const original = normName(orderItemName);
    const all = await prisma.orderItem.findMany({ select: { id: true, name: true } });
    const ids = all.filter((i) => normName(i.name) === original).map((i) => i.id);

    let inv: { id: string; name: string };
    if (create) {
      const name = (newName && String(newName).trim()) || orderItemName;
      inv = await prisma.inventoryItem.create({
        data: {
          name,
          category: category || "OTRO",
          section: section || null,
          quantity: quantity && Number(quantity) > 0 ? Number(quantity) : 1,
          status: "DISPONIBLE",
          location: "Bodega Elgin",
          warehouse: "Bodega Elgin",
          lastCheckedAt: new Date(),
        },
        select: { id: true, name: true },
      });
    } else {
      if (!inventoryItemId) return NextResponse.json({ success: false, error: "Falta el ítem del inventario" }, { status: 400 });
      const found = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { id: true, name: true } });
      if (!found) return NextResponse.json({ success: false, error: "Ítem de inventario no encontrado" }, { status: 404 });
      inv = found;
    }

    const finalName = (newName && String(newName).trim()) || inv.name;
    if (finalName !== inv.name) {
      await prisma.inventoryItem.update({ where: { id: inv.id }, data: { name: finalName } });
    }
    if (ids.length > 0) {
      await prisma.orderItem.updateMany({ where: { id: { in: ids } }, data: { inventoryItemId: inv.id, name: finalName } });
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "RECONCILIAR_INVENTARIO",
        resource: "INVENTORY",
        resourceId: inv.id,
        details: `Cotejo/alineación: "${orderItemName}" → "${finalName}" (${ids.length} ítem(s) de cuadros${create ? ", inventario creado" : ""})`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, updated: ids.length, name: finalName, inventoryItemId: inv.id, created: !!create });
  } catch (error) {
    console.error("Error reconcile POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
