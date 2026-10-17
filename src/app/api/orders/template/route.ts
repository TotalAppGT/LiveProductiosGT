import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

// Plantilla XLSX para cargar cuadros: incluye el inventario (pestaña "Inventario")
// y una lista desplegable de ítems en la pestaña "Cuadro".
export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const inv = await prisma.inventoryItem.findMany({
      where: { status: "DISPONIBLE" },
      select: { name: true, section: true },
      orderBy: [{ section: "asc" }, { name: "asc" }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const BRAND = "1E40AF";
    const headFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF" + BRAND } };
    const border = { top: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, left: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, bottom: { style: "thin" as const, color: { argb: "FFD1D5DB" } }, right: { style: "thin" as const, color: { argb: "FFD1D5DB" } } };

    const ws = wb.addWorksheet("Cuadro");
    ws.columns = [
      { width: 30 }, { width: 13 }, { width: 13 }, { width: 24 }, { width: 24 }, { width: 42 }, { width: 10 },
    ];
    ["Cuadro (evento)", "Fecha", "Fecha fin", "Cliente", "Ubicación", "Ítem (elegí de la lista)", "Cantidad"].forEach((h, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill; c.border = border;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    ws.getRow(1).height = 22;
    ws.views = [{ state: "frozen", ySplit: 1 }];

    // Lista de inventario para el desplegable.
    const invSheet = wb.addWorksheet("Inventario");
    invSheet.columns = [{ width: 44 }, { width: 22 }];
    ["Ítem", "Sección"].forEach((h, i) => { const c = invSheet.getCell(1, i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.fill = headFill; });
    inv.forEach((it, i) => {
      invSheet.getCell(i + 2, 1).value = it.name;
      invSheet.getCell(i + 2, 2).value = it.section || "";
    });
    const lastInv = Math.max(2, inv.length + 1);

    // Desplegable de ítems en 200 filas.
    for (let r = 2; r <= 200; r++) {
      ws.getCell(`F${r}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`Inventario!$A$2:$A$${lastInv}`],
        showErrorMessage: true,
        errorTitle: "Ítem",
        error: "Elegí un ítem de la lista (pestaña Inventario).",
      };
    }

    // Pestaña de ayuda.
    const help = wb.addWorksheet("Instrucciones");
    help.columns = [{ width: 100 }];
    [
      "CÓMO CARGAR CUADROS",
      "",
      "1) En la pestaña 'Cuadro', una fila por ítem.",
      "2) 'Cuadro (evento)' y 'Fecha' identifican el cuadro: todas las filas con el mismo Cuadro+Fecha se unen en un solo cuadro.",
      "3) Elige el ítem desde la lista desplegable (columna F) para evitar diferencias de descripción.",
      "4) Cantidad en unidades.",
      "5) Al subir, los cuadros se AGREGAN (no se borra lo existente).",
      "",
      `Inventario cargado: ${inv.length} ítems disponibles.`,
    ].forEach((t, i) => { help.getCell(i + 1, 1).value = t; if (i === 0) help.getCell(i + 1, 1).font = { bold: true, size: 13 }; });

    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(Buffer.from(buf) as unknown as BodyInit, {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="plantilla-cuadros.xlsx"` },
    });
  } catch (error) {
    console.error("Error plantilla cuadros:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
