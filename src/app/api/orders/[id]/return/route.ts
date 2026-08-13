import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Procesar devolución: buen estado → inventario, dañado/perdido → taller
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

    const damagedItems: string[] = [];
    for (const item of order.items) {
      if (item.returnCondition === "BUENO") {
        // Regresa al inventario
        if (item.inventoryItemId) {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: {
              quantity: { increment: item.quantity },
              status: "DISPONIBLE",
            },
          });
        }
      } else if (item.returnCondition === "DANADO" || item.returnCondition === "PERDIDO") {
        damagedItems.push(item.name);
        // Va al taller
        await prisma.workshopItem.create({
          data: {
            itemName: item.name,
            category: item.category,
            issue: item.returnCondition === "DANADO" ? "Dañado en evento" : "Perdido en evento",
            status: "EN_REVISION",
            createdById: auth.payload.userId,
            notes: `Devuelto del pedido #${order.orderNumber}`,
          },
        });
        // Si está dañado, no regresa a inventario
        if (item.inventoryItemId && item.returnCondition === "DANADO") {
          await prisma.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: "DANADO" },
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
