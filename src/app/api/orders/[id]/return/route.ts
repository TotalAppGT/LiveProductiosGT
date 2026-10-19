import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyApprovers } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";

// Procesar devolución: OK → disponible, faltante → perdido, dañado → taller (con bitácora)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Pedido no encontrado" }, { status: 404 });
    }

    for (const item of order.items) {
      if (!item.returnChecked) {
        return NextResponse.json({ success: false, error: `Item "${item.name}" no está marcado como devuelto` }, { status: 400 });
      }
      if (!item.returnCondition) {
        return NextResponse.json({ success: false, error: `Item "${item.name}" no tiene condición de retorno` }, { status: 400 });
      }
    }

    const pendingItems: { name: string; type: string }[] = [];
    const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });

    for (const item of order.items) {
      // OK: vuelve a disponible en bodega (sin aprobación).
      if (item.returnCondition === "BUENO") {
        if (item.inventoryItemId) {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: "DISPONIBLE", location: "Bodega Cristo Rey" },
          }).catch(() => {});
        }
        await logBitacora({
          type: "DEVOLUCION",
          itemName: item.name,
          quantity: item.quantity,
          inventoryItemId: item.inventoryItemId,
          orderId: id,
          userId: auth.payload.userId,
          notes: `Devuelto OK — cuadro #${order.orderNumber}`,
          toStatus: "DISPONIBLE",
        });
        continue;
      }

      // FALTANTE → solicitud de PERDIDA · DAÑADO → solicitud de TALLER.
      // Ambos quedan PENDIENTE hasta el visto bueno de un admin.
      const type = item.returnCondition === "PERDIDO" ? "PERDIDA" : "TALLER";
      const reason = item.returnCondition === "PERDIDO" ? "Faltante en devolución de cuadro" : "Dañado en evento";
      const previousStatus = item.inventoryItemId
        ? (await prisma.inventoryItem.findUnique({ where: { id: item.inventoryItemId }, select: { status: true } }))?.status || "DISPONIBLE"
        : null;

      if (item.inventoryItemId) {
        await prisma.inventoryItem.update({ where: { id: item.inventoryItemId }, data: { status: "PENDIENTE" } }).catch(() => {});
      }

      const req = await prisma.approvalRequest.create({
        data: {
          type,
          itemName: item.name,
          quantity: item.quantity,
          inventoryItemId: item.inventoryItemId || null,
          orderId: id,
          previousStatus,
          reason,
          notes: `Cuadro #${order.orderNumber} — ${order.eventName}`,
          requestedById: auth.payload.userId,
        },
      });

      await notifyApprovers({
        type,
        itemName: item.name,
        quantity: item.quantity,
        requestedByName: requester?.name || "Usuario",
        orderRef: `#${order.orderNumber} ${order.eventName}`,
        notes: reason,
      });

      await logBitacora({
        type: "DEVOLUCION",
        itemName: item.name,
        quantity: item.quantity,
        inventoryItemId: item.inventoryItemId,
        orderId: id,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        notes: `${reason} — cuadro #${order.orderNumber} (pendiente aprobación)`,
        toStatus: "PENDIENTE",
      });
      pendingItems.push({ name: item.name, type });
    }
    const damagedItems = pendingItems.map((p) => p.name);

    await prisma.order.update({
      where: { id },
      data: { status: "DEVUELTO", returnedAt: new Date(), returnById: auth.payload.userId },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "PEDIDO_DEVUELTO",
        resource: "ORDER",
        resourceId: id,
        details: `Pedido #${order.orderNumber} devuelto y procesado`,
      },
    });

    // Auto-generar reporte en repositorio
    await prisma.report.create({
      data: {
        title: `Pedido #${order.orderNumber} - ${order.eventName}`,
        category: "PEDIDOS",
        resourceType: "order",
        resourceId: id,
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: pendingItems.length > 0
        ? `Devolución procesada. ${pendingItems.length} solicitud(es) enviadas a aprobación de un admin.`
        : "Devolución procesada",
      damagedItems,
      pendingItems,
    });
  } catch (error) {
    console.error("Error en return:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
