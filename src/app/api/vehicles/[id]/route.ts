import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

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

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!vehicle) {
      return NextResponse.json(
        { success: false, error: "Vehículo no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: vehicle },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener vehículo:", error);
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

    const existingVehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!existingVehicle) {
      return NextResponse.json(
        { success: false, error: "Vehículo no encontrado" },
        { status: 404 }
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
      lastMaintenanceAt,
      notes,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (plate !== undefined) updateData.plate = plate.toUpperCase();
    if (type !== undefined) updateData.type = type;
    if (status !== undefined) updateData.status = status;
    if (assignedToId !== undefined) updateData.assignedToId = assignedToId;
    if (mileage !== undefined) updateData.mileage = mileage;
    if (fuelLevel !== undefined) updateData.fuelLevel = fuelLevel;
    if (lastMaintenanceAt !== undefined)
      updateData.lastMaintenanceAt = lastMaintenanceAt ? new Date(lastMaintenanceAt) : null;
    if (notes !== undefined) updateData.notes = notes;

    const vehicle = await prisma.vehicle.update({
      where: { id },
      data: updateData,
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ACTUALIZAR_VEHICULO",
        resource: "VEHICLE",
        resourceId: id,
        details: `Vehículo "${vehicle.name}" (${vehicle.plate}) actualizado`,
      },
    });

    return NextResponse.json(
      { success: true, data: vehicle, message: "Vehículo actualizado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar vehículo:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

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
        { success: false, error: "Solo administradores pueden eliminar vehículos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingVehicle = await prisma.vehicle.findUnique({ where: { id } });
    if (!existingVehicle) {
      return NextResponse.json(
        { success: false, error: "Vehículo no encontrado" },
        { status: 404 }
      );
    }

    await prisma.vehicle.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ELIMINAR_VEHICULO",
        resource: "VEHICLE",
        resourceId: id,
        details: `Vehículo "${existingVehicle.name}" (${existingVehicle.plate}) eliminado`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Vehículo eliminado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en eliminar vehículo:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;
