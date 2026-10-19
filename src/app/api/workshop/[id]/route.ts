import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { notifyApprovers } from "@/lib/approvals";
import { logBitacora } from "@/lib/bitacora";
import { DEFAULT_WAREHOUSE } from "@/lib/inventory";

const OPEN_FOR_CANCEL = ["EN_REVISION", "EN_REPARACION", "REPARADO", "POR_DESCARTAR"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { status, diagnostic, assignedToId, notes, receivedById, receptionPhotos, deliveryPhotos, toWarehouse } = body;

    const current = await prisma.workshopItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ success: false, error: "Registro no encontrado" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (diagnostic !== undefined) data.diagnostic = diagnostic;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (notes !== undefined) data.notes = notes;
    if (Array.isArray(deliveryPhotos)) data.deliveryPhotos = deliveryPhotos;

    // REPARADO → solicitud de REINTEGRO (admin elige/confirma bodega). NO vuelve aún.
    if (status === "REPARADO") {
      const destino = toWarehouse || DEFAULT_WAREHOUSE;
      if (Array.isArray(receptionPhotos)) data.receptionPhotos = receptionPhotos;
      data.diagnostic = diagnostic || current.diagnostic;
      data.status = "REPARADO";

      const req = await prisma.approvalRequest.create({
        data: {
          type: "REINTEGRO",
          itemName: current.itemName,
          quantity: current.quantity,
          inventoryItemId: current.inventoryItemId,
          workshopItemId: current.id,
          fromWarehouse: "Taller",
          toWarehouse: destino,
          previousStatus: "EN_REPARACION",
          reason: diagnostic || "Reparación completada",
          notes: notes || null,
          photos: Array.isArray(receptionPhotos) ? receptionPhotos : [],
          requestedById: auth.payload.userId,
        },
      });

      const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
      await notifyApprovers({
        type: "REINTEGRO",
        itemName: current.itemName,
        quantity: current.quantity,
        requestedByName: requester?.name || "Usuario",
        warehouse: destino,
        notes: diagnostic || "Reparación completada",
      });

      await logBitacora({
        type: "RECEPCION_TALLER",
        itemName: current.itemName,
        quantity: current.quantity,
        inventoryItemId: current.inventoryItemId,
        workshopItemId: current.id,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        fromWarehouse: "Taller",
        toWarehouse: destino,
        notes: `Reparado — pendiente aprobación y recepción en ${destino}`,
        photos: Array.isArray(receptionPhotos) ? receptionPhotos : [],
        toStatus: "REPARADO",
      });

      const updated = await prisma.workshopItem.update({ where: { id }, data });
      return NextResponse.json({ success: true, data: updated, message: `Reparado. Solicitud enviada para reintegro a ${destino}.` });
    }

    // DESCARTAR → solicitud de DESCUENTO (admin).
    if (status === "DESCARTADO") {
      data.status = "POR_DESCARTAR";
      const req = await prisma.approvalRequest.create({
        data: {
          type: "DESCUENTO",
          itemName: current.itemName,
          quantity: current.quantity,
          inventoryItemId: current.inventoryItemId,
          workshopItemId: current.id,
          previousStatus: current.status,
          reason: notes || diagnostic || "Descarte de taller",
          requestedById: auth.payload.userId,
        },
      });
      const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
      await notifyApprovers({
        type: "DESCUENTO",
        itemName: current.itemName,
        quantity: current.quantity,
        requestedByName: requester?.name || "Usuario",
        notes: notes || "Descarte de taller",
      });
      await logBitacora({
        type: "APROBACION",
        itemName: current.itemName,
        quantity: current.quantity,
        inventoryItemId: current.inventoryItemId,
        workshopItemId: current.id,
        approvalRequestId: req.id,
        userId: auth.payload.userId,
        notes: "Solicitud de descarte/baja",
      });
      const updated = await prisma.workshopItem.update({ where: { id }, data });
      return NextResponse.json({ success: true, data: updated, message: "Solicitud de descarte enviada a aprobación." });
    }

    // Devuelto a bodega (compatibilidad / cierre directo).
    if (status === "DEVUELTO_A_BODEGA") {
      data.status = "DEVUELTO_A_BODEGA";
      data.completedAt = new Date();
      data.receptionAt = new Date();
      data.receivedById = receivedById || auth.payload.userId;
      if (Array.isArray(receptionPhotos)) data.receptionPhotos = receptionPhotos;
      if (current.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: current.inventoryItemId },
          data: { status: "DISPONIBLE", location: "Bodega Cristo Rey" },
        }).catch(() => {});
      }
    }

    if (status === "EN_REPARACION" || status === "EN_REVISION") {
      data.status = status;
      if (current.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: current.inventoryItemId },
          data: { status: "EN_REPARACION", location: "Taller" },
        }).catch(() => {});
      }
    }

    if (status !== undefined && data.status === undefined) data.status = status;
    const item = await prisma.workshopItem.update({ where: { id }, data });

    if (status) {
      const labels: Record<string, string> = {
        EN_REVISION: "En revisión",
        EN_REPARACION: "En reparación",
        REPARADO: "Reparado",
        DESCARTADO: "Descartado",
        DEVUELTO_A_BODEGA: "Devuelto a bodega",
      };
      const actor = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
      await logBitacora({
        type: status === "REPARADO" ? "RECEPCION_TALLER" : "AJUSTE",
        itemName: item.itemName,
        quantity: item.quantity,
        inventoryItemId: item.inventoryItemId,
        workshopItemId: item.id,
        userId: auth.payload.userId,
        notes: `${actor?.name || "Usuario"} cambió a "${labels[status] || status}"${diagnostic ? ` · ${diagnostic}` : ""}`,
      });
    }

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error en workshop PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const item = await prisma.workshopItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ success: false, error: "Registro no encontrado" }, { status: 404 });

    if (OPEN_FOR_CANCEL.includes(item.status) && item.inventoryItemId) {
      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { status: "DISPONIBLE", location: "Bodega Cristo Rey" },
      }).catch(() => {});
    }

    await prisma.workshopItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en workshop DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
