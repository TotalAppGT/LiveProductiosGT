import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const key = process.env.DBG_KEY;
  if (!key || req.headers.get("x-dbg") !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const done = await prisma.systemConfig.findUnique({ where: { key: "evfix_done" } });
  if (done) return NextResponse.json({ error: "ya-ejecutado" });

  const events = await prisma.event.findMany({
    select: { id: true, date: true },
    orderBy: { createdAt: "asc" },
  });
  const toFix: { id: string }[] = [];
  for (const e of events) {
    const d = new Date(e.date);
    // Fecha guardada a medianoche UTC exacta = se creó con solo "YYYY-MM-DD"
    // (se interpretó como 00:00Z = 18:00 GT del día anterior).
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
      toFix.push({ id: e.id });
    }
  }
  let fixed = 0;
  for (const t of toFix) {
    const e = await prisma.event.findUnique({ where: { id: t.id }, select: { date: true } });
    if (!e) continue;
    const shifted = new Date(new Date(e.date).getTime() + 6 * 60 * 60 * 1000);
    await prisma.event.update({ where: { id: t.id }, data: { date: shifted } });
    fixed++;
  }
  await prisma.systemConfig.create({ data: { key: "evfix_done", value: String(Date.now()), description: "Eventos fecha-sola corregidos a medianoche GT" } });
  return NextResponse.json({ total: events.length, toFix: toFix.length, fixed });
}
