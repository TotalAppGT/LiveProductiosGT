import { prisma } from "@/lib/prisma";
import { sendProactiveMessage } from "@/lib/whatsapp";

export const APPROVER_ROLES = ["ADMIN", "DUENO"];

export const APPROVAL_LABELS: Record<string, string> = {
  PERDIDA: "Pérdida / faltante",
  TALLER: "Envío a taller",
  REINTEGRO: "Reintegro a bodega",
  DESCUENTO: "Descarte / baja",
  TRASLADO: "Traslado entre bodegas",
};

export function isApprover(role?: string | null) {
  return !!role && APPROVER_ROLES.includes(role);
}

// Notifica a los admins/owner (WhatsApp best-effort + actividad interna).
export async function notifyApprovers(opts: {
  type: string;
  itemName: string;
  quantity: number;
  requestedByName: string;
  warehouse?: string | null;
  orderRef?: string | null;
  notes?: string | null;
}) {
  const label = APPROVAL_LABELS[opts.type] || opts.type;
  const lines = [
    "🔔 *Aprobación pendiente*",
    label,
    `• Ítem: ${opts.itemName} (${opts.quantity} u)`,
    `• Solicita: ${opts.requestedByName}`,
  ];
  if (opts.warehouse) lines.push(`• Bodega: ${opts.warehouse}`);
  if (opts.orderRef) lines.push(`• Cuadro: ${opts.orderRef}`);
  if (opts.notes) lines.push(`• Motivo: ${opts.notes}`);
  lines.push("", "Revisar en el sistema → Aprobaciones.");
  const text = lines.join("\n");

  const approvers = await prisma.user
    .findMany({
      where: { role: { in: APPROVER_ROLES as ("ADMIN" | "DUENO")[] }, active: true },
      select: { phone: true, whatsappNumber: true },
    })
    .catch(() => []);

  await Promise.allSettled(
    approvers
      .map((u) => u.whatsappNumber || u.phone)
      .filter((to): to is string => !!to)
      .map((to) => sendProactiveMessage(to, text))
  );
}
