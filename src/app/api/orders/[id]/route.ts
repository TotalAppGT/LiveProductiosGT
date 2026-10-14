import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { parseGTInputDate } from "@/lib/task-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) return NextResponse.json({ success: false, error: "Cuadro no encontrado" }, { status: 404 });
    return NextResponse.json({ success: true, data: order });
  } catch (error) {
    console.error("Error order GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Editar un cuadro: datos del evento y/o reemplazar los items (agregar extras, cantidades, quitar).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;

    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Cuadro no encontrado" }, { status: 404 });

    const body = await request.json();
    const { eventName, clientName, eventLocation, guestCount, eventDate, eventEndDate, contractNotes, status, items } = body;

    await prisma.order.update({
      where: { id },
      data: {
        eventName: eventName !== undefined ? eventName : undefined,
        clientName: clientName !== undefined ? clientName : undefined,
        eventLocation: eventLocation !== undefined ? eventLocation : undefined,
        guestCount: guestCount !== undefined ? (guestCount ? parseInt(String(guestCount), 10) : null) : undefined,
        eventDate: eventDate !== undefined ? parseGTInputDate(eventDate) : undefined,
        eventEndDate: eventEndDate !== undefined ? parseGTInputDate(eventEndDate) : undefined,
        contractNotes: contractNotes !== undefined ? contractNotes : undefined,
        status: status !== undefined ? status : undefined,
      },
    });

    if (Array.isArray(items)) {
      await prisma.orderItem.deleteMany({ where: { orderId: id } });
      if (items.length > 0) {
        await prisma.orderItem.createMany({
          data: items.map((it: Record<string, unknown>) => ({
            orderId: id,
            name: String(it.name || "").trim(),
            category: (it.category as string) || "OTRO",
            quantity: Number(it.quantity) || 1,
            inventoryItemId: (it.inventoryItemId as string) || null,
          })).filter((it: { name: string }) => it.name),
        });
      }
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ACTUALIZAR_CUADRO",
        resource: "ORDER",
        resourceId: id,
        details: `Cuadro #${existing.orderNumber} editado`,
      },
    }).catch(() => {});

    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    return NextResponse.json({ success: true, data: order, message: "Cuadro actualizado" });
  } catch (error) {
    console.error("Error order PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
