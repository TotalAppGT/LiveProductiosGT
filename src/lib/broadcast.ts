import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/whatsapp";
import { getGuatemalaWallClock, guatemalaDate, applyGuatemalaTime } from "@/lib/task-utils";

export const LUNA_UPDATE_TITLE = "📅 Reunión LUNA — Actualización del sistema";

export function nextMeetingTime(): Date {
  const w = getGuatemalaWallClock();
  const tomorrow = guatemalaDate(w.year, w.month, w.day + 1);
  return applyGuatemalaTime(tomorrow, 11, 0);
}

export function buildLUNAUpdateMessage(userName: string): string {
  return `📢 *Actualización del sistema — LUNA, tu asistente administrativa*

Hola ${userName}, te compartimos el resumen de las mejoras recientes de LUNA para que trabaje mejor con el equipo:

⏰ *1. Horarios exactos en hora de Guatemala (UTC-6)*
Se corrigió un desfase de 6 horas. Recordatorios, tareas, reuniones y mensajes programados ahora se guardan y muestran en hora de Guatemala, sin errores de hora.

🤖 *2. LUNA ahora es proactiva e intuitiva*
• *Revisa* tu contexto (tareas, eventos, cobros) y te avisa lo que requiere atención.
• *Recuerda* tus pendientes urgentes o vencidos y los eventos próximos.
• *Toma nota*: si mencionás algo por hacer, te ofrece agendarlo como tarea o recordatorio.
• *Ve patrones*: posposiciones repetidas, incumplimiento o accesos bajos, y te sugiere un plan.
• *Pregunta si no entiende*: si un día, hora o persona no está clara, te hace una pregunta corta antes de agendar (nunca adivina).
• Si no entiende algo, te sugiere el formato correcto para avanzar rápido.

📋 *3. Tareas más claras*
• *tareas de hoy* ahora incluye también tus actividades fijas del día.
• Los recordatorios automáticos cuentan solo lo de HOY, sin mezclar pendientes de otros días.
• Las tareas fijas se regeneran en el día correcto de la semana.
• Los recordatorios suenan 10 minutos antes y a la hora exacta.

⚡ *4. Más rápido y confiable*
• La IA reintenta ante fallas y el reconocimiento de fechas y horas es más preciso.

📅 *REUNIÓN MAÑANA — ¿Podés?*
Queremos mostrarles todo en acción. ¿Podemos reunirnos mañana a las *11:00 a.m.*?
Te llega el recordatorio automático. Solo confirmá con *"sí"* o *"no"* por aquí.

🙌 ¡Gracias por ser parte del equipo!
— *Live Productions GT*`;
}

// Envía a todos los usuarios activos el detalle de cambios + invitación a reunión
// y crea un recordatorio de la reunión para cada uno.
export async function sendLUNAUpdateBroadcast(
  initiatorUserId: string
): Promise<{ sent: number; failed: number; remindersCreated: number; meetingTime: Date }> {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, phone: true, whatsappNumber: true },
  });

  const meetingTime = nextMeetingTime();
  const meetingDesc = "Reunión mañana a las 11:00 a.m. (hora de Guatemala) para ver las mejoras de LUNA en acción.";

  let sent = 0;
  let failed = 0;
  let remindersCreated = 0;

  for (const user of users) {
    const to = user.whatsappNumber || user.phone;
    if (!to) continue;

    const ok = await sendMessage(to, buildLUNAUpdateMessage(user.name)).catch(() => false);
    if (ok) {
      sent++;
    } else {
      failed++;
    }

    await prisma.reminder.create({
      data: {
        title: LUNA_UPDATE_TITLE,
        description: meetingDesc,
        remindAt: meetingTime,
        createdById: initiatorUserId,
        assignedToId: user.id,
      },
    });
    remindersCreated++;
  }

  return { sent, failed, remindersCreated, meetingTime };
}
