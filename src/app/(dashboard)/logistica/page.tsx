"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  HelpCircle,
  MapPin,
  Music,
  Pencil,
  Printer,
  Sparkles,
  Truck,
  User,
  Users,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const STATUS_LABELS: Record<string, string> = {
  PENDIENTE: "Pendiente",
  CONFIRMADO: "Confirmado",
  EN_RUTA: "En ruta",
  COMPLETADO: "Completado",
};
const STATUS_COLORS: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-700",
  CONFIRMADO: "bg-emerald-100 text-emerald-700",
  EN_RUTA: "bg-sky-100 text-sky-700",
  COMPLETADO: "bg-gray-200 text-gray-700",
};

const TRANSPORT_KEYS = {
  equipo: { vid: "vehicleId", vlab: "vehicleLabel", did: "driverId", dname: "driverName" },
  staff: { vid: "staffVehicleId", vlab: "staffVehicleLabel", did: "staffDriverId", dname: "staffDriverName" },
  musicos: { vid: "musicianVehicleId", vlab: "musicianVehicleLabel", did: "musicianDriverId", dname: "musicianDriverName" },
} as const;

type TransportKind = keyof typeof TRANSPORT_KEYS;

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
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-GT", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function dateKey(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" }) : "";
}
function fmtTime(v?: string | null) {
  if (!v) return "";
  const [h, m] = v.split(":").map(Number);
  const ampm = h < 12 ? "a. m." : "p. m.";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}
function orPending(v?: string | null) {
  return v ? fmtTime(v) : "Pendiente";
}
function isAfterMidnight(v?: string | null) {
  if (!v) return false;
  const h = Number(v.split(":")[0]);
  return h >= 0 && h < 4;
}
function resolvedVehicle(plan: any, vehicles: any[]) {
  const v = vehicles.find((x) => x.id === plan?.vehicleId);
  return v ? `${v.name} · ${v.plate}` : plan?.vehicleLabel || "";
}
function resolvedDriver(plan: any, staff: any[]) {
  const s = staff.find((x) => x.id === plan?.driverId);
  return s ? s.name : plan?.driverName || "";
}
function transportLabel(form: any, kind: TransportKind, vehicles: any[], staff: any[]) {
  const keys = TRANSPORT_KEYS[kind];
  const vehicle = vehicles.find((x) => x.id === form[keys.vid]);
  const driver = staff.find((x) => x.id === form[keys.did]);
  return {
    vehicle: vehicle ? `${vehicle.name} · ${vehicle.plate}` : form[keys.vlab] || "",
    driver: driver ? driver.name : form[keys.dname] || "",
  };
}

export default function LogisticaPage() {
  const { user, token } = useAuth();
  const [weekStart, setWeekStart] = useState(mondayOf(gtToday()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);

  const canView = user?.role === "ADMIN" || user?.role === "DUENO" || user?.role === "JEFE";

  const fetchWeek = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/logistics/week?from=${weekStart}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
      else toast.error(json.error || "Error al cargar logística");
    } catch {
      toast.error("Error al cargar logística");
    } finally {
      setLoading(false);
    }
  }, [token, weekStart]);

  useEffect(() => {
    fetchWeek();
  }, [fetchWeek]);

  const orders: any[] = data?.orders || [];
  const staff: any[] = data?.staff || [];
  const vehicles: any[] = data?.vehicles || [];
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of days) map[d] = [];
    for (const o of orders) {
      const k = dateKey(o.eventDate);
      if (map[k]) map[k].push(o);
    }
    return map;
  }, [orders, days]);

  const alerts = useMemo(() => {
    const items: { orderId: string; order: any; text: string; conflict?: boolean }[] = [];
    const push = (o: any, text: string, conflict = false) => items.push({ orderId: o.id, order: o, text, conflict });

    for (const o of orders) {
      const p = o.logisticsPlan;
      if (!p) {
        push(o, "Sin horarios ni transporte definidos");
        continue;
      }
      if (!p.departureAt) push(o, "Falta hora de salida de bodega");
      if (!p.eventStartAt) push(o, "Falta hora de inicio del evento");
      if (!p.eventEndAt) push(o, "Falta hora de fin del evento");
      if (!p.dismantleAt) push(o, "Falta hora de desmontaje");
      if (!p.vehicleLabel && !p.vehicleId) push(o, "Falta vehículo de equipo");
      if (!p.driverName && !p.driverId) push(o, "Falta piloto de equipo");
      if (p.staffPickup && !p.staffPickupAt) push(o, "Recogida de staff sin hora");
      if (p.questions) push(o, p.questions);
    }

    const check = (keyOf: (p: any) => string, label: string) => {
      const groups: Record<string, any[]> = {};
      for (const o of orders) {
        const p = o.logisticsPlan;
        if (!p) continue;
        const k = keyOf(p);
        if (!k) continue;
        const day = dateKey(o.eventDate);
        groups[`${day}|${k}`] = groups[`${day}|${k}`] || [];
        groups[`${day}|${k}`].push(o);
      }
      for (const list of Object.values(groups)) {
        if (list.length > 1) {
          const names = list.map((o) => `#${o.orderNumber}`).join(", ");
          for (const o of list) push(o, `${label} compartido con ${names} el mismo día`, true);
        }
      }
    };
    check((p) => p.vehicleId || p.vehicleLabel || "", "Vehículo");
    check((p) => p.driverId || p.driverName || "", "Piloto");

    return items;
  }, [orders]);

  const summary = useMemo(() => {
    const assigned = orders.filter((o) => {
      const p = o.logisticsPlan;
      return p && (p.vehicleId || p.vehicleLabel) && (p.driverId || p.driverName);
    }).length;
    return {
      events: orders.length,
      assigned,
      missing: orders.length - assigned,
      pending: alerts.filter((a) => !a.conflict).length,
      conflicts: alerts.filter((a) => a.conflict).length,
    };
  }, [orders, alerts]);

  if (!canView) return <div className="p-8 text-center text-gray-500">Acceso no autorizado</div>;

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1 print:hidden">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Truck className="w-6 h-6" /> Logística semanal
        </h1>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="w-4 h-4 mr-1" /> Imprimir parte
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-4">Horarios, vehículos, pilotos, staff y pendientes de la semana · lunes a domingo</p>

      <div className="flex items-center gap-2 mb-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold">{fmtDay(weekStart)} — {fmtDay(addDays(weekStart, 6))}</span>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(mondayOf(gtToday()))}>Hoy</Button>
      </div>

      <div className="hidden print:block mb-4">
        <p className="text-lg font-bold">Parte de logística · {fmtDay(weekStart)} al {fmtDay(addDays(weekStart, 6))}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Card className="p-3"><p className="text-xs text-gray-500">Eventos</p><p className="text-2xl font-bold">{summary.events}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Con vehículo y piloto</p><p className="text-2xl font-bold text-emerald-600">{summary.assigned}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Sin asignar</p><p className={`text-2xl font-bold ${summary.missing > 0 ? "text-amber-600" : "text-emerald-600"}`}>{summary.missing}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Datos faltantes</p><p className={`text-2xl font-bold ${summary.pending > 0 ? "text-amber-600" : "text-emerald-600"}`}>{summary.pending}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Choques</p><p className={`text-2xl font-bold ${summary.conflicts > 0 ? "text-red-600" : "text-emerald-600"}`}>{summary.conflicts}</p></Card>
      </div>

      {loading && !data ? (
        <div className="p-8 text-center text-gray-500">Cargando...</div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {days.map((d) => {
              const list = byDay[d] || [];
              return (
                <div key={d}>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="w-4 h-4 text-gray-400" />
                    <h2 className="text-sm font-semibold capitalize">{fmtDay(d)}</h2>
                    <span className="text-xs text-gray-400">{list.length} evento(s)</span>
                  </div>
                  {list.length === 0 ? (
                    <Card className="p-3 text-xs text-gray-400">Sin eventos</Card>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      {list.map((o) => (
                        <EventCard key={o.id} order={o} vehicles={vehicles} staff={staff} onEdit={() => setEditing(o)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {orders.length === 0 && (
              <Card className="p-8 text-center text-gray-400">
                No hay cuadros con fecha en esta semana. Cargá o fechá cuadros en <b>Cuadros</b> para planificar la logística.
              </Card>
            )}
          </div>

          <div className="space-y-3 print:hidden">
            <Card className="p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-1">
                <HelpCircle className="w-4 h-4 text-amber-500" /> Preguntas y pendientes
              </h3>
              <p className="text-xs text-gray-500 mb-3">Se calculan solos con los datos del cuadro. Tocá uno para completarlo.</p>
              {alerts.length === 0 ? (
                <p className="text-sm text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Todo completo
                </p>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {alerts.map((a, i) => (
                    <button
                      key={`${a.orderId}-${i}`}
                      onClick={() => setEditing(a.order)}
                      className={`w-full text-left rounded-lg border px-2.5 py-2 text-xs hover:bg-gray-50 ${
                        a.conflict ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"
                      }`}
                    >
                      <span className="font-medium text-gray-700">#{a.order.orderNumber} {a.order.eventName}</span>
                      <span className={`block mt-0.5 ${a.conflict ? "text-red-700" : "text-amber-800"}`}>{a.text}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 text-xs text-gray-500">
              <p className="font-semibold text-gray-700 mb-2">Cómo se usa</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Abrí la semana en la flecha o con “Hoy”.</li>
                <li>Tocá un evento y llená horarios, vehículo y piloto.</li>
                <li>Usá “Copiar horarios” para repetir un machote.</li>
                <li>Generá el mensaje del piloto y copialo al WhatsApp.</li>
              </ol>
            </Card>
          </div>
        </div>
      )}

      {editing && (
        <LogisticsModal
          order={editing}
          orders={orders}
          staff={staff}
          vehicles={vehicles}
          token={token}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await fetchWeek();
          }}
        />
      )}
    </div>
  );
}

function EventCard({ order, vehicles, staff, onEdit }: any) {
  const p = order.logisticsPlan;
  const equipo = transportLabel(p || {}, "equipo", vehicles, staff);
  const staffT = transportLabel(p || {}, "staff", vehicles, staff);
  const musicos = transportLabel(p || {}, "musicos", vehicles, staff);
  const eventRange = p?.eventStartAt || p?.eventEndAt
    ? `${fmtTime(p?.eventStartAt) || "—"} – ${fmtTime(p?.eventEndAt) || "—"}`
    : "";
  const showRange = p?.showAt ? `${fmtTime(p.showAt)}${p.showEndAt ? ` – ${fmtTime(p.showEndAt)}` : ""}` : "";

  return (
    <Card className="p-3 break-inside-avoid">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-400">#{order.orderNumber} · {order._count?.items || 0} ítems</p>
          <p className="font-semibold text-sm truncate">{order.eventName}</p>
          <p className="text-xs text-gray-500 flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" /> {order.eventLocation || "Sin lugar"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[p?.status || "PENDIENTE"]}`}>
            {STATUS_LABELS[p?.status || "PENDIENTE"]}
          </span>
          <Button variant="ghost" size="sm" onClick={onEdit} className="print:hidden">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {p ? (
        <>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-600">
            {p.departureAt && <span><b className="text-gray-400">Salida:</b> {fmtTime(p.departureAt)}</span>}
            {p.arrivalAt && <span><b className="text-gray-400">Llegada:</b> {fmtTime(p.arrivalAt)}</span>}
            {p.montageAt && <span><b className="text-gray-400">Montaje:</b> {fmtTime(p.montageAt)}</span>}
            {p.soundcheckAt && <span><b className="text-gray-400">Prueba:</b> {fmtTime(p.soundcheckAt)}</span>}
            {eventRange && (
              <span className="col-span-2">
                <b className="text-gray-400">Evento:</b> {eventRange}
                {isAfterMidnight(p.eventStartAt) && <span className="ml-1 text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded">madrugada</span>}
              </span>
            )}
            {showRange && <span className="col-span-2"><b className="text-gray-400">Show:</b> {showRange}</span>}
            {p.dismantleAt && <span className="col-span-2"><b className="text-gray-400">Desmontaje:</b> {fmtTime(p.dismantleAt)}{p.dismantleEndAt ? ` – ${fmtTime(p.dismantleEndAt)}` : ""}</span>}
          </div>
          <div className="mt-2 space-y-1 text-[11px]">
            <TransportChip icon={<Truck className="w-3 h-3" />} name={equipo.vehicle} driver={equipo.driver} label="Equipo" />
            {(staffT.vehicle || staffT.driver || p.staffPickup) && (
              <TransportChip icon={<Users className="w-3 h-3" />} name={staffT.vehicle} driver={staffT.driver} label="Staff" />
            )}
            {(musicos.vehicle || musicos.driver || p.musicianMeetPoint) && (
              <TransportChip icon={<Music className="w-3 h-3" />} name={musicos.vehicle} driver={musicos.driver} label="Músicos" />
            )}
          </div>
          {p.notes && <p className="mt-2 text-[11px] text-gray-500 line-clamp-2">{p.notes}</p>}
        </>
      ) : (
        <button
          onClick={onEdit}
          className="mt-3 w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:bg-gray-50 print:hidden"
        >
          + Definir horarios, vehículo y piloto
        </button>
      )}
    </Card>
  );
}

function TransportChip({ icon, name, driver, label }: any) {
  const ready = Boolean(name && driver);
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${ready ? "bg-gray-100 text-gray-700" : "bg-amber-50 text-amber-700"}`}>
      {icon}
      <span className="font-medium">{label}:</span>
      <span className="truncate">{name || "Sin vehículo"} · {driver || "Sin piloto"}</span>
    </div>
  );
}

const TIME_FIELDS: [string, string][] = [
  ["reunionAt", "Reunión bodega"],
  ["departureAt", "Salida bodega"],
  ["arrivalAt", "Llegada"],
  ["montageAt", "Montaje"],
  ["soundcheckAt", "Prueba de sonido"],
  ["eventStartAt", "Evento inicio"],
  ["eventEndAt", "Evento fin"],
  ["showAt", "Show inicio"],
  ["showEndAt", "Show fin"],
  ["dismantleAt", "Desmontaje inicio"],
  ["dismantleEndAt", "Desmontaje fin"],
];

function LogisticsModal({ order, orders, staff, vehicles, token, onClose, onSaved }: any) {
  const p = order.logisticsPlan || {};
  const [form, setForm] = useState<any>({ ...p });
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
  const [recipient, setRecipient] = useState<"equipo" | "staff" | "musicos" | "general">("equipo");
  const [message, setMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setMessage(buildMessage(recipient, order, form, vehicles, staff));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(k: string, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  function pick(kind: TransportKind, type: "vehicle" | "driver", id: string) {
    const keys = TRANSPORT_KEYS[kind];
    if (type === "vehicle") {
      setForm((f: any) => {
        const next = { ...f, [keys.vid]: id };
        if (id) {
          const v = vehicles.find((x: any) => x.id === id);
          next[keys.vlab] = v ? `${v.name} · ${v.plate}` : "";
        }
        return next;
      });
    } else {
      setForm((f: any) => {
        const next = { ...f, [keys.did]: id };
        if (id) {
          const s = staff.find((x: any) => x.id === id);
          next[keys.dname] = s ? s.name : "";
        }
        return next;
      });
    }
  }

  function copyTimes() {
    const src = orders.find((o: any) => o.id === copyFrom)?.logisticsPlan;
    if (!src) return;
    setForm((f: any) => {
      const next: any = { ...f };
      for (const [k] of TIME_FIELDS) next[k] = src[k] || "";
      return next;
    });
    toast.success("Horarios copiados");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/logistics/plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderId: order.id, ...form }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Logística guardada");
        await onSaved();
      } else toast.error(json.error || "Error al guardar");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function generateWithAI() {
    setAiLoading(true);
    try {
      const res = await fetch("/api/logistics/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ order, plan: form, recipient, draft: message }),
      });
      const json = await res.json();
      if (json.success && json.data?.text) {
        setMessage(json.data.text);
        toast.success("Mensaje mejorado con IA");
      } else toast.error(json.error || "No se pudo generar");
    } catch {
      toast.error("No se pudo generar con IA");
    } finally {
      setAiLoading(false);
    }
  }

  function regenerate() {
    setMessage(buildMessage(recipient, order, form, vehicles, staff));
  }

  function changeRecipient(r: "equipo" | "staff" | "musicos" | "general") {
    setRecipient(r);
    setMessage(buildMessage(r, order, form, vehicles, staff));
  }

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Logística: #${order.orderNumber} ${order.eventName}`} size="3xl">
      <div className="space-y-4 p-1 max-h-[78vh] overflow-y-auto">
        <div className="rounded-lg bg-gray-50 border px-3 py-2 text-xs text-gray-600">
          <p className="font-medium text-gray-800">{order.eventLocation || "Sin lugar"}</p>
          <p className="capitalize">{fmtDay(dateKey(order.eventDate))}</p>
          {order.contractNotes && <p className="mt-1 text-gray-500">Servicios: {order.contractNotes}</p>}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold flex items-center gap-1"><Clock className="w-4 h-4" /> Horarios</p>
            <div className="flex items-center gap-1">
              <select
                value={copyFrom}
                onChange={(e) => setCopyFrom(e.target.value)}
                className="rounded-lg border px-2 py-1 text-xs bg-white"
              >
                <option value="">Copiar horarios de…</option>
                {orders.filter((o: any) => o.id !== order.id && o.logisticsPlan).map((o: any) => (
                  <option key={o.id} value={o.id}>#{o.orderNumber} {o.eventName}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={copyTimes} disabled={!copyFrom}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {TIME_FIELDS.map(([key, label]) => (
              <Input
                key={key}
                label={label}
                type="time"
                value={form[key] || ""}
                onChange={(e) => set(key, e.target.value)}
              />
            ))}
          </div>
        </div>

        <TransportBlock
          title="Transporte de equipo"
          icon={<Truck className="w-4 h-4" />}
          kind="equipo"
          form={form}
          set={set}
          pick={pick}
          manual={manual}
          setManual={setManual}
          staff={staff}
          vehicles={vehicles}
        />

        <TransportBlock
          title="Transporte de staff"
          icon={<Users className="w-4 h-4" />}
          kind="staff"
          form={form}
          set={set}
          pick={pick}
          manual={manual}
          setManual={setManual}
          staff={staff}
          vehicles={vehicles}
        >
          <div className="grid md:grid-cols-3 gap-2 mt-2">
            <div className="md:col-span-2">
              <Input
                label="Recogida / traslado de staff"
                value={form.staffPickup || ""}
                onChange={(e) => set("staffPickup", e.target.value)}
                placeholder="Panel recoge staff en INFASA"
              />
            </div>
            <Input
              label="Hora de recogida"
              type="time"
              value={form.staffPickupAt || ""}
              onChange={(e) => set("staffPickupAt", e.target.value)}
            />
          </div>
        </TransportBlock>

        <TransportBlock
          title="Transporte de músicos"
          icon={<Music className="w-4 h-4" />}
          kind="musicos"
          form={form}
          set={set}
          pick={pick}
          manual={manual}
          setManual={setManual}
          staff={staff}
          vehicles={vehicles}
        >
          <div className="grid md:grid-cols-3 gap-2 mt-2">
            <div className="md:col-span-2">
              <Input
                label="Punto de reunión"
                value={form.musicianMeetPoint || ""}
                onChange={(e) => set("musicianMeetPoint", e.target.value)}
                placeholder="Neo, bodega, hotel…"
              />
            </div>
            <Input
              label="Hora de salida"
              type="time"
              value={form.musicianDepartureAt || ""}
              onChange={(e) => set("musicianDepartureAt", e.target.value)}
            />
          </div>
        </TransportBlock>

        <div>
          <p className="text-sm font-semibold mb-2">Proveedores, notas y pendientes</p>
          <div className="space-y-2">
            <Input
              label="Proveedores (pista, pirotecnia, tarima…)"
              value={form.providers || ""}
              onChange={(e) => set("providers", e.target.value)}
              placeholder="Pista: Nazario · Pirotecnia: ELITE"
            />
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas de logística</label>
                <textarea
                  value={form.notes || ""}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="Llevar TSJ de 50 m, hielera, etc."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Preguntas por definir</label>
                <textarea
                  value={form.questions || ""}
                  onChange={(e) => set("questions", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder="¿Quién recoge al staff? ¿Se confirma el violín eléctrico?"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={form.status || "PENDIENTE"}
                onChange={(e) => set("status", e.target.value)}
                className="w-full md:w-60 rounded-lg border px-3 py-2 text-sm bg-white"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <p className="text-sm font-semibold flex items-center gap-1 text-emerald-800">
              <Sparkles className="w-4 h-4" /> Mensaje para copiar y pegar
            </p>
            <div className="flex flex-wrap gap-1">
              {([["equipo", "Piloto equipo"], ["staff", "Piloto staff"], ["musicos", "Músicos"], ["general", "General"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => changeRecipient(k)}
                  className={`px-2 py-1 rounded text-[11px] font-medium ${recipient === k ? "bg-emerald-600 text-white" : "bg-white border text-gray-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="w-full rounded-lg border px-3 py-2 text-xs font-mono bg-white"
          />
          <div className="flex flex-wrap justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={regenerate}>Actualizar texto</Button>
            <Button variant="outline" size="sm" isLoading={aiLoading} onClick={generateWithAI}>
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Mejorar con IA
            </Button>
            <Button size="sm" onClick={copyMessage}>
              <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={saving} onClick={save}>Guardar logística</Button>
        </div>
      </div>
    </Modal>
  );
}

function TransportBlock({ title, icon, kind, form, set, pick, manual, setManual, staff, vehicles, children }: any) {
  const keys = TRANSPORT_KEYS[kind as TransportKind];
  const vid = form[keys.vid] || "";
  const did = form[keys.did] || "";
  const vlab = form[keys.vlab] || "";
  const dname = form[keys.dname] || "";
  const manualVehicle = manual[keys.vlab];

  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-semibold flex items-center gap-1 mb-2">{icon} {title}</p>
      <div className="grid md:grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Vehículo del sistema</label>
          <select
            value={vid}
            onChange={(e) => {
              pick(kind, "vehicle", e.target.value);
              setManual((m: any) => ({ ...m, [keys.vlab]: false }));
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin vehículo</option>
            {vehicles.map((v: any) => (
              <option key={v.id} value={v.id}>{v.name} · {v.plate}{v.seats ? ` · ${v.seats} plazas` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            O escribí el vehículo {manualVehicle ? "" : "(rentado / externo)"}
          </label>
          <input
            value={vlab}
            onChange={(e) => {
              set(keys.vlab, e.target.value);
              if (e.target.value) set(keys.vid, "");
              setManual((m: any) => ({ ...m, [keys.vlab]: true }));
            }}
            placeholder="Panel rentada, camión 2…"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Piloto del staff</label>
          <select
            value={did}
            onChange={(e) => pick(kind, "driver", e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin piloto</option>
            {staff.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}{s.phone ? ` · ${s.phone}` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">O escribí el piloto (externo)</label>
          <input
            value={dname}
            onChange={(e) => {
              set(keys.dname, e.target.value);
              if (e.target.value) set(keys.did, "");
            }}
            placeholder="Piloto externo, Manuel…"
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
      </div>
      {children}
    </div>
  );
}

function buildMessage(kind: string, order: any, form: any, vehicles: any[], staff: any[]) {
  const fecha = fmtDay(dateKey(order.eventDate));
  const lugar = order.eventLocation || "Pendiente";
  const equipo = transportLabel(form, "equipo", vehicles, staff);
  const staffT = transportLabel(form, "staff", vehicles, staff);
  const musicos = transportLabel(form, "musicos", vehicles, staff);
  const evento = `${orPending(form.eventStartAt)} a ${orPending(form.eventEndAt)}`;
  const show = form.showAt ? `${fmtTime(form.showAt)}${form.showEndAt ? ` a ${fmtTime(form.showEndAt)}` : ""}` : "Pendiente";
  const head = `*${order.eventName}*\n📅 ${fecha}\n📍 ${lugar}`;

  if (kind === "equipo") {
    return `🚚 *LOGÍSTICA · TRANSPORTE DE EQUIPO*\n${head}\n\nHola${equipo.driver ? ` ${equipo.driver}` : ""}, te comparto el detalle:\n\n⏰ Reunión en bodega: ${orPending(form.reunionAt)}\n🚛 Salida de bodega: ${orPending(form.departureAt)}\n📍 Llegada: ${orPending(form.arrivalAt)}\n🔧 Montaje: ${orPending(form.montageAt)}\n🎚️ Prueba de sonido: ${orPending(form.soundcheckAt)}\n🎉 Evento: ${evento}\n🎤 Show: ${show}\n🧹 Desmontaje: ${orPending(form.dismantleAt)}${form.dismantleEndAt ? ` a ${fmtTime(form.dismantleEndAt)}` : ""}\n\n🚛 Vehículo: ${equipo.vehicle || "Pendiente"}\n👤 Piloto: ${equipo.driver || "Pendiente"}\n${form.providers ? `\n🤝 Proveedores: ${form.providers}` : ""}\n${form.notes ? `\n📝 Notas: ${form.notes}` : ""}\n\nPor favor confirmá recibido.`;
  }

  if (kind === "staff") {
    return `👥 *LOGÍSTICA · TRANSPORTE DE STAFF*\n${head}\n\nHola${staffT.driver ? ` ${staffT.driver}` : ""}, te comparto el traslado:\n\n⏰ Reunión en bodega: ${orPending(form.reunionAt)}\n🚛 Salida de bodega: ${orPending(form.departureAt)}\n📍 Llegada: ${orPending(form.arrivalAt)}\n🔧 Montaje: ${orPending(form.montageAt)}\n🎉 Evento: ${evento}\n🧹 Desmontaje: ${orPending(form.dismantleAt)}${form.dismantleEndAt ? ` a ${fmtTime(form.dismantleEndAt)}` : ""}\n\n🚐 Vehículo: ${staffT.vehicle || "Pendiente"}\n👤 Piloto: ${staffT.driver || "Pendiente"}\n${form.staffPickup ? `\n📍 Recogida: ${form.staffPickup}` : ""}\n${form.staffPickupAt ? `⏰ Hora de recogida: ${fmtTime(form.staffPickupAt)}` : ""}\n${form.notes ? `\n📝 Notas: ${form.notes}` : ""}\n\nPor favor confirmá recibido.`;
  }

  if (kind === "musicos") {
    return `🎵 *LOGÍSTICA · TRANSPORTE DE MÚSICOS*\n${head}\n\nHola${musicos.driver ? ` ${musicos.driver}` : ""}, te comparto el traslado:\n\n📍 Punto de reunión: ${form.musicianMeetPoint || "Pendiente"}\n⏰ Hora de salida: ${orPending(form.musicianDepartureAt)}\n🎤 Show: ${show}\n🎉 Evento: ${evento}\n\n🚐 Vehículo: ${musicos.vehicle || "Pendiente"}\n👤 Piloto: ${musicos.driver || "Pendiente"}\n${form.notes ? `\n📝 Notas: ${form.notes}` : ""}\n\nPor favor confirmá recibido.`;
  }

  return `📋 *LOGÍSTICA · ${order.eventName}*\n📅 ${fecha}\n📍 ${lugar}\n\n⏰ Reunión en bodega: ${orPending(form.reunionAt)}\n🚛 Salida de bodega: ${orPending(form.departureAt)}\n📍 Llegada: ${orPending(form.arrivalAt)}\n🔧 Montaje: ${orPending(form.montageAt)}\n🎚️ Prueba de sonido: ${orPending(form.soundcheckAt)}\n🎉 Evento: ${evento}\n🎤 Show: ${show}\n🧹 Desmontaje: ${orPending(form.dismantleAt)}${form.dismantleEndAt ? ` a ${fmtTime(form.dismantleEndAt)}` : ""}\n\n🚚 Equipo: ${equipo.vehicle || "Pendiente"} · ${equipo.driver || "Pendiente"}\n👥 Staff: ${staffT.vehicle || "Pendiente"} · ${staffT.driver || "Pendiente"}\n🎵 Músicos: ${musicos.vehicle || "Pendiente"} · ${musicos.driver || "Pendiente"}\n${form.providers ? `\n🤝 Proveedores: ${form.providers}` : ""}\n${form.questions ? `\n❓ Por definir: ${form.questions}` : ""}\n${form.notes ? `\n📝 Notas: ${form.notes}` : ""}`;
}
