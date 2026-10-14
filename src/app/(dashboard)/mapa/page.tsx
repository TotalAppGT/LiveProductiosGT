"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import toast from "react-hot-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface WCoord { name: string; lat: number; lng: number; address: string; }

export default function MapaPage() {
  const { user, token } = useAuth();
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<any>(null);
  const mapObjRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [coords, setCoords] = useState<WCoord[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const canEdit = user?.role === "DUENO" || user?.role === "ADMIN" || user?.role === "JEFE";

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/warehouses", { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.success) setCoords(json.data);
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
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      const map = L.map(mapRef.current).setView([14.61, -90.52], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
      markersRef.current = L.layerGroup().addTo(map);
      mapObjRef.current = map;
    })();
    return () => {
      if (mapObjRef.current) { mapObjRef.current.remove(); mapObjRef.current = null; }
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    if (!L || !markersRef.current) return;
    markersRef.current.clearLayers();
    for (const c of coords) {
      L.marker([c.lat, c.lng]).addTo(markersRef.current).bindPopup(`<b>${c.name}</b><br>${c.address}`);
    }
  }, [coords]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/warehouses", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ warehouses: coords }),
      });
      const json = await res.json();
      if (json.success) { toast.success("Coordenadas guardadas"); setEditing(false); load(); }
      else toast.error(json.error || "Error");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mapa de bodegas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Ubicaciones de las bodegas. Las coordenadas son configurables.</p>
        </div>
        {canEdit && !editing && <Button variant="outline" onClick={() => setEditing(true)}>✏️ Editar coordenadas</Button>}
        {canEdit && editing && (
          <div className="flex gap-2">
            <Button onClick={save} isLoading={saving}>💾 Guardar</Button>
            <Button variant="ghost" onClick={() => { setEditing(false); load(); }}>Cancelar</Button>
          </div>
        )}
      </div>

      <Card variant="bordered" className="overflow-hidden">
        <div ref={mapRef} className="w-full" style={{ height: "60vh", minHeight: 340 }} />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {coords.map((c, i) => (
          <Card key={c.name} variant="bordered" className="p-3">
            <p className="font-semibold text-sm">🏢 {c.name}</p>
            {editing ? (
              <div className="space-y-1 mt-2">
                <input
                  value={c.address}
                  onChange={(e) => setCoords((prev) => prev.map((x, idx) => idx === i ? { ...x, address: e.target.value } : x))}
                  placeholder="Dirección"
                  className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs"
                />
                <div className="flex gap-2">
                  <input
                    type="number" step="0.0001" value={c.lat}
                    onChange={(e) => setCoords((prev) => prev.map((x, idx) => idx === i ? { ...x, lat: parseFloat(e.target.value) || 0 } : x))}
                    placeholder="Lat" className="w-1/2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs"
                  />
                  <input
                    type="number" step="0.0001" value={c.lng}
                    onChange={(e) => setCoords((prev) => prev.map((x, idx) => idx === i ? { ...x, lng: parseFloat(e.target.value) || 0 } : x))}
                    placeholder="Lng" className="w-1/2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs"
                  />
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
      </div>
    </div>
  );
}
