import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mp3",
];

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { success: false, error: "Content-Type debe ser multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const taskId = formData.get("taskId") as string | null;
    const eventId = formData.get("eventId") as string | null;
    const inventoryId = formData.get("inventoryId") as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No se proporcionó ningún archivo" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo de archivo no permitido. Tipos aceptados: ${ALLOWED_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: "El archivo excede el tamaño máximo de 10MB" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    const typeMap: Record<string, string> = {
      "image/jpeg": "IMAGE",
      "image/png": "IMAGE",
      "image/webp": "IMAGE",
      "application/pdf": "PDF",
      "audio/mp3": "AUDIO",
    };

    const fileType = typeMap[file.type] || "OTHER";

    const attachment = await prisma.fileAttachment.create({
      data: {
        fileName: file.name,
        fileUrl: dataUrl,
        fileType,
        fileSize: file.size,
        uploadedById: auth.payload.userId,
        taskId: taskId || null,
        eventId: eventId || null,
        inventoryId: inventoryId || null,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    });

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "SUBIR_ARCHIVO",
        resource: "FILE",
        resourceId: attachment.id,
        details: `Archivo "${file.name}" subido (${(file.size / 1024).toFixed(1)}KB)`,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...attachment,
          fileUrl: `/api/files/${attachment.id}`,
        },
        message: "Archivo subido exitosamente",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error en subir archivo:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
