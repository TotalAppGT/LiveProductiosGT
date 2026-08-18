import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function PATCH(
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

    const existing = await prisma.purchase.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Compra no encontrada" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.provider !== undefined) data.provider = body.provider;
    if (body.amount !== undefined) data.amount = body.amount === null ? null : Number(body.amount);
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId;

    const purchase = await prisma.purchase.update({
      where: { id },
      data,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: purchase }, { status: 200 });
  } catch (error) {
    console.error("Error actualizando compra:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
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

    await prisma.purchase.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Compra eliminada" }, { status: 200 });
  } catch (error) {
    console.error("Error eliminando compra:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
