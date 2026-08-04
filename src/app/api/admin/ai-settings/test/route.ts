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

    const apiKey = envApiKeys[effectiveProvider] || dbApiKey || "";
    console.log(`[AI Test] Provider: ${effectiveProvider}, Key ends: ${apiKey.slice(-8)}, Using model: ${effectiveModel}`);

    if (!apiKey) {
      return NextResponse.json({ success: false, error: "API Key no configurada" }, { status: 400 });
    }

    const baseUrls: Record<string, string> = {
      DEEPSEEK: "https://api.deepseek.com/v1",
      OPENAI: "https://api.openai.com/v1",
      OPENROUTER: "https://openrouter.ai/api/v1",
      NVIDIA: "https://integrate.api.nvidia.com/v1",
    };
    const baseUrl = settings?.baseUrl || baseUrls[effectiveProvider] || baseUrls.NVIDIA;

    // Use plain fetch instead of OpenAI SDK to eliminate SDK issues
    const fetchBody: any = {
      model: effectiveModel,
      messages: [{ role: "user", content: "Responde exactamente OK" }],
      max_tokens: 10,
      temperature: 0,
      stream: false,
    };

    if (effectiveProvider === "NVIDIA") {
      fetchBody.top_p = 0.95;
      fetchBody.extra_body = { chat_template_kwargs: { thinking: false } };
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(fetchBody),
    });

    const data = await response.json();
    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || `HTTP ${response.status}`;
      console.error(`[AI Test] Failed: ${errorMsg}`);
      return NextResponse.json({
        success: false,
        error: response.status === 401
          ? "API Key inválida. Genera una nueva en build.nvidia.com"
          : response.status === 404
            ? `Modelo "${effectiveModel}" no encontrado. Prueba con deepseek-ai/deepseek-v4-flash o deepseek-ai/deepseek-v4-pro`
            : `Error NVIDIA: ${errorMsg}`,
        timingMs: elapsed,
      }, { status: response.status });
    }

    const reply = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({
      success: true,
      data: { response: reply, timingMs: elapsed, model: effectiveModel, provider: effectiveProvider },
    });
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[AI Test] Exception:", message);

    return NextResponse.json({
      success: false,
      error: `Error de conexión: ${message}`,
      timingMs: elapsed,
    }, { status: 500 });
  }
}
