import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { parseGTInputDate, nextRecurrenceDueDate } from "@/lib/task-utils";

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

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, avatar: true, phone: true, whatsappNumber: true },
        },
        assignedBy: {
          select: { id: true, name: true, email: true },
        },
        event: {
          select: { id: true, name: true, clientName: true, date: true, location: true },
        },
        commentsList: {
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        history: {
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { success: false, error: "Tarea no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: task },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener tarea:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

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
    const {
      title,
      description,
      type,
      frequency,
      dayOfWeek,
      dueDate,
      status,
      priority,
      category,
      comments,
      rescheduledTo,
      assignedToId,
      eventId,
      requiresConfirmation,
      confirmedAt,
    } = body;

    const previousStatus = existingTask.status;
    const statusChanged = status && status !== previousStatus;

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: title !== undefined ? title : undefined,
        description: description !== undefined ? description : undefined,
        type: type !== undefined ? type : undefined,
        frequency: frequency !== undefined ? frequency : undefined,
        dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : undefined,
        dueDate: dueDate !== undefined ? parseGTInputDate(dueDate) : undefined,
        status: status !== undefined ? status : undefined,
        priority: priority !== undefined ? priority : undefined,
        category: category !== undefined ? category : undefined,
        comments: comments !== undefined ? comments : undefined,
        rescheduledTo: rescheduledTo !== undefined ? (rescheduledTo ? new Date(rescheduledTo) : null) : undefined,
        assignedToId: assignedToId !== undefined ? assignedToId : undefined,
        eventId: eventId !== undefined ? eventId : undefined,
        requiresConfirmation: requiresConfirmation !== undefined ? requiresConfirmation : undefined,
        confirmedAt: confirmedAt !== undefined ? (confirmedAt ? new Date(confirmedAt) : null) : undefined,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
        event: {
          select: { id: true, name: true, date: true },
        },
      },
    });

    if (statusChanged) {
      await prisma.taskHistory.create({
        data: {
          taskId: id,
          userId: auth.payload.userId,
          action: "CAMBIO_ESTADO",
          previousStatus,
          newStatus: status as any,
        },
      });

      await prisma.activity.create({
        data: {
          userId: auth.payload.userId,
          action: "CAMBIAR_ESTADO_TAREA",
          resource: "TASK",
          resourceId: id,
          details: `Tarea "${task.title}" cambió de ${previousStatus} a ${status}`,
        },
      });
    } else {
      await prisma.activity.create({
        data: {
          userId: auth.payload.userId,
          action: "ACTUALIZAR_TAREA",
          resource: "TASK",
          resourceId: id,
          details: `Tarea "${task.title}" actualizada`,
        },
      });
    }

    if (status === "COMPLETADA" && existingTask.type === "FIJA") {
      const nextDueDate = nextRecurrenceDueDate(existingTask.dueDate ?? new Date(), existingTask.frequency);

      await prisma.task.create({
        data: {
          title: existingTask.title,
          description: existingTask.description,
          type: "FIJA",
          frequency: existingTask.frequency,
          dayOfWeek: existingTask.dayOfWeek,
          dueDate: nextDueDate,
          priority: existingTask.priority,
          category: existingTask.category,
          assignedToId: existingTask.assignedToId,
          assignedById: existingTask.assignedById || auth.payload.userId,
          eventId: existingTask.eventId,
          requiresConfirmation: existingTask.requiresConfirmation,
        },
      });
    }

    return NextResponse.json(
      { success: true, data: task, message: "Tarea actualizada exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar tarea:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;

export async function DELETE(
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

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden eliminar tareas" },
        { status: 403 }
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

    await prisma.task.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ELIMINAR_TAREA",
        resource: "TASK",
        resourceId: id,
        details: `Tarea "${existingTask.title}" eliminada`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Tarea eliminada exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en eliminar tarea:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
