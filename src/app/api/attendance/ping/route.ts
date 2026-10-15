import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { registerAttendance } from "@/lib/attendance";

// Reporte de ubicación desde la app Android (GPS) para marcar ENTRADA/SALIDA.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    const { lat, lng, type, place } = await request.json();
    const res = await registerAttendance({
      userId: auth.payload.userId,
      lat: Number(lat),
      lng: Number(lng),
      type: type || "ENTRADA",
      placeName: place || null,
      source: "APP",
    });
    return NextResponse.json({ success: true, data: res });
  } catch (error) {
    console.error("Error attendance ping:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
