import { NextRequest, NextResponse } from "next/server";
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
    const ids = searchParams.get("ids")?.split(",").map((s) => s.trim()).filter(Boolean);

    const report = await buildGeneralReport(ids);
    if (!report) {
      return NextResponse.json({ success: false, error: "No hay cuadros para reportar" }, { status: 404 });
    }

    if (format === "pdf") {
      const buf = await reportPdf(report);
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="reporte-general-cuadros.pdf"',
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }
    const buf = await reportXlsx(report);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="reporte-general-cuadros.xlsx"',
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error en reporte general:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
