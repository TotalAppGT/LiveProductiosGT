import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden acceder a configuración de IA" },
        { status: 403 }
      );
    }

    const settings = await prisma.aISettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json(
      {
        success: true,
        data: settings || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en obtener AI settings:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar configuración de IA" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, provider, apiKey, model, baseUrl, temperature, maxTokens, systemPrompt, isActive } = body;

    const validProviders = ["DEEPSEEK", "OPENAI", "OPENROUTER", "NVIDIA"];
    if (provider && !validProviders.includes(provider)) {
      return NextResponse.json(
        { success: false, error: `Proveedor inválido. Use: ${validProviders.join(", ")}` },
        { status: 400 }
      );
    }

    let settings;

    if (id) {
      const existing = await prisma.aISettings.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Configuración no encontrada" },
          { status: 404 }
        );
      }

      settings = await prisma.aISettings.update({
        where: { id },
        data: {
          provider: provider !== undefined ? provider : undefined,
          apiKey: apiKey !== undefined ? apiKey : undefined,
          model: model !== undefined ? model : undefined,
          baseUrl: baseUrl !== undefined ? baseUrl : undefined,
          temperature: temperature !== undefined ? temperature : undefined,
          maxTokens: maxTokens !== undefined ? maxTokens : undefined,
          systemPrompt: systemPrompt !== undefined ? systemPrompt : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
        },
      });
    } else {
      settings = await prisma.aISettings.create({
        data: {
          provider: provider || "DEEPSEEK",
          apiKey: apiKey || "",
          model: model || "deepseek-chat",
          baseUrl: baseUrl || "https://api.deepseek.com/v1",
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 2000,
          systemPrompt: systemPrompt || "Eres el asistente de Live Productions Guatemala...",
          isActive: isActive ?? true,
        },
      });
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "UPDATE_AI_SETTINGS",
        resource: "AI_SETTINGS",
        resourceId: settings.id,
        details: `Configuración de IA actualizada: provider=${settings.provider}, model=${settings.model}`,
      },
    });

    return NextResponse.json(
      { success: true, data: settings, message: "Configuración de IA actualizada" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error en actualizar AI settings:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
