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
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        phone: "+50230903172",
        whatsappNumber: "+50230903172",
        name: "Jorge Mérida",
      },
    });
    console.log(`Teléfono admin actualizado: +50230903172`);
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

  // === Sample Workers with real phones ===
  const sampleWorkers = [
    { name: "Diana Mérida", email: "diana@liveproductions.com.gt", role: "JEFE" as const, phone: "+50230132528" },
    { name: "Brenda Lopez", email: "brenda@liveproductions.com.gt", role: "JEFE" as const, phone: "+50255550002" },
    { name: "Abel Perez", email: "abel@liveproductions.com.gt", role: "EMPLEADO" as const, phone: "+50255550003" },
    { name: "Selvin Garcia", email: "selvin@liveproductions.com.gt", role: "EMPLEADO" as const, phone: "+50255550004" },
    { name: "Exequiel Lopez", email: "exequiel@liveproductions.com.gt", role: "EMPLEADO" as const, phone: "+50255550005" },
    { name: "Javier Perez", email: "javier@liveproductions.com.gt", role: "EMPLEADO" as const, phone: "+50255550008" },
    { name: "Daniel", email: "prueba@liveproductions.com.gt", role: "ADMIN" as const, phone: "+50235187153" },
  ];

  let javierUser: typeof adminUser | null = null;

  for (const worker of sampleWorkers) {
    const existing = await prisma.user.findUnique({ where: { email: worker.email } });
    if (!existing) {
      const hashedPassword = await bcrypt.hash("Live2024!", 12);
      await prisma.user.create({
        data: {
          name: worker.name,
          email: worker.email,
          password: hashedPassword,
          role: worker.role,
          phone: worker.phone,
          whatsappNumber: worker.phone,
          active: true,
        },
      });
      console.log(`Trabajador ${worker.name} creado en BD`);
      if (worker.email === "javier@liveproductions.com.gt") {
        javierUser = await prisma.user.findUnique({ where: { email: worker.email } });
      }
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: { phone: worker.phone, whatsappNumber: worker.phone, name: worker.name },
      });
      console.log(`Trabajador ${worker.name} actualizado con teléfono ${worker.phone}`);
      if (worker.email === "javier@liveproductions.com.gt") {
        javierUser = existing;
      }
    }
  }

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
  if (existingWhatsAppConfig) {
    await prisma.whatsAppConfig.update({
      where: { id: existingWhatsAppConfig.id },
      data: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "1244681988728884",
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
        verifyToken: "live_productions_gt_webhook",
        businessPhone: "+50230840447",
        webhookUrl: "https://liveproductiosgt-production.up.railway.app/api/whatsapp/webhook",
        isActive: true,
      },
    });
    console.log("WhatsApp config actualizado");
  } else {
    await prisma.whatsAppConfig.create({
      data: {
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "1244681988728884",
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "",
        verifyToken: "live_productions_gt_webhook",
        businessPhone: "+50230840447",
        webhookUrl: "https://liveproductiosgt-production.up.railway.app/api/whatsapp/webhook",
        qrCodeUrl: "",
        isActive: true,
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

  // === Sample Income Records ===
  if (javierUser) {
    const existingIncome = await prisma.incomeRecord.findFirst({
      where: { userId: javierUser.id },
    });

    if (!existingIncome) {
      await prisma.incomeRecord.create({
        data: {
          amount: 500.00,
          description: "Cobro evento fin de semana",
          type: "COBRO",
          userId: javierUser.id,
          recordedById: adminUser.id,
        },
      });

      await prisma.incomeRecord.create({
        data: {
          amount: 250.00,
          description: "Comisión por montaje",
          type: "COMISION",
          userId: javierUser.id,
          recordedById: adminUser.id,
        },
      });

      await prisma.incomeRecord.create({
        data: {
          amount: 150.00,
          description: "Bono por puntualidad",
          type: "BONO",
          userId: adminUser.id,
          recordedById: adminUser.id,
        },
      });

      console.log("Registros de ingreso de muestra creados");
    }
  }

  // === Test Tasks basadas en los sheets reales ===
  const users = await prisma.user.findMany({ where: { active: true } });
  const dianaId = users.find(u => u.email === "diana@liveproductions.com.gt")?.id;
  const adminId = adminUser!.id;

  if (dianaId && adminId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const nextMonday = new Date(today); nextMonday.setDate(nextMonday.getDate() + (8 - nextMonday.getDay()) % 7 || 7);

    const testTasks = [
      { title: "Reconfirmar staff de la semana", assignedToId: dianaId, category: "PRE_EVENTO", dueDate: today, priority: "ALTA" },
      { title: "Revisar cuadros de equipo con Selvin", assignedToId: dianaId, category: "PRE_EVENTO", dueDate: today, priority: "ALTA" },
      { title: "Hacer cobro de eventos de la semana", assignedToId: dianaId, category: "COBRO", dueDate: today, priority: "URGENTE" },
      { title: "Enviar resumen de lugares y horarios", assignedToId: dianaId, category: "ADMINISTRACION", dueDate: today, priority: "MEDIA" },
      { title: "Reporte equipo dañado post-evento", assignedToId: adminId, category: "POST_EVENTO", dueDate: today, priority: "ALTA" },
      { title: "Seguimiento vehículos con Abel", assignedToId: adminId, category: "VEHICULO", dueDate: today, priority: "MEDIA" },
      { title: "Actualizar inventario bodega Elgin", assignedToId: adminId, category: "INVENTARIO", dueDate: tomorrow, priority: "MEDIA" },
      { title: "Seguimiento reparaciones equipo percusión", assignedToId: adminId, category: "MANTENIMIENTO", dueDate: nextMonday, priority: "BAJA" },
      { title: "Reporte de ingresos personal Casa Nómada", assignedToId: adminId, category: "ADMINISTRACION", dueDate: today, priority: "MEDIA" },
      { title: "Verificar pago músicos y staff", assignedToId: dianaId, category: "COBRO", dueDate: tomorrow, priority: "ALTA" },
    ];

    for (const task of testTasks) {
      const exists = await prisma.task.findFirst({
        where: { title: task.title, assignedToId: task.assignedToId, status: "PENDIENTE" },
      });
      if (!exists) {
        await prisma.task.create({
          data: {
            ...task,
            assignedById: adminId,
            type: "DINAMICA",
            frequency: "DIARIA",
            dueDate: task.dueDate,
          } as any,
        });
      }
    }
    console.log("Tareas de prueba creadas/actualizadas");
  }
}

main()
  .catch((e) => {
    console.error("Error en seed-prod:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
