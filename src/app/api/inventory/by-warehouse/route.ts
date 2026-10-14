import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Stock resumido por bodega.
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const items = await prisma.inventoryItem.findMany({
      select: { name: true, section: true, quantity: true, warehouse: true, status: true },
    });

    const map = new Map<string, { warehouse: string; items: number; units: number; available: number; repair: number; sections: Record<string, number> }>();
    for (const it of items) {
      const w = it.warehouse || "Sin bodega";
      const cur = map.get(w) || { warehouse: w, items: 0, units: 0, available: 0, repair: 0, sections: {} };
      const isRepair = it.status === "EN_REPARACION" || it.status === "DANADO" || it.status === "PERDIDO";
      cur.items++;
      cur.units += it.quantity;
      if (isRepair) cur.repair += it.quantity; else cur.available += it.quantity;
      const sec = it.section || "OTRO";
      cur.sections[sec] = (cur.sections[sec] || 0) + it.quantity;
      map.set(w, cur);
    }

    const warehouses = Array.from(map.values()).sort((a, b) => b.units - a.units);
    return NextResponse.json({ success: true, data: warehouses });
  } catch (error) {
    console.error("Error by-warehouse:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
