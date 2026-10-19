"use client";

import { useState, useEffect, useCallback } from "react";
import { Receipt, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const STATUS_LABELS: Record<string, string> = {
  POR_COBRAR: "Por cobrar",
  COBRADO: "Cobrado",
  EXONERADO: "Exonerado",
};

const STATUS_COLORS: Record<string, string> = {
  POR_COBRAR: "bg-amber-100 text-amber-700",
  COBRADO: "bg-green-100 text-green-700",
  EXONERADO: "bg-gray-100 text-gray-600",
};

function money(n: number | string) {
  return `Q${(Number(n) || 0).toFixed(2)}`;
}

function fmt(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default function CargosPage() {
  const { user, token } = useAuth();
  const [charges, setCharges] = useState<any[]>([]);
  const [totals, setTotals] = useState<any[]>([]);
  const [tab, setTab] = useState("POR_COBRAR");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const canView = user?.role === "ADMIN" || user?.role === "DUENO" || user?.role === "JEFE";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/charges", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) {
        setCharges(json.data || []);
        setTotals(json.totals || []);
      }
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function update(charge: any, status: string) {
    const notes = status === "EXONERADO" ? prompt("Motivo de exoneración (opcional):") || "" : "";
    setBusy(charge.id);
    try {
      const res = await fetch(`/api/charges/${charge.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, notes }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(STATUS_LABELS[status] || status);
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al actualizar");
    } finally {
      setBusy(null);
    }
  }

  if (!canView) return <div className="p-8 text-center text-gray-500">Acceso no autorizado</div>;
  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  const filtered = charges.filter((c) => (tab === "ALL" ? true : c.status === tab));
  const sum = (status: string) => Number(totals.find((t) => t.status === status)?._sum?.amount || 0);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Receipt className="w-6 h-6" /> Cargos internos
        </h1>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Cobros por pérdidas de inventario en eventos, asignados al responsable.
      </p>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card className="p-3">
          <p className="text-xs text-gray-500">Por cobrar</p>
          <p className="text-xl font-bold text-amber-600">{money(sum("POR_COBRAR"))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">Cobrado</p>
          <p className="text-xl font-bold text-green-600">{money(sum("COBRADO"))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">Exonerado</p>
          <p className="text-xl font-bold text-gray-500">{money(sum("EXONERADO"))}</p>
        </Card>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[["POR_COBRAR", "Por cobrar"], ["COBRADO", "Cobrados"], ["EXONERADO", "Exonerados"], ["ALL", "Todos"]].map(([k, l]) => (
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
        {filtered.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                  {c.order && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                      Cuadro #{c.order.orderNumber} · {c.order.eventName}
                    </span>
                  )}
                </div>
                <h3 className="font-semibold mt-2">{c.itemName}</h3>
                <p className="text-sm text-gray-600">
                  {c.quantity} u × {money(c.unitValue)} = <strong>{money(c.amount)}</strong>
                </p>
                <p className="text-xs text-gray-500 mt-1">👤 Responsable: {c.responsible?.name || "—"}</p>
                {c.reason && <p className="text-xs text-gray-500">Motivo: {c.reason}</p>}
                {c.notes && <p className="text-xs text-gray-500">📝 {c.notes}</p>}
                <p className="text-xs text-gray-400 mt-1">Creado: {fmt(c.createdAt)}{c.paidAt ? ` · Cobrado: ${fmt(c.paidAt)}` : ""}</p>
                {c.photos?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {c.photos.map((p: string, i: number) => (
                      <a key={i} href={p} target="_blank" rel="noreferrer">
                        <img src={p} alt="foto" className="w-14 h-14 object-cover rounded border" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 min-w-[150px]">
                {c.status !== "COBRADO" && (
                  <Button variant="success" size="sm" onClick={() => update(c, "COBRADO")} isLoading={busy === c.id}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> Cobrado
                  </Button>
                )}
                {c.status !== "EXONERADO" && (
                  <Button variant="outline" size="sm" onClick={() => update(c, "EXONERADO")} isLoading={busy === c.id}>
                    <XCircle className="w-4 h-4 mr-1" /> Exonerar
                  </Button>
                )}
                {c.status !== "POR_COBRAR" && (
                  <Button variant="ghost" size="sm" onClick={() => update(c, "POR_COBRAR")} isLoading={busy === c.id}>
                    <RotateCcw className="w-4 h-4 mr-1" /> Reabrir
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-center text-gray-400 py-8">No hay cargos en esta bandeja.</p>}
      </div>
    </div>
  );
}
