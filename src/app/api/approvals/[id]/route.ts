import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isApprover, APPROVAL_LABELS } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";
import { DEFAULT_WAREHOUSE } from "@/lib/inventory";
import { sendProactiveMessage } from "@/lib/whatsapp";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!isApprover(auth.payload.role)) return NextResponse.json({ success: false, error: "Solo admin/owner puede aprobar" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const action = body.action as "approve" | "reject";
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ success: false, error: "Acción inválida" }, { status: 400 });
    }

    const req = await prisma.approvalRequest.findUnique({
      where: { id },
      include: { inventoryItem: true, workshopItem: true },
    });
    if (!req) return NextResponse.json({ success: false, error: "Solicitud no encontrada" }, { status: 404 });
    if (req.status !== "PENDIENTE") {
      return NextResponse.json({ success: false, error: "La solicitud ya fue resuelta" }, { status: 400 });
    }

    const actor = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    const toWarehouse = body.toWarehouse || req.toWarehouse || DEFAULT_WAREHOUSE;
    const notes = [req.notes, body.notes].filter(Boolean).join(" · ") || null;

    if (action === "reject") {
      if (req.inventoryItemId && req.previousStatus) {
        await prisma.inventoryItem.update({
          where: { id: req.inventoryItemId },
          data: { status: req.previousStatus as never },
        }).catch(() => {});
      }
      if (req.type === "REINTEGRO") {
        await prisma.inventoryItem.update({
          where: { id: req.inventoryItemId! },
          data: { status: "EN_REPARACION", location: "Taller" },
        }).catch(() => {});
      }

      const updated = await prisma.approvalRequest.update({
        where: { id },
        data: { status: "RECHAZADA", approvedById: auth.payload.userId, resolvedAt: new Date(), notes },
      });

      await logBitacora({
        type: "RECHAZO",
        itemName: req.itemName,
        quantity: req.quantity,
        inventoryItemId: req.inventoryItemId,
        workshopItemId: req.workshopItemId,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        notes: `Rechazado: ${APPROVAL_LABELS[req.type] || req.type}${body.notes ? ` — ${body.notes}` : ""}`,
      });

      const requester = await prisma.user.findUnique({
        where: { id: req.requestedById },
        select: { phone: true, whatsappNumber: true },
      });
      const toPhone = requester?.whatsappNumber || requester?.phone;
      if (toPhone) {
        await sendProactiveMessage(
          toPhone,
          `❌ *Solicitud rechazada*\n${APPROVAL_LABELS[req.type] || req.type}: ${req.itemName} (${req.quantity} u)\nRechazó: ${actor?.name || "admin"}${body.notes ? `\nMotivo: ${body.notes}` : ""}`
        ).catch(() => {});
      }

      return NextResponse.json({ success: true, data: updated });
    }

    // APROBACIÓN
    if (req.type === "PERDIDA") {
      if (req.inventoryItemId) {
        await prisma.inventoryItem.update({ where: { id: req.inventoryItemId }, data: { status: "PERDIDO" } });
      }
      await logBitacora({
        type: "PERDIDA",
        itemName: req.itemName,
        quantity: req.quantity,
        inventoryItemId: req.inventoryItemId,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        notes: `Pérdida aprobada por ${actor?.name || "admin"}${req.reason ? ` — ${req.reason}` : ""}`,
        toStatus: "PERDIDO",
      });
    }

    if (req.type === "TALLER") {
      let workshopItemId = req.workshopItemId;
      if (req.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: req.inventoryItemId },
          data: { status: "EN_REPARACION", location: "Taller" },
        });
      }
      if (!workshopItemId) {
        const jose = await prisma.user.findFirst({
          where: { name: { contains: "Marroquin", mode: "insensitive" }, active: true },
          select: { id: true },
        });
        const ws = await prisma.workshopItem.create({
          data: {
            inventoryItemId: req.inventoryItemId,
            itemName: req.itemName,
            category: req.inventoryItem?.category || "OTRO",
            quantity: req.quantity,
            issue: req.reason || "Enviado a taller (aprobado)",
            status: "EN_REVISION",
            assignedToId: jose?.id || null,
            deliveredById: req.requestedById,
            deliveredAt: new Date(),
            deliveryPhotos: req.photos || [],
            createdById: req.requestedById,
            notes: req.notes,
          },
        });
        workshopItemId = ws.id;
      }
      await logBitacora({
        type: "ENTREGA_TALLER",
        itemName: req.itemName,
        quantity: req.quantity,
        inventoryItemId: req.inventoryItemId,
        workshopItemId,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        fromWarehouse: req.fromWarehouse,
        toWarehouse: "Taller",
        notes: `Envío a taller aprobado por ${actor?.name || "admin"}${req.reason ? ` — ${req.reason}` : ""}`,
        toStatus: "EN_REPARACION",
        photos: req.photos || [],
      });
    }

    if (req.type === "REINTEGRO") {
      if (req.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: req.inventoryItemId },
          data: { status: "POR_RECIBIR", warehouse: toWarehouse, location: toWarehouse },
        });
      }
      if (req.workshopItemId) {
        await prisma.workshopItem.update({
          where: { id: req.workshopItemId },
          data: { status: "REPARADO", completedAt: new Date() },
        }).catch(() => {});
      }
      await logBitacora({
        type: "REINTEGRO",
        itemName: req.itemName,
        quantity: req.quantity,
        inventoryItemId: req.inventoryItemId,
        workshopItemId: req.workshopItemId,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        fromWarehouse: "Taller",
        toWarehouse,
        notes: `Reintegro aprobado por ${actor?.name || "admin"} — pendiente recibir en ${toWarehouse}`,
        toStatus: "POR_RECIBIR",
      });
    }

    if (req.type === "DESCUENTO") {
      if (req.inventoryItemId) {
        await prisma.inventoryItem.update({ where: { id: req.inventoryItemId }, data: { status: "PERDIDO" } });
      }
      if (req.workshopItemId) {
        await prisma.workshopItem.update({
          where: { id: req.workshopItemId },
          data: { status: "DESCARTADO", completedAt: new Date() },
        }).catch(() => {});
      }
      await logBitacora({
        type: "DESCUENTO",
        itemName: req.itemName,
        quantity: req.quantity,
        inventoryItemId: req.inventoryItemId,
        workshopItemId: req.workshopItemId,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        notes: `Descarte aprobado por ${actor?.name || "admin"}`,
        toStatus: "PERDIDO",
      });
    }

    if (req.type === "TRASLADO") {
      if (req.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: req.inventoryItemId },
          data: { warehouse: toWarehouse, location: toWarehouse },
        });
      }
      await logBitacora({
        type: "TRASLADO",
        itemName: req.itemName,
        quantity: req.quantity,
        inventoryItemId: req.inventoryItemId,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        fromWarehouse: req.fromWarehouse,
        toWarehouse,
        notes: `Traslado aprobado por ${actor?.name || "admin"}`,
      });
    }

    const requester = await prisma.user.findUnique({
      where: { id: req.requestedById },
      select: { phone: true, whatsappNumber: true },
    });
    const toPhone = requester?.whatsappNumber || requester?.phone;
    if (toPhone) {
      const label = APPROVAL_LABELS[req.type] || req.type;
      const destino = req.type === "REINTEGRO" ? `\nBodega destino: ${toWarehouse}` : "";
      await sendProactiveMessage(
        toPhone,
        `✅ *Solicitud aprobada*\n${label}: ${req.itemName} (${req.quantity} u)${destino}\nAprobó: ${actor?.name || "admin"}`
      ).catch(() => {});
    }

    const updated = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status: "APROBADA",
        approvedById: auth.payload.userId,
        resolvedAt: new Date(),
        toWarehouse,
        notes,
      },
    });

    await logBitacora({
      type: "APROBACION",
      itemName: req.itemName,
      quantity: req.quantity,
      inventoryItemId: req.inventoryItemId,
      workshopItemId: req.workshopItemId,
      approvalRequestId: req.id,
      userId: auth.payload.userId,
      notes: `Aprobado: ${APPROVAL_LABELS[req.type] || req.type}`,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error approvals PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
