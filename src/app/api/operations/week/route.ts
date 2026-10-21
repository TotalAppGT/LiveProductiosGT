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

    const [events, staff, vehicles] = await Promise.all([
      prisma.event.findMany({
        where: { OR: [{ date: { gte: start, lte: end } }, { montageAt: { gte: start, lte: end } }] },
        orderBy: { date: "asc" },
        include: {
          crewRequirements: { orderBy: { role: "asc" } },
          crewAssignments: {
            orderBy: { role: "asc" },
            include: { staff: { select: { id: true, name: true, phone: true, roles: true } }, vehicle: { select: { id: true, name: true, plate: true, seats: true } } },
          },
          eventVehicles: { include: { vehicle: { select: { id: true, name: true, plate: true, seats: true, cargoM3: true, cargoKg: true } }, driver: { select: { id: true, name: true } } } },
          musicianShows: { include: { musician: { select: { id: true, name: true } } }, orderBy: { startAt: "asc" } },
        },
      }),
      prisma.staffProfile.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true, roles: true, userId: true } }),
      prisma.vehicle.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, plate: true, type: true, seats: true, cargoM3: true, cargoKg: true, status: true } }),
    ]);

    return NextResponse.json({ success: true, data: { from, events, staff, vehicles } });
  } catch (error) {
    console.error("operations week GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
