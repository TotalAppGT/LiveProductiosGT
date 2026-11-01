import { prisma } from "@/lib/prisma";

const norm = (s: unknown) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const decode = (s: unknown) => {
  let t = String(s ?? "");
  if (/[ÃÂ]/.test(t)) {
    try { t = Buffer.from(t, "latin1").toString("utf8"); } catch {}
  }
  return t;
};

const fixWords = (s: unknown) =>
  decode(s)
    .replace(/\bBateria\b/gi, "Batería")
    .replace(/\bAnaloga\b/gi, "Análoga")
    .replace(/\bExtension\b/gi, "Extensión")
    .replace(/\bExtensiones\b/gi, "Extensiones")
    .replace(/\bSenal\b/gi, "Señal")
    .replace(/\bCanon\b/gi, "Cañón")
    .replace(/\bPequena\b/gi, "Pequeña")
    .replace(/\bPequeno\b/gi, "Pequeño")
    .replace(/\bDiseno\b/gi, "Diseño")
    .replace(/\bMusicos\b/gi, "Músicos")
    .replace(/\bMicrofono\b/gi, "Micrófono")
    .replace(/\bCategoria\b/gi, "Categoría");

export type CompareRow = {
  name: string;
  category: string;
  sourceQty: number;
  targetQty: number;
  bodega: number;
  stockSource: number;
  sourceShort: number;
  stockAfterSource: number;
  transfer: number;
  targetRemaining: number;
  targetFromStock: number;
  targetShort: number;
  returnQty: number;
};

export type CompareEvent = {
  id: string;
  orderNumber: number;
  eventName: string;
  eventDate: string | null;
  montageDate: string | null;
};

export type CompareData = {
  source: CompareEvent;
  target: CompareEvent;
  rows: CompareRow[];
  totals: {
    source: number;
    target: number;
    stockSource: number;
    sourceShort: number;
    transfer: number;
    targetRemaining: number;
    targetFromStock: number;
    targetShort: number;
    returnQty: number;
    pctTransferSource: number;
    pctTransferTarget: number;
    pctStockTarget: number;
    pctShortTarget: number;
    pctReturnSource: number;
  };
};

const dateOnly = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const montageOf = (d: Date | null) => {
  if (!d) return null;
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export async function compareOrders(ids: string[]): Promise<CompareData> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length < 2) throw new Error("Seleccioná al menos 2 cuadros");

  const orders = await prisma.order.findMany({
    where: { id: { in: unique } },
    include: { items: true },
  });
  if (orders.length < 2) throw new Error("No se encontraron los 2 cuadros");

  const sorted = [...orders].sort((a, b) => {
    const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
    const db = b.eventDate ? new Date(b.eventDate).getTime() : 0;
    return da - db || a.orderNumber - b.orderNumber;
  });
  const source = sorted[0];
  const target = sorted[sorted.length - 1];

  const inventory = await prisma.inventoryItem.findMany({
    where: { status: "DISPONIBLE" },
    select: { id: true, name: true, quantity: true },
  });
  const byId = new Map(inventory.map((i) => [i.id, i]));
  const byName = new Map(inventory.map((i) => [norm(fixWords(i.name)), i]));

  type Group = { key: string; name: string; category: string; source: number; target: number };
  const map = new Map<string, Group>();
  const add = (items: typeof source.items, which: "source" | "target") => {
    for (const it of items) {
      const key = it.inventoryItemId || "n:" + norm(fixWords(it.name));
      let g = map.get(key);
      if (!g) {
        g = { key, name: fixWords(it.name), category: it.category || "OTRO", source: 0, target: 0 };
        map.set(key, g);
      }
      g[which] += Number(it.quantity) || 0;
    }
  };
  add(source.items, "source");
  add(target.items, "target");

  const rows: CompareRow[] = [];
  for (const g of map.values()) {
    const inv = (g.key.startsWith("n:") ? null : byId.get(g.key)) || byName.get(norm(g.name)) || null;
    const bodega = inv ? Number(inv.quantity) || 0 : 0;
    const stockSource = Math.min(bodega, g.source);
    const sourceShort = Math.max(0, g.source - bodega);
    const stockAfterSource = Math.max(0, bodega - g.source);
    const transfer = Math.min(g.source, g.target);
    const targetRemaining = Math.max(0, g.target - transfer);
    const targetFromStock = Math.min(targetRemaining, stockAfterSource);
    const targetShort = Math.max(0, targetRemaining - stockAfterSource);
    const returnQty = Math.max(0, g.source - transfer);
    rows.push({
      name: g.name,
      category: g.category,
      sourceQty: g.source,
      targetQty: g.target,
      bodega,
      stockSource,
      sourceShort,
      stockAfterSource,
      transfer,
      targetRemaining,
      targetFromStock,
      targetShort,
      returnQty,
    });
  }

  rows.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      b.targetRemaining - a.targetRemaining ||
      b.transfer - a.transfer ||
      a.name.localeCompare(b.name)
  );

  const sum = (k: keyof CompareRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const totals = {
    source: sum("sourceQty"),
    target: sum("targetQty"),
    stockSource: sum("stockSource"),
    sourceShort: sum("sourceShort"),
    transfer: sum("transfer"),
    targetRemaining: sum("targetRemaining"),
    targetFromStock: sum("targetFromStock"),
    targetShort: sum("targetShort"),
    returnQty: sum("returnQty"),
    pctTransferSource: pct(sum("transfer"), sum("sourceQty")),
    pctTransferTarget: pct(sum("transfer"), sum("targetQty")),
    pctStockTarget: pct(sum("targetFromStock"), sum("targetQty")),
    pctShortTarget: pct(sum("targetShort"), sum("targetQty")),
    pctReturnSource: pct(sum("returnQty"), sum("sourceQty")),
  };

  return {
    source: {
      id: source.id,
      orderNumber: source.orderNumber,
      eventName: source.eventName,
      eventDate: dateOnly(source.eventDate),
      montageDate: montageOf(source.eventDate),
    },
    target: {
      id: target.id,
      orderNumber: target.orderNumber,
      eventName: target.eventName,
      eventDate: dateOnly(target.eventDate),
      montageDate: montageOf(target.eventDate),
    },
    rows,
    totals,
  };
}
