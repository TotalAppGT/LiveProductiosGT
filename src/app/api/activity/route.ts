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
        { success: false, error: "No tienes permisos para ver el registro de actividad" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const userId = searchParams.get("userId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const action = searchParams.get("action") || undefined;
    const resource = searchParams.get("resource") || undefined;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (resource) where.resource = resource;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, avatar: true, role: true },
          },
        },
      }),
      prisma.activity.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: activities,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar actividad:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
