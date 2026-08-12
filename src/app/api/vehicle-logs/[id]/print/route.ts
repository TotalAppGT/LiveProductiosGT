import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const log = await prisma.vehicleLog.findUnique({
      where: { id },
      include: { driver: { select: { name: true } }, fuelEntries: true },
    });

    if (!log) {
      return NextResponse.json({ error: "Bitácora no encontrada" }, { status: 404 });
    }

    const photosGrid = (photos: string[], labels: string[]) => {
      return `<div class="photos">${photos.map((p, i) => `
        <div class="photo-box">
          <div class="photo-label">${labels[i] || "Foto"}</div>
          ${p ? `<img src="${p}" />` : '<div class="no-photo">—</div>'}
        </div>`).join("")}</div>`;
    };

    const startLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der", "Tablero/KM", "Interior"];
    const endLabels = ["Frontal", "Trasera", "Lateral Izq", "Lateral Der"];

    const fuelSection = log.fuelEntries.length > 0 ? `
      <div class="section-title">⛽ Cargas de Combustible (${log.fuelEntries.length})</div>
      ${log.fuelEntries.map((f, i) => `
        <div class="fuel-entry">
          <span class="fuel-num">#${i + 1}</span>
          ${(f.photos || []).map((p) => `<img src="${p}" class="fuel-photo" />`).join("")}
        </div>`).join("")}` : "";

    const returnSection = log.status === "FINALIZADO" ? `
      <div class="section-title">📥 Información de Retorno</div>
      <table>
        <tr><td class="lbl">Fecha retorno</td><td>${new Date(log.endAt!).toLocaleString("es-GT")}</td></tr>
        <tr><td class="lbl">Kilometraje final</td><td><strong>${log.endKm} km</strong></td></tr>
        <tr><td class="lbl">Recorrido total</td><td><strong>${(log.endKm || 0) - log.startKm} km</strong></td></tr>
        <tr><td class="lbl">Nivel de agua</td><td>${log.endWater || "—"}</td></tr>
        <tr><td class="lbl">Nivel de aceite</td><td>${log.endOil || "—"}</td></tr>
        ${log.endComment ? `<tr><td class="lbl">Comentario</td><td>${log.endComment}</td></tr>` : ""}
      </table>
      <div class="section-title">📸 Fotos de Retorno</div>
      ${photosGrid(log.endPhotos, endLabels)}` : "";

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Uso de Vehículo ${log.plate}</title>
<style>
@page { size: letter; margin: 12mm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; color: #222; font-size: 12px; }
.header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #2563eb; padding-bottom: 10px; margin-bottom: 14px; }
.header img { width: 48px; height: 48px; object-fit: contain; }
.header .company { font-size: 18px; font-weight: 800; color: #2563eb; line-height: 1.1; }
.header .subtitle { font-size: 11px; color: #666; }
.title { font-size: 16px; font-weight: 800; margin: 6px 0 2px; }
.meta { font-size: 11px; color: #555; margin-bottom: 12px; }
.section-title { font-size: 13px; font-weight: 800; color: #2563eb; margin: 14px 0 6px; border-bottom: 1px solid #cbd5e1; padding-bottom: 3px; }
table { width: 100%; border-collapse: collapse; }
table td { padding: 4px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
table td.lbl { font-weight: 700; width: 160px; color: #444; }
.photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 6px; }
.photo-box { border: 1px solid #ddd; border-radius: 6px; overflow: hidden; text-align: center; background: #fafafa; }
.photo-label { font-size: 9px; font-weight: 700; color: #555; padding: 3px; background: #f0f4ff; }
.photo-box img { width: 100%; aspect-ratio: 1/1; object-fit: cover; display: block; }
.no-photo { aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center; color: #bbb; }
.fuel-entry { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee; flex-wrap: wrap; }
.fuel-num { font-weight: 800; color: #2563eb; min-width: 28px; }
.fuel-photo { width: 130px; height: 130px; object-fit: cover; border: 1px solid #ddd; border-radius: 6px; }
.footer { margin-top: 20px; font-size: 9px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
</style>
</head>
<body>
  <div class="header">
    <img src="/logo.png" alt="Logo" onerror="this.style.display='none'" />
    <div>
      <div class="company">LIVE PRODUCTIONS GT</div>
      <div class="subtitle">Informe de Uso de Vehículos</div>
    </div>
  </div>

  <div class="title">Vehículo ${log.plate} — ${log.vehicleType}</div>
  <div class="meta">Conductor: ${log.driver?.name} · Generado: ${new Date().toLocaleString("es-GT")}</div>

  <div class="section-title">📤 Información de Salida</div>
  <table>
    <tr><td class="lbl">Fecha salida</td><td>${new Date(log.startAt).toLocaleString("es-GT")}</td></tr>
    <tr><td class="lbl">Kilometraje inicial</td><td><strong>${log.startKm} km</strong></td></tr>
    <tr><td class="lbl">Nivel de agua</td><td>${log.startWater || "—"}</td></tr>
    <tr><td class="lbl">Nivel de aceite</td><td>${log.startOil || "—"}</td></tr>
    ${log.startComment ? `<tr><td class="lbl">Comentario</td><td>${log.startComment}</td></tr>` : ""}
  </table>

  <div class="section-title">📸 Fotos de Salida</div>
  ${photosGrid(log.startPhotos, startLabels)}

  ${fuelSection}
  ${returnSection}

  <div class="footer">
    Documento generado automáticamente por el sistema · Live Productions GT<br>
    Este informe sirve para control interno de uso de vehículos.
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("Error en print:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
