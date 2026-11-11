import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { compareOrders } from "@/lib/order-compare";
import { buildComparisonPdf } from "@/lib/compare-pdf";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length < 2) return NextResponse.json({ success: false, error: "Seleccioná al menos 2 cuadros" }, { status: 400 });

    const options = {
      targetId: body?.targetId ? String(body.targetId) : undefined,
      targetMode: body?.targetMode === "largest" ? ("largest" as const) : undefined,
    };
    const data = await compareOrders(ids, options);
    const buf = await buildComparisonPdf(data);
    const name =
      data.mode === "pair"
        ? `trasiego-${data.source.orderNumber}-${data.target.orderNumber}.pdf`
        : `trasiego-${data.events.length}-cuadros.pdf`;

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error generando PDF de trasiego:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
