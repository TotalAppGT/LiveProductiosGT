import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createOrSyncFirebaseUser(adminEmail: string, adminPassword: string, userId: string) {
  try {
    const fbAdmin = await import("firebase-admin");
    const admin = fbAdmin.default || fbAdmin;
    if (!admin.apps || !admin.apps.length) {
      const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
      if (!privateKey || !process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
        console.warn("Firebase Admin vars missing, skipping Firebase Auth sync");
        return;
      }
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey,
        }),
      });
    }
    const { getAuth } = await import("firebase-admin/auth");
    const auth = getAuth();
    try {
      const fbUser = await auth.getUserByEmail(adminEmail);
      console.log(`Usuario Firebase ya existe: ${fbUser.uid}`);
      await prisma.user.update({
        where: { id: userId },
        data: { firebaseUid: fbUser.uid },
      });
    } catch {
      const fbUser = await auth.createUser({
        email: adminEmail,
        password: adminPassword,
        displayName: "Administrador General",
      });
      console.log(`Usuario Firebase creado: ${fbUser.uid}`);
      await prisma.user.update({
        where: { id: userId },
        data: { firebaseUid: fbUser.uid },
      });
    }
  } catch (e: any) {
    console.warn(`Firebase Auth sync: ${e.message}`);
  }
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "totalappgt@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admintotal";

  let adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (adminUser) {
    console.log(`Admin ${adminEmail} ya existe en BD`);
    if (adminUser.role !== "DUENO") {
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { role: "DUENO" },
      });
      console.log(`Rol actualizado a DUENO`);
    }
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    adminUser = await prisma.user.create({
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
    console.log(`Admin DUENO creado en BD: ${adminEmail}`);
  }

  await createOrSyncFirebaseUser(adminEmail, adminPassword, adminUser.id);

  // === Default AI Settings ===
  const existingAISettings = await prisma.aISettings.findFirst();
  if (!existingAISettings) {
    await prisma.aISettings.create({
      data: {
        provider: "DEEPSEEK",
        apiKey: process.env.DEEPSEEK_API_KEY || "",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1",
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: "Eres el asistente de Live Productions Guatemala, una empresa de producción de eventos en vivo. Ayudas con gestión de tareas, planificación de eventos, inventario de equipos profesionales, vehículos, cobros y personal. Responde en español de manera profesional y concisa.",
        isActive: true,
      },
    });
    console.log("Default AI settings creado");
  }

  // === Default WhatsApp Config ===
  const existingWhatsAppConfig = await prisma.whatsAppConfig.findFirst();
  if (!existingWhatsAppConfig) {
    await prisma.whatsAppConfig.create({
      data: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
        verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "",
        businessPhone: "+50230903172",
        webhookUrl: "",
        qrCodeUrl: "",
        isActive: false,
      },
    });
    console.log("Default WhatsApp config creado");
  }

  // === Default System Configs ===
  const defaultConfigs = [
    { key: "company.name", value: "Live Productions Guatemala", description: "Nombre de la empresa" },
    { key: "company.slogan", value: "Producción de eventos en vivo", description: "Eslogan de la empresa" },
    { key: "company.phone", value: "+50230903172", description: "Teléfono principal" },
    { key: "system.timezone", value: "America/Guatemala", description: "Zona horaria" },
    { key: "system.currency", value: "GTQ", description: "Moneda principal" },
    { key: "notifications.overdue_hours_1", value: "1", description: "Horas para primera alerta de vencimiento" },
    { key: "notifications.overdue_hours_2", value: "3", description: "Horas para segunda alerta de vencimiento" },
    { key: "notifications.overdue_hours_escalate", value: "6", description: "Horas para escalar a administradores" },
    { key: "compliance.min_completion_rate", value: "50", description: "Tasa mínima de completación esperada" },
  ];

  for (const cfg of defaultConfigs) {
    const existing = await prisma.systemConfig.findUnique({ where: { key: cfg.key } });
    if (!existing) {
      await prisma.systemConfig.create({ data: cfg });
      console.log(`SystemConfig creado: ${cfg.key}`);
    }
  }
}

main()
  .catch((e) => {
    console.error("Error en seed-prod:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
