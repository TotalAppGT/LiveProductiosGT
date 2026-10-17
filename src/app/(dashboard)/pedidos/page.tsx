"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, Plus, Search, Check, Camera, Trash2, ClipboardList, ArrowRightLeft } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const CATEGORIES = ["AUDIO", "ILUMINACION", "INSTRUMENTO", "CABLEADO", "MOBILIARIO", "HERRAMIENTA", "OTRO"];
const CATEGORY_LABELS: Record<string, string> = {
  AUDIO: "Audio", ILUMINACION: "Iluminación", INSTRUMENTO: "Instrumento",
  CABLEADO: "Cableado", MOBILIARIO: "Mobiliario", HERRAMIENTA: "Herramienta", OTRO: "Otro",
};

const STATUS_LABELS: Record<string, string> = {
  BORRADOR: "Borrador", PREPARANDO: "Preparando", LISTO: "Listo",
  EN_EVENTO: "En evento", DEVUELTO: "Devuelto",
};

export default function PedidosPage() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [eventName, setEventName] = useState("");
  const [clientName, setClientName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [contractNotes, setContractNotes] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("AUDIO");
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [tab, setTab] = useState<"cuadros" | "plantillas">("cuadros");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadItems, setUploadItems] = useState<any[] | null>(null);
  const [uploadDiscrepancies, setUploadDiscrepancies] = useState<any[]>([]);
  const [uploadEvent, setUploadEvent] = useState({ eventName: "", clientName: "", eventLocation: "", eventDate: "" });

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [oRes, tRes, iRes] = await Promise.all([
        fetch("/api/orders", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/templates", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/inventory", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const oJson = await oRes.json();
      const tJson = await tRes.json();
      const iJson = await iRes.json();
      if (oJson.success) setOrders(oJson.data);
      if (tJson.success) setTemplates(tJson.data);
      if (iJson.success) setInventory(iJson.data);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function createOrder() {
    if (!eventName.trim()) return toast.error("Nombre del evento requerido");
    if (selectedItems.length === 0) return toast.error("Añade al menos un item");
    setCreating(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          eventName, items: selectedItems,
          clientName, eventLocation, guestCount, eventDate, eventEndDate, contractNotes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Cuadro #${json.data.orderNumber} creado`);
        setShowCreate(false);
        setEventName("");
        setClientName("");
        setEventLocation("");
        setGuestCount("");
        setEventDate("");
        setEventEndDate("");
        setContractNotes("");
        setSelectedItems([]);
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al crear");
    } finally {
      setCreating(false);
    }
  }

  async function saveTemplate() {
    if (selectedItems.length === 0) return toast.error("Añade items al cuadro primero");
    const name = prompt("Nombre del cuadro (ej: Boda completa, Montaje sonido, Bautizo):");
    if (!name) return;
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, items: selectedItems }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Cuadro guardado");
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al guardar cuadro");
    }
  }

  function loadTemplate(templateId: string) {
    if (!templateId) return;
    const t = templates.find((x) => x.id === templateId);
    if (!t) return;
    const items = (t.items || []).map((it: any) => ({
      name: it.name,
      category: it.category,
      quantity: it.quantity || 1,
      inventoryItemId: it.inventoryItemId || null,
    }));
    setSelectedItems(items);
    toast.success(`Cuadro "${t.name}" cargado`);
  }

  async function downloadReport(path: string, filename: string) {
    try {
      toast.loading("Generando reporte…", { id: "rep" });
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar el reporte", { id: "rep" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Reporte descargado", { id: "rep" });
    } catch {
      toast.error("Error al descargar", { id: "rep" });
    }
  }

  async function uploadBulkOrders(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/orders/import-bulk", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json();
      if (json.success) {
        toast.success(`${json.created} cuadro(s) cargados (${json.totalItems} ítems)${json.unmatched?.length ? ` · ${json.unmatched.length} sin coincidencia` : ""}`);
        if (json.unmatched?.length) console.warn("Sin coincidencia en inventario:", json.unmatched);
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al subir cuadros");
    } finally {
      setUploading(false);
    }
  }

  async function doUpload(file: File) {
    setUploading(true);
    setUploadItems(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/orders/import", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json();
      if (json.success) {
        setUploadItems(json.data.items);
        setUploadDiscrepancies(json.data.discrepancies);
        toast.success(`${json.data.total} ítems detectados (${json.data.discrepancies.length} con discrepancia)`);
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al subir el cuadro");
    } finally {
      setUploading(false);
    }
  }

  async function createFromUpload() {
    if (!uploadEvent.eventName.trim()) return toast.error("Nombre del evento requerido");
    if (!uploadItems || uploadItems.length === 0) return toast.error("Sin ítems para cargar");
    setCreating(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          eventName: uploadEvent.eventName,
          clientName: uploadEvent.clientName,
          eventLocation: uploadEvent.eventLocation,
          eventDate: uploadEvent.eventDate,
          items: uploadItems.map((i) => ({ name: i.matchedName || i.name, quantity: i.quantity, inventoryItemId: i.inventoryItemId, category: "OTRO" })),
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Cuadro #${json.data.orderNumber} creado desde archivo`);
        setShowUpload(false);
        setUploadItems(null);
        setUploadDiscrepancies([]);
        setUploadEvent({ eventName: "", clientName: "", eventLocation: "", eventDate: "" });
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al crear");
    } finally {
      setCreating(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await fetch(`/api/templates/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchData();
  }

  async function deleteOrder(id: string, orderNumber: number) {
    if (!confirm(`¿Eliminar el cuadro #${orderNumber}? Esta acción no se puede deshacer.`)) return;
    const res = await fetch(`/api/orders/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({ success: false }));
    if (json.success) { toast.success("Cuadro eliminado"); fetchData(); }
    else toast.error(json.error || "Error al eliminar");
  }

  function useTemplate(t: any) {
    setSelectedItems((t.items || []).map((it: any) => ({ name: it.name, category: it.category, quantity: it.quantity || 1, inventoryItemId: it.inventoryItemId || null })));
    setShowCreate(true);
  }

  async function uploadTemplate(file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/orders/import", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json();
      if (!json.success) return toast.error(json.error || "Error");
      const name = prompt(`Nombre de la plantilla (${json.data.total} ítems detectados):`);
      if (!name) return;
      const tItems = json.data.items.map((i: any) => ({ name: i.matchedName || i.name, quantity: i.quantity, category: "OTRO", inventoryItemId: i.inventoryItemId }));
      const t = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, items: tItems }),
      });
      const tj = await t.json();
      if (tj.success) { toast.success("Plantilla guardada"); fetchData(); }
      else toast.error(tj.error || "Error");
    } catch {
      toast.error("Error al subir la plantilla");
    }
  }

  const filteredOrders = orders.filter((o) =>
    !search || String(o.orderNumber).includes(search) || o.eventName.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6" /> Cuadros de Evento
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadReport("/api/orders/report?format=xlsx", "reporte-general-cuadros.xlsx")}>
            📊 Reporte general (Excel)
          </Button>
          <Button variant="outline" onClick={() => downloadReport("/api/orders/report?format=pdf", "reporte-general-cuadros.pdf")}>
            📄 (PDF)
          </Button>
          <Button variant="outline" onClick={() => downloadReport("/api/orders/template", "plantilla-cuadros.xlsx")}>
            ⬇️ Plantilla Excel
          </Button>
          <label className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200">
            {uploading ? "Subiendo…" : "⬆️ Subir cuadros (Excel)"}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBulkOrders(f); e.target.value = ""; }} />
          </label>
          <Button variant="outline" onClick={() => setShowUpload(true)}>
            ⬆️ Subir cuadro
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo Cuadro
          </Button>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button onClick={() => setTab("cuadros")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "cuadros" ? "bg-white dark:bg-gray-700 shadow" : "text-gray-600 dark:text-gray-300"}`}>📋 Cuadros</button>
        <button onClick={() => setTab("plantillas")} className={`px-4 py-2 rounded-md text-sm font-medium ${tab === "plantillas" ? "bg-white dark:bg-gray-700 shadow" : "text-gray-600 dark:text-gray-300"}`}>📁 Plantillas ({templates.length})</button>
      </div>

      {tab === "cuadros" && (<>
      <div className="mb-4 flex gap-2">
        <Input
          placeholder="Buscar por # o evento"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<Search className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-3">
        {filteredOrders.map((o) => (
          <Card key={o.id} className="p-4 cursor-pointer hover:border-blue-400" onClick={() => setSelectedOrder(o)}>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-blue-600">#{o.orderNumber}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    o.status === "LISTO" ? "bg-green-100 text-green-700" :
                    o.status === "DEVUELTO" ? "bg-gray-100 text-gray-600" :
                    o.status === "BORRADOR" ? "bg-yellow-100 text-yellow-700" :
                    "bg-blue-100 text-blue-700"
                  }`}>
                    {STATUS_LABELS[o.status] || o.status}
                  </span>
                </div>
                <h3 className="font-semibold mt-1">{o.eventName}</h3>
                <p className="text-xs text-gray-400">
                  {o.eventDate ? new Date(o.eventDate).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short", year: "numeric" }) + " · " : ""}
                  {o.items?.length || 0} items · Creado por {o.createdBy?.name}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <ClipboardList className="w-5 h-5 text-gray-400" />
                <button
                  onClick={(e) => { e.stopPropagation(); deleteOrder(o.id, o.orderNumber); }}
                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Eliminar cuadro"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
        {filteredOrders.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay cuadros. Creá el primero con "Nuevo Cuadro".</p>
        )}
      </div>
      </>)}

      {tab === "plantillas" && (
        <div className="grid gap-3">
          <div className="flex justify-end">
            <label className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-lg cursor-pointer">
              ⬆️ Subir Excel como plantilla
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && uploadTemplate(e.target.files[0])} />
            </label>
          </div>
          {templates.length === 0 && (
            <p className="text-center text-gray-400 py-8">No hay plantillas. Guardá un cuadro como plantilla desde "Nuevo Cuadro" (💾 Guardar Cuadro).</p>
          )}
          {templates.map((t: any) => (
            <Card key={t.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-gray-400">{(t.items || []).length} ítems</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => useTemplate(t)}>Usar</Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteTemplate(t.id)}>🗑️</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={showUpload} onClose={() => setShowUpload(false)} title="Subir cuadro realizado" size="lg">
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Subí un Excel/CSV del cuadro (sección + cantidad + ítem). El sistema lo compara con el inventario y marca las <b>discrepancias</b> de descripción.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => e.target.files?.[0] && doUpload(e.target.files[0])}
            className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 p-2"
          />
          {uploading && <p className="text-xs text-gray-400">Procesando…</p>}
          {uploadItems && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input label="Evento" value={uploadEvent.eventName} onChange={(e) => setUploadEvent({ ...uploadEvent, eventName: e.target.value })} />
                <Input label="Cliente" value={uploadEvent.clientName} onChange={(e) => setUploadEvent({ ...uploadEvent, clientName: e.target.value })} />
                <Input label="Lugar" value={uploadEvent.eventLocation} onChange={(e) => setUploadEvent({ ...uploadEvent, eventLocation: e.target.value })} />
                <Input label="Fecha" type="date" value={uploadEvent.eventDate} onChange={(e) => setUploadEvent({ ...uploadEvent, eventDate: e.target.value })} />
              </div>
              <div className="text-xs">
                <p className="font-medium">{uploadItems.length} ítems · <span className="text-red-600">{uploadDiscrepancies.length} discrepancias</span></p>
                <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg mt-1 divide-y divide-gray-100 dark:divide-gray-800">
                  {uploadItems.map((it, i) => (
                    <div key={i} className="flex items-center justify-between px-2 py-1">
                      <span className="truncate">{it.quantity}× {it.name}</span>
                      <span className={`shrink-0 ml-2 text-[10px] ${it.matchType === "exact" ? "text-green-600" : it.matchType === "partial" ? "text-yellow-600" : "text-red-600"}`}>
                        {it.matchType === "exact" ? "✓" : it.matchType === "partial" ? `~ ${it.matchedName}` : "✗ sin match"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowUpload(false)}>Cerrar</Button>
                <Button onClick={createFromUpload} isLoading={creating}>Crear cuadro</Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Modal crear pedido */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Cuadro de Evento" size="lg">
        <div className="space-y-4 p-1">
          <Input label="Nombre del evento" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Ej: Boda Pérez - Sábado" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Cliente" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente" />
            <Input label="Lugar" value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} placeholder="Lugar del evento" />
            <Input label="Fecha" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
            <Input label="Fecha fin (opcional)" type="date" value={eventEndDate} onChange={(e) => setEventEndDate(e.target.value)} />
            <Input label="Invitados" type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} placeholder="150" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Equipo contratado / notas</label>
            <textarea value={contractNotes} onChange={(e) => setContractNotes(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ej: Dj completo, audio ceremonia, pista de baile 5x5..." />
          </div>

          {templates.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">📁 Cargar cuadro guardado</label>
              <select
                onChange={(e) => loadTemplate(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                defaultValue=""
              >
                <option value="">Seleccionar cuadro...</option>
                {templates.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name} ({(t.items || []).length} items)</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Selecciona categoría para ver items</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>

          <div className="border rounded-lg p-3 max-h-60 overflow-y-auto">
            <p className="text-sm font-medium mb-2">Items de {CATEGORY_LABELS[selectedCategory]}:</p>
            {inventory.filter((i) => i.category === selectedCategory).map((item) => (
              <label key={item.id} className="flex items-center justify-between py-1.5 border-b last:border-0 cursor-pointer">
                <span className="text-sm">{item.name} <span className="text-xs text-gray-400">(disp: {item.quantity})</span></span>
                <input
                  type="checkbox"
                  checked={selectedItems.some((s) => s.inventoryItemId === item.id)}
                  onChange={() => {
                    if (selectedItems.some((s) => s.inventoryItemId === item.id)) {
                      setSelectedItems(selectedItems.filter((s) => s.inventoryItemId !== item.id));
                    } else {
                      setSelectedItems([...selectedItems, { name: item.name, category: item.category, quantity: 1, inventoryItemId: item.id }]);
                    }
                  }}
                />
              </label>
            ))}
            {inventory.filter((i) => i.category === selectedCategory).length === 0 && (
              <p className="text-sm text-gray-400">No hay items en esta categoría.</p>
            )}
          </div>

          {selectedItems.length > 0 && (
            <div className="border rounded-lg p-3">
              <p className="text-sm font-medium mb-2">Items seleccionados ({selectedItems.length}):</p>
              {selectedItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 text-sm">
                  <span>{item.name}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const qty = parseInt(e.target.value) || 1;
                        setSelectedItems(selectedItems.map((s, i) => i === idx ? { ...s, quantity: qty } : s));
                      }}
                      className="w-16 rounded border px-2 py-0.5 text-sm"
                    />
                    <button onClick={() => setSelectedItems(selectedItems.filter((_, i) => i !== idx))} className="text-red-500">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={saveTemplate}>💾 Guardar Cuadro</Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={createOrder} isLoading={creating}>Crear Pedido</Button>
          </div>
        </div>
      </Modal>

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          token={token || ""}
          onUpdated={fetchData}
        />
      )}
    </div>
  );
}

function OrderDetailModal({ order, onClose, token, onUpdated }: { order: any; onClose: () => void; token: string; onUpdated: () => void }) {
  const [items, setItems] = useState<any[]>(order.items || []);
  const [uploading, setUploading] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);

  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/analysis`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setAnalysis(json.data);
    } catch {
      // silencioso
    } finally {
      setAnalysisLoading(false);
    }
  }, [order.id, token]);

  useEffect(() => { loadAnalysis(); }, [loadAnalysis]);

  async function downloadReport(format: "pdf" | "xlsx") {
    try {
      const res = await fetch(`/api/orders/${order.id}/report?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar el reporte"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cuadro-${order.orderNumber}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Error al descargar");
    }
  }

  async function refresh() {
    const res = await fetch(`/api/orders/${order.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (json.success) setItems(json.data.items);
  }

  async function uploadPhoto(itemId: string, type: "prepared" | "return") {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) return;
      setUploading(itemId);
      const urls: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/files/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const json = await res.json();
        if (json.success) urls.push(json.data.fileUrl);
      }
      const item = items.find((i) => i.id === itemId);
      const existing = item?.[type === "prepared" ? "preparedPhotos" : "returnPhotos"] || [];
      const merged = [...existing, ...urls].slice(0, 3);
      await fetch(`/api/order-items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(type === "prepared" ? { preparedPhotos: merged } : { returnPhotos: merged }),
      });
      setUploading(null);
      refresh();
      toast.success("Foto subida");
    };
    input.click();
  }

  async function toggleCheck(itemId: string, type: "prepared" | "return") {
    const item = items.find((i) => i.id === itemId);
    const field = type === "prepared" ? "preparedChecked" : "returnChecked";
    await fetch(`/api/order-items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ [field]: !item?.[field] }),
    });
    refresh();
  }

  async function setCondition(itemId: string, condition: string) {
    await fetch(`/api/order-items/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ returnCondition: condition }),
    });
    refresh();
  }

  async function markReady() {
    if (!confirm("¿Marcar pedido como LISTO y descontar inventario?")) return;
    const res = await fetch(`/api/orders/${order.id}/ready`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) { toast.success(json.message); refresh(); loadAnalysis(); onUpdated(); }
    else toast.error(json.error || "Error");
  }

  async function processReturn() {
    if (!confirm("¿Procesar devolución? Items buenos regresan a inventario, dañados/perdidos van a taller.")) return;
    const res = await fetch(`/api/orders/${order.id}/return`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) { toast.success(json.message); refresh(); loadAnalysis(); onUpdated(); }
    else toast.error(json.error || "Error");
  }

  const isPreparing = order.status === "BORRADOR" || order.status === "PREPARANDO";

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [editItems, setEditItems] = useState<any[]>([]);
  const [invList, setInvList] = useState<any[]>([]);
  const [addSel, setAddSel] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function startEdit() {
    setEditForm({
      eventName: order.eventName || "",
      clientName: order.clientName || "",
      eventLocation: order.eventLocation || "",
      guestCount: order.guestCount || "",
      eventDate: order.eventDate ? new Date(order.eventDate).toISOString().slice(0, 10) : "",
      eventEndDate: order.eventEndDate ? new Date(order.eventEndDate).toISOString().slice(0, 10) : "",
      contractNotes: order.contractNotes || "",
    });
    setEditItems(items.map((it) => ({ name: it.name, quantity: it.quantity, category: it.category, inventoryItemId: it.inventoryItemId })));
    setEditing(true);
    try {
      const res = await fetch("/api/inventory?limit=1000", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setInvList(json.data);
    } catch {
      // silencioso
    }
  }

  function addFromInv(id: string) {
    const it = invList.find((x) => x.id === id);
    if (!it) return;
    setEditItems((prev) => [...prev, { name: it.name, quantity: 1, category: it.category, inventoryItemId: it.id }]);
    setAddSel("");
  }
  function addExtraRow() {
    setEditItems((prev) => [...prev, { name: "", quantity: 1, category: "OTRO", inventoryItemId: null }]);
  }
  function removeRow(i: number) {
    setEditItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function removeOrder() {
    if (!confirm(`¿Eliminar el cuadro #${order.orderNumber} "${order.eventName}"? No se puede deshacer.`)) return;
    const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json().catch(() => ({ success: false }));
    if (json.success) { toast.success("Cuadro eliminado"); onUpdated(); onClose(); }
    else toast.error(json.error || "Error al eliminar");
  }

  async function saveEdit() {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...editForm, items: editItems.filter((i) => String(i.name).trim()) }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Cuadro actualizado");
        setItems(json.data.items);
        setEditing(false);
        refresh();
        loadAnalysis();
        onUpdated();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Cuadro #${order.orderNumber} - ${order.eventName}`} size="lg">
      <div className="space-y-4 p-1">
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/orders/${order.id}/print`}
            target="_blank"
            className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
          >
            🖨️ Imprimir
          </a>
          <button
            onClick={() => downloadReport("xlsx")}
            className="text-xs bg-green-100 hover:bg-green-200 text-green-800 px-3 py-1.5 rounded-lg"
          >
            📊 Reporte Excel
          </button>
          <button
            onClick={() => downloadReport("pdf")}
            className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1.5 rounded-lg"
          >
            📄 Reporte PDF
          </button>
          {!editing ? (
            <button onClick={startEdit} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded-lg">
              ✏️ Editar
            </button>
          ) : (
            <>
              <button onClick={saveEdit} disabled={savingEdit} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
                {savingEdit ? "Guardando…" : "💾 Guardar"}
              </button>
              <button onClick={() => setEditing(false)} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg">
                Cancelar
              </button>
            </>
          )}
          {!editing && (
            <button onClick={removeOrder} className="text-xs bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1.5 rounded-lg">
              🗑️ Eliminar
            </button>
          )}
        </div>

        {editing && (
          <div className="border rounded-lg p-3 space-y-2 bg-blue-50/40 dark:bg-blue-900/10">
            <p className="text-sm font-semibold">Editar cuadro</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input label="Evento" value={editForm.eventName} onChange={(e) => setEditForm({ ...editForm, eventName: e.target.value })} />
              <Input label="Cliente" value={editForm.clientName} onChange={(e) => setEditForm({ ...editForm, clientName: e.target.value })} />
              <Input label="Lugar" value={editForm.eventLocation} onChange={(e) => setEditForm({ ...editForm, eventLocation: e.target.value })} />
              <Input label="Invitados" type="number" value={editForm.guestCount} onChange={(e) => setEditForm({ ...editForm, guestCount: e.target.value })} />
              <Input label="Fecha" type="date" value={editForm.eventDate} onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })} />
              <Input label="Fecha fin" type="date" value={editForm.eventEndDate} onChange={(e) => setEditForm({ ...editForm, eventEndDate: e.target.value })} />
            </div>
            <textarea
              value={editForm.contractNotes}
              onChange={(e) => setEditForm({ ...editForm, contractNotes: e.target.value })}
              placeholder="Equipo contratado / notas"
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
            <div className="text-sm font-medium">Ítems ({editItems.length})</div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {editItems.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={it.name}
                    onChange={(e) => setEditItems((prev) => prev.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))}
                    className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                    placeholder="Ítem / extra"
                  />
                  <input
                    type="number"
                    min="1"
                    value={it.quantity}
                    onChange={(e) => setEditItems((prev) => prev.map((x, idx) => idx === i ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                    className="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                  />
                  <button onClick={() => removeRow(i)} className="text-red-500 text-sm">✕</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={addSel} onChange={(e) => addFromInv(e.target.value)} className="flex-1 min-w-[200px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm">
                <option value="">+ Agregar del inventario…</option>
                {invList.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={addExtraRow}>+ Extra libre</Button>
            </div>
          </div>
        )}

        {analysisLoading ? (
          <p className="text-xs text-gray-400">Analizando disponibilidad…</p>
        ) : analysis ? (
          <div className="border rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-800/50">
            <p className="font-semibold text-sm">🧠 Análisis del cuadro</p>
            {analysis.missing.length === 0 ? (
              <p className="text-sm text-green-600">✅ Todo alcanza con el inventario para esas fechas.</p>
            ) : (
              <div className="space-y-1 text-sm">
                <p className="text-red-600 font-medium">⚠️ Falta cubrir ({analysis.missing.length}):</p>
                {analysis.missing.map((m: any, i: number) => (
                  <p key={i} className="text-xs text-gray-700 dark:text-gray-300">
                    • <b>{m.name}</b>: necesitás {m.needed}, disponible {m.available} → faltan <b>{m.shortfall}</b>
                    {m.reusableFrom && m.reusableFrom.length > 0 && (
                      <span className="text-blue-600"> · ♻️ reutilizable de {m.reusableFrom.map((r: any) => `#${r.orderNumber} ${r.eventName}`).join(", ")}</span>
                    )}
                  </p>
                ))}
              </div>
            )}
            <p className="text-sm">🚚 <b>Camión recomendado:</b> {analysis.truck.type} <span className="text-gray-400">({analysis.truck.reason})</span></p>
            {analysis.extras.length > 0 && (
              <p className="text-sm">➕ <b>Adicional sugerido:</b> {analysis.extras.join(", ")}</p>
            )}
            <p className="text-[11px] text-gray-400">
              Disponibilidad calculada para {analysis.eventDate ? new Date(analysis.eventDate).toLocaleDateString("es-GT", { timeZone: "America/Guatemala" }) : "sin fecha"}.
            </p>
          </div>
        ) : null}

        {!editing && (<>
        {items.map((item: any) => (
          <div key={item.id} className="border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{item.name} <span className="text-gray-400 text-xs">x{item.quantity}</span></p>
                <p className="text-xs text-gray-400">{CATEGORY_LABELS[item.category] || item.category}</p>
              </div>
              {isPreparing && (
                <button
                  onClick={() => toggleCheck(item.id, "prepared")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    item.preparedChecked ? "bg-green-500 text-white" : "bg-gray-200 text-gray-700"
                  }`}
                >
                  <Check className="w-4 h-4 inline" /> {item.preparedChecked ? "Preparado" : "Preparar"}
                </button>
              )}
              {!isPreparing && order.status !== "DEVUELTO" && (
                <button
                  onClick={() => toggleCheck(item.id, "return")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    item.returnChecked ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-700"
                  }`}
                >
                  <Check className="w-4 h-4 inline" /> {item.returnChecked ? "Recibido" : "Recibir"}
                </button>
              )}
            </div>

            {/* Fotos preparación */}
            {isPreparing && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button onClick={() => uploadPhoto(item.id, "prepared")} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">
                  <Camera className="w-3 h-3 inline mr-1" /> Fotos ({item.preparedPhotos?.length || 0}/3)
                </button>
                {(item.preparedPhotos || []).map((p: string, i: number) => (
                  <img key={i} src={p} className="w-12 h-12 object-cover rounded border" />
                ))}
              </div>
            )}

            {/* Fotos devolución */}
            {!isPreparing && order.status !== "DEVUELTO" && (
              <div className="mt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => uploadPhoto(item.id, "return")} className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200">
                    <Camera className="w-3 h-3 inline mr-1" /> Fotos recibido ({item.returnPhotos?.length || 0}/3)
                  </button>
                  {(item.returnPhotos || []).map((p: string, i: number) => (
                    <img key={i} src={p} className="w-12 h-12 object-cover rounded border" />
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  {["BUENO", "DANADO", "PERDIDO"].map((cond) => (
                    <button
                      key={cond}
                      onClick={() => setCondition(item.id, cond)}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        item.returnCondition === cond
                          ? cond === "BUENO" ? "bg-green-500 text-white" : cond === "DANADO" ? "bg-orange-500 text-white" : "bg-red-500 text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      {cond === "BUENO" ? "✅ Bueno" : cond === "DANADO" ? "🔧 Dañado" : "❌ Perdido"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {isPreparing && (
          <Button onClick={markReady} className="w-full">
            <Check className="w-4 h-4 mr-1" /> Cuadro Listo (compromete inventario en sus fechas)
          </Button>
        )}
        {!isPreparing && order.status !== "DEVUELTO" && (
          <Button onClick={processReturn} className="w-full">
            <ArrowRightLeft className="w-4 h-4 mr-1" /> Procesar Devolución
          </Button>
        )}
        {order.status === "DEVUELTO" && (
          <p className="text-center text-sm text-green-600 font-medium">✅ Pedido devuelto y procesado</p>
        )}
        </>)}
      </div>
    </Modal>
  );
}
