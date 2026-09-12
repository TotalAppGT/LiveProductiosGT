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
  if (!phoneNumberId || !accessToken) return NextResponse.json({ error: "no-config" });

  const out: any = {};
  const get = async (path: string) => {
    const r = await fetch(`https://graph.facebook.com/v22.0/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    return { status: r.status, body: await r.json() };
  };

  out.phone = await get(`${phoneNumberId}?fields=display_phone_number,verified_name,whatsapp_business_account`);
  const waba = out.phone?.body?.whatsapp_business_account?.id;
  if (waba) {
    out.wabaId = waba;
    out.templates = await get(`${waba}/message_templates?fields=name,status,language,category&limit=50`);
  }
  return NextResponse.json(out);
}
