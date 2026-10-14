"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { WAREHOUSE_COORDS } from "@/lib/inventory";
import { Card } from "@/components/ui/Card";

export default function MapaPage() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map: any;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!ref.current) return;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      map = L.map(ref.current).setView([14.61, -90.52], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      for (const [name, c] of Object.entries(WAREHOUSE_COORDS)) {
        L.marker([c.lat, c.lng]).addTo(map).bindPopup(`<b>${name}</b><br>${c.address}`);
      }
      setReady(true);
    })();
    return () => {
      if (map) map.remove();
    };
  }, []);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mapa de bodegas</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
          Ubicaciones de las bodegas. Las coordenadas son editables (bodega Elgin y PP).
        </p>
      </div>
      <Card variant="bordered" className="overflow-hidden">
        <div ref={ref} className="w-full" style={{ height: "68vh", minHeight: 380 }} />
      </Card>
      {!ready && <p className="text-xs text-gray-400">Cargando mapa…</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(WAREHOUSE_COORDS).map(([name, c]) => (
          <Card key={name} variant="bordered" className="p-3">
            <p className="font-semibold text-sm">🏢 {name}</p>
            <p className="text-xs text-gray-500 mt-1">{c.address}</p>
            <p className="text-[11px] text-gray-400 mt-1">{c.lat}, {c.lng}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
