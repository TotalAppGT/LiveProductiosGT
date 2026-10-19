import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { logBitacora } from "@/lib/bitacora";

const MAX_PHOTOS = 12;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const { photos } = await request.json();
    if (!Array.isArray(photos) || photos.length === 0) {
      return NextResponse.json({ success: false, error: "Fotos requeridas" }, { status: 400 });
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ success: false, error: "Ítem no encontrado" }, { status: 404 });

    const merged = [...(item.photos || []), ...photos].slice(-MAX_PHOTOS);
    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: { photos: merged, photoUpdatedAt: new Date() },
    });

    await logBitacora({
      type: "FOTO",
      itemName: item.name,
      quantity: item.quantity,
      inventoryItemId: id,
      userId: auth.payload.userId,
      notes: `${photos.length} foto(s) de estado agregada(s)`,
      photos,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error inventory photos POST:", error);
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
    const { index } = await request.json();
    const item = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) return NextResponse.json({ success: false, error: "Ítem no encontrado" }, { status: 404 });

    const photos = (item.photos || []).filter((_, i) => i !== Number(index));
    const updated = await prisma.inventoryItem.update({
      where: { id },
      data: { photos, photoUpdatedAt: new Date() },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error inventory photos DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
