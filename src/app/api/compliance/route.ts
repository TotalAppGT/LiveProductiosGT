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
        { success: false, error: "No tienes permisos para ver cumplimiento" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "today";
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    let from: Date;
    let to: Date;

    switch (filter) {
      case "yesterday":
        from = new Date(today);
        from.setDate(from.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setHours(23, 59, 59, 999);
        break;
      case "week": {
        const dayOfWeek = today.getDay();
        from = new Date(today);
        from.setDate(from.getDate() - dayOfWeek);
        from.setHours(0, 0, 0, 0);
        to = todayEnd;
        break;
      }
      case "custom":
        from = fromParam ? new Date(fromParam) : today;
        from.setHours(0, 0, 0, 0);
        to = toParam ? new Date(toParam) : todayEnd;
        to.setHours(23, 59, 59, 999);
        break;
      default: // today
        from = today;
        to = todayEnd;
    }

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        role: true,
        avatar: true,
      },
      orderBy: { name: "asc" },
    });

    const complianceData = await Promise.all(
      users.map(async (user) => {
        const [tasksAssigned, tasksCompleted, pendingTasks] = await Promise.all([
          prisma.task.count({
            where: {
              assignedToId: user.id,
              createdAt: { gte: from, lte: to },
            },
          }),
          prisma.task.count({
            where: {
              assignedToId: user.id,
              status: "COMPLETADA",
              updatedAt: { gte: from, lte: to },
            },
          }),
          prisma.task.findMany({
            where: {
              assignedToId: user.id,
              status: { in: ["PENDIENTE", "EN_PROCESO"] },
            },
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              category: true,
              comments: true,
              dueDate: true,
            },
            orderBy: { createdAt: "desc" },
            take: 20,
          }),
        ]);

        const lastActivity = await prisma.activity.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });

        const completionRate =
          tasksAssigned > 0
            ? Math.min(100, Math.round((tasksCompleted / tasksAssigned) * 100))
            : 0;

        return {
          userId: user.id,
          user: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            role: user.role,
          },
          tasksAssigned,
          tasksCompleted,
          tasksPending: pendingTasks.length,
          completionRate,
          lastAccess: lastActivity?.createdAt?.toISOString() || null,
          pendingTasks,
        };
      })
    );

    const activeUsers = complianceData.filter(
      (u) => u.lastAccess && new Date(u.lastAccess) >= from
    ).length;

    const totalPendingTasks = complianceData.reduce(
      (sum, u) => sum + u.tasksPending,
      0
    );

    const totalComplianceRate =
      complianceData.length > 0
        ? Math.round(
            complianceData.reduce((sum, u) => sum + u.completionRate, 0) /
              complianceData.length
          )
        : 0;

    return NextResponse.json(
      {
        success: true,
        data: {
          totalComplianceRate,
          activeUsers,
          inactiveUsers: complianceData.length - activeUsers,
          totalPendingTasks,
          staff: complianceData,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en compliance:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
