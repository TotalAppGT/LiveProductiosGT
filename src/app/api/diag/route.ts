import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gtNow, gtStartOfToday } from "@/lib/task-utils";

export async function GET(req: NextRequest) {
  const key = process.env.DBG_KEY;
  if (!key || req.headers.get("x-dbg") !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const since = new Date(Date.now() - 30 * 60 * 60 * 1000);
  const activities = await prisma.activity.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 120,
    select: { userId: true, action: true, details: true, createdAt: true },
  });
  const messages = await prisma.whatsAppMessage.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { type: true, status: true, toNumber: true, createdAt: true, message: true },
  });
  return NextResponse.json({
    nowGT: gtNow().toISOString(),
    startOfTodayGT: gtStartOfToday().toISOString(),
    activities: activities.map((a) => ({ ...a })),
    messages: messages.map((m) => ({ type: m.type, status: m.status, to: m.toNumber, at: m.createdAt, head: m.message.slice(0, 60) })),
  });
}
