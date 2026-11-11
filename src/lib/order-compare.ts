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
  section: string | null;
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

export type CompareOptions = {
  sourceId?: string;
  targetId?: string;
  targetMode?: "auto" | "largest";
};

export type CompareData = {
  mode: "pair";
  source: CompareEvent;
  target: CompareEvent;
  directionWarning?: string;
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

export type CompareMultiEvent = CompareEvent & {
  need: number;
  reuse: number;
  fromStock: number;
  short: number;
  returnQty: number;
  coverage: number;
};

export type CompareMultiItem = {
  name: string;
  category: string;
  section: string | null;
  bodega: number;
  totalNeed: number;
  totalReuse: number;
  totalFromStock: number;
  totalShort: number;
  totalReturn: number;
  perEvent: {
    id: string;
    orderNumber: number;
    need: number;
    reuse: number;
    fromStock: number;
    short: number;
    returnQty: number;
  }[];
  transfers: { fromOrder: number; toOrder: number; qty: number }[];
};

export type CompareMultiData = {
  mode: "multi";
  source: CompareEvent;
  target: CompareEvent;
  directionWarning?: string;
  events: CompareMultiEvent[];
  items: CompareMultiItem[];
  totals: {
    need: number;
    reuse: number;
    fromStock: number;
    short: number;
    returnQty: number;
    bodega: number;
    pctFromStock: number;
    pctReuse: number;
    pctShort: number;
    pctReturn: number;
    coverage: number;
  };
};

export type CompareResult = CompareData | CompareMultiData;

const dateOnly = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const montageOf = (d: Date | null) => {
  if (!d) return null;
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

type LoadedOrder = {
  id: string;
  orderNumber: number;
  eventName: string;
  eventDate: Date | null;
  items: { inventoryItemId: string | null; name: string; category: string; quantity: number }[];
};

type Inv = { id: string; name: string; quantity: number; section?: string | null };

export async function compareOrders(ids: string[], options?: CompareOptions): Promise<CompareResult> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length < 2) throw new Error("Seleccioná al menos 2 cuadros");

  const orders = await prisma.order.findMany({
    where: { id: { in: unique } },
    include: { items: true },
  });
  if (orders.length < 2) throw new Error("No se encontraron los cuadros");

  const sorted = [...orders].sort((a, b) => {
    const da = a.eventDate ? new Date(a.eventDate).getTime() : 0;
    const db = b.eventDate ? new Date(b.eventDate).getTime() : 0;
    return da - db || a.orderNumber - b.orderNumber;
  });

  const inventory = await prisma.inventoryItem.findMany({
    where: { status: "DISPONIBLE" },
    select: { id: true, name: true, quantity: true, section: true },
  });
  const byId = new Map(inventory.map((i) => [i.id, i]));
  const byName = new Map(inventory.map((i) => [norm(fixWords(i.name)), i]));

  const totalQty = (o: LoadedOrder) => o.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const selectedTarget =
    options?.targetId
      ? sorted.find((o) => o.id === options.targetId) || null
      : options?.targetMode === "largest"
      ? sorted.reduce((best, o) => (totalQty(o) > totalQty(best) ? o : best), sorted[0])
      : null;
  const selectedSource = options?.sourceId ? sorted.find((o) => o.id === options.sourceId) || null : null;

  let ordered = sorted;
  let directionWarning: string | undefined;
  if (selectedTarget || selectedSource) {
    const same = selectedTarget && selectedSource && selectedTarget.id === selectedSource.id;
    const target = same ? null : selectedTarget;
    const source = same ? null : selectedSource;
    const middle = sorted.filter(
      (o) => o.id !== source?.id && o.id !== target?.id
    );
    ordered = [...(source ? [source] : []), ...middle, ...(target ? [target] : [])];

    outer: for (let i = 0; i < ordered.length; i++) {
      const a = ordered[i];
      const at = a.eventDate ? new Date(a.eventDate).getTime() : null;
      if (!at) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const b = ordered[j];
        const bt = b.eventDate ? new Date(b.eventDate).getTime() : null;
        if (!bt) continue;
        if (at > bt) {
          directionWarning = `El orden del trasiego no es cronológico: #${a.orderNumber} ${a.eventName} (${dateOnly(a.eventDate)}) va antes que #${b.orderNumber} ${b.eventName} (${dateOnly(b.eventDate)}). No es posible trasladar equipo de un evento posterior a uno anterior; revisá Desde/Hacia o las fechas.`;
          break outer;
        }
      }
    }
  }

  if (ordered.length > 2) return compareMulti(ordered, byId, byName, directionWarning);

  const source = ordered[0];
  const target = ordered[1];

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
      section: inv?.section || null,
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
    mode: "pair",
    directionWarning,
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

function compareMulti(
  orders: LoadedOrder[],
  byId: Map<string, Inv>,
  byName: Map<string, Inv>,
  directionWarning?: string
): CompareMultiData {
  const events: CompareMultiEvent[] = orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    eventName: o.eventName,
    eventDate: dateOnly(o.eventDate),
    montageDate: montageOf(o.eventDate),
    need: 0,
    reuse: 0,
    fromStock: 0,
    short: 0,
    returnQty: 0,
    coverage: 100,
  }));
  const eventById = new Map(events.map((e) => [e.id, e]));

  type Group = { key: string; name: string; category: string; perEvent: Map<string, number> };
  const groups = new Map<string, Group>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.inventoryItemId || "n:" + norm(fixWords(it.name));
      let g = groups.get(key);
      if (!g) {
        g = { key, name: fixWords(it.name), category: it.category || "OTRO", perEvent: new Map() };
        groups.set(key, g);
      }
      g.perEvent.set(o.id, (g.perEvent.get(o.id) || 0) + (Number(it.quantity) || 0));
    }
  }

  const items: CompareMultiItem[] = [];
  for (const g of groups.values()) {
    const inv = (g.key.startsWith("n:") ? null : byId.get(g.key)) || byName.get(norm(g.name)) || null;
    const bodega = inv ? Number(inv.quantity) || 0 : 0;
    let stock = bodega;
    const layers: { orderId: string; orderNumber: number; qty: number }[] = [];
    const perEvent: CompareMultiItem["perEvent"] = [];
    const transfers: CompareMultiItem["transfers"] = [];

    for (const o of orders) {
      const qty = g.perEvent.get(o.id) || 0;
      let need = qty;
      let reuse = 0;
      while (need > 0 && layers.length > 0) {
        const layer = layers[layers.length - 1];
        const take = Math.min(layer.qty, need);
        if (take > 0) {
          layer.qty -= take;
          reuse += take;
          need -= take;
          transfers.push({ fromOrder: layer.orderNumber, toOrder: o.orderNumber, qty: take });
        }
        if (layer.qty <= 0) layers.pop();
      }
      const fromStock = Math.min(stock, need);
      stock -= fromStock;
      need -= fromStock;
      const short = need;
      const provided = reuse + fromStock;
      if (provided > 0) layers.push({ orderId: o.id, orderNumber: o.orderNumber, qty: provided });
      if (qty > 0) {
        perEvent.push({ id: o.id, orderNumber: o.orderNumber, need: qty, reuse, fromStock, short, returnQty: 0 });
      }
      const ev = eventById.get(o.id);
      if (ev) {
        ev.need += qty;
        ev.reuse += reuse;
        ev.fromStock += fromStock;
        ev.short += short;
      }
    }

    const lastEventId = orders[orders.length - 1].id;
    for (const layer of layers) {
      if (layer.orderId === lastEventId) continue;
      const rec = perEvent.find((p) => p.id === layer.orderId);
      if (rec) rec.returnQty += layer.qty;
      const ev = eventById.get(layer.orderId);
      if (ev) ev.returnQty += layer.qty;
    }

    const totalNeed = perEvent.reduce((s, p) => s + p.need, 0);
    const totalReuse = perEvent.reduce((s, p) => s + p.reuse, 0);
    const totalFromStock = perEvent.reduce((s, p) => s + p.fromStock, 0);
    const totalShort = perEvent.reduce((s, p) => s + p.short, 0);
    const totalReturn = perEvent.reduce((s, p) => s + p.returnQty, 0);

    items.push({
      name: g.name,
      category: g.category,
      section: inv?.section || null,
      bodega,
      totalNeed,
      totalReuse,
      totalFromStock,
      totalShort,
      totalReturn,
      perEvent,
      transfers,
    });
  }

  items.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      b.totalShort - a.totalShort ||
      b.totalNeed - a.totalNeed ||
      a.name.localeCompare(b.name)
  );

  for (const ev of events) {
    ev.coverage = ev.need > 0 ? pct(ev.need - ev.short, ev.need) : 100;
  }

  const sumEvents = (k: keyof CompareMultiEvent) => events.reduce((s, e) => s + (Number(e[k]) || 0), 0);
  const need = sumEvents("need");
  const reuse = sumEvents("reuse");
  const fromStock = sumEvents("fromStock");
  const short = sumEvents("short");
  const returnQty = sumEvents("returnQty");
  const bodega = items.reduce((s, i) => s + i.bodega, 0);

  return {
    mode: "multi",
    directionWarning,
    source: events[0],
    target: events[events.length - 1],
    events,
    items,
    totals: {
      need,
      reuse,
      fromStock,
      short,
      returnQty,
      bodega,
      pctFromStock: pct(fromStock, need),
      pctReuse: pct(reuse, need),
      pctShort: pct(short, need),
      pctReturn: pct(returnQty, fromStock),
      coverage: pct(need - short, need),
    },
  };
}
