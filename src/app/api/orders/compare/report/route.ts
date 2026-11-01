import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { compareOrders, type CompareData } from "@/lib/order-compare";
import * as XLSX from "xlsx";

function buildRows(data: CompareData) {
  const rows: (string | number)[][] = [];
  const s = data.source;
  const t = data.target;
  const tt = data.totals;
  rows.push([`COMPARATIVA / TRASIEGO — #${s.orderNumber} ${s.eventName} → #${t.orderNumber} ${t.eventName}`]);
  rows.push([
    `Origen: ${s.eventDate || ""}${s.montageDate ? ` · traslado ${t.montageDate}` : ""}. Inventario primero para el origen; el destino reutiliza el origen y el camión destino carga solo lo que falta de bodega; lo que no se usa en el destino regresa a bodega.`,
  ]);
  rows.push([]);
  rows.push(["COBERTURA", "Unidades", "%"]);
  rows.push(["Reutilizado del origen en el destino (trasiego)", tt.transfer, tt.pctTransferSource + "% del origen"]);
  rows.push(["Destino cubierto por el origen", tt.transfer, tt.pctTransferTarget + "% del destino"]);
  rows.push(["Destino cargado de bodega", tt.targetFromStock, tt.pctStockTarget + "% del destino"]);
  rows.push(["Destino faltante", tt.targetShort, tt.pctShortTarget + "% del destino"]);
  rows.push(["Origen faltante", tt.sourceShort, "—"]);
  rows.push(["Origen que regresa a bodega", tt.returnQty, tt.pctReturnSource + "% del origen"]);
  rows.push([]);
  rows.push(["LISTA PARA EL ORIGEN", "Cantidad", "Sale de bodega", "Faltante", "Se traslada al destino", "Regresa a bodega", "Comentario"]);
  for (const r of data.rows.filter((x) => x.sourceQty > 0)) {
    rows.push([r.name, r.sourceQty, r.stockSource, r.sourceShort, r.transfer, r.returnQty, ""]);
  }
  rows.push([]);
  rows.push(["LISTA PARA EL DESTINO", "Cantidad", "Viene del origen", "Falta cargar de bodega", "Faltante", "Comentario"]);
  for (const r of data.rows.filter((x) => x.targetQty > 0)) {
    rows.push([r.name, r.targetQty, r.transfer, r.targetFromStock, r.targetShort, ""]);
  }
  rows.push([]);
  rows.push(["TRASIEGO ORIGEN → DESTINO", "Cantidad", "Desde", "Hacia", "Comentario"]);
  for (const r of data.rows.filter((x) => x.transfer > 0)) {
    rows.push([r.name, r.transfer, `#${s.orderNumber}`, `#${t.orderNumber}`, ""]);
  }
  rows.push([]);
  rows.push(["CAMION DESTINO — SOLO LO QUE FALTA DE BODEGA", "Cantidad", "¿Sale de bodega?", "Comentario"]);
  for (const r of data.rows.filter((x) => x.targetFromStock > 0)) {
    rows.push([r.name, r.targetFromStock, "Sí", ""]);
  }
  rows.push([]);
  rows.push(["DESTINO FALTANTE — NO CUBIERTO", "Cantidad", "Comentario"]);
  for (const r of data.rows.filter((x) => x.targetShort > 0)) {
    rows.push([r.name, r.targetShort, ""]);
  }
  rows.push([]);
  rows.push(["ORIGEN QUE REGRESA A BODEGA — NO SE USA EN EL DESTINO", "Cantidad", "Comentario"]);
  for (const r of data.rows.filter((x) => x.returnQty > 0)) {
    rows.push([r.name, r.returnQty, ""]);
  }
  return rows;
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
    const ws = XLSX.utils.aoa_to_sheet(buildRows(data));
    ws["!cols"] = [{ wch: 48 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Comparativa");
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
