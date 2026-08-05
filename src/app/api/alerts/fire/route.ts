import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { fireScheduledAlerts } from "@/lib/smart-scheduler";

export async function POST(req: NextRequest) {
  try {
    const auth = authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const result = await fireScheduledAlerts();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error en fire alerts API:", error);
    return NextResponse.json({ error: "Error al disparar alertas" }, { status: 500 });
  }
}
