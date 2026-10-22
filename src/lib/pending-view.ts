import { prisma } from "@/lib/prisma";

// Vista de tareas que el usuario vio por última vez. Se guarda en memoria y en
// la base, para que "hecho N" siga apuntando a la misma lista aunque haya un
// deploy/reinicio del contenedor. Expira a los 30 minutos.
const lastViewTasks = new Map<string, { ids: string[]; expires: number }>();
const TTL = 30 * 60 * 1000;

export async function saveTaskView(userId: string, tasks: { id: string }[]) {
  const ids = tasks.map((t) => t.id);
  const expires = Date.now() + TTL;
  lastViewTasks.set(userId, { ids, expires });
  try {
    await prisma.userTaskView.upsert({
      where: { userId },
      update: { ids, expiresAt: new Date(expires) },
      create: { userId, ids, expiresAt: new Date(expires) },
    });
  } catch (error) {
    console.error("saveTaskView:", error);
  }
}

export async function getTaskViewIds(userId: string): Promise<string[] | null> {
  const mem = lastViewTasks.get(userId);
  if (mem && Date.now() < mem.expires) return mem.ids;
  try {
    const row = await prisma.userTaskView.findUnique({ where: { userId } });
    if (row && row.expiresAt.getTime() > Date.now()) {
      lastViewTasks.set(userId, { ids: row.ids, expires: row.expiresAt.getTime() });
      return row.ids;
    }
    if (row) await prisma.userTaskView.delete({ where: { userId } }).catch(() => {});
  } catch (error) {
    console.error("getTaskViewIds:", error);
  }
  return null;
}
