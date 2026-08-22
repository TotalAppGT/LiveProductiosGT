import { prisma } from "@/lib/prisma";
import { weekdayNameOf } from "@/lib/task-utils";

export interface DataFixResult {
  fixedNormalized: number;
  duplicatesDeleted: number;
  variablesAnchored: number;
  renamedAdmin: boolean;
  adminName: string;
}

// Corrección de datos existentes desde la raíz:
// 1) Tareas FIJA semanales/diarias (con dayOfWeek o DIARIA) → dueDate = null
//    (el esquema es semanal por día, NO tienen fecha concreta; evita fechas de oct/abr/dic)
// 2) Duplicados: mismas tareas FIJA (mismo título, asignado, frecuencia, día) → deja una sola
// 3) Anclar VARIABLES: ponerles su día de la semana (día ancla) si no lo tienen
// 4) Renombrar la cuenta del administrador con número 35187153 a "Daniel"
export async function runDataFix(): Promise<DataFixResult> {
  // 1) Normalizar fijas del esquema: sin fecha concreta
  const normalized = await prisma.task.updateMany({
    where: {
      type: "FIJA",
      dueDate: { not: null },
      OR: [{ dayOfWeek: { not: null } }, { frequency: "DIARIA" }],
    },
    data: { dueDate: null },
  });

  // 2) Duplicados de tareas FIJA pendientes
  const pending = await prisma.task.findMany({
    where: { type: "FIJA", status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, assignedToId: true, type: true, frequency: true, dayOfWeek: true },
  });

  const seen = new Map<string, string>();
  let deleted = 0;
  const deletedIds: string[] = [];

  for (const t of pending) {
    const key = `${t.assignedToId}|${t.title.trim().toLowerCase()}|${t.frequency || ""}|${t.dayOfWeek || ""}`;
    const firstId = seen.get(key);
    if (firstId) {
      deletedIds.push(t.id);
      deleted++;
    } else {
      seen.set(key, t.id);
    }
  }

  if (deletedIds.length > 0) {
    await prisma.task.deleteMany({ where: { id: { in: deletedIds } } });
  }

  // 3) Anclar VARIABLES existentes a su día de la semana
  const variables = await prisma.task.findMany({
    where: {
      type: "DINAMICA",
      category: "OTRO",
      dayOfWeek: null,
      dueDate: { not: null },
      title: { not: { startsWith: "🔔" } },
      status: { in: ["PENDIENTE", "EN_PROCESO", "REPROGRAMADA"] },
    },
    select: { id: true, dueDate: true },
  });
  let anchored = 0;
  for (const v of variables) {
    if (!v.dueDate) continue;
    await prisma.task.update({
      where: { id: v.id },
      data: { dayOfWeek: weekdayNameOf(new Date(v.dueDate)) as any },
    });
    anchored++;
  }

  // 4) Renombrar la cuenta de Daniel (número 35187153)
  const adminUser = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: { contains: "35187153" } },
        { whatsappNumber: { contains: "35187153" } },
      ],
    },
  });
  let renamed = false;
  if (adminUser && adminUser.name !== "Daniel") {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { name: "Daniel" },
    });
    renamed = true;
  }

  return {
    fixedNormalized: normalized.count,
    duplicatesDeleted: deleted,
    variablesAnchored: anchored,
    renamedAdmin: renamed,
    adminName: adminUser?.name || "no encontrado",
  };
}
