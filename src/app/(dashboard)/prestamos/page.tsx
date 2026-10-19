"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ArrowRightLeft, Plus, Search, X, Camera } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

function fmt(v?: string | null) {
  return v ? new Date(v).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export default function PrestamosPage() {
  const { token } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [quantity, setQuantity] = useState("1");
  const [borrowerName, setBorrowerName] = useState("");
  const [borrowerId, setBorrowerId] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [returnLoan, setReturnLoan] = useState<any>(null);
  const [condition, setCondition] = useState<"BUENO" | "DANADO" | "PERDIDO">("BUENO");
  const [returnPhotos, setReturnPhotos] = useState<string[]>([]);
  const [returnNotes, setReturnNotes] = useState("");

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [lRes, iRes, uRes] = await Promise.all([
        fetch("/api/loans", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/inventory?status=DISPONIBLE&limit=500", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/users/list", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [lJson, iJson, uJson] = await Promise.all([lRes.json(), iRes.json(), uRes.json()]);
      if (lJson.success) setLoans(lJson.data || []);
      if (iJson.success) setInventory(iJson.data || []);
      if (Array.isArray(uJson)) setUsers(uJson);
    } catch {
      toast.error("Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? inventory.filter((i: any) => (i.name || "").toLowerCase().includes(q)) : inventory).slice(0, 40);
  }, [inventory, search]);

  const active = loans.filter((l) => l.status === "PRESTADO");
  const history = loans.filter((l) => l.status !== "PRESTADO");

  async function uploadFiles(files: FileList | null, setter: (fn: (p: string[]) => string[]) => void) {
    if (!files || files.length === 0) return;
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/files/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (json.success) urls.push(json.data.fileUrl);
    }
    setter((prev) => [...prev, ...urls]);
  }

  function resetNew() {
    setSelected(null);
    setSearch("");
    setQuantity("1");
    setBorrowerName("");
    setBorrowerId("");
    setExpectedReturn("");
    setPhotos([]);
    setNotes("");
  }

  async function createLoan() {
    if (!selected) return toast.error("Seleccioná un ítem");
    if (!borrowerName.trim()) return toast.error("Indicá a quién se le presta");
    setSaving(true);
    try {
      const res = await fetch("/api/loans", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          inventoryItemId: selected.id,
          quantity: Number(quantity) || 1,
          borrowerName: borrowerName.trim(),
          borrowerId: borrowerId || null,
          expectedReturn: expectedReturn || null,
          photos,
          notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Préstamo registrado");
        setShowNew(false);
        resetNew();
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al registrar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmReturn() {
    if (!returnLoan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/loans/${returnLoan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ condition, photos: returnPhotos, notes: returnNotes.trim() || null }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Préstamo cerrado");
        setReturnLoan(null);
        setCondition("BUENO");
        setReturnPhotos([]);
        setReturnNotes("");
        fetchData();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al cerrar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ArrowRightLeft className="w-6 h-6" /> Préstamos
        </h1>
        <Button onClick={() => { resetNew(); setShowNew(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo préstamo
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Ítem, cantidad, a quién se presta y foto. Al regresar: buen estado → inventario, malo → taller, no vino → pérdida (con aprobación).
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <Card className="p-3"><p className="text-xs text-gray-500">Activos</p><p className="text-2xl font-bold">{active.length}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Devueltos</p><p className="text-2xl font-bold text-green-600">{history.filter((l) => l.status === "DEVUELTO").length}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Con incidencia</p><p className="text-2xl font-bold text-red-600">{history.filter((l) => l.status === "PERDIDO" || l.status === "DANADO").length}</p></Card>
      </div>

      <h2 className="font-semibold mb-3">Activos</h2>
      <div className="grid gap-3 mb-8">
        {active.map((loan: any) => (
          <Card key={loan.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h3 className="font-semibold">{loan.itemName} <span className="text-sm text-gray-500">({loan.quantity} u)</span></h3>
                <p className="text-sm text-gray-600">👤 {loan.borrowerName}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Prestado: {fmt(loan.loanedAt)} · Devolución esperada: {fmt(loan.expectedReturn)}
                  {loan.inventoryItem?.section ? ` · ${loan.inventoryItem.section}` : ""}
                </p>
                {loan.notes && <p className="text-xs text-gray-500 mt-1">📝 {loan.notes}</p>}
                {(loan.photos || []).length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {loan.photos.map((p: string, i: number) => (
                      <a key={i} href={p} target="_blank" rel="noreferrer">
                        <img src={p} alt="préstamo" className="w-14 h-14 object-cover rounded border" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="success" onClick={() => { setReturnLoan(loan); setCondition("BUENO"); setReturnPhotos([]); setReturnNotes(""); }}>
                Devolver
              </Button>
            </div>
          </Card>
        ))}
        {active.length === 0 && <p className="text-center text-gray-400 py-6">No hay préstamos activos.</p>}
      </div>

      <h2 className="font-semibold mb-3">Historial</h2>
      <div className="grid gap-3">
        {history.map((loan: any) => (
          <Card key={loan.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${loan.status === "DEVUELTO" ? "bg-green-100 text-green-700" : loan.status === "DANADO" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                    {loan.status === "DEVUELTO" ? "Devuelto" : loan.status === "DANADO" ? "Devuelto dañado" : "Pérdida"}
                  </span>
                  <span className="text-xs text-gray-500">{loan.quantity} u</span>
                </div>
                <h3 className="font-semibold mt-1">{loan.itemName}</h3>
                <p className="text-xs text-gray-400">
                  👤 {loan.borrowerName} · Salió {fmt(loan.loanedAt)} · Cerró {fmt(loan.returnedAt)}
                </p>
              </div>
              {(loan.returnPhotos || []).length > 0 && (
                <div className="flex gap-1">
                  {loan.returnPhotos.map((p: string, i: number) => (
                    <a key={i} href={p} target="_blank" rel="noreferrer">
                      <img src={p} alt="devolución" className="w-12 h-12 object-cover rounded border" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ))}
        {history.length === 0 && <p className="text-center text-gray-400 py-6">Aún no hay devoluciones.</p>}
      </div>

      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Nuevo préstamo">
        <div className="space-y-3 p-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ítem</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setSelected(null); }} placeholder="Buscar..." className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm" />
            </div>
            {selected ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border bg-blue-50 px-3 py-2 text-sm">
                <span>{selected.name} <span className="text-gray-500">({selected.section || "—"}) · {selected.quantity} u</span></span>
                <button onClick={() => setSelected(null)}><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border divide-y">
                {filteredInventory.map((inv: any) => (
                  <button key={inv.id} onClick={() => { setSelected(inv); setQuantity("1"); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                    {inv.name} <span className="text-xs text-gray-400">· {inv.quantity} u · {inv.warehouse || "—"}</span>
                  </button>
                ))}
                {filteredInventory.length === 0 && <p className="px-3 py-3 text-sm text-gray-400">Sin resultados.</p>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Cantidad" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Devolución esperada</label>
              <input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Persona que recibe</label>
            <select
              value={borrowerId}
              onChange={(e) => {
                const u = users.find((x: any) => x.id === e.target.value);
                setBorrowerId(e.target.value);
                if (u) setBorrowerName(u.name);
              }}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-2"
            >
              <option value="">Seleccionar del personal...</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <Input value={borrowerName} onChange={(e) => setBorrowerName(e.target.value)} placeholder="O escribí el nombre" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Accesorios, motivo, observaciones..." />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Foto del préstamo</label>
            <input type="file" accept="image/*" multiple onChange={(e) => uploadFiles(e.target.files, setPhotos)} className="text-sm" />
            {photos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt="préstamo" className="w-16 h-16 object-cover rounded border" />
                    <button onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={createLoan} isLoading={saving}>Registrar préstamo</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!returnLoan} onClose={() => setReturnLoan(null)} title="Devolución de préstamo">
        <div className="space-y-3 p-1">
          <div className="rounded-lg bg-gray-50 border px-3 py-2 text-sm">
            <strong>{returnLoan?.itemName}</strong> ({returnLoan?.quantity} u) · {returnLoan?.borrowerName}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">¿Cómo vino?</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["BUENO", "✅ Buen estado", "bg-green-500"],
                ["DANADO", "🔧 Vino malo", "bg-orange-500"],
                ["PERDIDO", "❌ No vino", "bg-red-500"],
              ].map(([k, l, c]) => (
                <button key={k} onClick={() => setCondition(k as any)} className={`px-2 py-2 rounded-lg text-xs font-bold ${condition === k ? `${c} text-white` : "bg-gray-200 text-gray-700"}`}>
                  {l}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {condition === "BUENO" ? "Vuelve a inventario." : condition === "DANADO" ? "Genera solicitud de taller (aprobación admin)." : "Genera solicitud de pérdida (aprobación admin)."}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Observaciones de la devolución..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Foto de devolución</label>
            <input type="file" accept="image/*" multiple onChange={(e) => uploadFiles(e.target.files, setReturnPhotos)} className="text-sm" />
            {returnPhotos.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {returnPhotos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p} alt="devolución" className="w-16 h-16 object-cover rounded border" />
                    <button onClick={() => setReturnPhotos((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 bg-white rounded-full border p-0.5"><X className="w-3 h-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setReturnLoan(null)}>Cancelar</Button>
            <Button variant={condition === "BUENO" ? "success" : "danger"} onClick={confirmReturn} isLoading={saving}>
              <Camera className="w-4 h-4 mr-1" /> Confirmar devolución
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
