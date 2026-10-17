import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { computeNeeds } from "@/lib/needs";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const raw = (new URL(request.url).searchParams.get("days") || "30").toLowerCase();
    const days = raw === "all" ? "all" : Math.max(1, Math.min(365, parseInt(raw) || 30));
    const data = await computeNeeds(days);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error needs:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const body = await request.json();
    const { itemKey, itemName, action, comment } = body || {};
    if (!itemKey) return NextResponse.json({ success: false, error: "itemKey requerido" }, { status: 400 });
    const allowed = ["COMPRAR", "RENTAR", "CONSULTAR"];
    const act = allowed.includes(action) ? action : "CONSULTAR";
    const review = await prisma.inventoryNeedReview.upsert({
      where: { itemKey },
      create: { itemKey, itemName: itemName || itemKey, action: act, comment: comment || null, reviewedById: auth.payload.userId },
      update: { itemName: itemName || undefined, action: act, comment: comment || null, reviewedById: auth.payload.userId },
    });
    return NextResponse.json({ success: true, data: review });
  } catch (error) {
    console.error("Error guardando revisión:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
