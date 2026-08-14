import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
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
    const search = searchParams.get("search") || "";
    const assignedToId = searchParams.get("assignedToId") || undefined;
    const eventId = searchParams.get("eventId") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const skip = (page - 1) * limit;

    const where: Prisma.CobroWhereInput = {};

    if (status) where.status = status as any;
    if (assignedToId) where.assignedToId = assignedToId;
    if (eventId) where.eventId = eventId;

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: "insensitive" } },
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    if (dateFrom || dateTo) {
      where.dueDate = {};
      if (dateFrom) (where.dueDate as any).gte = new Date(dateFrom);
      if (dateTo) (where.dueDate as any).lte = new Date(dateTo);
    }

    const [cobros, total] = await Promise.all([
      prisma.cobro.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
          event: {
            select: { id: true, name: true, clientName: true },
          },
        },
      }),
      prisma.cobro.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: cobros,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar cobros:", error);
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
      clientName,
      amount,
      status,
      invoiceNumber,
      dueDate,
      assignedToId,
      notes,
      eventId,
    } = body;

    if (!clientName || amount === undefined) {
      return NextResponse.json(
        { success: false, error: "Nombre del cliente y monto son requeridos" },
        { status: 400 }
      );
    }

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "El monto debe ser un número positivo" },
        { status: 400 }
      );
    }

    const cobro = await prisma.cobro.create({
      data: {
        clientName,
        amount,
        status: status || "PENDIENTE",
        invoiceNumber: invoiceNumber || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedToId: assignedToId || auth.payload.userId,
        notes: notes || null,
        eventId: eventId || null,
        tenantId: auth.payload.tenantId,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
        event: {
          select: { id: true, name: true },
        },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_COBRO",
        resource: "COBRO",
        resourceId: cobro.id,
        details: `Cobro creado para ${cobro.clientName} por Q${cobro.amount}`,
      },
    });

    return NextResponse.json(
      { success: true, data: cobro, message: "Cobro creado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear cobro:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
