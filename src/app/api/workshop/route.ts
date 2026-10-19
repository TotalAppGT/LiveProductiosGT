import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyApprovers } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";

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
        approvalRequests: {
          where: { status: "PENDIENTE" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, type: true, status: true, toWarehouse: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error en workshop GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Enviar un ítem a TALLER: crea solicitud de aprobación (admin).
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { inventoryItemId, itemName, quantity, issue, assignedToId, notes, photos } = body;

    if (!issue || (!inventoryItemId && !itemName)) {
      return NextResponse.json({ success: false, error: "Ítem y problema son requeridos" }, { status: 400 });
    }

    let inv: { id: string; name: string; category: string; quantity: number; status: string; warehouse: string | null } | null = null;
    if (inventoryItemId) {
      inv = await prisma.inventoryItem.findUnique({
        where: { id: inventoryItemId },
        select: { id: true, name: true, category: true, quantity: true, status: true, warehouse: true },
      });
      if (!inv) return NextResponse.json({ success: false, error: "Ítem de inventario no encontrado" }, { status: 404 });
    }

    const req = await prisma.approvalRequest.create({
      data: {
        type: "TALLER",
        itemName: inv?.name || itemName,
        quantity: quantity && Number(quantity) > 0 ? Number(quantity) : inv?.quantity || 1,
        inventoryItemId: inv?.id || null,
        fromWarehouse: inv?.warehouse || null,
        previousStatus: inv?.status || null,
        reason: issue,
        notes: notes || null,
        photos: Array.isArray(photos) ? photos : [],
        requestedById: auth.payload.userId,
      },
    });

    if (inv) {
      await prisma.inventoryItem.update({ where: { id: inv.id }, data: { status: "PENDIENTE" } }).catch(() => {});
    }

    const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    await notifyApprovers({
      type: "TALLER",
      itemName: req.itemName,
      quantity: req.quantity,
      requestedByName: requester?.name || "Usuario",
      warehouse: req.fromWarehouse,
      notes: issue,
    });

    await logBitacora({
      type: "APROBACION",
      itemName: req.itemName,
      quantity: req.quantity,
      inventoryItemId: req.inventoryItemId,
      approvalRequestId: req.id,
      userId: auth.payload.userId,
      notes: `Solicitud de envío a taller${assignedToId ? " (técnico asignado)" : ""}: ${issue}`,
      photos: Array.isArray(photos) ? photos : [],
    });

    return NextResponse.json({
      success: true,
      data: req,
      message: "Solicitud enviada a aprobación de un admin. Al aprobarse pasa a Taller.",
    });
  } catch (error) {
    console.error("Error en workshop POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
