import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const templates = await prisma.orderTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: templates });
  } catch (error) {
    console.error("Error en templates GET:", error);
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
    const { name, items } = body;

    if (!name) {
      return NextResponse.json({ success: false, error: "Nombre de plantilla requerido" }, { status: 400 });
    }

    const template = await prisma.orderTemplate.create({
      data: {
        name,
        items: items || [],
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json({ success: true, data: template });
  } catch (error) {
    console.error("Error en template POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
