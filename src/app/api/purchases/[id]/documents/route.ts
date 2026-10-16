import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { uploadFile, storageConfigured, buildKey } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;
    const docs = await prisma.purchaseDocument.findMany({
      where: { purchaseId: id },
      orderBy: { createdAt: "desc" },
      include: { uploadedBy: { select: { name: true } } },
    });
    return NextResponse.json({ success: true, data: docs });
  } catch (error) {
    console.error("Error listando documentos:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    const { id } = await params;

    const purchase = await prisma.purchase.findUnique({ where: { id }, select: { id: true } });
    if (!purchase) return NextResponse.json({ success: false, error: "Compra no encontrada" }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "FACTURA");
    if (!file || typeof file === "string") {
      return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
    }

    const arrayBuf = Buffer.from(await file.arrayBuffer());
    const fileName = (file as File).name || "documento";
    const fileType = (file as File).type || "application/octet-stream";

    let fileUrl: string;
    let stored = "db";
    if (await storageConfigured()) {
      const key = buildKey(`purchases/${id}`, fileName);
      const up = await uploadFile(arrayBuf, key, fileType);
      fileUrl = up.url;
      stored = "r2";
    } else {
      // Respaldo temporal: guardar como data URL en la base (hasta configurar R2).
      fileUrl = `data:${fileType};base64,${arrayBuf.toString("base64")}`;
    }

    const doc = await prisma.purchaseDocument.create({
      data: {
        purchaseId: id,
        fileName,
        fileUrl,
        fileType,
        fileSize: arrayBuf.length,
        kind,
        uploadedById: auth.payload.userId,
      },
    });

    return NextResponse.json({ success: true, data: doc, storage: stored }, { status: 201 });
  } catch (error) {
    console.error("Error subiendo documento:", error);
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
    const { id } = await params;
    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId) return NextResponse.json({ success: false, error: "documentId requerido" }, { status: 400 });

    await prisma.purchaseDocument.deleteMany({ where: { id: documentId, purchaseId: id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error eliminando documento:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
