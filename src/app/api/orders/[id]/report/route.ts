import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { buildCuadroReport, reportPdf, reportXlsx } from "@/lib/cuadro-report";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "xlsx").toLowerCase();

    const report = await buildCuadroReport(id);
    if (!report) {
      return NextResponse.json({ success: false, error: "Cuadro no encontrado" }, { status: 404 });
    }

    if (format === "pdf") {
      const buf = await reportPdf(report);
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="cuadro-${report.orderNumber}.pdf"`,
        },
      });
    }
    const buf = await reportXlsx(report);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="cuadro-${report.orderNumber}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error en reporte de cuadro:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
