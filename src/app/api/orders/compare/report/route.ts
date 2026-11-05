import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { compareOrders } from "@/lib/order-compare";
import { buildReportTabs } from "@/lib/compare-report";
import * as XLSX from "xlsx";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length < 2) return NextResponse.json({ success: false, error: "Seleccioná al menos 2 cuadros" }, { status: 400 });

    const data = await compareOrders(ids);
    const wb = XLSX.utils.book_new();
    for (const tab of buildReportTabs(data)) {
      const ws = XLSX.utils.aoa_to_sheet(tab.rows);
      ws["!cols"] = tab.widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, tab.name);
    }
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="comparativa-${data.source.orderNumber}-${data.target.orderNumber}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error generando comparativa:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
