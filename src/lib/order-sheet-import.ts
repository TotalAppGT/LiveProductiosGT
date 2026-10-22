import * as XLSX from "xlsx";

export type SheetItem = { name: string; quantity: number; section: string };

export type SheetEvent = {
  sheet: string;
  date: Date;
  client: string;
  location: string;
  guests: number | null;
  contract: string;
  items: SheetItem[];
};

export type InventoryOption = {
  id: string;
  name: string;
  category: string;
  status?: string;
};

export type AliasOption = {
  id: string;
  name: string;
  category: string;
};

export type ItemMatch = SheetItem & {
  inventoryItemId: string | null;
  matchedName: string | null;
  category: string;
  matchType: "exact" | "alias" | "partial" | "none";
};

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const deaccent = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const dateKey = (d: Date) => d.toISOString().slice(0, 10);

export function cleanName(value: string): string {
  let s = deaccent(norm(value));
  s = s.replace(/\([^)]*\)/g, " ");
  s = s.replace(/\bcon\b.*$/, " ");
  s = s.replace(/[.,;:/\\|"'`´+*]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/([a-z])\s+(\d)/g, "$1$2");
  return s;
}

const STOP = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "para", "en", "y"]);
const SYNONYMS: Record<string, string> = {
  estructura: "truss",
  estructuras: "truss",
  metro: "mt",
  metros: "mt",
  probador: "pin",
  tela: "tela",
};

const tokensOf = (value: string): string[] => {
  const clean = cleanName(value);
  const words = clean.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  const syn = words.map((w) => SYNONYMS[w] || w);
  const singular = syn.map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w));
  return Array.from(new Set(singular)).sort();
};

const tokenKey = (value: string) => tokensOf(value).join(" ");
const numbersOf = (value: string) => (cleanName(value).match(/\d+/g) || []).join(",");

function jaccard(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}

export function parseGuests(value: string): number | null {
  const m = String(value || "").replace(/,/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

export function parseWorkbookEvents(
  wb: XLSX.WorkBook,
  opts?: { sheets?: string[]; from?: string; to?: string }
): SheetEvent[] {
  const names = opts?.sheets?.length
    ? wb.SheetNames.filter((n) =>
        opts.sheets!.some((s) => norm(n) === norm(s) || norm(n).includes(norm(s)))
      )
    : wb.SheetNames;
  const events: SheetEvent[] = [];

  for (const sheetName of names) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: "",
    });

    let current: SheetEvent | null = null;
    let inTable = false;
    let section = "";

    const flush = () => {
      if (current && current.items.length > 0) events.push(current);
      current = null;
    };

    for (const row of rows) {
      const a = row[0];
      const b = row[1];
      const na = norm(a);
      const nb = String(b ?? "").trim();
      const date =
        b instanceof Date
          ? b
          : na.includes("fecha del evento") && b
          ? new Date(String(b))
          : null;

      if (na.includes("fecha del evento") && date && !isNaN(date.getTime())) {
        flush();
        current = {
          sheet: sheetName,
          date,
          client: "",
          location: "",
          guests: null,
          contract: "",
          items: [],
        };
        inTable = false;
        section = "";
        continue;
      }
      if (!current) continue;

      if (na.startsWith("equipo contratado")) {
        current.contract = nb;
        continue;
      }
      if (na.startsWith("nombre del cliente")) {
        current.client = nb;
        continue;
      }
      if (na.startsWith("lugar del evento")) {
        current.location = nb;
        continue;
      }
      if (na.startsWith("cantidad de invitados")) {
        current.guests = parseGuests(nb);
        continue;
      }
      if (norm(nb).includes("cuadro de montaje")) {
        inTable = true;
        continue;
      }
      if (!inTable) continue;

      const rawQty = typeof a === "number" ? a : Number(String(a ?? "").replace(/[^\d.,]/g, "").replace(/,/g, ""));
      if (rawQty > 0 && nb) {
        current.items.push({ name: nb, quantity: rawQty, section });
      } else if (!a && nb) {
        section = nb;
      }
    }
    flush();
  }

  const from = opts?.from || "";
  const to = opts?.to || "";
  return events.filter((e) => {
    const d = dateKey(e.date);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function sectionCategory(section: string): string {
  const s = norm(section);
  if (s.includes("audio") || s.includes("consola") || s.includes("micro") || s.includes("monitoreo") || s.includes("bateria") || s.includes("in ear") || s.includes("backline") || s.includes("instrument")) return "AUDIO";
  if (s.includes("ilumin")) return "ILUMINACION";
  if (s.includes("estructura") || s.includes("truss") || s.includes("tarima") || s.includes("escenario")) return "ESTRUCTURA";
  if (s.includes("pista")) return "PISTA";
  if (s.includes("video") || s.includes("pantalla")) return "VIDEO";
  if (s.includes("energia") || s.includes("generador") || s.includes("planta")) return "ENERGIA";
  if (s.includes("mobiliario") || s.includes("mesa") || s.includes("silla")) return "MOBILIARIO";
  return "OTRO";
}

export function buildItemMatcher(inventory: InventoryOption[], aliases: AliasOption[]) {
  const byId = new Map(inventory.map((i) => [i.id, i]));
  const invByClean = new Map<string, InventoryOption>();
  const invByKey = new Map<string, InventoryOption>();
  const aliasByClean = new Map<string, AliasOption>();
  const aliasByKey = new Map<string, AliasOption>();

  for (const item of inventory) {
    const c = cleanName(item.name);
    if (!invByClean.has(c) || item.status === "DISPONIBLE") invByClean.set(c, item);
    const k = tokenKey(item.name);
    if (!invByKey.has(k) || item.status === "DISPONIBLE") invByKey.set(k, item);
  }
  for (const item of aliases) {
    if (!item.id) continue;
    const c = cleanName(item.name);
    if (!aliasByClean.has(c)) aliasByClean.set(c, item);
    const k = tokenKey(item.name);
    if (!aliasByKey.has(k)) aliasByKey.set(k, item);
  }

  return (item: SheetItem): ItemMatch => {
    const c = cleanName(item.name);
    const key = tokenKey(item.name);
    const nums = numbersOf(item.name);
    const fromAlias = (a: AliasOption | undefined): ItemMatch | null => {
      if (!a) return null;
      const inv = byId.get(a.id);
      return {
        ...item,
        inventoryItemId: a.id,
        matchedName: inv?.name || a.name,
        category: inv?.category || a.category || sectionCategory(item.section),
        matchType: "alias",
      };
    };

    const invExact = invByClean.get(c);
    if (invExact) {
      return {
        ...item,
        inventoryItemId: invExact.id,
        matchedName: invExact.name,
        category: invExact.category,
        matchType: "exact",
      };
    }
    const aliasExact = fromAlias(aliasByClean.get(c));
    if (aliasExact) return aliasExact;

    const invKey = invByKey.get(key);
    if (invKey) {
      return {
        ...item,
        inventoryItemId: invKey.id,
        matchedName: invKey.name,
        category: invKey.category,
        matchType: "partial",
      };
    }
    const aliasKey = fromAlias(aliasByKey.get(key));
    if (aliasKey) return { ...aliasKey, matchType: "partial" };

    let best: InventoryOption | null = null;
    let bestScore = 0;
    const aTokens = tokensOf(item.name);
    for (const inv of invByClean.values()) {
      if (numbersOf(inv.name) !== nums) continue;
      const score = jaccard(aTokens, tokensOf(inv.name));
      if (score > bestScore) {
        bestScore = score;
        best = inv;
      }
    }
    if (best && bestScore >= 0.55) {
      return {
        ...item,
        inventoryItemId: best.id,
        matchedName: best.name,
        category: best.category,
        matchType: "partial",
      };
    }
    return {
      ...item,
      inventoryItemId: null,
      matchedName: null,
      category: sectionCategory(item.section),
      matchType: "none",
    };
  };
}

export function eventNameFor(date: Date, client: string): string {
  const [y, m, d] = dateKey(date).split("-");
  return `Cuadro ${d}/${m}/${y} — ${client || "Sin cliente"}`;
}
