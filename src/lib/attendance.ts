import { prisma } from "@/lib/prisma";
import { getGuatemalaWallClock } from "@/lib/task-utils";

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function hhmmToMin(s?: string | null): number | null {
  if (!s) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
}

export interface AttendanceResult {
  ok: boolean;
  type: string;
  place: { id: string; name: string } | null;
  distance: number | null;
  inRange: boolean;
  onTime: boolean;
  valid: boolean;
  timeGT: string;
  message: string;
}

// Registra entrada/salida: valida geocerca (radio del lugar) y horario.
export async function registerAttendance(opts: {
  userId: string;
  lat: number | null;
  lng: number | null;
  type?: string;
  source?: string;
  placeName?: string | null;
  photoUrl?: string | null;
}): Promise<AttendanceResult> {
  const type = (opts.type || "ENTRADA").toUpperCase() === "SALIDA" ? "SALIDA" : "ENTRADA";
  const source = opts.source || "WHATSAPP";
  const w = getGuatemalaWallClock();
  const timeGT = `${String(w.hour).padStart(2, "0")}:${String(w.minute).padStart(2, "0")}`;
  const nowMin = w.hour * 60 + w.minute;

  let place: { id: string; name: string; lat: number; lng: number; radiusM: number; entryTime: string | null; exitTime: string | null } | null = null;
  let distance: number | null = null;

  if (opts.lat != null && opts.lng != null) {
    const places = await prisma.place.findMany();
    if (opts.placeName) {
      const named = places.find((p) => p.name.toLowerCase().includes(opts.placeName!.toLowerCase()));
      if (named) { place = named; distance = haversineM(opts.lat, opts.lng, named.lat, named.lng); }
    }
    if (!place) {
      let best: { p: (typeof places)[number]; d: number } | null = null;
      for (const p of places) {
        const d = haversineM(opts.lat, opts.lng, p.lat, p.lng);
        if (!best || d < best.d) best = { p, d };
      }
      if (best) { place = best.p; distance = best.d; }
    }
  }

  const radius = place?.radiusM ?? 150;
  const inRange = distance != null && distance <= radius;

  const expected = type === "ENTRADA" ? place?.entryTime : place?.exitTime;
  const expMin = hhmmToMin(expected);
  let onTime = true;
  if (expMin != null) {
    onTime = type === "ENTRADA" ? nowMin <= expMin + 10 : nowMin >= expMin - 10;
  }

  const valid = inRange && onTime && !!place;

  await prisma.attendanceRecord.create({
    data: {
      userId: opts.userId,
      type,
      locationName: place?.name || null,
      lat: opts.lat,
      lng: opts.lng,
      distanceM: distance != null ? Math.round(distance) : null,
      inRange,
      onTime,
      valid,
      source,
      photoUrl: opts.photoUrl || null,
    },
  }).catch(() => {});

  const fmtDist = distance != null ? `${Math.round(distance)} m` : "sin ubicación";
  let message = "";
  if (opts.lat == null || opts.lng == null) {
    message = "📍 Necesito tu *ubicación* para registrar la asistencia (tocá el clip → Ubicación).";
  } else if (!place) {
    message = "⚠️ No hay lugares de asistencia configurados. Avisá al administrador.";
  } else if (!inRange) {
    message = `⚠️ Estás a *${fmtDist}* de *${place.name}*. No se registró (fuera del sitio).`;
  } else if (!onTime) {
    message = `⏰ ${type === "ENTRADA" ? "Llegada" : "Salida"} en *${place.name}* a las ${timeGT}, pero **fuera de hora**. No cuenta como puntual.`;
  } else {
    message = `✅ *Asistencia registrada*\n📍 ${place.name}\n🕐 ${timeGT}\n${type === "ENTRADA" ? "Entrada" : "Salida"} (a ${fmtDist})`;
  }

  return { ok: valid, type, place: place ? { id: place.id, name: place.name } : null, distance, inRange, onTime, valid, timeGT, message };
}
