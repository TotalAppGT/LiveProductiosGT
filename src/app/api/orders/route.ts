import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const orders = await prisma.order.findMany({
      orderBy: { orderNumber: "desc" },
      include: {
        createdBy: { select: { name: true } },
        items: true,
      },
    });

    return NextResponse.json({ success: true, data: orders });
  } catch (error) {
    console.error("Error en orders GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { eventName, items, templateId } = body;

    if (!eventName) {
      return NextResponse.json({ success: false, error: "Nombre del evento requerido" }, { status: 400 });
    }

    // Correlativo automático
    const lastOrder = await prisma.order.findFirst({ orderBy: { orderNumber: "desc" } });
    const orderNumber = (lastOrder?.orderNumber || 0) + 1;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        eventName,
        templateId: templateId || null,
        createdById: auth.payload.userId,
        items: {
          create: (items || []).map((it: any) => ({
            name: it.name,
            category: it.category || "AUDIO",
            quantity: it.quantity || 1,
            inventoryItemId: it.inventoryItemId || null,
          })),
        },
      },
      include: { items: true },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_PEDIDO",
        resource: "ORDER",
        resourceId: order.id,
        details: `Pedido #${orderNumber} creado para "${eventName}"`,
      },
    });

    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("Error en orders POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
