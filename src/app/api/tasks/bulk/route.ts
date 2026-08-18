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

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true },
    });

    let created = 0;
    let duplicates = 0;
    let errors: string[] = [];

    function findUser(nameOrEmail: string) {
      const n = nameOrEmail.toLowerCase().trim();
      if (!n) return null;
      // Coincidencia exacta
      const exact = users.find(
        (x) => x.name.toLowerCase() === n || x.email.toLowerCase() === n
      );
      if (exact) return exact;
      // Coincidencia por primer nombre o apellido
      const partial = users.find(
        (x) => x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase().split(" ")[0])
      );
      return partial || null;
    }

    function parseDate(raw: string): Date | null {
      const s = raw.trim();
      if (!s) return null;
      // Formato YYYY-MM-DD
      let d = new Date(s);
      if (!isNaN(d.getTime())) return d;
      // Formato DD/MM/YYYY o DD-MM-YYYY
      const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
      if (m) {
        const dd = parseInt(m[1]), mm = parseInt(m[2]), yyyy = parseInt(m[3]);
        d = new Date(yyyy, mm - 1, dd);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    }

    for (const row of rows as any[]) {
      try {
        const title = (row.titulo || row.title || "").toString().trim();
        if (!title || title.startsWith("Ejemplo:")) continue;

        const assignedToId = findUser((row.asignado_a || row.assignedTo || row.asignado || "").toString());

        let dueDate = parseDate((row.fecha || row.fecha_vencimiento || row.dueDate || "").toString());
        const hora = (row.hora || row.hour || "").toString().trim();

        if (dueDate && hora) {
          const [h, min] = hora.split(":").map((x: string) => parseInt(x));
          if (!isNaN(h)) dueDate.setHours(h, min || 0, 0, 0);
        } else if (dueDate && !hora) {
          dueDate.setHours(9, 0, 0, 0);
        }

        const priority = (row.prioridad || row.priority || "MEDIA").toString().toUpperCase().trim();
        const validPriorities = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
        const finalPriority = validPriorities.includes(priority) ? priority : "MEDIA";

        const category = (row.categoria || row.category || "PRE_EVENTO").toString().toUpperCase().trim();
        const validCategories = ["PRE_EVENTO", "EVENTO", "POST_EVENTO", "COTIZACION", "COBRO", "INVENTARIO", "VEHICULO", "PERSONAL", "BODEGA", "MANTENIMIENTO", "ADMINISTRACION", "OTRO"];
        const finalCategory = validCategories.includes(category) ? category : "OTRO";

        const type = (row.tipo || row.type || "DINAMICA").toString().toUpperCase().trim();
        const finalType = type === "FIJA" ? "FIJA" : "DINAMICA";

        let frequency = null;
        let dayOfWeek = null;
        if (finalType === "FIJA") {
          const freq = (row.frecuencia || row.frequency || "").toString().toUpperCase().trim();
          if (["DIARIA", "SEMANAL", "MENSUAL"].includes(freq)) frequency = freq;
          const day = (row.dia_semana || row.dayOfWeek || "").toString().toUpperCase().trim();
          if (["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"].includes(day)) dayOfWeek = day;
        }

        const targetUserId = assignedToId?.id || auth.payload.userId;

        // Deduplicación: si ya existe una tarea PENDIENTE con el mismo título y asignado, la salta
        const dupeWhere: any = {
          assignedToId: targetUserId,
          title,
          status: { in: ["PENDIENTE", "EN_PROCESO"] },
        };
        if (finalType === "FIJA" && dayOfWeek) dupeWhere.dayOfWeek = dayOfWeek;
        const existing = await prisma.task.findFirst({ where: dupeWhere });
        if (existing) {
          duplicates++;
          continue;
        }

        await prisma.task.create({
          data: {
            title,
            description: (row.descripcion || row.description || "").toString() || null,
            assignedToId: targetUserId,
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
      message: `${created} tareas creadas${duplicates ? `, ${duplicates} duplicadas omitidas` : ""}`,
      created,
      duplicates,
      errors,
    });
  } catch (error) {
    console.error("Error en carga masiva:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
