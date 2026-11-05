import type { CompareData, CompareMultiData, CompareResult } from "@/lib/order-compare";

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
  const eventName = (id: string) => {
    const e = data.events.find((x) => x.id === id);
    return e ? `${e.orderNumber} · ${shortName(e.eventName)} (${ddmmyy(e.eventDate)})` : "";
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
      shortName(e.eventName),
      ddmmyy(e.eventDate),
      e.need,
      e.fromStock,
      e.reuse,
      e.short,
      e.returnQty,
      `${e.coverage}%`,
    ]),
  ];

  const inventario: Row[] = [
    ["ÍTEM", "CATEGORÍA", "BODEGA", "NECESITA", "INVENTARIO", "TRASIEGO", "RENTA/COMPRA", "REGENSA"],
    ...data.items.map((i) => [
      i.name,
      i.category,
      i.bodega,
      i.totalNeed,
      i.totalFromStock,
      i.totalReuse,
      i.totalShort,
      i.totalReturn,
    ]),
  ];

  const trasiego: Row[] = [
    ["ÍTEM", "CANTIDAD", "DESDE", "HACIA", "COMENTARIO"],
    ...data.items.flatMap((i) =>
      i.transfers.map((t) => [i.name, t.qty, `Cuadro ${t.fromOrder}`, `Cuadro ${t.toOrder}`, ""])
    ),
  ];

  const bodega: Row[] = [
    ["CUADRO", "ÍTEM", "CANTIDAD", "COMENTARIO"],
    ...data.items.flatMap((i) =>
      i.perEvent
        .filter((p) => p.fromStock > 0)
        .map((p) => [eventName(p.id), i.name, p.fromStock, ""])
    ),
  ];

  const renta: Row[] = [
    ["CUADRO", "ÍTEM", "CANTIDAD", "COMENTARIO"],
    ...data.items.flatMap((i) =>
      i.perEvent
        .filter((p) => p.short > 0)
        .map((p) => [eventName(p.id), i.name, p.short, "Renta o compra"])
    ),
  ];

  const regresa: Row[] = [
    ["CUADRO", "ÍTEM", "CANTIDAD", "MOTIVO", "COMENTARIO"],
    ...data.items.flatMap((i) =>
      i.perEvent
        .filter((p) => p.returnQty > 0)
        .map((p) => [eventName(p.id), i.name, p.returnQty, "No se usa en cuadros posteriores", ""])
    ),
  ];

  const detalle: Row[] = [
    ["DETALLE POR CATEGORÍA", "CUADRO", "FECHA", "NECESITA", "INVENTARIO", "TRASIEGO", "RENTA/COMPRA", "REGENSA", "COBERTURA"],
  ];
  const detailSections: number[] = [];
  const byCategory = new Map<string, CompareMultiData["items"]>();
  for (const item of data.items) {
    const cat = (item.category || "OTRO").toUpperCase();
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }
  for (const [cat, catItems] of byCategory) {
    detailSections.push(detalle.length);
    detalle.push([cat]);
    for (const item of catItems) {
      for (const p of item.perEvent) {
        if (p.need <= 0) continue;
        const e = data.events.find((x) => x.id === p.id);
        detalle.push([
          item.name,
          e ? `#${e.orderNumber} ${shortName(e.eventName)}` : "",
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
    { key: "multi-trasiego", name: "Trasiego", rows: trasiego, widths: [46, 12, 14, 14, 30], headerRows: [0], sectionRows: [] },
    { key: "multi-bodega", name: "Bodega", rows: bodega, widths: [28, 46, 12, 30], headerRows: [0], sectionRows: [] },
    { key: "multi-renta", name: "Renta-Compra", rows: renta, widths: [28, 46, 12, 30], headerRows: [0], sectionRows: [] },
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
    const cat = (r.category || "OTRO").toUpperCase();
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(r);
  }
  for (const [cat, rows] of byCategory) {
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
        [`LISTA PARA ${sName} — ${sd}`, "Cantidad", "Sale de bodega", "Faltante", `Se traslada a ${tName}`, "Regresa a bodega", "Comentario"],
        ...data.rows.filter((r) => r.sourceQty > 0).map((r) => [r.name, r.sourceQty, r.stockSource, r.sourceShort, r.transfer, r.returnQty, ""]),
      ],
      widths: [46, 12, 14, 10, 18, 16, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "destino",
      name: unique(tName),
      rows: [
        [`LISTA PARA ${tName} — ${targetWindow}`, "Cantidad", `Viene de ${sName}`, "Falta cargar de bodega", "Faltante", "Comentario"],
        ...data.rows.filter((r) => r.targetQty > 0).map((r) => [r.name, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, ""]),
      ],
      widths: [46, 12, 14, 20, 10, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "trasiego",
      name: unique("Trasiego"),
      rows: [
        [`TRASIEGO ${sName} → ${tName} — ${tm}`, "Cantidad", "Desde", "Hacia", "Comentario"],
        ...data.rows
          .filter((r) => r.transfer > 0)
          .map((r) => [r.name, r.transfer, `Camion ${sName} (${sd})`, `${tName} (${tm})`, ""]),
      ],
      widths: [46, 12, 20, 16, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "camion",
      name: unique(`Camion ${tName}`),
      rows: [
        [`CAMION ${tName} — SOLO LO QUE FALTA DE BODEGA`, "Cantidad", "¿Sale de bodega?", "Comentario"],
        ...data.rows.filter((r) => r.targetFromStock > 0).map((r) => [r.name, r.targetFromStock, "Sí", ""]),
      ],
      widths: [46, 12, 14, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "faltante",
      name: unique(`${tName} No cubierto`),
      rows: [
        [`${tName} FALTANTE — NO CUBIERTO`, "Cantidad", "Comentario"],
        ...data.rows.filter((r) => r.targetShort > 0).map((r) => [r.name, r.targetShort, ""]),
      ],
      widths: [46, 12, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "regresa",
      name: unique("Regresa a Bodega"),
      rows: [
        [`${sName} QUE REGRESA A BODEGA — NO SE USA EN ${tName}`, "Cantidad", "Motivo", "Comentario"],
        ...data.rows
          .filter((r) => r.returnQty > 0)
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
