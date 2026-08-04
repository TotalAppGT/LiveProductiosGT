import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json({ success: false, error: "Solo administradores" }, { status: 403 });
    }

    const body = await request.json();
    const { provider, model: requestedModel } = body;

    const settings = await prisma.aISettings.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });

    const effectiveProvider = provider || settings?.provider || "NVIDIA";
    const effectiveModel = requestedModel || settings?.model || "deepseek-ai/deepseek-v4-pro";

    const dbApiKey = settings?.apiKey || "";

    const envApiKeys: Record<string, string | undefined> = {
      DEEPSEEK: process.env.DEEPSEEK_API_KEY,
      OPENAI: process.env.OPENAI_API_KEY,
      OPENROUTER: process.env.OPENROUTER_API_KEY,
      NVIDIA: process.env.NVIDIA_API_KEY,
    };

    const apiKey = dbApiKey || envApiKeys[effectiveProvider] || "";
    console.log(`[AI Test] Provider: ${effectiveProvider}, DB key: ${dbApiKey ? dbApiKey.slice(-8) : 'empty'}, Env key: ${envApiKeys[effectiveProvider] ? envApiKeys[effectiveProvider]!.slice(-8) : 'empty'}, Using: ${apiKey.slice(-8)}`);
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "API Key no configurada. Guárdala primero en la pestaña IA & Modelos." },
        { status: 400 }
      );
    }

    const baseUrls: Record<string, string> = {
      DEEPSEEK: "https://api.deepseek.com/v1",
      OPENAI: "https://api.openai.com/v1",
      OPENROUTER: "https://openrouter.ai/api/v1",
      NVIDIA: "https://integrate.api.nvidia.com/v1",
    };
    const baseUrl = settings?.baseUrl || baseUrls[effectiveProvider] || "https://integrate.api.nvidia.com/v1";

    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey, baseURL: baseUrl });

    const params: any = {
      model: effectiveModel,
      messages: [{ role: "user", content: "Hola, responde exactamente 'OK'" }],
      max_tokens: 10,
      temperature: 0,
      top_p: 0.95,
      stream: false,
    };

    if (effectiveProvider === "NVIDIA") {
      params.extra_body = { chat_template_kwargs: { thinking: false } };
    }

    const response = await client.chat.completions.create(params);

    const elapsed = Date.now() - startTime;
    const reply = response.choices[0]?.message?.content || "";

    return NextResponse.json({
      success: true,
      data: { response: reply, timingMs: elapsed, model: effectiveModel, provider: effectiveProvider },
    });
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("AI test connection error:", error);

    return NextResponse.json({
      success: false,
      error: message.includes("401") ? "API Key inválida. Verifica que sea correcta y no haya expirado." :
             message.includes("404") ? "Modelo no encontrado. Verifica el nombre del modelo." :
             message.includes("429") ? "Límite de rate excedido. Intenta en unos segundos." :
             `Error de conexión: ${message}`,
      timingMs: elapsed,
    }, { status: error instanceof Error && (error as any).status ? (error as any).status : 500 });
  }
}
