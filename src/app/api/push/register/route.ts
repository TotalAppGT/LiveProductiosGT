import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const auth = authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const userId = auth.payload.userId;

    const { token, platform } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    await prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform: platform || "expo" },
      create: { token, userId, platform: platform || "expo" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error registrando push token:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = authenticateRequest(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { token } = await req.json();
    if (token) {
      await prisma.pushToken.deleteMany({
        where: { token, userId: auth.payload.userId },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando push token:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
