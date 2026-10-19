import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BitacoraInput = {
  type: string;
  itemName: string;
  quantity?: number;
  inventoryItemId?: string | null;
  workshopItemId?: string | null;
  approvalRequestId?: string | null;
  orderId?: string | null;
  fromWarehouse?: string | null;
  toWarehouse?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  userId?: string | null;
  notes?: string | null;
  photos?: string[];
  metadata?: Prisma.InputJsonValue | null;
};

export const BITACORA_LABELS: Record<string, string> = {
  DEVOLUCION: "Devolución de cuadro",
  CARGO: "Cargo interno por pérdida",
  PRESTAMO: "Préstamo de inventario",
  DEVOLUCION_PRESTAMO: "Devolución de préstamo",
  ENTREGA_TALLER: "Entrega a taller",
  RECEPCION_TALLER: "Recepción de taller",
  PERDIDA: "Pérdida / faltante",
  REINTEGRO: "Reintegro a bodega",
  RECIBIDO: "Recibido en bodega",
  DESCUENTO: "Descarte / baja",
  TRASLADO: "Traslado entre bodegas",
  APROBACION: "Aprobación admin",
  RECHAZO: "Rechazo admin",
  FOTO: "Foto de inventario",
  AJUSTE: "Ajuste de inventario",
};

export function parseRange(from?: string | null, to?: string | null) {
  const now = new Date();
  const start = from
    ? new Date(from.length === 10 ? `${from}T00:00:00` : from)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const end = to
    ? new Date(to.length === 10 ? `${to}T23:59:59.999` : to)
    : now;
  return { start, end };
}

export async function logBitacora(input: BitacoraInput) {
  try {
    await prisma.bitacoraEntry.create({
      data: {
        type: input.type,
        itemName: input.itemName,
        quantity: input.quantity ?? 0,
        inventoryItemId: input.inventoryItemId || null,
        workshopItemId: input.workshopItemId || null,
        approvalRequestId: input.approvalRequestId || null,
        orderId: input.orderId || null,
        fromWarehouse: input.fromWarehouse || null,
        toWarehouse: input.toWarehouse || null,
        fromStatus: input.fromStatus || null,
        toStatus: input.toStatus || null,
        userId: input.userId || null,
        notes: input.notes || null,
        photos: input.photos || [],
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (error) {
    console.error("logBitacora:", error);
  }
}
