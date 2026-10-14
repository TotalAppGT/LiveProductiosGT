import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { geocode } from "@/lib/geocode";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const places = await prisma.place.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ success: true, data: places });
  } catch (error) {
    console.error("Error places GET:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// Crea un lugar. Si no vienen lat/lng, intenta geocodificar la dirección.
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const { name, address, lat, lng, type } = await request.json();
    if (!name) return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });

    let finalLat = Number(lat);
    let finalLng = Number(lng);
    if (!Number.isFinite(finalLat) || !Number.isFinite(finalLng)) {
      if (!address) return NextResponse.json({ success: false, error: "Dirección o coordenadas requeridas" }, { status: 400 });
      const geo = await geocode(address);
      if (!geo) return NextResponse.json({ success: false, error: "No se pudo ubicar la dirección. Ingresá lat/lng." }, { status: 400 });
      finalLat = geo.lat;
      finalLng = geo.lng;
    }

    const place = await prisma.place.create({
      data: { name, address: address || null, lat: finalLat, lng: finalLng, type: type || "EVENTO" },
    });
    return NextResponse.json({ success: true, data: place });
  } catch (error) {
    console.error("Error places POST:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
