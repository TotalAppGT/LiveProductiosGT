import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

function mondayOf(dateStr?: string | null) {
  const gtToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  const base = dateStr || gtToday;
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7; // 1=lunes ... 7=domingo
  const monday = new Date(dt.getTime() - (day - 1) * 86400000);
  return monday.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const from = mondayOf(params.get("from"));
    const start = new Date(`${from}T00:00:00-06:00`);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);

    const [orders, staff, vehicles] = await Promise.all([
      prisma.order.findMany({
        where: { eventDate: { gte: start, lte: end } },
        orderBy: [{ eventDate: "asc" }, { orderNumber: "asc" }],
        select: {
          id: true,
          orderNumber: true,
          eventName: true,
          clientName: true,
          eventLocation: true,
          eventDate: true,
          eventEndDate: true,
          contractNotes: true,
          status: true,
          fromSheetImport: true,
          sourceSheet: true,
          _count: { select: { items: true } },
          logisticsPlan: true,
        },
      }),
      prisma.staffProfile.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true, roles: true },
      }),
      prisma.vehicle.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, plate: true, type: true, seats: true, status: true },
      }),
    ]);

    return NextResponse.json({ success: true, data: { from, orders, staff, vehicles } });
  } catch (error) {
    console.error("logistics week GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
