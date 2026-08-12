import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeGTPhone } from "@/lib/phone";

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();
    if (!username) {
      return NextResponse.json({ success: false, error: "Usuario requerido" }, { status: 400 });
    }

    const clean = username.trim().toLowerCase();
    const normalizedPhone = normalizeGTPhone(username);

    // Buscar por email, nombre o teléfono
    const user = await prisma.user.findFirst({
      where: {
        active: true,
        OR: [
          { email: { equals: clean, mode: "insensitive" } },
          { name: { equals: username.trim(), mode: "insensitive" } },
          { name: { contains: username.trim(), mode: "insensitive" } },
          { phone: normalizedPhone },
          { whatsappNumber: normalizedPhone },
        ],
      },
      select: { email: true, name: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ success: true, email: user.email, name: user.name });
  } catch (error) {
    console.error("Error resolviendo usuario:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
