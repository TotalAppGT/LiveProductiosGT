import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const log = await prisma.vehicleLog.findUnique({
      where: { id },
      include: {
        driver: { select: { name: true } },
        fuelEntries: { orderBy: { createdAt: "asc" } },
      },
    });

    if (!log) return NextResponse.json({ success: false, error: "Bitácora no encontrada" }, { status: 404 });
    return NextResponse.json({ success: true, data: log });
  } catch (error) {
    console.error("Error en vehicle-log GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
