import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { sendMessage } from "@/lib/whatsapp";

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

    const existingTask = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, whatsappNumber: true, phone: true } },
      },
    });
    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { status, confirmed, postponeReason, rescheduledTo } = body;

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

    if (status === "REPROGRAMADA" && !postponeReason) {
      return NextResponse.json(
        {
          success: false,
          error: "Se requiere una razón para reprogramar la tarea",
        },
        { status: 400 }
      );
    }

    const previousStatus = existingTask.status;

    const updateData: Record<string, unknown> = {
      status,
      confirmedAt: status === "COMPLETADA" ? new Date() : existingTask.confirmedAt,
    };

    if (status === "REPROGRAMADA") {
      updateData.postponeReason = postponeReason;
      updateData.postponeCount = existingTask.postponeCount + 1;
      if (rescheduledTo) {
        updateData.rescheduledTo = new Date(rescheduledTo);
        updateData.dueDate = new Date(rescheduledTo);
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, whatsappNumber: true, phone: true },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
      },
    });

    const historyAction = status === "REPROGRAMADA" ? "REPROGRAMACIÓN" : "CAMBIO_ESTADO";

    await prisma.taskHistory.create({
      data: {
        taskId: id,
        userId: auth.payload.userId,
        action: historyAction,
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

    const activityDetails =
      status === "REPROGRAMADA"
        ? `Tarea "${task.title}" reprogramada por ${auth.payload.userId}: ${postponeReason}`
        : `Tarea "${task.title}" cambió de ${statusLabels[previousStatus] || previousStatus} a ${statusLabels[status] || status}`;

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: status === "REPROGRAMADA" ? "REPROGRAMAR_TAREA" : "CAMBIAR_ESTADO_TAREA",
        resource: "TASK",
        resourceId: id,
        details: activityDetails,
      },
    });

    if (status === "REPROGRAMADA" && (task.assignedTo?.whatsappNumber || task.assignedTo?.phone)) {
      const to = task.assignedTo.whatsappNumber || task.assignedTo.phone;
      if (to) {
        const newDate = rescheduledTo
          ? new Date(rescheduledTo).toLocaleDateString("es-GT")
          : "Pendiente";
        sendMessage(
          to,
          `🔁 *Tarea Reprogramada*\n\n` +
            `Tarea: ${task.title}\n` +
            `Nueva fecha: ${newDate}\n` +
            `Razón: ${postponeReason}\n` +
            `Veces reprogramada: ${task.postponeCount}\n\n` +
            `Revisa la aplicación para más detalles.`
        ).catch((err) => console.warn("Error al enviar WhatsApp (postpone):", err));
      }
    }

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

export const PATCH = PUT;
