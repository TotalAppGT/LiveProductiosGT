import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { runDataFix } from "@/lib/data-fix";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo Administradores o Dueño" },
        { status: 403 }
      );
    }

    const r = await runDataFix();

    return NextResponse.json(
      {
        success: true,
        data: r,
        message: `Corrección completada: ${r.fixedNormalized} fijas sin fecha concreta, ${r.duplicatesDeleted} duplicados eliminados, ${r.variablesAnchored} variables ancladas a su día${r.renamedAdmin ? ", cuenta renombrada a Daniel" : ""}.`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en fix-task-data:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
