import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Eliminar tareas duplicadas (mismo título + asignado + fecha)
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (auth.payload.role !== "ADMIN" && auth.payload.role !== "DUENO") {
      return NextResponse.json({ success: false, error: "Solo admin" }, { status: 403 });
    }

    // Buscar duplicados
    const tasks = await prisma.task.findMany({
      select: { id: true, title: true, assignedToId: true, dueDate: true, status: true },
      orderBy: { createdAt: "asc" },
    });

    const seen = new Map<string, string>();
    let removed = 0;

    for (const task of tasks) {
      const key = `${task.title}|${task.assignedToId || "null"}|${task.dueDate?.toISOString() || "null"}`;
      if (seen.has(key)) {
        // Es duplicado, eliminar
        await prisma.task.delete({ where: { id: task.id } });
        removed++;
      } else {
        seen.set(key, task.id);
      }
    }

    return NextResponse.json({ success: true, message: `${removed} tareas duplicadas eliminadas`, removed });
  } catch (error) {
    console.error("Error en dedupe:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
