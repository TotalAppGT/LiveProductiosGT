import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    if (auth.payload.role !== "ADMIN" && auth.payload.role !== "DUENO") {
      return NextResponse.json({ success: false, error: "Solo admin puede resetear" }, { status: 403 });
    }

    const adminId = auth.payload.userId;
    const adminEmail = (await prisma.user.findUnique({ where: { id: adminId } }))?.email;

    // 1. Borrar todos los datos transaccionales
    await prisma.vehicleMaintenance.deleteMany({});
    await prisma.pushToken.deleteMany({});
    await prisma.taskComment.deleteMany({});
    await prisma.taskHistory.deleteMany({});
    await prisma.activity.deleteMany({});
    await prisma.whatsAppMessage.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.incomeRecord.deleteMany({});
    await prisma.scheduledAlert.deleteMany({});
    await prisma.groupMember.deleteMany({});
    await prisma.group.deleteMany({});
    await prisma.task.deleteMany({});
    await prisma.inventoryItem.deleteMany({});
    await prisma.vehicle.deleteMany({});
    await prisma.cobro.deleteMany({});
    await prisma.event.deleteMany({});

    // 2. Borrar todos los usuarios excepto el admin actual
    const users = await prisma.user.findMany({ where: { id: { not: adminId } } });
    for (const u of users) {
      await prisma.user.delete({ where: { id: u.id } });
    }

    return NextResponse.json({
      success: true,
      message: `Sistema reseteado. Usuarios eliminados: ${users.length}. Solo queda ${adminEmail || "el admin"}.`,
    });
  } catch (error) {
    console.error("Error en reset:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
