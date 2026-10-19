import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isApprover } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";
import { DEFAULT_WAREHOUSE } from "@/lib/inventory";

// Recepción del cuadro completo por el encargado de la bodega destino.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, reintegros: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!order) return NextResponse.json({ success: false, error: "Pedido no encontrado" }, { status: 404 });
    if (order.status !== "POR_RECIBIR") {
      return NextResponse.json({ success: false, error: "El cuadro no está pendiente de recepción" }, { status: 400 });
    }

    const reintegro = order.reintegros[0];
    const destination = body.destinationWarehouse || reintegro?.destinationWarehouse || DEFAULT_WAREHOUSE;
    const warehouse = await prisma.warehouse.findUnique({ where: { name: destination } });
    const isManager = warehouse?.managerId === auth.payload.userId;
    if (!isManager && !isApprover(auth.payload.role)) {
      return NextResponse.json({ success: false, error: `Solo el encargado de ${destination} puede recibir` }, { status: 403 });
    }

    const invIds = order.items.map((i) => i.inventoryItemId).filter((x): x is string => !!x);
    const updated = await prisma.inventoryItem.updateMany({
      where: { id: { in: invIds }, status: "POR_RECIBIR" },
      data: { status: "DISPONIBLE", warehouse: destination, location: destination },
    });

    if (reintegro) {
      await prisma.orderReintegro.update({
        where: { id: reintegro.id },
        data: { receivedById: auth.payload.userId, receivedAt: new Date() },
      });
    }

    await prisma.order.update({
      where: { id },
      data: { status: "DEVUELTO", returnedAt: new Date(), returnById: auth.payload.userId },
    });

    const actor = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    for (const item of order.items) {
      await logBitacora({
        type: "RECIBIDO",
        itemName: item.name,
        quantity: item.okQty ?? (item.returnCondition === "BUENO" ? item.quantity : 0),
        inventoryItemId: item.inventoryItemId,
        orderId: id,
        userId: auth.payload.userId,
        fromWarehouse: "Reintegro de evento",
        toWarehouse: destination,
        notes: `Recibido por ${actor?.name || "encargado"} — cuadro #${order.orderNumber}`,
        toStatus: "DISPONIBLE",
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      message: `Cuadro #${order.orderNumber} recibido en ${destination}. ${updated.count} ítem(s) disponibles.`,
      received: updated.count,
    });
  } catch (error) {
    console.error("Error en order receive:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
