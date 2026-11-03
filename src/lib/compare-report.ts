import type { CompareData } from "@/lib/order-compare";

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

const pctOf = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

const safeName = (s: string) => {
  const cleaned = String(s || "")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Hoja";
};

function actionFor(data: CompareData, r: CompareData["rows"][number]): string {
  const s = data.source.eventName;
  const t = data.target.eventName;
  if (r.targetQty === 0) return `No se usa en ${t}`;
  const parts: string[] = [];
  if (r.transfer > 0) parts.push(`Trasladar de ${s}`);
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

export function buildComparisonTabs(data: CompareData): CompareTab[] {
  const s = data.source;
  const t = data.target;
  const tt = data.totals;
  const sd = ddmmyy(s.eventDate);
  const td = ddmmyy(t.eventDate);
  const tm = ddmmyy(t.montageDate);
  const targetWindow = tm && td ? `${tm}/${td}` : tm || td;

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
      `${s.eventName} ${sd}`,
      `${t.eventName} ${targetWindow}`,
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
      detailRows.push([r.name, r.sourceQty, r.targetQty, r.bodega, actionFor(data, r), quantityFor(r), coversFor(r)]);
    }
  }

  const resumen: Row[] = [
    ["COBERTURA", "Unidades", "%"],
    [`${s.eventName} reutilizado en ${t.eventName} (trasiego)`, tt.transfer, `${tt.pctTransferSource}% de ${s.eventName}`],
    [`${t.eventName} cubierto por ${s.eventName}`, tt.transfer, `${tt.pctTransferTarget}% de ${t.eventName}`],
    [`${t.eventName} cargado de bodega`, tt.targetFromStock, `${tt.pctStockTarget}% de ${t.eventName}`],
    [`${t.eventName} faltante (no cubierto)`, tt.targetShort, `${tt.pctShortTarget}% de ${t.eventName}`],
    [`${s.eventName} faltante (no cubierto)`, tt.sourceShort, `${pctOf(tt.sourceShort, tt.source)}% de ${s.eventName}`],
    [`${s.eventName} que regresa a bodega`, tt.returnQty, `${tt.pctReturnSource}% de ${s.eventName}`],
  ];

  return [
    { key: "resumen", name: unique("Resumen"), rows: resumen, widths: [46, 12, 32], headerRows: [0], sectionRows: [] },
    {
      key: "origen",
      name: unique(s.eventName),
      rows: [
        [`LISTA PARA ${s.eventName} — ${sd}`, "Cantidad", "Sale de bodega", "Faltante", `Se traslada a ${t.eventName}`, "Regresa a bodega", "Comentario"],
        ...data.rows.filter((r) => r.sourceQty > 0).map((r) => [r.name, r.sourceQty, r.stockSource, r.sourceShort, r.transfer, r.returnQty, ""]),
      ],
      widths: [46, 12, 14, 10, 20, 16, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "destino",
      name: unique(t.eventName),
      rows: [
        [`LISTA PARA ${t.eventName} — ${targetWindow}`, "Cantidad", `Viene de ${s.eventName}`, "Falta cargar de bodega", "Faltante", "Comentario"],
        ...data.rows.filter((r) => r.targetQty > 0).map((r) => [r.name, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, ""]),
      ],
      widths: [46, 12, 16, 20, 10, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "trasiego",
      name: unique("Trasiego"),
      rows: [
        [`TRASIEGO ${s.eventName} → ${t.eventName} — ${tm}`, "Cantidad", "Desde", "Hacia", "Comentario"],
        ...data.rows
          .filter((r) => r.transfer > 0)
          .map((r) => [r.name, r.transfer, `Camion ${s.eventName} (${sd})`, `${t.eventName} (${tm})`, ""]),
      ],
      widths: [46, 12, 24, 20, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "camion",
      name: unique(`Camion ${t.eventName}`),
      rows: [
        [`CAMION ${t.eventName} — SOLO LO QUE FALTA DE BODEGA`, "Cantidad", "¿Sale de bodega?", "Comentario"],
        ...data.rows.filter((r) => r.targetFromStock > 0).map((r) => [r.name, r.targetFromStock, "Sí", ""]),
      ],
      widths: [46, 12, 14, 32],
      headerRows: [0],
      sectionRows: [],
    },
    {
      key: "faltante",
      name: unique(`${t.eventName} No cubierto`),
      rows: [
        [`${t.eventName} FALTANTE — NO CUBIERTO`, "Cantidad", "Comentario"],
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
        [`${s.eventName} QUE REGRESA A BODEGA — NO SE USA EN ${t.eventName}`, "Cantidad", "Motivo", "Comentario"],
        ...data.rows
          .filter((r) => r.returnQty > 0)
          .map((r) => [r.name, r.returnQty, r.targetQty === 0 ? `No lo pide ${t.eventName}` : `Solo se usa una parte en ${t.eventName}`, ""]),
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
