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

    const data: Record<string, unknown> = {};
    if (body.isCompleted !== undefined) {
      data.isCompleted = body.isCompleted;
      data.completedAt = body.isCompleted ? new Date() : null;
    }

    const reminder = await prisma.reminder.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: reminder }, { status: 200 });
  } catch (error) {
    console.error("Error actualizando recordatorio:", error);
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
    await prisma.reminder.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Recordatorio eliminado" }, { status: 200 });
  } catch (error) {
    console.error("Error eliminando recordatorio:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
