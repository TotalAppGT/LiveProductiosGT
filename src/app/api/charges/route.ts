import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;
    const responsibleId = params.get("responsibleId") || undefined;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (responsibleId) where.responsibleId = responsibleId;

    const data = await prisma.internalCharge.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        responsible: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        order: { select: { id: true, orderNumber: true, eventName: true, eventDate: true } },
        approvalRequest: { select: { id: true, type: true } },
      },
    });

    const totals = await prisma.internalCharge.groupBy({
      by: ["status"],
      _sum: { amount: true },
      _count: { _all: true },
    });

    return NextResponse.json({ success: true, data, totals });
  } catch (error) {
    console.error("Error charges GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
