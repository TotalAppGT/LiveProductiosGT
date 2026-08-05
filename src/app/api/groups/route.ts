import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const groups = await prisma.group.findMany({
      include: {
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(groups);
  } catch (error) {
    return NextResponse.json({ error: "Error al obtener grupos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { role } = auth.payload;
    if (!["DUENO", "ADMIN", "JEFE"].includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { name, description, memberIds }: { name: string; description?: string; memberIds: string[] } = await req.json();

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const group = await prisma.group.create({
      data: {
        name,
        description,
        createdById: auth.payload.userId,
        members: {
          create: memberIds?.map((userId) => ({ userId })) ?? [],
        },
      },
      include: {
        members: true,
      },
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear grupo" }, { status: 500 });
  }
}
