import type { InventoryCategory } from "@prisma/client";

// Bodegas / ubicaciones de logística.
export const DEFAULT_WAREHOUSE = "Bodega Cristo Rey";
export const WAREHOUSES = ["Bodega Cristo Rey", "Casa Nómada", "Taller", "En evento", "En renta"];

// Ubicación de bodegas (coordenadas aproximadas, editables) para el mapa.
export const WAREHOUSE_COORDS: Record<string, { lat: number; lng: number; address: string }> = {
  "Bodega Cristo Rey": { lat: 14.5569333, lng: -90.5287741, address: "Bodega Cristo Rey (editable)" },
  "Casa Nómada": { lat: 14.6349, lng: -90.5069, address: "Casa Nómada (editable)" },
};

// Secciones de inventario (agrupación fina, como en el Excel maestro).
export const INVENTORY_SECTIONS = [
  "CONSOLAS", "AUDIO", "TELEFONO", "PEDESTALES", "MICROFONIA", "ILUMINACION",
  "EFECTOS ESPECIALES", "VIDEO", "INSTRUMENTOS", "ESTRUCTURA DJ",
  "ESTRUCTURA LUCES PEQUEÑA", "ESTRUCTURA LUCES", "CABLEADO", "ACCESORIOS DE EVENTO",
  "HERRAMIENTAS", "LIMPIEZA", "SEGURIDAD INDUSTRIAL", "TARIMA Y PISTA", "TELA",
];

// Mapeo sección → categoría del sistema (para los filtros existentes).
const SECTION_CATEGORY: Record<string, InventoryCategory> = {
  CONSOLAS: "AUDIO",
  AUDIO: "AUDIO",
  MICROFONIA: "AUDIO",
  ILUMINACION: "ILUMINACION",
  INSTRUMENTOS: "INSTRUMENTO",
  CABLEADO: "CABLEADO",
  "ESTRUCTURA DJ": "MOBILIARIO",
  "ESTRUCTURA LUCES": "MOBILIARIO",
  "ESTRUCTURA LUCES PEQUEÑA": "MOBILIARIO",
  PEDESTALES: "MOBILIARIO",
  "TARIMA Y PISTA": "MOBILIARIO",
  HERRAMIENTAS: "HERRAMIENTA",
  LIMPIEZA: "CONSUMIBLE",
};

export function categoryForSection(section?: string | null): InventoryCategory {
  if (!section) return "OTRO";
  const key = section.toUpperCase().trim();
  if (SECTION_CATEGORY[key]) return SECTION_CATEGORY[key];
  if (key.includes("AUDIO") || key.includes("CONSOLA") || key.includes("MICRO")) return "AUDIO";
  if (key.includes("ILUMIN") || key.includes("LUZ") || key.includes("LUCE")) return "ILUMINACION";
  if (key.includes("INSTRUMENT")) return "INSTRUMENTO";
  if (key.includes("CABLE")) return "CABLEADO";
  if (key.includes("HERRAMIENT")) return "HERRAMIENTA";
  if (key.includes("ESTRUCTURA") || key.includes("TARIMA") || key.includes("PEDESTAL") || key.includes("MOBILIAR")) return "MOBILIARIO";
  if (key.includes("LIMPI") || key.includes("CONSUM")) return "CONSUMIBLE";
  return "OTRO";
}

// Similitud de descripciones (para alinear duplicados).
const _norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,()"']/g, "");
const _tokens = (s: string) => new Set(_norm(s).split(" ").filter((w) => w.length > 1));
const _numbers = (s: string) => (_norm(s).match(/\d+(\.\d+)?/g) || []).join(",");
function jaccard(a: string, b: string) {
  const A = _tokens(a), B = _tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

// Agrupa ítems con descripciones parecidas (posibles duplicados).
export function findSimilarGroups<T extends { id: string; name: string }>(items: T[], threshold = 0.6): T[][] {
  const groups: T[][] = [];
  const used = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue;
    const group: T[] = [items[i]];
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(items[j].id)) continue;
      // Distinta cantidad/medida => NO es duplicado (ej: Cat5 vs Cat6, Truss 1mt vs 2mt).
      if (jaccard(items[i].name, items[j].name) >= threshold && _numbers(items[i].name) === _numbers(items[j].name)) {
        group.push(items[j]);
        used.add(items[j].id);
      }
    }
    if (group.length >= 2) {
      used.add(items[i].id);
      groups.push(group);
    }
  }
  return groups;
}

export interface ParsedInventoryItem {
  name: string;
  section: string | null;
  category: InventoryCategory;
  quantity: number;
  location?: string;
  serialNumber?: string | null;
  notes?: string | null;
}

// Parsea filas (array de arrays) del Excel maestro.
//  - Fila de sección: una celda con texto, sin cantidad numérica.
//  - Fila de ítem: una celda con cantidad (número) y otra con el nombre.
export function parseInventoryRows(rows: unknown[][]): ParsedInventoryItem[] {
  const items: ParsedInventoryItem[] = [];
  let section: string | null = null;
  for (const raw of rows) {
    const cells = (raw || []).map((c) => String(c ?? "").trim());
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length === 0) continue;
    if (nonEmpty[0].toUpperCase() === "INVENTARIO") continue;

    const qtyIdx = cells.findIndex((c) => /^\d+$/.test(c));
    if (qtyIdx >= 0) {
      const name = cells.slice(qtyIdx + 1).find(Boolean) || nonEmpty[nonEmpty.length - 1];
      if (!name) continue;
      items.push({
        name,
        section,
        category: categoryForSection(section),
        quantity: parseInt(cells[qtyIdx], 10) || 0,
      });
    } else {
      section = nonEmpty[0].toUpperCase();
    }
  }
  return items;
}
