import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Reordenar recordatorios: recibe lista ordenada de ids y asigna sortOrder secuencialmente
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { orderedIds } = body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      return NextResponse.json({ success: false, error: "Lista de ids requerida" }, { status: 400 });
    }

    await prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        prisma.reminder.update({ where: { id }, data: { sortOrder: index } })
      )
    );

    return NextResponse.json({ success: true, message: "Orden actualizado" }, { status: 200 });
  } catch (error) {
    console.error("Error reordenando recordatorios:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Mover un recordatorio arriba o abajo
export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { id, direction } = body;

    if (!id || !["up", "down"].includes(direction)) {
      return NextResponse.json({ success: false, error: "Parámetros inválidos" }, { status: 400 });
    }

    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) {
      return NextResponse.json({ success: false, error: "Recordatorio no encontrado" }, { status: 404 });
    }

    const siblings = await prisma.reminder.findMany({
      where: { assignedToId: reminder.assignedToId, isCompleted: false },
      orderBy: [{ sortOrder: "asc" }, { remindAt: "asc" }],
      select: { id: true, sortOrder: true },
    });

    const currentIndex = siblings.findIndex((s) => s.id === id);
    if (currentIndex === -1) {
      return NextResponse.json({ success: false, error: "No encontrado en la lista" }, { status: 404 });
    }

    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= siblings.length) {
      return NextResponse.json({ success: false, message: "No se puede mover más" }, { status: 200 });
    }

    const current = siblings[currentIndex];
    const target = siblings[swapIndex];

    await prisma.$transaction([
      prisma.reminder.update({ where: { id: current.id }, data: { sortOrder: target.sortOrder } }),
      prisma.reminder.update({ where: { id: target.id }, data: { sortOrder: current.sortOrder } }),
    ]);

    return NextResponse.json({ success: true, message: "Recordatorio movido" }, { status: 200 });
  } catch (error) {
    console.error("Error moviendo recordatorio:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
