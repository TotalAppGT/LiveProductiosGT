import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { logBitacora } from "@/lib/bitacora";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { id } = await params;
    const body = await request.json();
    const status = body.status as string;
    if (!["POR_COBRAR", "COBRADO", "EXONERADO"].includes(status)) {
      return NextResponse.json({ success: false, error: "Estado inválido" }, { status: 400 });
    }

    const charge = await prisma.internalCharge.update({
      where: { id },
      data: {
        status,
        notes: body.notes !== undefined ? body.notes : undefined,
        paidAt: status === "COBRADO" ? new Date() : null,
      },
    });

    await logBitacora({
      type: "CARGO",
      itemName: charge.itemName,
      quantity: charge.quantity,
      inventoryItemId: charge.inventoryItemId,
      userId: auth.payload.userId,
      notes: `Cargo ${status === "COBRADO" ? "marcado como cobrado" : status === "EXONERADO" ? "exonerado" : "reabierto"}${body.notes ? ` — ${body.notes}` : ""}`,
      metadata: { chargeId: charge.id },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: charge });
  } catch (error) {
    console.error("Error charges PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
