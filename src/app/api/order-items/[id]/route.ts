import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { preparedPhotos, preparedChecked, returnPhotos, returnChecked, returnCondition, quantity, name, category } = body;

    const data: Record<string, unknown> = {};
    if (preparedPhotos !== undefined) data.preparedPhotos = preparedPhotos;
    if (preparedChecked !== undefined) data.preparedChecked = preparedChecked;
    if (returnPhotos !== undefined) data.returnPhotos = returnPhotos;
    if (returnChecked !== undefined) data.returnChecked = returnChecked;
    if (returnCondition !== undefined) data.returnCondition = returnCondition;
    if (quantity !== undefined) data.quantity = quantity;
    if (name !== undefined) data.name = name;
    if (category !== undefined) data.category = category;

    const item = await prisma.orderItem.update({ where: { id }, data });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error en order-item PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    await prisma.orderItem.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en order-item DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
