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
  const [selectedCategory, setSelectedCategory] = useState("AUDIO");
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

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
        body: JSON.stringify({ eventName, items: selectedItems }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Pedido #${json.data.orderNumber} creado`);
        setShowCreate(false);
        setEventName("");
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

  const filteredOrders = orders.filter((o) =>
    !search || String(o.orderNumber).includes(search) || o.eventName.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="w-6 h-6" /> Pedidos a Bodega
        </h1>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo Pedido
        </Button>
      </div>

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
                  {o.items?.length || 0} items · Creado por {o.createdBy?.name}
                </p>
              </div>
              <ClipboardList className="w-5 h-5 text-gray-400" />
            </div>
          </Card>
        ))}
        {filteredOrders.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay pedidos. Crea el primero con "Nuevo Pedido".</p>
        )}
      </div>

      {/* Modal crear pedido */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Nuevo Pedido a Bodega" size="lg">
        <div className="space-y-4 p-1">
          <Input label="Nombre del evento" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Ej: Boda Pérez - Sábado" />

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
    if (json.success) { toast.success(json.message); refresh(); onUpdated(); }
    else toast.error(json.error || "Error");
  }

  async function processReturn() {
    if (!confirm("¿Procesar devolución? Items buenos regresan a inventario, dañados/perdidos van a taller.")) return;
    const res = await fetch(`/api/orders/${order.id}/return`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (json.success) { toast.success(json.message); refresh(); onUpdated(); }
    else toast.error(json.error || "Error");
  }

  const isPreparing = order.status === "BORRADOR" || order.status === "PREPARANDO";

  return (
    <Modal isOpen onClose={onClose} title={`Pedido #${order.orderNumber} - ${order.eventName}`} size="lg">
      <div className="space-y-4 p-1">
        <div className="flex gap-2">
          <a
            href={`/api/orders/${order.id}/print`}
            target="_blank"
            className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
          >
            🖨️ Imprimir / PDF
          </a>
        </div>
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
            <Check className="w-4 h-4 mr-1" /> Pedido Listo (descontar inventario)
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
      </div>
    </Modal>
  );
}
