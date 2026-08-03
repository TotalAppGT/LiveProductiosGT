import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
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
        { success: false, error: "No tienes permisos para crear tareas en lote" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { tasks } = body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un arreglo de tareas" },
        { status: 400 }
      );
    }

    if (tasks.length > 50) {
      return NextResponse.json(
        { success: false, error: "Máximo 50 tareas por lote" },
        { status: 400 }
      );
    }

    const createdTasks = await prisma.$transaction(
      tasks.map((task: any) =>
        prisma.task.create({
          data: {
            title: task.title,
            description: task.description || null,
            type: task.type || "FIJA",
            frequency: task.frequency || null,
            dayOfWeek: task.dayOfWeek || null,
            dueDate: task.dueDate ? new Date(task.dueDate) : null,
            priority: task.priority || "MEDIA",
            category: task.category || "OTRO",
            assignedToId: task.assignedToId || null,
            assignedById: auth.payload.userId,
            eventId: task.eventId || null,
            requiresConfirmation: task.requiresConfirmation || false,
          },
        })
      )
    );

    for (const task of createdTasks) {
      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          userId: auth.payload.userId,
          action: "CREACIÓN_LOTE",
          previousStatus: null,
          newStatus: task.status,
        },
      });
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_TAREAS_LOTE",
        resource: "TASK",
        details: `${createdTasks.length} tareas creadas en lote`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: createdTasks,
        message: `${createdTasks.length} tareas creadas exitosamente`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en lote de tareas:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
        { success: false, error: "No tienes permisos para actualizar tareas en lote" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { taskIds, status } = body;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un arreglo de IDs de tareas" },
        { status: 400 }
      );
    }

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

    const tasks = await prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, title: true, status: true },
    });

    await prisma.$transaction(
      tasks.map((task) =>
        prisma.task.update({
          where: { id: task.id },
          data: {
            status,
            confirmedAt: status === "COMPLETADA" ? new Date() : null,
          },
        })
      )
    );

    for (const task of tasks) {
      if (task.status !== status) {
        await prisma.taskHistory.create({
          data: {
            taskId: task.id,
            userId: auth.payload.userId,
            action: "CAMBIO_ESTADO_LOTE",
            previousStatus: task.status,
            newStatus: status,
          },
        });
      }
    }

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
        action: "ACTUALIZAR_TAREAS_LOTE",
        resource: "TASK",
        details: `${tasks.length} tareas marcadas como ${statusLabels[status] || status}`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `${tasks.length} tareas actualizadas exitosamente`,
        updatedCount: tasks.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar lote:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
