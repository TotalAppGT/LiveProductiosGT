import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const limit = parseInt(searchParams.get("limit") || "200");

    const where: any = {};
    if (status === "PENDIENTE") where.isCompleted = false;
    if (status === "COMPLETADO") where.isCompleted = true;

    const reminders = await prisma.reminder.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { remindAt: "asc" }],
      take: limit,
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: reminders }, { status: 200 });
  } catch (error) {
    console.error("Error listando recordatorios:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
