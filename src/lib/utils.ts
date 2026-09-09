const DAY_NAMES: Record<string, string> = {
  Sunday: "Domingo",
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",
};

const SHORT_DAY_NAMES: Record<string, string> = {
  Sunday: "Dom",
  Monday: "Lun",
  Tuesday: "Mar",
  Wednesday: "Mié",
  Thursday: "Jue",
  Friday: "Vie",
  Saturday: "Sáb",
};

export const GT_TZ = "America/Guatemala";

// Interpreta un valor de fecha proveniente del frontend (que trabaja en hora de Guatemala).
// - "YYYY-MM-DD"  → se interpreta como ese DÍA en Guatemala (medianoche GT).
// - "YYYY-MM-DDTHH:mm[:ss]" sin zona → hora local de Guatemala (UTC-6).
// - Si ya trae zona (Z u offset) se deja tal cual.
export function parseGTInputDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) return new Date(value);
  const m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return new Date(value);
  const [, y, mo, d, hh, mm, ss] = m;
  const hour = hh !== undefined ? parseInt(hh, 10) + 6 : 0; // GT = UTC-6 → UTC = GT + 6h
  return new Date(Date.UTC(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10), hour, parseInt(mm || "0", 10), parseInt(ss || "0", 10)));
}

// Formato estándar de fechas del sistema: dd/mm/yyyy (Guatemala)
export function fmtDMY(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-GT", { timeZone: GT_TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

// dd/mm/yyyy hh:mm (24h)
export function fmtDMYhm(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: GT_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d).replace(", ", " ");
}

// Fecha descriptiva larga en Guatemala (ej: lunes, 7 de septiembre de 2026)
export function fmtGTLong(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: GT_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: GT_TZ,
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  };
  return d.toLocaleDateString("es-GT", opts);
}

export function formatCurrency(amount: number): string {
  return `Q ${amount.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function cn(...inputs: (string | undefined | null | false | 0 | 0n)[]): string {
  return inputs.filter((v): v is string => typeof v === "string").join(" ");
}

export function getDayName(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayNames: string[] = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  return dayNames[d.getDay()];
}

export function getWeekDay(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayNames: string[] = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
  ];
  const dayNamesShort: string[] = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return dayNamesShort[d.getDay()];
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

let idCounter = 0;

export function generateId(prefix?: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const counter = (++idCounter).toString(36);
  const id = `${timestamp}${random}${counter}`;
  return prefix ? `${prefix}_${id}` : id;
}

export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.length === 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4)}`;
  }
  return phone;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    PENDIENTE: "bg-yellow-100 text-yellow-800",
    EN_PROCESO: "bg-blue-100 text-blue-800",
    COMPLETADA: "bg-green-100 text-green-800",
    CANCELADA: "bg-red-100 text-red-800",
    REPROGRAMADA: "bg-purple-100 text-purple-800",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    BAJA: "bg-gray-100 text-gray-600",
    MEDIA: "bg-blue-100 text-blue-700",
    ALTA: "bg-orange-100 text-orange-700",
    URGENTE: "bg-red-100 text-red-700",
  };
  return colors[priority] || "bg-gray-100 text-gray-600";
}
