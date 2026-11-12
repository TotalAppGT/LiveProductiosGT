import type { CompareData, CompareMultiData, CompareResult } from "@/lib/order-compare";
import { INVENTORY_SECTIONS } from "@/lib/inventory";

const displayCategory = (value: { section?: string | null; category?: string | null }) =>
  (value.section || value.category || "OTRO").toUpperCase();

const categoryRank = new Map(INVENTORY_SECTIONS.map((section, index) => [section.toUpperCase(), index]));
const sortCategories = (a: string, b: string) =>
  (categoryRank.get(a.toUpperCase()) ?? 999) - (categoryRank.get(b.toUpperCase()) ?? 999) || a.localeCompare(b);


type HierarchyEntry = { row: Row; service: string; section: string; subsection: string; order: number };

function buildHierarchy(header: Row, entries: HierarchyEntry[]): { rows: Row[]; sections: number[] } {
  type SubGroup = { order: number; entries: HierarchyEntry[] };
  type SectionGroup = { order: number; subs: Map<string, SubGroup> };
  const services = new Map<string, { order: number; sections: Map<string, SectionGroup> }>();

  for (const entry of entries) {
    const service = (entry.service || "SIN SERVICIO").toUpperCase();
    const section = (entry.section || "GENERAL").toUpperCase();
    const subsection = (entry.subsection || "").toUpperCase();
    let serviceGroup = services.get(service);
    if (!serviceGroup) {
      serviceGroup = { order: entry.order, sections: new Map() };
      services.set(service, serviceGroup);
    }
    serviceGroup.order = Math.min(serviceGroup.order, entry.order);
    let sectionGroup = serviceGroup.sections.get(section);
    if (!sectionGroup) {
      sectionGroup = { order: entry.order, subs: new Map() };
      serviceGroup.sections.set(section, sectionGroup);
    }
    sectionGroup.order = Math.min(sectionGroup.order, entry.order);
    let sub = sectionGroup.subs.get(subsection);
    if (!sub) {
      sub = { order: entry.order, entries: [] };
      sectionGroup.subs.set(subsection, sub);
    }
    sub.order = Math.min(sub.order, entry.order);
    sub.entries.push(entry);
  }

  const body: Row[] = [];
  const sections: number[] = [];
  for (const [service, serviceGroup] of [...services.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))) {
    sections.push(body.length + 1);
    body.push([service]);
    for (const [section, sectionGroup] of [...serviceGroup.sections.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))) {
      sections.push(body.length + 1);
      body.push([`  ${section}`]);
      for (const [subsection, sub] of [...sectionGroup.subs.entries()].sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))) {
        if (subsection) {
          sections.push(body.length + 1);
          body.push([`    ${subsection}`]);
        }
        for (const entry of sub.entries.sort((a, b) => a.order - b.order)) body.push(entry.row);
      }
    }
  }
  return { rows: [header, ...body], sections };
}

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

  const multiTrasiegoEntries: HierarchyEntry[] = [];
  for (const item of data.items) {
    for (const t of item.transfers) {
      const recipient = item.perEvent.find((p) => p.orderNumber === t.toOrder);
      multiTrasiegoEntries.push({
        row: [item.name, recipient?.subsection || recipient?.section || recipient?.service || "GENERAL", t.qty, orderLabel(t.fromOrder), orderLabel(t.toOrder), ""],
        service: recipient?.service || "",
        section: recipient?.section || "",
        subsection: recipient?.subsection || "",
        order: item.order,
      });
    }
  }
  const multiBodegaEntries: HierarchyEntry[] = [];
  const multiRentaEntries: HierarchyEntry[] = [];
  const multiRegresaEntries: HierarchyEntry[] = [];
  for (const item of data.items) {
    for (const p of item.perEvent) {
      if (p.fromStock > 0) {
        multiBodegaEntries.push({
          row: [eventName(p.id), item.name, p.subsection || p.section || p.service || "GENERAL", p.fromStock, ""],
          service: p.service,
          section: p.section,
          subsection: p.subsection,
          order: item.order,
        });
      }
      if (p.short > 0) {
        multiRentaEntries.push({
          row: [eventName(p.id), item.name, p.subsection || p.section || p.service || "GENERAL", p.short, "Renta o compra"],
          service: p.service,
          section: p.section,
          subsection: p.subsection,
          order: item.order,
        });
      }
      if (p.returnQty > 0) {
        multiRegresaEntries.push({
          row: [eventName(p.id), item.name, p.subsection || p.section || p.service || "GENERAL", p.returnQty, "No se usa en cuadros posteriores", ""],
          service: p.service,
          section: p.section,
          subsection: p.subsection,
          order: item.order,
        });
      }
    }
  }
  const multiTrasiegoH = buildHierarchy(["ÍTEM", "SUBCATEGORÍA", "CANTIDAD", "DESDE", "HACIA", "COMENTARIO"], multiTrasiegoEntries);
  const multiBodegaH = buildHierarchy(["CUADRO", "ÍTEM", "SUBCATEGORÍA", "CANTIDAD", "COMENTARIO"], multiBodegaEntries);
  const multiRentaH = buildHierarchy(["CUADRO", "ÍTEM", "SUBCATEGORÍA", "CANTIDAD", "COMENTARIO"], multiRentaEntries);
  const multiRegresaH = buildHierarchy(["CUADRO", "ÍTEM", "SUBCATEGORÍA", "CANTIDAD", "MOTIVO", "COMENTARIO"], multiRegresaEntries);

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
    (a, b) =>
      (categoryRank.get(displayCategory(a)) ?? 999) - (categoryRank.get(displayCategory(b)) ?? 999) ||
      a.order - b.order
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
  const eventOrder = new Map(data.events.map((event, index) => [event.id, index]));

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
        a.item.order - b.item.order ||
        a.t.fromOrder - b.t.fromOrder ||
        b.t.qty - a.t.qty
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
        a.item.order - b.item.order ||
        (eventOrder.get(a.p.id) || 0) - (eventOrder.get(b.p.id) || 0)
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
        a.item.order - b.item.order ||
        (eventOrder.get(a.p.id) || 0) - (eventOrder.get(b.p.id) || 0)
    );
    for (const { item, p } of entries) {
      rentaBody.push([eventName(p.id), item.name, cat, p.short, "Renta o compra"]);
    }
  }
  const renta: Row[] = [
    ["CUADRO", "ÍTEM", "CATEGORÍA", "CANTIDAD", "COMENTARIO"],
    ...rentaBody,
  ];

  const regresaBody: Row[] = [];
  const regresaSections: number[] = [];
  for (const cat of categories) {
    const entries: { item: CompareMultiData["items"][number]; p: CompareMultiData["items"][number]["perEvent"][number] }[] = [];
    for (const item of itemsByCategory.get(cat) || []) {
      for (const p of item.perEvent) if (p.returnQty > 0) entries.push({ item, p });
    }
    if (!entries.length) continue;
    regresaSections.push(regresaBody.length + 1);
    regresaBody.push([cat]);
    entries.sort(
      (a, b) =>
        a.item.order - b.item.order ||
        (eventOrder.get(a.p.id) || 0) - (eventOrder.get(b.p.id) || 0)
    );
    for (const { item, p } of entries) {
      regresaBody.push([eventName(p.id), item.name, cat, p.returnQty, "No se usa en cuadros posteriores", ""]);
    }
  }
  const regresa: Row[] = [
    ["CUADRO", "ÍTEM", "CATEGORÍA", "CANTIDAD", "MOTIVO", "COMENTARIO"],
    ...regresaBody,
  ];

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
    const catItems = byCategory.get(cat)!.sort((a, b) => a.order - b.order);
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
    { key: "multi-trasiego", name: "Trasiego", rows: multiTrasiegoH.rows, widths: [46, 16, 12, 20, 16, 32], headerRows: [0], sectionRows: multiTrasiegoH.sections },
    { key: "multi-bodega", name: "Bodega", rows: multiBodegaH.rows, widths: [28, 46, 16, 12, 30], headerRows: [0], sectionRows: multiBodegaH.sections },
    { key: "multi-renta", name: "Renta-Compra", rows: multiRentaH.rows, widths: [28, 46, 16, 12, 30], headerRows: [0], sectionRows: multiRentaH.sections },
    { key: "multi-regresa", name: "Regresa", rows: multiRegresaH.rows, widths: [28, 46, 16, 12, 30, 30], headerRows: [0], sectionRows: multiRegresaH.sections },
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
    const rows = byCategory.get(cat)!.sort((a, b) => a.order - b.order);
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
    entries.sort((a, b) => a.order - b.order);
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
    entries.sort((a, b) => a.order - b.order);
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
    entries.sort((a, b) => a.order - b.order);
    for (const r of entries) {
      pairFaltanteBody.push([r.name, cat, r.targetShort, ""]);
    }
  }

  const pairRegresaBody: Row[] = [];
  const pairRegresaSections: number[] = [];
  for (const cat of pairCategories) {
    const entries = (pairByCategory.get(cat) || []).filter((r) => r.returnQty > 0);
    if (!entries.length) continue;
    pairRegresaSections.push(pairRegresaBody.length + 1);
    pairRegresaBody.push([cat]);
    entries.sort((a, b) => a.order - b.order);
    for (const r of entries) {
      pairRegresaBody.push([
        r.name,
        cat,
        r.returnQty,
        r.targetQty === 0 ? `No lo pide ${tName}` : `Solo se usa una parte en ${tName}`,
        "",
      ]);
    }
  }

  const pairTrasiegoH = buildHierarchy(
    [`CUADRO DE EQUIPO TRASIEGO DE EVENTO ${sourceLocation} A ${targetLocation}`, "Subcategoría", "Cantidad", "Desde", "Hacia", "Comentario"],
    data.rows.filter((r) => r.transfer > 0).map((r) => ({
      row: [r.name, r.targetSubsection || r.targetSection || r.targetService || "GENERAL", r.transfer, sourceLabel, targetLabel, ""],
      service: r.targetService,
      section: r.targetSection,
      subsection: r.targetSubsection,
      order: r.order,
    }))
  );
  const pairCamionH = buildHierarchy(
    [`CUADRO DE EQUIPO DE BODEGA A EVENTO ${targetLocation}`, "Subcategoría", "Cantidad", "¿Sale de bodega?", "Comentario"],
    data.rows.filter((r) => r.targetFromStock > 0).map((r) => ({
      row: [r.name, r.targetSubsection || r.targetSection || r.targetService || "GENERAL", r.targetFromStock, "Sí", ""],
      service: r.targetService,
      section: r.targetSection,
      subsection: r.targetSubsection,
      order: r.order,
    }))
  );
  const pairFaltanteH = buildHierarchy(
    [`CUADRO DE EQUIPO FALTANTE PARA EVENTO ${targetLocation}`, "Subcategoría", "Cantidad", "Comentario"],
    data.rows.filter((r) => r.targetShort > 0).map((r) => ({
      row: [r.name, r.targetSubsection || r.targetSection || r.targetService || "GENERAL", r.targetShort, ""],
      service: r.targetService,
      section: r.targetSection,
      subsection: r.targetSubsection,
      order: r.order,
    }))
  );
  const pairRegresaH = buildHierarchy(
    [`CUADRO DE EQUIPO QUE REGRESA A BODEGA — EVENTO ${sourceLocation}`, "Subcategoría", "Cantidad", "Motivo", "Comentario"],
    data.rows.filter((r) => r.returnQty > 0).map((r) => ({
      row: [r.name, r.sourceSubsection || r.sourceSection || r.sourceService || "GENERAL", r.returnQty, r.targetQty === 0 ? `No lo pide ${tName}` : `Solo se usa una parte en ${tName}`, ""],
      service: r.sourceService,
      section: r.sourceSection,
      subsection: r.sourceSubsection,
      order: r.order,
    }))
  );

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
        [`CUADRO DE EQUIPO DEL EVENTO ${sourceLocation}`, "Cantidad", "Sale de bodega", "Faltante", `Se traslada a ${tName}`, "Regresa a bodega", "Comentario"],
        ...data.rows.filter((r) => r.sourceQty > 0).sort((a, b) => a.order - b.order).map((r) => [r.name, r.sourceQty, r.stockSource, r.sourceShort, r.transfer, r.returnQty, ""]),
      ],
      widths: [46, 12, 14, 10, 18, 16, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "destino",
      name: unique(tName),
      rows: [
        [`CUADRO DE EQUIPO DEL EVENTO ${targetLocation}`, "Cantidad", `Viene de ${sName}`, "Falta cargar de bodega", "Faltante", "Comentario"],
        ...data.rows.filter((r) => r.targetQty > 0).sort((a, b) => a.order - b.order).map((r) => [r.name, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, ""]),
      ],
      widths: [46, 12, 14, 20, 10, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "trasiego",
      name: unique("Trasiego"),
      rows: pairTrasiegoH.rows,
      widths: [46, 16, 12, 20, 16, 32],
      headerRows: [0],
      sectionRows: pairTrasiegoH.sections,
    },
    {
      key: "camion",
      name: unique(`Camion ${tName}`),
      rows: pairCamionH.rows,
      widths: [46, 16, 12, 14, 32],
      headerRows: [0],
      sectionRows: pairCamionH.sections,
    },
    {
      key: "faltante",
      name: unique(`${tName} No cubierto`),
      rows: pairFaltanteH.rows,
      widths: [46, 16, 12, 32],
      headerRows: [0],
      sectionRows: pairFaltanteH.sections,
    },
    {
      key: "regresa",
      name: unique("Regresa a Bodega"),
      rows: pairRegresaH.rows,
      widths: [46, 16, 12, 28, 32],
      headerRows: [0],
      sectionRows: pairRegresaH.sections,
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
export type CompactList = { title: string; rows: Row[]; sections: number[] };

export function buildCompactTarget(data: CompareResult): CompactList {
  const location = (event: { eventLocation?: string | null; clientName?: string | null; eventName: string }) =>
    (event.eventLocation || event.clientName || event.eventName || "").trim();
  const title =
    data.mode === "pair"
      ? `CUADRO DE EQUIPO TRASIEGO DE EVENTO ${location(data.source)} A ${location(data.target)}`
      : `CUADRO DE EQUIPO TRASIEGO DE EVENTOS A ${location(data.target)}`;

  type Line = { name: string; qty: number; section: string; order: number };
  const lines: Line[] = [];
  if (data.mode === "pair") {
    for (const row of data.rows.filter((r) => r.targetQty > 0)) {
      lines.push({
        name: row.name,
        qty: row.targetQty,
        section: row.section || row.category || "OTRO",
        order: row.order,
      });
    }
  } else {
    const targetId = data.target.id;
    for (const item of data.items) {
      const allocation = item.perEvent.find((p) => p.id === targetId);
      if (!allocation || allocation.need <= 0) continue;
      lines.push({
        name: item.name,
        qty: allocation.need,
        section: item.section || item.category || "OTRO",
        order: item.order,
      });
    }
  }

  const grouped = new Map<string, Line[]>();
  for (const line of lines) {
    const section = String(line.section || "OTRO").toUpperCase();
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section)!.push(line);
  }
  const categories = [...grouped.keys()].sort(sortCategories);
  const rows: Row[] = [[title, "Cantidad"]];
  const sections: number[] = [];
  for (const category of categories) {
    sections.push(rows.length);
    rows.push([category]);
    for (const line of grouped.get(category)!.sort((a, b) => a.order - b.order)) {
      rows.push([line.name, line.qty]);
    }
  }
  return { title, rows, sections };
}
