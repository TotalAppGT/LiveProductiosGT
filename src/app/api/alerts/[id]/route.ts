import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const existing = await prisma.scheduledAlert.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 });
    }

    const data = await req.json();
    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.message !== undefined) updateData.message = data.message;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.scheduledAt !== undefined) updateData.scheduledAt = new Date(data.scheduledAt);
    if (data.frequency !== undefined) updateData.frequency = data.frequency;
    if (data.dayOfWeek !== undefined) updateData.dayOfWeek = data.dayOfWeek;
    if (data.time !== undefined) updateData.time = data.time;
    if (data.groupId !== undefined) updateData.groupId = data.groupId;
    if (data.targetUserId !== undefined) updateData.targetUserId = data.targetUserId;

    const alert = await prisma.scheduledAlert.update({
      where: { id: params.id },
      data: updateData,
    });

    return NextResponse.json(alert);
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar alerta" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const existing = await prisma.scheduledAlert.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Alerta no encontrada" }, { status: 404 });
    }

    await prisma.scheduledAlert.delete({ where: { id: params.id } });

    return NextResponse.json({ message: "Alerta eliminada" });
  } catch (error) {
    return NextResponse.json({ error: "Error al eliminar alerta" }, { status: 500 });
  }
}
