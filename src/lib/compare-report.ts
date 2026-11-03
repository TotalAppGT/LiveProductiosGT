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
