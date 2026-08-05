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

    const cobro = await prisma.cobro.findUnique({
      where: { id },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, phone: true },
        },
        event: {
          select: { id: true, name: true, clientName: true, date: true },
        },
      },
    });

    if (!cobro) {
      return NextResponse.json(
        { success: false, error: "Cobro no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: cobro },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener cobro:", error);
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

    const existingCobro = await prisma.cobro.findUnique({ where: { id } });
    if (!existingCobro) {
      return NextResponse.json(
        { success: false, error: "Cobro no encontrado" },
        { status: 404 }
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

    if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
      return NextResponse.json(
        { success: false, error: "El monto debe ser un número positivo" },
        { status: 400 }
      );
    }

    const cobro = await prisma.cobro.update({
      where: { id },
      data: {
        clientName: clientName !== undefined ? clientName : undefined,
        amount: amount !== undefined ? amount : undefined,
        status: status !== undefined ? status : undefined,
        invoiceNumber: invoiceNumber !== undefined ? invoiceNumber : undefined,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        assignedToId: assignedToId !== undefined ? assignedToId : undefined,
        notes: notes !== undefined ? notes : undefined,
        eventId: eventId !== undefined ? eventId : undefined,
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
        action: "ACTUALIZAR_COBRO",
        resource: "COBRO",
        resourceId: id,
        details: `Cobro de ${cobro.clientName} actualizado`,
      },
    });

    return NextResponse.json(
      { success: true, data: cobro, message: "Cobro actualizado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar cobro:", error);
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

    const existingCobro = await prisma.cobro.findUnique({ where: { id } });
    if (!existingCobro) {
      return NextResponse.json(
        { success: false, error: "Cobro no encontrado" },
        { status: 404 }
      );
    }

    await prisma.cobro.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ELIMINAR_COBRO",
        resource: "COBRO",
        resourceId: id,
        details: `Cobro de ${existingCobro.clientName} eliminado`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Cobro eliminado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en eliminar cobro:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export const PATCH = PUT;
