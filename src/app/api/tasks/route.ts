import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { sendMessage } from "@/lib/whatsapp";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || undefined;
    const assignedToId = searchParams.get("assignedToId") || undefined;
    const category = searchParams.get("category") || undefined;
    const type = searchParams.get("type") || undefined;
    const priority = searchParams.get("priority") || undefined;
    const eventId = searchParams.get("eventId") || undefined;
    const search = searchParams.get("search") || "";
    const dueDateFrom = searchParams.get("dueDateFrom") || undefined;
    const dueDateTo = searchParams.get("dueDateTo") || undefined;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {};

    if (status) where.status = status as any;
    if (assignedToId) where.assignedToId = assignedToId;
    if (category) where.category = category as any;
    if (type) where.type = type as any;
    if (priority) where.priority = priority as any;
    if (eventId) where.eventId = eventId;

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) (where.dueDate as any).gte = new Date(dueDateFrom);
      if (dueDateTo) (where.dueDate as any).lte = new Date(dueDateTo);
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          assignedBy: {
            select: { id: true, name: true, email: true },
          },
          event: {
            select: { id: true, name: true, date: true },
          },
          _count: { select: { commentsList: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: tasks,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar tareas:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
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
      priority,
      category,
      assignedToId,
      eventId,
      requiresConfirmation,
    } = body;

    if (!title) {
      return NextResponse.json(
        { success: false, error: "El título de la tarea es requerido" },
        { status: 400 }
      );
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: description || null,
        type: type || "FIJA",
        frequency: frequency || null,
        dayOfWeek: dayOfWeek || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "MEDIA",
        category: category || "OTRO",
        assignedToId: assignedToId || null,
        assignedById: auth.payload.userId,
        eventId: eventId || null,
        requiresConfirmation: requiresConfirmation || false,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, phone: true, whatsappNumber: true },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
        event: {
          select: { id: true, name: true, date: true },
        },
      },
    });

    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        userId: auth.payload.userId,
        action: "CREACIÓN",
        previousStatus: null,
        newStatus: task.status,
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_TAREA",
        resource: "TASK",
        resourceId: task.id,
        details: `Tarea "${task.title}" creada`,
      },
    });

    if (task.assignedTo?.whatsappNumber || task.assignedTo?.phone) {
      const to = task.assignedTo.whatsappNumber || task.assignedTo.phone;
      if (to) {
        sendMessage(
          to,
          `📋 *Nueva Tarea Asignada*\n\nTarea: ${task.title}\nPrioridad: ${task.priority}\nCategoría: ${task.category}\n${task.dueDate ? `Vence: ${new Date(task.dueDate).toLocaleDateString("es-GT")}` : "Sin fecha de vencimiento"}\n\nPor favor revisa la aplicación para más detalles.`
        ).catch((err) => console.warn("Error al enviar WhatsApp:", err));
      }
    }

    return NextResponse.json(
      { success: true, data: task, message: "Tarea creada exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear tarea:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
