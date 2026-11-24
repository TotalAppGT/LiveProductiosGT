import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRequest } from "@/lib/auth";
import {
  createPdf,
  dataUrlImage,
  pdfHeader,
  kpiRow,
  blockTitle,
  stampFooters,
} from "@/lib/pdf-utils";

const nf = (n: number) => (Number(n) || 0).toLocaleString("es-GT");
const money = (n: number) => `Q${(Number(n) || 0).toFixed(2)}`;
const fmtDate = (d: Date | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("es-GT", {
        timeZone: "America/Guatemala",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Sin revisión";

export async function GET(request: NextRequest) {
  try {
    const auth = authenticateRequest(request);
    if ("error" in auth) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const format = (searchParams.get("format") || "pdf").toLowerCase();
    const section = searchParams.get("section") || "";
    const warehouse = searchParams.get("warehouse") || "";

    if (format !== "pdf") {
      return NextResponse.json(
        { success: false, error: "Formato no soportado. Usá format=pdf" },
        { status: 400 }
      );
    }

    const where: any = {
      OR: [{ lostQty: { gt: 0 } }, { status: "PERDIDO" }],
    };
    if (section) where.section = section;
    if (warehouse) where.warehouse = warehouse;

    const items = await prisma.inventoryItem.findMany({
      where,
      orderBy: [{ section: "asc" }, { name: "asc" }],
    });

    const rows = items.map((item) => {
      const lostUnits = item.lostQty > 0 ? item.lostQty : item.status === "PERDIDO" ? item.quantity : 0;
      const unitValue = Number(item.unitValue || 0);
      return {
        ...item,
        lostUnits,
        unitValue,
        amount: lostUnits * unitValue,
        photo: item.photos?.[0] || null,
      };
    });

    const totalUnits = rows.reduce((s, r) => s + r.lostUnits, 0);
    const totalValue = rows.reduce((s, r) => s + r.amount, 0);
    const withPhoto = rows.filter((r) => !!dataUrlImage(r.photo)).length;

    const { doc, done } = createPdf();
    pdfHeader(
      doc,
      "Reporte de equipo perdido",
      `${nf(rows.length)} ítems con pérdida · ${nf(totalUnits)} unidades · ${money(totalValue)} estimado${
        section ? ` · Sección: ${section}` : ""
      }`
    );

    kpiRow(doc, [
      { label: "Ítems", value: nf(rows.length), color: "#b91c1c" },
      { label: "Unidades perdidas", value: nf(totalUnits), color: "#b91c1c" },
      { label: "Valor estimado", value: money(totalValue), color: "#7f1d1d" },
      { label: "Con foto", value: `${withPhoto}/${rows.length}`, color: "#1e40af" },
    ]);

    if (rows.length === 0) {
      doc.moveDown(0.6);
      doc.font("Helvetica").fontSize(10).fillColor("#374151").text(
        "No hay equipo marcado como perdido en este momento."
      );
      stampFooters(doc, "Equipo perdido · Live Productions GT");
      doc.end();
      const buf = await done;
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="equipo-perdido-${new Date()
            .toISOString()
            .slice(0, 10)}.pdf"`,
        },
      });
    }

    const x0 = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const photoSize = 66;
    const gap = 10;
    const textX = x0 + photoSize + gap;
    const textW = right - textX;
    let currentSection = "";

    for (const item of rows) {
      const sectionName = (item.section || "SIN SECCIÓN").toUpperCase();
      if (sectionName !== currentSection) {
        if (doc.y > doc.page.height - doc.page.margins.bottom - 120) {
          doc.addPage();
        }
        blockTitle(doc, sectionName, "#b91c1c");
        currentSection = sectionName;
      }

      const meta = `${item.category} · Perdido: ${nf(item.lostUnits)} u · Valor: ${money(
        item.amount
      )}${item.serialNumber ? ` · Serie: ${item.serialNumber}` : ""}`;
      const usefulNotes =
        item.notes && item.notes.trim() !== "Carga desde INVENTARIO DISPONIBLE"
          ? item.notes.trim()
          : "";
      const notes = usefulNotes ? `Notas: ${usefulNotes}` : "";
      const reviewed = `Última revisión: ${fmtDate(item.lastCheckedAt)}`;

      doc.font("Helvetica-Bold").fontSize(9.5);
      const nameH = doc.heightOfString(item.name, { width: textW });
      doc.font("Helvetica").fontSize(8);
      const metaH = doc.heightOfString(meta, { width: textW });
      const notesH = notes ? doc.heightOfString(notes, { width: textW }) : 0;
      const reviewedH = doc.heightOfString(reviewed, { width: textW });
      const cardH = Math.max(photoSize, nameH + metaH + notesH + reviewedH + 14) + 10;

      if (doc.y + cardH > doc.page.height - doc.page.margins.bottom - 18) {
        doc.addPage();
        currentSection = "";
        blockTitle(doc, sectionName, "#b91c1c");
        currentSection = sectionName;
      }

      const y = doc.y;
      const photo = dataUrlImage(item.photo);
      if (photo) {
        try {
          doc.image(photo, x0, y, { fit: [photoSize, photoSize], align: "center", valign: "center" });
        } catch {
          drawPhotoPlaceholder(doc, x0, y, photoSize);
        }
      } else {
        drawPhotoPlaceholder(doc, x0, y, photoSize);
      }

      let ty = y;
      doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#111827").text(item.name, textX, ty, {
        width: textW,
      });
      ty = doc.y;
      doc.font("Helvetica").fontSize(8).fillColor("#4b5563").text(meta, textX, ty + 1, {
        width: textW,
      });
      ty = doc.y;
      if (notes) {
        doc.font("Helvetica").fontSize(8).fillColor("#6b7280").text(notes, textX, ty + 1, {
          width: textW,
        });
        ty = doc.y;
      }
      doc.font("Helvetica").fontSize(7.5).fillColor("#9ca3af").text(reviewed, textX, ty + 1, {
        width: textW,
      });

      const bottom = Math.max(y + photoSize, doc.y) + 8;
      doc.moveTo(x0, bottom).lineTo(right, bottom).lineWidth(0.5).strokeColor("#e5e7eb").stroke();
      doc.y = bottom + 6;
    }

    stampFooters(doc, "Equipo perdido · Live Productions GT");
    doc.end();
    const buf = await done;
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="equipo-perdido-${new Date()
          .toISOString()
          .slice(0, 10)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error reporte de pérdidas:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

function drawPhotoPlaceholder(doc: any, x: number, y: number, size: number) {
  doc.save();
  doc.roundedRect(x, y, size, size, 4).fill("#f3f4f6");
  doc.font("Helvetica").fontSize(7).fillColor("#9ca3af").text("SIN FOTO", x, y + size / 2 - 4, {
    width: size,
    align: "center",
  });
  doc.restore();
}
