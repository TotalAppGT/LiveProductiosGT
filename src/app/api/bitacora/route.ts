import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { parseRange } from "@/lib/bitacora";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const { start, end } = parseRange(params.get("from"), params.get("to"));
    const type = params.get("type") || undefined;
    const warehouse = params.get("warehouse") || undefined;
    const itemId = params.get("itemId") || undefined;
    const take = Math.min(parseInt(params.get("limit") || "500"), 2000);

    const where: Record<string, unknown> = { createdAt: { gte: start, lte: end } };
    if (type) where.type = type;
    if (itemId) where.inventoryItemId = itemId;
    if (warehouse) {
      where.OR = [{ fromWarehouse: warehouse }, { toWarehouse: warehouse }];
    }

    const data = await prisma.bitacoraEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      include: {
        user: { select: { id: true, name: true } },
        inventoryItem: { select: { id: true, name: true, section: true, warehouse: true } },
        workshopItem: { select: { id: true, itemName: true, status: true } },
      },
    });

    return NextResponse.json({ success: true, data, from: start, to: end });
  } catch (error) {
    console.error("Error bitacora GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
