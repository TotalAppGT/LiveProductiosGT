import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const itemId = searchParams.get("itemId") || undefined;

    const movements = await prisma.inventoryMovement.findMany({
      where: itemId ? { inventoryItemId: itemId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return NextResponse.json({ success: true, data: movements });
  } catch (error) {
    console.error("Error en movimientos GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Registra un movimiento de logística. Si es TRANSFERENCIA, actualiza la bodega del ítem.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const { inventoryItemId, itemName, type, fromWarehouse, toWarehouse, quantity, note } = await request.json();
    if (!itemName && !inventoryItemId) {
      return NextResponse.json({ success: false, error: "Item requerido" }, { status: 400 });
    }

    let name = itemName as string | undefined;
    if (inventoryItemId && !name) {
      const it = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId }, select: { name: true } });
      name = it?.name || "Item";
    }

    const movement = await prisma.inventoryMovement.create({
      data: {
        inventoryItemId: inventoryItemId || null,
        itemName: name || "Item",
        type: type || "TRANSFERENCIA",
        fromWarehouse: fromWarehouse || null,
        toWarehouse: toWarehouse || null,
        quantity: parseInt(String(quantity), 10) || 0,
        note: note || null,
        userId: auth.payload.userId,
      },
    });

    // En transferencia, mover el ítem a la nueva bodega.
    if (inventoryItemId && type === "TRANSFERENCIA" && toWarehouse) {
      await prisma.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { warehouse: toWarehouse, location: toWarehouse },
      });
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "INVENTORY_MOVEMENT",
        resource: "INVENTORY",
        resourceId: movement.id,
        details: `${type}: ${name} ${fromWarehouse ? fromWarehouse + " → " : ""}${toWarehouse || ""} (${quantity})`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: movement, message: "Movimiento registrado" });
  } catch (error) {
    console.error("Error en movimientos POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
