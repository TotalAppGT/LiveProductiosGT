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

    return NextResponse.json({ success: true, message: "Devolución procesada" });
  } catch (error) {
    console.error("Error en return:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
