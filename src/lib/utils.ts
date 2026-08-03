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

export function formatDate(
  date: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return d.toLocaleDateString("es-GT", options || defaultOptions);
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
