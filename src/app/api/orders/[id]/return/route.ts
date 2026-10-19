import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

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

    const jose = await prisma.user.findFirst({
      where: { name: { contains: "Marroquin", mode: "insensitive" }, active: true },
      select: { id: true },
    });

    const damagedItems: string[] = [];
    for (const item of order.items) {
      // OK: vuelve a disponible en bodega.
      if (item.returnCondition === "BUENO") {
        if (item.inventoryItemId) {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: "DISPONIBLE", location: "Bodega Elgin" },
          }).catch(() => {});
        }
        continue;
      }

      // FALTANTE: queda perdido. NO va a taller.
      if (item.returnCondition === "PERDIDO") {
        if (item.inventoryItemId) {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: "PERDIDO" },
          }).catch(() => {});
        }
        continue;
      }

      // DAÑADO: va a TALLER (en reparación, asignado a José), con bitácora de entrega.
      if (item.returnCondition === "DANADO") {
        damagedItems.push(item.name);
        if (item.inventoryItemId) {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: "EN_REPARACION", location: "Taller" },
          });
        }
        const open = item.inventoryItemId
          ? await prisma.workshopItem.findFirst({
              where: { inventoryItemId: item.inventoryItemId, status: { in: ["EN_REVISION", "EN_REPARACION"] } },
              select: { id: true },
            })
          : null;
        if (!open) {
          await prisma.workshopItem.create({
            data: {
              inventoryItemId: item.inventoryItemId || null,
              itemName: item.name,
              category: item.category,
              quantity: item.quantity,
              issue: "Dañado en evento",
              status: "EN_REVISION",
              assignedToId: jose?.id || null,
              deliveredById: auth.payload.userId,
              deliveredAt: new Date(),
              createdById: auth.payload.userId,
              notes: `Devuelto del cuadro #${order.orderNumber} — ${order.eventName}`,
            },
          });
        }
      }
    }

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

    // Notificar a administradores si hay items dañados/perdidos
    if (damagedItems.length > 0) {
      const admins = await prisma.user.findMany({
        where: { active: true, role: { in: ["DUENO", "ADMIN"] } },
        select: { name: true, whatsappNumber: true, phone: true },
      });
      const { sendMessage } = await import("@/lib/whatsapp");
      const msg = `🚨 *ALERTA: Items dañados/perdidos*\n\nPedido #${order.orderNumber} - ${order.eventName}\n\nItems enviados a taller:\n${damagedItems.map((n) => `• ${n}`).join("\n")}\n\nRevisá el módulo de Taller para el seguimiento.`;
      for (const admin of admins) {
        const to = admin.whatsappNumber || admin.phone;
        if (to) await sendMessage(to, msg).catch(() => {});
      }
    }

    return NextResponse.json({
      success: true,
      message: damagedItems.length > 0
        ? `Devolución procesada. ${damagedItems.length} item(s) enviados a taller.`
        : "Devolución procesada",
      damagedItems,
    });
  } catch (error) {
    console.error("Error en return:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
