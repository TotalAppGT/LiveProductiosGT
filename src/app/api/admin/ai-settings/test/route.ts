import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { askAI } from "@/lib/ai-brain";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

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
        { success: false, error: "Solo administradores pueden probar la conexión de IA" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { provider, apiKey, model } = body;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API Key es requerida" },
        { status: 400 }
      );
    }

    const baseUrls: Record<string, string> = {
      DEEPSEEK: "https://api.deepseek.com/v1",
      OPENAI: "https://api.openai.com/v1",
      OPENROUTER: "https://openrouter.ai/api/v1",
      NVIDIA: "https://integrate.api.nvidia.com/v1",
    };
    const baseUrl = baseUrls[provider] || "https://api.deepseek.com/v1";
    const testModel = model || "deepseek-chat";

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
    });

    const response = await client.chat.completions.create({
      model: testModel,
      messages: [
        { role: "user", content: "Hola, responde exactamente 'OK'" },
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const elapsed = Date.now() - startTime;
    const reply = response.choices[0]?.message?.content || "";

    return NextResponse.json(
      {
        success: true,
        data: {
          response: reply,
          timingMs: elapsed,
          model: testModel,
          provider,
        },
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const message =
      error instanceof Error ? error.message : "Error desconocido";
    console.error("AI test connection error:", message);

    return NextResponse.json(
      {
        success: false,
        error: `Error de conexión: ${message}`,
        timingMs: elapsed,
      },
      { status: 500 }
    );
  }
}
