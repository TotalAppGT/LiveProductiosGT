import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

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

    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { success: false, error: "Item de inventario no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: item },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener item inventario:", error);
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

    const existingItem = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existingItem) {
      return NextResponse.json(
        { success: false, error: "Item de inventario no encontrado" },
        { status: 404 }
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
      lastCheckedAt,
    } = body;

    const previousStatus = existingItem.status;
    const previousLocation = existingItem.location;

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        category: category !== undefined ? category : undefined,
        quantity: quantity !== undefined ? quantity : undefined,
        assignedToId: assignedToId !== undefined ? assignedToId : undefined,
        status: status !== undefined ? status : undefined,
        location: location !== undefined ? location : undefined,
        notes: notes !== undefined ? notes : undefined,
        serialNumber: serialNumber !== undefined ? serialNumber : undefined,
        lastCheckedAt: lastCheckedAt !== undefined ? (lastCheckedAt ? new Date(lastCheckedAt) : null) : undefined,
      },
      include: {
        assignedTo: {
          select: { id: true, name: true },
        },
      },
    });

    const changes: string[] = [];
    if (status !== undefined && status !== previousStatus) {
      changes.push(`estado: ${previousStatus} → ${status}`);
    }
    if (location !== undefined && location !== previousLocation) {
      changes.push(`ubicación: ${previousLocation} → ${location}`);
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ACTUALIZAR_INVENTARIO",
        resource: "INVENTORY",
        resourceId: id,
        details: `Item "${item.name}" actualizado${changes.length ? ` (${changes.join(", ")})` : ""}`,
      },
    });

    return NextResponse.json(
      { success: true, data: item, message: "Item de inventario actualizado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar item inventario:", error);
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

    const { id } = await params;

    const existingItem = await prisma.inventoryItem.findUnique({ where: { id } });
    if (!existingItem) {
      return NextResponse.json(
        { success: false, error: "Item de inventario no encontrado" },
        { status: 404 }
      );
    }

    await prisma.inventoryItem.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ELIMINAR_INVENTARIO",
        resource: "INVENTORY",
        resourceId: id,
        details: `Item "${existingItem.name}" eliminado del inventario`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Item de inventario eliminado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en eliminar item inventario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;
