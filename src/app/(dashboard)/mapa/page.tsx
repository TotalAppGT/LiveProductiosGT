"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface WCoord { name: string; lat: number; lng: number; address: string; }
const norm = (s: string) => (s || "").trim().toLowerCase();

export default function MapaPage() {
  const { user, token } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const mapObjRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [coords, setCoords] = useState<WCoord[]>([]);
  const [places, setPlaces] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPlace, setNewPlace] = useState({ name: "", address: "" });
  const [adding, setAdding] = useState(false);

  const canEdit = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const load = useCallback(async () => {
    if (!token) return;
    const H = { Authorization: `Bearer ${token}` };
    try {
      const [w, p, o] = await Promise.all([
        fetch("/api/warehouses", { headers: H }).then((r) => r.json()),
        fetch("/api/places", { headers: H }).then((r) => r.json()),
        fetch("/api/orders", { headers: H }).then((r) => r.json()),
      ]);
      if (w.success) setCoords(w.data);
      if (p.success) setPlaces(p.data);
      if (o.success) setOrders(o.data);
    } catch {
      // silencioso
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(mapRef.current).setView([14.58, -90.5], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      mapObjRef.current = map;
    })();
    return () => { if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; } };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !markersRef.current || !mapObjRef.current) return;
    markersRef.current.clearLayers();
    const map = mapObjRef.current;

    // Bodegas (verde)
    for (const c of coords) {
      L.circleMarker([c.lat, c.lng], { radius: 9, color: "#166534", fillColor: "#22c55e", fillOpacity: 0.9, weight: 2 })
        .addTo(markersRef.current).bindPopup(`<b>🏢 ${c.name}</b><br>${c.address}`);
    }

    // Lugares de eventos (azul)
    for (const p of places) {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: "#1e40af", fillColor: "#3b82f6", fillOpacity: 0.85, weight: 2 })
        .addTo(markersRef.current).bindPopup(`<b>📍 ${p.name}</b><br>${p.address || ""}`);
    }

    // Eventos (rojo) + ruta desde Bodega Elgin
    const source = coords.find((c) => c.name === "Bodega Elgin") || coords[0];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const o of orders) {
      const place = places.find((p) => norm(p.name) === norm(o.eventLocation) || (o.eventLocation && norm(p.name).includes(norm(o.eventLocation))));
      if (!place) continue;
      const fecha = o.eventDate ? new Date(o.eventDate).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", day: "2-digit", month: "short" }) : "s/f";
      L.circleMarker([place.lat, place.lng], { radius: 6, color: "#7f1d1d", fillColor: "#ef4444", fillOpacity: 0.9, weight: 2 })
        .addTo(markersRef.current).bindPopup(`<b>🎪 #${o.orderNumber} ${o.eventName}</b><br>${place.name}<br>${fecha}`);
      if (source && o.eventDate && new Date(o.eventDate) >= today) {
        map.addLayer(L.polyline([[source.lat, source.lng], [place.lat, place.lng]], { color: "#ef4444", weight: 2, opacity: 0.5, dashArray: "6 6" }));
      }
    }
  }, [coords, places, orders]);

  async function saveCoords() {
    setSaving(true);
    try {
      const res = await fetch("/api/warehouses", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ warehouses: coords }) });
      const json = await res.json();
      if (json.success) { toast.success("Coordenadas guardadas"); setEditing(false); load(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error"); } finally { setSaving(false); }
  }

  async function addPlace() {
    if (!newPlace.name.trim()) return toast.error("Nombre requerido");
    setAdding(true);
    try {
      const res = await fetch("/api/places", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(newPlace) });
      const json = await res.json();
      if (json.success) { toast.success("Lugar agregado"); setNewPlace({ name: "", address: "" }); load(); }
      else toast.error(json.error || "Error");
    } catch { toast.error("Error"); } finally { setAdding(false); }
  }

  async function deletePlace(id: string) {
    if (!confirm("¿Eliminar lugar?")) return;
    await fetch(`/api/places/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    load();
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mapa de logística</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            🟢 Bodegas · 🔵 Lugares de evento · 🔴 Eventos (línea = ruta desde bodega)
          </p>
        </div>
        {canEdit && !editing && <Button variant="outline" onClick={() => setEditing(true)}>✏️ Editar bodegas</Button>}
        {canEdit && editing && (
          <div className="flex gap-2">
            <Button onClick={saveCoords} isLoading={saving}>💾 Guardar</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); load(); }}>Cancelar</Button>
          </div>
        )}
      </div>

      <Card variant="bordered" className="overflow-hidden">
        <div ref={mapRef} className="w-full" style={{ height: "58vh", minHeight: 320 }} />
      </Card>

      {canEdit && (
        <Card variant="bordered" className="p-3">
          <p className="text-sm font-semibold mb-2">➕ Agregar lugar de evento</p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[160px]"><Input label="Nombre" value={newPlace.name} onChange={(e) => setNewPlace({ ...newPlace, name: e.target.value })} placeholder="Ej: Hotel Hilton" /></div>
            <div className="flex-1 min-w-[200px]"><Input label="Dirección" value={newPlace.address} onChange={(e) => setNewPlace({ ...newPlace, address: e.target.value })} placeholder="Dirección / referencia" /></div>
            <Button onClick={addPlace} isLoading={adding}>Agregar (geocodifica)</Button>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Se ubica automáticamente por la dirección (OpenStreetMap).</p>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {coords.map((c, i) => (
          <Card key={c.name} variant="bordered" className="p-3">
            <p className="font-semibold text-sm">🏢 {c.name}</p>
            {editing ? (
              <div className="space-y-1 mt-2">
                <input value={c.address} onChange={(e) => setCoords((prev) => prev.map((x, idx) => idx === i ? { ...x, address: e.target.value } : x))} placeholder="Dirección" className="w-full rounded border px-2 py-1 text-xs" />
                <div className="flex gap-2">
                  <input type="number" step="0.0001" value={c.lat} onChange={(e) => setCoords((prev) => prev.map((x, idx) => idx === i ? { ...x, lat: parseFloat(e.target.value) || 0 } : x))} className="w-1/2 rounded border px-2 py-1 text-xs" />
                  <input type="number" step="0.0001" value={c.lng} onChange={(e) => setCoords((prev) => prev.map((x, idx) => idx === i ? { ...x, lng: parseFloat(e.target.value) || 0 } : x))} className="w-1/2 rounded border px-2 py-1 text-xs" />
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mt-1">{c.address}</p>
                <p className="text-[11px] text-gray-400 mt-1">{c.lat}, {c.lng}</p>
              </>
            )}
          </Card>
        ))}
        {places.map((p) => (
          <Card key={p.id} variant="bordered" className="p-3">
            <div className="flex items-start justify-between">
              <p className="font-semibold text-sm">📍 {p.name}</p>
              {canEdit && <button onClick={() => deletePlace(p.id)} className="text-red-500 text-xs">✕</button>}
            </div>
            <p className="text-xs text-gray-500 mt-1">{p.address || "—"}</p>
            <p className="text-[11px] text-gray-400 mt-1">{p.lat?.toFixed(4)}, {p.lng?.toFixed(4)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
