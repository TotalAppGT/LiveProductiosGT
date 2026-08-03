import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ success: true, data: { status: "connected" } });
  } catch (error) {
    console.error("DB health check error:", error);
    return NextResponse.json({ success: false, error: "Database connection failed" }, { status: 500 });
  }
}
