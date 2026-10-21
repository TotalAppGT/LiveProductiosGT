"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { CalendarDays, Users, Truck, Music, Plus, ChevronLeft, ChevronRight, FileText, FileSpreadsheet, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const ROLES = ["AUDIO", "ILUMINACION", "CARGA", "DJ", "MUSICO", "PILOTO", "PRODUCCION", "ZANQUERO", "OTRO"];
const ROLE_LABELS: Record<string, string> = {
  AUDIO: "Audio", ILUMINACION: "Iluminación", CARGA: "Carga", DJ: "DJ", MUSICO: "Músico",
  PILOTO: "Piloto", PRODUCCION: "Producción", ZANQUERO: "Zanquero", OTRO: "Otro",
};
const STATUS_LABELS: Record<string, string> = { PENDIENTE: "Pendiente", CONFIRMADO: "Confirmado", RECHAZADO: "Rechazado" };
const STATUS_COLORS: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  CONFIRMADO: "bg-green-100 text-green-700",
  RECHAZADO: "bg-red-100 text-red-700",
};

function gtToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
}
function mondayOf(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  return new Date(dt.getTime() - (day - 1) * 86400000).toISOString().slice(0, 10);
}
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function fmtDay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-GT", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}
function fmtEventDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" });
}
function dateKey(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" }) : "";
}

export default function OperacionesPage() {
  const { user, token } = useAuth();
  const [weekStart, setWeekStart] = useState(mondayOf(gtToday()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"semana" | "staff">("semana");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStaff, setShowStaff] = useState(false);
  const [staffForm, setStaffForm] = useState<any>({ id: "", name: "", phone: "", roles: [], userId: "" });
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const canView = user?.role === "ADMIN" || user?.role === "DUENO" || user?.role === "JEFE";

  const fetchWeek = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/operations/week?from=${weekStart}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setData(json.data);
      else toast.error(json.error || "Error al cargar");
    } catch {
      toast.error("Error al cargar operaciones");
    } finally {
      setLoading(false);
    }
  }, [token, weekStart]);

  useEffect(() => { fetchWeek(); }, [fetchWeek]);

  useEffect(() => {
    if (!token) return;
    fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json()).then((j) => { if (Array.isArray(j)) setUsers(j); }).catch(() => {});
  }, [token]);

  const selected = useMemo(() => data?.events?.find((e: any) => e.id === selectedId) || null, [data, selectedId]);

  async function refresh() {
    await fetchWeek();
  }

  async function post(url: string, body: any, method = "POST") {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) { toast.success("Guardado"); await refresh(); return true; }
      toast.error(json.error || "Error");
      return false;
    } catch {
      toast.error("Error al guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function remove(url: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    setSaving(true);
    try {
      const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) { toast.success("Eliminado"); await refresh(); }
      else toast.error(json.error || "Error");
    } finally {
      setSaving(false);
    }
  }

  async function downloadReport(format: "pdf" | "xlsx") {
    try {
      const res = await fetch(`/api/operations/report?from=${weekStart}&format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar reporte"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cuadro-operaciones-${weekStart}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Error al descargar");
    }
  }

  function coverage(event: any): { role: string; required: number; assigned: number; confirmed: number; missing: number }[] {
    return (event.crewRequirements || []).map((r: any) => {
      const assigned = (event.crewAssignments || []).filter((a: any) => a.role === r.role);
      return {
        role: r.role,
        required: r.quantity,
        assigned: assigned.length,
        confirmed: assigned.filter((a: any) => a.status === "CONFIRMADO").length,
        missing: Math.max(0, r.quantity - assigned.length),
      };
    });
  }

  function vehicleStats(event: any, ev: any) {
    const riding = (event.crewAssignments || []).filter((a: any) => a.vehicleId === ev.vehicleId).length;
    const driverAssigned = ev.driverId && (event.crewAssignments || []).some((a: any) => a.staffId === ev.driverId && a.vehicleId === ev.vehicleId);
    const passengers = riding + (ev.driverId && !driverAssigned ? 1 : 0);
    const seats = ev.vehicle?.seats || 0;
    return { passengers, seats, over: seats > 0 && passengers > seats };
  }

  const summary = useMemo(() => {
    const events = data?.events || [];
    let required = 0, assigned = 0, missing = 0, over = 0;
    for (const e of events) {
      for (const c of coverage(e)) { required += c.required; assigned += c.assigned; missing += c.missing; }
      for (const ev of e.eventVehicles || []) if (vehicleStats(e, ev).over) over++;
    }
    return { events: events.length, required, assigned, missing, over };
  }, [data]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  if (!canView) return <div className="p-8 text-center text-gray-500">Acceso no autorizado</div>;
  if (loading && !data) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2"><CalendarDays className="w-6 h-6" /> Operaciones</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadReport("xlsx")}><FileSpreadsheet className="w-4 h-4 mr-1" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport("pdf")}><FileText className="w-4 h-4 mr-1" /> PDF</Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">Staff, músicos y logística por semana · lunes a domingo</p>

      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-semibold">{fmtDay(weekStart)} — {fmtDay(addDays(weekStart, 6))}</span>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(gtToday()))}>Hoy</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Card className="p-3"><p className="text-xs text-gray-500">Eventos</p><p className="text-2xl font-bold">{summary.events}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Plazas requeridas</p><p className="text-2xl font-bold">{summary.required}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Asignadas</p><p className="text-2xl font-bold text-blue-600">{summary.assigned}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Faltan</p><p className={`text-2xl font-bold ${summary.missing > 0 ? "text-red-600" : "text-green-600"}`}>{summary.missing}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Vehículos excedidos</p><p className={`text-2xl font-bold ${summary.over > 0 ? "text-red-600" : "text-green-600"}`}>{summary.over}</p></Card>
      </div>

      <div className="flex gap-2 mb-4">
        {[["semana", "Semana"], ["staff", "Staff"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700"}`}>{l}</button>
        ))}
        <Button size="sm" onClick={() => { setStaffForm({ id: "", name: "", phone: "", roles: [], userId: "" }); setShowStaff(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo staff
        </Button>
      </div>

      {tab === "semana" && (
        <>
          <div className="grid gap-3 mb-8">
            {(data?.events || []).map((event: any) => {
              const cov = coverage(event);
              const missing = cov.filter((c) => c.missing > 0);
              const overVehicles = (event.eventVehicles || []).filter((ev: any) => vehicleStats(event, ev).over);
              return (
                <Card key={event.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">{fmtEventDate(event.date)}</span>
                        {event.venue && <span className="text-xs text-gray-500">📍 {event.venue}</span>}
                        {missing.length > 0 ? (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">⚠ Falta {missing.reduce((s, c) => s + c.missing, 0)}</span>
                        ) : (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">✓ Cobertura completa</span>
                        )}
                        {overVehicles.length > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">🚚 {overVehicles.length} vehículo(s) excedido(s)</span>}
                      </div>
                      <h3 className="font-semibold mt-2 text-lg">{event.name}</h3>
                      {event.clientName && <p className="text-sm text-gray-600">{event.clientName}</p>}
                      <div className="flex flex-wrap gap-2 mt-2">
                        {cov.length === 0 && <span className="text-xs text-gray-400">Sin requerimientos definidos</span>}
                        {cov.map((c: any) => (
                          <span key={c.role} className={`text-xs px-2 py-1 rounded border ${c.missing > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-green-50 border-green-200 text-green-700"}`}>
                            {ROLE_LABELS[c.role] || c.role}: {c.assigned}/{c.required}{c.missing > 0 ? ` (falta ${c.missing})` : ""} · ✅ {c.confirmed}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                        <span>👥 {event.crewAssignments?.length || 0} asignados</span>
                        <span>🚚 {(event.eventVehicles || []).length} vehículo(s)</span>
                        <span>🎵 {(event.musicianShows || []).length} show(s)</span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => setSelectedId(event.id)}>Abrir cuadro</Button>
                  </div>
                </Card>
              );
            })}
            {(data?.events || []).length === 0 && <p className="text-center text-gray-400 py-8">No hay eventos esta semana. Cambiá de semana o creá eventos en Eventos.</p>}
          </div>

          <h2 className="font-semibold text-lg mb-3">Cuadro semanal (staff × días)</h2>
          <Card className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-2 py-2 sticky left-0 bg-gray-50">Staff</th>
                  {days.map((d) => <th key={d} className="px-2 py-2 whitespace-nowrap">{fmtDay(d)}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data?.staff || []).map((s: any) => (
                  <tr key={s.id}>
                    <td className="px-2 py-2 font-medium sticky left-0 bg-white whitespace-nowrap">{s.name}</td>
                    {days.map((d) => {
                      const cells: any[] = [];
                      for (const e of data?.events || []) {
                        if (dateKey(e.date) !== d) continue;
                        for (const a of e.crewAssignments || []) if (a.staffId === s.id) cells.push({ event: e.name, role: a.role, status: a.status });
                      }
                      return (
                        <td key={d} className="px-2 py-1 align-top">
                          {cells.length === 0 ? <span className="text-gray-300">—</span> : cells.map((c, i) => (
                            <span key={i} className={`block mb-1 px-1.5 py-0.5 rounded ${c.status === "CONFIRMADO" ? "bg-green-100 text-green-700" : c.status === "RECHAZADO" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                              {c.event} · {ROLE_LABELS[c.role] || c.role}
                            </span>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === "staff" && (
        <div className="grid gap-3">
          {(data?.staff || []).map((s: any) => (
            <Card key={s.id} className="p-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-xs text-gray-500">{s.phone || "Sin teléfono"} · {s.roles?.map((r: string) => ROLE_LABELS[r] || r).join(", ") || "Sin roles"}</p>
                {s.userId && <p className="text-[11px] text-green-600">Vinculado a usuario del sistema</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setStaffForm({ id: s.id, name: s.name, phone: s.phone || "", roles: s.roles || [], userId: s.userId || "" }); setShowStaff(true); }}>Editar</Button>
            </Card>
          ))}
          {(data?.staff || []).length === 0 && <p className="text-center text-gray-400 py-8">No hay staff. Agregá el primero.</p>}
        </div>
      )}

      {selected && (
        <EventOperationsModal
          event={selected}
          staff={data?.staff || []}
          vehicles={data?.vehicles || []}
          saving={saving}
          onClose={() => setSelectedId(null)}
          post={post}
          remove={remove}
        />
      )}

      <Modal isOpen={showStaff} onClose={() => setShowStaff(false)} title={staffForm.id ? "Editar staff" : "Nuevo staff"}>
        <div className="space-y-3 p-1">
          <Input label="Nombre" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
          <Input label="Teléfono (WhatsApp)" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} placeholder="502..." />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario del sistema (opcional)</label>
            <select value={staffForm.userId} onChange={(e) => setStaffForm({ ...staffForm, userId: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Staff externo / sin usuario</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roles</label>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((r) => (
                <label key={r} className={`px-2 py-1 rounded border text-xs cursor-pointer ${staffForm.roles.includes(r) ? "bg-blue-50 border-blue-400 text-blue-700" : "bg-white text-gray-600"}`}>
                  <input type="checkbox" className="mr-1" checked={staffForm.roles.includes(r)} onChange={(e) => {
                    const roles = e.target.checked ? [...staffForm.roles, r] : staffForm.roles.filter((x: string) => x !== r);
                    setStaffForm({ ...staffForm, roles });
                  }} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowStaff(false)}>Cancelar</Button>
            <Button isLoading={saving} onClick={async () => {
              const url = staffForm.id ? "/api/operations/staff" : "/api/operations/staff";
              const ok = await post(url, staffForm, staffForm.id ? "PUT" : "POST");
              if (ok) setShowStaff(false);
            }}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function EventOperationsModal({ event, staff, vehicles, saving, onClose, post, remove }: any) {
  const [req, setReq] = useState({ role: "CARGA", quantity: "1", startTime: "", endTime: "" });
  const [asg, setAsg] = useState({ staffId: "", role: "CARGA", callTime: "", vehicleId: "" });
  const [veh, setVeh] = useState({ vehicleId: "", driverId: "", cargoM3: "", cargoKg: "", cargoNotes: "" });
  const [show, setShow] = useState({ service: "", venue: event.venue || "", clientName: event.clientName || "", startAt: "", endAt: "", musicianId: "" });

  const cov = (event.crewRequirements || []).map((r: any) => {
    const assigned = (event.crewAssignments || []).filter((a: any) => a.role === r.role);
    return { role: r.role, required: r.quantity, assigned: assigned.length, missing: Math.max(0, r.quantity - assigned.length) };
  });

  return (
    <Modal isOpen onClose={onClose} title={`Cuadro: ${event.name}`} size="lg">
      <div className="space-y-5 p-1 max-h-[75vh] overflow-y-auto">
        <div className="rounded-lg bg-gray-50 border px-3 py-2 text-sm">
          <p className="text-gray-600">{new Date(event.date).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long" })} · {event.venue || "Sin lugar"}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {cov.map((c: any) => (
              <span key={c.role} className={`text-[11px] px-1.5 py-0.5 rounded ${c.missing > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{ROLE_LABELS[c.role] || c.role}: {c.assigned}/{c.required}</span>
            ))}
          </div>
        </div>

        {/* Requerimientos */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Requerimientos</h3>
          <div className="space-y-1 mb-2">
            {(event.crewRequirements || []).map((r: any) => {
              const assigned = (event.crewAssignments || []).filter((a: any) => a.role === r.role).length;
              return (
                <div key={r.id} className="flex items-center justify-between text-xs bg-white border rounded px-2 py-1">
                  <span>{ROLE_LABELS[r.role] || r.role}: {assigned}/{r.quantity}{r.startTime ? ` · ${r.startTime}${r.endTime ? `-${r.endTime}` : ""}` : ""}</span>
                  <button onClick={() => remove(`/api/operations/requirements?id=${r.id}`)} className="text-red-500">✕</button>
                </div>
              );
            })}
            {(event.crewRequirements || []).length === 0 && <p className="text-xs text-gray-400">Sin requerimientos.</p>}
          </div>
          <div className="flex gap-2 items-end">
            <select value={req.role} onChange={(e) => setReq({ ...req, role: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <input type="number" min="1" value={req.quantity} onChange={(e) => setReq({ ...req, quantity: e.target.value })} className="w-16 rounded border px-2 py-1.5 text-xs" />
            <Button size="sm" isLoading={saving} onClick={async () => { if (await post("/api/operations/requirements", { eventId: event.id, ...req })) setReq({ ...req, quantity: "1" }); }}><Plus className="w-3 h-3 mr-1" /> Agregar</Button>
          </div>
        </section>

        {/* Asignaciones */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Asignaciones</h3>
          <div className="space-y-1 mb-2">
            {(event.crewAssignments || []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 text-xs bg-white border rounded px-2 py-1.5">
                <div className="flex-1">
                  <p className="font-medium">{a.staff?.name} <span className="text-gray-500">· {ROLE_LABELS[a.role] || a.role}</span></p>
                  <p className="text-gray-400">{a.staff?.phone || ""}{a.callTime ? ` · llamada ${a.callTime}` : ""}{a.vehicle ? ` · ${a.vehicle.plate}` : ""}</p>
                </div>
                <span className={`px-1.5 py-0.5 rounded ${STATUS_COLORS[a.status] || "bg-gray-100"}`}>{STATUS_LABELS[a.status] || a.status}</span>
                <div className="flex gap-1">
                  <button onClick={() => post("/api/operations/assignments", { id: a.id, status: "CONFIRMADO" }, "PUT")} title="Confirmar" className="text-green-600"><CheckCircle2 className="w-4 h-4" /></button>
                  <button onClick={() => post("/api/operations/assignments", { id: a.id, status: "RECHAZADO" }, "PUT")} title="Rechazar" className="text-red-500"><XCircle className="w-4 h-4" /></button>
                  <button onClick={() => remove(`/api/operations/assignments?id=${a.id}`)} className="text-gray-400">✕</button>
                </div>
              </div>
            ))}
            {(event.crewAssignments || []).length === 0 && <p className="text-xs text-gray-400">Sin asignaciones.</p>}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <select value={asg.staffId} onChange={(e) => setAsg({ ...asg, staffId: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              <option value="">Staff...</option>
              {staff.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={asg.role} onChange={(e) => setAsg({ ...asg, role: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <input placeholder="Hora llamada" value={asg.callTime} onChange={(e) => setAsg({ ...asg, callTime: e.target.value })} className="w-24 rounded border px-2 py-1.5 text-xs" />
            <select value={asg.vehicleId} onChange={(e) => setAsg({ ...asg, vehicleId: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              <option value="">Sin vehículo</option>
              {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.plate} — {v.name}</option>)}
            </select>
            <Button size="sm" isLoading={saving} onClick={async () => { if (await post("/api/operations/assignments", { eventId: event.id, ...asg })) setAsg({ ...asg, staffId: "", callTime: "" }); }}><Plus className="w-3 h-3 mr-1" /> Asignar</Button>
          </div>
        </section>

        {/* Vehículos */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Vehículos / logística</h3>
          <div className="space-y-1 mb-2">
            {(event.eventVehicles || []).map((ev: any) => {
              const riding = (event.crewAssignments || []).filter((a: any) => a.vehicleId === ev.vehicleId).length;
              const seats = ev.vehicle?.seats || 0;
              const over = seats > 0 && riding > seats;
              return (
                <div key={ev.id} className="flex items-center justify-between text-xs bg-white border rounded px-2 py-1.5">
                  <div>
                    <p className="font-medium">{ev.vehicle?.plate} — {ev.vehicle?.name} {ev.driver ? `· Piloto: ${ev.driver.name}` : ""}</p>
                    <p className={over ? "text-red-600" : "text-gray-500"}>
                      Pasajeros: {riding}{seats ? `/${seats}` : ""} {over ? "⚠ excedido" : ""}
                      {ev.cargoM3 ? ` · Carga ${ev.cargoM3} m³` : ""}{ev.cargoKg ? ` / ${ev.cargoKg} kg` : ""}
                    </p>
                  </div>
                  <button onClick={() => remove(`/api/operations/vehicles?id=${ev.id}`)} className="text-red-500">✕</button>
                </div>
              );
            })}
            {(event.eventVehicles || []).length === 0 && <p className="text-xs text-gray-400">Sin vehículos.</p>}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <select value={veh.vehicleId} onChange={(e) => setVeh({ ...veh, vehicleId: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              <option value="">Vehículo...</option>
              {vehicles.map((v: any) => <option key={v.id} value={v.id}>{v.plate} — {v.name} ({v.seats || "?"} asientos)</option>)}
            </select>
            <select value={veh.driverId} onChange={(e) => setVeh({ ...veh, driverId: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              <option value="">Piloto...</option>
              {staff.filter((s: any) => (s.roles || []).includes("PILOTO")).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input placeholder="m³" value={veh.cargoM3} onChange={(e) => setVeh({ ...veh, cargoM3: e.target.value })} className="w-16 rounded border px-2 py-1.5 text-xs" />
            <input placeholder="kg" value={veh.cargoKg} onChange={(e) => setVeh({ ...veh, cargoKg: e.target.value })} className="w-16 rounded border px-2 py-1.5 text-xs" />
            <Button size="sm" isLoading={saving} onClick={async () => { if (await post("/api/operations/vehicles", { eventId: event.id, ...veh })) setVeh({ ...veh, vehicleId: "", cargoM3: "", cargoKg: "" }); }}><Plus className="w-3 h-3 mr-1" /> Agregar</Button>
          </div>
        </section>

        {/* Músicos */}
        <section>
          <h3 className="font-semibold text-sm mb-2">Músicos / shows</h3>
          <div className="space-y-1 mb-2">
            {(event.musicianShows || []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between text-xs bg-white border rounded px-2 py-1.5">
                <div>
                  <p className="font-medium">{s.service} {s.musician ? `· ${s.musician.name}` : ""}</p>
                  <p className="text-gray-500">{s.venue || ""}{s.startAt ? ` · ${new Date(s.startAt).toLocaleString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
                </div>
                <button onClick={() => remove(`/api/operations/shows?id=${s.id}`)} className="text-red-500">✕</button>
              </div>
            ))}
            {(event.musicianShows || []).length === 0 && <p className="text-xs text-gray-400">Sin shows.</p>}
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <input placeholder="Servicio" value={show.service} onChange={(e) => setShow({ ...show, service: e.target.value })} className="w-32 rounded border px-2 py-1.5 text-xs" />
            <input placeholder="Lugar" value={show.venue} onChange={(e) => setShow({ ...show, venue: e.target.value })} className="w-36 rounded border px-2 py-1.5 text-xs" />
            <input type="datetime-local" value={show.startAt} onChange={(e) => setShow({ ...show, startAt: e.target.value })} className="rounded border px-2 py-1.5 text-xs" />
            <input type="datetime-local" value={show.endAt} onChange={(e) => setShow({ ...show, endAt: e.target.value })} className="rounded border px-2 py-1.5 text-xs" />
            <select value={show.musicianId} onChange={(e) => setShow({ ...show, musicianId: e.target.value })} className="rounded border px-2 py-1.5 text-xs">
              <option value="">Músico...</option>
              {staff.filter((s: any) => (s.roles || []).includes("MUSICO")).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button size="sm" isLoading={saving} onClick={async () => { if (await post("/api/operations/shows", { eventId: event.id, ...show })) setShow({ ...show, service: "", startAt: "", endAt: "" }); }}><Plus className="w-3 h-3 mr-1" /> Agregar</Button>
          </div>
        </section>
      </div>
    </Modal>
  );
}
