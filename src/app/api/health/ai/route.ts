import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { getAIClient } from "@/lib/ai-brain";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const { client, model } = await getAIClient();

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Responde exactamente: OK" }],
      max_tokens: 5,
    });

    const reply = response.choices[0]?.message?.content || "";

    return NextResponse.json({ success: true, data: { status: "connected", model, response: reply } });
  } catch (error) {
    console.error("AI health check error:", error);
    return NextResponse.json({ success: false, error: "AI connection failed" }, { status: 500 });
  }
}
