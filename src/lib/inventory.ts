import type { InventoryCategory } from "@prisma/client";

// Bodegas / ubicaciones de logística.
export const WAREHOUSES = ["Bodega Elgin", "Bodega PP", "En evento", "En renta", "Taller"];

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
