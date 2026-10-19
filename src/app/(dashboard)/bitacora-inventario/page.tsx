"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const TYPE_OPTIONS = [
  ["", "Todos"],
  ["DEVOLUCION", "Devolución de cuadro"],
  ["PRESTAMO", "Préstamo"],
  ["DEVOLUCION_PRESTAMO", "Devolución de préstamo"],
  ["ENTREGA_TALLER", "Entrega a taller"],
  ["RECEPCION_TALLER", "Recepción de taller"],
  ["REINTEGRO", "Reintegro"],
  ["RECIBIDO", "Recibido en bodega"],
  ["PERDIDA", "Pérdida"],
  ["DESCUENTO", "Descarte"],
  ["TRASLADO", "Traslado"],
  ["APROBACION", "Aprobación"],
  ["RECHAZO", "Rechazo"],
  ["FOTO", "Foto de inventario"],
  ["AJUSTE", "Ajuste"],
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(v: string) {
  return new Date(v).toLocaleString("es-GT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function BitacoraInventarioPage() {
  const { token } = useAuth();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)));
  const [to, setTo] = useState(iso(now));
  const [type, setType] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ from, to });
      if (type) qs.set("type", type);
      const res = await fetch(`/api/bitacora?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setRows(json.data || []);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token, from, to, type]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function quick(period: "day" | "week" | "month") {
    const d = new Date();
    if (period === "day") { setFrom(iso(d)); setTo(iso(d)); }
    if (period === "week") {
      const day = d.getDay() || 7;
      setFrom(iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (day - 1))));
      setTo(iso(d));
    }
    if (period === "month") {
      setFrom(iso(new Date(d.getFullYear(), d.getMonth(), 1)));
      setTo(iso(d));
    }
  }

  async function download(format: "xlsx" | "pdf") {
    try {
      const qs = new URLSearchParams({ format, from, to });
      if (type) qs.set("type", type);
      const res = await fetch(`/api/bitacora/report?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Error");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bitacora-${from}-${to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar");
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BookOpen className="w-6 h-6" /> Bitácora de inventario
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => download("xlsx")}>
            <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => download("pdf")}>
            <FileText className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Historial de devoluciones, préstamos, taller, aprobaciones y movimientos de inventario.
      </p>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border px-3 py-2 text-sm">
              {TYPE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => quick("day")}>Hoy</Button>
            <Button variant="ghost" size="sm" onClick={() => quick("week")}>Semana</Button>
            <Button variant="ghost" size="sm" onClick={() => quick("month")}>Mes</Button>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1" /> Actualizar
            </Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <p className="text-center text-gray-500 py-8">Cargando...</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Ítem</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2">De → A</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Notas</th>
                <th className="px-3 py-2">Fotos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmt(r.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{TYPE_OPTIONS.find(([v]) => v === r.type)?.[1] || r.type}</td>
                  <td className="px-3 py-2">{r.itemName}</td>
                  <td className="px-3 py-2 text-right">{r.quantity || 0}</td>
                  <td className="px-3 py-2 text-gray-600">{[r.fromWarehouse, r.toWarehouse].filter(Boolean).join(" → ") || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">{r.user?.name || "—"}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-xs">{r.notes || "—"}</td>
                  <td className="px-3 py-2">
                    {(r.photos || []).length > 0 ? (
                      <div className="flex gap-1">
                        {r.photos.slice(0, 3).map((p: string, i: number) => (
                          <a key={i} href={p} target="_blank" rel="noreferrer">
                            <img src={p} alt="foto" className="w-9 h-9 object-cover rounded border" />
                          </a>
                        ))}
                      </div>
                    ) : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Sin movimientos en el periodo.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
