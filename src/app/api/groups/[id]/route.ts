import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const group = await prisma.group.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!group) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }

    return NextResponse.json(group);
  } catch (error) {
    return NextResponse.json({ error: "Error al obtener grupo" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { role } = auth.payload;
    if (!["DUENO", "ADMIN", "JEFE"].includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { name, description, memberIds }: { name?: string; description?: string; memberIds?: string[] } = await req.json();

    const existing = await prisma.group.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }

    const group = await prisma.group.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(memberIds !== undefined && {
          members: {
            deleteMany: {},
            create: memberIds.map((userId) => ({ userId })),
          },
        }),
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });

    return NextResponse.json(group);
  } catch (error) {
    return NextResponse.json({ error: "Error al actualizar grupo" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { role } = auth.payload;
    if (!["DUENO", "ADMIN", "JEFE"].includes(role)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const existing = await prisma.group.findUnique({ where: { id: params.id } });
    if (!existing) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }

    await prisma.group.delete({ where: { id: params.id } });

    return NextResponse.json({ message: "Grupo eliminado" });
  } catch (error) {
    return NextResponse.json({ error: "Error al eliminar grupo" }, { status: 500 });
  }
}
