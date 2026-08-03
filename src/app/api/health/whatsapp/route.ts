import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (!hasMinRole(auth.payload, "ADMIN")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    let configured = false;

    const providerConfig = await prisma.systemConfig.findUnique({
      where: { key: "whatsapp_provider" },
    });
    const provider = providerConfig?.value || "META";

    if (provider === "TWILIO") {
      const twilioConfigs = await prisma.systemConfig.findMany({
        where: { key: { in: ["twilio_account_sid", "twilio_auth_token", "twilio_phone"] } },
      });
      const sid = twilioConfigs.find((c) => c.key === "twilio_account_sid")?.value;
      const token = twilioConfigs.find((c) => c.key === "twilio_auth_token")?.value;
      configured = !!(sid && token);
    } else {
      const config = await prisma.whatsAppConfig.findFirst({
        orderBy: { updatedAt: "desc" },
      });
      configured = !!(config?.phoneNumberId && config?.accessToken);
    }

    if (!configured) {
      return NextResponse.json({ success: false, error: "WhatsApp not configured" }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { status: "configured", provider } });
  } catch (error) {
    console.error("WhatsApp health check error:", error);
    return NextResponse.json({ success: false, error: "WhatsApp health check failed" }, { status: 500 });
  }
}
