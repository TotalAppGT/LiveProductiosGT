import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { startOfDay, startOfWeek, endOfWeek } from "date-fns";

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
    const todayStart = startOfDay(today);
    const weekStart = startOfWeek(today, { weekStartsOn: 0 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 0 });

    // El dashboard es PERSONAL para todos: las tareas que se muestran son
    // siempre las del usuario. La vista de equipo está en Tareas → Todas.
    const isEmployee = auth.payload.role === "EMPLEADO";
    const uid = auth.payload.userId;
    const taskScope = { assignedToId: uid };

    const [
      pendingTasks,
      completedTasksToday,
      eventsThisWeek,
      pendingCobrosCount,
      damagedEquipment,
      cobrosAggregate,
      recentActivity,
      tasksDueToday,
    ] = await Promise.all([
      prisma.task.count({
        where: { status: { in: ["PENDIENTE", "EN_PROCESO"] }, ...taskScope },
      }),
      prisma.taskHistory.count({
        where: { newStatus: "COMPLETADA", createdAt: { gte: todayStart }, task: { assignedToId: uid } },
      }),
      prisma.event.count({
        where: {
          date: { gte: weekStart, lte: weekEnd },
          ...(isEmployee ? { OR: [{ plannerId: uid }, { responsibleId: uid }] } : {}),
        },
      }),
      prisma.cobro.count({
        where: { status: "PENDIENTE", ...(isEmployee ? { assignedToId: uid } : {}) },
      }),
      isEmployee
        ? Promise.resolve(0)
        : prisma.inventoryItem.count({
            where: { status: { in: ["DANADO", "PERDIDO"] } },
          }),
      prisma.cobro.aggregate({
        where: { status: "PENDIENTE", ...(isEmployee ? { assignedToId: uid } : {}) },
        _sum: { amount: true },
      }),
      prisma.activity.findMany({
        where: isEmployee ? { userId: uid } : {},
        take: 10,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, avatar: true } },
        },
      }),
      prisma.task.findMany({
        where: {
          dueDate: {
            gte: todayStart,
            lt: new Date(todayStart.getTime() + 86400000),
          },
          ...taskScope,
        },
        include: {
          assignedTo: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: {
          stats: {
            pendingTasks,
            completedTasksToday,
            eventsThisWeek,
            pendingCobros: pendingCobrosCount,
            damagedEquipment,
            cobrosAmount: Number(cobrosAggregate._sum.amount) || 0,
          },
          dailyReport: "Resumen diario generado por IA",
          recentActivity: recentActivity.map((a) => ({
            id: a.id,
            user: {
              name: a.user?.name || "Desconocido",
              avatar: a.user?.avatar || null,
            },
            action: a.action,
            details: a.details || "",
            createdAt: a.createdAt.toISOString(),
          })),
          tasksDueToday: tasksDueToday.map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status,
            category: t.category,
            assignedTo: t.assignedTo
              ? { name: t.assignedTo.name }
              : null,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en dashboard:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
