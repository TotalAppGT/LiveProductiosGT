import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "totalappgt@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admintotal";

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`Admin ${adminEmail} ya existe, verificando rol...`);
    if (existingAdmin.role !== "DUENO") {
      await prisma.user.update({
        where: { id: existingAdmin.id },
        data: { role: "DUENO" },
      });
      console.log(`Rol actualizado a DUEÑO para ${adminEmail}`);
    }
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  await prisma.user.create({
    data: {
      name: "Administrador General",
      email: adminEmail,
      password: hashedPassword,
      role: "DUENO",
      phone: "+50230903172",
      whatsappNumber: "+50230903172",
      active: true,
    },
  });

  console.log(`Admin DUEÑO creado: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error("Error en seed-prod:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
