import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const items = await prisma.workshopItem.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        assignedTo: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error en workshop GET:", error);
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
    const { itemName, category, issue, assignedToId, notes } = body;

    if (!itemName || !issue) {
      return NextResponse.json({ success: false, error: "Nombre del item y problema son requeridos" }, { status: 400 });
    }

    const item = await prisma.workshopItem.create({
      data: {
        itemName,
        category: category || "AUDIO",
        issue,
        assignedToId: assignedToId || null,
        notes: notes || null,
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error en workshop POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
