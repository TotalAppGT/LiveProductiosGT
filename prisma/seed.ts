import { PrismaClient, Role, TaskType, TaskFrequency, DayOfWeek, TaskStatus, TaskPriority, TaskCategory, EventStatus, InventoryCategory, InventoryStatus, InventoryLocation, VehicleStatus, VehicleType, CobroStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de Live Productions Guatemala...');

  const passwordHash = await bcrypt.hash('Live2024!', 10);

  // ── Usuarios ──────────────────────────────────────────────
  const jorge = await prisma.user.upsert({
    where: { email: 'jorge@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'jorge@liveproductions.com.gt',
      password: passwordHash,
      name: 'Jorge Mérida',
      phone: '+502 5555-0001',
      role: Role.DUENO,
      whatsappNumber: '+502 5555-0001',
    },
  });

  const diana = await prisma.user.upsert({
    where: { email: 'diana@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'diana@liveproductions.com.gt',
      password: passwordHash,
      name: 'Diana Mérida',
      phone: '+502 5555-0002',
      role: Role.JEFE,
      whatsappNumber: '+502 5555-0002',
    },
  });

  const brenda = await prisma.user.upsert({
    where: { email: 'brenda@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'brenda@liveproductions.com.gt',
      password: passwordHash,
      name: 'Brenda López',
      phone: '+502 5555-0003',
      role: Role.JEFE,
      whatsappNumber: '+502 5555-0003',
    },
  });

  const abel = await prisma.user.upsert({
    where: { email: 'abel@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'abel@liveproductions.com.gt',
      password: passwordHash,
      name: 'Abel Morales',
      phone: '+502 5555-0004',
      role: Role.EMPLEADO,
      whatsappNumber: '+502 5555-0004',
    },
  });

  const selvin = await prisma.user.upsert({
    where: { email: 'selvin@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'selvin@liveproductions.com.gt',
      password: passwordHash,
      name: 'Selvin Hernández',
      phone: '+502 5555-0005',
      role: Role.EMPLEADO,
      whatsappNumber: '+502 5555-0005',
    },
  });

  const exequiel = await prisma.user.upsert({
    where: { email: 'exequiel@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'exequiel@liveproductions.com.gt',
      password: passwordHash,
      name: 'Exequiel Pérez',
      phone: '+502 5555-0006',
      role: Role.EMPLEADO,
      whatsappNumber: '+502 5555-0006',
    },
  });

  const denis = await prisma.user.upsert({
    where: { email: 'denis@liveproductions.com.gt' },
    update: {},
    create: {
      email: 'denis@liveproductions.com.gt',
      password: passwordHash,
      name: 'Denis López',
      phone: '+502 5555-0007',
      role: Role.EMPLEADO,
      whatsappNumber: '+502 5555-0007',
    },
  });

  console.log('Usuarios creados: 7');

  // ── Tareas fijas diarias ──────────────────────────────────
  const now = new Date();

  const fixedTasks = [
    // LUNES
    {
      title: 'Revisión de equipo de audio',
      description: 'Revisar parlantes, consolas, cables y micrófonos que se usaron el fin de semana.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.LUNES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.INVENTARIO,
      assignedToId: selvin.id, assignedById: jorge.id,
    },
    {
      title: 'Limpieza de bodega',
      description: 'Barrer, ordenar cables y limpiar superficies de trabajo.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.LUNES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.MEDIA, category: TaskCategory.BODEGA,
      assignedToId: exequiel.id, assignedById: diana.id,
    },
    {
      title: 'Revisión de cobros pendientes',
      description: 'Revisar facturas vencidas y enviar recordatorios a clientes.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.LUNES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.COBRO,
      assignedToId: brenda.id, assignedById: jorge.id,
    },
    // MARTES
    {
      title: 'Prueba de consolas y mezcladoras',
      description: 'Encender consolas principales, revisar canales, ecualizadores y efectos.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.MARTES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.MANTENIMIENTO,
      assignedToId: selvin.id, assignedById: jorge.id,
    },
    {
      title: 'Revisión de iluminación',
      description: 'Probar cabezales móviles, luces LED, pars y dmx.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.MARTES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.MEDIA, category: TaskCategory.INVENTARIO,
      assignedToId: selvin.id, assignedById: diana.id,
    },
    {
      title: 'Cotizaciones de eventos nuevos',
      description: 'Preparar y enviar cotizaciones para eventos solicitados durante la semana.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.MARTES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.COTIZACION,
      assignedToId: diana.id, assignedById: jorge.id,
    },
    // MIERCOLES
    {
      title: 'Mantenimiento de vehículos',
      description: 'Revisar niveles de aceite, agua, presión de llantas de camión y panel.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.MIERCOLES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.MEDIA, category: TaskCategory.VEHICULO,
      assignedToId: abel.id, assignedById: diana.id,
    },
    {
      title: 'Revisión de cables y conectores',
      description: 'Inspeccionar cables XLR, TRS, speakon, extensiones eléctricas.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.MIERCOLES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.MEDIA, category: TaskCategory.INVENTARIO,
      assignedToId: exequiel.id, assignedById: jorge.id,
    },
    {
      title: 'Actualización de inventario',
      description: 'Registrar entradas y salidas de equipo, verificar stock de consumibles.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.MIERCOLES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.INVENTARIO,
      assignedToId: exequiel.id, assignedById: diana.id,
    },
    // JUEVES
    {
      title: 'Coordinación de eventos del fin de semana',
      description: 'Revisar agenda sábado/domingo, confirmar personal y transporte.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.JUEVES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.URGENTE, category: TaskCategory.ADMINISTRACION,
      assignedToId: diana.id, assignedById: jorge.id,
    },
    {
      title: 'Revisión de instrumentos musicales',
      description: 'Afinar, limpiar y revisar estado de instrumentos de la banda.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.JUEVES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.MEDIA, category: TaskCategory.INVENTARIO,
      assignedToId: selvin.id, assignedById: jorge.id,
    },
    // VIERNES
    {
      title: 'Carga de equipo para eventos',
      description: 'Preparar y cargar camión/panel con el equipo necesario según rider de cada evento.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.VIERNES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.URGENTE, category: TaskCategory.PRE_EVENTO,
      assignedToId: abel.id, assignedById: diana.id,
    },
    {
      title: 'Confirmación con clientes',
      description: 'Llamar a clientes del fin de semana para confirmar horarios, locación y detalles.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.VIERNES,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.ADMINISTRACION,
      assignedToId: brenda.id, assignedById: jorge.id,
    },
    // SABADO
    {
      title: 'Cierre de caja semanal',
      description: 'Cuadrar ingresos y egresos de la semana, depósitos pendientes.',
      type: TaskType.FIJA, frequency: TaskFrequency.SEMANAL, dayOfWeek: DayOfWeek.SABADO,
      status: TaskStatus.PENDIENTE, priority: TaskPriority.ALTA, category: TaskCategory.COBRO,
      assignedToId: brenda.id, assignedById: jorge.id,
    },
  ];

  for (const t of fixedTasks) {
    await prisma.task.create({ data: t });
  }

  console.log('Tareas fijas creadas: 14');

  // ── Tareas dinámicas (pre/post evento) ────────────────────
  const dynamicTasks = [
    {
      title: 'Montaje de escenario - Boda Castillo San Felipe',
      description: 'Armar escenario principal, torres de sonido, backline y luces.',
      type: TaskType.DINAMICA, status: TaskStatus.EN_PROCESO,
      priority: TaskPriority.URGENTE, category: TaskCategory.PRE_EVENTO,
      assignedToId: abel.id, assignedById: diana.id,
      dueDate: new Date('2026-08-08T06:00:00Z'), requiresConfirmation: true,
    },
    {
      title: 'Prueba de sonido - Boda Castillo San Felipe',
      description: 'Soundcheck completo con banda, ecualizar sala, ajustar monitores.',
      type: TaskType.DINAMICA, status: TaskStatus.PENDIENTE,
      priority: TaskPriority.URGENTE, category: TaskCategory.PRE_EVENTO,
      assignedToId: selvin.id, assignedById: diana.id,
      dueDate: new Date('2026-08-08T14:00:00Z'),
    },
    {
      title: 'Coordinación de músicos - Boda Castillo San Felipe',
      description: 'Confirmar asistencia de baterista, bajista, tecladista, saxofonista y cantantes.',
      type: TaskType.DINAMICA, status: TaskStatus.COMPLETADA,
      priority: TaskPriority.ALTA, category: TaskCategory.PERSONAL,
      assignedToId: diana.id, assignedById: jorge.id,
      dueDate: new Date('2026-08-05T18:00:00Z'),
    },
    {
      title: 'Desmontaje post-evento - Boda Castillo San Felipe',
      description: 'Desarmar equipo, enrollar cables, inventariar y cargar camión.',
      type: TaskType.DINAMICA, status: TaskStatus.PENDIENTE,
      priority: TaskPriority.ALTA, category: TaskCategory.POST_EVENTO,
      assignedToId: abel.id, assignedById: diana.id,
      dueDate: new Date('2026-08-09T01:00:00Z'), requiresConfirmation: true,
    },
    {
      title: 'Cotización evento corporativo Grupo Marítimo',
      description: 'Cotizar sonido para conferencia 100 personas: 2 parlantes, 2 micrófonos inalámbricos, podio.',
      type: TaskType.DINAMICA, status: TaskStatus.EN_PROCESO,
      priority: TaskPriority.ALTA, category: TaskCategory.COTIZACION,
      assignedToId: brenda.id, assignedById: jorge.id,
      dueDate: new Date('2026-08-06T17:00:00Z'),
    },
    {
      title: 'Facturación pendiente - Evento Quinceañera Mendoza',
      description: 'Generar factura electrónica, enviar por correo y WhatsApp al cliente.',
      type: TaskType.DINAMICA, status: TaskStatus.PENDIENTE,
      priority: TaskPriority.MEDIA, category: TaskCategory.COBRO,
      assignedToId: brenda.id, assignedById: jorge.id,
      dueDate: new Date('2026-08-07T17:00:00Z'),
    },
    {
      title: 'Reparación de cable XLR dañado',
      description: 'Soldar conectores XLR macho/hembra en 3 cables reportados dañados.',
      type: TaskType.DINAMICA, status: TaskStatus.PENDIENTE,
      priority: TaskPriority.MEDIA, category: TaskCategory.MANTENIMIENTO,
      assignedToId: selvin.id, assignedById: diana.id,
      dueDate: new Date('2026-08-07T17:00:00Z'),
    },
    {
      title: 'Compra de consumibles',
      description: 'Comprar cinta gaffer, pilas AA/AAA, baterías 9V, amarras plásticas.',
      type: TaskType.DINAMICA, status: TaskStatus.PENDIENTE,
      priority: TaskPriority.BAJA, category: TaskCategory.INVENTARIO,
      assignedToId: abel.id, assignedById: diana.id,
      dueDate: new Date('2026-08-06T12:00:00Z'),
    },
  ];

  for (const t of dynamicTasks) {
    await prisma.task.create({ data: t });
  }

  console.log('Tareas dinámicas creadas: 8');

  // ── Inventario ────────────────────────────────────────────
  const inventoryItems = [
    {
      name: 'Parlante Activo JBL PRX815W', category: InventoryCategory.AUDIO,
      quantity: 4, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'JBL-815-001',
    },
    {
      name: 'Subwoofer JBL PRX818XLFW', category: InventoryCategory.AUDIO,
      quantity: 2, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'JBL-818-001',
    },
    {
      name: 'Consola Behringer X32 Compact', category: InventoryCategory.AUDIO,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'BH-X32C-001',
    },
    {
      name: 'Consola Yamaha MG16XU', category: InventoryCategory.AUDIO,
      quantity: 1, status: InventoryStatus.EN_REPARACION, location: InventoryLocation.BODEGA_PP, serialNumber: 'YM-MG16-001', notes: 'Canal 3 con ruido, enviar a técnico',
    },
    {
      name: 'Micrófono Inalámbrico Shure BLX24/SM58', category: InventoryCategory.AUDIO,
      quantity: 4, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'SH-BLX-001',
    },
    {
      name: 'Micrófono Inalámbrico Shure BLX14/PGA31 Headset', category: InventoryCategory.AUDIO,
      quantity: 2, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'SH-BLXH-001',
    },
    {
      name: 'Cable XLR 6m', category: InventoryCategory.CABLEADO,
      quantity: 20, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Cable Speakon 15m', category: InventoryCategory.CABLEADO,
      quantity: 8, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Extensión eléctrica 15m', category: InventoryCategory.CABLEADO,
      quantity: 6, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Cabezal Móvil Chauvet Intimidator Spot 260', category: InventoryCategory.ILUMINACION,
      quantity: 4, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'CH-IS260-001',
    },
    {
      name: 'Par LED SlimPAR 64', category: InventoryCategory.ILUMINACION,
      quantity: 8, status: InventoryStatus.ASIGNADO, location: InventoryLocation.EN_EVENTO, assignedToId: selvin.id,
    },
    {
      name: 'DMX Controller Chauvet Obey 40', category: InventoryCategory.ILUMINACION,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'CH-OB40-001',
    },
    {
      name: 'Batería Pearl Export Series', category: InventoryCategory.INSTRUMENTO,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_PP, serialNumber: 'PL-EXP-001',
    },
    {
      name: 'Amplificador de Bajo Ampeg BA-115', category: InventoryCategory.INSTRUMENTO,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_PP, serialNumber: 'AM-BA115-001',
    },
    {
      name: 'Teclado Yamaha MODX8', category: InventoryCategory.INSTRUMENTO,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_PP, serialNumber: 'YM-MODX8-001',
    },
    {
      name: 'Saxofón Alto Yamaha YAS-280', category: InventoryCategory.INSTRUMENTO,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_PP, serialNumber: 'YM-YAS280-001',
    },
    {
      name: 'Tarima modular 1x2m', category: InventoryCategory.MOBILIARIO,
      quantity: 10, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Atril de micrófono', category: InventoryCategory.MOBILIARIO,
      quantity: 6, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Cinta Gaffer negra (rollo)', category: InventoryCategory.CONSUMIBLE,
      quantity: 3, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Pilas AA Duracell (paquete 24)', category: InventoryCategory.CONSUMIBLE,
      quantity: 2, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN,
    },
    {
      name: 'Taladro inalámbrico DeWalt', category: InventoryCategory.HERRAMIENTA,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, serialNumber: 'DW-DCD771-001',
    },
    {
      name: 'Caja de herramientas completa', category: InventoryCategory.HERRAMIENTA,
      quantity: 1, status: InventoryStatus.DISPONIBLE, location: InventoryLocation.BODEGA_ELGIN, notes: 'Llaves, desarmadores, pinzas, multímetro',
    },
  ];

  for (const item of inventoryItems) {
    await prisma.inventoryItem.create({ data: item });
  }

  console.log('Items de inventario creados: 22');

  // ── Vehículos ─────────────────────────────────────────────
  await prisma.vehicle.create({
    data: {
      name: 'Camión Hino 300', plate: 'P-742KLM', type: VehicleType.CAMION,
      status: VehicleStatus.DISPONIBLE, mileage: 85000, fuelLevel: 75,
      assignedToId: abel.id, notes: 'Camión principal de carga de equipo.',
    },
  });

  await prisma.vehicle.create({
    data: {
      name: 'Toyota Hiace Panel', plate: 'P-123ABC', type: VehicleType.PANEL,
      status: VehicleStatus.EN_USO, mileage: 120000, fuelLevel: 50,
      assignedToId: exequiel.id, notes: 'Vehículo asignado a bodega y compras.',
    },
  });

  await prisma.vehicle.create({
    data: {
      name: 'Toyota Hilux Pickup', plate: 'P-456DEF', type: VehicleType.PICKUP,
      status: VehicleStatus.DISPONIBLE, mileage: 95000, fuelLevel: 90,
      assignedToId: selvin.id, notes: 'Para transporte de personal y equipo pequeño.',
    },
  });

  console.log('Vehículos creados: 3');

  // ── Eventos ───────────────────────────────────────────────
  const bodaSanFelipe = await prisma.event.create({
    data: {
      name: 'Boda Castillo San Felipe',
      clientName: 'María José Ramírez',
      clientPhone: '+502 5555-1001',
      clientEmail: 'mjramirez@gmail.com',
      date: new Date('2026-08-09T18:00:00Z'),
      location: 'Castillo San Felipe, Antigua Guatemala',
      guestCount: 150,
      status: EventStatus.CONFIRMADO,
      serviceType: 'Sonido + Iluminación + Banda',
      audioType: 'Sonido profesional para exterior',
      plannerId: diana.id,
      responsibleId: selvin.id,
      notes: 'Llevar generador eléctrico de respaldo. Montaje 8:00 AM. Boda al aire libre.',
    },
  });

  const corporativo = await prisma.event.create({
    data: {
      name: 'Conferencia Grupo Marítimo',
      clientName: 'Lic. Carlos Estrada',
      clientPhone: '+502 5555-2001',
      clientEmail: 'cestrada@maritimo.com.gt',
      date: new Date('2026-08-15T09:00:00Z'),
      location: 'Hotel Real Intercontinental, Zona 10',
      guestCount: 100,
      status: EventStatus.COTIZACION,
      serviceType: 'Sonido para conferencia',
      audioType: '2 parlantes + 2 micrófonos inalámbricos + podio',
      plannerId: brenda.id,
      responsibleId: selvin.id,
      notes: 'Pendiente aprobación de cotización. Montaje 7:00 AM.',
    },
  });

  const quinceanera = await prisma.event.create({
    data: {
      name: 'Quinceañera Mendoza',
      clientName: 'Familia Mendoza',
      clientPhone: '+502 5555-3001',
      clientEmail: 'fmendoza@hotmail.com',
      date: new Date('2026-08-02T19:00:00Z'),
      location: 'Salón Imperial, Zona 1',
      guestCount: 200,
      status: EventStatus.COMPLETADO,
      serviceType: 'Sonido + Iluminación + DJ',
      audioType: 'Sonido full range + subwoofers + DJ booth',
      plannerId: diana.id,
      responsibleId: selvin.id,
      notes: 'Evento ya realizado. Pendiente facturación final.',
    },
  });

  const bodaAntigua = await prisma.event.create({
    data: {
      name: 'Boda Convento Santa Clara',
      clientName: 'Andrea Morales',
      clientPhone: '+502 5555-4001',
      clientEmail: 'amorales@gmail.com',
      date: new Date('2026-08-23T17:00:00Z'),
      location: 'Convento Santa Clara, Antigua Guatemala',
      guestCount: 120,
      status: EventStatus.COTIZACION,
      serviceType: 'Sonido + Iluminación + Músicos (trío)',
      audioType: 'Sonido boutique para interior',
      plannerId: diana.id,
      responsibleId: selvin.id,
      notes: 'Cliente pide trío acústico (guitarra, cajón peruano, saxofón).',
    },
  });

  console.log('Eventos creados: 4');

  // ── Cobros ────────────────────────────────────────────────
  await prisma.cobro.create({
    data: {
      clientName: 'Familia Mendoza',
      amount: 8500.00,
      status: CobroStatus.PENDIENTE,
      invoiceNumber: 'FAC-2026-0042',
      dueDate: new Date('2026-08-09T23:59:00Z'),
      assignedToId: brenda.id,
      notes: 'Pago final pendiente, cliente ya abonó Q5,000.',
      eventId: quinceanera.id,
    },
  });

  await prisma.cobro.create({
    data: {
      clientName: 'María José Ramírez',
      amount: 12000.00,
      status: CobroStatus.COMPLETADO,
      invoiceNumber: 'FAC-2026-0045',
      dueDate: new Date('2026-08-05T23:59:00Z'),
      assignedToId: brenda.id,
      notes: 'Anticipo del 50% recibido. Segundo 50% pendiente día del evento.',
      eventId: bodaSanFelipe.id,
    },
  });

  await prisma.cobro.create({
    data: {
      clientName: 'Lic. Carlos Estrada',
      amount: 4500.00,
      status: CobroStatus.PENDIENTE,
      invoiceNumber: 'FAC-2026-0048',
      dueDate: new Date('2026-08-18T23:59:00Z'),
      assignedToId: brenda.id,
      notes: 'Cotización enviada, en espera de aprobación.',
      eventId: corporativo.id,
    },
  });

  console.log('Cobros creados: 3');

  // ── Relación tardías con eventos ──────────────────────────
  await prisma.task.updateMany({
    where: { title: { contains: 'Castillo San Felipe' } },
    data: { eventId: bodaSanFelipe.id },
  });

  await prisma.task.updateMany({
    where: { title: { contains: 'Grupo Marítimo' } },
    data: { eventId: corporativo.id },
  });

  console.log('Tareas vinculadas a eventos.');
  console.log('');
  console.log('Seed completado exitosamente.');
  console.log('Credenciales de prueba:');
  console.log('  Dueño:       jorge@liveproductions.com.gt / Live2024!');
  console.log('  Coordinadora: diana@liveproductions.com.gt / Live2024!');
  console.log('  Admin:        brenda@liveproductions.com.gt / Live2024!');
  console.log('  Logística:    abel@liveproductions.com.gt / Live2024!');
  console.log('  Técnico:      selvin@liveproductions.com.gt / Live2024!');
  console.log('  Bodega:       exequiel@liveproductions.com.gt / Live2024!');
  console.log('  Staff:        denis@liveproductions.com.gt / Live2024!');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
