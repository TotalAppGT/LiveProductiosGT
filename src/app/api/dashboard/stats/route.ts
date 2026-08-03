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

    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const [
      totalTasks,
      completedTasks,
      pendingTasks,
      inProgressTasks,
      eventsThisWeek,
      overdueCobros,
      inventoryAlerts,
      activeUsers,
      totalEvents,
      eventosActivos,
    ] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { status: "COMPLETADA" } }),
      prisma.task.count({ where: { status: "PENDIENTE" } }),
      prisma.task.count({ where: { status: "EN_PROCESO" } }),
      prisma.event.count({
        where: {
          date: { gte: weekStart },
          status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
        },
      }),
      prisma.cobro.count({
        where: {
          status: "PENDIENTE",
          dueDate: { lt: today },
        },
      }),
      prisma.inventoryItem.count({
        where: { status: { in: ["DANADO", "PERDIDO"] } },
      }),
      prisma.user.count({ where: { active: true } }),
      prisma.event.count(),
      prisma.event.count({
        where: { status: { in: ["CONFIRMADO", "EN_PROGRESO"] } },
      }),
    ]);

    const [tasksByStatus, tasksByPriority, cobrosByStatus, cobrosPendientes] = await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.task.groupBy({
        by: ["priority"],
        _count: { id: true },
      }),
      prisma.cobro.groupBy({
        by: ["status"],
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.cobro.aggregate({
        where: { status: "PENDIENTE" },
        _sum: { amount: true },
      }),
    ]);

    const activityResumen = await prisma.activity.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true, avatar: true } } },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          tareas: {
            total: totalTasks,
            completadas: completedTasks,
            pendientes: pendingTasks,
            enProgreso: inProgressTasks,
            porEstado: tasksByStatus.reduce((acc, curr) => {
              acc[curr.status] = curr._count.id;
              return acc;
            }, {} as Record<string, number>),
            porPrioridad: tasksByPriority.reduce((acc, curr) => {
              acc[curr.priority] = curr._count.id;
              return acc;
            }, {} as Record<string, number>),
          },
          eventos: {
            total: totalEvents,
            activos: eventosActivos,
            estaSemana: eventsThisWeek,
          },
          cobros: {
            pendientes: cobrosPendientes._sum.amount || 0,
            vencidos: overdueCobros,
            porEstado: cobrosByStatus.reduce((acc, curr) => {
              acc[curr.status] = curr._count.id;
              return acc;
            }, {} as Record<string, number>),
          },
          inventario: {
            alertas: inventoryAlerts,
          },
          usuarios: {
            activos: activeUsers,
          },
          actividadReciente: activityResumen.map((a) => ({
            id: a.id,
            usuario: a.user?.name || "Desconocido",
            accion: a.action,
            detalles: a.details,
            fecha: a.createdAt,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en estadísticas:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
