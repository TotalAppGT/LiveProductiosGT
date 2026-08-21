import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { sendLUNAUpdateBroadcast } from "@/lib/broadcast";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json(
        { success: false, error: "Solo Dueño, Admin o Jefe pueden enviar broadcast" },
        { status: 403 }
      );
    }

    const result = await sendLUNAUpdateBroadcast(auth.payload.userId);

    return NextResponse.json(
      {
        success: true,
        ...result,
        meetingTime: result.meetingTime.toLocaleString("es-GT", { timeZone: "America/Guatemala" }),
        message: `Broadcast enviado: ${result.sent} entregados, ${result.failed} fallidos. ${result.remindersCreated} recordatorios de reunión creados para mañana 11:00 a.m.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en broadcast:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
