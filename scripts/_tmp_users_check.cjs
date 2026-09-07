const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true, active: true, whatsappNumber: true, phone: true, email: true },
  });
  for (const u of users) {
    console.log([u.id, u.name, u.role, u.active ? "ACT" : "INA", "wa=" + (u.whatsappNumber || "-"), "ph=" + (u.phone || "-"), u.email || ""].join(" | "));
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
