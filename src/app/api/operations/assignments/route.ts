import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { sendProactiveMessage } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { eventId, staffId, role, callTime, vehicleId, notes } = await request.json();
    if (!eventId || !staffId || !role) {
      return NextResponse.json({ success: false, error: "Evento, staff y rol son requeridos" }, { status: 400 });
    }

    const assignment = await prisma.eventCrewAssignment.create({
      data: {
        eventId,
        staffId,
        role,
        callTime: callTime || null,
        vehicleId: vehicleId || null,
        notes: notes || null,
      },
      include: {
        staff: { include: { user: { select: { id: true, name: true, phone: true, whatsappNumber: true } } } },
        event: { select: { id: true, name: true, date: true, venue: true } },
      },
    });

    // Confirmación automática por WhatsApp (best-effort).
    const phone = assignment.staff.phone || assignment.staff.user?.whatsappNumber || assignment.staff.user?.phone;
    if (phone) {
      const fecha = new Date(assignment.event.date).toLocaleDateString("es-GT", {
        timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long",
      });
      const lines = [
        "📋 *Asignación de staff*",
        `${assignment.event.name}`,
        `📅 ${fecha}${assignment.event.venue ? `\n📍 ${assignment.event.venue}` : ""}`,
        `Rol: *${role}*${callTime ? `\n🕐 Hora de llamada: ${callTime}` : ""}`,
        "",
        "Respondé *CONFIRMO* o *NO PUEDO*.",
      ];
      await sendProactiveMessage(phone, lines.join("\n")).catch(() => {});
    }

    return NextResponse.json({ success: true, data: assignment });
  } catch (error) {
    console.error("assignments POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { id, status, role, callTime, vehicleId, notes, checkedIn, checkedOut } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (status !== undefined) data.status = status;
    if (role !== undefined) data.role = role;
    if (callTime !== undefined) data.callTime = callTime || null;
    if (vehicleId !== undefined) data.vehicleId = vehicleId || null;
    if (notes !== undefined) data.notes = notes || null;
    if (checkedIn !== undefined) data.checkedInAt = checkedIn ? new Date() : null;
    if (checkedOut !== undefined) data.checkedOutAt = checkedOut ? new Date() : null;

    const assignment = await prisma.eventCrewAssignment.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: assignment });
  } catch (error) {
    console.error("assignments PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });
    await prisma.eventCrewAssignment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("assignments DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
