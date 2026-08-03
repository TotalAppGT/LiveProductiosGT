import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para ver cumplimiento diario" },
        { status: 403 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
      },
      orderBy: { name: "asc" },
    });

    const dailyData = await Promise.all(
      users.map(async (user) => {
        const [tasksAssigned, completedToday, pendingToday, inProgressToday] =
          await Promise.all([
            prisma.task.findMany({
              where: {
                assignedToId: user.id,
                dueDate: { gte: today, lte: todayEnd },
              },
              select: {
                id: true,
                title: true,
                status: true,
                priority: true,
                category: true,
                comments: true,
              },
            }),
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "COMPLETADA",
                updatedAt: { gte: today, lte: todayEnd },
              },
            }),
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "PENDIENTE",
                dueDate: { gte: today, lte: todayEnd },
              },
            }),
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "EN_PROCESO",
                dueDate: { gte: today, lte: todayEnd },
              },
            }),
          ]);

        const lastActivity = await prisma.activity.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, action: true },
        });

        const assignedToday = tasksAssigned.length;
        const completionRate =
          assignedToday > 0
            ? Math.round((completedToday / assignedToday) * 100)
            : 0;

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          tasks: tasksAssigned,
          stats: {
            totalAssigned: assignedToday,
            completed: completedToday,
            pending: pendingToday,
            inProgress: inProgressToday,
            completionRate,
          },
          lastActivity: lastActivity
            ? {
                timestamp: lastActivity.createdAt.toISOString(),
                action: lastActivity.action,
              }
            : null,
          accessedToday: lastActivity
            ? lastActivity.createdAt >= today
            : false,
        };
      })
    );

    const summary = {
      date: today.toISOString().split("T")[0],
      totalUsers: dailyData.length,
      usersWithTasks: dailyData.filter((u) => u.stats.totalAssigned > 0).length,
      usersAccessedToday: dailyData.filter((u) => u.accessedToday).length,
      totalTasksAssigned: dailyData.reduce(
        (sum, u) => sum + u.stats.totalAssigned,
        0
      ),
      totalTasksCompleted: dailyData.reduce(
        (sum, u) => sum + u.stats.completed,
        0
      ),
      avgCompletionRate:
        dailyData.length > 0
          ? Math.round(
              dailyData.reduce((sum, u) => sum + u.stats.completionRate, 0) /
                dailyData.length
            )
          : 0,
    };

    return NextResponse.json(
      {
        success: true,
        data: dailyData,
        summary,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en compliance diario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
