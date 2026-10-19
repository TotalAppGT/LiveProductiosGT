"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, CheckCircle2, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const TYPE_LABELS: Record<string, string> = {
  PERDIDA: "Pérdida / faltante",
  TALLER: "Envío a taller",
  REINTEGRO: "Reintegro a bodega",
  DESCUENTO: "Descarte / baja",
  TRASLADO: "Traslado entre bodegas",
};

const TYPE_COLORS: Record<string, string> = {
  PERDIDA: "bg-red-100 text-red-700",
  TALLER: "bg-orange-100 text-orange-700",
  REINTEGRO: "bg-green-100 text-green-700",
  DESCUENTO: "bg-gray-100 text-gray-700",
  TRASLADO: "bg-blue-100 text-blue-700",
};

const WAREHOUSES = ["Bodega Cristo Rey", "Casa Nómada"];

function fmt(v?: string | null) {
  return v ? new Date(v).toLocaleString("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function AprobacionesPage() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [pending, setPending] = useState(0);
  const [tab, setTab] = useState("PENDIENTE");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dest, setDest] = useState<Record<string, string>>({});
  const [resp, setResp] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);

  const canApprove = user?.role === "ADMIN" || user?.role === "DUENO";
  const canView = canApprove || user?.role === "JEFE";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [res, uRes] = await Promise.all([
        fetch("/api/approvals", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [json, uJson] = await Promise.all([res.json(), uRes.json()]);
      if (json.success) {
        setItems(json.data || []);
        setPending(json.pending || 0);
      }
      if (Array.isArray(uJson)) setUsers(uJson);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function resolve(item: any, action: "approve" | "reject") {
    if (!confirm(action === "approve" ? "¿Aprobar esta solicitud?" : "¿Rechazar esta solicitud?")) return;
    const notes = prompt(action === "approve" ? "Notas de aprobación (opcional):" : "Motivo del rechazo (opcional):") || "";
    setBusy(item.id);
    try {
      const res = await fetch(`/api/approvals/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          notes,
          toWarehouse: dest[item.id] || item.toWarehouse || undefined,
          responsibleId: resp[item.id] || item.responsibleId || undefined,
          unitValue: unit[item.id] !== undefined ? Number(unit[item.id]) : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(action === "approve" ? "Aprobado" : "Rechazado");
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al procesar");
    } finally {
      setBusy(null);
    }
  }

  if (!canView) return <div className="p-8 text-center text-gray-500">Acceso no autorizado</div>;
  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  const filtered = items.filter((i) => (tab === "ALL" ? true : i.status === tab));

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="w-6 h-6" /> Aprobaciones
        </h1>
        <span className="text-sm bg-amber-100 text-amber-700 px-3 py-1 rounded-full">{pending} pendiente(s)</span>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Pérdidas, envíos a taller, reintegros y descartes requieren visto bueno de un admin.
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[["PENDIENTE", "Pendientes"], ["APROBADA", "Aprobadas"], ["RECHAZADA", "Rechazadas"], ["ALL", "Todas"]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {filtered.map((item: any) => (
          <Card key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[item.type] || "bg-gray-100"}`}>
                    {TYPE_LABELS[item.type] || item.type}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${item.status === "PENDIENTE" ? "bg-amber-100 text-amber-700" : item.status === "APROBADA" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {item.status}
                  </span>
                </div>
                <h3 className="font-semibold mt-2 text-lg">
                  {item.itemName} <span className="text-sm text-gray-500">({item.quantity} u)</span>
                </h3>
                <p className="text-sm text-gray-600">{item.reason || "—"}</p>
                {item.notes && <p className="text-xs text-gray-500 mt-1">📝 {item.notes}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  Solicita: {item.requestedBy?.name || "—"} · {fmt(item.createdAt)}
                  {item.fromWarehouse ? ` · Origen: ${item.fromWarehouse}` : ""}
                  {item.toWarehouse ? ` · Destino: ${item.toWarehouse}` : ""}
                  {item.order ? ` · Cuadro #${item.order.orderNumber} ${item.order.eventName}` : ""}
                </p>
                {item.photos?.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {item.photos.map((p: string, i: number) => (
                      <a key={i} href={p} target="_blank" rel="noreferrer">
                        <img src={p} alt="foto" className="w-16 h-16 object-cover rounded border" />
                      </a>
                    ))}
                  </div>
                )}
                {item.status !== "PENDIENTE" && item.approvedBy && (
                  <p className="text-xs text-gray-400 mt-1">Resuelto por {item.approvedBy.name} · {fmt(item.resolvedAt)}</p>
                )}
              </div>

              {item.status === "PENDIENTE" && canApprove && (
                <div className="flex flex-col gap-2 min-w-[190px]">
                  {item.type === "REINTEGRO" && (
                    <select
                      value={dest[item.id] || item.toWarehouse || "Bodega Cristo Rey"}
                      onChange={(e) => setDest((p) => ({ ...p, [item.id]: e.target.value }))}
                      className="rounded-lg border px-2 py-2 text-sm"
                    >
                      {WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  )}
                  {item.type === "PERDIDA" && (
                    <div className="space-y-1">
                      <label className="text-[11px] text-gray-500">Responsable del cargo</label>
                      <select
                        value={resp[item.id] || item.responsibleId || ""}
                        onChange={(e) => setResp((p) => ({ ...p, [item.id]: e.target.value }))}
                        className="w-full rounded-lg border px-2 py-1.5 text-xs"
                      >
                        <option value="">Seleccionar...</option>
                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                      <label className="text-[11px] text-gray-500">Valor unitario (Q)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={unit[item.id] ?? (item.unitValue ?? "")}
                        onChange={(e) => setUnit((p) => ({ ...p, [item.id]: e.target.value }))}
                        className="w-full rounded-lg border px-2 py-1.5 text-xs"
                      />
                      <p className="text-[11px] text-gray-500">
                        Total: Q{((Number(unit[item.id] ?? item.unitValue ?? 0)) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  )}
                  <Button variant="success" onClick={() => resolve(item, "approve")} isLoading={busy === item.id}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                  </Button>
                  <Button variant="danger" onClick={() => resolve(item, "reject")} isLoading={busy === item.id}>
                    <XCircle className="w-4 h-4 mr-1" /> Rechazar
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-8">No hay solicitudes en esta bandeja.</p>}
      </div>
    </div>
  );
}
