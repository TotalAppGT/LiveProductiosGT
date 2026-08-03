import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { askDeepSeek } from "@/lib/deepseek";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId") || auth.payload.userId;

    const [
      taskStats,
      todayTasks,
      overdueCobros,
      todayEvents,
      inventoryIssues,
      recentActivities,
    ] = await Promise.all([
      prisma.task.groupBy({
        by: ["status"],
        where: {
          assignedToId: targetUserId,
          status: { not: "CANCELADA" },
        },
        _count: { id: true },
      }),
      prisma.task.findMany({
        where: {
          assignedToId: targetUserId,
          status: { notIn: ["COMPLETADA", "CANCELADA"] },
          OR: [
            { dueDate: { gte: today, lt: tomorrow } },
            { status: "EN_PROCESO" },
          ],
        },
        orderBy: { priority: "desc" },
        take: 15,
        select: { id: true, title: true, status: true, priority: true, category: true, dueDate: true },
      }),
      prisma.cobro.findMany({
        where: {
          status: "PENDIENTE",
          dueDate: { lt: today },
        },
        select: { id: true, clientName: true, amount: true, dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 5,
      }),
      prisma.event.findMany({
        where: {
          date: { gte: today, lt: tomorrow },
          status: { in: ["CONFIRMADO", "EN_PROGRESO"] },
        },
        select: { id: true, name: true, clientName: true, date: true, location: true, status: true },
        orderBy: { date: "asc" },
      }),
      prisma.inventoryItem.findMany({
        where: { status: { in: ["DANADO", "PERDIDO", "EN_REPARACION"] } },
        select: { id: true, name: true, status: true, quantity: true },
        take: 5,
      }),
      prisma.activity.findMany({
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    const completed = taskStats.find((t) => t.status === "COMPLETADA")?._count.id || 0;
    const pending = taskStats.find((t) => t.status === "PENDIENTE")?._count.id || 0;
    const inProgress = taskStats.find((t) => t.status === "EN_PROCESO")?._count.id || 0;
    const totalActive = completed + pending + inProgress;

    const tasksText = todayTasks
      .map((t) => `- ${t.title} (${t.status}, ${t.priority})`)
      .join("\n");

    const eventsText = todayEvents
      .map((e) => `- ${e.name} (${e.clientName}) ${e.location || "Sin ubicación"}`)
      .join("\n");

    const cobrosText = overdueCobros
      .map((c) => `- ${c.clientName}: Q${c.amount}`)
      .join("\n");

    const systemPrompt = `Eres un asistente que genera reportes diarios para una empresa de producción de eventos en vivo. Responde en español, en formato de reporte profesional. Máximo 3 párrafos. Incluye secciones de: Resumen General, Tareas del Día, Alertas.`;

    const userPrompt = `Genera un reporte diario con estos datos:

RESUMEN DE TAREAS:
- Total activas: ${totalActive}
- Completadas: ${completed}
- En progreso: ${inProgress}
- Pendientes: ${pending}

TAREAS DE HOY:
${tasksText || "No hay tareas para hoy"}

EVENTOS DE HOY:
${eventsText || "No hay eventos programados para hoy"}

COBROS VENCIDOS:
${cobrosText || "No hay cobros vencidos"}

PROBLEMAS DE INVENTARIO: ${inventoryIssues.length} items con problemas
${inventoryIssues.map((i) => `- ${i.name} (${i.status})`).join("\n") || "Sin problemas"}

Fecha: ${today.toLocaleDateString("es-GT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`;

    const aiReport = await askDeepSeek(
      [{ role: "user", content: userPrompt }],
      systemPrompt
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          reporteIA: aiReport,
          estadisticas: {
            tareas: {
              total: totalActive,
              completadas: completed,
              enProgreso: inProgress,
              pendientes: pending,
            },
            tareasHoy: todayTasks,
            eventosHoy: todayEvents,
            cobrosVencidos: overdueCobros,
            inventarioAlertas: inventoryIssues,
          },
          actividadesRecientes: recentActivities.map((a) => ({
            id: a.id,
            usuario: a.user?.name || "Desconocido",
            accion: a.action,
            detalles: a.details,
            fecha: a.createdAt,
          })),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en reporte diario:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
