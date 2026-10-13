import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { analyzeCuadro } from "@/lib/inventory-availability";

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
    const analysis = await analyzeCuadro(id);
    if (!analysis) {
      return NextResponse.json({ success: false, error: "Cuadro no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: analysis });
  } catch (error) {
    console.error("Error analizando cuadro:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
