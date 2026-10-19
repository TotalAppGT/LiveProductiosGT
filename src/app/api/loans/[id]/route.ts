import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { logBitacora } from "@/lib/bitacora";
import { notifyApprovers } from "@/lib/approvals";

// Devolución de un préstamo: BUENO → inventario · DANADO → taller (aprobación) · PERDIDO → pérdida (aprobación)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const { id } = await params;
    const body = await request.json();
    const condition = body.condition as "BUENO" | "DANADO" | "PERDIDO";
    if (!["BUENO", "DANADO", "PERDIDO"].includes(condition)) {
      return NextResponse.json({ success: false, error: "Condición inválida" }, { status: 400 });
    }

    const loan = await prisma.inventoryLoan.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });
    if (!loan) return NextResponse.json({ success: false, error: "Préstamo no encontrado" }, { status: 404 });
    if (loan.status !== "PRESTADO") {
      return NextResponse.json({ success: false, error: "El préstamo ya fue cerrado" }, { status: 400 });
    }

    const photos: string[] = Array.isArray(body.photos) ? body.photos : [];

    if (condition === "BUENO") {
      await prisma.inventoryLoan.update({
        where: { id },
        data: {
          status: "DEVUELTO",
          condition: "BUENO",
          returnedAt: new Date(),
          returnPhotos: photos,
          notes: body.notes ? [loan.notes, body.notes].filter(Boolean).join(" · ") : loan.notes,
        },
      });
      if (loan.inventoryItemId) {
        await prisma.inventoryItem.update({
          where: { id: loan.inventoryItemId },
          data: { status: "DISPONIBLE" },
        }).catch(() => {});
      }
      await logBitacora({
        type: "DEVOLUCION_PRESTAMO",
        itemName: loan.itemName,
        quantity: loan.quantity,
        inventoryItemId: loan.inventoryItemId,
        userId: auth.payload.userId,
        fromWarehouse: `Préstamo: ${loan.borrowerName}`,
        toWarehouse: loan.inventoryItem?.warehouse || undefined,
        notes: `Devuelto en buen estado por ${loan.borrowerName}${body.notes ? ` · ${body.notes}` : ""}`,
        photos,
        metadata: { loanId: loan.id },
        toStatus: "DISPONIBLE",
      });
      return NextResponse.json({ success: true, message: "Devuelto a inventario" });
    }

    // Dañado o perdido → solicitud de aprobación admin.
    const type = condition === "DANADO" ? "TALLER" : "PERDIDA";
    const reason = condition === "DANADO" ? "Préstamo devuelto dañado" : "Préstamo no devuelto (pérdida)";

    const approval = await prisma.approvalRequest.create({
      data: {
        type,
        itemName: loan.itemName,
        quantity: loan.quantity,
        inventoryItemId: loan.inventoryItemId,
        previousStatus: loan.inventoryItem?.status || "DISPONIBLE",
        fromWarehouse: loan.inventoryItem?.warehouse || null,
        reason,
        notes: body.notes || `Préstamo a ${loan.borrowerName}`,
        photos,
        requestedById: auth.payload.userId,
      },
    });

    await prisma.inventoryItem.update({
      where: { id: loan.inventoryItemId },
      data: { status: "PENDIENTE" },
    }).catch(() => {});

    await prisma.inventoryLoan.update({
      where: { id },
      data: {
        status: condition === "DANADO" ? "DANADO" : "PERDIDO",
        condition,
        returnedAt: new Date(),
        returnPhotos: photos,
        notes: body.notes ? [loan.notes, body.notes].filter(Boolean).join(" · ") : loan.notes,
        approvalRequestId: approval.id,
      },
    });

    const requester = await prisma.user.findUnique({ where: { id: auth.payload.userId }, select: { name: true } });
    await notifyApprovers({
      type,
      itemName: loan.itemName,
      quantity: loan.quantity,
      requestedByName: requester?.name || "Usuario",
      warehouse: loan.inventoryItem?.warehouse,
      notes: `${reason} — ${loan.borrowerName}`,
    });

    await logBitacora({
      type: condition === "DANADO" ? "ENTREGA_TALLER" : "PERDIDA",
      itemName: loan.itemName,
      quantity: loan.quantity,
      inventoryItemId: loan.inventoryItemId,
      approvalRequestId: approval.id,
      userId: auth.payload.userId,
      fromWarehouse: `Préstamo: ${loan.borrowerName}`,
      toWarehouse: condition === "DANADO" ? "Taller" : undefined,
      notes: `${reason} — pendiente aprobación`,
      photos,
      metadata: { loanId: loan.id },
      toStatus: "PENDIENTE",
    });

    return NextResponse.json({ success: true, message: "Solicitud enviada a aprobación de un admin" });
  } catch (error) {
    console.error("Error loans PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
