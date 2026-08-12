import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

// Añadir registro de gasolina durante el uso
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();
    const { kmBefore, kmAfter, amount, photos } = body;

    const fuel = await prisma.vehicleLogFuel.create({
      data: {
        logId: id,
        kmBefore: kmBefore ? parseInt(kmBefore) : null,
        kmAfter: kmAfter ? parseInt(kmAfter) : null,
        amount: amount || null,
        photos: photos || [],
      },
    });

    return NextResponse.json({ success: true, data: fuel });
  } catch (error) {
    console.error("Error en fuel POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
