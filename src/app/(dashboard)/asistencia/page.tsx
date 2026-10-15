"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

const gtKey = (d: string | Date) => new Date(d).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
const gtTime = (d: string | Date) => new Date(d).toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" });
const gtToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });

export default function AsistenciaPage() {
  const { user, token } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [places, setPlaces] = useState<any[]>([]);
  const [date, setDate] = useState(gtToday());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const canEdit = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const H = { Authorization: `Bearer ${token}` };
      const [r, p] = await Promise.all([
        fetch("/api/attendance?days=30", { headers: H }).then((x) => x.json()),
        fetch("/api/places", { headers: H }).then((x) => x.json()),
      ]);
      if (r.success) setRecords(r.data);
      if (p.success) setPlaces(p.data.filter((x: any) => x.type === "BODEGA" || x.isAttendance));
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function savePlace(p: any) {
    setSavingId(p.id);
    try {
      const res = await fetch(`/api/places/${p.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entryTime: p.entryTime, exitTime: p.exitTime, radiusM: p.radiusM, isAttendance: p.isAttendance }),
      });
      const json = await res.json();
      if (json.success) toast.success("Lugar actualizado");
      else toast.error(json.error || "Error");
    } catch {
      toast.error("Error");
    } finally {
      setSavingId(null);
    }
  }

  const dayRecords = records.filter((r) => gtKey(r.createdAt) === date);

  // Resumen por persona del día
  const summary: { name: string; entrada?: string; salida?: string; place?: string; valid: boolean }[] = [];
  const byUser = new Map<string, any[]>();
  for (const r of dayRecords) byUser.set(r.user?.name || "?", [...(byUser.get(r.user?.name || "?") || []), r]);
  for (const [name, recs] of byUser) {
    const ent = recs.filter((r) => r.type === "ENTRADA").sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))[0];
    const sal = recs.filter((r) => r.type === "SALIDA").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    summary.push({ name, entrada: ent ? gtTime(ent.createdAt) : undefined, salida: sal ? gtTime(sal.createdAt) : undefined, place: (ent?.locationName || sal?.locationName) || undefined, valid: !!(ent?.valid) });
  }
  summary.sort((a, b) => a.name.localeCompare(b.name));

  function hours(e?: string, s?: string) {
    if (!e || !s) return "—";
    const [eh, em] = e.split(":").map(Number);
    const [sh, sm] = s.split(":").map(Number);
    let mins = sh * 60 + sm - (eh * 60 + em);
    if (mins < 0) mins += 24 * 60;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Asistencia</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ingreso/salida por ubicación (geocerca) de LUNA y la app.</p>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white" />
      </div>

      {canEdit && places.length > 0 && (
        <Card variant="bordered" className="p-3">
          <p className="text-sm font-semibold mb-2">📍 Lugares de asistencia (horario y radio)</p>
          <div className="space-y-2">
            {places.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-end gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
                <div className="min-w-[150px] text-sm font-medium">{p.name}</div>
                <div className="w-24"><Input label="Entrada" type="time" value={p.entryTime || ""} onChange={(e) => setPlaces((prev) => prev.map((x, idx) => idx === i ? { ...x, entryTime: e.target.value } : x))} /></div>
                <div className="w-24"><Input label="Salida" type="time" value={p.exitTime || ""} onChange={(e) => setPlaces((prev) => prev.map((x, idx) => idx === i ? { ...x, exitTime: e.target.value } : x))} /></div>
                <div className="w-24"><Input label="Radio m" type="number" value={String(p.radiusM || 150)} onChange={(e) => setPlaces((prev) => prev.map((x, idx) => idx === i ? { ...x, radiusM: parseInt(e.target.value) || 150 } : x))} /></div>
                <label className="flex items-center gap-1 text-xs text-gray-500 pb-2">
                  <input type="checkbox" checked={!!p.isAttendance} onChange={(e) => setPlaces((prev) => prev.map((x, idx) => idx === i ? { ...x, isAttendance: e.target.checked } : x))} /> Asistencia
                </label>
                <Button size="sm" onClick={() => savePlace(p)} isLoading={savingId === p.id}>Guardar</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card variant="bordered" className="overflow-hidden">
        <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800/70 text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
          Resumen del día — {date} ({summary.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase">
                <th className="text-left px-3 py-2">Persona</th>
                <th className="text-left px-3 py-2">Entrada</th>
                <th className="text-left px-3 py-2">Salida</th>
                <th className="text-left px-3 py-2">Horas</th>
                <th className="text-left px-3 py-2">Lugar</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Cargando…</td></tr>
              ) : summary.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Sin registros este día.</td></tr>
              ) : summary.map((s, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2">{s.entrada || "—"}</td>
                  <td className="px-3 py-2">{s.salida || "—"}</td>
                  <td className="px-3 py-2">{hours(s.entrada, s.salida)}</td>
                  <td className="px-3 py-2">{s.place || "—"}</td>
                  <td className="px-3 py-2">
                    {s.entrada && s.salida ? <Badge size="sm" color="green">Completo</Badge> : s.entrada ? <Badge size="sm" color="yellow">Sin salida</Badge> : <Badge size="sm" color="red">Sin entrada</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card variant="bordered" className="overflow-hidden">
        <div className="px-3 py-2 bg-gray-100 dark:bg-gray-800/70 text-xs font-bold uppercase text-gray-600 dark:text-gray-300">
          Movimientos ({dayRecords.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 uppercase">
                <th className="text-left px-3 py-2">Hora</th>
                <th className="text-left px-3 py-2">Persona</th>
                <th className="text-left px-3 py-2">Tipo</th>
                <th className="text-left px-3 py-2">Lugar</th>
                <th className="text-right px-3 py-2">Dist.</th>
                <th className="text-left px-3 py-2">Fuente</th>
                <th className="text-left px-3 py-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {dayRecords.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">Sin movimientos.</td></tr>
              ) : dayRecords.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{gtTime(r.createdAt)}</td>
                  <td className="px-3 py-2 font-medium">{r.user?.name || "?"}</td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2">{r.locationName || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.distanceM != null ? `${r.distanceM} m` : "—"}</td>
                  <td className="px-3 py-2">{r.source}</td>
                  <td className="px-3 py-2">
                    {r.valid ? <Badge size="sm" color="green">En sitio/puntual</Badge> : r.inRange ? <Badge size="sm" color="yellow">Fuera de hora</Badge> : <Badge size="sm" color="red">Fuera de sitio</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
