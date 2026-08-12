import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ADMIN_EMAIL = "totalappgt@gmail.com";

async function main() {
  console.log("=== RESET LIMPIO DEL SISTEMA ===");

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
  await prisma.fileAttachment.deleteMany({});

  console.log("Datos transaccionales eliminados");

  // 2. Borrar todos los usuarios EXCEPTO Daniel (admin)
  const users = await prisma.user.findMany({ where: { email: { not: ADMIN_EMAIL } } });
  for (const u of users) {
    await prisma.user.delete({ where: { id: u.id } });
  }
  console.log(`Eliminados ${users.length} usuarios (excepto Daniel admin)`);

  // 3. Verificar que Daniel existe y es admin
  const daniel = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (daniel) {
    await prisma.user.update({
      where: { id: daniel.id },
      data: { role: "ADMIN", active: true },
    });
    console.log(`✅ Daniel (${daniel.email}) confirmado como ADMIN`);
  } else {
    console.log("⚠️ Daniel no encontrado. Creando...");
    // No se puede crear sin password; verificar seed
  }

  // 4. Mantener configuraciones del sistema
  const configCount = await prisma.systemConfig.count();
  const whatsappCount = await prisma.whatsAppConfig.count();
  console.log(`Configuraciones preservadas: ${configCount} systemConfig, ${whatsappCount} whatsappConfig`);

  console.log("=== RESET COMPLETO ===");
  console.log(`Usuarios restantes: ${await prisma.user.count()}`);
  console.log(`Tareas: ${await prisma.task.count()}`);
  console.log(`Eventos: ${await prisma.event.count()}`);
  console.log(`Inventario: ${await prisma.inventoryItem.count()}`);
}

main()
  .catch((e) => {
    console.error("Error en reset:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
