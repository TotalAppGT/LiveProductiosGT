import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { sendMessage } from "@/lib/whatsapp";

interface SheetTaskData {
  title: string;
  description?: string;
  assignedToEmail?: string;
  dueDate?: string;
  category?: string;
  priority?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "Solo jefes y superiores pueden importar tareas" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { data } = body as { data: SheetTaskData[] };

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { success: false, error: "Se requiere un arreglo de datos para importar" },
        { status: 400 }
      );
    }

    const validCategories = [
      "PRE_EVENTO", "POST_EVENTO", "COTIZACION", "COBRO",
      "INVENTARIO", "VEHICULO", "PERSONAL", "BODEGA",
      "MANTENIMIENTO", "ADMINISTRACION", "OTRO",
    ];

    const validPriorities = ["BAJA", "MEDIA", "ALTA", "URGENTE"];

    const results = {
      imported: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [] as string[],
    };

    for (const item of data) {
      try {
        if (!item.title || item.title.trim().length === 0) {
          results.skipped++;
          results.errorDetails.push(`Fila omitida: título vacío`);
          continue;
        }

        let assignedToId: string | null = null;
        if (item.assignedToEmail) {
          const user = await prisma.user.findUnique({
            where: { email: item.assignedToEmail },
            select: { id: true, name: true, phone: true, whatsappNumber: true },
          });
          if (user) {
            assignedToId = user.id;
          } else {
            results.errorDetails.push(
              `Tarea "${item.title}": usuario con email "${item.assignedToEmail}" no encontrado`
            );
          }
        }

        const category = item.category && validCategories.includes(item.category)
          ? item.category
          : "OTRO";

        const priority = item.priority && validPriorities.includes(item.priority)
          ? item.priority
          : "MEDIA";

        const task = await prisma.task.create({
          data: {
            title: item.title.trim(),
            description: item.description?.trim() || null,
            assignedToId,
            assignedById: auth.payload.userId,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            category: category as any,
            priority: priority as any,
            type: "DINAMICA",
          },
          include: {
            assignedTo: {
              select: { id: true, name: true, phone: true, whatsappNumber: true },
            },
          },
        });

        await prisma.activity.create({
          data: {
            userId: auth.payload.userId,
            action: "IMPORTAR_TAREA",
            resource: "TASK",
            resourceId: task.id,
            details: `Tarea "${task.title}" importada desde Google Sheets`,
          },
        });

        if (task.assignedTo?.whatsappNumber || task.assignedTo?.phone) {
          const to = task.assignedTo.whatsappNumber || task.assignedTo.phone;
          if (to) {
            sendMessage(
              to,
              `📋 *Nueva Tarea Importada*\n\nTarea: ${task.title}\nCategoría: ${task.category}\nPrioridad: ${task.priority}\n${task.dueDate ? `Vence: ${new Date(task.dueDate).toLocaleDateString("es-GT")}` : "Sin fecha"}\n\nImportada por lote desde Google Sheets.`
            ).catch(() => {});
          }
        }

        results.imported++;
      } catch (error) {
        results.errors++;
        results.errorDetails.push(
          `Error importando "${item.title}": ${error instanceof Error ? error.message : "Error desconocido"}`
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: results,
        message: `Importación completada: ${results.imported} tareas creadas, ${results.skipped} omitidas, ${results.errors} errores.`,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en importación de tareas:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
