import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { compareOrders } from "@/lib/order-compare";
import { writeComparisonToSheet, getReportSheetId, getFolderId, createComparisonSheetInFolder } from "@/lib/google-sheets";

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
      sourceId: body?.sourceId ? String(body.sourceId) : undefined,
      targetId: body?.targetId ? String(body.targetId) : undefined,
      targetMode: body?.targetMode === "largest" ? ("largest" as const) : undefined,
    };
    const data = await compareOrders(ids, options);
    const folderId = await getFolderId();
    if (folderId) {
      const sheet = await createComparisonSheetInFolder(data, folderId);
      return NextResponse.json({ success: true, data: sheet });
    }
    const spreadsheetId = await getReportSheetId();
    if (!spreadsheetId) return NextResponse.json({ success: false, error: "Falta configurar google_sheets_folder_id o google_sheets_report_id" }, { status: 400 });
    const sheet = await writeComparisonToSheet(data, spreadsheetId);
    return NextResponse.json({ success: true, data: sheet });
  } catch (error) {
    console.error("Error creando comparativa en Sheets:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
