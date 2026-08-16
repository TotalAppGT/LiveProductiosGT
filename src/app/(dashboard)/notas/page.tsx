"use client";

import { useState, useEffect, useCallback } from "react";
import { NotebookPen, Plus, StickyNote, HelpCircle, Trash2, Pencil, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

export default function NotasPage() {
  const { user, token } = useAuth();
  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"TODAS" | "NOTA" | "DUDA">("TODAS");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("NOTA");
  const [saving, setSaving] = useState(false);

  const fetchNotes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/notes", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setNotes(json.data);
    } catch {
      toast.error("Error al cargar notas");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  async function saveNote() {
    if (!content.trim()) return toast.error("Escribe algo en tu nota");
    setSaving(true);
    try {
      const url = editing ? `/api/notes/${editing.id}` : "/api/notes";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, content, type }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editing ? "Nota actualizada" : "Nota guardada");
        setShowModal(false);
        setEditing(null);
        setTitle("");
        setContent("");
        setType("NOTA");
        fetchNotes();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNote(id: string) {
    if (!confirm("¿Eliminar esta nota?")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    fetchNotes();
  }

  const filtered = notes.filter((n) => filter === "TODAS" || n.type === filter);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <NotebookPen className="w-6 h-6" /> Mis Notas y Dudas
        </h1>
        <Button onClick={() => { setEditing(null); setTitle(""); setContent(""); setType("NOTA"); setShowModal(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nueva Nota
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        {[{ value: "TODAS", label: "Todas" }, { value: "NOTA", label: "📝 Notas" }, { value: "DUDA", label: "❓ Dudas" }].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value as any)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === f.value ? "border-blue-500 text-blue-700 bg-blue-50" : "border-gray-200 text-gray-600"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((n) => (
          <Card key={n.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {n.type === "DUDA" ? <HelpCircle className="w-4 h-4 text-orange-500" /> : <StickyNote className="w-4 h-4 text-blue-500" />}
                <span className="text-xs text-gray-400">{n.type === "DUDA" ? "Duda" : "Nota"}</span>
                <span className="text-xs text-gray-400">{new Date(n.updatedAt).toLocaleDateString("es-GT", { day: "numeric", month: "short" })}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(n); setTitle(n.title); setContent(n.content); setType(n.type); setShowModal(true); }} className="text-gray-400 hover:text-blue-500">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => deleteNote(n.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {n.title && <h3 className="font-semibold mt-2">{n.title}</h3>}
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">{n.content}</p>
          </Card>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 py-8 col-span-full">No tienes notas. Crea la primera con "Nueva Nota".</p>
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? "Editar Nota" : "Nueva Nota"}>
        <div className="space-y-3 p-1">
          <Input label="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Idea, pendiente, duda..." />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
              <option value="NOTA">📝 Nota personal</option>
              <option value="DUDA">❓ Duda</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Contenido</label>
            <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500" placeholder="Escribe tu nota o duda..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={saveNote} isLoading={saving}>Guardar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
