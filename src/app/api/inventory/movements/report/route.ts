import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const warehouse = searchParams.get("warehouse") || undefined;
    const days = Math.min(parseInt(searchParams.get("days") || "30"), 365);
    const since = new Date(Date.now() - days * 86400000);

    const mv = await prisma.inventoryMovement.findMany({
      where: {
        createdAt: { gte: since },
        ...(warehouse ? { OR: [{ fromWarehouse: warehouse }, { toWarehouse: warehouse }] } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = mv.map((m) => ({
      Fecha: new Date(m.createdAt).toLocaleString("es-GT", { timeZone: "America/Guatemala" }),
      Tipo: m.type,
      "Ítem": m.itemName,
      Desde: m.fromWarehouse || "",
      Hacia: m.toWarehouse || "",
      Cantidad: m.quantity,
      Nota: m.note || "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(rows.length ? rows : [{ Tipo: "— sin movimientos —" }]),
      "Movimientos"
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="movimientos-${days}d.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error movimientos report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
