import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
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
    const skip = (page - 1) * limit;

    const where: Prisma.VehicleWhereInput = {};

    if (status) where.status = status as any;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { plate: { contains: search, mode: "insensitive" } },
      ];
    }

    const [vehicles, total] = await Promise.all([
      prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          assignedTo: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.vehicle.count({ where }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: vehicles,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar vehículos:", error);
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

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "No tienes permisos para crear vehículos" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      name,
      plate,
      type,
      status,
      assignedToId,
      mileage,
      fuelLevel,
      notes,
    } = body;

    if (!name || !plate) {
      return NextResponse.json(
        { success: false, error: "Nombre y placa son requeridos" },
        { status: 400 }
      );
    }

    const existingVehicle = await prisma.vehicle.findUnique({
      where: { plate: plate.toUpperCase() },
    });
    if (existingVehicle) {
      return NextResponse.json(
        { success: false, error: "Ya existe un vehículo con esa placa" },
        { status: 409 }
      );
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        name,
        plate: plate.toUpperCase(),
        type: type || "OTRO",
        status: status || "DISPONIBLE",
        assignedToId: assignedToId || null,
        mileage: mileage || null,
        fuelLevel: fuelLevel || null,
        notes: notes || null,
        tenantId: auth.payload.tenantId,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "CREAR_VEHICULO",
        resource: "VEHICLE",
        resourceId: vehicle.id,
        details: `Vehículo "${vehicle.name}" (${vehicle.plate}) registrado`,
      },
    });

    return NextResponse.json(
      { success: true, data: vehicle, message: "Vehículo creado exitosamente" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en crear vehículo:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
