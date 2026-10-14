import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { geocode } from "@/lib/geocode";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    const { id } = await params;
    const { name, address, lat, lng, type, geocode: doGeo } = await request.json();

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (address !== undefined) data.address = address;
    if (type !== undefined) data.type = type;
    if (doGeo && address) {
      const geo = await geocode(address);
      if (geo) { data.lat = geo.lat; data.lng = geo.lng; }
    } else {
      if (Number.isFinite(Number(lat))) data.lat = Number(lat);
      if (Number.isFinite(Number(lng))) data.lng = Number(lng);
    }

    const place = await prisma.place.update({ where: { id }, data });
    return NextResponse.json({ success: true, data: place });
  } catch (error) {
    console.error("Error places PUT:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    const { id } = await params;
    await prisma.place.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error places DELETE:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
