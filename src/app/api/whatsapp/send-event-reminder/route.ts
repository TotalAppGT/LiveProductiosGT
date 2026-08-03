import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { sendEventReminder } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { eventId } = body;

    if (!eventId) {
      return NextResponse.json({ success: false, error: "eventId requerido" }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        planner: true,
        responsible: true,
        tasks: { include: { assignedTo: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ success: false, error: "Evento no encontrado" }, { status: 404 });
    }

    const staffToNotify = new Set<string>();
    const users = [];

    if (event.planner) {
      staffToNotify.add(event.planner.id);
      users.push(event.planner);
    }
    if (event.responsible) {
      staffToNotify.add(event.responsible.id);
      if (!users.find(u => u.id === event.responsible!.id)) {
        users.push(event.responsible);
      }
    }

    for (const task of event.tasks) {
      if (task.assignedTo && !staffToNotify.has(task.assignedTo.id)) {
        staffToNotify.add(task.assignedTo.id);
        users.push(task.assignedTo);
      }
    }

    if (users.length === 0) {
      return NextResponse.json({ success: false, error: "No hay staff asignado al evento" }, { status: 400 });
    }

    const staff = users.map(u => ({ user: u, role: u.role }));

    const results = await sendEventReminder(
      {
        id: event.id,
        name: event.name,
        date: event.date,
        location: event.location,
        clientName: event.clientName,
      },
      staff
    );

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "WHATSAPP_REMINDER",
        resource: "EVENT",
        resourceId: eventId,
        details: `Recordatorio enviado a ${users.length} personas para evento "${event.name}"`,
      },
    });

    return NextResponse.json({
      success: true,
      data: { sent: results.length, total: staff.length },
      message: `Recordatorio enviado a ${results.length} de ${staff.length} personas`,
    });
  } catch (error) {
    console.error("Error en send-event-reminder:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
