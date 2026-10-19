import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { categoryForSection, parseInventoryRows, type ParsedInventoryItem } from "@/lib/inventory";
import type { InventoryCategory } from "@prisma/client";
import * as XLSX from "xlsx";

// Importa inventario desde Excel/CSV o JSON. mode: "append" | "replace"
export async function POST(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }
    if (!hasMinRole(auth.payload, "JEFE")) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") || "";
    let mode = "append";
    let items: ParsedInventoryItem[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      mode = String(form.get("mode") || "append");
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
      items = parseInventoryRows(rows);
    } else {
      const body = await request.json();
      mode = body.mode || "append";
      items = (body.items || [])
        .map((it: Record<string, unknown>) => ({
          name: String(it.name || "").trim(),
          section: it.section ? String(it.section).toUpperCase() : null,
          category: (it.category as InventoryCategory) || categoryForSection(it.section as string | null),
          quantity: Number(it.quantity) || 0,
          location: it.location ? String(it.location) : undefined,
          serialNumber: it.serialNumber ? String(it.serialNumber) : null,
          notes: it.notes ? String(it.notes) : null,
        }))
        .filter((it: ParsedInventoryItem) => it.name);
    }

    if (items.length === 0) {
      return NextResponse.json({ success: false, error: "No se encontraron ítems para importar" }, { status: 400 });
    }

    if (mode === "replace") {
      await prisma.inventoryItem.deleteMany({});
    }

    const data = items.map((it) => ({
      name: it.name,
      section: it.section,
      category: it.category,
      quantity: it.quantity,
      location: it.location || "Bodega Cristo Rey",
      status: "DISPONIBLE" as const,
      serialNumber: it.serialNumber || null,
      notes: it.notes || null,
      lastCheckedAt: new Date(),
    }));

    const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    let created = 0;
    let updated = 0;

    if (mode === "merge") {
      // Sumar/agregar sin borrar: si el ítem existe (por nombre) se SUMA la cantidad; si no, se crea.
      const existing = await prisma.inventoryItem.findMany({ select: { id: true, name: true, status: true } });
      const byNorm = new Map<string, { id: string; status: string }>();
      for (const e of existing) {
        const k = norm(e.name);
        if (!byNorm.has(k) || e.status === "DISPONIBLE") byNorm.set(k, { id: e.id, status: e.status });
      }
      for (const d of data) {
        const ex = byNorm.get(norm(d.name));
        if (ex) {
          await prisma.inventoryItem.update({
            where: { id: ex.id },
            data: {
              quantity: { increment: d.quantity },
              ...(d.section ? { section: d.section } : {}),
              ...(d.category ? { category: d.category } : {}),
              lastCheckedAt: new Date(),
            },
          });
          updated++;
        } else {
          await prisma.inventoryItem.create({ data: d });
          created++;
        }
      }
    } else {
      await prisma.inventoryItem.createMany({ data });
      created = data.length;
    }

    await prisma.activity.create({
      data: {
        userId: auth.payload.userId,
        action: "IMPORTAR_INVENTARIO",
        resource: "INVENTORY",
        details: `Inventario importado (${mode}): ${created} nuevos, ${updated} actualizados/sumados`,
      },
    }).catch(() => {});

    const sections = Array.from(new Set(items.map((i) => i.section).filter(Boolean)));
    return NextResponse.json({
      success: true,
      created,
      updated,
      mode,
      sections,
      message: mode === "merge" ? `${created} nuevos · ${updated} sumados` : `${created} ítems importados`,
    });
  } catch (error) {
    console.error("Error importando inventario:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
