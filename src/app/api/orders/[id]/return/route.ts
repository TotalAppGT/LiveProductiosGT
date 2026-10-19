import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyApprovers } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";
import { DEFAULT_WAREHOUSE } from "@/lib/inventory";

// Reintegro del cuadro: OK → POR_RECIBIR en bodega destino · malo → taller (aprobación) · no vino → pérdida (aprobación + cargo)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const destination = body.destinationWarehouse || DEFAULT_WAREHOUSE;
    const notes = body.notes || null;

    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) return NextResponse.json({ success: false, error: "Pedido no encontrado" }, { status: 404 });

    for (const item of order.items) {
      if (!item.returnChecked && !item.returnCondition) {
        return NextResponse.json({ success: false, error: `Item "${item.name}" no está marcado como recibido` }, { status: 400 });
      }
    }

    const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    const overrides = new Map<string, any>();
    if (Array.isArray(body.items)) {
      for (const o of body.items) if (o?.id) overrides.set(o.id, o);
    }

    let okItems = 0;
    let damagedItems = 0;
    let lostItems = 0;
    let totalValue = 0;
    const pending: { name: string; type: string }[] = [];

    for (const item of order.items) {
      const o = overrides.get(item.id) || {};
      const cond = item.returnCondition;
      const qty = item.quantity;

      let okQty = o.okQty ?? item.okQty ?? (cond === "DANADO" || cond === "PERDIDO" ? 0 : qty);
      let damagedQty = o.damagedQty ?? item.damagedQty ?? (cond === "DANADO" ? qty : 0);
      let lostQty = o.lostQty ?? item.lostQty ?? (cond === "PERDIDO" ? qty : 0);

      const sum = okQty + damagedQty + lostQty;
      if (sum === 0) okQty = qty;
      if (okQty + damagedQty + lostQty > qty) {
        return NextResponse.json({ success: false, error: `Cantidades de "${item.name}" exceden ${qty}` }, { status: 400 });
      }

      const inv = item.inventoryItemId
        ? await prisma.inventoryItem.findUnique({ where: { id: item.inventoryItemId } })
        : null;
      const unitValue = Number(
        o.unitValue !== undefined
          ? o.unitValue
          : item.unitValue !== null && item.unitValue !== undefined
            ? item.unitValue
            : inv?.unitValue ?? 0
      );
      const responsibleId = o.responsibleId || item.responsibleId || auth.payload.userId;

      // OK → queda por recibir en la bodega destino (la recibe el encargado).
      if (okQty > 0) {
        if (inv) {
          await prisma.inventoryItem.update({
            where: { id: inv.id },
            data: { status: "POR_RECIBIR", warehouse: destination, location: destination },
          }).catch(() => {});
        }
        await logBitacora({
          type: "DEVOLUCION",
          itemName: item.name,
          quantity: okQty,
          inventoryItemId: inv?.id || null,
          orderId: id,
          userId: auth.payload.userId,
          fromWarehouse: inv?.warehouse || null,
          toWarehouse: destination,
          notes: `Buen estado — cuadro #${order.orderNumber} (por recibir en ${destination})`,
          toStatus: "POR_RECIBIR",
        });
        okItems += okQty;
      }

      // MALO → taller con aprobación.
      if (damagedQty > 0) {
        const req = await prisma.approvalRequest.create({
          data: {
            type: "TALLER",
            itemName: item.name,
            quantity: damagedQty,
            inventoryItemId: inv?.id || null,
            orderId: id,
            fromWarehouse: destination,
            previousStatus: inv?.status || "DISPONIBLE",
            reason: "Vino malo en evento",
            unitValue,
            responsibleId,
            photos: item.returnPhotos || [],
            notes: `Cuadro #${order.orderNumber} — ${order.eventName}`,
            requestedById: auth.payload.userId,
          },
        });
        if (inv && okQty === 0 && lostQty === 0) {
          await prisma.inventoryItem.update({ where: { id: inv.id }, data: { status: "PENDIENTE" } }).catch(() => {});
        }
        await notifyApprovers({
          type: "TALLER",
          itemName: item.name,
          quantity: damagedQty,
          requestedByName: requester?.name || "Usuario",
          orderRef: `#${order.orderNumber} ${order.eventName}`,
          notes: "Vino malo en evento",
        });
        await logBitacora({
          type: "DEVOLUCION",
          itemName: item.name,
          quantity: damagedQty,
          inventoryItemId: inv?.id || null,
          orderId: id,
          approvalRequestId: req.id,
          userId: auth.payload.userId,
          fromWarehouse: destination,
          toWarehouse: "Taller",
          notes: `Vino malo — cuadro #${order.orderNumber} (pendiente aprobación)`,
          toStatus: "PENDIENTE",
          photos: item.returnPhotos || [],
        });
        damagedItems += damagedQty;
        pending.push({ name: item.name, type: "TALLER" });
      }

      // NO VINO → pérdida con aprobación; al aprobar se genera el cargo.
      if (lostQty > 0) {
        const req = await prisma.approvalRequest.create({
          data: {
            type: "PERDIDA",
            itemName: item.name,
            quantity: lostQty,
            inventoryItemId: inv?.id || null,
            orderId: id,
            fromWarehouse: destination,
            previousStatus: inv?.status || "DISPONIBLE",
            reason: "No vino / faltante en evento",
            unitValue,
            responsibleId,
            photos: item.returnPhotos || [],
            notes: `Cuadro #${order.orderNumber} — ${order.eventName}`,
            requestedById: auth.payload.userId,
          },
        });
        if (inv && okQty === 0 && damagedQty === 0) {
          await prisma.inventoryItem.update({ where: { id: inv.id }, data: { status: "PENDIENTE" } }).catch(() => {});
        }
        await notifyApprovers({
          type: "PERDIDA",
          itemName: item.name,
          quantity: lostQty,
          requestedByName: requester?.name || "Usuario",
          orderRef: `#${order.orderNumber} ${order.eventName}`,
          notes: "No vino / faltante en evento",
        });
        await logBitacora({
          type: "DEVOLUCION",
          itemName: item.name,
          quantity: lostQty,
          inventoryItemId: inv?.id || null,
          orderId: id,
          approvalRequestId: req.id,
          userId: auth.payload.userId,
          fromWarehouse: destination,
          notes: `No vino — cuadro #${order.orderNumber} (pendiente aprobación y cargo)`,
          toStatus: "PENDIENTE",
          photos: item.returnPhotos || [],
        });
        lostItems += lostQty;
        totalValue += lostQty * unitValue;
        pending.push({ name: item.name, type: "PERDIDA" });
      }

      await prisma.orderItem.update({
        where: { id: item.id },
        data: {
          okQty,
          damagedQty,
          lostQty,
          unitValue,
          responsibleId,
          returnCondition: cond || (okQty === qty ? "BUENO" : damagedQty > 0 ? "DANADO" : "PERDIDO"),
        },
      });
    }

    const reintegro = await prisma.orderReintegro.create({
      data: {
        orderId: id,
        destinationWarehouse: destination,
        deliveredById: auth.payload.userId,
        notes,
        okItems,
        damagedItems,
        lostItems,
        totalValue,
      },
    });

    await prisma.order.update({
      where: { id },
      data: {
        status: okItems > 0 ? "POR_RECIBIR" : "DEVUELTO",
        returnedAt: new Date(),
        returnById: auth.payload.userId,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "PEDIDO_DEVUELTO",
        resource: "ORDER",
        resourceId: id,
        details: `Reintegro #${order.orderNumber}: ${okItems} OK · ${damagedItems} taller · ${lostItems} pérdida`,
      },
    });

    await prisma.report.create({
      data: {
        title: `Reintegro #${order.orderNumber} - ${order.eventName}`,
        category: "PEDIDOS",
        resourceType: "order",
        resourceId: id,
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json({
      success: true,
      message:
        okItems > 0
          ? `Reintegro procesado. ${okItems} u por recibir en ${destination}. ${damagedItems} a taller · ${lostItems} pérdida.`
          : `Reintegro procesado. ${damagedItems} a taller · ${lostItems} pérdida.`,
      okItems,
      damagedItems,
      lostItems,
      totalValue,
      pending,
      reintegroId: reintegro.id,
    });
  } catch (error) {
    console.error("Error en return:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
