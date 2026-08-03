import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { sendMessage } from "@/lib/whatsapp";
import { generateSmartAlert } from "@/lib/ai-brain";

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

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "Solo jefes y superiores pueden delegar tareas" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingTask = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, phone: true, whatsappNumber: true },
        },
      },
    });

    if (!existingTask) {
      return NextResponse.json(
        { success: false, error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { assignedToId, reason } = body;

    if (!assignedToId) {
      return NextResponse.json(
        { success: false, error: "El ID del nuevo asignado es requerido" },
        { status: 400 }
      );
    }

    if (assignedToId === existingTask.assignedToId) {
      return NextResponse.json(
        { success: false, error: "La tarea ya está asignada a este usuario" },
        { status: 400 }
      );
    }

    const newAssignee = await prisma.user.findUnique({
      where: { id: assignedToId },
      select: { id: true, name: true, phone: true, whatsappNumber: true },
    });

    if (!newAssignee) {
      return NextResponse.json(
        { success: false, error: "Usuario destino no encontrado" },
        { status: 404 }
      );
    }

    const previousAssigneeId = existingTask.assignedToId;
    const previousAssigneeName = existingTask.assignedTo?.name || "Sin asignar";

    const task = await prisma.task.update({
      where: { id },
      data: { assignedToId },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, phone: true, whatsappNumber: true },
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
        action: `DELEGACIÓN: ${previousAssigneeName} → ${newAssignee.name}${reason ? ` - ${reason}` : ""}`,
        previousStatus: existingTask.status,
        newStatus: existingTask.status,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "DELEGAR_TAREA",
        resource: "TASK",
        resourceId: id,
        details: `Tarea "${task.title}" delegada de ${previousAssigneeName} a ${newAssignee.name}${reason ? ` (${reason})` : ""}`,
      },
    });

    // WhatsApp to new assignee
    if (newAssignee.whatsappNumber || newAssignee.phone) {
      const alertMsg = await generateSmartAlert({
        title: task.title,
        alertType: "assignment",
        assigneeName: newAssignee.name,
        dueDate: task.dueDate?.toISOString(),
        priority: task.priority,
      });

      const to = newAssignee.whatsappNumber || newAssignee.phone;
      if (to) {
        sendMessage(
          to,
          `🔄 *Tarea Delegada*\n\n${alertMsg}\n\nPrioridad: ${task.priority}\nDelegada por: Autorizado${reason ? `\nMotivo: ${reason}` : ""}`
        ).catch((err) => console.warn("WhatsApp error (new assignee):", err));
      }
    }

    // WhatsApp to old assignee
    if (previousAssigneeId && (existingTask.assignedTo?.whatsappNumber || existingTask.assignedTo?.phone)) {
      const to = existingTask.assignedTo.whatsappNumber || existingTask.assignedTo.phone;
      if (to) {
        sendMessage(
          to,
          `🔄 *Tarea Reasignada*\n\nLa tarea "${task.title}" ha sido delegada a ${newAssignee.name}.${reason ? `\nMotivo: ${reason}` : ""}`
        ).catch((err) => console.warn("WhatsApp error (old assignee):", err));
      }
    }

    // Log WhatsApp messages
    for (const recipient of [newAssignee, existingTask.assignedTo].filter(Boolean)) {
      if (!recipient) continue;
      const to = recipient.whatsappNumber || recipient.phone;
      if (to) {
        await prisma.whatsAppMessage.create({
          data: {
            userId: auth.payload.userId,
            toNumber: to,
            message: `Delegación de tarea "${task.title}"`,
            type: "NOTIFICATION",
            status: "SENT",
            relatedTaskId: task.id,
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: task,
        message: `Tarea delegada exitosamente a ${newAssignee.name}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en delegar tarea:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
