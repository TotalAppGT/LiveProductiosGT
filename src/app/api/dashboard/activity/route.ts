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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const [activities, total] = await Promise.all([
      prisma.activity.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: { id: true, name: true, avatar: true, role: true },
          },
        },
      }),
      prisma.activity.count(),
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
    console.error("Error en actividad:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
