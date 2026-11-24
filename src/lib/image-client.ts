// Reduce el peso de las fotos antes de subirlas. Se usa en el navegador.
// Las fotos de inventario son para identificar el ítem, no para impresión:
// 1000 px y JPEG 78% es suficiente y evita guardar 3–5 MB por foto.
export async function compressImageFile(
  file: File,
  maxSize = 1000,
  quality = 0.78
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 500 * 1024 && file.type === "image/jpeg") {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
