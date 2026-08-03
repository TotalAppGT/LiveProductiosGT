import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para ver el reporte" },
        { status: 403 }
      );
    }

    const [
      totalItems,
      byStatus,
      byCategory,
      damagedItems,
      lostItems,
      availableItems,
      assignedItems,
    ] = await Promise.all([
      prisma.inventoryItem.count(),
      prisma.inventoryItem.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.inventoryItem.groupBy({
        by: ["category"],
        _count: { id: true },
      }),
      prisma.inventoryItem.count({ where: { status: "DANADO" } }),
      prisma.inventoryItem.count({ where: { status: "PERDIDO" } }),
      prisma.inventoryItem.count({ where: { status: "DISPONIBLE" } }),
      prisma.inventoryItem.count({ where: { status: "ASIGNADO" } }),
    ]);

    const statusCount = byStatus.reduce(
      (acc, curr) => {
        acc[curr.status] = curr._count.id;
        return acc;
      },
      {} as Record<string, number>
    );

    const categoryCount = byCategory.reduce(
      (acc, curr) => {
        acc[curr.category] = curr._count.id;
        return acc;
      },
      {} as Record<string, number>
    );

    const damagedAndLost = await prisma.inventoryItem.findMany({
      where: {
        status: { in: ["DANADO", "PERDIDO"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        category: true,
        location: true,
        notes: true,
        lastCheckedAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          resumen: {
            totalItems,
            disponibles: availableItems,
            asignados: assignedItems,
            danados: damagedItems,
            perdidos: lostItems,
          },
          porEstado: statusCount,
          porCategoria: categoryCount,
          itemsDanadosPerdidos: damagedAndLost,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en reporte inventario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
