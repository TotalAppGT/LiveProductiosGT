import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function createOrSyncFirebaseUser(email: string, password: string, userId: string, displayName: string) {
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
      const fbUser = await auth.getUserByEmail(email);
      console.log(`Usuario Firebase ya existe: ${fbUser.uid} (${email})`);
      await prisma.user.update({
        where: { id: userId },
        data: { firebaseUid: fbUser.uid },
      });
    } catch {
      const fbUser = await auth.createUser({
        email,
        password,
        displayName,
      });
      console.log(`Usuario Firebase creado: ${fbUser.uid} (${email})`);
      await prisma.user.update({
        where: { id: userId },
        data: { firebaseUid: fbUser.uid },
      });
    }
  } catch (e: any) {
    console.warn(`Firebase Auth sync (${email}): ${e.message}`);
  }
}

function getNextDayOfWeek(targetDay: number, fromDate: Date): Date {
  const result = new Date(fromDate);
  const currentDay = result.getDay();
  const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
  result.setDate(result.getDate() + daysUntil);
  result.setHours(0, 0, 0, 0);
  return result;
}

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thisFriday = getNextDayOfWeek(5, today);
  const nextMonday = getNextDayOfWeek(1, today);
  const nextThursday = getNextDayOfWeek(4, today);
  const nextFriday = getNextDayOfWeek(5, today);

  // === 1. Daniel (ADMIN - creador del sistema) ===
  const adminEmail = "totalappgt@gmail.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admintotal";

  let adminUser = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (adminUser) {
    console.log(`Admin ${adminEmail} ya existe en BD`);
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        name: "Daniel",
        role: "ADMIN",
        phone: "+50235187153",
        whatsappNumber: "+50235187153",
      },
    });
    console.log(`Admin actualizado: Daniel (ADMIN) con teléfono +50235187153`);
  } else {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    adminUser = await prisma.user.create({
      data: {
        name: "Daniel",
        email: adminEmail,
        password: hashedPassword,
        role: "ADMIN",
        phone: "+50235187153",
        whatsappNumber: "+50235187153",
        active: true,
      },
    });
    console.log(`Admin creado: Daniel (ADMIN) - ${adminEmail}`);
  }

  await createOrSyncFirebaseUser(adminEmail, adminPassword, adminUser.id, "Daniel");

  // === 2. Jorge Mérida (DUENO) ===
  const jorgeEmail = "adminlive@gmail.com";
  const jorgePassword = "Live2024!";

  let jorgeUser = await prisma.user.findUnique({ where: { email: jorgeEmail } });

  if (jorgeUser) {
    console.log(`Jorge ${jorgeEmail} ya existe en BD`);
    await prisma.user.update({
      where: { id: jorgeUser.id },
      data: {
        name: "Jorge Mérida",
        role: "DUENO",
        phone: "+50230903172",
        whatsappNumber: "+50230903172",
        active: true,
      },
    });
    console.log(`Jorge actualizado: Jorge Mérida (DUENO) con teléfono +50230903172`);
  } else {
    const hashedPassword = await bcrypt.hash(jorgePassword, 12);
    jorgeUser = await prisma.user.create({
      data: {
        name: "Jorge Mérida",
        email: jorgeEmail,
        password: hashedPassword,
        role: "DUENO",
        phone: "+50230903172",
        whatsappNumber: "+50230903172",
        active: true,
      },
    });
    console.log(`Jorge creado: Jorge Mérida (DUENO) - ${jorgeEmail}`);
  }

  await createOrSyncFirebaseUser(jorgeEmail, jorgePassword, jorgeUser.id, "Jorge Mérida");

  // === 3. Workers ===
  const sampleWorkers = [
    { name: "Diana", email: "diana@liveproductions.com", role: "JEFE" as const, phone: "+50230132528" },
    { name: "Brenda", email: "brenda@liveproductions.com", role: "JEFE" as const, phone: "+50255550002" },
    { name: "Abel", email: "abel@liveproductions.com", role: "EMPLEADO" as const, phone: "+50255550003" },
    { name: "Selvin", email: "selvin@liveproductions.com", role: "EMPLEADO" as const, phone: "+50255550004" },
    { name: "Exequiel", email: "exequiel@liveproductions.com", role: "EMPLEADO" as const, phone: "+50255550005" },
    { name: "Javier", email: "javier@liveproductions.com", role: "EMPLEADO" as const, phone: "+50255550008" },
  ];

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
      console.log(`Trabajador ${worker.name} (${worker.role}) creado`);
    } else {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name: worker.name,
          phone: worker.phone,
          whatsappNumber: worker.phone,
          role: worker.role,
        },
      });
      console.log(`Trabajador ${worker.name} (${worker.role}) actualizado`);
    }
  }

  // === 4. Default AI Settings ===
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

  // === 5. Default WhatsApp Config ===
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

  // === 6. Default System Configs ===
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
    { key: "access.min_daily", value: "4", description: "Mínimo de accesos diarios requeridos por usuario" },
    { key: "whatsapp.welcome", value: "¡Bienvenido a Live Productions! 🎉\n\nSoy *LUNA*, tu asistente IA.\n\n📊 *Prioridades:*\n🔴 URGENTE\n🟠 ALTA\n🔵 MEDIA\n⚪ BAJA\n\n*Comandos:*\n• tareas - ver tus tareas\n• completar 3 - completar tarea #3\n• posponer 5 mañana - posponer con razón\n• comentar 4 texto - agregar comentario\n• transferir 2 a Diana - pasar tarea\n• equipo - ver compañeros\n• eventos - próximos eventos\n• ayuda - esta ayuda\n\nAccede: https://liveproductiosgt-production.up.railway.app", description: "Mensaje de bienvenida de WhatsApp" },
  ];

  for (const cfg of defaultConfigs) {
    const existing = await prisma.systemConfig.findUnique({ where: { key: cfg.key } });
    if (!existing) {
      await prisma.systemConfig.create({ data: cfg });
      console.log(`SystemConfig creado: ${cfg.key}`);
    }
  }

  // === 7. Sample Income Records ===
  const existingIncome = await prisma.incomeRecord.findFirst();
  if (!existingIncome && jorgeUser && adminUser) {
    await prisma.incomeRecord.create({
      data: {
        amount: 500.00,
        description: "Cobro evento fin de semana",
        type: "COBRO",
        userId: jorgeUser.id,
        recordedById: adminUser.id,
      },
    });
    await prisma.incomeRecord.create({
      data: {
        amount: 250.00,
        description: "Comisión por montaje",
        type: "COMISION",
        userId: jorgeUser.id,
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

  // === 8. Real Test Tasks ===
  const users = await prisma.user.findMany({ where: { active: true } });
  const getUser = (email: string) => users.find(u => u.email === email);

  const dianaUser = getUser("diana@liveproductions.com");
  const brendaUser = getUser("brenda@liveproductions.com");
  const abelUser = getUser("abel@liveproductions.com");
  const selvinUser = getUser("selvin@liveproductions.com");
  const exequielUser = getUser("exequiel@liveproductions.com");
  const javierUser = getUser("javier@liveproductions.com");

  const tasksToCreate: {
    title: string;
    category: string;
    priority: string;
    dueDate: Date;
    assignedToId: string;
    status: string;
  }[] = [];

  if (jorgeUser) {
    tasksToCreate.push(
      { title: "Revisar reporte de ingresos de la semana", category: "COBRO", priority: "ALTA", dueDate: today, assignedToId: jorgeUser.id, status: "PENDIENTE" },
      { title: "Llamada con Diana y Abel para ver logística", category: "ADMINISTRACION", priority: "ALTA", dueDate: today, assignedToId: jorgeUser.id, status: "EN_PROCESO" },
      { title: "Seguimiento a reparaciones de equipo con Exequiel", category: "MANTENIMIENTO", priority: "MEDIA", dueDate: today, assignedToId: jorgeUser.id, status: "PENDIENTE" },
      { title: "Ver avance de cotizaciones pendientes", category: "COTIZACION", priority: "MEDIA", dueDate: tomorrow, assignedToId: jorgeUser.id, status: "PENDIENTE" },
      { title: "Autorizar pagos a músicos y proveedores", category: "COBRO", priority: "ALTA", dueDate: tomorrow, assignedToId: jorgeUser.id, status: "PENDIENTE" },
      { title: "Seguimiento vehículos: camión, panel, combustible", category: "VEHICULO", priority: "MEDIA", dueDate: nextMonday, assignedToId: jorgeUser.id, status: "PENDIENTE" },
      { title: "Revisar licencias ambientales (no caer en multas)", category: "ADMINISTRACION", priority: "ALTA", dueDate: thisFriday, assignedToId: jorgeUser.id, status: "PENDIENTE" },
    );
  }

  if (dianaUser) {
    tasksToCreate.push(
      { title: "Tener llamada con Selvin, Abel y Jorge para cuadro de staff", category: "PRE_EVENTO", priority: "URGENTE", dueDate: today, assignedToId: dianaUser.id, status: "EN_PROCESO" },
      { title: "Reconfirmar staff semana de eventos", category: "PRE_EVENTO", priority: "ALTA", dueDate: today, assignedToId: dianaUser.id, status: "PENDIENTE" },
      { title: "Hacer cobro de eventos de la semana", category: "COBRO", priority: "URGENTE", dueDate: today, assignedToId: dianaUser.id, status: "PENDIENTE" },
      { title: "Revisar que no haya traslape en horarios de shows", category: "PRE_EVENTO", priority: "ALTA", dueDate: today, assignedToId: dianaUser.id, status: "PENDIENTE" },
      { title: "Reconfirmar proveedores externos y diseños de pista", category: "PRE_EVENTO", priority: "MEDIA", dueDate: tomorrow, assignedToId: dianaUser.id, status: "PENDIENTE" },
      { title: "Enviar resumen de lugares y horarios de presentaciones", category: "ADMINISTRACION", priority: "ALTA", dueDate: tomorrow, assignedToId: dianaUser.id, status: "PENDIENTE" },
      { title: "Hacer lista de staff para revisar", category: "PERSONAL", priority: "MEDIA", dueDate: thisFriday, assignedToId: dianaUser.id, status: "PENDIENTE" },
      { title: "Actualizar drive de eventos de la semana", category: "ADMINISTRACION", priority: "MEDIA", dueDate: nextFriday, assignedToId: dianaUser.id, status: "PENDIENTE" },
    );
  }

  if (adminUser) {
    tasksToCreate.push(
      { title: "Verificar funcionamiento de recordatorios automáticos", category: "ADMINISTRACION", priority: "ALTA", dueDate: today, assignedToId: adminUser.id, status: "EN_PROCESO" },
      { title: "Revisar monitoreo de accesos del equipo", category: "ADMINISTRACION", priority: "MEDIA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Probar respuestas de LUNA por WhatsApp", category: "ADMINISTRACION", priority: "ALTA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Probar transferencia de tareas entre usuarios", category: "ADMINISTRACION", priority: "MEDIA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Verificar bitácora de actividades del equipo", category: "ADMINISTRACION", priority: "MEDIA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Revisar cumplimiento de accesos diarios", category: "ADMINISTRACION", priority: "ALTA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Probar respuestas de LUNA en WhatsApp", category: "ADMINISTRACION", priority: "BAJA", dueDate: tomorrow, assignedToId: adminUser.id, status: "PENDIENTE" },
    );
  }

  if (abelUser) {
    tasksToCreate.push(
      { title: "Confirmar disponibilidad de pilotos para eventos", category: "PRE_EVENTO", priority: "ALTA", dueDate: tomorrow, assignedToId: abelUser.id, status: "PENDIENTE" },
      { title: "Revisar niveles de combustible de vehículos", category: "VEHICULO", priority: "MEDIA", dueDate: nextMonday, assignedToId: abelUser.id, status: "PENDIENTE" },
      { title: "Entregar viáticos a responsables de montaje", category: "PRE_EVENTO", priority: "ALTA", dueDate: nextThursday, assignedToId: abelUser.id, status: "PENDIENTE" },
    );
  }

  if (selvinUser) {
    tasksToCreate.push(
      { title: "Revisar cuadros de equipo con Diana", category: "PRE_EVENTO", priority: "ALTA", dueDate: today, assignedToId: selvinUser.id, status: "EN_PROCESO" },
      { title: "Verificar equipo de audio para evento del viernes", category: "PRE_EVENTO", priority: "ALTA", dueDate: tomorrow, assignedToId: selvinUser.id, status: "PENDIENTE" },
      { title: "Reporte de equipo en reparación", category: "MANTENIMIENTO", priority: "MEDIA", dueDate: nextMonday, assignedToId: selvinUser.id, status: "PENDIENTE" },
    );
  }

  if (exequielUser) {
    tasksToCreate.push(
      { title: "Hacer inventario de consumibles", category: "INVENTARIO", priority: "ALTA", dueDate: today, assignedToId: exequielUser.id, status: "EN_PROCESO" },
      { title: "Revisar equipo dañado post-evento", category: "POST_EVENTO", priority: "ALTA", dueDate: tomorrow, assignedToId: exequielUser.id, status: "PENDIENTE" },
      { title: "Reporte de equipo perdido/dañado", category: "INVENTARIO", priority: "ALTA", dueDate: nextMonday, assignedToId: exequielUser.id, status: "PENDIENTE" },
    );
  }

  if (brendaUser) {
    tasksToCreate.push(
      { title: "Enviar retroalimentación a proveedores", category: "ADMINISTRACION", priority: "MEDIA", dueDate: today, assignedToId: brendaUser.id, status: "PENDIENTE" },
      { title: "Agregar eventos nuevos al Excel", category: "ADMINISTRACION", priority: "MEDIA", dueDate: today, assignedToId: brendaUser.id, status: "PENDIENTE" },
      { title: "Reservar DJ para octubre, noviembre y diciembre", category: "PRE_EVENTO", priority: "MEDIA", dueDate: thisFriday, assignedToId: brendaUser.id, status: "PENDIENTE" },
    );
  }

  if (javierUser) {
    tasksToCreate.push(
      { title: "Confirmar asistencia para evento del sábado", category: "PRE_EVENTO", priority: "MEDIA", dueDate: today, assignedToId: javierUser.id, status: "PENDIENTE" },
      { title: "Llevar equipo de percusión a mantenimiento", category: "MANTENIMIENTO", priority: "MEDIA", dueDate: tomorrow, assignedToId: javierUser.id, status: "PENDIENTE" },
    );
  }

  // Daniel's tasks (creator, ADMIN)
  if (adminUser) {
    tasksToCreate.push(
      { title: "Probar transferencia de tareas entre usuarios", category: "ADMINISTRACION", priority: "ALTA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Verificar bitácora de actividades del equipo", category: "ADMINISTRACION", priority: "MEDIA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Revisar cumplimiento de accesos diarios", category: "ADMINISTRACION", priority: "ALTA", dueDate: today, assignedToId: adminUser.id, status: "PENDIENTE" },
      { title: "Probar respuestas de LUNA en WhatsApp", category: "ADMINISTRACION", priority: "MEDIA", dueDate: tomorrow, assignedToId: adminUser.id, status: "PENDIENTE" },
    );
  }

  const assignedById = (jorgeUser || adminUser)!.id;

  const validCategories: string[] = ["PRE_EVENTO", "POST_EVENTO", "COTIZACION", "COBRO", "INVENTARIO", "VEHICULO", "PERSONAL", "BODEGA", "MANTENIMIENTO", "ADMINISTRACION", "OTRO"];
  const validPriorities: string[] = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
  const validStatuses: string[] = ["PENDIENTE", "EN_PROCESO"];

  for (const task of tasksToCreate) {
    const exists = await prisma.task.findFirst({
      where: { title: task.title, assignedToId: task.assignedToId },
    });
    if (!exists) {
      await prisma.task.create({
        data: {
          title: task.title,
          assignedToId: task.assignedToId,
          assignedById,
          category: validCategories.includes(task.category) ? task.category as any : "OTRO",
          priority: validPriorities.includes(task.priority) ? task.priority as any : "MEDIA",
          status: validStatuses.includes(task.status) ? task.status as any : "PENDIENTE",
          dueDate: task.dueDate,
          type: "DINAMICA",
          frequency: "DIARIA",
        },
      });
    }
  }

  console.log(`${tasksToCreate.length} tareas de prueba procesadas`);
}

main()
  .catch((e) => {
    console.error("Error en seed-prod:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
