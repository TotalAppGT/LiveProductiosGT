import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

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
        { success: false, error: "No tienes permisos para ver el registro de accesos" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter") || "today";
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;

    let rangeStart: Date;
    let rangeEnd: Date;

    const now = new Date();

    if (dateFrom && dateTo) {
      rangeStart = new Date(dateFrom);
      rangeEnd = new Date(dateTo);
    } else {
      switch (filter) {
        case "today":
          rangeStart = startOfDay(now);
          rangeEnd = endOfDay(now);
          break;
        case "yesterday": {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          rangeStart = startOfDay(yesterday);
          rangeEnd = endOfDay(yesterday);
          break;
        }
        case "this_week":
          rangeStart = startOfWeek(now, { weekStartsOn: 0 });
          rangeEnd = endOfWeek(now, { weekStartsOn: 0 });
          break;
        default:
          rangeStart = startOfDay(now);
          rangeEnd = endOfDay(now);
      }
    }

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true, avatar: true },
    });

    const activities = await prisma.activity.findMany({
      where: {
        createdAt: { gte: rangeStart, lte: rangeEnd },
      },
      select: {
        userId: true,
        action: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const accessLog = users.map((user) => {
      const userActivities = activities.filter((a) => a.userId === user.id);

      if (userActivities.length === 0) {
        return {
          userId: user.id,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          firstAccess: null,
          lastAccess: null,
          accessCount: 0,
          tasksViewed: 0,
          tasksCompleted: 0,
          active: false,
        };
      }

      const timestamps = userActivities.map((a) => a.createdAt);
      const firstAccess = timestamps.length > 0 ? timestamps[0].toISOString() : null;
      const lastAccess =
        timestamps.length > 0 ? timestamps[timestamps.length - 1].toISOString() : null;
      const accessCount = userActivities.length;

      const tasksViewed = userActivities.filter(
        (a) => a.action.includes("TAREA") || a.action.includes("VIEW")
      ).length;

      const tasksCompleted = userActivities.filter(
        (a) => a.action === "CAMBIAR_ESTADO_TAREA"
      ).length;

      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        firstAccess,
        lastAccess,
        accessCount,
        tasksViewed,
        tasksCompleted,
        active: true,
      };
    });

    accessLog.sort((a, b) => b.accessCount - a.accessCount);

    return NextResponse.json(
      {
        success: true,
        data: accessLog,
        period: {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
          filter,
        },
        totalUsers: users.length,
        activeUsers: accessLog.filter((a) => a.active).length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en access log:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
