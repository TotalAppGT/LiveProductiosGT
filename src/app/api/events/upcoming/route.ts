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
    const limit = parseInt(searchParams.get("limit") || "10");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const events = await prisma.event.findMany({
      where: {
        date: { gte: today },
        status: { in: ["COTIZACION", "CONFIRMADO", "EN_PROGRESO"] },
      },
      take: limit,
      orderBy: { date: "asc" },
      include: {
        planner: { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      { success: true, data: events },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en upcoming events:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
