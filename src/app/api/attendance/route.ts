import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;
    const days = Math.min(parseInt(searchParams.get("days") || "7"), 90);
    const since = new Date(Date.now() - days * 86400000);

    const records = await prisma.attendanceRecord.findMany({
      where: { createdAt: { gte: since }, ...(userId ? { userId } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { name: true } } },
    });

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("Error attendance GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
