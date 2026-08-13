import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, diagnostic, assignedToId, notes, inventoryItemId } = body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (diagnostic !== undefined) data.diagnostic = diagnostic;
    if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
    if (notes !== undefined) data.notes = notes;
    if (status === "REPARADO" || status === "DESCARTADO") data.completedAt = new Date();

    const item = await prisma.workshopItem.update({
      where: { id },
      data,
    });

    // Si se devuelve a bodega, reingresar al inventario
    if (status === "DEVUELTO_A_BODEGA") {
      const invItem = await prisma.inventoryItem.findFirst({
        where: { name: item.itemName, status: "DANADO" },
        orderBy: { updatedAt: "desc" },
      });
      if (invItem) {
        await prisma.inventoryItem.update({
          where: { id: invItem.id },
          data: { status: "DISPONIBLE" },
        });
      }
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
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    await prisma.workshopItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en workshop DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
