import type { CompareData, CompareMultiData, CompareResult } from "@/lib/order-compare";
import { INVENTORY_SECTIONS } from "@/lib/inventory";

const displayCategory = (value: { section?: string | null; category?: string | null }) =>
  (value.section || value.category || "OTRO").toUpperCase();

const categoryRank = new Map(INVENTORY_SECTIONS.map((section, index) => [section.toUpperCase(), index]));
const sortCategories = (a: string, b: string) =>
  (categoryRank.get(a.toUpperCase()) ?? 999) - (categoryRank.get(b.toUpperCase()) ?? 999) || a.localeCompare(b);

const locationOf = (event: { eventLocation?: string | null; clientName?: string | null; eventName: string }) =>
  (event.eventLocation || event.clientName || event.eventName || "").trim();

export type Row = (string | number)[];

export type CompareTab = {
  key: string;
  name: string;
  rows: Row[];
  widths: number[];
  headerRows: number[];
  sectionRows: number[];
};

export const EXCEL_TAB_NAMES: Record<string, string> = {
  resumen: "Resumen",
  origen: "Origen",
  destino: "Destino",
  trasiego: "Trasiego",
  camion: "Camion destino",
  faltante: "Faltante destino",
  regresa: "Regresa origen",
  detalle: "Detalle por Categoria",
};

const ddmmyy = (iso: string | null) => {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

const dayMonth = (iso: string | null) => {
  if (!iso) return null;
  const [, m, d] = iso.split("-");
  return { d, m };
};

const windowLabel = (montage: string | null, event: string | null) => {
  const a = dayMonth(montage);
  const b = dayMonth(event);
  if (a && b) return a.m === b.m ? `${a.d}/${b.d}` : `${a.d}/${a.m} - ${b.d}/${b.m}`;
  return a ? `${a.d}/${a.m}` : b ? `${b.d}/${b.m}` : "";
};

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

const shortName = (eventName: string) => {
  let t = String(eventName || "").trim();
  t = t.replace(/^cuadro\s+\d{1,2}\/\d{1,2}\/\d{4}\s*[—–-]\s*/i, "");
  const parts = t.split(/\s+[-–—]\s+/);
  if (parts.length > 1) t = parts[parts.length - 1];
  return t.split(/\s+/)[0] || t || "Evento";
};

const safeName = (s: string) => {
  const cleaned = String(s || "")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Hoja";
};

function actionFor(sName: string, tName: string, r: CompareData["rows"][number]): string {
  if (r.targetQty === 0) return `No se usa en ${tName}`;
  const parts: string[] = [];
  if (r.transfer > 0) parts.push(`Trasladar de ${sName}`);
  if (r.targetFromStock > 0) parts.push("Llevar de bodega");
  if (r.targetShort > 0) parts.push("Compra/renta");
  return parts.length ? parts.join(" + ") : "Cubierto";
}

function quantityFor(r: CompareData["rows"][number]): number {
  if (r.transfer > 0) return r.transfer;
  if (r.targetFromStock > 0) return r.targetFromStock;
  if (r.targetShort > 0) return r.targetShort;
  return r.returnQty;
}

function coversFor(r: CompareData["rows"][number]): string {
  if (r.targetQty === 0) return "—";
  return r.targetShort === 0 ? "Sí" : "No";
}

export function buildReportTabs(data: CompareResult): CompareTab[] {
  return data.mode === "multi" ? buildMultiComparisonTabs(data) : buildComparisonTabs(data);
}

export function buildMultiComparisonTabs(data: CompareMultiData): CompareTab[] {
  const detailName = (e: { orderNumber: number; eventName: string; eventLocation?: string | null }) =>
    `#${e.orderNumber} ${e.eventName}${e.eventLocation ? ` · ${e.eventLocation}` : ""}`;
  const eventName = (id: string) => {
    const e = data.events.find((x) => x.id === id);
    return e ? `${detailName(e)} (${ddmmyy(e.eventDate)})` : "";
  };
  const eventByOrder = new Map(data.events.map((e) => [e.orderNumber, e]));
  const orderLabel = (orderNumber: number) => {
    const e = eventByOrder.get(orderNumber);
    return e ? detailName(e) : `#${orderNumber}`;
  };

  const resumen: Row[] = [
    [`RESUMEN — ${data.events.length} CUADROS`, "Unidades", "%"],
    ["Total necesario", data.totals.need, ""],
    ["Inventario usado (sale de bodega)", data.totals.fromStock, `${data.totals.pctFromStock}%`],
    ["Reutilizado entre cuadros (trasiego)", data.totals.reuse, `${data.totals.pctReuse}%`],
    ["Renta / compra", data.totals.short, `${data.totals.pctShort}%`],
    ["Regresa a bodega", data.totals.returnQty, `${data.totals.pctReturn}%`],
    ["Bodega inicial", data.totals.bodega, ""],
    ["Cobertura", data.totals.need - data.totals.short, `${data.totals.coverage}%`],
  ];

  const eventos: Row[] = [
    ["CUADRO", "EVENTO", "FECHA", "NECESITA", "INVENTARIO", "TRASIEGO", "RENTA/COMPRA", "REGENSA", "COBERTURA"],
    ...data.events.map((e) => [
      e.orderNumber,
      e.eventName,
      ddmmyy(e.eventDate),
      e.need,
      e.fromStock,
      e.reuse,
      e.short,
      e.returnQty,
      `${e.coverage}%`,
    ]),
  ];

  const inventarioItems = [...data.items].sort(
    (a, b) => b.totalShort - a.totalShort || b.totalNeed - a.totalNeed || a.name.localeCompare(b.name)
  );
  const inventario: Row[] = [
    ["ÍTEM", "CATEGORÍA", "BODEGA", "NECESITA", "INVENTARIO", "TRASIEGO", "RENTA/COMPRA", "REGENSA"],
    ...inventarioItems.map((i) => [
      i.name,
      displayCategory(i),
      i.bodega,
      i.totalNeed,
      i.totalFromStock,
      i.totalReuse,
      i.totalShort,
      i.totalReturn,
    ]),
  ];

  const itemsByCategory = new Map<string, CompareMultiData["items"]>();
  for (const item of data.items) {
    const cat = displayCategory(item);
    if (!itemsByCategory.has(cat)) itemsByCategory.set(cat, []);
    itemsByCategory.get(cat)!.push(item);
  }
  const categories = [...itemsByCategory.keys()].sort(sortCategories);

  const trasiegoBody: Row[] = [];
  const trasiegoSections: number[] = [];
  for (const cat of categories) {
    const entries: {
      item: CompareMultiData["items"][number];
      t: CompareMultiData["items"][number]["transfers"][number];
    }[] = [];
    for (const item of itemsByCategory.get(cat) || []) {
      for (const t of item.transfers) entries.push({ item, t });
    }
    if (!entries.length) continue;
    trasiegoSections.push(trasiegoBody.length + 1);
    trasiegoBody.push([cat]);
    entries.sort(
      (a, b) =>
        b.t.qty - a.t.qty ||
        b.item.totalReuse - a.item.totalReuse ||
        a.item.name.localeCompare(b.item.name)
    );
    for (const { item, t } of entries) {
      trasiegoBody.push([item.name, cat, t.qty, orderLabel(t.fromOrder), orderLabel(t.toOrder), ""]);
    }
  }
  const trasiego: Row[] = [
    ["ÍTEM", "CATEGORÍA", "CANTIDAD", "DESDE", "HACIA", "COMENTARIO"],
    ...trasiegoBody,
  ];

  const bodegaBody: Row[] = [];
  const bodegaSections: number[] = [];
  for (const cat of categories) {
    const entries: { item: CompareMultiData["items"][number]; p: CompareMultiData["items"][number]["perEvent"][number] }[] = [];
    for (const item of itemsByCategory.get(cat) || []) {
      for (const p of item.perEvent) if (p.fromStock > 0) entries.push({ item, p });
    }
    if (!entries.length) continue;
    bodegaSections.push(bodegaBody.length + 1);
    bodegaBody.push([cat]);
    entries.sort(
      (a, b) =>
        b.p.fromStock - a.p.fromStock ||
        a.item.name.localeCompare(b.item.name)
    );
    for (const { item, p } of entries) {
      bodegaBody.push([eventName(p.id), item.name, cat, p.fromStock, ""]);
    }
  }
  const bodega: Row[] = [
    ["CUADRO", "ÍTEM", "CATEGORÍA", "CANTIDAD", "COMENTARIO"],
    ...bodegaBody,
  ];

  const rentaBody: Row[] = [];
  const rentaSections: number[] = [];
  for (const cat of categories) {
    const entries: { item: CompareMultiData["items"][number]; p: CompareMultiData["items"][number]["perEvent"][number] }[] = [];
    for (const item of itemsByCategory.get(cat) || []) {
      for (const p of item.perEvent) if (p.short > 0) entries.push({ item, p });
    }
    if (!entries.length) continue;
    rentaSections.push(rentaBody.length + 1);
    rentaBody.push([cat]);
    entries.sort(
      (a, b) =>
        b.p.short - a.p.short ||
        a.item.name.localeCompare(b.item.name)
    );
    for (const { item, p } of entries) {
      rentaBody.push([eventName(p.id), item.name, cat, p.short, "Renta o compra"]);
    }
  }
  const renta: Row[] = [
    ["CUADRO", "ÍTEM", "CATEGORÍA", "CANTIDAD", "COMENTARIO"],
    ...rentaBody,
  ];

  const regresaRows: Row[] = data.items.flatMap((i) =>
    i.perEvent
      .filter((p) => p.returnQty > 0)
      .map((p) => [eventName(p.id), i.name, p.returnQty, "No se usa en cuadros posteriores", ""])
  );
  regresaRows.sort((a, b) => (Number(b[2]) || 0) - (Number(a[2]) || 0));
  const regresa: Row[] = [["CUADRO", "ÍTEM", "CANTIDAD", "MOTIVO", "COMENTARIO"], ...regresaRows];

  const detalle: Row[] = [
    ["DETALLE POR CATEGORÍA", "CUADRO", "FECHA", "NECESITA", "INVENTARIO", "TRASIEGO", "RENTA/COMPRA", "REGENSA", "COBERTURA"],
  ];
  const detailSections: number[] = [];
  const byCategory = new Map<string, CompareMultiData["items"]>();
  for (const item of data.items) {
    const cat = displayCategory(item);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }
  for (const cat of [...byCategory.keys()].sort(sortCategories)) {
    const catItems = byCategory.get(cat)!;
    detailSections.push(detalle.length);
    detalle.push([cat]);
    for (const item of catItems) {
      for (const p of item.perEvent) {
        if (p.need <= 0) continue;
        const e = data.events.find((x) => x.id === p.id);
        detalle.push([
          item.name,
          e ? `#${e.orderNumber} ${e.eventName}${e.eventLocation ? ` · ${e.eventLocation}` : ""}` : "",
          e ? ddmmyy(e.eventDate) : "",
          p.need,
          p.fromStock,
          p.reuse,
          p.short,
          p.returnQty,
          e ? `${e.coverage}%` : "",
        ]);
      }
    }
  }

  return [
    { key: "multi-resumen", name: "Resumen", rows: resumen, widths: [42, 12, 12], headerRows: [0], sectionRows: [] },
    { key: "multi-eventos", name: "Eventos", rows: eventos, widths: [10, 26, 10, 10, 12, 10, 14, 10, 12], headerRows: [0], sectionRows: [] },
    { key: "multi-inventario", name: "Inventario", rows: inventario, widths: [46, 16, 10, 10, 12, 10, 14, 10], headerRows: [0], sectionRows: [] },
    { key: "multi-trasiego", name: "Trasiego", rows: trasiego, widths: [46, 16, 12, 20, 16, 32], headerRows: [0], sectionRows: trasiegoSections },
    { key: "multi-bodega", name: "Bodega", rows: bodega, widths: [28, 46, 16, 12, 30], headerRows: [0], sectionRows: bodegaSections },
    { key: "multi-renta", name: "Renta-Compra", rows: renta, widths: [28, 46, 16, 12, 30], headerRows: [0], sectionRows: rentaSections },
    { key: "multi-regresa", name: "Regresa", rows: regresa, widths: [28, 46, 12, 30, 30], headerRows: [0], sectionRows: [] },
    { key: "multi-detalle", name: "Detalle", rows: detalle, widths: [46, 24, 10, 10, 12, 10, 14, 10, 12], headerRows: [0], sectionRows: detailSections },
  ];
}

export function buildComparisonTabs(data: CompareData): CompareTab[] {
  const s = data.source;
  const t = data.target;
  const tt = data.totals;
  const sName = shortName(s.eventName);
  const tName = shortName(t.eventName);
  const sourceLocation = locationOf(s);
  const targetLocation = locationOf(t);
  const sourceLabel = `#${s.orderNumber} ${s.eventName}${s.eventLocation ? ` · ${s.eventLocation}` : ""}`;
  const targetLabel = `#${t.orderNumber} ${t.eventName}${t.eventLocation ? ` · ${t.eventLocation}` : ""}`;
  const sd = ddmmyy(s.eventDate);
  const td = ddmmyy(t.eventDate);
  const tm = ddmmyy(t.montageDate);
  const targetWindow = windowLabel(t.montageDate, t.eventDate);

  const used = new Set<string>();
  const unique = (name: string) => {
    let candidate = safeName(name);
    let i = 2;
    while (used.has(candidate)) {
      const suffix = ` ${i++}`;
      candidate = safeName(name).slice(0, 31 - suffix.length) + suffix;
    }
    used.add(candidate);
    return candidate;
  };

  const detailRows: Row[] = [
    [
      "DETALLE POR CATEGORÍA",
      `${sName} ${sd}`,
      `${tName} ${targetWindow}`,
      "Bodega",
      "Qué hacer",
      "Cantidad",
      "¿Cubre?",
    ],
  ];
  const detailSections: number[] = [];
  const byCategory = new Map<string, CompareData["rows"]>();
  for (const r of data.rows) {
    const cat = displayCategory(r);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }
  for (const cat of [...byCategory.keys()].sort(sortCategories)) {
    const rows = byCategory.get(cat)!;
    detailSections.push(detailRows.length);
    detailRows.push([cat]);
    for (const r of rows) {
      detailRows.push([
        r.name,
        r.sourceQty,
        r.targetQty,
        r.bodega,
        actionFor(sName, tName, r),
        quantityFor(r),
        coversFor(r),
      ]);
    }
  }

  const pairByCategory = new Map<string, CompareData["rows"]>();
  for (const r of data.rows) {
    const cat = displayCategory(r);
    if (!pairByCategory.has(cat)) pairByCategory.set(cat, []);
    pairByCategory.get(cat)!.push(r);
  }
  const pairCategories = [...pairByCategory.keys()].sort(sortCategories);

  const pairTrasiegoBody: Row[] = [];
  const pairTrasiegoSections: number[] = [];
  for (const cat of pairCategories) {
    const entries = (pairByCategory.get(cat) || []).filter((r) => r.transfer > 0);
    if (!entries.length) continue;
    pairTrasiegoSections.push(pairTrasiegoBody.length + 1);
    pairTrasiegoBody.push([cat]);
    entries.sort((a, b) => b.transfer - a.transfer || a.name.localeCompare(b.name));
    for (const r of entries) {
      pairTrasiegoBody.push([r.name, cat, r.transfer, sourceLabel, targetLabel, ""]);
    }
  }

  const pairCamionBody: Row[] = [];
  const pairCamionSections: number[] = [];
  for (const cat of pairCategories) {
    const entries = (pairByCategory.get(cat) || []).filter((r) => r.targetFromStock > 0);
    if (!entries.length) continue;
    pairCamionSections.push(pairCamionBody.length + 1);
    pairCamionBody.push([cat]);
    entries.sort((a, b) => b.targetFromStock - a.targetFromStock || a.name.localeCompare(b.name));
    for (const r of entries) {
      pairCamionBody.push([r.name, cat, r.targetFromStock, "Sí", ""]);
    }
  }

  const pairFaltanteBody: Row[] = [];
  const pairFaltanteSections: number[] = [];
  for (const cat of pairCategories) {
    const entries = (pairByCategory.get(cat) || []).filter((r) => r.targetShort > 0);
    if (!entries.length) continue;
    pairFaltanteSections.push(pairFaltanteBody.length + 1);
    pairFaltanteBody.push([cat]);
    entries.sort((a, b) => b.targetShort - a.targetShort || a.name.localeCompare(b.name));
    for (const r of entries) {
      pairFaltanteBody.push([r.name, cat, r.targetShort, ""]);
    }
  }

  const resumen: Row[] = [
    ["COBERTURA", "Unidades", "%"],
    [`${sName} reutilizado en ${tName} (trasiego)`, tt.transfer, `${tt.pctTransferSource}% de ${sName}`],
    [`${tName} cubierto por ${sName}`, tt.transfer, `${tt.pctTransferTarget}% de ${tName}`],
    [`${tName} cargado de bodega`, tt.targetFromStock, `${tt.pctStockTarget}% de ${tName}`],
    [`${tName} faltante (no cubierto)`, tt.targetShort, `${tt.pctShortTarget}% de ${tName}`],
    [`${sName} faltante (no cubierto)`, tt.sourceShort, `${pctOf(tt.sourceShort, tt.source)}% de ${sName}`],
    [`${sName} que regresa a bodega`, tt.returnQty, `${tt.pctReturnSource}% de ${sName}`],
  ];

  return [
    { key: "resumen", name: unique("Resumen"), rows: resumen, widths: [42, 12, 26], headerRows: [0], sectionRows: [] },
    {
      key: "origen",
      name: unique(sName),
      rows: [
        [`CUADRO DE EQUIPO DEL EVENTO "${sourceLocation}"`, "Cantidad", "Sale de bodega", "Faltante", `Se traslada a ${tName}`, "Regresa a bodega", "Comentario"],
        ...data.rows.filter((r) => r.sourceQty > 0).sort((a, b) => b.sourceQty - a.sourceQty).map((r) => [r.name, r.sourceQty, r.stockSource, r.sourceShort, r.transfer, r.returnQty, ""]),
      ],
      widths: [46, 12, 14, 10, 18, 16, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "destino",
      name: unique(tName),
      rows: [
        [`CUADRO DE EQUIPO DEL EVENTO "${targetLocation}"`, "Cantidad", `Viene de ${sName}`, "Falta cargar de bodega", "Faltante", "Comentario"],
        ...data.rows.filter((r) => r.targetQty > 0).sort((a, b) => b.targetQty - a.targetQty).map((r) => [r.name, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, ""]),
      ],
      widths: [46, 12, 14, 20, 10, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "trasiego",
      name: unique("Trasiego"),
      rows: [
        [`CUADRO DE EQUIPO TRASIEGO DE EVENTO "${sourceLocation}" A "${targetLocation}"`, "Categoría", "Cantidad", "Desde", "Hacia", "Comentario"],
        ...pairTrasiegoBody,
      ],
      widths: [46, 16, 12, 20, 16, 32],
      headerRows: [0],
      sectionRows: pairTrasiegoSections,
    },
    {
      key: "camion",
      name: unique(`Camion ${tName}`),
      rows: [
        [`CUADRO DE EQUIPO DE BODEGA A EVENTO "${targetLocation}"`, "Categoría", "Cantidad", "¿Sale de bodega?", "Comentario"],
        ...pairCamionBody,
      ],
      widths: [46, 16, 12, 14, 32],
      headerRows: [0],
      sectionRows: pairCamionSections,
    },
    {
      key: "faltante",
      name: unique(`${tName} No cubierto`),
      rows: [
        [`CUADRO DE EQUIPO FALTANTE PARA EVENTO "${targetLocation}"`, "Categoría", "Cantidad", "Comentario"],
        ...pairFaltanteBody,
      ],
      widths: [46, 16, 12, 32],
      headerRows: [0],
      sectionRows: pairFaltanteSections,
    },
    {
      key: "regresa",
      name: unique("Regresa a Bodega"),
      rows: [
        [`CUADRO DE EQUIPO QUE REGRESA A BODEGA — EVENTO "${sourceLocation}"`, "Cantidad", "Motivo", "Comentario"],
        ...data.rows
          .filter((r) => r.returnQty > 0)
          .sort((a, b) => b.returnQty - a.returnQty)
          .map((r) => [r.name, r.returnQty, r.targetQty === 0 ? `No lo pide ${tName}` : `Solo se usa una parte en ${tName}`, ""]),
      ],
      widths: [46, 12, 28, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "detalle",
      name: unique("Detalle por Categoria"),
      rows: detailRows,
      widths: [46, 16, 16, 10, 34, 10, 10],
      headerRows: [0],
      sectionRows: detailSections,
    },
  ];
}

export function comparisonTabName(data: CompareResult): string {
  const events = data.mode === "pair" ? [data.source, data.target] : data.events;
  const dates = [...new Set(events.map((e) => ddmmyy(e.eventDate)).filter(Boolean))];
  const base = dates.length ? `Trasiego ${dates.join("-")}` : "Trasiego";
  return `${base} (${events.length} cuadros)`.slice(0, 100);
}

export function buildCombinedReportRows(data: CompareResult): Row[] {
  const events = data.mode === "pair" ? [data.source, data.target] : data.events;
  const detail = (e: { orderNumber: number; eventName: string; eventLocation?: string | null }) =>
    `#${e.orderNumber} ${e.eventName}${e.eventLocation ? ` · ${e.eventLocation}` : ""}`;
  const rows: Row[] = [];
  rows.push([`TRASIEGO — ${data.mode === "pair" ? "2 CUADROS" : `${events.length} CUADROS`}`]);
  rows.push([`Generado ${new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}`]);
  rows.push([]);
  rows.push(["EVENTOS SELECCIONADOS"]);
  rows.push(["#", "Evento", "Cliente", "Lugar", "Fecha"]);
  for (const e of events) {
    rows.push([`#${e.orderNumber}`, e.eventName, e.clientName || "", e.eventLocation || "", e.eventDate || ""]);
  }
  rows.push([]);
  for (const tab of buildReportTabs(data)) {
    rows.push([tab.name.toUpperCase()]);
    for (const row of tab.rows) rows.push([...row]);
    rows.push([]);
  }
  return rows;
}
