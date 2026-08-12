import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, createdBy: { select: { name: true } } },
    });

    if (!order) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const itemsHtml = order.items
      .map((it, i) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #ddd">${i + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd">${it.name}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">${it.category}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd;text-align:center">${it.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #ddd"></td>
        </tr>`)
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Pedido #${order.orderNumber}</title>
<style>
body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
h1 { font-size: 22px; margin-bottom: 4px; }
.subtitle { color: #666; font-size: 13px; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
th { background: #f0f0f0; text-align: left; padding: 8px; border-bottom: 2px solid #ccc; }
.header-info { display: flex; justify-content: space-between; margin-bottom: 8px; }
.logo { font-size: 18px; font-weight: bold; color: #2563eb; }
.footer { margin-top: 40px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 16px; }
</style>
</head>
<body>
  <div class="logo">Live Productions GT</div>
  <h1>Pedido a Bodega #${order.orderNumber}</h1>
  <div class="subtitle">Cuadro de pedido para evento</div>
  <div class="header-info">
    <div><strong>Evento:</strong> ${order.eventName}</div>
    <div><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleDateString("es-GT")}</div>
  </div>
  <div class="header-info">
    <div><strong>Creado por:</strong> ${order.createdBy?.name || "-"}</div>
    <div><strong>Estado:</strong> ${order.status}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:40px">#</th>
        <th>Item</th>
        <th style="width:140px">Categoría</th>
        <th style="width:80px">Cant.</th>
        <th style="width:120px">Check</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>
  <div class="footer">
    Documento generado automáticamente por el sistema · Live Productions GT<br>
    Este pedido sirve para impresión física y control de bodega.
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
