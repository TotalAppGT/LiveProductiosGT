import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { buildGeneralReport, reportPdf, reportXlsx } from "@/lib/cuadro-report";
import { buildKey, uploadFile } from "@/lib/storage";
import { sendDocument } from "@/lib/whatsapp";

// Genera el reporte, lo sube a R2/Drive y (opcional) lo envía por WhatsApp.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const { date, from, to, format = "xlsx", toPhone, caption } = body || {};
    const isPdf = String(format).toLowerCase() === "pdf";

    let ids: string[] | undefined;
    if (date || from) {
      const startStr = date || from;
      const endStr = date || to || from;
      const start = new Date(`${startStr}T00:00:00-06:00`);
      const end = new Date(`${endStr}T23:59:59.999-06:00`);
      const orders = await prisma.order.findMany({
        where: { eventDate: { gte: start, lte: end } },
        select: { id: true },
        orderBy: { eventDate: "asc" },
      });
      ids = orders.map((o) => o.id);
      if (ids.length === 0) {
        return NextResponse.json({ success: false, error: `No hay cuadros con fecha entre ${startStr} y ${endStr}` }, { status: 404 });
      }
    }

    const report = await buildGeneralReport(ids);
    if (!report) return NextResponse.json({ success: false, error: "No hay cuadros para reportar" }, { status: 404 });
    report.rangeLabel = date ? `Día ${date}` : from ? `Del ${from} al ${to || from}` : "General";

    const buf = isPdf ? await reportPdf(report) : await reportXlsx(report);
    const suffix = date || (from ? `${from}_${to || from}` : "general");
    const filename = `cuadros-${suffix}.${isPdf ? "pdf" : "xlsx"}`;
    const key = buildKey("reports", filename);
    const { url } = await uploadFile(
      buf,
      key,
      isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    const absolute = url.startsWith("http") ? url : `https://admin.liveproductionsgt.com${url}`;

    let sent = false;
    if (toPhone) {
      const r = await sendDocument(String(toPhone), absolute, filename, caption || `Reporte de cuadros ${suffix}`);
      sent = !!r;
    }

    return NextResponse.json({ success: true, data: { url: absolute, filename, sent } }, { status: 200 });
  } catch (error) {
    console.error("Error compartiendo reporte:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
