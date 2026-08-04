import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole, hasRole } from "@/lib/auth";
import { startOfDay, endOfDay, subDays } from "date-fns";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { userId } = await params;

    if (!hasMinRole(auth.payload, "JEFE") && auth.payload.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para ver esta bitácora" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const days = parseInt(searchParams.get("days") || "7");

    const endDate = dateTo ? endOfDay(new Date(dateTo)) : endOfDay(new Date());
    const startDate = dateFrom
      ? startOfDay(new Date(dateFrom))
      : startOfDay(subDays(endDate, days));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, avatar: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Usuario no encontrado" },
        { status: 404 }
      );
    }

    const [activities, accessCount, tasksViewed, tasksCompletedToday, allCompletedToday] =
      await Promise.all([
        prisma.activity.findMany({
          where: {
            userId,
            createdAt: { gte: startDate, lte: endDate },
          },
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: { id: true, name: true, role: true, avatar: true },
            },
          },
        }),
        prisma.activity.count({
          where: {
            userId,
            action: { in: ["LOGIN", "ACCESS", "VIEW_DASHBOARD", "SYNC_USER", "ACCESS_LOG"] },
            createdAt: { gte: startOfDay(new Date()), lte: endDate },
          },
        }),
        prisma.activity.count({
          where: {
            userId,
            action: { contains: "TAREA" },
            createdAt: { gte: startOfDay(new Date()), lte: endDate },
          },
        }),
        prisma.task.count({
          where: {
            assignedToId: userId,
            status: "COMPLETADA",
            updatedAt: { gte: startOfDay(new Date()), lte: endDate },
          },
        }),
        prisma.task.count({
          where: {
            status: "COMPLETADA",
            updatedAt: { gte: startOfDay(new Date()), lte: endDate },
            history: {
              some: {
                userId,
                action: { contains: "CAMBIO" },
              },
            },
          },
        }),
      ]);

    const transfersMade = activities.filter(
      (a) => a.action === "DELEGAR_TAREA"
    ).length;

    const transfersReceived = await prisma.taskHistory.count({
      where: {
        action: { contains: "DELEGACIÓN" },
        createdAt: { gte: startDate, lte: endDate },
        task: { assignedToId: userId },
      },
    });

    const todayStr = new Date().toISOString().split("T")[0];
    const dailySummaryMap = new Map<string, {
      date: string;
      accessCount: number;
      tasksViewed: number;
      tasksCompleted: number;
      transfersMade: number;
      transfersReceived: number;
    }>();

    const allDailyActivities = await prisma.activity.findMany({
      where: {
        userId,
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    for (const a of allDailyActivities) {
      const d = a.createdAt.toISOString().split("T")[0];
      if (!dailySummaryMap.has(d)) {
        dailySummaryMap.set(d, {
          date: d,
          accessCount: 0,
          tasksViewed: 0,
          tasksCompleted: 0,
          transfersMade: 0,
          transfersReceived: 0,
        });
      }
      const entry = dailySummaryMap.get(d)!;
      const isAccess = ["LOGIN", "ACCESS", "VIEW_DASHBOARD", "SYNC_USER", "ACCESS_LOG"].some((ac) =>
        a.action.includes(ac)
      );
      if (isAccess) entry.accessCount++;
      if (a.action.includes("TAREA") || a.action.includes("VIEW")) entry.tasksViewed++;
      if (a.action === "DELEGAR_TAREA") entry.transfersMade++;
    }

    const dailyCompletedTasks = await prisma.task.findMany({
      where: {
        assignedToId: userId,
        status: "COMPLETADA",
        updatedAt: { gte: startDate, lte: endDate },
      },
      select: { updatedAt: true },
    });

    for (const t of dailyCompletedTasks) {
      const d = t.updatedAt.toISOString().split("T")[0];
      if (dailySummaryMap.has(d)) {
        dailySummaryMap.get(d)!.tasksCompleted++;
      } else {
        dailySummaryMap.set(d, {
          date: d,
          accessCount: 0,
          tasksViewed: 0,
          tasksCompleted: 1,
          transfersMade: 0,
          transfersReceived: 0,
        });
      }
    }

    const dailySummary = Array.from(dailySummaryMap.values()).sort(
      (a, b) => b.date.localeCompare(a.date)
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          user,
          activities,
          summary: {
            today: {
              accessCount,
              tasksViewed,
              tasksCompleted: tasksCompletedToday,
              transfersMade,
              transfersReceived,
            },
            daily: dailySummary,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en bitácora por usuario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
