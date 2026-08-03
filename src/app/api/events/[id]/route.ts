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

    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        planner: { select: { id: true, name: true, email: true, phone: true } },
        responsible: { select: { id: true, name: true, email: true, phone: true } },
        tasks: {
          include: {
            assignedTo: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        cobros: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, data: event },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener evento:", error);
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

    const existingEvent = await prisma.event.findUnique({ where: { id } });
    if (!existingEvent) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 }
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

    const event = await prisma.event.update({
      where: { id },
      data: {
        name: name !== undefined ? name : undefined,
        clientName: clientName !== undefined ? clientName : undefined,
        clientPhone: clientPhone !== undefined ? clientPhone : undefined,
        clientEmail: clientEmail !== undefined ? clientEmail : undefined,
        date: date !== undefined ? new Date(date) : undefined,
        location: location !== undefined ? location : undefined,
        guestCount: guestCount !== undefined ? guestCount : undefined,
        status: status !== undefined ? status : undefined,
        serviceType: serviceType !== undefined ? serviceType : undefined,
        audioType: audioType !== undefined ? audioType : undefined,
        plannerId: plannerId !== undefined ? plannerId : undefined,
        responsibleId: responsibleId !== undefined ? responsibleId : undefined,
        notes: notes !== undefined ? notes : undefined,
      },
      include: {
        planner: { select: { id: true, name: true } },
        responsible: { select: { id: true, name: true } },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ACTUALIZAR_EVENTO",
        resource: "EVENT",
        resourceId: id,
        details: `Evento "${event.name}" actualizado`,
      },
    });

    return NextResponse.json(
      { success: true, data: event, message: "Evento actualizado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar evento:", error);
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
        { success: false, error: "Solo administradores pueden eliminar eventos" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const existingEvent = await prisma.event.findUnique({ where: { id } });
    if (!existingEvent) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 }
      );
    }

    await prisma.event.delete({ where: { id } });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "ELIMINAR_EVENTO",
        resource: "EVENT",
        resourceId: id,
        details: `Evento "${existingEvent.name}" eliminado`,
      },
    });

    return NextResponse.json(
      { success: true, message: "Evento eliminado exitosamente" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en eliminar evento:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
