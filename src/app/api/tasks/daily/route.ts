import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = await prisma.task.findMany({
      where: {
        assignedToId: auth.payload.userId,
        status: { notIn: ["COMPLETADA", "CANCELADA"] },
        OR: [
          {
            dueDate: {
              gte: today,
              lt: tomorrow,
            },
          },
          {
            dueDate: null,
          },
          {
            AND: [
              { dueDate: { lt: tomorrow } },
              { status: { in: ["PENDIENTE", "EN_PROCESO"] } },
            ],
          },
        ],
      },
      include: {
        event: {
          select: { id: true, name: true, date: true, clientName: true },
        },
      },
      orderBy: [{ priority: "desc" }, { category: "asc" }, { createdAt: "asc" }],
    });

    const organized: Record<string, typeof tasks> = {};
    for (const task of tasks) {
      const cat = task.category;
      if (!organized[cat]) organized[cat] = [];
      organized[cat].push(task);
    }

    const stats = {
      total: tasks.length,
      pendientes: tasks.filter((t) => t.status === "PENDIENTE").length,
      enProceso: tasks.filter((t) => t.status === "EN_PROCESO").length,
      reprogramadas: tasks.filter((t) => t.status === "REPROGRAMADA").length,
      alta: tasks.filter((t) => t.priority === "ALTA" || t.priority === "URGENTE").length,
      vencidas: tasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < today && t.status !== "REPROGRAMADA"
      ).length,
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          tasks: organized,
          stats,
          todayDate: today.toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en tareas diarias:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
