"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  Download,
  Pencil,
  Trash2,
  Filter,
  ChevronDown,
  ChevronUp,
  Upload,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Badge, inventoryStatusLabel, inventoryStatusColor } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, cn } from "@/lib/utils";
import { WAREHOUSES, INVENTORY_SECTIONS } from "@/lib/inventory";
import type { InventoryItem, ApiResponse, PaginatedResponse } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  AUDIO: "Audio",
  ILUMINACION: "Iluminación",
  INSTRUMENTO: "Instrumento",
  CABLEADO: "Cableado",
  MOBILIARIO: "Mobiliario",
  HERRAMIENTA: "Herramienta",
  CONSUMIBLE: "Consumible",
  OTRO: "Otro",
};

const LOCATION_LABELS: Record<string, string> = {
  BODEGA_ELGIN: "Bodega Elgin",
  BODEGA_PP: "Bodega PP",
  EN_EVENTO: "En Evento",
  EN_RENTA: "En Renta",
};

export default function InventarioPage() {
  const { user, token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"append" | "replace" | "merge">("merge");
  const [importing, setImporting] = useState(false);
  const [showLogistics, setShowLogistics] = useState(false);
  const [movements, setMovements] = useState<any[]>([]);
  const [mov, setMov] = useState({ inventoryItemId: "", type: "TRANSFERENCIA", fromWarehouse: "Bodega Elgin", toWarehouse: "Bodega PP", quantity: "", note: "" });
  const [savingMov, setSavingMov] = useState(false);
  const [byWarehouse, setByWarehouse] = useState<any[]>([]);
  const [showAlign, setShowAlign] = useState(false);
  const [alignGroups, setAlignGroups] = useState<any[]>([]);
  const [alignLoading, setAlignLoading] = useState(false);
  const [alignChoice, setAlignChoice] = useState<Record<number, string>>({});
  const [alignName, setAlignName] = useState<Record<number, string>>({});
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcileData, setReconcileData] = useState<any | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [reconcileName, setReconcileNameState] = useState<Record<string, string>>({});
  const [reconcilePick, setReconcilePickState] = useState<Record<string, string>>({});
  const [reconcileSearch, setReconcileSearch] = useState("");
  const [showNeeds, setShowNeeds] = useState(false);
  const [needsDays, setNeedsDays] = useState(30);
  const [needs, setNeeds] = useState<any[]>([]);
  const [needsLoading, setNeedsLoading] = useState(false);
  const [needsEdits, setNeedsEdits] = useState<Record<string, { action: string; comment: string }>>({});
  const [needsSaving, setNeedsSaving] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportStatus, setReportStatus] = useState("ALL");
  const [reportWarehouse, setReportWarehouse] = useState("");
  const [reportSection, setReportSection] = useState("");

  async function downloadInventoryReport(format: "xlsx" | "pdf") {
    try {
      toast.loading("Generando reporte…", { id: "inrep" });
      const qs = new URLSearchParams({ format, status: reportStatus });
      if (reportWarehouse) qs.set("warehouse", reportWarehouse);
      if (reportSection) qs.set("section", reportSection);
      const res = await fetch(`/api/inventory/report?${qs.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar", { id: "inrep" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventario-${reportStatus.toLowerCase()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Reporte descargado", { id: "inrep" });
    } catch {
      toast.error("Error al descargar", { id: "inrep" });
    }
  }

  const loadByWarehouse = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/inventory/by-warehouse", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setByWarehouse(json.data);
    } catch {
      // silencioso
    }
  }, [token]);

  const loadAlign = useCallback(async () => {
    setAlignLoading(true);
    try {
      const res = await fetch("/api/inventory/align", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) { setAlignGroups(json.data); setAlignChoice({}); }
    } catch {
      // silencioso
    } finally {
      setAlignLoading(false);
    }
  }, [token]);

  async function mergeGroup(gi: number, group: any[], opts?: { silent?: boolean }) {
    const canonicalId = alignChoice[gi] || group[0].id;
    const mergeIds = group.map((g) => g.id);
    const sel = group.find((g) => g.id === canonicalId) || group[0];
    const newName = (alignName[gi] ?? sel.name)?.trim() || sel.name;
    if (!opts?.silent && !confirm(`¿Alinear en "${newName}"? Se suman cantidades, se reasignan cuadros/movimientos y se borran los duplicados.`)) return;
    const res = await fetch("/api/inventory/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ canonicalId, mergeIds, newName }),
    });
    const json = await res.json();
    if (json.success) { if (!opts?.silent) { toast.success(json.message); loadAlign(); fetchItems(); loadByWarehouse(); } return true; }
    toast.error(json.error || "Error");
    return false;
  }

  async function mergeAll() {
    if (!confirm(`¿Alinear TODOS los grupos (${alignGroups.length})? En cada grupo se conserva el nombre más completo/editable. Esta acción no se puede deshacer.`)) return;
    let n = 0;
    for (let gi = 0; gi < alignGroups.length; gi++) {
      const group = alignGroups[gi];
      // Elige como canónico el ítem con el nombre más largo (más descriptivo) si no se eligió otro.
      const longest = [...group].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0))[0];
      const cid = alignChoice[gi] || longest.id;
      const sel = group.find((g: any) => g.id === cid) || longest;
      const nm = (alignName[gi] ?? sel.name)?.trim() || sel.name;
      const ok = await fetch("/api/inventory/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ canonicalId: cid, mergeIds: group.map((g: any) => g.id), newName: nm }),
      }).then((r) => r.json()).then((j) => j.success).catch(() => false);
      if (ok) n++;
    }
    toast.success(`Alineados ${n} grupos`);
    loadAlign(); fetchItems(); loadByWarehouse();
  }

  function pickCanonical(gi: number, group: any[], id: string) {
    const it = group.find((g) => g.id === id);
    setAlignChoice({ ...alignChoice, [gi]: id });
    setAlignName({ ...alignName, [gi]: it?.name || "" });
  }

  const loadMovements = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/inventory/movements?limit=50", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setMovements(json.data);
    } catch {
      // silencioso
    }
  }, [token]);

  async function downloadMovements() {
    try {
      const res = await fetch("/api/inventory/movements/report?days=90", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "movimientos.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Error al descargar");
    }
  }

  async function saveMovement() {
    if (!mov.inventoryItemId) return toast.error("Elegí un ítem");
    setSavingMov(true);
    try {
      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(mov),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Movimiento registrado");
        setMov({ ...mov, inventoryItemId: "", quantity: "", note: "" });
        loadMovements();
        fetchItems();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al registrar");
    } finally {
      setSavingMov(false);
    }
  }

  async function runImport() {
    if (!importFile) return toast.error("Seleccioná un archivo");
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      fd.append("mode", importMode);
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message || "Importado");
        setShowImportModal(false);
        setImportFile(null);
        fetchItems();
      } else {
        toast.error(json.error || "Error");
      }
    } catch {
      toast.error("Error al importar");
    } finally {
      setImporting(false);
    }
  }

  const fetchItems = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (categoryFilter) params.set("category", categoryFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (locationFilter) params.set("location", locationFilter);
      if (search) params.set("search", search);
      params.set("limit", "1000");
      const res = await fetch(`/api/inventory?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Error al cargar inventario");
      const json: PaginatedResponse<InventoryItem> = await res.json();
      if (json.success) {
        setItems(json.data);
      } else {
        setItems([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [token, categoryFilter, statusFilter, locationFilter, search]);

  useEffect(() => {
    fetchItems();
    loadByWarehouse();
  }, [fetchItems, loadByWarehouse]);

  const stats = {
    total: items.length,
    disponible: items.filter((i) => i.status === "DISPONIBLE").length,
    asignado: items.filter((i) => i.status === "ASIGNADO").length,
    reparacion: items.filter((i) => i.status === "EN_REPARACION").length,
    danado: items.filter((i) => i.status === "DANADO" || i.status === "PERDIDO").length,
  };

  const damagedItems = items.filter(
    (i) => i.status === "DANADO" || i.status === "PERDIDO"
  );

  const sections = Array.from(new Set(items.map((i) => i.section).filter(Boolean) as string[])).sort();
  const displayItems = sectionFilter ? items.filter((i) => (i.section || "") === sectionFilter) : items;
  const grouped: { section: string; rows: InventoryItem[] }[] = (() => {
    const map = new Map<string, InventoryItem[]>();
    for (const it of displayItems) {
      const s = it.section || "Sin sección";
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(it);
    }
    return Array.from(map.entries())
      .map(([section, rows]) => ({ section, rows }))
      .sort((a, b) => a.section.localeCompare(b.section));
  })();

  async function deleteItem(id: string) {
    if (!confirm("¿Estás seguro de eliminar este ítem?")) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast.success("Ítem eliminado");
        fetchItems();
      }
    } catch {
      toast.error("Error al eliminar");
    }
  }

  function setReconcileName(key: string, name: string) {
    setReconcileNameState((s) => ({ ...s, [key]: name }));
  }
  function setReconcilePick(key: string, id: string) {
    setReconcilePickState((s) => ({ ...s, [key]: id }));
  }

  // Aplica el nombre final elegido al INVENTARIO y a los CUADROS a la vez.
  async function applyCanonical(d: any, inventoryItemId: string) {
    const newName = (reconcileName[d.key] ?? d.name)?.trim();
    if (!newName) return toast.error("Escribí un nombre final");
    if (!confirm(`¿Quedarnos con la descripción:\n\n"${newName}"\n\nSe renombrará el INVENTARIO y los CUADROS con ese nombre (quedarán iguales). ¿Continuar?`)) return;
    try {
      const res = await fetch("/api/inventory/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderItemName: d.key, inventoryItemId, newName }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Alineado a "${json.name}" en ${json.updated} ítem(s) de cuadros`);
        loadReconcile();
        fetchItems();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al alinear");
    }
  }

  // Crea el ítem en el inventario y lo vincula a los cuadros.
  async function createMissing(d: any) {
    const newName = (reconcileName[d.key] ?? d.name)?.trim();
    if (!newName) return toast.error("Escribí un nombre para el inventario");
    if (!confirm(`Se agregará al inventario con la descripción:\n\n"${newName}"\n\nY los ítems de los CUADROS se renombrarán igual. ¿Continuar?`)) return;
    try {
      const res = await fetch("/api/inventory/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ orderItemName: d.key, create: true, newName, category: d.category || "OTRO", quantity: d.quantity || 1 }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Agregado al inventario como "${json.name}" (${json.updated} cuadro/s)`);
        loadReconcile();
        fetchItems();
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al agregar al inventario");
    }
  }

  async function downloadReconcileReport(format: "xlsx" | "pdf") {
    try {
      toast.loading("Generando listado…", { id: "rec" });
      const res = await fetch(`/api/inventory/reconcile/report?format=${format}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar", { id: "rec" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `cotejo-inventario.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Listado descargado", { id: "rec" });
    } catch { toast.error("Error al descargar", { id: "rec" }); }
  }

  async function loadReconcile() {
    setReconcileLoading(true);
    try {
      const res = await fetch("/api/inventory/reconcile", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) {
        setReconcileData(json.data);
        const names: Record<string, string> = {};
        const picks: Record<string, string> = {};
        for (const d of json.data.discrepancies || []) {
          names[d.key] = d.name;
          if (d.linked?.[0]) picks[d.key] = d.linked[0].id;
          else if (d.suggestions?.[0]) picks[d.key] = d.suggestions[0].id;
        }
        setReconcileNameState(names);
        setReconcilePickState(picks);
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al cotejar");
    } finally {
      setReconcileLoading(false);
    }
  }

  async function loadNeeds(days = needsDays) {
    setNeedsLoading(true);
    try {
      const res = await fetch(`/api/inventory/needs?days=${days}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) {
        setNeeds(json.data.items);
        const e: Record<string, { action: string; comment: string }> = {};
        for (const it of json.data.items) e[it.key] = { action: it.action, comment: it.comment || "" };
        setNeedsEdits(e);
      } else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al cargar faltantes");
    } finally {
      setNeedsLoading(false);
    }
  }

  function setNeedEdit(key: string, patch: Partial<{ action: string; comment: string }>) {
    setNeedsEdits((s) => ({ ...s, [key]: { ...(s[key] || { action: "CONSULTAR", comment: "" }), ...patch } }));
  }

  async function saveAllNeeds() {
    setNeedsSaving(true);
    try {
      for (const it of needs) {
        const ed = needsEdits[it.key] || { action: it.action, comment: it.comment || "" };
        await fetch("/api/inventory/needs", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ itemKey: it.key, itemName: it.name, action: ed.action, comment: ed.comment }),
        });
      }
      toast.success("Listado guardado");
      loadNeeds();
    } catch {
      toast.error("Error al guardar");
    } finally {
      setNeedsSaving(false);
    }
  }

  async function downloadNeeds(format: "xlsx" | "pdf") {
    try {
      toast.loading("Generando…", { id: "need" });
      const res = await fetch(`/api/inventory/needs/report?format=${format}&days=${needsDays}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { toast.error("Error al generar", { id: "need" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `faltantes-${needsDays}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Descargado", { id: "need" });
    } catch {
      toast.error("Error al descargar", { id: "need" });
    }
  }



  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Inventario</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Gestiona el equipo y materiales
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setShowImportModal(true)}>
            Importar
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowLogistics(true); loadMovements(); }}>
            🚚 Logística
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowAlign(true); loadAlign(); }}>
            🔎 Alinear
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowReconcile(true); loadReconcile(); }}>
            🧩 Cotejar cuadros
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowNeeds(true); loadNeeds(); }}>
            🧾 Faltantes
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowReport(true)}>
            📊 Reportes
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />}>
            Exportar
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAddModal(true)}
          >
            Agregar Ítem
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats.total, color: "bg-blue-500/10 text-blue-400" },
          { label: "Disponibles", value: stats.disponible, color: "bg-green-500/10 text-green-400" },
          { label: "Asignados", value: stats.asignado, color: "bg-yellow-500/10 text-yellow-400" },
          { label: "En Reparación", value: stats.reparacion, color: "bg-purple-500/10 text-purple-400" },
          { label: "Dañados/Perdidos", value: stats.danado, color: "bg-red-500/10 text-red-400" },
        ].map((stat) => (
          <Card key={stat.label} variant="bordered" className="p-3 text-center">
            <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</p>
          </Card>
        ))}
      </div>

      {byWarehouse.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">🏢 Stock por bodega</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {byWarehouse.map((w) => (
              <Card key={w.warehouse} variant="bordered" className="p-3">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{w.warehouse}</p>
                  <span className="text-xs text-gray-400">{w.items} ítems</span>
                </div>
                <p className="text-2xl font-bold mt-1">{w.units} <span className="text-sm font-normal text-gray-400">unidades</span></p>
                <p className="text-xs text-gray-500 mt-0.5">✅ {w.available} disponibles · 🔧 {w.repair} en reparación</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {damagedItems.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h3 className="font-semibold text-red-700 dark:text-red-400">
              Alertas de Equipo ({damagedItems.length})
            </h3>
          </div>
          <div className="space-y-2">
            {damagedItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-red-600 dark:text-red-300">
                  {item.name} - {inventoryStatusLabel(item.status)}
                </span>
                <Badge size="sm" color={inventoryStatusColor(item.status)}>
                  {inventoryStatusLabel(item.status)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar ítems..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Filter className="h-4 w-4" />}
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
          >
            Filtros
          </Button>
          <div className="hidden sm:flex gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los estados</option>
              <option value="DISPONIBLE">Disponible</option>
              <option value="ASIGNADO">Asignado</option>
              <option value="EN_REPARACION">En Reparación</option>
              <option value="DANADO">Dañado</option>
              <option value="PERDIDO">Perdido</option>
            </select>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las ubicaciones</option>
              {Object.entries(LOCATION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las secciones</option>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="sm:hidden grid grid-cols-1 gap-3 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las categorías</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="DISPONIBLE">Disponible</option>
            <option value="ASIGNADO">Asignado</option>
            <option value="EN_REPARACION">En Reparación</option>
            <option value="DANADO">Dañado</option>
            <option value="PERDIDO">Perdido</option>
          </select>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las ubicaciones</option>
            {Object.entries(LOCATION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner text="Cargando inventario..." />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <Button variant="outline" onClick={fetchItems}>Reintentar</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package className="h-16 w-16" />}
          title="Inventario vacío"
          description="No hay ítems registrados en el inventario."
          action={{ label: "Agregar Ítem", onClick: () => setShowAddModal(true) }}
        />
      ) : (
        <>
          <Card variant="bordered" className="overflow-hidden hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cant.</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ubicación</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Asignado</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {grouped.map((grp) => (
                  <Fragment key={grp.section}>
                  <tr className="bg-gray-100 dark:bg-gray-800/70">
                    <td colSpan={7} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      {grp.section} <span className="text-gray-400 font-normal">({grp.rows.length})</span>
                    </td>
                  </tr>
                  {grp.rows.map((item) => (
                  <tr
                    key={item.id}
                    className={cn(
                      "hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
                      (item.status === "DANADO" || item.status === "PERDIDO") &&
                        "bg-red-50/50 dark:bg-red-900/5"
                    )}
                  >
                    <td className="px-4 py-3">
                      <div>
                        {item.section && (
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">{item.section}</p>
                        )}
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </p>
                        {item.serialNumber && (
                          <p className="text-xs text-gray-400">SN: {item.serialNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-900 dark:text-white font-medium">
                        {item.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge size="sm" color={inventoryStatusColor(item.status)}>
                        {inventoryStatusLabel(item.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {LOCATION_LABELS[item.location] || item.location}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {item.assignedTo?.name || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingItem(item)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteItem(item.id)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="md:hidden space-y-3">
          {grouped.map((grp) => (
            <div key={grp.section} className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500 px-1 pt-2">{grp.section} ({grp.rows.length})</p>
              {grp.rows.map((item) => (
            <Card
              key={item.id}
              variant="bordered"
              className={cn(
                "p-4",
                (item.status === "DANADO" || item.status === "PERDIDO") && "bg-red-50/50 dark:bg-red-900/5"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  {item.section && (
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{item.section}</p>
                  )}
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</p>
                  {item.serialNumber && (
                    <p className="text-xs text-gray-400">SN: {item.serialNumber}</p>
                  )}
                </div>
                <Badge size="sm" color={inventoryStatusColor(item.status)}>
                  {inventoryStatusLabel(item.status)}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-xs text-gray-500">Categoría</span>
                  <p className="text-gray-700 dark:text-gray-300">{CATEGORY_LABELS[item.category] || item.category}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Cantidad</span>
                  <p className="text-gray-700 dark:text-gray-300 font-medium">{item.quantity}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Ubicación</span>
                  <p className="text-gray-700 dark:text-gray-300">{LOCATION_LABELS[item.location] || item.location}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Asignado</span>
                  <p className="text-gray-700 dark:text-gray-300">{item.assignedTo?.name || "-"}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <Button variant="ghost" size="sm" onClick={() => setEditingItem(item)} title="Editar">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteItem(item.id)} title="Eliminar">
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </Card>
              ))}
            </div>
          ))}
        </div>
      </>
      )}

      <Modal isOpen={showImportModal} onClose={() => setShowImportModal(false)} title="Importar inventario" size="lg">
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Subí el Excel/CSV del inventario (mismo formato: <b>sección</b> + <b>cantidad</b> + <b>ítem</b>).
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 p-2"
          />
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={importMode === "merge"} onChange={() => setImportMode("merge")} />
              Sumar / agregar por nombre (no borra)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={importMode === "append"} onChange={() => setImportMode("append")} />
              Agregar como filas nuevas
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={importMode === "replace"} onChange={() => setImportMode("replace")} />
              Reemplazar todo
            </label>
          </div>
          {importMode === "merge" && (
            <p className="text-xs text-gray-500">Si el ítem ya existe (por nombre) se <b>suma</b> la cantidad; si es nuevo, se crea.</p>
          )}
          {importMode === "replace" && (
            <p className="text-xs text-red-500">⚠️ Se borrará el inventario actual y se cargará el del archivo.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowImportModal(false)}>Cancelar</Button>
            <Button onClick={runImport} isLoading={importing} disabled={!importFile}>Importar</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showLogistics} onClose={() => setShowLogistics(false)} title="Logística / Movimientos" size="lg">
        <div className="space-y-4 p-1">
          <p className="text-xs text-gray-500">Registrá entradas, salidas o transferencias entre bodegas. Al transferir, el ítem cambia de bodega.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Ítem</label>
              <select value={mov.inventoryItemId} onChange={(e) => setMov({ ...mov, inventoryItemId: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
                <option value="">Seleccionar ítem…</option>
                {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Tipo</label>
              <select value={mov.type} onChange={(e) => setMov({ ...mov, type: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="ENTRADA">Entrada</option>
                <option value="SALIDA">Salida</option>
                <option value="AJUSTE">Ajuste</option>
              </select>
            </div>
            <Input label="Cantidad" type="number" value={mov.quantity} onChange={(e) => setMov({ ...mov, quantity: e.target.value })} />
            <div>
              <label className="block text-xs font-medium mb-1">Desde</label>
              <select value={mov.fromWarehouse} onChange={(e) => setMov({ ...mov, fromWarehouse: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
                {WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Hacia</label>
              <select value={mov.toWarehouse} onChange={(e) => setMov({ ...mov, toWarehouse: e.target.value })} className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white">
                {WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Input label="Nota" value={mov.note} onChange={(e) => setMov({ ...mov, note: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={downloadMovements}>📊 Exportar movimientos</Button>
            <Button onClick={saveMovement} isLoading={savingMov}>Registrar movimiento</Button>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <p className="text-sm font-medium mb-2">Últimos movimientos</p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {movements.length === 0 && <p className="text-xs text-gray-400">Sin movimientos registrados.</p>}
              {movements.map((m) => (
                <div key={m.id} className="text-xs flex justify-between gap-2 border-b border-gray-100 dark:border-gray-800 py-1">
                  <span className="truncate">{m.type} · {m.itemName}{m.toWarehouse ? ` (${m.fromWarehouse || "—"} → ${m.toWarehouse})` : ""}</span>
                  <span className="text-gray-400 shrink-0">{new Date(m.createdAt).toLocaleDateString("es-GT")} · {m.quantity}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAlign} onClose={() => setShowAlign(false)} title="Alinear descripciones (duplicados)" size="lg">
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Grupos de ítems con descripciones parecidas. Elegí con cuál quedarte o <b>editá el nombre</b> con nomenclatura formal;
            al alinear se suman cantidades, se reasignan los cuadros/movimientos y se borran los duplicados (afecta a todo el sistema).
          </p>
          {alignLoading ? (
            <p className="text-xs text-gray-400">Analizando inventario…</p>
          ) : alignGroups.length === 0 ? (
            <p className="text-sm text-green-600">✅ No se detectaron duplicados ni desalineaciones.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">{alignGroups.length} grupo(s) detectado(s)</span>
                <Button size="sm" variant="outline" onClick={mergeAll}>⚡ Alinear todos (nombre más completo)</Button>
              </div>
              <div className="space-y-3 max-h-[58vh] overflow-y-auto">
                {alignGroups.map((group: any[], gi: number) => {
                  const cid = alignChoice[gi] || group[0].id;
                  const cur = alignName[gi] ?? (group.find((g) => g.id === cid)?.name || group[0].name);
                  return (
                    <div key={gi} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                      <p className="text-xs font-medium mb-2 text-gray-500">{group.length} ítems parecidos — elegí con cuál quedarte:</p>
                      {group.map((it: any) => (
                        <label key={it.id} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`g${gi}`}
                            checked={cid === it.id}
                            onChange={() => pickCanonical(gi, group, it.id)}
                          />
                          <span className="truncate">{it.name}</span>
                          <span className="text-xs text-gray-400 ml-auto shrink-0">{it.quantity} u · {it.section || "-"} · {it.warehouse || "-"}</span>
                        </label>
                      ))}
                      <div className="mt-2">
                        <label className="block text-[11px] text-gray-500 mb-1">Nombre final (nomenclatura formal):</label>
                        <input
                          value={cur}
                          onChange={(e) => setAlignName({ ...alignName, [gi]: e.target.value })}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="flex justify-end mt-2">
                        <Button size="sm" onClick={() => mergeGroup(gi, group)}>Alinear</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={showReconcile} onClose={() => setShowReconcile(false)} title="Cotejar cuadros con inventario" size="lg">
        <div className="space-y-4 p-1">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Compara lo que piden los <b>cuadros</b> contra el <b>inventario</b>: detecta ítems que no existen, con descripción diferente o parecidos.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadReconcileReport("xlsx")}>📊 Descargar listado Excel</Button>
            <Button size="sm" variant="outline" onClick={() => downloadReconcileReport("pdf")}>📄 Descargar listado PDF</Button>
          </div>
          {reconcileLoading ? (
            <p className="text-xs text-gray-400">Cotejando…</p>
          ) : !reconcileData ? (
            <p className="text-xs text-gray-400">Sin datos.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-2 text-center">
                  <p className="text-[11px] text-red-600">No existe</p>
                  <p className="font-bold text-red-700">{reconcileData.counts.missing}</p>
                </div>
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2 text-center">
                  <p className="text-[11px] text-amber-600">Descripción dif.</p>
                  <p className="font-bold text-amber-700">{reconcileData.counts.different}</p>
                </div>
                <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-2 text-center">
                  <p className="text-[11px] text-yellow-700">Parecido</p>
                  <p className="font-bold text-yellow-700">{reconcileData.counts.similar}</p>
                </div>
                <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-2 text-center">
                  <p className="text-[11px] text-green-600">OK</p>
                  <p className="font-bold text-green-700">{reconcileData.counts.exact}</p>
                </div>
              </div>

              <input
                placeholder="Buscar ítem…"
                value={reconcileSearch}
                onChange={(e) => setReconcileSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              />
              {reconcileData.discrepancies.length === 0 ? (
                <p className="text-sm text-green-600">✅ Todos los ítems de los cuadros coinciden con el inventario.</p>
              ) : (
                <div className="space-y-3 max-h-[52vh] overflow-y-auto">
                  {reconcileData.discrepancies
                    .filter((d: any) => !reconcileSearch || d.name.toLowerCase().includes(reconcileSearch.toLowerCase()))
                    .map((d: any) => {
                      const currentName = reconcileName[d.key] ?? d.name;
                      const options = d.linked?.length ? d.linked : d.suggestions || [];
                      const pick = reconcilePick[d.key] || options[0]?.id || "";
                      return (
                        <div key={d.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{d.name}</p>
                              <p className="text-xs text-gray-400">
                                Cant. {d.quantity} · {d.orders.slice(0, 3).join(", ")}{d.orders.length > 3 ? ` +${d.orders.length - 3}` : ""}
                              </p>
                            </div>
                            <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-medium ${d.status === "missing" ? "bg-red-100 text-red-700" : d.status === "different" ? "bg-amber-100 text-amber-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {d.status === "missing" ? "No está en inventario" : d.status === "different" ? "Descripción diferente" : "Parecido"}
                            </span>
                          </div>

                          {options.length > 0 ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-[11px] text-gray-500">Elegí con qué quedarte (inventario):</p>
                              {options.map((s: any) => (
                                <label key={s.id} className={`flex items-center justify-between gap-2 rounded p-2 cursor-pointer border ${pick === s.id ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700"}`}>
                                  <span className="flex items-center gap-2 min-w-0">
                                    <input type="radio" name={`pick-${d.key}`} checked={pick === s.id} onChange={() => setReconcilePick(d.key, s.id)} />
                                    <span className="text-xs truncate">
                                      {s.name}
                                      <span className="text-gray-400">
                                        {s.section ? ` · ${s.section}` : ""}{s.status ? ` · ${s.status}` : ""}{s.score ? ` · ${Math.round(s.score * 100)}%` : ""}
                                      </span>
                                    </span>
                                  </span>
                                  <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); setReconcilePick(d.key, s.id); setReconcileName(d.key, s.name); }}>Usar este nombre</Button>
                                </label>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-red-600 mt-2">No existe en el inventario → al agregarlo queda vinculado a los cuadros.</p>
                          )}

                          <div className="mt-2">
                            <label className="block text-[11px] text-gray-500 mb-1">Descripción final (inventario y cuadros quedarán iguales):</label>
                            <div className="flex flex-wrap gap-2">
                              <input
                                value={currentName}
                                onChange={(e) => setReconcileName(d.key, e.target.value)}
                                className="flex-1 min-w-[200px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-white"
                              />
                              <Button size="sm" variant="outline" onClick={() => setReconcileName(d.key, d.name)}>Usar cuadro</Button>
                              {options[0] && <Button size="sm" variant="outline" onClick={() => setReconcileName(d.key, options[0].name)}>Usar inventario</Button>}
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 mt-2">
                            {options.length > 0 && pick ? (
                              <Button size="sm" onClick={() => applyCanonical(d, pick)}>Guardar en ambos (inventario + cuadros)</Button>
                            ) : (
                              <Button size="sm" onClick={() => createMissing(d)}>➕ Agregar al inventario y cuadros</Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal isOpen={showNeeds} onClose={() => setShowNeeds(false)} title="Listado de faltantes (comprar / rentar / consultar)" size="lg">
        <div className="space-y-4 p-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
              <button className={`px-3 py-1.5 ${needsDays === 30 ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"}`} onClick={() => { setNeedsDays(30); loadNeeds(30); }}>30 días</button>
              <button className={`px-3 py-1.5 ${needsDays === 60 ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"}`} onClick={() => { setNeedsDays(60); loadNeeds(60); }}>60 días</button>
            </div>
            <Button size="sm" variant="outline" onClick={() => downloadNeeds("xlsx")}>📊 Excel</Button>
            <Button size="sm" variant="outline" onClick={() => downloadNeeds("pdf")}>📄 PDF</Button>
            <Button size="sm" className="ml-auto" onClick={saveAllNeeds} isLoading={needsSaving}>Guardar cambios</Button>
          </div>
          {needsLoading ? (
            <p className="text-xs text-gray-400">Calculando faltantes…</p>
          ) : needs.length === 0 ? (
            <p className="text-sm text-green-600">✅ No hay faltantes en los próximos {needsDays} días.</p>
          ) : (
            <div className="space-y-4 max-h-[58vh] overflow-y-auto">
              {["COMPRAR", "RENTAR", "CONSULTAR"].map((action) => {
                const arr = needs.filter((n) => (needsEdits[n.key]?.action || n.action) === action);
                if (arr.length === 0) return null;
                return (
                  <div key={action}>
                    <p className={`text-sm font-bold mb-2 ${action === "COMPRAR" ? "text-red-700" : action === "RENTAR" ? "text-amber-700" : "text-blue-700"}`}>{action} ({arr.length})</p>
                    <div className="space-y-2">
                      {arr.map((n) => (
                        <div key={n.key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium flex-1 min-w-[180px]">{n.name}</span>
                            <span className="text-xs text-gray-500">Necesario {n.peak} · Disp. {n.supply} · <b className="text-red-600">Faltan {n.shortfall}</b></span>
                            <select
                              value={needsEdits[n.key]?.action || n.action}
                              onChange={(e) => setNeedEdit(n.key, { action: e.target.value })}
                              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white"
                            >
                              <option value="COMPRAR">Comprar</option>
                              <option value="RENTAR">Rentar</option>
                              <option value="CONSULTAR">Consultar</option>
                            </select>
                          </div>
                          <input
                            value={needsEdits[n.key]?.comment || ""}
                            onChange={(e) => setNeedEdit(n.key, { comment: e.target.value })}
                            placeholder="Comentario / revisión con el equipo"
                            className="mt-2 w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs text-gray-900 dark:text-white"
                          />
                          <p className="text-[11px] text-gray-400 mt-1">
                            {n.events.slice(0, 4).map((e: any) => `#${e.orderNumber} ${e.eventName}`).join(" · ")}
                            {n.events.length > 4 ? ` +${n.events.length - 4}` : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal isOpen={showReport} onClose={() => setShowReport(false)} title="Reportes de inventario" size="lg">
        <div className="space-y-4 p-1">
          <div>
            <label className="block text-sm font-medium mb-1">¿Qué reporte querés?</label>
            <select
              value={reportStatus}
              onChange={(e) => setReportStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
            >
              <option value="ALL">Todo el inventario (resumen + todas las hojas)</option>
              <option value="DISPONIBLE">Disponible</option>
              <option value="ASIGNADO">Asignado</option>
              <option value="REPARACION">En reparación</option>
              <option value="DANADO">Dañado / Perdido</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Bodega (opcional)</label>
              <select
                value={reportWarehouse}
                onChange={(e) => setReportWarehouse(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="">Todas las bodegas</option>
                {Array.from(new Set(items.map((i) => i.warehouse).filter(Boolean))).sort().map((w) => (
                  <option key={w as string} value={w as string}>{w}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sección (opcional)</label>
              <select
                value={reportSection}
                onChange={(e) => setReportSection(e.target.value)}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white"
              >
                <option value="">Todas las secciones</option>
                {Array.from(new Set(items.map((i) => i.section).filter(Boolean))).sort().map((s) => (
                  <option key={s as string} value={s as string}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" onClick={() => downloadInventoryReport("xlsx")}>📊 Descargar Excel</Button>
            <Button variant="outline" onClick={() => downloadInventoryReport("pdf")}>📄 Descargar PDF</Button>
          </div>
        </div>
      </Modal>

      <InventoryFormModal
        isOpen={showAddModal || !!editingItem}
        onClose={() => {
          setShowAddModal(false);
          setEditingItem(null);
        }}
        token={token || ""}
        item={editingItem}
        onSaved={fetchItems}
      />
    </div>
  );
}

function InventoryFormModal({
  isOpen,
  onClose,
  token,
  item,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  item: InventoryItem | null;
  onSaved: () => void;
}) {
  const isEditing = !!item;
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "AUDIO");
  const [quantity, setQuantity] = useState(String(item?.quantity || 1));
  const [status, setStatus] = useState(item?.status || "DISPONIBLE");
  const [location, setLocation] = useState(item?.location || "Bodega Elgin");
  const [warehouse, setWarehouse] = useState(item?.warehouse || "Bodega Elgin");
  const [section, setSection] = useState(item?.section || "");
  const [serialNumber, setSerialNumber] = useState(item?.serialNumber || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [saving, setSaving] = useState(false);

  // Recarga los campos al abrir/editar (evita que el nombre se borre o quede el del ítem anterior).
  useEffect(() => {
    if (!isOpen) return;
    setName(item?.name || "");
    setCategory(item?.category || "AUDIO");
    setQuantity(String(item?.quantity ?? 1));
    setStatus(item?.status || "DISPONIBLE");
    setLocation(item?.location || "Bodega Elgin");
    setWarehouse(item?.warehouse || "Bodega Elgin");
    setSection(item?.section || "");
    setSerialNumber(item?.serialNumber || "");
    setNotes(item?.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const url = isEditing ? `/api/inventory/${item.id}` : "/api/inventory";
      const method = isEditing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          category,
          quantity: parseInt(quantity) || 1,
          status,
          location,
          warehouse,
          section: section.trim() || undefined,
          serialNumber: serialNumber.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(isEditing ? "Ítem actualizado" : "Ítem creado");
        onSaved();
        onClose();
      } else {
        throw new Error(json.error || "Error");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? "Editar Ítem" : "Agregar Ítem"}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Categoría
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Input
            label="Cantidad"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Estado
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="DISPONIBLE">Disponible</option>
              <option value="ASIGNADO">Asignado</option>
              <option value="EN_REPARACION">En Reparación</option>
              <option value="DANADO">Dañado</option>
              <option value="PERDIDO">Perdido</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Bodega
            </label>
            <select
              value={warehouse}
              onChange={(e) => { setWarehouse(e.target.value); setLocation(e.target.value); }}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              {WAREHOUSES.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Sección
            </label>
            <input
              list="section-options"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="Ej: CONSOLAS, AUDIO…"
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <datalist id="section-options">
              {INVENTORY_SECTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <Input
            label="Número de serie"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Descripción / Notas
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">Cancelar</Button>
          <Button variant="primary" type="submit" isLoading={saving}>
            {isEditing ? "Guardar Cambios" : "Agregar Ítem"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
