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
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const from = dateFrom ? new Date(dateFrom) : today;
    from.setHours(0, 0, 0, 0);
    const to = dateTo ? new Date(dateTo) : todayEnd;
    to.setHours(23, 59, 59, 999);

    const users = await prisma.user.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        phone: true,
        whatsappNumber: true,
        _count: {
          select: {
            assignedTasks: {
              where: {
                createdAt: { gte: from, lte: to },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const complianceData = await Promise.all(
      users.map(async (user) => {
        const [totalAssigned, completed, pending, inProcess, cancelled, reprogrammed] =
          await Promise.all([
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
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "PENDIENTE",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "EN_PROCESO",
                createdAt: { gte: from, lte: to },
              },
            }),
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "CANCELADA",
                updatedAt: { gte: from, lte: to },
              },
            }),
            prisma.task.count({
              where: {
                assignedToId: user.id,
                status: "REPROGRAMADA",
                updatedAt: { gte: from, lte: to },
              },
            }),
          ]);

        const lastActivity = await prisma.activity.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });

        const completionRate =
          totalAssigned > 0
            ? Math.round(
                ((completed + cancelled) / totalAssigned) * 100
              )
            : 0;

        const neverAccessed =
          !lastActivity || lastActivity.createdAt < from;

        const overdueComments = await prisma.task.findMany({
          where: {
            assignedToId: user.id,
            status: { in: ["PENDIENTE", "EN_PROCESO"] },
            dueDate: { lt: new Date() },
            comments: { not: null },
          },
          select: { title: true, comments: true },
        });

        return {
          userId: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          totalAssigned,
          completed,
          pending,
          inProcess,
          cancelled,
          reprogrammed,
          completionRate,
          neverAccessed,
          lastAccess: lastActivity?.createdAt?.toISOString() || null,
          overdueComments: overdueComments.filter((t) => t.comments),
          period: { from: from.toISOString(), to: to.toISOString() },
        };
      })
    );

    const summary = {
      totalUsers: complianceData.length,
      avgCompletionRate:
        complianceData.length > 0
          ? Math.round(
              complianceData.reduce((sum, u) => sum + u.completionRate, 0) /
                complianceData.length
            )
          : 0,
      usersNeverAccessed: complianceData.filter((u) => u.neverAccessed).length,
      totalTasksAssigned: complianceData.reduce((sum, u) => sum + u.totalAssigned, 0),
      totalTasksCompleted: complianceData.reduce((sum, u) => sum + u.completed, 0),
    };

    return NextResponse.json(
      {
        success: true,
        data: complianceData,
        summary,
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
