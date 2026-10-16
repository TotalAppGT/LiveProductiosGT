"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingCart, Plus, Search, Paperclip, Trash2, Pencil, FileText, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const STATUS_LABEL: Record<string, string> = { PENDIENTE: "Pendiente", COMPRADO: "Comprado", CANCELADO: "Cancelado" };
const STATUS_COLOR: Record<string, string> = {
  PENDIENTE: "bg-yellow-100 text-yellow-700",
  COMPRADO: "bg-green-100 text-green-700",
  CANCELADO: "bg-gray-200 text-gray-600",
};
const CATEGORIES = ["Audio", "Iluminación", "Cableado", "Herramientas", "Limpieza", "Oficina", "Bodega", "Marketing", "Transporte", "Mantenimiento", "Otro"];
const PAYMENT_METHODS = ["Efectivo", "Transferencia", "Tarjeta", "Cheque", "Otro"];
const DOC_KINDS: Record<string, string> = { FACTURA: "Factura", RECIBO: "Recibo", COTIZACION: "Cotización", COMPROBANTE: "Comprobante de pago", OTRO: "Otro" };

const q2 = (n: any) => `Q${Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function ComprasPage() {
  const { user, token } = useAuth();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (categoryFilter) params.set("category", categoryFilter);
      if (search) params.set("search", search);
      const [pRes, uRes, sRes] = await Promise.all([
        fetch(`/api/purchases?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/users`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/suppliers`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const pJson = await pRes.json();
      const uJson = await uRes.json().catch(() => ({ data: [] }));
      const sJson = await sRes.json().catch(() => ({ data: [] }));
      if (pJson.success) setPurchases(pJson.data);
      const list = Array.isArray(uJson.data) ? uJson.data : uJson.data?.data || [];
      setUsers(list);
      if (sJson.success) setSuppliers(sJson.data);
    } catch {
      toast.error("Error al cargar compras");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, categoryFilter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function quickStatus(id: string, status: string) {
    const res = await fetch(`/api/purchases/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, receivedAt: status === "COMPRADO" ? new Date().toISOString() : null }),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (res.success) { toast.success("Estado actualizado"); fetchData(); if (detail?.id === id) setDetail(res.data); }
    else toast.error("Error al actualizar");
  }

  async function deletePurchase(id: string) {
    if (!confirm("¿Eliminar esta compra? Se borran sus documentos.")) return;
    const res = await fetch(`/api/purchases/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ success: false }));
    if (res.success) { toast.success("Compra eliminada"); setDetail(null); fetchData(); }
    else toast.error("Error al eliminar");
  }

  async function downloadReport(format: "pdf" | "xlsx") {
    try {
      toast.loading("Generando reporte…", { id: "prep" });
      const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      const last = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/purchases/report?format=${format}&from=${first}&to=${last}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar", { id: "prep" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `compras-mes.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Reporte descargado", { id: "prep" });
    } catch { toast.error("Error al descargar", { id: "prep" }); }
  }

  const pendientes = purchases.filter((p) => p.status === "PENDIENTE");
  const now = new Date();
  const compradoMes = purchases.filter((p) => p.status === "COMPRADO" && (() => {
    const d = new Date(p.receivedAt || p.invoiceDate || p.updatedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  })());
  const totalPendiente = pendientes.reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalMes = compradoMes.reduce((s, p) => s + Number(p.amount || 0), 0);
  const canManage = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="h-6 w-6" /> Compras
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Solicitudes, gastos y documentos de compras</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSuppliers(true)}>Proveedores</Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport("pdf")}>📄 Reporte PDF</Button>
          <Button variant="outline" size="sm" onClick={() => downloadReport("xlsx")}>📊 Reporte Excel</Button>
          <Button variant="primary" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setShowForm(true); }}>
            Nueva Compra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-gray-500">Pendientes</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{pendientes.length}</p>
          <p className="text-xs text-gray-400">{q2(totalPendiente)} por comprar</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Gasto del mes</p>
          <p className="text-xl font-bold text-green-600">{q2(totalMes)}</p>
          <p className="text-xs text-gray-400">{compradoMes.length} compra(s)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500">Documentos</p>
          <p className="text-xl font-bold text-gray-900 dark:text-white">{purchases.reduce((s, p) => s + (p.documents?.length || 0), 0)}</p>
          <p className="text-xs text-gray-400">facturas / recibos adjuntos</p>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Buscar por título, proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
          <option value="">Todos los estados</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="COMPRADO">Comprado</option>
          <option value="CANCELADO">Cancelado</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
          <option value="">Todas las categorías</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">Cargando...</p>
      ) : purchases.length === 0 ? (
        <p className="text-center text-gray-400 py-12">No hay compras. Creá una con "Nueva Compra".</p>
      ) : (
        <div className="grid gap-3">
          {purchases.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{p.title}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[p.status] || ""}`}>{STATUS_LABEL[p.status] || p.status}</span>
                    {p.category && <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">{p.category}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {p.provider ? `Proveedor: ${p.provider} · ` : ""}{p.assignedTo ? `${p.assignedTo.name} · ` : ""}Vence: {fmt(p.dueDate)}
                    {p.documents?.length ? ` · 📎 ${p.documents.length}` : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900 dark:text-white">{p.amount ? q2(p.amount) : "—"}</p>
                  {Number(p.advance) > 0 && <p className="text-xs text-gray-400">anticipo {q2(p.advance)}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <Button variant="ghost" size="sm" onClick={() => setDetail(p)}><Paperclip className="h-3 w-3 mr-1" /> Documentos</Button>
                <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setShowForm(true); }}><Pencil className="h-3 w-3 mr-1" /> Editar</Button>
                {p.status !== "COMPRADO" && <Button variant="ghost" size="sm" onClick={() => quickStatus(p.id, "COMPRADO")}><Check className="h-3 w-3 mr-1" /> Comprado</Button>}
                {p.status !== "PENDIENTE" && <Button variant="ghost" size="sm" onClick={() => quickStatus(p.id, "PENDIENTE")}>Reabrir</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PurchaseFormModal
        key={editing?.id || "new"}
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        token={token || ""}
        purchase={editing}
        users={users}
        suppliers={suppliers}
        onSaved={fetchData}
      />

      <SuppliersModal isOpen={showSuppliers} onClose={() => setShowSuppliers(false)} token={token || ""} suppliers={suppliers} onChanged={fetchData} />

      {detail && (
        <PurchaseDetail
          purchase={detail}
          token={token || ""}
          onClose={() => setDetail(null)}
          onChanged={(p: any) => { setDetail(p); fetchData(); }}
          onDelete={() => deletePurchase(detail.id)}
          canManage={!!canManage}
          quickStatus={quickStatus}
        />
      )}
    </div>
  );
}

function PurchaseFormModal({ isOpen, onClose, token, purchase, users, suppliers, onSaved }: any) {
  const isEditing = !!purchase;
  const [f, setF] = useState<any>({
    title: purchase?.title || "",
    description: purchase?.description || "",
    amount: purchase?.amount ?? "",
    advance: purchase?.advance ?? "",
    provider: purchase?.provider || "",
    category: purchase?.category || "",
    status: purchase?.status || "PENDIENTE",
    priority: purchase?.priority || "MEDIA",
    dueDate: purchase?.dueDate ? String(purchase.dueDate).slice(0, 10) : "",
    invoiceNumber: purchase?.invoiceNumber || "",
    invoiceDate: purchase?.invoiceDate ? String(purchase.invoiceDate).slice(0, 10) : "",
    paymentMethod: purchase?.paymentMethod || "",
    supplierId: purchase?.supplierId || "",
    assignedToId: purchase?.assignedToId || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));

  async function save() {
    if (!f.title.trim()) return toast.error("El título es requerido");
    setSaving(true);
    try {
      const url = isEditing ? `/api/purchases/${purchase.id}` : "/api/purchases";
      const method = isEditing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...f, amount: f.amount === "" ? null : f.amount, advance: f.advance === "" ? null : f.advance }),
      });
      const json = await res.json();
      if (json.success) { toast.success(isEditing ? "Compra actualizada" : "Compra creada"); onSaved(); onClose(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error al guardar"); } finally { setSaving(false); }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? "Editar Compra" : "Nueva Compra"} size="lg">
      <div className="space-y-4 p-1">
        <Input label="Título / qué se compra" value={f.title} onChange={(e) => set("title", e.target.value)} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descripción</label>
          <textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Monto (Q)" type="number" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
          <Input label="Anticipo (Q)" type="number" value={f.advance} onChange={(e) => set("advance", e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Proveedor (del catálogo)</label>
          <select value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
            <option value="">—</option>
            {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Proveedor (texto libre)" value={f.provider} onChange={(e) => set("provider", e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
            <select value={f.category} onChange={(e) => set("category", e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Estado</label>
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
              <option value="PENDIENTE">Pendiente</option>
              <option value="COMPRADO">Comprado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridad</label>
            <select value={f.priority} onChange={(e) => set("priority", e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
              <option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
            </select>
          </div>
          <Input label="Vence" type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="No. factura" value={f.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)} />
          <Input label="Fecha factura" type="date" value={f.invoiceDate} onChange={(e) => set("invoiceDate", e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pago</label>
            <select value={f.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 text-sm text-gray-900 dark:text-white">
              <option value="">—</option>
              {PAYMENT_METHODS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Asignada a</label>
          <select value={f.assignedToId} onChange={(e) => set("assignedToId", e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
            <option value="">Yo</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" onClick={save} isLoading={saving}>{isEditing ? "Guardar" : "Crear Compra"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function PurchaseDetail({ purchase, token, onClose, onChanged, onDelete, canManage, quickStatus }: any) {
  const [docs, setDocs] = useState<any[]>(purchase.documents || []);
  const [items, setItems] = useState<any[]>(purchase.items || []);
  const [kind, setKind] = useState("FACTURA");
  const [uploading, setUploading] = useState(false);
  const [ni, setNi] = useState({ description: "", quantity: "1", unitPrice: "" });

  async function loadDocs() {
    const res = await fetch(`/api/purchases/${purchase.id}/documents`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
    if (res?.success) setDocs(res.data);
  }

  async function loadItems() {
    const res = await fetch(`/api/purchases/${purchase.id}/items`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => null);
    if (res?.success) setItems(res.data);
  }

  async function addItem() {
    if (!ni.description.trim()) return toast.error("Escribí la descripción del ítem");
    const res = await fetch(`/api/purchases/${purchase.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(ni),
    }).then((r) => r.json()).catch(() => ({ success: false }));
    if (res.success) { setNi({ description: "", quantity: "1", unitPrice: "" }); loadItems(); toast.success("Ítem agregado"); }
    else toast.error("Error al agregar");
  }

  async function removeItem(itemId: string) {
    const res = await fetch(`/api/purchases/${purchase.id}/items?itemId=${itemId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ success: false }));
    if (res.success) loadItems();
  }

  const itemsTotal = items.reduce((s, it) => s + (Number(it.unitPrice || 0) * Number(it.quantity || 0)), 0);

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch(`/api/purchases/${purchase.id}/documents`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      const json = await res.json();
      if (json.success) { toast.success(json.storage === "r2" ? "Documento subido (R2)" : "Documento guardado"); loadDocs(); onChanged({ ...purchase }); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error al subir"); } finally { setUploading(false); }
  }

  async function removeDoc(id: string) {
    if (!confirm("¿Eliminar este documento?")) return;
    const res = await fetch(`/api/purchases/${purchase.id}/documents?documentId=${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ success: false }));
    if (res.success) { toast.success("Documento eliminado"); loadDocs(); } else toast.error("Error");
  }

  return (
    <Modal isOpen onClose={onClose} title={purchase.title} size="lg">
      <div className="space-y-4 p-1">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Estado</span><span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[purchase.status] || ""}`}>{STATUS_LABEL[purchase.status] || purchase.status}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Monto</span><span className="font-medium">{purchase.amount ? q2(purchase.amount) : "—"}</span></div>
          {Number(purchase.advance) > 0 && <div className="flex justify-between"><span className="text-gray-500">Anticipo</span><span>{q2(purchase.advance)}</span></div>}
          {purchase.provider && <div className="flex justify-between"><span className="text-gray-500">Proveedor</span><span>{purchase.provider}</span></div>}
          {purchase.category && <div className="flex justify-between"><span className="text-gray-500">Categoría</span><span>{purchase.category}</span></div>}
          {purchase.invoiceNumber && <div className="flex justify-between"><span className="text-gray-500">No. factura</span><span>{purchase.invoiceNumber}</span></div>}
          <div className="flex justify-between"><span className="text-gray-500">Vence</span><span>{fmt(purchase.dueDate)}</span></div>
          {purchase.description && <p className="text-xs text-gray-400 pt-1">{purchase.description}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          {purchase.status === "PENDIENTE" && <Button size="sm" variant="outline" onClick={() => quickStatus(purchase.id, "APROBADA")}>Aprobar</Button>}
          {purchase.status !== "COMPRADO" && <Button size="sm" onClick={() => quickStatus(purchase.id, "COMPRADO")}><Check className="h-3 w-3 mr-1" /> Marcar comprado</Button>}
          {purchase.status !== "CANCELADO" && <Button size="sm" variant="outline" onClick={() => quickStatus(purchase.id, "CANCELADO")}><X className="h-3 w-3 mr-1" /> Cancelar</Button>}
          {canManage && <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="h-3 w-3 mr-1" /> Eliminar</Button>}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
          <p className="font-medium text-sm text-gray-700 dark:text-gray-300">Ítems ({items.length}){itemsTotal > 0 ? ` · ${q2(itemsTotal)}` : ""}</p>
          <div className="grid grid-cols-12 gap-2">
            <input placeholder="Descripción del ítem" value={ni.description} onChange={(e) => setNi({ ...ni, description: e.target.value })} className="col-span-6 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white" />
            <input placeholder="Cant." type="number" value={ni.quantity} onChange={(e) => setNi({ ...ni, quantity: e.target.value })} className="col-span-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white" />
            <input placeholder="P. unit. Q" type="number" value={ni.unitPrice} onChange={(e) => setNi({ ...ni, unitPrice: e.target.value })} className="col-span-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white" />
            <Button size="sm" className="col-span-1" onClick={addItem}>+</Button>
          </div>
          {items.length > 0 && (
            <div className="space-y-1">
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-sm">
                  <span className="truncate">{it.quantity}× {it.description}{it.unitPrice ? ` — ${q2(Number(it.unitPrice) * Number(it.quantity))}` : ""}</span>
                  <button onClick={() => removeItem(it.id)} className="text-red-500 text-xs px-2">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-3">
          <p className="font-medium text-sm text-gray-700 dark:text-gray-300">Documentos ({docs.length})</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white">
              {Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label className="cursor-pointer text-sm text-blue-600 font-medium">
              <input type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
              <span className="inline-flex items-center gap-1"><Paperclip className="h-4 w-4" /> {uploading ? "Subiendo..." : "Adjuntar archivo"}</span>
            </label>
          </div>
          {docs.length === 0 ? (
            <p className="text-xs text-gray-400">Sin documentos. Subí la factura, recibo o comprobante.</p>
          ) : (
            <div className="space-y-2">
              {docs.map((d: any) => (
                <div key={d.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2">
                  <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 min-w-0">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{DOC_KINDS[d.kind] || d.kind} · {d.fileName}</span>
                  </a>
                  <button onClick={() => removeDoc(d.id)} className="text-red-500 text-xs px-2"><Trash2 className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SuppliersModal({ isOpen, onClose, token, suppliers, onChanged }: any) {
  const [f, setF] = useState({ name: "", contactName: "", phone: "", nit: "", notes: "" });
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!f.name.trim()) return toast.error("Nombre requerido");
    setSaving(true);
    try {
      const res = await fetch("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(f),
      });
      const json = await res.json();
      if (json.success) { toast.success("Proveedor agregado"); setF({ name: "", contactName: "", phone: "", nit: "", notes: "" }); onChanged(); }
      else toast.error(json.error || "Error");
    } finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm("¿Eliminar proveedor?")) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({ success: false }));
    if (res.success) { toast.success("Proveedor eliminado"); onChanged(); } else toast.error("Error");
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Proveedores" size="lg">
      <div className="space-y-4 p-1">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input label="Contacto" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Teléfono" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Input label="NIT" value={f.nit} onChange={(e) => setF({ ...f, nit: e.target.value })} />
        </div>
        <Button variant="primary" onClick={add} isLoading={saving} className="w-full"><Plus className="h-4 w-4 mr-1" /> Agregar proveedor</Button>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <p className="text-sm font-medium mb-2">Catálogo ({suppliers.length})</p>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {suppliers.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded p-2 text-sm">
                <span>{s.name}{s.contactName ? ` · ${s.contactName}` : ""}{s.phone ? ` · ${s.phone}` : ""}</span>
                <button onClick={() => del(s.id)} className="text-red-500 text-xs px-2">✕</button>
              </div>
            ))}
            {suppliers.length === 0 && <p className="text-xs text-gray-400">Sin proveedores. Agregá el primero arriba.</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
