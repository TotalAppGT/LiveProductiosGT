"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, Plus, Trash2, CheckCircle2, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const STATUS_LABELS: Record<string, string> = {
  EN_REVISION: "En revisión",
  EN_REPARACION: "En reparación",
  REPARADO: "Reparado",
  DESCARTADO: "Descartado",
};

const STATUS_COLORS: Record<string, string> = {
  EN_REVISION: "bg-yellow-100 text-yellow-700",
  EN_REPARACION: "bg-orange-100 text-orange-700",
  REPARADO: "bg-green-100 text-green-700",
  DESCARTADO: "bg-red-100 text-red-700",
};

export default function TallerPage() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("AUDIO");
  const [issue, setIssue] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [saving, setSaving] = useState(false);

  const isAdmin = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [wRes, uRes] = await Promise.all([
        fetch("/api/workshop", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const wJson = await wRes.json();
      const uJson = await uRes.json();
      if (wJson.success) setItems(wJson.data);
      if (Array.isArray(uJson)) setUsers(uJson);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function addItem() {
    if (!itemName.trim() || !issue.trim()) return toast.error("Nombre y problema requeridos");
    setSaving(true);
    try {
      const res = await fetch("/api/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemName, category, issue, assignedToId }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Item enviado a taller");
        setShowAdd(false);
        setItemName("");
        setIssue("");
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al crear");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/workshop/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Estado: ${STATUS_LABELS[status]}`);
        fetchData();
      }
    } catch {
      toast.error("Error al actualizar");
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("¿Eliminar este item del taller?")) return;
    await fetch(`/api/workshop/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchData();
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wrench className="w-6 h-6" /> Taller
        </h1>
        {isAdmin && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1" /> Enviar a Taller
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {items.map((item: any) => (
          <Card key={item.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[item.status] || "bg-gray-100"}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{item.category}</span>
                </div>
                <h3 className="font-semibold mt-2">{item.itemName}</h3>
                <p className="text-sm text-gray-600 mt-1">🔴 Problema: {item.issue}</p>
                {item.diagnostic && <p className="text-sm text-gray-600 mt-1">🔍 Diagnóstico: {item.diagnostic}</p>}
                {item.assignedTo && <p className="text-xs text-gray-400 mt-1">👤 Encargado: {item.assignedTo.name}</p>}
              </div>
              <div className="flex gap-1">
                {isAdmin && item.status !== "REPARADO" && (
                  <Button variant="ghost" size="sm" onClick={() => updateStatus(item.id, "REPARADO")} title="Marcar reparado">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </Button>
                )}
                {isAdmin && (
                  <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)} title="Eliminar">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && (
          <p className="text-center text-gray-400 py-8">No hay items en el taller. Los productos dañados o en revisión aparecerán aquí.</p>
        )}
      </div>

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Enviar a Taller">
        <div className="space-y-3 p-1">
          <Input label="Nombre del item" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Ej: Bocina QSC K12" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="AUDIO">Audio</option>
              <option value="ILUMINACION">Iluminación</option>
              <option value="INSTRUMENTO">Instrumento</option>
              <option value="CABLEADO">Cableado</option>
              <option value="MOBILIARIO">Mobiliario</option>
              <option value="HERRAMIENTA">Herramienta</option>
              <option value="OTRO">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Problema</label>
            <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Describe el problema" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Encargado</label>
            <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">Sin asignar</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancelar</Button>
            <Button onClick={addItem} isLoading={saving}>Enviar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
