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
    const limit = parseInt(searchParams.get("limit") || "50");
    const category = searchParams.get("category") || undefined;
    const status = searchParams.get("status") || undefined;
    const location = searchParams.get("location") || undefined;
    const search = searchParams.get("search") || "";
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = {};

    if (category) where.category = category as any;
    if (status) where.status = status as any;
    if (location) where.location = location as any;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { serialNumber: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar inventario:", error);
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
      category,
      quantity,
      assignedToId,
      status,
      location,
      notes,
      serialNumber,
    } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "El nombre del item es requerido" },
        { status: 400 }
      );
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name,
        category: category || "OTRO",
        quantity: quantity || 1,
        assignedToId: assignedToId || null,
        status: status || "DISPONIBLE",
        location: location || "Bodega Elgin",
        notes: notes || null,
        serialNumber: serialNumber || null,
        lastCheckedAt: new Date(),
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_INVENTARIO",
        resource: "INVENTORY",
        resourceId: item.id,
        details: `Item "${item.name}" agregado al inventario`,
      },
    });

    return NextResponse.json(
      { success: true, data: item, message: "Item de inventario creado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear item inventario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
