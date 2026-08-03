import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { sendTaskReminder } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if ("error" in auth) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  if (!hasMinRole(auth.payload, "JEFE")) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId requerido" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const pendingTasks = await prisma.task.findMany({
      where: {
        assignedToId: userId,
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
        dueDate: { gte: today, lt: tomorrow },
      },
      orderBy: { priority: "desc" },
      take: 5,
    });

    let sent = 0;

    for (const task of pendingTasks) {
      const success = await sendTaskReminder(user, {
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        dueDate: task.dueDate,
        status: task.status,
      });
      if (success) sent++;
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "WHATSAPP_NUDGE",
        resource: "USER",
        resourceId: userId,
        details: `Recordatorio de cumplimiento enviado a ${user.name} (${sent} tareas)`,
      },
    });

    return NextResponse.json({
      success: true,
      data: { sent, pending: pendingTasks.length },
      message: `Se enviaron ${sent} recordatorios a ${user.name}`,
    });
  } catch (error) {
    console.error("Error en send-reminder:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
