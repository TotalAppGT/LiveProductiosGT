import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { parseInventoryRows } from "@/lib/inventory";
import * as XLSX from "xlsx";

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Sube un cuadro ya realizado (Excel/CSV) y devuelve los ítems con el match
// contra el inventario + las discrepancias (descripciones que no coinciden).
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
    const parsed = parseInventoryRows(rows);

    if (parsed.length === 0) {
      return NextResponse.json({ success: false, error: "No se encontraron ítems en el archivo" }, { status: 400 });
    }

    const inv = await prisma.inventoryItem.findMany({
      select: { id: true, name: true, section: true, category: true, warehouse: true },
    });
    const byName = new Map(inv.map((i) => [norm(i.name), i]));

    function match(name: string) {
      const n = norm(name);
      if (byName.has(n)) return { item: byName.get(n)!, match: "exact" as const };
      let best: { k: string; v: (typeof inv)[number] } | null = null;
      for (const [k, v] of byName) {
        if (k.includes(n) || n.includes(k)) {
          if (!best || k.length > best.k.length) best = { k, v };
        }
      }
      if (best) return { item: best.v, match: "partial" as const };
      return { item: null, match: "none" as const };
    }

    const items = parsed.map((p) => {
      const m = match(p.name);
      return {
        name: p.name,
        quantity: p.quantity,
        section: p.section,
        matchedName: m.item?.name || null,
        inventoryItemId: m.item?.id || null,
        matchType: m.match,
      };
    });

    const discrepancies = items.filter((i) => i.matchType !== "exact");

    return NextResponse.json({
      success: true,
      data: { items, discrepancies, total: items.length, matched: items.length - discrepancies.length },
    });
  } catch (error) {
    console.error("Error importando cuadro:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
