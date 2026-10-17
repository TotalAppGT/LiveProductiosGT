import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import * as XLSX from "xlsx";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
};

// Carga masiva de cuadros desde la plantilla Excel. AGREGA (no borra lo existente).
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    if (!hasMinRole(auth.payload, "JEFE")) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const sheetName = wb.SheetNames.find((n) => /cuadro/i.test(n)) || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
    if (rows.length === 0) return NextResponse.json({ success: false, error: "El archivo no tiene filas" }, { status: 400 });

    function mapRow(row: Record<string, unknown>) {
      const out = { eventName: "", fecha: null as unknown, fechaFin: null as unknown, cliente: "", ubicacion: "", item: "", cantidad: 1 };
      for (const [k, v] of Object.entries(row)) {
        const nk = norm(k);
        if (nk.includes("cuadro") || nk.includes("evento")) out.eventName = String(v ?? "").trim();
        else if (nk.includes("fecha") && (nk.includes("fin") || nk.includes("final"))) out.fechaFin = v;
        else if (nk.startsWith("fecha")) out.fecha = v;
        else if (nk.includes("cliente")) out.cliente = String(v ?? "").trim();
        else if (nk.includes("ubicacion") || nk.includes("ubicación")) out.ubicacion = String(v ?? "").trim();
        else if (nk.includes("item") || nk.includes("ítem")) out.item = String(v ?? "").trim();
        else if (nk.includes("cantidad") || nk.includes("cant")) out.cantidad = Number(v) || 1;
      }
      return out;
    }

    const inv = await prisma.inventoryItem.findMany({ select: { id: true, name: true, category: true, status: true } });
    const byNorm = new Map<string, { id: string; name: string; category: string }>();
    for (const i of inv) {
      const k = norm(i.name);
      if (!byNorm.has(k) || i.status === "DISPONIBLE") byNorm.set(k, { id: i.id, name: i.name, category: i.category });
    }
    // Coincidencia estricta: exacta o similitud por tokens (Jaccard) con los
    // mismos números. Evita que descripciones genéricas ("cable de corriente")
    // se emparejen con nombres largos que las contienen.
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
      if (byNorm.has(n)) return byNorm.get(n)!;
      let best: { id: string; name: string; category: string } | null = null;
      let bestS = 0;
      for (const v of byNorm.values()) {
        if (numbersOf(name) !== numbersOf(v.name)) continue;
        const s = jaccard(name, v.name);
        if (s >= 0.6 && s > bestS) { bestS = s; best = v; }
      }
      return best;
    }

    type Group = { eventName: string; date: Date | null; endDate: Date | null; cliente: string; ubicacion: string; items: { name: string; category: string; quantity: number; inventoryItemId: string | null }[] };
    const groups = new Map<string, Group>();
    const unmatched = new Set<string>();
    for (const row of rows) {
      const m = mapRow(row);
      if (!m.eventName || !m.item) continue;
      const date = toDate(m.fecha);
      const key = `${norm(m.eventName)}|${date ? date.toISOString().slice(0, 10) : ""}`;
      let g = groups.get(key);
      if (!g) {
        g = { eventName: m.eventName, date, endDate: toDate(m.fechaFin), cliente: m.cliente, ubicacion: m.ubicacion, items: [] };
        groups.set(key, g);
      }
      const hit = match(m.item);
      if (!hit) unmatched.add(m.item);
      g.items.push({ name: m.item, category: hit?.category || "OTRO", quantity: m.cantidad, inventoryItemId: hit?.id || null });
    }

    if (groups.size === 0) return NextResponse.json({ success: false, error: "No se encontraron cuadros válidos (revisá las columnas)" }, { status: 400 });

    const last = await prisma.order.findFirst({ orderBy: { orderNumber: "desc" }, select: { orderNumber: true } });
    let num = last?.orderNumber || 0;
    let created = 0;
    let totalItems = 0;
    for (const g of groups.values()) {
      num++;
      await prisma.order.create({
        data: {
          orderNumber: num,
          eventName: g.eventName,
          clientName: g.cliente || null,
          eventLocation: g.ubicacion || null,
          eventDate: g.date,
          eventEndDate: g.endDate,
          status: "BORRADOR",
          createdById: auth.payload.userId,
          items: { create: g.items },
        },
      });
      created++;
      totalItems += g.items.length;
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "IMPORTAR_CUADROS",
        resource: "ORDER",
        details: `Carga masiva: ${created} cuadro(s), ${totalItems} ítem(s)`,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, created, totalItems, unmatched: Array.from(unmatched) });
  } catch (error) {
    console.error("Error import-bulk cuadros:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
