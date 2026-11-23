import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest, hasMinRole } from "@/lib/auth";
import { parseGTInputDate } from "@/lib/task-utils";
import * as XLSX from "xlsx";
import {
  buildItemMatcher,
  dateKey,
  eventNameFor,
  parseWorkbookEvents,
  type SheetEvent,
} from "@/lib/order-sheet-import";

const CUADROS_SHEET_ID = "1OL9oQ5pGs45ZTu5L2qud8xMqKTmYOcrzNFFo0epSPe4";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Estos estados ya tienen operación encima (inventario comprometido, evento en
// curso o cierre). No se borran solos para no perder historial.
const PROTECTED_STATUS = new Set(["LISTO", "EN_EVENTO", "POR_RECIBIR", "DEVUELTO"]);

type Scope = { sheets?: string[]; from: string; to: string };

type ExistingOrder = Awaited<ReturnType<typeof findExistingOrders>>[number];

async function findExistingOrders() {
  return prisma.order.findMany({
    include: {
      items: true,
      _count: {
        select: {
          reintegros: true,
          charges: true,
          approvalRequests: true,
          bitacora: true,
        },
      },
    },
    orderBy: { orderNumber: "asc" },
  });
}

function hasHistory(order: ExistingOrder): boolean {
  const c = order._count;
  return !!(c.reintegros || c.charges || c.approvalRequests || c.bitacora);
}

function canDelete(order: ExistingOrder): boolean {
  return (
    order.fromSheetImport &&
    !hasHistory(order) &&
    !PROTECTED_STATUS.has(order.status)
  );
}

function reasonToKeep(order: ExistingOrder): string {
  if (hasHistory(order)) return "Tiene historial (reintegros, cargos o aprobaciones)";
  if (PROTECTED_STATUS.has(order.status)) return `Cuadro en operación (${order.status})`;
  return "No se puede eliminar";
}

function inScope(order: ExistingOrder, scope: Scope): boolean {
  if (scope.sheets?.length) {
    return (
      !!order.sourceSheet &&
      scope.sheets.some((s) => norm(s) === norm(order.sourceSheet))
    );
  }
  if (scope.from || scope.to) {
    if (!order.eventDate) return false;
    const d = dateKey(order.eventDate);
    if (scope.from && d < scope.from) return false;
    if (scope.to && d > scope.to) return false;
  }
  return true;
}

function matchExisting(
  event: SheetEvent,
  orders: ExistingOrder[],
  used: Set<string>
): ExistingOrder | null {
  const day = dateKey(event.date);
  const client = norm(event.client);
  const sheet = norm(event.sheet);
  const candidates = orders.filter((o) => !used.has(o.id));

  // La pestaña manda: si solo cambió el cliente o la fecha dentro de la misma
  // pestaña, se actualiza el mismo cuadro en vez de crear un duplicado.
  const sameSheet = candidates.find(
    (o) =>
      !!o.sourceSheet &&
      norm(o.sourceSheet) === sheet &&
      ((o.eventDate && dateKey(o.eventDate) === day) ||
        (!!o.clientName && norm(o.clientName) === client))
  );
  if (sameSheet) return sameSheet;

  const sameDay = candidates.filter(
    (o) => o.eventDate && dateKey(o.eventDate) === day
  );
  if (sameDay.length === 0) return null;
  return (
    sameDay.find((o) => norm(o.clientName) === client) ||
    sameDay.find((o) => norm(o.eventName).includes(client)) ||
    sameDay.find(
      (o) =>
        !!o.clientName &&
        (client.includes(norm(o.clientName)) || norm(o.clientName).includes(client))
    ) ||
    null
  );
}

function itemKey(i: {
  name: string;
  service?: string | null;
  section?: string | null;
  subsection?: string | null;
  inventoryItemId?: string | null;
}): string {
  if (i.inventoryItemId) return `id:${i.inventoryItemId}`;
  return `n:${norm(i.name)}|${norm(i.service)}|${norm(i.section)}|${norm(i.subsection)}`;
}

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
    let wb: any;
    let mode = "preview";
    let replace = false;
    let from = "";
    let to = "";
    let sheets: string[] | undefined;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      mode = String(body.mode || "preview");
      replace = !!body.replace;
      from = String(body.from || "");
      to = String(body.to || "");
      const rawSheets = body.sheets;
      sheets = Array.isArray(rawSheets)
        ? rawSheets.map((s: unknown) => String(s).trim()).filter(Boolean)
        : typeof rawSheets === "string"
        ? rawSheets.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      if (body.source !== "google") {
        return NextResponse.json({ success: false, error: "Origen no soportado" }, { status: 400 });
      }
      const sheetId = String(body.sheetId || CUADROS_SHEET_ID);
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, {
        cache: "no-store",
      });
      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: `No se pudo leer la hoja de cuadros (${res.status})` },
          { status: 400 }
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    } else {
      const form = await request.formData();
      const file = form.get("file") as File | null;
      if (!file) {
        return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
      }
      mode = String(form.get("mode") || "preview");
      replace = String(form.get("replace") || "0") === "1";
      from = String(form.get("from") || "");
      to = String(form.get("to") || "");
      const sheetsRaw = String(form.get("sheets") || "");
      sheets = sheetsRaw
        ? sheetsRaw.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;

      const buf = Buffer.from(await file.arrayBuffer());
      wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    }

    const events = parseWorkbookEvents(wb, { sheets, from, to });

    if (events.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No se encontraron cuadros. Revisá que el Excel tenga las hojas con 'Fecha del evento' y 'CUADRO DE MONTAJE'.",
        },
        { status: 400 }
      );
    }

    const scope: Scope = { sheets, from, to };
    const [inventory, orders] = await Promise.all([
      prisma.inventoryItem.findMany({
        select: { id: true, name: true, category: true, status: true },
      }),
      findExistingOrders(),
    ]);

    const aliases = orders.flatMap((o) =>
      o.items
        .filter((i) => i.inventoryItemId)
        .map((i) => ({
          id: i.inventoryItemId as string,
          name: i.name,
          category: i.category,
        }))
    );
    const matchItem = buildItemMatcher(inventory, aliases);

    const used = new Set<string>();
    const preview = events.map((event) => {
      const items = event.items.map(matchItem);
      const existing = matchExisting(event, orders, used);
      if (existing) used.add(existing.id);
      const action: "create" | "update" | "skip" = !existing
        ? "create"
        : replace
        ? "update"
        : "create";
      const unmatchedNames = Array.from(
        new Set(items.filter((i) => i.matchType === "none").map((i) => i.name))
      );
      return {
        sheet: event.sheet,
        date: dateKey(event.date),
        client: event.client,
        location: event.location,
        guests: event.guests,
        items: items.length,
        quantity: items.reduce((s, i) => s + i.quantity, 0),
        matched: items.filter((i) => i.matchType !== "none").length,
        unmatched: unmatchedNames,
        existingOrderNumber: existing?.orderNumber ?? null,
        existingStatus: existing?.status ?? null,
        action,
      };
    });

    const removals = replace
      ? orders
          .filter((o) => o.fromSheetImport && !used.has(o.id) && inScope(o, scope))
          .map((o) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            eventName: o.eventName,
            status: o.status,
            action: canDelete(o) ? ("delete" as const) : ("keep" as const),
            reason: canDelete(o) ? "Ya no está en la hoja" : reasonToKeep(o),
          }))
      : [];

    const allUnmatched = Array.from(new Set(preview.flatMap((e) => e.unmatched)));
    const totals = {
      events: preview.length,
      items: preview.reduce((s, e) => s + e.items, 0),
      matched: preview.reduce((s, e) => s + e.matched, 0),
      unmatched: allUnmatched.length,
      create: preview.filter((e) => e.action === "create").length,
      update: preview.filter((e) => e.action === "update").length,
      skip: 0,
      delete: removals.filter((r) => r.action === "delete").length,
      keep: removals.filter((r) => r.action === "keep").length,
    };

    if (mode !== "apply") {
      return NextResponse.json({
        success: true,
        data: { events: preview, totals, unmatched: allUnmatched, removals },
      });
    }

    const last = await prisma.order.findFirst({
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    let nextNumber = (last?.orderNumber || 0) + 1;
    const usedApply = new Set<string>();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const event of events) {
      const existing = matchExisting(event, orders, usedApply);
      if (existing) usedApply.add(existing.id);
      const action: "create" | "update" = !existing
        ? "create"
        : replace
        ? "update"
        : "create";

      const items = event.items.map(matchItem).map((i) => ({
        name: i.name,
        category: i.category,
        service: i.service || null,
        section: i.section || null,
        subsection: i.subsection || null,
        quantity: i.quantity,
        inventoryItemId: i.inventoryItemId,
      }));
      // Las fechas del Excel son date-only. Guardarlas a medianoche de
      // Guatemala evita que el reporte (que muestra en GT) las corra un día.
      const eventDate = parseGTInputDate(dateKey(event.date)) || event.date;
      const data = {
        eventName: eventNameFor(eventDate, event.client),
        clientName: event.client || null,
        eventLocation: event.location || null,
        guestCount: event.guests,
        eventDate,
        eventEndDate: null,
        contractNotes: event.contract || null,
        fromSheetImport: true,
        sourceSheet: event.sheet,
      };

      if (action === "update" && existing) {
        // Se conserva el avance físico (checks/fotos) de los ítems que siguen
        // existiendo aunque cambie la cantidad o el orden.
        const pool = new Map<string, typeof existing.items>();
        for (const item of existing.items) {
          const key = itemKey(item);
          const list = pool.get(key) || [];
          list.push(item);
          pool.set(key, list);
        }
        const nextItems = items.map((item) => {
          const prev = pool.get(itemKey(item))?.shift();
          if (!prev) return item;
          return {
            ...item,
            preparedChecked: prev.preparedChecked,
            preparedPhotos: prev.preparedPhotos,
            preparedById: prev.preparedById,
            preparedAt: prev.preparedAt,
            returnChecked: prev.returnChecked,
            returnPhotos: prev.returnPhotos,
            returnedById: prev.returnedById,
            returnedAt: prev.returnedAt,
            returnCondition: prev.returnCondition,
            okQty: prev.okQty,
            damagedQty: prev.damagedQty,
            lostQty: prev.lostQty,
            unitValue: prev.unitValue,
            responsibleId: prev.responsibleId,
            returnNotes: prev.returnNotes,
          };
        });

        await prisma.$transaction([
          prisma.orderItem.deleteMany({ where: { orderId: existing.id } }),
          prisma.order.update({
            where: { id: existing.id },
            data: { ...data, items: { create: nextItems } },
          }),
        ]);
        updated++;
      } else {
        await prisma.order.create({
          data: {
            ...data,
            orderNumber: nextNumber++,
            status: "BORRADOR",
            createdById: auth.payload.userId,
            items: { create: items },
          },
        });
        created++;
      }
    }

    let deleted = 0;
    const deleteFailures: string[] = [];
    const kept = removals.filter((r) => r.action === "keep");
    for (const removal of removals) {
      if (removal.action !== "delete") continue;
      try {
        await prisma.order.delete({ where: { id: removal.id } });
        deleted++;
      } catch {
        deleteFailures.push(`#${removal.orderNumber}`);
      }
    }

    await prisma.activity
      .create({
        data: {
          userId: auth.payload.userId,
          action: "IMPORTAR_CUADROS",
          resource: "ORDER",
          details: `Sincronización de cuadros: ${created} nuevos, ${updated} actualizados, ${deleted} eliminados, ${skipped} omitidos`,
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        deleted,
        skipped,
        kept: kept.length,
        deleteFailures,
        totals,
        unmatched: allUnmatched,
        events: preview,
        removals,
      },
    });
  } catch (error) {
    console.error("Error import-sheets cuadros:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
