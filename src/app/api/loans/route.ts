import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { logBitacora } from "@/lib/bitacora";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const status = params.get("status") || undefined;

    const data = await prisma.inventoryLoan.findMany({
      where: status ? { status } : undefined,
      orderBy: { loanedAt: "desc" },
      take: 300,
      include: {
        inventoryItem: { select: { id: true, name: true, section: true, warehouse: true, quantity: true, status: true } },
        borrower: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error loans GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { inventoryItemId, quantity, borrowerName, borrowerId, expectedReturn, photos, notes } = body;
    if (!inventoryItemId || !borrowerName?.trim()) {
      return NextResponse.json({ success: false, error: "Ítem y persona que recibe son requeridos" }, { status: 400 });
    }

    const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
    if (!item) return NextResponse.json({ success: false, error: "Ítem no encontrado" }, { status: 404 });

    const qty = Math.max(1, Number(quantity) || 1);
    if (qty > item.quantity) {
      return NextResponse.json({ success: false, error: `Solo hay ${item.quantity} unidad(es) de este ítem` }, { status: 400 });
    }

    const loan = await prisma.inventoryLoan.create({
      data: {
        inventoryItemId: item.id,
        itemName: item.name,
        quantity: qty,
        borrowerName: borrowerName.trim(),
        borrowerId: borrowerId || null,
        expectedReturn: expectedReturn ? new Date(expectedReturn) : null,
        photos: Array.isArray(photos) ? photos : [],
        notes: notes || null,
        createdById: auth.payload.userId,
      },
    });

    // Si se presta todo el ítem, se marca ASIGNADO.
    if (qty >= item.quantity) {
      await prisma.inventoryItem.update({ where: { id: item.id }, data: { status: "ASIGNADO" } }).catch(() => {});
    }

    await logBitacora({
      type: "PRESTAMO",
      itemName: item.name,
      quantity: qty,
      inventoryItemId: item.id,
      userId: auth.payload.userId,
      fromWarehouse: item.warehouse,
      toWarehouse: `Préstamo: ${borrowerName.trim()}`,
      notes: `Préstamo a ${borrowerName.trim()}${expectedReturn ? ` — devolución esperada ${expectedReturn}` : ""}${notes ? ` · ${notes}` : ""}`,
      photos: Array.isArray(photos) ? photos : [],
      metadata: { loanId: loan.id, borrowerName: borrowerName.trim() },
      toStatus: qty >= item.quantity ? "ASIGNADO" : item.status,
    });

    return NextResponse.json({ success: true, data: loan });
  } catch (error) {
    console.error("Error loans POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
