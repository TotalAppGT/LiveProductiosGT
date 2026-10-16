import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const items = await prisma.purchaseItem.findMany({ where: { purchaseId: id }, orderBy: { createdAt: "asc" } });
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error listando ítems:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const body = await request.json();
    if (!body.description?.trim()) return NextResponse.json({ success: false, error: "Descripción requerida" }, { status: 400 });
    const item = await prisma.purchaseItem.create({
      data: {
        purchaseId: id,
        description: body.description.trim(),
        quantity: body.quantity ? parseInt(body.quantity) : 1,
        unitPrice: body.unitPrice !== undefined && body.unitPrice !== "" ? Number(body.unitPrice) : null,
      },
    });
    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("Error creando ítem:", error);
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
    const itemId = new URL(request.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ success: false, error: "itemId requerido" }, { status: 400 });
    await prisma.purchaseItem.deleteMany({ where: { id: itemId, purchaseId: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando ítem:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
