import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const notes = await prisma.personalNote.findMany({
      where: { userId: auth.payload.userId },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    console.error("Error en notes GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { title, content, type } = body;

    if (!content || !content.trim()) {
      return NextResponse.json({ success: false, error: "El contenido es requerido" }, { status: 400 });
    }

    const note = await prisma.personalNote.create({
      data: {
        userId: auth.payload.userId,
        title: title?.trim() || "",
        content: content.trim(),
        type: type || "NOTA",
      },
    });

    return NextResponse.json({ success: true, data: note });
  } catch (error) {
    console.error("Error en notes POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
