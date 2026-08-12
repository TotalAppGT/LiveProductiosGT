import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Marcar pedido como LISTO: verifica fotos+checks, descuenta inventario
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

    // Verificar que todos los items tengan check y fotos
    for (const item of order.items) {
      if (!item.preparedChecked) {
        return NextResponse.json({ success: false, error: `Item "${item.name}" no está marcado como preparado` }, { status: 400 });
      }
      if (!item.preparedPhotos || item.preparedPhotos.length === 0) {
        return NextResponse.json({ success: false, error: `Item "${item.name}" no tiene fotos obligatorias` }, { status: 400 });
      }
    }

    // Descontar inventario
    for (const item of order.items) {
      if (item.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: item.inventoryItemId },
          data: {
            quantity: { decrement: item.quantity },
            status: "ASIGNADO",
          },
        });
      }
    }

    await prisma.order.update({
      where: { id },
      data: { status: "LISTO", sentAt: new Date() },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "PEDIDO_LISTO",
        resource: "ORDER",
        resourceId: id,
        details: `Pedido #${order.orderNumber} marcado como LISTO, inventario descontado`,
      },
    });

    return NextResponse.json({ success: true, message: "Pedido listo, inventario descontado" });
  } catch (error) {
    console.error("Error en ready:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
