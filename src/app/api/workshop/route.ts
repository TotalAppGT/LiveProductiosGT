import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const items = await prisma.workshopItem.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        deliveredBy: { select: { id: true, name: true } },
        receivedBy: { select: { id: true, name: true } },
        inventoryItem: { select: { id: true, name: true, section: true, warehouse: true, quantity: true, status: true } },
      },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error en workshop GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Enviar un ítem a TALLER (entrega). Queda EN_REPARACION en el inventario.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { inventoryItemId, itemName, category, issue, quantity, assignedToId, notes, photos } = body;

    if (!issue || (!inventoryItemId && !itemName)) {
      return NextResponse.json({ success: false, error: "Ítem y problema son requeridos" }, { status: 400 });
    }

    let inv: { id: string; name: string; category: string; quantity: number; warehouse: string | null } | null = null;
    if (inventoryItemId) {
      inv = await prisma.inventoryItem.findUnique({
        where: { id: inventoryItemId },
        select: { id: true, name: true, category: true, quantity: true, warehouse: true },
      });
      if (!inv) return NextResponse.json({ success: false, error: "Ítem de inventario no encontrado" }, { status: 404 });
      const open = await prisma.workshopItem.findFirst({
        where: { inventoryItemId, status: { in: ["EN_REVISION", "EN_REPARACION"] } },
        select: { id: true },
      });
      if (open) return NextResponse.json({ success: false, error: "Ese ítem ya está en taller" }, { status: 409 });
    }

    // Técnico por defecto: José Marroquín
    let techId = assignedToId || null;
    if (!techId) {
      const jose = await prisma.user.findFirst({ where: { name: { contains: "Marroquin", mode: "insensitive" }, active: true }, select: { id: true } });
      techId = jose?.id || null;
    }

    if (inv) {
      await prisma.inventoryItem.update({ where: { id: inv.id }, data: { status: "EN_REPARACION", location: "Taller" } });
    }

    const item = await prisma.workshopItem.create({
      data: {
        inventoryItemId: inv?.id || null,
        itemName: inv?.name || itemName,
        category: category || inv?.category || "OTRO",
        quantity: quantity && Number(quantity) > 0 ? Number(quantity) : inv?.quantity || 1,
        issue,
        status: "EN_REVISION",
        assignedToId: techId,
        deliveredById: auth.payload.userId,
        deliveredAt: new Date(),
        deliveryPhotos: Array.isArray(photos) ? photos : [],
        notes: notes || null,
        createdById: auth.payload.userId,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "TALLER_ENTREGA",
        resource: "WORKSHOP",
        resourceId: item.id,
        details: `Enviado a taller: "${item.itemName}" (${item.quantity} u) — ${issue}`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error en workshop POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
