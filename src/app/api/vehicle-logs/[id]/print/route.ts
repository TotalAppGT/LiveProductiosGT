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

    const photoRow = (label: string, photos: string[]) => {
      const imgs = photos.map((p) => `<img src="${p}" style="width:140px;height:100px;object-fit:cover;border:1px solid #ddd;border-radius:4px;margin:2px" />`).join("");
      return `<tr><td style="padding:6px;font-weight:bold">${label}</td><td style="padding:6px">${imgs || "—"}</td></tr>`;
    };

    const fuelRows = log.fuelEntries.map((f, i) => `
      <tr>
        <td style="padding:6px">${i + 1}</td>
        <td style="padding:6px">${f.kmBefore || "—"}</td>
        <td style="padding:6px">${f.kmAfter || "—"}</td>
        <td style="padding:6px">${f.amount || "—"}</td>
        <td style="padding:6px">${(f.photos || []).map((p) => `<img src="${p}" style="width:80px;height:60px;object-fit:cover;margin:1px" />`).join("") || "—"}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Bitácora ${log.plate}</title>
<style>
body{font-family:Arial,sans-serif;margin:30px;color:#333}
h1{font-size:20px;margin-bottom:2px}
.sub{color:#666;font-size:12px;margin-bottom:20px}
table{width:100%;border-collapse:collapse;margin-top:10px}
th{background:#f0f0f0;text-align:left;padding:8px;border:1px solid #ccc}
td{border:1px solid #ddd;vertical-align:top}
.section{font-size:16px;font-weight:bold;color:#2563eb;margin:20px 0 8px;border-bottom:2px solid #2563eb;padding-bottom:4px}
.logo{font-size:18px;font-weight:bold;color:#2563eb}
</style>
</head>
<body>
<div class="logo">Live Productions GT</div>
<h1>Bitácora de Vehículo — ${log.plate}</h1>
<div class="sub">${log.vehicleType} · Generada el ${new Date().toLocaleString("es-GT")}</div>

<div class="section">Información de Salida</div>
<table>
<tr><th style="width:180px">Campo</th><th>Detalle</th></tr>
<tr><td>Conductor</td><td>${log.driver?.name}</td></tr>
<tr><td>Fecha salida</td><td>${new Date(log.startAt).toLocaleString("es-GT")}</td></tr>
<tr><td>Kilometraje inicial</td><td>${log.startKm} km</td></tr>
<tr><td>Nivel de agua</td><td>${log.startWater || "—"}</td></tr>
<tr><td>Nivel de aceite</td><td>${log.startOil || "—"}</td></tr>
${log.startComment ? `<tr><td>Comentario</td><td>${log.startComment}</td></tr>` : ""}
</table>

<div class="section">Fotos de Salida</div>
<table>
${photoRow("Frontal", log.startPhotos.filter((_, i) => i === 0))}
${photoRow("Trasera", log.startPhotos.filter((_, i) => i === 1))}
${photoRow("Lateral izq", log.startPhotos.filter((_, i) => i === 2))}
${photoRow("Lateral der", log.startPhotos.filter((_, i) => i === 3))}
${photoRow("Tablero/KM", log.startPhotos.filter((_, i) => i === 4))}
${photoRow("Interior", log.startPhotos.filter((_, i) => i === 5))}
</table>

${log.fuelEntries.length > 0 ? `
<div class="section">Cargas de Combustible (${log.fuelEntries.length})</div>
<table>
<tr><th>#</th><th>KM antes</th><th>KM después</th><th>Monto</th><th>Fotos</th></tr>
${fuelRows}
</table>` : ""}

${log.status === "FINALIZADO" ? `
<div class="section">Información de Retorno</div>
<table>
<tr><th style="width:180px">Campo</th><th>Detalle</th></tr>
<tr><td>Fecha retorno</td><td>${new Date(log.endAt!).toLocaleString("es-GT")}</td></tr>
<tr><td>Kilometraje final</td><td>${log.endKm} km</td></tr>
<tr><td>Nivel de agua</td><td>${log.endWater || "—"}</td></tr>
<tr><td>Nivel de aceite</td><td>${log.endOil || "—"}</td></tr>
<tr><td>Recorrido total</td><td>${(log.endKm || 0) - log.startKm} km</td></tr>
${log.endComment ? `<tr><td>Comentario</td><td>${log.endComment}</td></tr>` : ""}
</table>
<div class="section">Fotos de Retorno</div>
<table>
${photoRow("Frontal", log.endPhotos.filter((_, i) => i === 0))}
${photoRow("Trasera", log.endPhotos.filter((_, i) => i === 1))}
${photoRow("Lateral izq", log.endPhotos.filter((_, i) => i === 2))}
${photoRow("Lateral der", log.endPhotos.filter((_, i) => i === 3))}
</table>` : '<p style="margin-top:20px;color:#999">Bitácora en uso (aún no finalizada).</p>'}

<div style="margin-top:40px;font-size:11px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:12px">
Documento generado automáticamente · Live Productions GT · Informe de uso de vehículos
</div>
<script>window.print();</script>
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
