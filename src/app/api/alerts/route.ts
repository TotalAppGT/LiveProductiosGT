import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { userId } = auth.payload;

    const userGroups = await prisma.groupMember.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = userGroups.map((gm) => gm.groupId);

    const alerts = await prisma.scheduledAlert.findMany({
      where: {
        OR: [
          { targetUserId: userId },
          { groupId: { in: groupIds } },
          { createdById: userId },
        ],
      },
      include: {
        group: { select: { id: true, name: true } },
        targetUser: { select: { id: true, name: true } },
      },
      orderBy: { scheduledAt: "desc" },
    });

    return NextResponse.json(alerts);
  } catch (error) {
    return NextResponse.json({ error: "Error al obtener alertas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { title, message, type, scheduledAt, frequency, dayOfWeek, time, groupId, targetUserId } = await req.json();

    if (!title || !message || !type) {
      return NextResponse.json({ error: "Título, mensaje y tipo son requeridos" }, { status: 400 });
    }

    const alert = await prisma.scheduledAlert.create({
      data: {
        title,
        message,
        type,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        frequency,
        dayOfWeek,
        time,
        groupId,
        targetUserId,
        createdById: auth.payload.userId,
      },
    });

    return NextResponse.json(alert, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Error al crear alerta" }, { status: 500 });
  }
}
