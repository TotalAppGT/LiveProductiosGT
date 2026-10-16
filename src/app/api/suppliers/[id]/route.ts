import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    for (const k of ["name", "contactName", "phone", "nit", "notes"]) if (body[k] !== undefined) data[k] = body[k] || null;
    const supplier = await prisma.supplier.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: supplier });
  } catch (error) {
    console.error("Error actualizando proveedor:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    await prisma.supplier.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando proveedor:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
