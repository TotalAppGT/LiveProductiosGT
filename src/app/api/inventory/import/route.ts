import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { categoryForSection, parseInventoryRows, type ParsedInventoryItem } from "@/lib/inventory";
import type { InventoryCategory } from "@prisma/client";
import * as XLSX from "xlsx";

const INVENTORY_SHEET_ID = "1orDO4t7PA8ZEDg3vWI5hbYcI6HA4vlbQECMeoAzGI8w";
const INVENTORY_GID = "862474686";

// Importa inventario desde Excel/CSV, JSON o sincroniza desde la hoja fija.
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
    let zeroMissing = true;
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
      mode = body.mode || "sync";
      zeroMissing = body.zeroMissing !== false;
      if (body.source === "google") {
        const sheetId = String(body.sheetId || INVENTORY_SHEET_ID);
        const gid = String(body.gid || INVENTORY_GID);
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          return NextResponse.json({ success: false, error: `No se pudo leer la hoja de inventario (${res.status})` }, { status: 400 });
        }
        const csv = await res.text();
        const wb = XLSX.read(csv, { type: "string" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
        items = parseInventoryRows(rows);
      } else {
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
    let zeroed = 0;

    if (mode === "sync") {
      // La hoja es la fuente: actualiza la cantidad exacta (no suma) y crea nuevos.
      const existing = await prisma.inventoryItem.findMany({ select: { id: true, name: true, status: true } });
      const byNorm = new Map<string, { id: string; status: string }>();
      for (const e of existing) {
        const k = norm(e.name);
        if (!byNorm.has(k) || e.status === "DISPONIBLE") byNorm.set(k, { id: e.id, status: e.status });
      }
      const seen = new Set<string>();
      for (const d of data) {
        const k = norm(d.name);
        seen.add(k);
        const ex = byNorm.get(k);
        if (ex) {
          await prisma.inventoryItem.update({
            where: { id: ex.id },
            data: {
              quantity: d.quantity,
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
      if (zeroMissing) {
        const missing = existing.filter((e) => e.status === "DISPONIBLE" && !seen.has(norm(e.name)));
        if (missing.length) {
          await prisma.inventoryItem.updateMany({
            where: { id: { in: missing.map((m) => m.id) } },
            data: { quantity: 0, lastCheckedAt: new Date() },
          });
          zeroed = missing.length;
        }
      }
    } else if (mode === "merge") {
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
        details: `Inventario importado (${mode}): ${created} nuevos, ${updated} actualizados/sumados, ${zeroed} en 0`,
      },
    }).catch(() => {});

    const sections = Array.from(new Set(items.map((i) => i.section).filter(Boolean)));
    return NextResponse.json({
      success: true,
      created,
      updated,
      zeroed,
      mode,
      sections,
      message:
        mode === "sync"
          ? `${created} nuevos · ${updated} actualizados · ${zeroed} en 0`
          : mode === "merge"
          ? `${created} nuevos · ${updated} sumados`
          : `${created} ítems importados`,
    });
  } catch (error) {
    console.error("Error importando inventario:", error);
    return NextResponse.json({ success: false, error: "Error interno del servidor" }, { status: 500 });
  }
}
