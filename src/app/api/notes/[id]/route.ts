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
    const { title, content, type } = body;

    const existing = await prisma.personalNote.findUnique({ where: { id } });
    if (!existing || existing.userId !== auth.payload.userId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const note = await prisma.personalNote.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(content !== undefined && { content: content.trim() }),
        ...(type !== undefined && { type }),
      },
    });

    return NextResponse.json({ success: true, data: note });
  } catch (error) {
    console.error("Error en notes PUT:", error);
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
    const existing = await prisma.personalNote.findUnique({ where: { id } });
    if (!existing || existing.userId !== auth.payload.userId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    await prisma.personalNote.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en notes DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
