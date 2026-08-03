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
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    const where: Prisma.EventWhereInput = {};

    if (status) where.status = status as any;

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) (where.date as any).gte = new Date(dateFrom);
      if (dateTo) (where.date as any).lte = new Date(dateTo);
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { clientName: { contains: search, mode: "insensitive" } },
        { clientEmail: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: "desc" },
        include: {
          planner: { select: { id: true, name: true } },
          responsible: { select: { id: true, name: true } },
          _count: {
            select: { tasks: true, cobros: true },
          },
        },
      }),
      prisma.event.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: events,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar eventos:", error);
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
      name,
      clientName,
      clientPhone,
      clientEmail,
      date,
      location,
      guestCount,
      status,
      serviceType,
      audioType,
      plannerId,
      responsibleId,
      notes,
    } = body;

    if (!name || !clientName || !date) {
      return NextResponse.json(
        { success: false, error: "Nombre del evento, cliente y fecha son requeridos" },
        { status: 400 }
      );
    }

    const event = await prisma.event.create({
      data: {
        name,
        clientName,
        clientPhone: clientPhone || null,
        clientEmail: clientEmail || null,
        date: new Date(date),
        location: location || null,
        guestCount: guestCount || null,
        status: status || "COTIZACION",
        serviceType: serviceType || null,
        audioType: audioType || null,
        plannerId: plannerId || null,
        responsibleId: responsibleId || null,
        notes: notes || null,
        tenantId: auth.payload.tenantId,
      },
      include: {
        planner: { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true } },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_EVENTO",
        resource: "EVENT",
        resourceId: event.id,
        details: `Evento "${event.name}" creado para ${event.clientName}`,
      },
    });

    return NextResponse.json(
      { success: true, data: event, message: "Evento creado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear evento:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
