import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { compareOrders, type CompareData } from "@/lib/order-compare";
import * as XLSX from "xlsx";

type Row = (string | number)[];

function coverageRows(data: CompareData): Row[] {
  const s = data.source;
  const t = data.target;
  const tt = data.totals;
  return [
    [`COMPARATIVA / TRASIEGO — #${s.orderNumber} ${s.eventName} → #${t.orderNumber} ${t.eventName}`],
    [`Origen ${s.eventDate || ""} · destino ${t.eventDate || ""}${t.montageDate ? ` · traslado ${t.montageDate}` : ""}`],
    [],
    ["Concepto", "Unidades", "%"],
    ["Origen", tt.source, ""],
    ["Destino", tt.target, ""],
    ["Trasiego origen → destino", tt.transfer, `${tt.pctTransferSource}% origen / ${tt.pctTransferTarget}% destino`],
    ["Destino desde bodega", tt.targetFromStock, `${tt.pctStockTarget}% destino`],
    ["Destino faltante", tt.targetShort, `${tt.pctShortTarget}% destino`],
    ["Origen faltante", tt.sourceShort, ""],
    ["Origen que regresa a bodega", tt.returnQty, `${tt.pctReturnSource}% origen`],
  ];
}

function origenRows(data: CompareData): Row[] {
  return [
    ["LISTA PARA EL ORIGEN", "Cantidad", "Sale de bodega", "Faltante", "Se traslada al destino", "Regresa a bodega", "Comentario"],
    ...data.rows.filter((r) => r.sourceQty > 0).map((r) => [r.name, r.sourceQty, r.stockSource, r.sourceShort, r.transfer, r.returnQty, ""]),
  ];
}

function destinoRows(data: CompareData): Row[] {
  return [
    ["LISTA PARA EL DESTINO", "Cantidad", "Viene del origen", "Falta cargar de bodega", "Faltante", "Comentario"],
    ...data.rows.filter((r) => r.targetQty > 0).map((r) => [r.name, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, ""]),
  ];
}

function trasiegoRows(data: CompareData): Row[] {
  const s = data.source;
  const t = data.target;
  return [
    ["TRASIEGO ORIGEN → DESTINO", "Cantidad", "Desde", "Hacia", "Comentario"],
    ...data.rows.filter((r) => r.transfer > 0).map((r) => [r.name, r.transfer, `#${s.orderNumber}`, `#${t.orderNumber}`, ""]),
  ];
}

function camionRows(data: CompareData): Row[] {
  return [
    ["CAMION DESTINO — SOLO LO QUE FALTA DE BODEGA", "Cantidad", "¿Sale de bodega?", "Comentario"],
    ...data.rows.filter((r) => r.targetFromStock > 0).map((r) => [r.name, r.targetFromStock, "Sí", ""]),
  ];
}

function faltanteRows(data: CompareData): Row[] {
  return [
    ["DESTINO FALTANTE — NO CUBIERTO", "Cantidad", "Comentario"],
    ...data.rows.filter((r) => r.targetShort > 0).map((r) => [r.name, r.targetShort, ""]),
  ];
}

function regresaRows(data: CompareData): Row[] {
  return [
    ["ORIGEN QUE REGRESA A BODEGA — NO SE USA EN EL DESTINO", "Cantidad", "Comentario"],
    ...data.rows.filter((r) => r.returnQty > 0).map((r) => [r.name, r.returnQty, ""]),
  ];
}

function detalleRows(data: CompareData): Row[] {
  return [
    ["DETALLE POR CATEGORÍA", "Origen", "Destino", "Traslado", "Bodega destino", "Faltante destino", "Regresa origen"],
    ...data.rows.map((r) => [r.name, r.sourceQty, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, r.returnQty]),
  ];
}

export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const body = await request.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length < 2) return NextResponse.json({ success: false, error: "Seleccioná al menos 2 cuadros" }, { status: 400 });

    const data = await compareOrders(ids);
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: Row[], widths: number[]) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws["!cols"] = widths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add("Cobertura", coverageRows(data), [44, 12, 32]);
    add("Origen", origenRows(data), [46, 12, 14, 10, 18, 16, 32]);
    add("Destino", destinoRows(data), [46, 12, 16, 20, 10, 32]);
    add("Trasiego", trasiegoRows(data), [46, 12, 10, 10, 32]);
    add("Camión destino", camionRows(data), [46, 12, 14, 32]);
    add("Faltante destino", faltanteRows(data), [46, 12, 32]);
    add("Regresa origen", regresaRows(data), [46, 12, 32]);
    add("Detalle", detalleRows(data), [46, 10, 10, 10, 14, 14, 14]);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="comparativa-${data.source.orderNumber}-${data.target.orderNumber}.xlsx"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("Error generando comparativa:", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
