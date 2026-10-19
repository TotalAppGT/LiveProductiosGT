import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isApprover } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";
import { DEFAULT_WAREHOUSE } from "@/lib/inventory";
import { sendProactiveMessage } from "@/lib/whatsapp";

// Recibir en bodega un ítem que vuelve de taller (o que llegó trasladado).
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { inventoryItemId, notes, photos } = await request.json();
    if (!inventoryItemId) return NextResponse.json({ success: false, error: "Ítem requerido" }, { status: 400 });

    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) return NextResponse.json({ success: false, error: "Ítem no encontrado" }, { status: 404 });
    if (item.status !== "POR_RECIBIR") {
      return NextResponse.json({ success: false, error: "El ítem no está por recibir" }, { status: 400 });
    }

    const actor = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    const warehouseName = item.warehouse || DEFAULT_WAREHOUSE;
    const warehouse = await prisma.warehouse.findUnique({ where: { name: warehouseName } });
    const isManager = warehouse?.managerId === auth.payload.userId;
    if (!isManager && !isApprover(auth.payload.role)) {
      return NextResponse.json({ success: false, error: `Solo el encargado de ${warehouseName} puede recibir` }, { status: 403 });
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: item.id },
      data: { status: "DISPONIBLE", warehouse: warehouseName, location: warehouseName },
    });

    const ws = await prisma.workshopItem.findFirst({
      where: { inventoryItemId: item.id, status: { in: ["REPARADO", "DEVUELTO_A_BODEGA"] } },
      orderBy: { createdAt: "desc" },
    });
    if (ws) {
      await prisma.workshopItem.update({
        where: { id: ws.id },
        data: {
          status: "DEVUELTO_A_BODEGA",
          receptionAt: new Date(),
          receivedById: auth.payload.userId,
          receptionPhotos: [...(ws.receptionPhotos || []), ...(Array.isArray(photos) ? photos : [])],
        },
      }).catch(() => {});
    }

    await logBitacora({
      type: "RECIBIDO",
      itemName: item.name,
      quantity: item.quantity,
      inventoryItemId: item.id,
      workshopItemId: ws?.id || null,
      userId: auth.payload.userId,
      fromWarehouse: "Taller",
      toWarehouse: warehouseName,
      notes: [notes, `Recibido por ${actor?.name || "encargado"}`].filter(Boolean).join(" · "),
      photos: Array.isArray(photos) ? photos : [],
      toStatus: "DISPONIBLE",
    });

    // Avisar al solicitante del reintegro (best-effort).
    const approval = await prisma.approvalRequest.findFirst({
      where: { type: "REINTEGRO", status: "APROBADA", workshopItemId: ws?.id || "__none__" },
      include: { requestedBy: { select: { name: true, phone: true, whatsappNumber: true } } },
    });
    const to = approval?.requestedBy?.whatsappNumber || approval?.requestedBy?.phone;
    if (to) {
      await sendProactiveMessage(
        to,
        `✅ *Recibido en bodega*\n${item.name} (${item.quantity} u)\nBodega: ${warehouseName}\nRecibido por: ${actor?.name || "encargado"}`
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error inventory receive:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
