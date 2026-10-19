"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Wrench, Plus, Search, PackageCheck, X, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const STATUS_LABELS: Record<string, string> = {
  EN_REVISION: "En revisión",
  EN_REPARACION: "En reparación",
  REPARADO: "Reparado (esperando reintegro)",
  POR_DESCARTAR: "Por descartar",
  DESCARTADO: "Descartado",
  DEVUELTO_A_BODEGA: "Devuelto a bodega",
};

const STATUS_COLORS: Record<string, string> = {
  EN_REVISION: "bg-yellow-100 text-yellow-700",
  EN_REPARACION: "bg-orange-100 text-orange-700",
  REPARADO: "bg-emerald-100 text-emerald-700",
  POR_DESCARTAR: "bg-red-100 text-red-700",
  DESCARTADO: "bg-red-100 text-red-700",
  DEVUELTO_A_BODEGA: "bg-blue-100 text-blue-700",
};

const OPEN_STATUSES = ["EN_REVISION", "EN_REPARACION", "REPARADO", "POR_DESCARTAR"];
const CLOSED_STATUSES = ["DEVUELTO_A_BODEGA", "DESCARTADO"];

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 1000;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No canvas"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function TallerPage() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSend, setShowSend] = useState(false);
  const [invSearch, setInvSearch] = useState("");
  const [selectedInv, setSelectedInv] = useState<any>(null);
  const [quantity, setQuantity] = useState("1");
  const [issue, setIssue] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryPhotos, setDeliveryPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [receiveItem, setReceiveItem] = useState<any>(null);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receptionPhotos, setReceptionPhotos] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [receiveWarehouse, setReceiveWarehouse] = useState("Bodega Cristo Rey");

  const isAdmin = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [woRes, uRes, iRes, whRes] = await Promise.all([
        fetch("/api/workshop", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/inventory?status=DISPONIBLE&limit=500", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/warehouses", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [woJson, uJson, iJson, whJson] = await Promise.all([woRes.json(), uRes.json(), iRes.json(), whRes.json()]);
      if (woJson.success) setItems(woJson.data || []);
      if (Array.isArray(uJson)) setUsers(uJson);
      if (iJson.success) setInventory(iJson.data || []);
      if (whJson.success) setWarehouses(whJson.data || []);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const jose = useMemo(() => users.find((u: any) => /marroquin/i.test(u.name || "")), [users]);

  const filteredInventory = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    const list = q ? inventory.filter((i: any) => (i.name || "").toLowerCase().includes(q)) : inventory;
    return list.slice(0, 40);
  }, [inventory, invSearch]);

  const openItems = items.filter((i: any) => OPEN_STATUSES.includes(i.status));
  const closedItems = items.filter((i: any) => CLOSED_STATUSES.includes(i.status));

  function resetSend() {
    setSelectedInv(null);
    setInvSearch("");
    setQuantity("1");
    setIssue("");
    setNotes("");
    setDeliveryPhotos([]);
    setAssignedToId("");
  }

  async function addPhotos(files: FileList | null, setter: (fn: (p: string[]) => string[]) => void) {
    if (!files || files.length === 0) return;
    try {
      const urls = await Promise.all(Array.from(files).map(compressImage));
      setter((prev) => [...prev, ...urls]);
    } catch {
      toast.error("No se pudo procesar la foto");
    }
  }

  async function sendToWorkshop() {
    if (!selectedInv) return toast.error("Seleccioná un ítem del inventario");
    if (!issue.trim()) return toast.error("Describí el problema");
    setSaving(true);
    try {
      const res = await fetch("/api/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inventoryItemId: selectedInv.id,
          quantity: Number(quantity) || 1,
          issue: issue.trim(),
          assignedToId: assignedToId || jose?.id || null,
          notes: notes.trim() || null,
          photos: deliveryPhotos,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Solicitud enviada a aprobación");
        setShowSend(false);
        resetSend();
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al enviar");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item: any, status: string, extra: Record<string, unknown> = {}) {
    try {
      const res = await fetch(`/api/workshop/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, ...extra }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Estado: ${STATUS_LABELS[status] || status}`);
        fetchData();
        return true;
      }
      toast.error(json.error || "Error");
    } catch {
      toast.error("Error al actualizar");
    }
    return false;
  }

  function openReceive(item: any) {
    setReceiveItem(item);
    setReceiveNotes("");
    setReceptionPhotos([]);
    setReceiveWarehouse(item.inventoryItem?.warehouse || "Bodega Cristo Rey");
  }

  async function confirmReceive() {
    if (!receiveItem) return;
    setSaving(true);
    try {
      const ok = await updateStatus(receiveItem, "REPARADO", {
        notes: receiveNotes.trim() ? `${receiveItem.notes || ""}${receiveItem.notes ? " · " : ""}Recepción: ${receiveNotes.trim()}` : receiveItem.notes,
        receptionPhotos,
        toWarehouse: receiveWarehouse,
      });
      if (ok) setReceiveItem(null);
    } finally {
      setSaving(false);
    }
  }

  async function discard(item: any) {
    if (!confirm(`¿Descartar "${item.itemName}"? Pasará a PERDIDO en el inventario.`)) return;
    await updateStatus(item, "DESCARTADO");
  }

  async function deleteItem(item: any) {
    if (!confirm("¿Cancelar este registro de taller? Si estaba abierto, el ítem vuelve a disponible.")) return;
    await fetch(`/api/workshop/${item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchData();
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="w-6 h-6" /> Taller
        </h1>
        {isAdmin && (
          <Button onClick={() => { resetSend(); setShowSend(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Enviar a taller
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Flujo: devolución del cuadro → entrega a taller (bitácora) → reparación → recepción y vuelta al inventario.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card className="p-3">
          <p className="text-xs text-gray-500">En taller</p>
          <p className="text-2xl font-bold">{openItems.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">En revisión</p>
          <p className="text-2xl font-bold text-yellow-600">{openItems.filter((i: any) => i.status === "EN_REVISION").length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">En reparación</p>
          <p className="text-2xl font-bold text-orange-600">{openItems.filter((i: any) => i.status === "EN_REPARACION").length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">Recibidos (reparados)</p>
          <p className="text-2xl font-bold text-green-600">{closedItems.filter((i: any) => i.status === "DEVUELTO_A_BODEGA").length}</p>
        </Card>
      </div>

      <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
        <Wrench className="w-5 h-5" /> En taller
      </h2>
      <div className="grid gap-3 mb-8">
        {openItems.map((item: any) => (
          <Card key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || "bg-gray-100"}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.category}</span>
                  <span className="text-xs text-gray-500">Cant: {item.quantity}</span>
                  {item.approvalRequests?.length > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">⏳ Pendiente: {item.approvalRequests[0].type}</span>
                  )}
                </div>
                <h3 className="font-semibold mt-2 text-lg">{item.itemName}</h3>
                {item.inventoryItem && (
                  <p className="text-xs text-gray-500">
                    {item.inventoryItem.section || "—"} · {item.inventoryItem.warehouse || "—"}
                  </p>
                )}
                <p className="text-sm text-gray-600 mt-1">🔴 Problema: {item.issue}</p>
                {item.diagnostic && <p className="text-sm text-gray-600 mt-1">🔍 Diagnóstico: {item.diagnostic}</p>}
                {item.notes && <p className="text-xs text-gray-500 mt-1">📝 {item.notes}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  👤 Técnico: {item.assignedTo?.name || "Sin asignar"} · Entrega: {fmtDate(item.deliveredAt)} ({item.deliveredBy?.name || "—"})
                </p>
                {item.deliveryPhotos?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {item.deliveryPhotos.map((p: string, idx: number) => (
                      <a key={idx} href={p} target="_blank" rel="noreferrer">
                        <img src={p} alt="entrega" className="w-16 h-16 object-cover rounded border" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 min-w-[170px]">
                {item.status === "EN_REVISION" && (
                  <button onClick={() => updateStatus(item, "EN_REPARACION")} className="px-3 py-3 rounded-lg text-sm font-bold bg-orange-500 text-white hover:bg-orange-600">
                    🔧 Empezar reparación
                  </button>
                )}
                {item.status === "EN_REPARACION" && (
                  <button onClick={() => openReceive(item)} className="px-3 py-3 rounded-lg text-sm font-bold bg-green-500 text-white hover:bg-green-600">
                    ✅ Reparado → solicitar reintegro
                  </button>
                )}
                {(item.status === "EN_REVISION" || item.status === "EN_REPARACION") && (
                  <button onClick={() => discard(item)} className="px-3 py-2 rounded-lg text-xs font-bold bg-red-100 text-red-700 hover:bg-red-200">
                    ❌ Descartar (baja)
                  </button>
                )}
                {(item.status === "REPARADO" || item.status === "POR_DESCARTAR") && (
                  <div className="px-3 py-2 rounded-lg text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 text-center">
                    ⏳ Esperando aprobación admin
                  </div>
                )}
                {isAdmin && (
                  <button onClick={() => deleteItem(item)} className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100">
                    🗑 Cancelar
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {openItems.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay ítems en taller. Los dañados en devoluciones aparecen aquí.</p>
        )}
      </div>

      <h2 className="font-semibold text-lg mb-3 flex items-center gap-2">
        <ClipboardList className="w-5 h-5" /> Bitácora de recepción
      </h2>
      <div className="grid gap-3">
        {closedItems.map((item: any) => (
          <Card key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || "bg-gray-100"}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className="text-xs text-gray-500">Cant: {item.quantity}</span>
                </div>
                <h3 className="font-semibold mt-2">{item.itemName}</h3>
                {item.diagnostic && <p className="text-sm text-gray-600 mt-1">🔍 {item.diagnostic}</p>}
                {item.notes && <p className="text-xs text-gray-500 mt-1">📝 {item.notes}</p>}
                <p className="text-xs text-gray-400 mt-2">
                  Entrega: {fmtDate(item.deliveredAt)} ({item.deliveredBy?.name || "—"}) · Recepción: {fmtDate(item.receptionAt)} ({item.receivedBy?.name || "—"})
                </p>
                {item.receptionPhotos?.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {item.receptionPhotos.map((p: string, idx: number) => (
                      <a key={idx} href={p} target="_blank" rel="noreferrer">
                        <img src={p} alt="recepción" className="w-16 h-16 object-cover rounded border" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              {isAdmin && (
                <button onClick={() => deleteItem(item)} className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100">
                  🗑 Eliminar
                </button>
              )}
            </div>
          </Card>
        ))}
        {closedItems.length === 0 && <p className="text-center text-gray-400 py-6">Aún no hay recepciones registradas.</p>}
      </div>

      <Modal isOpen={showSend} onClose={() => setShowSend(false)} title="Enviar a Taller">
        <div className="space-y-3 p-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ítem del inventario</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={invSearch}
                onChange={(e) => { setInvSearch(e.target.value); setSelectedInv(null); }}
                placeholder="Buscar por nombre..."
                className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm"
              />
            </div>
            {selectedInv ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border bg-blue-50 px-3 py-2 text-sm">
                <span>{selectedInv.name} <span className="text-gray-500">({selectedInv.section || "—"})</span></span>
                <button onClick={() => setSelectedInv(null)} className="text-gray-500"><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border divide-y">
                {filteredInventory.map((inv: any) => (
                  <button
                    key={inv.id}
                    onClick={() => { setSelectedInv(inv); setQuantity(String(inv.quantity || 1)); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {inv.name}
                    <span className="text-xs text-gray-400"> · {inv.section || "—"} · {inv.warehouse || "—"}</span>
                  </button>
                ))}
                {filteredInventory.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">Sin resultados.</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Cantidad" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Técnico</label>
              <select value={assignedToId || jose?.id || ""} onChange={(e) => setAssignedToId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="">Sin asignar</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Problema</label>
            <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Describe el problema" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas de entrega (opcional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Accesorios, estado, observaciones..." />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fotos de entrega</label>
            <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files, setDeliveryPhotos)} className="text-sm" />
            {deliveryPhotos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {deliveryPhotos.map((p, idx) => (
                  <div key={idx} className="relative">
                    <img src={p} alt="entrega" className="w-16 h-16 object-cover rounded border" />
                    <button onClick={() => setDeliveryPhotos((prev) => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowSend(false)}>Cancelar</Button>
            <Button onClick={sendToWorkshop} isLoading={saving}>Entregar a taller</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!receiveItem} onClose={() => setReceiveItem(null)} title="Solicitar reintegro a bodega">
        <div className="space-y-3 p-1">
          <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm">
            <strong>{receiveItem?.itemName}</strong> · Cant: {receiveItem?.quantity}
            <p className="text-xs text-gray-600 mt-1">Se crea una solicitud de <strong>reintegro</strong>. Al aprobarla un admin, la bodega destino debe dar "Recibido".</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bodega destino</label>
            <select value={receiveWarehouse} onChange={(e) => setReceiveWarehouse(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              {(warehouses.length ? warehouses.map((w: any) => w.name) : ["Bodega Cristo Rey", "Casa Nómada"]).map((name: string) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas de recepción</label>
            <textarea value={receiveNotes} onChange={(e) => setReceiveNotes(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Qué se reparó, pruebas, observaciones..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fotos de recepción</label>
            <input type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files, setReceptionPhotos)} className="text-sm" />
            {receptionPhotos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {receptionPhotos.map((p, idx) => (
                  <div key={idx} className="relative">
                    <img src={p} alt="recepción" className="w-16 h-16 object-cover rounded border" />
                    <button onClick={() => setReceptionPhotos((prev) => prev.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setReceiveItem(null)}>Cancelar</Button>
            <Button onClick={confirmReceive} isLoading={saving}>
              <PackageCheck className="w-4 h-4 mr-1" /> Solicitar reintegro
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
