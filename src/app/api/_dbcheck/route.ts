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
  return NextResponse.json({
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
