import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const search = new URL(request.url).searchParams.get("search") || "";
    const suppliers = await prisma.supplier.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" } } : {},
      orderBy: { name: "asc" },
      include: { _count: { select: { purchases: true } } },
    });
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error) {
    console.error("Error listando proveedores:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body = await request.json();
    if (!body.name?.trim()) return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });
    const supplier = await prisma.supplier.create({
      data: {
        name: body.name.trim(),
        contactName: body.contactName || null,
        phone: body.phone || null,
        whatsapp: body.whatsapp || null,
        email: body.email || null,
        nit: body.nit || null,
        categories: Array.isArray(body.categories) ? body.categories : [],
        notes: body.notes || null,
      },
    });
    return NextResponse.json({ success: true, data: supplier }, { status: 201 });
  } catch (error) {
    console.error("Error creando proveedor:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
