import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { eventId, service, venue, clientName, startAt, endAt, musicianId, status, notes } = await request.json();
    if (!eventId || !service) return NextResponse.json({ success: false, error: "Evento y servicio requeridos" }, { status: 400 });

    const item = await prisma.musicianShow.create({
      data: {
        eventId,
        service,
        venue: venue || null,
        clientName: clientName || null,
        startAt: startAt ? new Date(startAt) : null,
        endAt: endAt ? new Date(endAt) : null,
        musicianId: musicianId || null,
        status: status || "PENDIENTE",
        notes: notes || null,
      },
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("ops shows POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { id, service, venue, clientName, startAt, endAt, musicianId, status, notes } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "ID requerido" }, { status: 400 });
    const data: Record<string, unknown> = {};
    if (service !== undefined) data.service = service;
    if (venue !== undefined) data.venue = venue || null;
    if (clientName !== undefined) data.clientName = clientName || null;
    if (startAt !== undefined) data.startAt = startAt ? new Date(startAt) : null;
    if (endAt !== undefined) data.endAt = endAt ? new Date(endAt) : null;
    if (musicianId !== undefined) data.musicianId = musicianId || null;
    if (status !== undefined) data.status = status;
    if (notes !== undefined) data.notes = notes || null;
    const item = await prisma.musicianShow.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("ops shows PUT:", error);
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
    await prisma.musicianShow.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ops shows DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
