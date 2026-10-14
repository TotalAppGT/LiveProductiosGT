import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { WAREHOUSE_COORDS } from "@/lib/inventory";

// Coordenadas de bodegas (configurable en SystemConfig).
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const cfg = await prisma.systemConfig.findUnique({ where: { key: "warehouse_coords" } });
    let stored: { name: string; lat: number; lng: number; address: string }[] = [];
    try { stored = cfg ? JSON.parse(cfg.value) : []; } catch { stored = []; }

    const merged = Object.entries(WAREHOUSE_COORDS).map(([name, def]) => {
      const s = stored.find((x) => x.name === name);
      return { name, lat: s?.lat ?? def.lat, lng: s?.lng ?? def.lng, address: s?.address ?? def.address };
    });
    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    console.error("Error warehouses GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const value = JSON.stringify(body.warehouses || []);
    await prisma.systemConfig.upsert({
      where: { key: "warehouse_coords" },
      update: { value },
      create: { key: "warehouse_coords", value, description: "Coordenadas de bodegas" },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error warehouses PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
