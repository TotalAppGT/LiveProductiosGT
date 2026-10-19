import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { isApprover, notifyApprovers } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;
    const type = params.get("type") || undefined;
    const approver = isApprover(auth.payload.role);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;
    if (!approver) where.requestedById = auth.payload.userId;

    const data = await prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        inventoryItem: { select: { id: true, name: true, section: true, warehouse: true, quantity: true, status: true, photos: true } },
        workshopItem: { select: { id: true, itemName: true, status: true, quantity: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true, eventName: true } },
      },
    });

    const pending = await prisma.approvalRequest.count({
      where: approver ? { status: "PENDIENTE" } : { status: "PENDIENTE", requestedById: auth.payload.userId },
    });

    return NextResponse.json({ success: true, data, isApprover: approver, pending });
  } catch (error) {
    console.error("Error approvals GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { type, inventoryItemId, itemName, quantity, reason, toWarehouse, photos, notes, orderId } = body;
    if (!type) return NextResponse.json({ success: false, error: "Tipo requerido" }, { status: 400 });

    let inv: { id: string; name: string; quantity: number; status: string; warehouse: string | null } | null = null;
    if (inventoryItemId) {
      inv = await prisma.inventoryItem.findUnique({
        where: { id: inventoryItemId },
        select: { id: true, name: true, quantity: true, status: true, warehouse: true },
      });
      if (!inv) return NextResponse.json({ success: false, error: "Ítem no encontrado" }, { status: 404 });
    }

    const previousStatus = inv?.status || null;
    if (inv && (type === "PERDIDA" || type === "TALLER") && inv.status !== "EN_REPARACION") {
      await prisma.inventoryItem.update({ where: { id: inv.id }, data: { status: "PENDIENTE" } });
    }

    const req = await prisma.approvalRequest.create({
      data: {
        type,
        itemName: inv?.name || itemName || "Sin nombre",
        quantity: Number(quantity) || inv?.quantity || 1,
        inventoryItemId: inv?.id || null,
        orderId: orderId || null,
        fromWarehouse: inv?.warehouse || null,
        toWarehouse: toWarehouse || null,
        previousStatus,
        reason: reason || null,
        photos: Array.isArray(photos) ? photos : [],
        notes: notes || null,
        requestedById: auth.payload.userId,
      },
    });

    const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    await notifyApprovers({
      type,
      itemName: req.itemName,
      quantity: req.quantity,
      requestedByName: requester?.name || "Usuario",
      warehouse: req.fromWarehouse,
      notes: req.reason,
    });
    await logBitacora({
      type: "APROBACION",
      itemName: req.itemName,
      quantity: req.quantity,
      inventoryItemId: req.inventoryItemId,
      approvalRequestId: req.id,
      userId: auth.payload.userId,
      notes: `Solicitud creada: ${type}`,
    });

    return NextResponse.json({ success: true, data: req });
  } catch (error) {
    console.error("Error approvals POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
