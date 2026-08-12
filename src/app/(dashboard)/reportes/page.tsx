"use client";

import { useState, useEffect, useCallback } from "react";
import { FolderOpen, FileText, Printer, Trash2, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";

const CATEGORIES: { value: string; label: string; icon: string }[] = [
  { value: "USO_VEHICULOS", label: "Uso de Vehículos", icon: "🚛" },
  { value: "INVENTARIO", label: "Reportes de Inventario", icon: "📦" },
  { value: "PEDIDOS", label: "Pedidos a Bodega", icon: "📋" },
  { value: "OTROS", label: "Otros Reportes", icon: "📁" },
];

export default function ReportesPage() {
  const { user, token } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState("USO_VEHICULOS");
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reports", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setReports(json.data);
    } catch {
      toast.error("Error al cargar reportes");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function printUrl(report: any): string {
    if (report.resourceType === "vehicle_log") return `/api/vehicle-logs/${report.resourceId}/print`;
    if (report.resourceType === "order") return `/api/orders/${report.resourceId}/print`;
    return "#";
  }

  async function deleteReport(id: string) {
    if (!confirm("¿Eliminar este reporte?")) return;
    await fetch(`/api/reports/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchData();
  }

  async function sendWhatsApp(report: any) {
    const phone = whatsappPhone || prompt("Número de WhatsApp para enviar (8 dígitos):");
    if (!phone) return;
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        toNumber: phone,
        message: `📄 *Reporte: ${report.title}*\n\nVisualizá el informe aquí:\n${window.location.origin}${printUrl(report)}`,
        type: "NOTIFICATION",
      }),
    });
    const json = await res.json();
    if (json.success) toast.success("Reporte enviado por WhatsApp");
    else toast.error(json.error || "Error al enviar");
  }

  const filtered = reports.filter((r) => r.category === selectedCat);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <FolderOpen className="w-6 h-6" /> Repositorio de Reportes
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCat(cat.value)}
            className={`p-4 rounded-xl border-2 text-center ${
              selectedCat === cat.value ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"
            }`}
          >
            <div className="text-2xl mb-1">{cat.icon}</div>
            <div className="text-sm font-medium">{cat.label}</div>
            <div className="text-xs text-gray-400">{reports.filter((r) => r.category === cat.value).length} reportes</div>
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <input
          value={whatsappPhone}
          onChange={(e) => setWhatsappPhone(e.target.value)}
          placeholder="Nº WhatsApp para envío (8 dígitos)"
          className="rounded-lg border px-3 py-2 text-sm w-64"
        />
      </div>

      <div className="grid gap-3">
        {filtered.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-6 h-6 text-blue-500" />
                <div>
                  <h3 className="font-semibold">{r.title}</h3>
                  <p className="text-xs text-gray-400">
                    {new Date(r.createdAt).toLocaleString("es-GT")} · {r.createdBy?.name}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={printUrl(r)}
                  target="_blank"
                  className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 hover:bg-gray-200 flex items-center gap-1"
                >
                  <Printer className="w-3 h-3" /> Ver/Imprimir
                </a>
                <button
                  onClick={() => sendWhatsApp(r)}
                  className="px-3 py-1.5 rounded-lg text-xs bg-green-100 hover:bg-green-200 flex items-center gap-1"
                >
                  <Share2 className="w-3 h-3" /> WhatsApp
                </button>
                <button onClick={() => deleteReport(r.id)} className="px-2 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay reportes en esta carpeta.</p>
        )}
      </div>
    </div>
  );
}
