import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Determinar la fase actual del evento según la fecha
function getPhase(eventDate: Date, now: Date): { phase: string; label: string } {
  const dayDiff = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (dayDiff > 1) return { phase: "PRE_EVENTO", label: "Pre Evento" };
  if (dayDiff >= -1) return { phase: "EVENTO", label: "Evento (montaje/día)" };
  return { phase: "POST_EVENTO", label: "Post Evento" };
}

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 21);

    // Eventos próximos (7 días atrás a 3 semanas adelante)
    const events = await prisma.event.findMany({
      where: { date: { gte: from, lte: to }, status: { in: ["CONFIRMADO", "EN_PROGRESO"] } },
      orderBy: { date: "asc" },
      include: {
        planner: { select: { name: true } },
        responsible: { select: { name: true } },
        tasks: {
          where: { status: { in: ["PENDIENTE", "EN_PROCESO"] } },
          orderBy: { dueDate: "asc" },
          select: {
            id: true, title: true, status: true, priority: true, category: true, dueDate: true,
            assignedTo: { select: { name: true } },
          },
        },
      },
    });

    // Tareas sin evento asignado, pero con categoría de fase
    const phaseTasks = await prisma.task.findMany({
      where: {
        eventId: null,
        status: { in: ["PENDIENTE", "EN_PROCESO"] },
        category: { in: ["PRE_EVENTO", "EVENTO", "POST_EVENTO"] },
      },
      orderBy: { dueDate: "asc" },
      select: {
        id: true, title: true, status: true, priority: true, category: true, dueDate: true,
        assignedTo: { select: { name: true } },
      },
    });

    const result = events.map((event) => {
      const { phase, label } = getPhase(event.date, now);
      const pre = event.tasks.filter((t) => t.category === "PRE_EVENTO");
      const durante = event.tasks.filter((t) => t.category === "EVENTO");
      const post = event.tasks.filter((t) => t.category === "POST_EVENTO");
      return {
        id: event.id,
        name: event.name,
        clientName: event.clientName,
        date: event.date,
        status: event.status,
        phase,
        phaseLabel: label,
        pre,
        durante,
        post,
        total: event.tasks.length,
        planner: event.planner?.name,
        responsible: event.responsible?.name,
      };
    });

    return NextResponse.json({
      success: true,
      data: { events: result, phaseTasks },
    });
  } catch (error) {
    console.error("Error en event-cycle:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
