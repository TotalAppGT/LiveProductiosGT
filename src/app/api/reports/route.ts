import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const reports = await prisma.report.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { name: true } } },
    });

    return NextResponse.json({ success: true, data: reports });
  } catch (error) {
    console.error("Error en reports GET:", error);
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
    const { title, category, resourceType, resourceId } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: "Título requerido" }, { status: 400 });
    }

    const report = await prisma.report.create({
      data: {
        title,
        category: category || "OTROS",
        resourceType: resourceType || "",
        resourceId: resourceId || "",
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("Error en report POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
