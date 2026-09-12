import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const key = process.env.DBG_KEY;
  if (!key || req.headers.get("x-dbg") !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const cfg = await prisma.whatsAppConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const phoneNumberId = cfg?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const accessToken = cfg?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";

  const get = async (path: string) => {
    try {
      const r = await fetch(`https://graph.facebook.com/v22.0/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      return { status: r.status, body: await r.json() };
    } catch (e: any) {
      return { status: 0, body: { error: String(e?.message || e) } };
    }
  };

  const configs = await prisma.systemConfig.findMany({ orderBy: { key: "asc" }, select: { key: true, value: true } });
  const out: any = {
    configKeys: configs.map((c) => c.key),
    templateConfig: configs.filter((c) => c.key.toLowerCase().includes("template") || c.key.toLowerCase().includes("plantilla")),
    attempts: {} as any,
  };
  out.attempts.phoneTemplates = await get(`${phoneNumberId}/message_templates?limit=50`);
  out.attempts.meTemplates = await get(`me/message_templates?limit=50`);
  out.attempts.subscribed = await get(`${phoneNumberId}/subscribed_apps`);
  return NextResponse.json(out);
}
