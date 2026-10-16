// Vista de tareas que el usuario vio por última vez (en memoria, por proceso).
// La usan TANTO el webhook (comandos "hecho N", "posponer N") COMO los mensajes
// programados (7/11/2pm, vencidas 8/4pm), para que el número coincida con lo que
// LUNA acaba de enviar. Expira a los 30 minutos.
const lastViewTasks = new Map<string, { ids: string[]; expires: number }>();

export function saveTaskView(userId: string, tasks: { id: string }[]) {
  lastViewTasks.set(userId, { ids: tasks.map((t) => t.id), expires: Date.now() + 30 * 60 * 1000 });
}

export function getTaskViewIds(userId: string): string[] | null {
  const v = lastViewTasks.get(userId);
  if (!v || Date.now() >= v.expires) return null;
  return v.ids;
}
