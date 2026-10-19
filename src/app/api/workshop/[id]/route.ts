import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

const CLOSED = ["REPARADO", "DESCARTADO", "DEVUELTO_A_BODEGA"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const { status, diagnostic, assignedToId, notes, receivedById, receptionPhotos, deliveryPhotos } = body;

    const current = await prisma.workshopItem.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ success: false, error: "Registro no encontrado" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (diagnostic !== undefined) data.diagnostic = diagnostic;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (notes !== undefined) data.notes = notes;
    if (Array.isArray(deliveryPhotos)) data.deliveryPhotos = deliveryPhotos;

    // RECEPCIÓN: reparado / devuelto a bodega → vuelve a DISPONIBLE
    if (status === "REPARADO" || status === "DEVUELTO_A_BODEGA") {
      data.completedAt = new Date();
      data.receptionAt = new Date();
      data.receivedById = receivedById || auth.payload.userId;
      if (Array.isArray(receptionPhotos)) data.receptionPhotos = receptionPhotos;
      if (current.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: current.inventoryItemId },
          data: { status: "DISPONIBLE", location: "Bodega Elgin" },
        }).catch(() => {});
      }
    }

    // DESCARTADO: baja definitiva (se marca perdido)
    if (status === "DESCARTADO") {
      data.completedAt = new Date();
      if (current.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: current.inventoryItemId },
          data: { status: "PERDIDO" },
        }).catch(() => {});
      }
    }

    // En revisión / en reparación: el inventario sigue en taller
    if ((status === "EN_REVISION" || status === "EN_REPARACION") && current.inventoryItemId) {
      await prisma.inventoryItem.update({
        where: { id: current.inventoryItemId },
        data: { status: "EN_REPARACION", location: "Taller" },
      }).catch(() => {});
    }

    const item = await prisma.workshopItem.update({ where: { id }, data });

    if (status) {
      const statusLabels: Record<string, string> = {
        EN_REVISION: "En revisión",
        EN_REPARACION: "En reparación",
        REPARADO: "Reparado y devuelto a inventario",
        DESCARTADO: "Descartado (baja)",
        DEVUELTO_A_BODEGA: "Devuelto a bodega",
      };
      const actor = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
      await prisma.activity.create({
        data: {
          userId: auth.payload.userId,
          action: "TALLER_ACTUALIZAR",
          resource: "WORKSHOP",
          resourceId: id,
          details: `${actor?.name || "Usuario"} cambió "${item.itemName}" a "${statusLabels[status] || status}"${diagnostic ? ` · Diagnóstico: ${diagnostic}` : ""}`,
        },
      }).catch(() => {});
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

    // Si se cancela un ítem abierto, devolverlo a disponible
    if (!CLOSED.includes(item.status) && item.inventoryItemId) {
      await prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { status: "DISPONIBLE", location: "Bodega Elgin" },
      }).catch(() => {});
    }

    await prisma.workshopItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en workshop DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
