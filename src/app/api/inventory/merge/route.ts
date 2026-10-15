import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

// Fusiona varios ítems en uno canónico: suma cantidades, reasigna referencias y borra los duplicados.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const { canonicalId, mergeIds, newName } = await request.json();
    if (!canonicalId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
      return NextResponse.json({ success: false, error: "Datos incompletos" }, { status: 400 });
    }

    const ids = mergeIds.filter((id: string) => id !== canonicalId);
    const canonical = await prisma.inventoryItem.findUnique({ where: { id: canonicalId } });
    if (!canonical) {
      return NextResponse.json({ success: false, error: "Ítem canónico no encontrado" }, { status: 404 });
    }

    const others = await prisma.inventoryItem.findMany({ where: { id: { in: ids } } });
    const addQty = others.reduce((s, o) => s + o.quantity, 0);
    // Nombre final (nomenclatura formal). Si no viene, se conserva el del canónico.
    const finalName = newName && String(newName).trim() ? String(newName).trim() : canonical.name;

    await prisma.$transaction([
      prisma.inventoryItem.update({ where: { id: canonicalId }, data: { quantity: canonical.quantity + addQty, name: finalName } }),
      prisma.orderItem.updateMany({ where: { inventoryItemId: { in: ids } }, data: { inventoryItemId: canonicalId } }),
      prisma.inventoryMovement.updateMany({ where: { inventoryItemId: { in: ids } }, data: { inventoryItemId: canonicalId } }),
      prisma.inventoryItem.deleteMany({ where: { id: { in: ids } } }),
    ]);

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "INVENTORY_MERGE",
        resource: "INVENTORY",
        resourceId: canonicalId,
        details: `Fusion/alineación: "${finalName}" + ${ids.length} duplicado(s) (${addQty} unidades)`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, message: `Alineado como "${finalName}"`, added: addQty });
  } catch (error) {
    console.error("Error merge:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
