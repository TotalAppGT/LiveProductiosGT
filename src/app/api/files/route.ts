import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const taskId = searchParams.get("taskId") || undefined;
    const eventId = searchParams.get("eventId") || undefined;
    const inventoryId = searchParams.get("inventoryId") || undefined;
    const uploadedById = searchParams.get("uploadedById") || undefined;
    const fileType = searchParams.get("fileType") || undefined;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (taskId) where.taskId = taskId;
    if (eventId) where.eventId = eventId;
    if (inventoryId) where.inventoryId = inventoryId;
    if (uploadedById) where.uploadedById = uploadedById;
    if (fileType) where.fileType = fileType;

    const [files, total] = await Promise.all([
      prisma.fileAttachment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          uploadedBy: {
            select: { id: true, name: true, avatar: true },
          },
          task: {
            select: { id: true, title: true },
          },
          event: {
            select: { id: true, name: true },
          },
          inventory: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.fileAttachment.count({ where }),
    ]);

    const formatted = files.map((f) => ({
      ...f,
      dataUrl: f.fileUrl,
    }));

    return NextResponse.json(
      {
        success: true,
        data: formatted,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en listar archivos:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
