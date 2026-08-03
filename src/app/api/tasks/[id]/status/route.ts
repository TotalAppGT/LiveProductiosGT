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
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { id } = await params;

    const existingTask = await prisma.task.findUnique({ where: { id } });
    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status, confirmed } = body;

    if (!status) {
      return NextResponse.json(
        { success: false, error: "El estado es requerido" },
        { status: 400 }
      );
    }

    const validStatuses = [
      "PENDIENTE",
      "EN_PROCESO",
      "COMPLETADA",
      "REPROGRAMADA",
      "CANCELADA",
    ];

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: "Estado no válido" },
        { status: 400 }
      );
    }

    if (status === "COMPLETADA" && existingTask.requiresConfirmation && !confirmed) {
      return NextResponse.json(
        {
          success: false,
          error: "Esta tarea requiere confirmación para ser completada",
          requiresConfirmation: true,
        },
        { status: 400 }
      );
    }

    const previousStatus = existingTask.status;

    const task = await prisma.task.update({
      where: { id },
      data: {
        status,
        confirmedAt: status === "COMPLETADA" ? new Date() : existingTask.confirmedAt,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
      },
    });

    await prisma.taskHistory.create({
      data: {
        taskId: id,
        userId: auth.payload.userId,
        action: "CAMBIO_ESTADO",
        previousStatus,
        newStatus: status,
      },
    });

    const statusLabels: Record<string, string> = {
      PENDIENTE: "Pendiente",
      EN_PROCESO: "En Proceso",
      COMPLETADA: "Completada",
      REPROGRAMADA: "Reprogramada",
      CANCELADA: "Cancelada",
    };

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CAMBIAR_ESTADO_TAREA",
        resource: "TASK",
        resourceId: id,
        details: `Tarea "${task.title}" cambió de ${statusLabels[previousStatus] || previousStatus} a ${statusLabels[status] || status}`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: task,
        message: `Tarea marcada como ${statusLabels[status] || status} exitosamente`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en cambiar estado:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
