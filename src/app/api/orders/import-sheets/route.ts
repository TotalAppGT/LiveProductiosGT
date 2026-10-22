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

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

type ExistingOrder = Awaited<ReturnType<typeof findExistingOrders>>[number];

async function findExistingOrders() {
  return prisma.order.findMany({
    include: { items: true },
    orderBy: { orderNumber: "asc" },
  });
}

function isReplaceable(order: ExistingOrder): boolean {
  if (order.status !== "BORRADOR") return false;
  return order.items.every(
    (i) =>
      !i.preparedChecked &&
      !i.returnChecked &&
      (i.preparedPhotos || []).length === 0 &&
      (i.returnPhotos || []).length === 0
  );
}

function matchExisting(
  event: SheetEvent,
  orders: ExistingOrder[],
  used: Set<string>
): ExistingOrder | null {
  const day = dateKey(event.date);
  const client = norm(event.client);
  const candidates = orders.filter(
    (o) => o.eventDate && dateKey(o.eventDate) === day && !used.has(o.id)
  );
  if (candidates.length === 0) return null;
  return (
    candidates.find((o) => norm(o.clientName) === client) ||
    candidates.find((o) => norm(o.eventName).includes(client)) ||
    candidates.find(
      (o) =>
        !!o.clientName &&
        (client.includes(norm(o.clientName)) || norm(o.clientName).includes(client))
    ) ||
    null
  );
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

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "Archivo requerido" }, { status: 400 });
    }

    const mode = String(form.get("mode") || "preview");
    const replace = String(form.get("replace") || "0") === "1";
    const from = String(form.get("from") || "");
    const to = String(form.get("to") || "");
    const sheetsRaw = String(form.get("sheets") || "");
    const sheets = sheetsRaw
      ? sheetsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
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
      const replaceable = existing ? isReplaceable(existing) : false;
      const action: "create" | "update" | "skip" = !existing
        ? "create"
        : replace && replaceable
        ? "update"
        : replace
        ? "skip"
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
        replaceable,
        action,
      };
    });

    const allUnmatched = Array.from(new Set(preview.flatMap((e) => e.unmatched)));
    const totals = {
      events: preview.length,
      items: preview.reduce((s, e) => s + e.items, 0),
      matched: preview.reduce((s, e) => s + e.matched, 0),
      unmatched: allUnmatched.length,
      create: preview.filter((e) => e.action === "create").length,
      update: preview.filter((e) => e.action === "update").length,
      skip: preview.filter((e) => e.action === "skip").length,
    };

    if (mode !== "apply") {
      return NextResponse.json({
        success: true,
        data: { events: preview, totals, unmatched: allUnmatched },
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
      const replaceable = existing ? isReplaceable(existing) : false;
      const action: "create" | "update" | "skip" = !existing
        ? "create"
        : replace && replaceable
        ? "update"
        : replace
        ? "skip"
        : "create";

      if (action === "skip") {
        skipped++;
        continue;
      }

      const items = event.items.map(matchItem).map((i) => ({
        name: i.name,
        category: i.category,
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
      };

      if (action === "update" && existing) {
        await prisma.$transaction([
          prisma.orderItem.deleteMany({ where: { orderId: existing.id } }),
          prisma.order.update({
            where: { id: existing.id },
            data: { ...data, items: { create: items } },
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

    await prisma.activity
      .create({
        data: {
          userId: auth.payload.userId,
          action: "IMPORTAR_CUADROS",
          resource: "ORDER",
          details: `Importación Excel: ${created} nuevos, ${updated} actualizados, ${skipped} omitidos`,
        },
      })
      .catch(() => {});

    return NextResponse.json({
      success: true,
      data: { created, updated, skipped, totals, unmatched: allUnmatched, events: preview },
    });
  } catch (error) {
    console.error("Error import-sheets cuadros:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
