"use client";

import { useState, useEffect, useCallback } from "react";
import { Folder, FileText, Printer, Trash2, Share2, Mail, X, ChevronLeft } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/ui/Modal";

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
  const [viewing, setViewing] = useState<any | null>(null);

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
    if (report.pdfData) return `/api/reports/${report.id}/pdf`;
    if (report.resourceType === "vehicle_log") return `/api/vehicle-logs/${report.resourceId}/pdf`;
    if (report.resourceType === "order") return `/api/orders/${report.resourceId}/print`;
    return "#";
  }

  async function deleteReport(id: string) {
    if (!confirm("¿Eliminar este reporte?")) return;
    await fetch(`/api/reports/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchData();
  }

  async function sendWhatsApp(report: any) {
    const phone = prompt("Número de WhatsApp para enviar (8 dígitos):");
    if (!phone) return;
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        to: phone,
        message: `📄 *Reporte: ${report.title}*\n\nVisualizá el informe aquí:\n${window.location.origin}${printUrl(report)}`,
        type: "NOTIFICATION",
      }),
    });
    const json = await res.json();
    if (json.success) toast.success("Reporte enviado por WhatsApp");
    else toast.error(json.error || "Error al enviar");
  }

  function sendEmail(report: any) {
    const subject = encodeURIComponent(`Reporte: ${report.title}`);
    const body = encodeURIComponent(`Visualizá el informe aquí:\n${window.location.origin}${printUrl(report)}`);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  const filtered = reports.filter((r) => r.category === selectedCat);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Folder className="w-6 h-6" /> Repositorio de Reportes
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setSelectedCat(cat.value)}
            className={`p-4 rounded-xl border-2 text-center transition-colors ${
              selectedCat === cat.value ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"
            }`}
          >
            <div className="text-2xl mb-1">{cat.icon}</div>
            <div className="text-sm font-medium text-gray-800">{cat.label}</div>
            <div className="text-xs text-gray-500">{reports.filter((r) => r.category === cat.value).length} archivos</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {filtered.map((r) => (
          <button
            key={r.id}
            onClick={() => setViewing(r)}
            className="border border-gray-200 rounded-lg p-2.5 text-left hover:border-blue-400 hover:shadow-md transition-all bg-white"
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="w-7 h-7 bg-red-50 rounded-lg flex items-center justify-center">
                <FileText className="w-4 h-4 text-red-500" />
              </div>
              <span className="text-[10px] text-gray-400">{new Date(r.createdAt).toLocaleDateString("es-GT", {day:"numeric",month:"short"})}</span>
            </div>
            <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{r.title}</p>
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{r.createdBy?.name}</p>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 col-span-full">No hay reportes en esta carpeta.</p>
        )}
      </div>

      {/* Visor del reporte */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
          <div className="bg-white border-b flex items-center justify-between px-4 py-3">
            <button onClick={() => setViewing(null)} className="flex items-center gap-1 text-sm text-gray-700">
              <ChevronLeft className="w-5 h-5" /> Volver
            </button>
            <span className="text-sm font-medium text-gray-800 truncate flex-1 text-center px-2">{viewing.title}</span>
            <div className="flex gap-2">
              <button onClick={() => window.open(printUrl(viewing), "_blank")} className="p-2 rounded-lg hover:bg-gray-100 text-gray-700" title="Imprimir">
                <Printer className="w-5 h-5" />
              </button>
              <button onClick={() => sendWhatsApp(viewing)} className="p-2 rounded-lg hover:bg-green-50 text-green-600" title="WhatsApp">
                <Share2 className="w-5 h-5" />
              </button>
              <button onClick={() => sendEmail(viewing)} className="p-2 rounded-lg hover:bg-blue-50 text-blue-600" title="Correo">
                <Mail className="w-5 h-5" />
              </button>
              {(user?.role === "ADMIN" || user?.role === "DUENO") && (
                <button onClick={() => { deleteReport(viewing.id); setViewing(null); }} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Eliminar">
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
          <iframe src={printUrl(viewing)} className="flex-1 w-full bg-white" />
        </div>
      )}
    </div>
  );
}
