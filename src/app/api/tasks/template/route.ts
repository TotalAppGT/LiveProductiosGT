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

    const users = await prisma.user.findMany({
      where: { active: true },
      select: { name: true, position: true },
      orderBy: { name: "asc" },
    });

    // Hoja 1: Plantilla con ejemplos reales listos para copiar/editar
    const templateData = [
      {
        titulo: "revisar chat de pagos y autorizar BI",
        asignado_a: "Jorge Mérida",
        categoria: "ADMINISTRACION",
        tipo: "FIJA",
        frecuencia: "SEMANAL",
        dia_semana: "LUNES",
        fecha: "",
        hora: "09:00",
        prioridad: "ALTA",
      },
      {
        titulo: "revisar y enviar cotizaciones a los clientes",
        asignado_a: "Jorge Mérida",
        categoria: "COTIZACION",
        tipo: "FIJA",
        frecuencia: "SEMANAL",
        dia_semana: "LUNES",
        fecha: "",
        hora: "10:00",
        prioridad: "ALTA",
      },
      {
        titulo: "ofrecer servicio de Luxury, Charita, Piano y Violin",
        asignado_a: "Jorge Mérida",
        categoria: "PRE_EVENTO",
        tipo: "DINAMICA",
        frecuencia: "",
        dia_semana: "",
        fecha: "2026-08-24",
        hora: "09:00",
        prioridad: "MEDIA",
      },
      {
        titulo: "contactar a planner y pedir feedback",
        asignado_a: "Jorge Mérida",
        categoria: "POST_EVENTO",
        tipo: "DINAMICA",
        frecuencia: "",
        dia_semana: "",
        fecha: "2026-08-24",
        hora: "",
        prioridad: "MEDIA",
      },
    ];
    const wsTemplate = XLSX.utils.json_to_sheet(templateData);

    // Ajustar ancho de columnas para que sea legible
    wsTemplate["!cols"] = [
      { wch: 42 }, // titulo
      { wch: 18 }, // asignado_a
      { wch: 16 }, // categoria
      { wch: 12 }, // tipo
      { wch: 12 }, // frecuencia
      { wch: 12 }, // dia_semana
      { wch: 14 }, // fecha
      { wch: 8 },  // hora
      { wch: 12 }, // prioridad
    ];

    // Hoja 2: Lista de usuarios (copiar nombre exacto en asignado_a)
    const userData = users.map((u) => ({ nombre_exacto: u.name, puesto: u.position || "" }));
    const wsUsers = XLSX.utils.json_to_sheet(userData);
    wsUsers["!cols"] = [{ wch: 24 }, { wch: 20 }];

    // Hoja 3: Referencia de valores válidos
    const refData = [
      { campo: "categoria", valores: "PRE_EVENTO, EVENTO, POST_EVENTO, COTIZACION, COBRO, INVENTARIO, VEHICULO, PERSONAL, BODEGA, MANTENIMIENTO, ADMINISTRACION, OTRO" },
      { campo: "tipo", valores: "FIJA (se repite) o DINAMICA (puntual)" },
      { campo: "frecuencia", valores: "DIARIA, SEMANAL, MENSUAL (solo si tipo=FIJA)" },
      { campo: "dia_semana", valores: "LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO (para FIJA semanal)" },
      { campo: "fecha", valores: "YYYY-MM-DD (ej: 2026-08-24). Vacío para tareas fijas" },
      { campo: "hora", valores: "HH:MM (ej: 09:00). Vacío = sin hora específica" },
      { campo: "prioridad", valores: "BAJA, MEDIA, ALTA, URGENTE" },
    ];
    const wsRef = XLSX.utils.json_to_sheet(refData);
    wsRef["!cols"] = [{ wch: 14 }, { wch: 95 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsTemplate, "Plantilla");
    XLSX.utils.book_append_sheet(wb, wsUsers, "Usuarios");
    XLSX.utils.book_append_sheet(wb, wsRef, "Valores");

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
