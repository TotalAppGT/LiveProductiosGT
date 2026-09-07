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
  const wm = await prisma.whatsAppMessage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, type: true, toNumber: true, status: true, createdAt: true },
  }).catch(() => []);
  return NextResponse.json({
    provider: provider?.value || "META",
    configOk: !!(wac?.phoneNumberId && (wac?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN)),
    hasDbConfig: !!wac,
    whatsAppMessages: wm,
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
  const { action, to } = await req.json().catch(() => ({}));

  if (action === "briefing") {
    const { debugRunMorningBriefing } = await import("@/lib/cron-manager");
    const started = Date.now();
    await debugRunMorningBriefing();
    return NextResponse.json({ done: true, ms: Date.now() - started });
  }

  const wac = await prisma.whatsAppConfig.findFirst({ orderBy: { updatedAt: "desc" } });
  const phoneNumberId = wac?.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const accessToken = wac?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN || "";
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({ error: "meta-no-config" });
  }
  const digits = String(to).replace(/[^0-9]/g, "");

  if (action === "whoami") {
    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await res.json();
    return NextResponse.json({ httpStatus: res.status, meta: body });
  }

  if (action === "check") {
    const res = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/contacts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", contacts: [{ phone: digits }] }),
    });
    const body = await res.json();
    return NextResponse.json({ httpStatus: res.status, meta: body });
  }

  if (action === "send") {
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

  return NextResponse.json({ error: "unknown-action" }, { status: 400 });
}
