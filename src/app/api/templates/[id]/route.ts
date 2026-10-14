import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }
    const { id } = await params;
    await prisma.orderTemplate.delete({ where: { id } });
    return NextResponse.json({ success: true, message: "Plantilla eliminada" });
  } catch (error) {
    console.error("Error en template DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
