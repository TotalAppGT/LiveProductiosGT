import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { buildGeneralReport, reportPdf, reportXlsx } from "@/lib/cuadro-report";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();
    let ids = searchParams.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean);
    const date = searchParams.get("date");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    let suffix = "general";

    // Filtro por día o rango (fechas de evento). Si vienen ids, tienen prioridad.
    if ((!ids || ids.length === 0) && (date || from)) {
      const startStr = date || from!;
      const endStr = date || to || from!;
      const start = new Date(`${startStr}T00:00:00-06:00`);
      const end = new Date(`${endStr}T23:59:59.999-06:00`);
      const orders = await prisma.order.findMany({
        where: { eventDate: { gte: start, lte: end } },
        select: { id: true },
        orderBy: { eventDate: "asc" },
      });
      ids = orders.map((o) => o.id);
      suffix = date ? date : `${startStr}_${endStr}`;
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: `No hay cuadros con fecha entre ${startStr} y ${endStr}` },
          { status: 404 }
        );
      }
    }

    const report = await buildGeneralReport(ids);
    if (!report) {
      return NextResponse.json({ success: false, error: "No hay cuadros para reportar" }, { status: 404 });
    }

    if (format === "pdf") {
      const buf = await reportPdf(report);
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="reporte-cuadros-${suffix}.pdf"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
    const buf = await reportXlsx(report);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte-cuadros-${suffix}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error en reporte general:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
