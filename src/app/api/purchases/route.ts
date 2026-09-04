import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const assignedToId = searchParams.get("assignedToId") || undefined;
    const search = searchParams.get("search") || "";
    const dueDateFrom = searchParams.get("dueDateFrom") || undefined;
    const dueDateTo = searchParams.get("dueDateTo") || undefined;
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Prisma.PurchaseWhereInput = {};
    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (dueDateFrom || dueDateTo) {
      where.dueDate = {};
      if (dueDateFrom) (where.dueDate as any).gte = new Date(dueDateFrom);
      if (dueDateTo) (where.dueDate as any).lte = new Date(dueDateTo);
    }

    const purchases = await prisma.purchase.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: limit,
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: purchases }, { status: 200 });
  } catch (error) {
    console.error("Error listando compras:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { title, description, amount, advance, provider, status, dueDate, priority, assignedToId } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ success: false, error: "El título es requerido" }, { status: 400 });
    }

    const purchase = await prisma.purchase.create({
      data: {
        title: title.trim(),
        description: description || "",
        amount: amount ? Number(amount) : null,
        advance: advance ? Number(advance) : null,
        provider: provider || null,
        status: status || "PENDIENTE",
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "MEDIA",
        assignedToId: assignedToId || auth.payload.userId,
        assignedById: auth.payload.userId,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
        assignedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: purchase }, { status: 201 });
  } catch (error) {
    console.error("Error creando compra:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
