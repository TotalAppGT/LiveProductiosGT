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

async function main() {

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

  // === 8. August 2026 MASSIVE Task Seed ===
  const users = await prisma.user.findMany({ where: { active: true } });
  const getUser = (email: string) => users.find(u => u.email === email);

  const dianaUser = getUser("diana@liveproductions.com");

  if (!jorgeUser) throw new Error("Jorge user not found");
  if (!adminUser) throw new Error("Admin user not found");
  if (!dianaUser) throw new Error("Diana user not found");

  const assignedById = jorgeUser.id;

  function augDate(day: number): Date {
    return new Date(2026, 7, day, 0, 0, 0, 0);
  }

  const augustWeekdays = [
    { date: augDate(4), dow: "MARTES" },
    { date: augDate(5), dow: "MIERCOLES" },
    { date: augDate(6), dow: "JUEVES" },
    { date: augDate(7), dow: "VIERNES" },
    { date: augDate(10), dow: "LUNES" },
    { date: augDate(11), dow: "MARTES" },
    { date: augDate(12), dow: "MIERCOLES" },
    { date: augDate(13), dow: "JUEVES" },
    { date: augDate(14), dow: "VIERNES" },
    { date: augDate(17), dow: "LUNES" },
    { date: augDate(18), dow: "MARTES" },
    { date: augDate(19), dow: "MIERCOLES" },
    { date: augDate(20), dow: "JUEVES" },
    { date: augDate(21), dow: "VIERNES" },
    { date: augDate(24), dow: "LUNES" },
    { date: augDate(25), dow: "MARTES" },
    { date: augDate(26), dow: "MIERCOLES" },
    { date: augDate(27), dow: "JUEVES" },
    { date: augDate(28), dow: "VIERNES" },
    { date: augDate(31), dow: "LUNES" },
  ];

  const weeklyDates: Record<string, Date[]> = {
    LUNES: [augDate(10), augDate(17), augDate(24), augDate(31)],
    MARTES: [augDate(4), augDate(11), augDate(18), augDate(25)],
    MIERCOLES: [augDate(5), augDate(12), augDate(19), augDate(26)],
    JUEVES: [augDate(6), augDate(13), augDate(20), augDate(27)],
    VIERNES: [augDate(7), augDate(14), augDate(21), augDate(28)],
  };

  interface TaskSeed {
    title: string;
    type: string;
    frequency?: string;
    dayOfWeek?: string;
    category: string;
    priority: string;
    dueDate: Date;
    assignedToId: string;
    status: string;
  }

  const allTasks: TaskSeed[] = [];
  let st = false;
  const ns = () => { st = !st; return st ? "PENDIENTE" : "EN_PROCESO"; };

  // ─── Daniel (ADMIN) ──────────────────────────────────────

  // FIJA DIARIA
  for (const wd of augustWeekdays) {
    allTasks.push(
      { title: "Revisar monitoreo de accesos del equipo", type: "FIJA", frequency: "DIARIA", category: "ADMINISTRACION", priority: "ALTA", dueDate: wd.date, assignedToId: adminUser.id, status: ns() },
      { title: "Verificar funcionamiento de recordatorios automáticos", type: "FIJA", frequency: "DIARIA", category: "ADMINISTRACION", priority: "MEDIA", dueDate: wd.date, assignedToId: adminUser.id, status: ns() },
    );
  }

  // FIJA SEMANAL
  for (const d of weeklyDates.LUNES) {
    allTasks.push({ title: "Revisión general del sistema y LUNA", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "ADMINISTRACION", priority: "ALTA", dueDate: d, assignedToId: adminUser.id, status: ns() });
  }
  for (const d of weeklyDates.VIERNES) {
    allTasks.push({ title: "Reporte semanal de cumplimiento", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "VIERNES", category: "ADMINISTRACION", priority: "MEDIA", dueDate: d, assignedToId: adminUser.id, status: ns() });
  }

  // DINAMICA
  for (const d of [augDate(4), augDate(11), augDate(18), augDate(25)]) {
    allTasks.push({ title: "Probar nuevas funcionalidades del sistema", type: "DINAMICA", category: "ADMINISTRACION", priority: "MEDIA", dueDate: d, assignedToId: adminUser.id, status: ns() });
  }
  for (const d of [augDate(7), augDate(14), augDate(21), augDate(28)]) {
    allTasks.push({ title: "Actualizar configuración según feedback del equipo", type: "DINAMICA", category: "ADMINISTRACION", priority: "BAJA", dueDate: d, assignedToId: adminUser.id, status: ns() });
  }

  // ─── Jorge Mérida (DUENO) ────────────────────────────────

  // FIJA DIARIA
  for (const wd of augustWeekdays) {
    allTasks.push(
      { title: "Revisar reporte de ingresos", type: "FIJA", frequency: "DIARIA", category: "COBRO", priority: "URGENTE", dueDate: wd.date, assignedToId: jorgeUser.id, status: ns() },
      { title: "Seguimiento a cotizaciones pendientes", type: "FIJA", frequency: "DIARIA", category: "COTIZACION", priority: "ALTA", dueDate: wd.date, assignedToId: jorgeUser.id, status: ns() },
    );
  }

  // FIJA SEMANAL
  for (const d of weeklyDates.LUNES) {
    allTasks.push({ title: "Llamada con equipo de coordinación", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "ADMINISTRACION", priority: "URGENTE", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
    allTasks.push({ title: "Seguimiento vehículos con Abel", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "VEHICULO", priority: "ALTA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
    allTasks.push({ title: "Seguimiento inventario bodega Elgin", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "INVENTARIO", priority: "MEDIA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
  }
  for (const d of weeklyDates.MARTES) {
    allTasks.push({ title: "Tener llamada con Jorge para temas varios", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MARTES", category: "ADMINISTRACION", priority: "MEDIA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
  }
  for (const d of weeklyDates.MIERCOLES) {
    allTasks.push({ title: "Cobrar clientes pendientes de la semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MIERCOLES", category: "COBRO", priority: "URGENTE", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
    allTasks.push({ title: "Autorizar pagos a músicos y proveedores", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MIERCOLES", category: "COBRO", priority: "ALTA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
  }
  for (const d of weeklyDates.JUEVES) {
    allTasks.push({ title: "Revisar licencias ambientales", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "JUEVES", category: "ADMINISTRACION", priority: "ALTA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
    allTasks.push({ title: "Preparar cuadros de eventos fin de semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "JUEVES", category: "PRE_EVENTO", priority: "ALTA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
  }
  for (const d of weeklyDates.VIERNES) {
    allTasks.push({ title: "Reporte de ingresos personal Casa Nómada y Live", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "VIERNES", category: "ADMINISTRACION", priority: "MEDIA", dueDate: d, assignedToId: jorgeUser.id, status: ns() });
  }

  // DINAMICA
  allTasks.push(
    { title: "Seguimiento a reparaciones con Exequiel", type: "DINAMICA", category: "MANTENIMIENTO", priority: "MEDIA", dueDate: augDate(5), assignedToId: jorgeUser.id, status: ns() },
    { title: "Revisar drive de compras", type: "DINAMICA", category: "ADMINISTRACION", priority: "MEDIA", dueDate: augDate(6), assignedToId: jorgeUser.id, status: ns() },
    { title: "Dar seguimiento a pilotos nuevos", type: "DINAMICA", category: "VEHICULO", priority: "MEDIA", dueDate: augDate(7), assignedToId: jorgeUser.id, status: ns() },
    { title: "Seguimiento tablet y repuestos KLA12", type: "DINAMICA", category: "MANTENIMIENTO", priority: "BAJA", dueDate: augDate(8), assignedToId: jorgeUser.id, status: ns() },
  );

  // ─── Diana (JEFE) ────────────────────────────────────────

  // FIJA DIARIA
  for (const wd of augustWeekdays) {
    allTasks.push(
      { title: "Revisar y actualizar drive de eventos", type: "FIJA", frequency: "DIARIA", category: "ADMINISTRACION", priority: "ALTA", dueDate: wd.date, assignedToId: dianaUser.id, status: ns() },
      { title: "Enviar retroalimentación a proveedores", type: "FIJA", frequency: "DIARIA", category: "ADMINISTRACION", priority: "MEDIA", dueDate: wd.date, assignedToId: dianaUser.id, status: ns() },
    );
  }

  // FIJA SEMANAL
  for (const d of weeklyDates.LUNES) {
    allTasks.push({ title: "Hacer resumen de lugares y horarios de la semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "PRE_EVENTO", priority: "URGENTE", dueDate: d, assignedToId: dianaUser.id, status: ns() });
    allTasks.push({ title: "Reconfirmar staff de la semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "PRE_EVENTO", priority: "ALTA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
    allTasks.push({ title: "Revisar cuadro de equipo con Selvin", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "LUNES", category: "PRE_EVENTO", priority: "ALTA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
  }
  for (const d of weeklyDates.MARTES) {
    allTasks.push({ title: "Llamada con Selvin, Abel y Jorge para logística", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MARTES", category: "PRE_EVENTO", priority: "URGENTE", dueDate: d, assignedToId: dianaUser.id, status: ns() });
  }
  for (const d of weeklyDates.MIERCOLES) {
    allTasks.push({ title: "Hacer cobro de eventos de la semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MIERCOLES", category: "COBRO", priority: "URGENTE", dueDate: d, assignedToId: dianaUser.id, status: ns() });
    allTasks.push({ title: "Enviar datos para pagos de músicos y proveedores", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MIERCOLES", category: "COBRO", priority: "ALTA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
    allTasks.push({ title: "Actualizar drives de eventos de la semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "MIERCOLES", category: "ADMINISTRACION", priority: "MEDIA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
  }
  for (const d of weeklyDates.JUEVES) {
    allTasks.push({ title: "Revisar todos los grupos y ver modificaciones", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "JUEVES", category: "PRE_EVENTO", priority: "MEDIA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
    allTasks.push({ title: "Hacer drives de eventos de próximas semanas", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "JUEVES", category: "ADMINISTRACION", priority: "MEDIA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
  }
  for (const d of weeklyDates.VIERNES) {
    allTasks.push({ title: "Enviar información final a músicos y clientes", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "VIERNES", category: "PRE_EVENTO", priority: "ALTA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
    allTasks.push({ title: "Enviar reporte de proveedores del fin de semana", type: "FIJA", frequency: "SEMANAL", dayOfWeek: "VIERNES", category: "POST_EVENTO", priority: "MEDIA", dueDate: d, assignedToId: dianaUser.id, status: ns() });
  }

  // DINAMICA
  allTasks.push(
    { title: "Confirmar disponibilidad de staff para 3ra semana", type: "DINAMICA", category: "PRE_EVENTO", priority: "ALTA", dueDate: augDate(5), assignedToId: dianaUser.id, status: ns() },
    { title: "Enviar Estados de Cuenta a clientes", type: "DINAMICA", category: "COBRO", priority: "ALTA", dueDate: augDate(6), assignedToId: dianaUser.id, status: ns() },
    { title: "Reservar a David o DJ para octubre-diciembre", type: "DINAMICA", category: "PRE_EVENTO", priority: "MEDIA", dueDate: augDate(8), assignedToId: dianaUser.id, status: ns() },
    { title: "Hacer machote de equipo", type: "DINAMICA", category: "PRE_EVENTO", priority: "MEDIA", dueDate: augDate(12), assignedToId: dianaUser.id, status: ns() },
    { title: "Confirmar si hubo horas extras en eventos", type: "DINAMICA", category: "POST_EVENTO", priority: "MEDIA", dueDate: augDate(18), assignedToId: dianaUser.id, status: ns() },
  );

  // ─── INSERT ───────────────────────────────────────────────

  const validCategories = ["PRE_EVENTO", "POST_EVENTO", "COTIZACION", "COBRO", "INVENTARIO", "VEHICULO", "PERSONAL", "BODEGA", "MANTENIMIENTO", "ADMINISTRACION", "OTRO"];
  const validPriorities = ["BAJA", "MEDIA", "ALTA", "URGENTE"];
  const validStatuses = ["PENDIENTE", "EN_PROCESO"];

  for (const task of allTasks) {
    const exists = await prisma.task.findFirst({
      where: {
        title: task.title,
        type: task.type as any,
        assignedToId: task.assignedToId,
        dueDate: task.dueDate,
      },
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
          type: task.type as any,
          frequency: (task.frequency ?? null) as any,
          dayOfWeek: (task.dayOfWeek ?? null) as any,
        },
      });
    }
  }

  console.log(`${allTasks.length} tareas de agosto 2026 procesadas`);
}

main()
  .catch((e) => {
    console.error("Error en seed-prod:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
