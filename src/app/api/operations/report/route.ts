import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import { createPdf, pdfHeader, drawTable, stampFooters, blockTitle, type Col } from "@/lib/pdf-utils";

const ROLE_LABELS: Record<string, string> = {
  AUDIO: "Audio", ILUMINACION: "Iluminación", CARGA: "Carga", DJ: "DJ", MUSICO: "Músico",
  PILOTO: "Piloto", PRODUCCION: "Producción", ZANQUERO: "Zanquero", OTRO: "Otro",
};
const STATUS_LABELS: Record<string, string> = { PENDIENTE: "Pendiente", CONFIRMADO: "Confirmado", RECHAZADO: "Rechazado" };

function mondayOf(dateStr?: string | null) {
  const gtToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  const base = dateStr || gtToday;
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay() || 7;
  return new Date(dt.getTime() - (day - 1) * 86400000).toISOString().slice(0, 10);
}
function fmtDate(v?: string | Date | null) {
  return v ? new Date(v).toLocaleDateString("es-GT", { timeZone: "America/Guatemala", weekday: "short", day: "numeric", month: "short" }) : "—";
}

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

    const params = new URL(request.url).searchParams;
    const format = (params.get("format") || "pdf").toLowerCase();
    const from = mondayOf(params.get("from"));
    const start = new Date(`${from}T00:00:00-06:00`);
    const end = new Date(start.getTime() + 7 * 86400000 - 1);

    const events = await prisma.event.findMany({
      where: { OR: [{ date: { gte: start, lte: end } }, { montageAt: { gte: start, lte: end } }] },
      orderBy: { date: "asc" },
      include: {
        crewRequirements: true,
        crewAssignments: { include: { staff: true, vehicle: true } },
        eventVehicles: { include: { vehicle: true, driver: true } },
        musicianShows: { include: { musician: true } },
      },
    });

    const fileBase = `operaciones-${from}`;

    if (format === "pdf") {
      const { doc, done } = createPdf();
      pdfHeader(doc, "Cuadro de operaciones", `${fmtDate(start)} — ${fmtDate(end)} · ${events.length} evento(s)`);
      if (events.length === 0) doc.font("Helvetica").fontSize(10).text("No hay eventos en la semana.");

      for (const ev of events) {
        doc.moveDown(0.5);
        blockTitle(doc, `${ev.name} — ${fmtDate(ev.date)}`, "#1e40af");
        doc.font("Helvetica").fontSize(8.5).fillColor("#374151");
        doc.text(`${ev.clientName || ""}${ev.venue ? ` · ${ev.venue}` : ""}`);

        const covCols: Col[] = [
          { w: 180, t: "Rol" }, { w: 45, t: "Req.", align: "right" }, { w: 45, t: "Asig.", align: "right" },
          { w: 45, t: "Conf.", align: "right" }, { w: 45, t: "Falta", align: "right" },
        ];
        const covRows = (ev.crewRequirements || []).map((r) => {
          const assigned = (ev.crewAssignments || []).filter((a) => a.role === r.role);
          return [
            { v: ROLE_LABELS[r.role] || r.role },
            { v: String(r.quantity) },
            { v: String(assigned.length) },
            { v: String(assigned.filter((a) => a.status === "CONFIRMADO").length) },
            { v: String(Math.max(0, r.quantity - assigned.length)) },
          ];
        });
        if (covRows.length) drawTable(doc, covCols, covRows);

        if ((ev.crewAssignments || []).length) {
          doc.moveDown(0.3);
          const asgCols: Col[] = [
            { w: 130, t: "Staff" }, { w: 65, t: "Rol" }, { w: 65, t: "Estado" },
            { w: 75, t: "Teléfono" }, { w: 75, t: "Vehículo" }, { w: 50, t: "Llamada" },
          ];
          drawTable(doc, asgCols, ev.crewAssignments.map((a) => [
            { v: a.staff?.name || "—" },
            { v: ROLE_LABELS[a.role] || a.role },
            { v: STATUS_LABELS[a.status] || a.status },
            { v: a.staff?.phone || "—" },
            { v: a.vehicle?.plate || "—" },
            { v: a.callTime || "—" },
          ]));
        }

        if ((ev.eventVehicles || []).length) {
          doc.moveDown(0.3);
          const vehCols: Col[] = [
            { w: 110, t: "Vehículo" }, { w: 95, t: "Piloto" }, { w: 55, t: "Pasaj." },
            { w: 55, t: "Asientos" }, { w: 65, t: "Carga m³" }, { w: 65, t: "Carga kg" },
          ];
          drawTable(doc, vehCols, ev.eventVehicles.map((x) => {
            const riding = (ev.crewAssignments || []).filter((a) => a.vehicleId === x.vehicleId).length;
            return [
              { v: `${x.vehicle?.plate || ""} ${x.vehicle?.name || ""}`.trim() },
              { v: x.driver?.name || "—" },
              { v: String(riding) },
              { v: x.vehicle?.seats ? String(x.vehicle.seats) : "—" },
              { v: x.cargoM3 ? String(x.cargoM3) : "—" },
              { v: x.cargoKg ? String(x.cargoKg) : "—" },
            ];
          }));
        }

        if ((ev.musicianShows || []).length) {
          doc.moveDown(0.3);
          const showCols: Col[] = [
            { w: 110, t: "Servicio" }, { w: 100, t: "Músico" }, { w: 120, t: "Lugar" }, { w: 120, t: "Horario" },
          ];
          drawTable(doc, showCols, ev.musicianShows.map((s) => [
            { v: s.service },
            { v: s.musician?.name || "—" },
            { v: s.venue || "—" },
            { v: s.startAt ? `${new Date(s.startAt).toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}${s.endAt ? ` - ${new Date(s.endAt).toLocaleTimeString("es-GT", { timeZone: "America/Guatemala", hour: "2-digit", minute: "2-digit" })}` : ""}` : "—" },
          ]));
        }
      }
      stampFooters(doc, "Operaciones — Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fileBase}.pdf"` },
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = "Live Productions GT";
    const ws = wb.addWorksheet("Operaciones");
    ws.columns = [
      { header: "Evento", key: "event", width: 30 },
      { header: "Fecha", key: "date", width: 16 },
      { header: "Rol", key: "role", width: 16 },
      { header: "Requeridos", key: "req", width: 12 },
      { header: "Asignados", key: "asg", width: 12 },
      { header: "Confirmados", key: "conf", width: 12 },
      { header: "Faltan", key: "missing", width: 10 },
      { header: "Staff", key: "staff", width: 28 },
      { header: "Teléfono", key: "phone", width: 16 },
      { header: "Estado", key: "status", width: 14 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const ev of events) {
      const reqs = ev.crewRequirements || [];
      if (reqs.length === 0) {
        ws.addRow({ event: ev.name, date: fmtDate(ev.date), role: "—", staff: "—" });
        continue;
      }
      for (const r of reqs) {
        const assigned = (ev.crewAssignments || []).filter((a) => a.role === r.role);
        const base = {
          event: ev.name,
          date: fmtDate(ev.date),
          role: ROLE_LABELS[r.role] || r.role,
          req: r.quantity,
          asg: assigned.length,
          conf: assigned.filter((a) => a.status === "CONFIRMADO").length,
          missing: Math.max(0, r.quantity - assigned.length),
        };
        if (assigned.length === 0) ws.addRow(base);
        else for (const a of assigned) ws.addRow({ ...base, staff: a.staff?.name || "", phone: a.staff?.phone || "", status: STATUS_LABELS[a.status] || a.status });
      }
    }
    ws.autoFilter = { from: "A1", to: "J1" };
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("operations report:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
