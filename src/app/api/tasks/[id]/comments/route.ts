import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    const [comments, total] = await Promise.all([
      prisma.taskComment.findMany({
        where: { taskId: id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.taskComment.count({ where: { taskId: id } }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: comments,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar comentarios:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return NextResponse.json(
        { success: false, error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "El contenido del comentario es requerido" },
        { status: 400 }
      );
    }

    const comment = await prisma.taskComment.create({
      data: {
        content: content.trim(),
        taskId: id,
        userId: auth.payload.userId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "COMENTAR_TAREA",
        resource: "TASK_COMMENT",
        resourceId: comment.id,
        details: `Comentario agregado a tarea "${task.title}"`,
      },
    });

    return NextResponse.json(
      { success: true, data: comment, message: "Comentario agregado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en agregar comentario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
