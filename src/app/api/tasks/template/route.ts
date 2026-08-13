import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import * as XLSX from "xlsx";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // Obtener usuarios para la hoja de referencia
    const users = await prisma.user.findMany({
      where: { active: true },
      select: { name: true, email: true },
    });

    // Hoja 1: Plantilla de tareas
    const templateData = [
      {
        titulo: "Ejemplo: Revisar equipo de sonido",
        descripcion: "Descripción breve de la tarea",
        asignado_a: "nombre del usuario (ej: Diana)",
        fecha_vencimiento: "YYYY-MM-DD (ej: 2026-08-15)",
        prioridad: "MEDIA (BAJA/MEDIA/ALTA/URGENTE)",
        categoria: "PRE_EVENTO (PRE_EVENTO/EVENTO/POST_EVENTO)",
        tipo: "DINAMICA (DINAMICA/FIJA)",
        frecuencia: "(DIARIA/SEMANAL/MENSUAL - solo para fijas)",
        dia_semana: "(LUNES/MARTES/... - solo para semanales)",
      },
    ];
    const wsTemplate = XLSX.utils.json_to_sheet(templateData);

    // Hoja 2: Referencia de usuarios
    const userData = users.map((u) => ({ nombre: u.name, email: u.email }));
    const wsUsers = XLSX.utils.json_to_sheet(userData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsTemplate, "Plantilla");
    XLSX.utils.book_append_sheet(wb, wsUsers, "Usuarios");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="plantilla-tareas.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error generando plantilla:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
