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
    const tokens = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1));
    const numbersOf = (s: string) => (norm(s).match(/\d+(\.\d+)?/g) || []).join(",");
    const jaccard = (a: string, b: string) => {
      const A = tokens(a), B = tokens(b);
      if (!A.size || !B.size) return 0;
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      return inter / (A.size + B.size - inter);
    };

    function match(name: string) {
      const n = norm(name);
      if (byName.has(n)) return { item: byName.get(n)!, match: "exact" as const };
      let best: (typeof inv)[number] | null = null;
      let bestS = 0;
      for (const v of byName.values()) {
        if (numbersOf(name) !== numbersOf(v.name)) continue;
        const s = jaccard(name, v.name);
        if (s >= 0.6 && s > bestS) { bestS = s; best = v; }
      }
      if (best) return { item: best, match: "partial" as const };
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
