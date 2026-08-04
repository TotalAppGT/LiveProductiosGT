import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

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
    const userId = searchParams.get("userId") || undefined;
    const type = searchParams.get("type") || undefined;
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const eventId = searchParams.get("eventId") || undefined;
    const aggregate = searchParams.get("aggregate") === "true";
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (eventId) where.eventId = eventId;

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
    }

    if (aggregate) {
      const [records, aggregation] = await Promise.all([
        prisma.incomeRecord.findMany({
          where,
          include: {
            user: { select: { id: true, name: true } },
            event: { select: { id: true, name: true } },
            recordedBy: { select: { id: true, name: true } },
          },
        }),
        prisma.incomeRecord.groupBy({
          by: ["userId", "type"],
          where,
          _sum: { amount: true },
        }),
      ]);

      const userAggregates = records.reduce(
        (acc: Record<string, { name: string; total: number; records: typeof records }>, r) => {
          if (!acc[r.userId]) {
            acc[r.userId] = { name: r.user.name, total: 0, records: [] };
          }
          acc[r.userId].total += r.amount;
          acc[r.userId].records.push(r);
          return acc;
        },
        {}
      );

      return NextResponse.json(
        {
          success: true,
          data: records,
          aggregate: Object.entries(userAggregates).map(([id, data]) => ({
            userId: id,
            name: (data as { name: string }).name,
            total: (data as { total: number }).total,
            count: (data as { records: unknown[] }).records.length,
          })),
          byType: aggregation.map((a) => ({
            userId: a.userId,
            type: a.type,
            total: a._sum.amount || 0,
          })),
        },
        { status: 200 }
      );
    }

    const [records, total] = await Promise.all([
      prisma.incomeRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true } },
          event: { select: { id: true, name: true } },
          recordedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.incomeRecord.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: records,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar income:", error);
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
    const { amount, description, type, userId, eventId } = body;

    if (!amount || !description || !userId) {
      return NextResponse.json(
        { success: false, error: "Monto, descripción y usuario son requeridos" },
        { status: 400 }
      );
    }

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "El monto debe ser un número positivo" },
        { status: 400 }
      );
    }

    const validTypes = ["COBRO", "COMISION", "BONO", "OTRO"];
    const incomeType = type && validTypes.includes(type) ? type : "COBRO";

    const record = await prisma.incomeRecord.create({
      data: {
        amount,
        description,
        type: incomeType,
        userId,
        eventId: eventId || null,
        recordedById: auth.payload.userId,
      },
      include: {
        user: { select: { id: true, name: true } },
        event: { select: { id: true, name: true } },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "REGISTRAR_INGRESO",
        resource: "INCOME",
        resourceId: record.id,
        details: `Ingreso de Q${record.amount} registrado para ${record.user.name} - ${record.description}`,
      },
    });

    return NextResponse.json(
      { success: true, data: record, message: "Ingreso registrado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear income:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
