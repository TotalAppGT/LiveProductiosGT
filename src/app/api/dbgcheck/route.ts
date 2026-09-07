import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const key = process.env.DBG_KEY;
  if (!key || req.headers.get("x-dbg") !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true, active: true, whatsappNumber: true, phone: true, email: true },
  });
  const provider = await prisma.systemConfig.findUnique({ where: { key: "whatsapp_provider" } });
  const wac = await prisma.whatsAppConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const since = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const activities = await prisma.activity.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { id: true, userId: true, action: true, resource: true, details: true, createdAt: true },
  }).catch(() => []);
  return NextResponse.json({
    provider: provider?.value || "META",
    configOk: !!(wac?.phoneNumberId && (wac?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN)),
    hasDbConfig: !!wac,
    activities,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      active: u.active,
      wa: u.whatsappNumber || null,
      ph: u.phone || null,
      email: u.email || null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const key = process.env.DBG_KEY;
  if (!key || req.headers.get("x-dbg") !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { to } = await req.json().catch(() => ({}));
  if (!to) return NextResponse.json({ error: "need-to" }, { status: 400 });

  const providerCfg = await prisma.systemConfig.findUnique({ where: { key: "whatsapp_provider" } });
  const provider = providerCfg?.value || "META";
  if (provider !== "META") {
    return NextResponse.json({ provider, note: "no probando Twilio" });
  }
  const wac = await prisma.whatsAppConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const phoneNumberId = wac?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const accessToken = wac?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({ error: "meta-no-config", hasDbConfig: !!wac });
  }
  const digits = String(to).replace(/[^0-9]/g, "");
  const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: digits,
      type: "text",
      text: { preview_url: false, body: "Luna 🌙 · Prueba de canal. Si recibes esto, respondé OK." },
    }),
  });
  const body = await res.json();
  return NextResponse.json({ httpStatus: res.status, meta: body });
}
