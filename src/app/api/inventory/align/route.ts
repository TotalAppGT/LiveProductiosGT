import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { findSimilarGroups } from "@/lib/inventory";

// Devuelve grupos de ítems con descripciones parecidas (posibles duplicados) para alinear.
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const items = await prisma.inventoryItem.findMany({
      select: { id: true, name: true, section: true, quantity: true, warehouse: true },
      orderBy: { name: "asc" },
    });

    const groups = findSimilarGroups(items, 0.8);
    return NextResponse.json({ success: true, data: groups, total: groups.length });
  } catch (error) {
    console.error("Error align:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
