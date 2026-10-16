import { NextRequest, NextResponse } from "next/server";
import { getObject } from "@/lib/storage";

export const runtime = "nodejs";

// Sirve un archivo del bucket R2 (solo claves con el prefijo de la app).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  try {
    const { key } = await params;
    const fullKey = Array.isArray(key) ? key.join("/") : String(key);
    const obj = await getObject(fullKey);
    if (!obj) return new NextResponse("No encontrado", { status: 404 });
    return new NextResponse(obj.body, {
      headers: {
        "Content-Type": obj.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Error sirviendo archivo:", error);
    return new NextResponse("Error interno", { status: 500 });
  }
}
