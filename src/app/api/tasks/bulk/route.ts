import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "Se requiere rol de Jefe o superior" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    // Obtener todos los usuarios para mapear nombres
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
    });

    let created = 0;
    let errors: string[] = [];

    for (const row of rows as any[]) {
      try {
        const title = (row.titulo || row.title || "").toString().trim();
        if (!title || title.startsWith("Ejemplo:")) continue;

        const assignedName = (row.asignado_a || row.assignedTo || "").toString().trim();
        let assignedToId: string | null = null;
        if (assignedName) {
          const u = users.find(
            (x) => x.name.toLowerCase() === assignedName.toLowerCase() || x.email.toLowerCase() === assignedName.toLowerCase()
          );
          if (u) assignedToId = u.id;
        }

        const dueDateRaw = (row.fecha_vencimiento || row.dueDate || "").toString().trim();
        let dueDate: Date | null = null;
        if (dueDateRaw) {
          const d = new Date(dueDateRaw);
          if (!isNaN(d.getTime())) dueDate = d;
        }

        const priority = (row.prioridad || row.priority || "MEDIA").toString().toUpperCase();
        const validPriorities = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
        const finalPriority = validPriorities.includes(priority) ? priority : "MEDIA";

        const category = (row.categoria || row.category || "PRE_EVENTO").toString().toUpperCase();
        const validCategories = ["PRE_EVENTO", "EVENTO", "POST_EVENTO", "COTIZACION", "COBRO", "INVENTARIO", "VEHICULO", "PERSONAL", "BODEGA", "MANTENIMIENTO", "ADMINISTRACION", "OTRO"];
        const finalCategory = validCategories.includes(category) ? category : "OTRO";

        const type = (row.tipo || row.type || "DINAMICA").toString().toUpperCase();
        const finalType = type === "FIJA" ? "FIJA" : "DINAMICA";

        let frequency = null;
        let dayOfWeek = null;
        if (finalType === "FIJA") {
          const freq = (row.frecuencia || row.frequency || "").toString().toUpperCase();
          if (["DIARIA", "SEMANAL", "MENSUAL"].includes(freq)) frequency = freq;
          const day = (row.dia_semana || row.dayOfWeek || "").toString().toUpperCase();
          if (["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"].includes(day)) dayOfWeek = day;
        }

        await prisma.task.create({
          data: {
            title,
            description: (row.descripcion || row.description || "").toString() || null,
            assignedToId: assignedToId || auth.payload.userId,
            assignedById: auth.payload.userId,
            dueDate,
            priority: finalPriority as any,
            category: finalCategory as any,
            type: finalType as any,
            frequency: frequency as any,
            dayOfWeek: dayOfWeek as any,
            status: "PENDIENTE",
          },
        });
        created++;
      } catch (e: any) {
        errors.push(`${row.titulo || "?"}: ${e?.message || "error"}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${created} tareas creadas`,
      created,
      errors,
    });
  } catch (error) {
    console.error("Error en carga masiva:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
